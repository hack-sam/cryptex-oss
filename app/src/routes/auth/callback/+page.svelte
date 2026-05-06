<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { supabase } from '$lib/auth/supabase';
  import KeyRound from 'lucide-svelte/icons/key-round';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';

  type Flow = 'email' | 'oauth' | 'unknown';

  let message = $state('Signing you in…');
  let detail = $state<string | null>(null);
  let showOtpFallback = $state(false);
  let showOAuthRetry = $state(false);
  let isError = $state(false);
  let flow = $state<Flow>('unknown');

  onMount(async () => {
    if (!supabase) {
      void goto(`${base}/`);
      return;
    }

    /*
     * PKCE flow: the Supabase SDK detects ?code=… on /auth/callback,
     * reads the code_verifier from localStorage, posts to
     * /auth/v1/token?grant_type=pkce, and sets the session — all
     * automatically because detectSessionInUrl: true. By the time THIS
     * onMount runs, one of three things has happened:
     *
     *  1. URL had ?code=… → SDK exchanged it server-side and set the
     *     session. Visible via supabase.auth.getSession(). Redirect to
     *     /chat. No token ever lands in window.location.
     *  2. URL had ?error=… (provider rejection / consent denied / link
     *     expired) → no session set. Show the right recovery UI.
     *  3. Bare URL (user hit /auth/callback by hand) → no session, no
     *     error. Bounce to /login.
     */
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    const queryErr = url.searchParams.get('error') ?? hashParams.get('error');
    const queryErrDesc = url.searchParams.get('error_description') ?? hashParams.get('error_description');
    const queryErrCode = url.searchParams.get('error_code') ?? hashParams.get('error_code');

    flow = detectFlow(queryErr, queryErrDesc, url.searchParams);

    if (queryErr || queryErrDesc) {
      handleProviderError(queryErr, queryErrDesc, queryErrCode);
      return;
    }

    /*
     * Poll for the session for up to 4s. The SDK sets it synchronously
     * on init in most cases, but on some browsers (or with a slow
     * localStorage) the auth-state-change event arrives a few ticks
     * later. Poll instead of fire-and-forget so we don't redirect
     * before the session lands.
     */
    const deadline = Date.now() + 4_000;
    while (Date.now() < deadline) {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        void goto(`${base}/chat`);
        return;
      }
      await new Promise((r) => setTimeout(r, 80));
    }

    // No error in URL, no session after 4s. Most likely the user navigated
    // here directly. Redirect quietly.
    if (!url.hash && !url.searchParams.toString()) {
      message = 'Redirecting to sign in…';
      setTimeout(() => void goto(`${base}/login`), 800);
      return;
    }

    isError = true;
    message = 'Sign-in incomplete';
    detail = 'No session was returned. Try again.';
    if (flow === 'oauth') showOAuthRetry = true;
    else showOtpFallback = true;
  });

  /*
   * Heuristic flow detection — drives the recovery UI shape.
   * Email flows tend to surface error_code=otp_expired or "email link"
   * phrasing; OAuth flows tend to surface error=server_error/access_denied
   * with provider-related description.
   */
  function detectFlow(err: string | null, desc: string | null, params: URLSearchParams): Flow {
    const d = (desc ?? '').toLowerCase();
    if (
      /email link|email expired|otp_expired|magic link|signup.*confirm|recovery/i.test(d) ||
      params.get('error_code') === 'otp_expired'
    ) {
      return 'email';
    }
    if (err === 'server_error' || /external|provider|oauth|consent/.test(d) || params.has('provider')) {
      return 'oauth';
    }
    return 'unknown';
  }

  function handleProviderError(err: string | null, desc: string | null, code: string | null) {
    isError = true;

    if (flow === 'oauth') {
      if (err === 'access_denied') {
        message = 'Sign-in cancelled';
        detail = "You cancelled at the provider's consent screen.";
      } else {
        message = 'Sign-in could not complete';
        detail = 'The provider rejected the sign-in. Try again, or use email + password.';
      }
      showOAuthRetry = true;
      return;
    }

    if (code === 'otp_expired' || /expired|invalid/i.test(desc ?? '') || err === 'access_denied') {
      message = 'That sign-in link is no longer valid';
      detail = 'Use the 6-digit code from the email — it lasts longer and works from any browser.';
    } else {
      message = 'Sign-in could not complete';
      detail = 'Try again, or use the 6-digit code from your email.';
    }
    showOtpFallback = true;
  }
</script>

<svelte:head><title>Signing in… · Cryptex</title></svelte:head>

<div class="m-auto mt-16 flex max-w-md flex-col items-center gap-6 px-6 sm:mt-24">
  {#if !isError}
    <p class="text-center text-sm text-muted-foreground">{message}</p>
  {:else}
    <div class="w-full space-y-5 rounded-2xl border border-border/60 bg-card/60 p-6 shadow-glass">
      <div class="space-y-1.5 text-center">
        <h1 class="font-serif text-2xl tracking-tight">{message}</h1>
        {#if detail}
          <p class="text-sm leading-relaxed text-muted-foreground">{detail}</p>
        {/if}
      </div>

      {#if showOtpFallback}
        <div class="space-y-1.5 rounded-xl border border-primary/30 bg-primary/5 p-3.5 text-[13px]">
          <div class="flex items-center gap-2 font-medium text-foreground">
            <KeyRound size={13} class="text-primary" />
            Try the 6-digit code
          </div>
          <p class="text-[12px] leading-relaxed text-muted-foreground">
            Open your email, copy the code, and enter it on the sign-in page.
          </p>
        </div>

        <div class="flex flex-col gap-1.5">
          <a
            href="{base}/login"
            class="group inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-medium text-primary-foreground shadow-primary transition-transform hover:-translate-y-0.5"
          >
            Enter sign-in code
            <ArrowRight size={13} class="transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href="{base}/login"
            class="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-background/60 text-[13px] font-medium transition-colors hover:bg-muted/40"
          >
            <RefreshCw size={13} /> Send a new code
          </a>
        </div>
      {:else if showOAuthRetry}
        <div class="flex flex-col gap-1.5">
          <a
            href="{base}/login"
            class="group inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-medium text-primary-foreground shadow-primary transition-transform hover:-translate-y-0.5"
          >
            Try again
            <ArrowRight size={13} class="transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      {:else}
        <div class="flex flex-col gap-1.5">
          <a
            href="{base}/login"
            class="group inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-medium text-primary-foreground shadow-primary transition-transform hover:-translate-y-0.5"
          >
            Back to sign in
            <ArrowRight size={13} class="transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      {/if}
    </div>
  {/if}
</div>
