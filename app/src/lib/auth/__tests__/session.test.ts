import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const originalAuthEnabled = process.env.VITE_AUTH_ENABLED;

describe('session', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalAuthEnabled === undefined) delete process.env.VITE_AUTH_ENABLED;
    else process.env.VITE_AUTH_ENABLED = originalAuthEnabled;
  });

  it('returns local user when auth flag is off', async () => {
    vi.stubEnv('VITE_AUTH_ENABLED', 'false');
    process.env.VITE_AUTH_ENABLED = 'false';
    const { session } = await import('../session.svelte');
    expect(session.current).toEqual({ id: 'local', plan: 'free' });
    expect(session.isSignedIn).toBe(false);
  });

  it('returns null when flag on but no active Supabase session', async () => {
    vi.stubEnv('VITE_AUTH_ENABLED', 'true');
    vi.stubEnv('PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
    process.env.VITE_AUTH_ENABLED = 'true';
    const { session } = await import('../session.svelte');
    expect(session.current).toBeNull();
    expect(session.isSignedIn).toBe(false);
  });

  it('exposes a vaultUnlocked getter (false until C5)', async () => {
    const { session } = await import('../session.svelte');
    expect(session.vaultUnlocked).toBe(false);
  });
});
