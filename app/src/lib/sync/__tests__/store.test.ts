/**
 * Sync store state machine · v2.4.2 Test Connection fix coverage
 *
 * Pre-v2.4.2 bug: rebuildProvider() gated provider construction on
 * `_config.enabled === true`. The Settings panel's "Test connection" handler
 * deliberately patches in URL + anon key WITHOUT flipping enabled, so the
 * pre-fix store reported "Provider not configured." even when the user had
 * filled both fields correctly.
 *
 * Post-v2.4.2: provider is constructed whenever `isLikelyValidConfig` passes;
 * the `enabled` flag drives only the status chip and the fire-and-forget
 * gates. These tests lock in the new invariants.
 *
 * Note: the store is a module-scope singleton. We use `vi.resetModules()` +
 * a fresh `localStorage` between cases so each test starts from a clean
 * default config.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';

const VALID_URL = 'https://abcdefgh.supabase.co';
const VALID_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.signature_part';

async function freshStore() {
  vi.resetModules();
  // jsdom's localStorage carries over between vi.resetModules() calls in the
  // same test file. Clearing it gives each test a virgin singleton state.
  if (typeof localStorage !== 'undefined') localStorage.clear();
  const mod = await import('$lib/sync/store.svelte');
  return mod.syncStore;
}

beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('rebuildProvider: provider construction decoupled from enabled flag', () => {
  test('valid URL + key with enabled=false: provider builds, status stays disabled', async () => {
    const syncStore = await freshStore();
    // This is exactly what CloudSyncPanel.testConnection() does pre-enable.
    syncStore.updateConfig({
      provider: 'supabase',
      supabaseUrl: VALID_URL,
      supabaseAnonKey: VALID_KEY
    });
    expect(syncStore.hasProvider).toBe(true);
    expect(syncStore.status.kind).toBe('disabled');
  });

  test('valid URL + key with enabled=true: provider builds, status idle', async () => {
    const syncStore = await freshStore();
    syncStore.updateConfig({
      enabled: true,
      provider: 'supabase',
      supabaseUrl: VALID_URL,
      supabaseAnonKey: VALID_KEY
    });
    expect(syncStore.hasProvider).toBe(true);
    expect(syncStore.status.kind).toBe('idle');
  });

  test('missing key with enabled=true: provider null, status error (key missing)', async () => {
    const syncStore = await freshStore();
    syncStore.updateConfig({
      enabled: true,
      provider: 'supabase',
      supabaseUrl: VALID_URL,
      supabaseAnonKey: ''
    });
    expect(syncStore.hasProvider).toBe(false);
    expect(syncStore.status.kind).toBe('error');
    if (syncStore.status.kind === 'error') {
      expect(syncStore.status.message).toMatch(/URL\/key missing/i);
    }
  });

  test('missing key with enabled=false: provider null, status disabled (no error noise)', async () => {
    const syncStore = await freshStore();
    syncStore.updateConfig({
      enabled: false,
      provider: 'supabase',
      supabaseUrl: VALID_URL,
      supabaseAnonKey: ''
    });
    expect(syncStore.hasProvider).toBe(false);
    expect(syncStore.status.kind).toBe('disabled');
  });

  test('malformed JWT-shaped key with enabled=true: provider null, status error', async () => {
    const syncStore = await freshStore();
    syncStore.updateConfig({
      enabled: true,
      provider: 'supabase',
      supabaseUrl: VALID_URL,
      supabaseAnonKey: 'not-a-jwt'
    });
    expect(syncStore.hasProvider).toBe(false);
    expect(syncStore.status.kind).toBe('error');
  });

  test('toggling enabled false → true → false preserves provider while flipping status', async () => {
    const syncStore = await freshStore();
    syncStore.updateConfig({
      provider: 'supabase',
      supabaseUrl: VALID_URL,
      supabaseAnonKey: VALID_KEY
    });
    expect(syncStore.hasProvider).toBe(true);
    expect(syncStore.status.kind).toBe('disabled');

    syncStore.updateConfig({ enabled: true });
    expect(syncStore.hasProvider).toBe(true);
    expect(syncStore.status.kind).toBe('idle');

    syncStore.updateConfig({ enabled: false });
    expect(syncStore.hasProvider).toBe(true);
    expect(syncStore.status.kind).toBe('disabled');
  });
});
