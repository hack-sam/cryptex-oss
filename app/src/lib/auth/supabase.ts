import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { featureFlags } from '$lib/config/featureFlags';

/** Diagnostic snapshot of what the build saw for the Supabase env vars.
 *  Read by the /login + /signup pages so the browser can show a precise
 *  banner ("KEY missing", "URL malformed", etc.) without forcing the user
 *  to open DevTools. The boolean values are NOT secrets — they only say
 *  whether the var was present and well-formed at build time. */
export type SupabaseConfigStatus =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'auth-flag-off'
        | 'url-missing'
        | 'key-missing'
        | 'url-malformed'
        | 'key-malformed';
      detail: string;
    };

function inspect(): SupabaseConfigStatus {
  if (!featureFlags.authEnabled) {
    return {
      ok: false,
      reason: 'auth-flag-off',
      detail: 'VITE_AUTH_ENABLED is not "true" in this build.'
    };
  }
  const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;
  if (!url || url === 'undefined') {
    return {
      ok: false,
      reason: 'url-missing',
      detail: 'PUBLIC_SUPABASE_URL was not present at build time.'
    };
  }
  if (!key || key === 'undefined') {
    return {
      ok: false,
      reason: 'key-missing',
      detail: 'PUBLIC_SUPABASE_ANON_KEY was not present at build time.'
    };
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)/i.test(url)) {
    return {
      ok: false,
      reason: 'url-malformed',
      detail: `PUBLIC_SUPABASE_URL does not look like a Supabase project URL (got: "${url.slice(0, 60)}…"). It should look like https://abcdefgh.supabase.co.`
    };
  }
  // Anon keys are JWTs (3 dot-separated base64 segments). Very loose check —
  // just enough to catch "pasted the project URL into the key field" mistakes.
  if (!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    return {
      ok: false,
      reason: 'key-malformed',
      detail: 'PUBLIC_SUPABASE_ANON_KEY does not look like a Supabase anon JWT (should start with "eyJ" and contain two dots). Make sure you copied the "anon public" key, not the project URL or the service_role key.'
    };
  }
  return { ok: true };
}

export const supabaseConfigStatus: SupabaseConfigStatus = inspect();

/** Null when VITE_AUTH_ENABLED is off OR when the URL/KEY pair is missing
 *  / malformed. Callers MUST null-check before use; the /login + /signup
 *  pages additionally surface `supabaseConfigStatus` so the browser can
 *  explain exactly what went wrong without forcing DevTools. */
export const supabase: SupabaseClient | null = (() => {
  if (!supabaseConfigStatus.ok) {
    if (supabaseConfigStatus.reason !== 'auth-flag-off') {
      console.error(`[auth] ${supabaseConfigStatus.detail}`);
    }
    return null;
  }
  const url = import.meta.env.PUBLIC_SUPABASE_URL as string;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      /*
       * PKCE flow — the production-grade choice for browser-only SPAs.
       *
       * Flow shape:
       *   1. signInWithOAuth() generates a code_verifier in localStorage
       *      under `sb-{projectRef}-auth-token-code-verifier` and sends a
       *      derived code_challenge to /auth/v1/authorize.
       *   2. Supabase OAuth round-trip with the provider (Google / GitHub).
       *   3. Supabase redirects to /auth/callback?code=<single-use auth_code>.
       *      The auth_code is useless to anyone without the verifier.
       *   4. On /auth/callback, SDK detects the ?code= (because
       *      detectSessionInUrl: true), reads the verifier from localStorage,
       *      and POSTs {auth_code, code_verifier} to
       *      /auth/v1/token?grant_type=pkce over TLS.
       *   5. Supabase returns the session in the response body. No token
       *      ever lands in window.location, browser history, or referrer.
       *
       * Why this beats implicit flow:
       *   - Burp/proxy sees the auth_code in the redirect URL but it's
       *     single-use AND tied to a verifier the attacker doesn't have.
       *   - No #access_token in window.location.hash → no extension /
       *     history / log capture window.
       *   - Replaying the intercepted auth_code returns 400.
       *
       * Email-based flows (signup confirmation, password reset, email
       * change) call verifyOtp(email, token, type) directly with an
       * explicit code from the email body — they don't depend on URL
       * state, so flowType is irrelevant to them.
       *
       * Background note: an earlier 404 on /auth/v1/token?grant_type=pkce
       * was observed during testing. Subsequent diagnostics
       * (curl probe of the endpoint with apikey) confirmed the route
       * exists at the gateway level and rejects with 400/401, never 404.
       * The earlier 404 was traced to detectSessionInUrl: false racing
       * the manual exchangeCodeForSession() call in /auth/callback, which
       * consumed the verifier twice. Keeping detectSessionInUrl: true
       * and letting the SDK own the entire PKCE lifecycle avoids the
       * race and is the supported pattern.
       */
      flowType: 'pkce',
      detectSessionInUrl: true
    }
  });
})();
