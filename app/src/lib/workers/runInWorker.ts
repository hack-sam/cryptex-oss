/**
 * runInWorker — Wave 0.2 v2.0 size-gated transformer dispatch.
 *
 * Threshold logic:
 *   - byteLen < WORKER_THRESHOLD_BYTES (50 KB) → run in-thread via the
 *     existing transformer registry. Sync work, single tick, no postMessage
 *     round trip.
 *   - WORKER_THRESHOLD_BYTES <= byteLen <= MAX_INPUT_BYTES (1 MB) → dispatch
 *     to the worker pool (4 workers). UI stays responsive for the duration.
 *   - byteLen > MAX_INPUT_BYTES → reject with `bad_input` CryptexError.
 *
 * Cancellation: AbortSignal → `worker.terminate()` plus AbortError thrown
 * to the caller. The pool transparently replaces the killed worker on the
 * next acquire. In-thread work cannot be interrupted (synchronous JS).
 *
 * In SSR / vitest jsdom env `browser` is false → we always take the
 * in-thread path. Tests exercise the threshold, the in-thread path, and
 * abort handling; the worker path is exercised by real browsers.
 */

import { browser } from '$app/environment';
import { Errors } from '$lib/errors/types';
import type { CryptexError } from '$lib/errors/types';
import { workerPool } from './pool';
import type { WorkerRequest, WorkerResponse } from './transformer.worker';

export const WORKER_THRESHOLD_BYTES = 50_000;
export const MAX_INPUT_BYTES = 1_048_576; // 1 MB

export interface RunInWorkerOptions {
  /** Optional cancellation handle. Aborting terminates the worker. */
  signal?: AbortSignal;
  /** Override the worker dispatch threshold (bytes). Useful for tests. */
  threshold?: number;
}

let requestSeq = 0;

/**
 * Wrap a CryptexError as a real Error subclass so `.toThrow(/regex/)`
 * works AND `isCryptexError(err)` still returns true via the duck-typed
 * properties. `errorLogger.report(err)` sees both shapes and forwards
 * correctly.
 */
function toThrowable(ce: CryptexError): Error & CryptexError {
  const e = new Error(ce.userMessage) as Error & CryptexError;
  // Copy CryptexError surface onto the Error instance. The fields on `ce`
  // are read-only (frozen), so we redefine them on `e` directly.
  Object.assign(e, {
    category: ce.category,
    userMessage: ce.userMessage,
    devMessage: ce.devMessage,
    retryable: ce.retryable,
    cause: ce.cause,
    context: ce.context,
    retryAfterMs: ce.retryAfterMs
  });
  e.name = 'CryptexError';
  return e;
}

/**
 * Execute a transformer with size-based dispatch.
 *
 * @param transformerName Display name (matches `Transformer.name` in registry.ts).
 * @param mode `'encode'` calls `func`; `'decode'` calls `reverse`.
 * @param input The text to transform.
 * @param options Transformer-specific options (forwarded to func/reverse).
 * @param runOpts Cancellation + threshold overrides.
 *
 * @throws CryptexError (`bad_input`) when input exceeds 1 MB.
 * @throws CryptexError (`tool`) when the transformer is missing or doesn't support mode.
 * @throws CryptexError (`worker`) when the worker crashes or postMessage errors.
 * @throws DOMException(AbortError) when the signal is aborted.
 */
export async function runInWorker(
  transformerName: string,
  mode: 'encode' | 'decode',
  input: string,
  options: Record<string, unknown> = {},
  runOpts: RunInWorkerOptions = {}
): Promise<string> {
  const byteLen = byteLength(input);

  if (byteLen > MAX_INPUT_BYTES) {
    throw toThrowable(
      Errors.badInput(
        `Input is ${(byteLen / 1024 / 1024).toFixed(2)} MB — limit is 1 MB.`,
        { transformerName, mode, byteLen }
      )
    );
  }

  if (runOpts.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const threshold = runOpts.threshold ?? WORKER_THRESHOLD_BYTES;

  // Below threshold, no browser, or no Worker constructor (SSR / vitest
  // jsdom env) → run in-thread. Worker presence is checked separately from
  // `browser` because jsdom sets `typeof window !== 'undefined'` (so
  // `browser === true`) but does not provide a Worker constructor.
  const canUseWorker = browser && typeof Worker !== 'undefined';
  if (byteLen < threshold || !canUseWorker) {
    return runInThread(transformerName, mode, input, options);
  }

  return runViaWorker(transformerName, mode, input, options, runOpts.signal);
}

/**
 * Best-effort UTF-8 byte length. Prefers `Blob` (browser-accurate),
 * falls back to `TextEncoder` (Node/jsdom), then character count.
 */
function byteLength(input: string): number {
  if (typeof Blob !== 'undefined') {
    try {
      return new Blob([input]).size;
    } catch {
      // fall through
    }
  }
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(input).length;
  }
  return input.length;
}

async function runInThread(
  transformerName: string,
  mode: 'encode' | 'decode',
  input: string,
  options: Record<string, unknown>
): Promise<string> {
  // Lazy import: keeps the registry out of consumers that only need
  // the type surface (e.g., SSR pages that never call runInWorker).
  const { getTransformer } = await import('$lib/transformers/registry');
  const t = getTransformer(transformerName);
  if (!t) {
    throw toThrowable(
      Errors.tool(`Unknown transformer: ${transformerName}`, undefined, {
        transformerName
      })
    );
  }
  const fn = mode === 'encode' ? t.func : t.reverse;
  if (typeof fn !== 'function') {
    throw toThrowable(
      Errors.tool(`Transformer ${transformerName} does not support ${mode}`, undefined, {
        transformerName,
        mode
      })
    );
  }
  const out = fn.call(t, input, options);
  return typeof out === 'string' ? out : String(out);
}

async function runViaWorker(
  transformerName: string,
  mode: 'encode' | 'decode',
  input: string,
  options: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> {
  const worker = await workerPool.acquire();
  const id = ++requestSeq;

  return new Promise<string>((resolve, reject) => {
    function onMessage(ev: MessageEvent<WorkerResponse>) {
      if (!ev.data || ev.data.id !== id) return; // not ours; ignore.
      cleanup();
      if (ev.data.kind === 'done') {
        workerPool.release(worker);
        resolve(ev.data.output);
      } else {
        workerPool.release(worker);
        reject(
          toThrowable(
            Errors.worker(ev.data.message, undefined, {
              transformerName,
              mode
            })
          )
        );
      }
    }

    function onError(ev: ErrorEvent) {
      cleanup();
      workerPool.terminate(worker);
      reject(
        toThrowable(
          Errors.worker(ev.message || 'Worker crashed', ev, {
            transformerName,
            mode
          })
        )
      );
    }

    function onAbort() {
      cleanup();
      workerPool.terminate(worker);
      reject(new DOMException('Aborted', 'AbortError'));
    }

    function cleanup() {
      worker.removeEventListener('message', onMessage as EventListener);
      worker.removeEventListener('error', onError as EventListener);
      if (signal) signal.removeEventListener('abort', onAbort);
    }

    worker.addEventListener('message', onMessage as EventListener);
    worker.addEventListener('error', onError as EventListener);
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort);
    }

    const req: WorkerRequest = { id, transformerName, mode, input, options };
    worker.postMessage(req);
  });
}
