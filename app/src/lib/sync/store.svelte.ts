/**
 * Sync store + provider singleton.
 *
 * Holds: (1) the reactive SyncConfig (read by Settings + write-on-mutate),
 * (2) the active SyncProvider instance (rebuilt when config changes),
 * (3) the reactive SyncStatus for the Settings UI to display.
 *
 * History store + Vault store call into this singleton via thin helpers
 * (syncRunFireAndForget, syncVaultItemFireAndForget). Those helpers never
 * throw and never await on the local-write path; failures degrade to a
 * status update + best-effort retry.
 */

import { browser } from '$app/environment';
import type { ToolRun } from '$lib/history/types';
import type { VaultItem } from '$lib/vault/types';
import type { SyncConfig, SyncProvider, SyncStatus } from './types';
import { createSupabaseProvider, isLikelyValidConfig } from './supabase-provider';

const CONFIG_KEY = 'cryptex.sync.config';

function loadConfig(): SyncConfig {
  if (!browser) return { enabled: false, provider: 'supabase' };
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { enabled: false, provider: 'supabase' };
    const parsed = JSON.parse(raw) as SyncConfig;
    return {
      enabled: !!parsed.enabled,
      provider: parsed.provider ?? 'supabase',
      supabaseUrl: parsed.supabaseUrl,
      supabaseAnonKey: parsed.supabaseAnonKey,
      lastSyncedAt: parsed.lastSyncedAt
    };
  } catch {
    return { enabled: false, provider: 'supabase' };
  }
}

function persistConfig(c: SyncConfig): void {
  if (!browser) return;
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
  } catch {
    /* quota / disabled storage — ignore; user will retry via Settings */
  }
}

let _config = $state<SyncConfig>(loadConfig());
let _provider: SyncProvider | null = null;
let _status = $state<SyncStatus>(
  _config.enabled ? { kind: 'idle', lastSyncedAt: _config.lastSyncedAt } : { kind: 'disabled' }
);
let _queued = 0;

function rebuildProvider(): void {
  // Build the provider whenever the config is structurally valid. The
  // `enabled` flag is consulted by the fire-and-forget call sites
  // (syncRunFireAndForget etc. below) — NOT by provider construction.
  // This lets "Test connection" in the Settings panel work before the user
  // clicks Save & enable, without flipping the "Disabled" status chip.
  let constructorFailed = false;
  if (_config.provider === 'supabase' && isLikelyValidConfig(_config)) {
    try {
      _provider = createSupabaseProvider(_config);
    } catch {
      _provider = null;
      constructorFailed = true;
    }
  } else {
    _provider = null;
  }

  if (!_config.enabled) {
    _status = { kind: 'disabled' };
  } else if (constructorFailed) {
    _status = { kind: 'error', message: 'Invalid Supabase URL or anon key.' };
  } else if (!_provider) {
    _status = { kind: 'error', message: 'Sync enabled but URL/key missing.' };
  } else {
    _status = { kind: 'idle', lastSyncedAt: _config.lastSyncedAt };
  }
}

rebuildProvider();

function markSyncing(): void {
  _queued++;
  _status = { kind: 'syncing', queued: _queued };
}

function markIdle(): void {
  _queued = Math.max(0, _queued - 1);
  if (_queued === 0) {
    const now = Date.now();
    _config = { ..._config, lastSyncedAt: now };
    persistConfig(_config);
    _status = { kind: 'idle', lastSyncedAt: now };
  }
}

function markError(message: string): void {
  _queued = Math.max(0, _queued - 1);
  _status = { kind: 'error', message, lastSyncedAt: _config.lastSyncedAt };
}

/** Fire-and-forget run sync. Never blocks the caller. Never throws. */
export function syncRunFireAndForget(run: ToolRun): void {
  if (!_provider || !_config.enabled) return;
  markSyncing();
  void _provider
    .syncRun(run)
    .then(markIdle)
    .catch((err: unknown) => markError((err as Error)?.message ?? 'Sync failed.'));
}

/** Fire-and-forget run deletion. */
export function deleteRunFireAndForget(id: string): void {
  if (!_provider || !_config.enabled) return;
  markSyncing();
  void _provider
    .deleteRun(id)
    .then(markIdle)
    .catch((err: unknown) => markError((err as Error)?.message ?? 'Delete failed.'));
}

/** Fire-and-forget Vault item sync. */
export function syncVaultItemFireAndForget(toolId: string, item: VaultItem<unknown>): void {
  if (!_provider || !_config.enabled) return;
  // Bundled items are read-only — don't pollute the user's Supabase with our seed data.
  if (item.source === 'bundled') return;
  markSyncing();
  void _provider
    .syncVaultItem(toolId, item)
    .then(markIdle)
    .catch((err: unknown) => markError((err as Error)?.message ?? 'Vault sync failed.'));
}

/** Fire-and-forget Vault item deletion. */
export function deleteVaultItemFireAndForget(toolId: string, id: string): void {
  if (!_provider || !_config.enabled) return;
  markSyncing();
  void _provider
    .deleteVaultItem(toolId, id)
    .then(markIdle)
    .catch((err: unknown) => markError((err as Error)?.message ?? 'Vault delete failed.'));
}

/** Settings UI binding. */
export const syncStore = {
  get config(): SyncConfig {
    return _config;
  },
  get status(): SyncStatus {
    return _status;
  },
  get hasProvider(): boolean {
    return _provider !== null;
  },

  /** Update config + rebuild the provider instance. */
  updateConfig(patch: Partial<SyncConfig>): void {
    _config = { ..._config, ...patch };
    persistConfig(_config);
    rebuildProvider();
  },

  /** Network-validate current config. Surfaces 401 / table-missing / unreachable. */
  async validate(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!_provider) return { ok: false, error: 'Provider not configured.' };
    return _provider.validate();
  },

  /**
   * One-shot bulk push of everything currently local. Use after enabling
   * sync the first time, or after a long offline period.
   */
  async runInitialSync(args: {
    runs: ToolRun[];
    vaultByTool: Record<string, VaultItem<unknown>[]>;
  }): Promise<{ runsPushed: number; vaultPushed: number } | { error: string }> {
    if (!_provider) return { error: 'Provider not configured.' };
    markSyncing();
    try {
      const r = await _provider.initialSync(args);
      markIdle();
      return r;
    } catch (err) {
      const msg = (err as Error)?.message ?? 'Initial sync failed.';
      markError(msg);
      return { error: msg };
    }
  }
};
