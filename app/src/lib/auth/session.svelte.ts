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
import { base } from '$app/paths';
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

// --- client-side brute-force throttle ------------------------------------
//
// Module-scope token bucket keyed by `${action}:${email}`. Defends against
// scripted brute force from inside this tab (XSS-injected loop, malicious
// extension, automated harness piggy-backing on the open session) — the
// kind of attack server-side rate-limiting alone can't stop because it
// fires faster than the network round-trip.
//
// First N legitimate attempts in the window are unaffected; only abusive
// loops trip the gate. The throw-on-limit message is generic so it doesn't
// reveal the throttle to an attacker probing for it (combined with
// existing generic UI messages, the user sees the same neutral error).
//
// Reasoning: 6-digit OTP code-space is ~1M. At 6 attempts/min, brute-force
// horizon is ~115 days per email — well past Supabase's OTP TTL.
const _attempts = new Map<string, number[]>();
const _LIMITS: Record<string, { max: number; windowMs: number }> = {
  password: { max: 5, windowMs: 60_000 }, // sign-in
  otp:      { max: 6, windowMs: 60_000 }, // OTP verify (small grace for fat-finger)
  reauth:   { max: 5, windowMs: 60_000 }  // verify-current-password before sensitive op
};
function _allow(action: keyof typeof _LIMITS, key: string): boolean {
  const cfg = _LIMITS[action];
  const now = Date.now();
  const bucketKey = `${action}:${key}`;
  const bucket = (_attempts.get(bucketKey) ?? []).filter((t) => now - t < cfg.windowMs);
  if (bucket.length >= cfg.max) {
    _attempts.set(bucketKey, bucket);
    return false;
  }
  bucket.push(now);
  _attempts.set(bucketKey, bucket);
  return true;
}

// --- state ---------------------------------------------------------------
let _current = $state<CurrentUser | null>(
  featureFlags.authEnabled ? null : { id: 'local', plan: 'free' }
);
let _vaultKey = $state<CryptoKey | null>(null);
let _session = $state<Session | null>(null);
// Tracks whether Supabase has resolved the persisted session at least once.
// Consumers (chat layout auth gate, login redirect effect) gate redirects on
// this so a signed-in user reloading /chat doesn't briefly bounce through
// /login while Supabase is still hydrating localStorage.
let _ready = $state(!featureFlags.authEnabled);

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
    _ready = true;
  });
  // Belt-and-suspenders timeout — if onAuthStateChange somehow fails to fire
  // (e.g. Supabase service down), don't leave the UI hanging in "loading"
  // forever. After 3 seconds, mark ready and let downstream show signed-out.
  setTimeout(() => { _ready = true; }, 3000);
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
  /** True once Supabase has resolved its persisted session at least once
   *  (or auth is disabled in this build). Use to defer redirects until the
   *  hydration race settles. */
  get isReady() { return _ready; },
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
      options: { redirectTo: `${window.location.origin}${base}/auth/callback` }
    });
    if (error) throw error;
  },

  async signInWithGitHub(): Promise<void> {
    if (!supabase) throw new Error('Auth not enabled');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}${base}/auth/callback` }
    });
    if (error) throw error;
  },

  async signInWithPassword(email: string, password: string): Promise<void> {
    if (!supabase) throw new Error('Auth not enabled');
    if (!_allow('password', email.toLowerCase())) {
      throw new Error('Too many attempts. Wait a minute and try again.');
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  async signUpWithPassword(email: string, password: string): Promise<void> {
    if (!supabase) throw new Error('Auth not enabled');
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}${base}/auth/callback` }
    });
    if (error) throw error;
  },

  /**
   * @deprecated Magic-link sign-in is disabled in the UI for v1. Kept on
   * the session so deferred re-enablement is a config flip rather than a
   * code change. Currently only used internally by the OTP-resend paths
   * which call it as the lowest-friction "send another email" trigger.
   */
  async signInWithMagicLink(email: string): Promise<void> {
    if (!supabase) throw new Error('Auth not enabled');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${base}/auth/callback` }
    });
    if (error) throw error;
  },

  /**
   * Resend the signup confirmation email (with a fresh OTP code) for an
   * existing-but-unconfirmed account. Purpose-built for the post-signup
   * "Send a new code" UI; uses Supabase's `resend({type: 'signup'})` API
   * which targets the signup-confirmation flow specifically rather than
   * starting a new magic-link flow.
   */
  async resendSignupOtp(email: string): Promise<void> {
    if (!supabase) throw new Error('Auth not enabled');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}${base}/auth/callback` }
    });
    if (error) throw error;
  },

  async sendPasswordReset(email: string): Promise<void> {
    if (!supabase) throw new Error('Auth not enabled');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${base}/auth/callback`
    });
    if (error) throw error;
  },

  /**
   * Verify a 6-digit OTP code from a Supabase email instead of clicking
   * the link. Used as a workaround for email-link prefetchers (Outlook
   * Safe Links, Google Workspace link-protection, antivirus, etc.) which
   * HEAD-request URLs in mail to scan for malware — that prefetch
   * consumes the single-use token, so the human's later click sees
   * "Email link is invalid or has expired".
   *
   * `type` matches Supabase's email types:
   *   - 'signup'    — confirm email after signUp
   *   - 'magiclink' — passwordless sign-in
   *   - 'recovery'  — password reset
   *   - 'invite'    — accept invite
   *   - 'email_change' — confirm new email address
   *   - 'email'     — generic; works for signup + magiclink in newer SDKs
   */
  async verifyEmailOtp(
    email: string,
    token: string,
    type: 'signup' | 'magiclink' | 'recovery' | 'invite' | 'email_change' | 'email'
  ): Promise<void> {
    if (!supabase) throw new Error('Auth not enabled');
    if (!_allow('otp', email.toLowerCase())) {
      throw new Error('Too many attempts. Wait a minute and try again.');
    }
    const cleaned = token.replace(/\s+/g, '').trim();
    if (!cleaned) throw new Error('Enter the code from your email.');
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: cleaned,
      type
    });
    if (error) throw error;
  },

  /** Set or change the signed-in user's password. Used both for users who
   *  signed up via magic-link / OAuth (no password set yet) and for users
   *  changing an existing password. Supabase enforces server-side checks
   *  (min length, breach lists if configured); we add basic client checks. */
  async updatePassword(newPassword: string): Promise<void> {
    if (!supabase) throw new Error('Auth not enabled');
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  /** Re-authenticate against the current user's email + a known password
   *  before sensitive operations (e.g. password change). Supabase doesn't
   *  expose a dedicated "verify password" endpoint — signInWithPassword
   *  acts as one when called with the current account's email. */
  async verifyCurrentPassword(currentPassword: string): Promise<void> {
    if (!supabase) throw new Error('Auth not enabled');
    const email = _current?.email;
    if (!email) throw new Error('No email on session — cannot verify.');
    if (!_allow('reauth', email.toLowerCase())) {
      // Mirror the existing "incorrect" error string so the throttle-hit
      // case is indistinguishable from a wrong password (preserves the
      // generic-error property the existing UI relies on).
      throw new Error('Current password is incorrect.');
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (error) throw new Error('Current password is incorrect.');
  },

  async signOut(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut();
    _vaultKey = null;
  },

  /**
   * Sign out of EVERY device this account is logged in on (revokes all
   * refresh tokens server-side via Supabase). Use this on sensitive
   * actions like password change or after suspected credential leak.
   * `local` only signs out current tab; `global` revokes everywhere.
   */
  async signOutAllDevices(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut({ scope: 'global' });
    _vaultKey = null;
  },

  /**
   * Trigger an email-address change. Supabase sends a confirmation email
   * to the NEW address with a 6-digit OTP. Caller follows up with
   * `verifyEmailOtp(newEmail, code, 'email_change')` after the user
   * pastes the code.
   *
   * Uses signed-in update — caller must be signed in. Re-auth (current
   * password verification) is the caller's responsibility before invoking.
   */
  async requestEmailChange(newEmail: string): Promise<void> {
    if (!supabase) throw new Error('Auth not enabled');
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      throw new Error('Enter a valid email address.');
    }
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) throw error;
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
