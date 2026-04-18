import { describe, it, expect, beforeEach, vi } from 'vitest';

function installLS() {
  const store = new Map<string, string>();
  const ls = {
    getItem: vi.fn((k: string) => store.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => { store.set(k, v); }),
    removeItem: vi.fn((k: string) => { store.delete(k); }),
    clear: vi.fn(() => { store.clear(); }),
    get length() { return store.size; },
    key: vi.fn((i: number) => [...store.keys()][i] ?? null)
  };
  Object.defineProperty(globalThis, 'localStorage', { value: ls, writable: true, configurable: true });
  return store;
}

beforeEach(() => { installLS(); vi.resetModules(); });

describe('providers registry', () => {
  it('seeds OpenRouter record from legacy cryptex.openrouterApiKey on first load', async () => {
    localStorage.setItem('cryptex.openrouterApiKey', 'sk-or-legacy');
    const mod = await import('../providers.svelte');
    const list = mod.listProviders();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('openrouter');
    expect(list[0].apiKey).toBe('sk-or-legacy');
    expect(list[0].enabled).toBe(true);
  });

  it('starts with an empty OpenRouter record if no legacy key exists', async () => {
    const mod = await import('../providers.svelte');
    const list = mod.listProviders();
    expect(list[0].id).toBe('openrouter');
    expect(list[0].apiKey).toBe('');
  });

  it('adds and removes provider records', async () => {
    const mod = await import('../providers.svelte');
    mod.addProvider({ id: 'anthropic', apiKey: 'sk-ant-x', enabled: true });
    expect(mod.listProviders()).toHaveLength(2);
    mod.removeProvider('anthropic');
    expect(mod.listProviders()).toHaveLength(1);
  });
});
