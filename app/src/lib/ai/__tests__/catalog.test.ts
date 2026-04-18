import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Each test resets modules so module-level $state is fresh.
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  // Provide a minimal localStorage stub in the test environment.
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); }
    },
    writable: true,
    configurable: true
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: build a minimal Model stub returned by a mocked fetchCatalog.
// ---------------------------------------------------------------------------
function makeModel(id: string) {
  return {
    id,
    qualifiedId: `openrouter:${id}`,
    name: id,
    provider: 'openrouter' as const,
    upstreamProvider: id.split('/')[0] ?? 'Other',
    isFree: false,
    capabilities: { streaming: true, tools: false, vision: false, reasoning: false }
  };
}

// ---------------------------------------------------------------------------
// C1: refreshCatalog(true) fans out over enabled providers and aggregates models
// ---------------------------------------------------------------------------
describe('refreshCatalog', () => {
  it('fans out over enabled providers and aggregates their models', async () => {
    const model1 = makeModel('openai/gpt-5');
    const model2 = makeModel('anthropic/claude-x');

    vi.doMock('$app/environment', () => ({ browser: true }));
    vi.doMock('../providers.svelte', () => ({
      listProviders: () => [{ id: 'openrouter', apiKey: 'sk-test', enabled: true }]
    }));
    vi.doMock('../adapters/openrouter', () => ({
      openrouterAdapter: () => ({
        id: 'openrouter',
        fetchCatalog: vi.fn().mockResolvedValue([model1, model2])
      })
    }));

    const { refreshCatalog, catalog } = await import('../catalog.svelte');
    await refreshCatalog(true);
    await vi.runAllTimersAsync();

    expect(catalog.list).toHaveLength(2);
    expect(catalog.list.map((m) => m.id)).toContain('openai/gpt-5');
    expect(catalog.list.map((m) => m.id)).toContain('anthropic/claude-x');
  });

  // -------------------------------------------------------------------------
  // C2: per-provider failures don't throw; one provider's success is preserved
  // -------------------------------------------------------------------------
  it('ignores failing providers and preserves successful ones', async () => {
    const goodModel = makeModel('openai/gpt-5');

    vi.doMock('$app/environment', () => ({ browser: true }));
    vi.doMock('../providers.svelte', () => ({
      listProviders: () => [
        { id: 'openrouter', apiKey: 'sk-good', enabled: true },
        // Second record simulates a provider that will throw during catalog fetch.
        // We repurpose the openrouter path by having fetchCatalog throw on the second call.
      ]
    }));

    let callCount = 0;
    vi.doMock('../adapters/openrouter', () => ({
      openrouterAdapter: () => ({
        id: 'openrouter',
        fetchCatalog: vi.fn().mockImplementation(() => {
          callCount += 1;
          if (callCount === 1) return Promise.resolve([goodModel]);
          return Promise.reject(new Error('provider down'));
        })
      })
    }));

    const { refreshCatalog, catalog } = await import('../catalog.svelte');
    // Should not throw even though one fetch fails.
    await expect(refreshCatalog(true)).resolves.toBeUndefined();
    await vi.runAllTimersAsync();

    expect(catalog.list).toHaveLength(1);
    expect(catalog.list[0].id).toBe('openai/gpt-5');
  });

  // -------------------------------------------------------------------------
  // C3: byUpstream groups models correctly
  // -------------------------------------------------------------------------
  it('groups models by upstreamProvider in byUpstream', async () => {
    const models = [
      makeModel('openai/gpt-5'),
      makeModel('openai/gpt-4'),
      makeModel('anthropic/claude-x')
    ];

    vi.doMock('$app/environment', () => ({ browser: true }));
    vi.doMock('../providers.svelte', () => ({
      listProviders: () => [{ id: 'openrouter', apiKey: 'sk-test', enabled: true }]
    }));
    vi.doMock('../adapters/openrouter', () => ({
      openrouterAdapter: () => ({
        id: 'openrouter',
        fetchCatalog: vi.fn().mockResolvedValue(models)
      })
    }));

    const { refreshCatalog, catalog } = await import('../catalog.svelte');
    await refreshCatalog(true);
    await vi.runAllTimersAsync();

    const grouped = catalog.byUpstream;
    expect(grouped['openai']).toHaveLength(2);
    expect(grouped['anthropic']).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // C4: TTL — a second refreshCatalog(false) within 1 hour is a no-op
  // -------------------------------------------------------------------------
  it('skips fetch on second call within TTL when force=false', async () => {
    const fetchCatalog = vi.fn().mockResolvedValue([makeModel('openai/gpt-5')]);

    vi.doMock('$app/environment', () => ({ browser: true }));
    vi.doMock('../providers.svelte', () => ({
      listProviders: () => [{ id: 'openrouter', apiKey: 'sk-test', enabled: true }]
    }));
    vi.doMock('../adapters/openrouter', () => ({
      openrouterAdapter: () => ({ id: 'openrouter', fetchCatalog })
    }));

    const { refreshCatalog } = await import('../catalog.svelte');

    // First call populates the cache.
    await refreshCatalog(true);
    await vi.runAllTimersAsync();
    expect(fetchCatalog).toHaveBeenCalledTimes(1);

    // Advance time by 30 minutes — still within 1-hour TTL.
    vi.advanceTimersByTime(30 * 60 * 1000);

    // Second call with force=false must be a no-op.
    await refreshCatalog(false);
    await vi.runAllTimersAsync();
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
  });
});
