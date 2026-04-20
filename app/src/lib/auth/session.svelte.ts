/**
 * Session abstraction — the single source of truth for "who is the user right now?"
 *
 * v2 (Auth v2 Commit 3): when `VITE_AUTH_ENABLED` is off (default), `session.current`
 * stays `{ id: 'local', plan: 'free' }` so every existing consumer keeps working
 * unchanged. When the flag is on and a Supabase session is active, `session.current`
 * reacts to `supabase.auth.onAuthStateChange`.
 *
 * Back-compat shims (`currentUser`, `isAuthenticated`, `hasFeature`, `login`,
 * `logout`, `getAuthHeader`) are preserved so legacy callers (repo.ts, tools/repo.ts,
 * dataset queries, DatasetFooter) continue to compile and work identically when
 * the flag is off.
 */
import { browser } from '$app/environment';
import { supabase } from './supabase';
import { featureFlags } from '$lib/config/featureFlags';
import type { Session } from '@supabase/supabase-js';

export type CurrentUser = {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  plan: 'free' | 'paid' | 'grace';
};

// --- legacy types (kept for back-compat) ---------------------------------
export type Role = 'owner' | 'viewer';

export type User = {
  id: string;
  label: string;
  role: Role;
  token: string | null;
};

const LOCAL_USER: User = { id: 'local', label: 'You', role: 'owner', token: null };

// --- state ---------------------------------------------------------------
let _current = $state<CurrentUser | null>(
  featureFlags.authEnabled ? null : { id: 'local', plan: 'free' }
);
let _vaultKey = $state<CryptoKey | null>(null);
let _session = $state<Session | null>(null);

// Initialize Supabase session watcher once, browser-only.
// SvelteKit modules can be imported during SSR / prerender; the init block must
// never run on the server because _current / _session / _vaultKey are module-scope
// singletons that would leak across requests.
if (browser && featureFlags.authEnabled && supabase) {
  // Register onAuthStateChange FIRST so we never miss a SIGNED_OUT event that
  // fires while an explicit getSession() promise is still resolving. Supabase
  // auto-emits an INITIAL_SESSION event during client init, so the explicit
  // getSession() call is redundant.
  supabase.auth.onAuthStateChange((_event, session) => {
    _session = session;
    _current = shapeFromSession(session);
    if (!session) _vaultKey = null;
  });
}

function shapeFromSession(s: Session | null): CurrentUser | null {
  if (!s) return null;
  const u = s.user;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const app = (u.app_metadata ?? {}) as Record<string, unknown>;
  const plan = (app.plan as CurrentUser['plan'] | undefined) ?? 'free';
  return {
    id: u.id,
    email: u.email,
    name: (meta.full_name as string | undefined) ?? (meta.name as string | undefined),
    avatarUrl: meta.avatar_url as string | undefined,
    plan
  };
}

// --- public API ----------------------------------------------------------
export const session = {
  // --- v2 API ------------------------------------------------------------
  get current() { return _current; },
  get isSignedIn() { return _current !== null && _current.id !== 'local'; },
  get vaultUnlocked() { return _vaultKey !== null; },
  get supabaseSession() { return _session; },

  // --- legacy back-compat shims -----------------------------------------
  /** @deprecated Use `session.current` in new code. Kept so existing
   *  consumers (repo.ts, tools/repo.ts, dataset queries, DatasetFooter)
   *  keep working against the `{id, label, role, token}` shape. */
  get currentUser(): User {
    const c = _current;
    if (!c) return LOCAL_USER;
    if (c.id === 'local') return LOCAL_USER;
    return { id: c.id, label: c.name ?? c.email ?? 'You', role: 'owner', token: null };
  },
  /** @deprecated In v1 this was always true; v2 treats a null `current` as
   *  unauthenticated. Local user counts as authenticated for the local-only
   *  UX so Dexie writes keep flowing. */
  get isAuthenticated(): boolean { return _current !== null; },
  /** @deprecated Feature-flag helper — all flags pass in v1/local mode. */
  hasFeature(_flag: string): boolean { return true; },
  getAuthHeader(): Record<string, string> { return {}; },

  // --- Supabase auth actions --------------------------------------------
  async signInWithGoogle(): Promise<void> {
    if (!supabase) throw new Error('Auth not enabled');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
    if (error) throw error;
  },

  async signInWithGitHub(): Promise<void> {
    if (!supabase) throw new Error('Auth not enabled');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
    if (error) throw error;
  },

  async signOut(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut();
    _vaultKey = null;
  },

  /** @deprecated v1 no-op kept so any stragglers calling `login()` still work. */
  async login(): Promise<void> { /* v1 no-op */ },
  /** @deprecated Legacy alias for `signOut()` when flag is on; no-op when off. */
  async logout(): Promise<void> {
    if (supabase) {
      await supabase.auth.signOut();
      _vaultKey = null;
    }
  },

  /** @internal Set by key-vault.ts after successful unlock (C5). */
  _setVaultKey(k: CryptoKey | null) { _vaultKey = k; },
  /** @internal Read by key-vault.ts. */
  _getVaultKey(): CryptoKey | null { return _vaultKey; }
};

/** Compatibility helper: returns the current ownerId string for Dexie writes.
 *  Returns 'local' when auth is off or user is not signed in, else the uuid. */
export function currentOwnerId(): string {
  return _current?.id ?? 'local';
}
