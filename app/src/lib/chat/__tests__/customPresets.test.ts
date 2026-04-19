import { describe, it, expect, beforeEach, vi } from 'vitest';

// localStorage shim for node/jsdom environments that don't expose one.
// vitest's default `happy-dom` / `jsdom` both ship localStorage, but the
// repo-level config uses `node`; fall back to a Map-backed polyfill so
// createPersistedState's browser path can still run through its flush.
beforeEach(async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; }
    } as Storage;
  } else {
    globalThis.localStorage.clear();
  }
  vi.resetModules();
});

describe('customPresets store', () => {
  it('save() creates a preset with a ulid id and default description', async () => {
    const { customPresets } = await import('../customPresets.svelte');
    const row = customPresets.save({
      name: 'My Chain',
      layers: ['academic_framing', 'roleplay'],
      layerParams: [{}, { persona: 'researcher' }]
    });
    expect(row.id.length).toBeGreaterThan(0);
    expect(row.name).toBe('My Chain');
    expect(row.description).toBe('2-layer chain');
    expect(row.layers).toEqual(['academic_framing', 'roleplay']);
    expect(row.layerParams).toEqual([{}, { persona: 'researcher' }]);
  });

  it('items lists saved presets in newest-first order', async () => {
    const { customPresets } = await import('../customPresets.svelte');
    customPresets.save({ name: 'A', layers: ['roleplay', 'rephrase'], layerParams: [{}, {}] });
    customPresets.save({ name: 'B', layers: ['roleplay', 'rephrase'], layerParams: [{}, {}] });
    const names = customPresets.items.map((p) => p.name);
    expect(names).toEqual(['B', 'A']);
  });

  it('remove() deletes by id; find() returns undefined afterwards', async () => {
    const { customPresets } = await import('../customPresets.svelte');
    const row = customPresets.save({
      name: 'Tmp', layers: ['roleplay', 'rephrase'], layerParams: [{}, {}]
    });
    expect(customPresets.find(row.id)).toBeDefined();
    customPresets.remove(row.id);
    expect(customPresets.find(row.id)).toBeUndefined();
    expect(customPresets.items.find((p) => p.id === row.id)).toBeUndefined();
  });

  it('falls back to an auto-name when the caller passes whitespace', async () => {
    const { customPresets } = await import('../customPresets.svelte');
    const row = customPresets.save({
      name: '   ', layers: ['roleplay', 'rephrase'], layerParams: [{}, {}]
    });
    expect(row.name.startsWith('Custom ')).toBe(true);
  });

  it('strips empty layer ids before persisting', async () => {
    const { customPresets } = await import('../customPresets.svelte');
    const row = customPresets.save({
      name: 'X', layers: ['roleplay', '', 'rephrase'], layerParams: [{}, {}, {}]
    });
    expect(row.layers).toEqual(['roleplay', 'rephrase']);
    expect(row.description).toBe('2-layer chain');
  });
});
