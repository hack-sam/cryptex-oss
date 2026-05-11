/**
 * Worker pool — Wave 0.2 v2.0 scaffolding.
 *
 * Spawns up to POOL_SIZE Web Workers and hands them out via `acquire()`.
 * Callers MUST `release(worker)` when done so the worker rejoins the pool.
 *
 * `terminate(worker)` evicts a misbehaving worker; the pool replaces it
 * on the next acquire (no eager respawn — keeps idle workers minimal).
 *
 * In SSR / vitest jsdom env, `browser` is false and `acquire()` rejects.
 * Callers that may run server-side should branch on `browser` first or
 * use `runInWorker.ts` which already handles the fallback.
 */

import { browser } from '$app/environment';

const POOL_SIZE = 4;

class WorkerPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private waiters: Array<(w: Worker) => void> = [];
  private initialized = false;

  private ensureInit(): void {
    if (this.initialized || !browser) return;
    this.initialized = true;
    for (let i = 0; i < POOL_SIZE; i++) {
      const w = this.createWorker();
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  private createWorker(): Worker {
    return new Worker(new URL('./transformer.worker.ts', import.meta.url), {
      type: 'module'
    });
  }

  /** Acquire an idle worker, or wait for one. Resolves immediately if idle exists. */
  async acquire(): Promise<Worker> {
    if (!browser) {
      throw new Error('Worker pool only available in browser');
    }
    this.ensureInit();
    const w = this.idle.pop();
    if (w) return w;
    return new Promise<Worker>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /** Return a worker to the pool. Replaces it transparently if it was terminated. */
  release(worker: Worker): void {
    let actual = worker;
    if (!this.workers.includes(worker)) {
      // Worker was terminated and removed; replace it so the pool stays at size.
      const replacement = this.createWorker();
      this.workers.push(replacement);
      actual = replacement;
    }
    const waiter = this.waiters.shift();
    if (waiter) waiter(actual);
    else this.idle.push(actual);
  }

  /** Terminate a misbehaving worker. Pool replaces it on next acquire/release. */
  terminate(worker: Worker): void {
    const idx = this.workers.indexOf(worker);
    if (idx >= 0) this.workers.splice(idx, 1);
    const idleIdx = this.idle.indexOf(worker);
    if (idleIdx >= 0) this.idle.splice(idleIdx, 1);
    worker.terminate();
  }

  /** Total worker count (for testing/diagnostics). */
  size(): number {
    return this.workers.length;
  }

  /** Idle worker count (for testing/diagnostics). */
  idleCount(): number {
    return this.idle.length;
  }
}

export const workerPool = new WorkerPool();
export { POOL_SIZE };
