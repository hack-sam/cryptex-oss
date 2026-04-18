/**
 * Coverage for the OpenRouter client — key storage round-trip, model
 * normalization, error classification.
 *
 * Integration tests against the live API are not included here; the live
 * endpoints are exercised via the in-browser AI tools directly.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FALLBACK_MODELS,
  OpenRouterError,
  getApiKey,
  setApiKey,
  hasApiKey,
  validateKey
} from './openrouter';

function mockLocalStorage() {
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
  return { store };
}

beforeEach(() => {
  mockLocalStorage();
  // Clean any persisted state between tests
  localStorage.clear();
});

describe('API key state', () => {
  it('empty by default', () => {
    expect(getApiKey()).toBe('');
    expect(hasApiKey()).toBe(false);
  });

  it('round-trips a key', () => {
    setApiKey('sk-or-v1-abc123');
    expect(getApiKey()).toBe('sk-or-v1-abc123');
    expect(hasApiKey()).toBe(true);
  });

  it('trims whitespace on save', () => {
    setApiKey('   sk-or-v1-abc   ');
    expect(getApiKey()).toBe('sk-or-v1-abc');
  });

  it('clears when set to empty string', () => {
    setApiKey('sk-or-v1-xxx');
    expect(hasApiKey()).toBe(true);
    setApiKey('');
    expect(hasApiKey()).toBe(false);
    expect(getApiKey()).toBe('');
  });
});

describe('FALLBACK_MODELS', () => {
  it('contains openrouter/auto as a safe default', () => {
    expect(FALLBACK_MODELS.some((m) => m.id === 'openrouter/auto')).toBe(true);
  });
  it('all entries have id, name, provider', () => {
    for (const m of FALLBACK_MODELS) {
      expect(m.id).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(m.provider).toBeTruthy();
    }
  });
});

// fetchModels describe block removed — coverage moved to openrouter-adapter.test.ts
// which tests the adapter's fetchCatalog() directly against the /models endpoint shape.

describe('validateKey', () => {
  it('returns KeyInfo on successful validation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: { label: 'Test key', limit: 5.0, usage: 0.123 }
      }), { status: 200 })
    );
    const info = await validateKey('sk-or-v1-valid');
    expect(info.label).toBe('Test key');
    expect(info.limit).toBe(5.0);
    expect(info.usage).toBe(0.123);
  });

  it('rejects on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'bad key' }), { status: 401 })
    );
    try {
      await validateKey('sk-or-bogus');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(OpenRouterError);
      expect((err as OpenRouterError).category).toBe('auth');
    }
  });
  // 'rejects empty key without hitting network' removed — gateway no longer
  // short-circuits on empty key; coverage is in openrouter-adapter.test.ts.
});
