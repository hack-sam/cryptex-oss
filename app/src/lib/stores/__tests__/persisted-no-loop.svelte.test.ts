/**
 * Regression guard for the v2.7.x "production is non-interactive" incident.
 *
 * Root cause: an $effect that mirrored a value into a createPersistedState
 * store via a spread setter (`s.value = { ...s.value, goal }`) ended up
 * depending on the very value it wrote, producing an infinite Svelte effect
 * loop (`effect_update_depth_exceeded`) that threw on mount of the home route
 * and wedged the client scheduler — every interactive control went dead.
 *
 * Two fixes are pinned here:
 *   1. createPersistedState dedups structurally-equal writes (class-wide guard).
 *   2. The CampaignTool mirror is additionally guarded with untrack().
 *
 * These tests use $effect.root + flushSync so the effects run synchronously in
 * jsdom; an unbroken loop would throw on flushSync (Svelte aborts the runaway),
 * so `not.toThrow()` is a real assertion, not a no-op.
 */
import { describe, it, expect } from 'vitest';
import { flushSync, untrack } from 'svelte';
import { createPersistedState } from '../_persisted.svelte';

describe('createPersistedState — dedup', () => {
  it('skips structurally-equal writes so dependents do not re-run', () => {
    const s = createPersistedState('test.persisted.dedup', { goal: '', n: 0 });
    let runs = 0;
    const stop = $effect.root(() => {
      $effect(() => {
        void s.value; // take s.value as a dependency
        runs++;
      });
    });
    flushSync();
    const baseline = runs;

    s.value = { goal: '', n: 0 }; // structurally equal → deduped → no change
    flushSync();
    expect(runs).toBe(baseline);

    s.value = { goal: 'x', n: 0 }; // genuinely changed → one re-run
    flushSync();
    expect(runs).toBe(baseline + 1);

    stop();
  });
});

describe('persisted-store mirror effects do not loop', () => {
  it('an UNguarded self-spread mirror settles (dedup breaks the loop)', () => {
    const s = createPersistedState('test.persisted.loop.unguarded', { goal: '' });
    let g = $state('hello');
    const stop = $effect.root(() => {
      $effect(() => {
        // The exact dangerous pattern: read (spread) + write the same store.
        // Without the dedup in createPersistedState this throws
        // effect_update_depth_exceeded on the first flush.
        s.value = { ...s.value, goal: g };
      });
    });
    expect(() => flushSync()).not.toThrow();
    expect(s.value.goal).toBe('hello');

    g = 'world';
    expect(() => flushSync()).not.toThrow();
    expect(s.value.goal).toBe('world');

    stop();
  });

  it('the guarded untrack mirror (CampaignTool shape) settles and stays in sync', () => {
    const s = createPersistedState('test.persisted.loop.guarded', { goal: '' });
    let g = $state('a');
    const stop = $effect.root(() => {
      $effect(() => {
        const cur = g; // only `g` is a tracked dependency
        untrack(() => {
          if (s.value.goal !== cur) s.value = { ...s.value, goal: cur };
        });
      });
    });
    expect(() => flushSync()).not.toThrow();
    expect(s.value.goal).toBe('a');

    g = 'b';
    expect(() => flushSync()).not.toThrow();
    expect(s.value.goal).toBe('b');

    stop();
  });
});
