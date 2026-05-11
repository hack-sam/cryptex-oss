/**
 * Tests for runInWorker — Wave 0.2.
 *
 * Vitest runs in jsdom. Because jsdom sets `typeof window !== 'undefined'`,
 * SvelteKit's `$app/environment.browser` resolves to `true`, but the jsdom
 * environment does NOT supply a `Worker` constructor. `runInWorker` checks
 * both flags (`browser && typeof Worker !== 'undefined'`) before dispatching
 * to the pool — in jsdom we always end up on the in-thread fast path. The
 * worker round-trip is covered by real browsers (and by the existence of a
 * worker chunk in the production build).
 *
 * The transformer registry is mocked to avoid pulling 162 modules into
 * every test fixture; we stub two named transformers that mirror the
 * `func`/`reverse` shape from BaseTransformer.
 */

import { describe, it, expect } from 'vitest';
import { runInWorker, MAX_INPUT_BYTES, WORKER_THRESHOLD_BYTES } from '../runInWorker';

import { vi } from 'vitest';

vi.mock('$lib/transformers/registry', () => ({
  getTransformer: (name: string) => {
    if (name === 'Fake Upper') {
      return {
        name: 'Fake Upper',
        priority: 50,
        canDecode: true,
        category: 'test',
        func: (s: string) => s.toUpperCase(),
        reverse: (s: string) => s.toLowerCase()
      };
    }
    if (name === 'Fake Throws') {
      return {
        name: 'Fake Throws',
        priority: 50,
        canDecode: false,
        category: 'test',
        func: () => {
          throw new Error('boom');
        },
        reverse: null
      };
    }
    return undefined;
  }
}));

describe('runInWorker', () => {
  it('runs small inputs in-thread (encode)', async () => {
    const result = await runInWorker('Fake Upper', 'encode', 'hello', {});
    expect(result).toBe('HELLO');
  });

  it('runs small inputs in-thread (decode)', async () => {
    const result = await runInWorker('Fake Upper', 'decode', 'HELLO', {});
    expect(result).toBe('hello');
  });

  it('rejects when transformer not found', async () => {
    await expect(runInWorker('does-not-exist', 'encode', 'hi', {})).rejects.toThrow(
      /Unknown transformer/
    );
  });

  it('rejects when transformer does not support mode', async () => {
    // Fake Throws has reverse=null so decode is unsupported.
    await expect(runInWorker('Fake Throws', 'decode', 'hi', {})).rejects.toThrow(
      /does not support/
    );
  });

  it('rejects inputs >1MB with bad_input', async () => {
    // Use a string whose UTF-8 byte length is guaranteed >1MB regardless
    // of which byte-counting backend is in play (Blob/TextEncoder/.length).
    const big = 'a'.repeat(MAX_INPUT_BYTES + 1);
    await expect(runInWorker('Fake Upper', 'encode', big, {})).rejects.toThrow(
      /limit is 1 MB/
    );
  });

  it('respects pre-aborted signal', async () => {
    const c = new AbortController();
    c.abort();
    await expect(
      runInWorker('Fake Upper', 'encode', 'hi', {}, { signal: c.signal })
    ).rejects.toThrow(/Aborted/);
  });

  it('propagates transformer errors as a tool/worker-shaped rejection', async () => {
    await expect(runInWorker('Fake Throws', 'encode', 'hi', {})).rejects.toThrow();
  });

  it('uses in-thread path when threshold is lower than input but Worker undefined in tests', async () => {
    // In vitest jsdom env, `Worker` is undefined → worker path is bypassed
    // and we always get in-thread execution, even when the threshold says
    // "use a worker". This is the documented test-environment behaviour.
    const medium = 'x'.repeat(100_000);
    const result = await runInWorker(
      'Fake Upper',
      'encode',
      medium,
      {},
      { threshold: 1000 }
    );
    expect(result.startsWith('XXX')).toBe(true);
    expect(result.length).toBe(100_000);
  });

  it('rejects an aborted signal even when input is sub-threshold', async () => {
    const c = new AbortController();
    c.abort();
    await expect(
      runInWorker('Fake Upper', 'encode', 'a', {}, { signal: c.signal })
    ).rejects.toThrow(/Aborted/);
  });
});

describe('threshold constants', () => {
  it('exports correct WORKER_THRESHOLD_BYTES', () => {
    expect(WORKER_THRESHOLD_BYTES).toBe(50_000);
  });
  it('exports correct MAX_INPUT_BYTES', () => {
    expect(MAX_INPUT_BYTES).toBe(1_048_576);
  });
});
