import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => { vi.resetModules(); });

describe('openrouterAdapter', () => {
  it('returns an Adapter whose id is openrouter', async () => {
    const mod = await import('../adapters/openrouter');
    const a = mod.openrouterAdapter({ id: 'openrouter', apiKey: 'sk-x', enabled: true });
    expect(a.id).toBe('openrouter');
    expect(a.isConfigured()).toBe(true);
  });

  it('isConfigured false when apiKey empty', async () => {
    const mod = await import('../adapters/openrouter');
    const a = mod.openrouterAdapter({ id: 'openrouter', apiKey: '', enabled: true });
    expect(a.isConfigured()).toBe(false);
  });

  it('validateKey hits /auth/key and maps 401 to auth error', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'invalid' } }), { status: 401 }));
    const mod = await import('../adapters/openrouter');
    const a = mod.openrouterAdapter({ id: 'openrouter', apiKey: 'sk-bad', enabled: true });
    await expect(a.validateKey('sk-bad')).rejects.toMatchObject({ category: 'auth' });
  });
});
