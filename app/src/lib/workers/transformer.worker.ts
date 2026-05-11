/// <reference lib="webworker" />
/**
 * Transformer Web Worker — Wave 0.2 v2.0 scaffolding.
 *
 * The worker mirrors the main-thread registry: it eagerly imports every
 * `src/transformers/<category>/*.js` via Vite's `import.meta.glob` and
 * keys them by transformer name (matches the legacy BaseTransformer
 * contract — see app/src/lib/transformers/registry.ts).
 *
 * Each incoming request runs `func` (encode) or `reverse` (decode) on the
 * referenced transformer and posts back a single response keyed by the
 * caller's request id. Errors are caught and surfaced via `kind: 'error'`.
 *
 * Globals shim: a handful of legacy transformers reference `window.*`.
 * The shim from `lib/transformers/_globals.ts` is installed BEFORE the
 * glob runs so those modules resolve identically to the main thread.
 */

import { installTransformerGlobals, publishTransformerRegistry } from '$lib/transformers/_globals';

// Mirror the legacy BaseTransformer contract — we only need the subset
// the worker actually invokes. Keep this aligned with `Transformer` in
// `lib/transformers/registry.ts`.
type WorkerTransformer = {
  name: string;
  func: (text: string, options?: Record<string, unknown>) => string;
  reverse?: ((text: string, options?: Record<string, unknown>) => string) | null;
  category?: string;
};

// Install globals before the glob fires (same contract as registry.ts).
installTransformerGlobals();

// Vite statically analyzes this path; path is relative to THIS file:
//   app/src/lib/workers/ → ../../../../src/transformers/
const modules = import.meta.glob<{ default: WorkerTransformer }>(
  '../../../../src/transformers/*/*.js',
  { eager: true }
);

const REGISTRY = new Map<string, WorkerTransformer>();
const flatRegistry: Record<string, WorkerTransformer> = {};
for (const [path, mod] of Object.entries(modules)) {
  const t = mod?.default;
  if (!t || typeof t.func !== 'function') continue;
  if (!t.category) {
    const parts = path.split('/');
    t.category = parts[parts.length - 2];
  }
  REGISTRY.set(t.name, t);
  flatRegistry[t.name] = t;
}

// Publish to globalThis.transforms so special/randomizer.js can see peers
// (matches what publishTransformerRegistry does on the main thread).
publishTransformerRegistry(flatRegistry);

export type WorkerRequest = {
  /** Caller-supplied id, echoed back so multiplexed requests can be routed. */
  id: number;
  /** Transformer display name — matches `Transformer.name` in registry.ts. */
  transformerName: string;
  mode: 'encode' | 'decode';
  input: string;
  options?: Record<string, unknown>;
};

export type WorkerResponse =
  | { id: number; kind: 'done'; output: string; durationMs: number }
  | { id: number; kind: 'error'; message: string; category?: string };

self.addEventListener('message', (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  const started = performance.now();
  const post = (resp: WorkerResponse) => (self as unknown as Worker).postMessage(resp);

  try {
    const t = REGISTRY.get(req.transformerName);
    if (!t) {
      post({
        id: req.id,
        kind: 'error',
        message: `Unknown transformer: ${req.transformerName}`,
        category: 'tool'
      });
      return;
    }

    const fn = req.mode === 'encode' ? t.func : t.reverse;
    if (typeof fn !== 'function') {
      post({
        id: req.id,
        kind: 'error',
        message: `Transformer ${req.transformerName} does not support ${req.mode}`,
        category: 'tool'
      });
      return;
    }

    const output = fn.call(t, req.input, req.options ?? {});
    post({
      id: req.id,
      kind: 'done',
      output: typeof output === 'string' ? output : String(output),
      durationMs: performance.now() - started
    });
  } catch (err) {
    post({
      id: req.id,
      kind: 'error',
      message: (err as Error)?.message ?? String(err),
      category: 'tool'
    });
  }
});

// Exporting nothing of value at runtime; type-only exports above are used
// by the main thread for postMessage shape.
export {};
