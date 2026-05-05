import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => { vi.resetModules(); });

describe('openaiCompatAdapter', () => {
  it('builds adapter with id openai-compat and instanceId', async () => {
    const mod = await import('../adapters/openai-compat');
    const a = mod.openaiCompatAdapter({
      id: 'openai-compat', instanceId: 'abc-123', name: 'Groq',
      presetId: 'groq', baseURL: 'https://api.groq.com/openai/v1',
      apiKey: 'gsk-x', enabled: true
    });
    expect(a.id).toBe('openai-compat');
    expect(a.instanceId).toBe('abc-123');
  });

  it('fetchCatalog normalizes /models response into qualified ids', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { id: 'llama-3.3-70b-versatile', context_window: 131072 },
        { id: 'mixtral-8x7b-32768' }
      ]
    }), { status: 200 }));
    const mod = await import('../adapters/openai-compat');
    const a = mod.openaiCompatAdapter({
      id: 'openai-compat', instanceId: 'abc-123', name: 'Groq',
      presetId: 'groq', baseURL: 'https://api.groq.com/openai/v1',
      apiKey: 'gsk-x', enabled: true
    });
    const list = await a.fetchCatalog();
    expect(list).toHaveLength(2);
    expect(list[0].qualifiedId).toBe('openai-compat:abc-123/llama-3.3-70b-versatile');
    expect(list[0].provider).toBe('openai-compat');
    expect(list[0].providerInstanceId).toBe('abc-123');
  });

  it('fetchCatalog returns empty and does not throw on 404 /models', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    const mod = await import('../adapters/openai-compat');
    const a = mod.openaiCompatAdapter({
      id: 'openai-compat', instanceId: 'z', name: 'X', presetId: 'custom',
      baseURL: 'https://x.test/v1', apiKey: 'k', enabled: true
    });
    const list = await a.fetchCatalog();
    expect(list).toEqual([]);
  });

  it('fetchCatalog returns empty on fetch TypeError (network)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const mod = await import('../adapters/openai-compat');
    const a = mod.openaiCompatAdapter({
      id: 'openai-compat', instanceId: 'x', name: 'X', presetId: 'custom',
      baseURL: 'https://x.test/v1', apiKey: 'k', enabled: true
    });
    const list = await a.fetchCatalog();
    expect(list).toEqual([]);
  });

  it('fetchCatalog returns empty on 500', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    const mod = await import('../adapters/openai-compat');
    const a = mod.openaiCompatAdapter({
      id: 'openai-compat', instanceId: 'x', name: 'X', presetId: 'custom',
      baseURL: 'https://x.test/v1', apiKey: 'k', enabled: true
    });
    const list = await a.fetchCatalog();
    expect(list).toEqual([]);
  });

  it('fetchCatalog returns empty when response has no data field', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ something: 'else' }), { status: 200 }));
    const mod = await import('../adapters/openai-compat');
    const a = mod.openaiCompatAdapter({
      id: 'openai-compat', instanceId: 'x', name: 'X', presetId: 'custom',
      baseURL: 'https://x.test/v1', apiKey: 'k', enabled: true
    });
    const list = await a.fetchCatalog();
    expect(list).toEqual([]);
  });
});

describe('validateKey', () => {
  it('returns KeyInfo with label on 200', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'chatcmpl-x', choices: [{ message: { content: '.' } }] }), { status: 200 }));
    const mod = await import('../adapters/openai-compat');
    const a = mod.openaiCompatAdapter({
      id: 'openai-compat', instanceId: 'abc', name: 'Groq',
      presetId: 'groq', baseURL: 'https://api.groq.com/openai/v1',
      apiKey: 'gsk-x', testModel: 'llama-3.3-70b-versatile', enabled: true
    });
    const info = await a.validateKey('gsk-x');
    expect(info.label).toBe('Groq');
  });

  it('maps 401 to auth category', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'invalid' } }), { status: 401 }));
    const mod = await import('../adapters/openai-compat');
    const a = mod.openaiCompatAdapter({
      id: 'openai-compat', instanceId: 'abc', name: 'Groq',
      presetId: 'groq', baseURL: 'https://api.groq.com/openai/v1',
      apiKey: 'gsk-bad', testModel: 'llama-3.3-70b-versatile', enabled: true
    });
    await expect(a.validateKey('gsk-bad')).rejects.toMatchObject({ category: 'auth' });
  });

  it('maps TypeError (fetch failed) to cors category via suspectCors flag', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const mod = await import('../adapters/openai-compat');
    const a = mod.openaiCompatAdapter({
      id: 'openai-compat', instanceId: 'abc', name: 'X',
      presetId: 'custom', baseURL: 'https://cors-missing.test/v1',
      apiKey: 'k', testModel: 'model', enabled: true
    });
    await expect(a.validateKey('k')).rejects.toMatchObject({ category: 'cors' });
  });
});

describe('OPENAI_COMPAT_PRESETS — DeepSeek', () => {
  it('includes DeepSeek with the right baseURL + defaults', async () => {
    const { OPENAI_COMPAT_PRESETS, getPreset } = await import('../presets');
    const ds = getPreset('deepseek');
    expect(ds).toBeDefined();
    expect(ds?.name).toBe('DeepSeek');
    expect(ds?.baseURL).toBe('https://api.deepseek.com/v1');
    expect(ds?.docsUrl).toBe('https://api-docs.deepseek.com/');
    expect(ds?.defaultTestModel).toBe('deepseek-chat');
    expect(ds?.supportsAuthProbe).toBe(true);

    // And it must appear in the array (not just the lookup helper).
    const ids = OPENAI_COMPAT_PRESETS.map((p) => p.id);
    expect(ids).toContain('deepseek');
  });
});
