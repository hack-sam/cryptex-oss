<script lang="ts">
  import { session } from '$lib/auth/session.svelte';
  import { featureFlags } from '$lib/config/featureFlags';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import Logo from '$lib/components/brand/Logo.svelte';
  import Eye from 'lucide-svelte/icons/eye';
  import EyeOff from 'lucide-svelte/icons/eye-off';
  import Check from 'lucide-svelte/icons/check';
  import X from 'lucide-svelte/icons/x';
  import Loader from 'lucide-svelte/icons/loader-circle';
  import KeyRound from 'lucide-svelte/icons/key-round';

  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let showPassword = $state(false);
  let acceptTerms = $state(false);
  let error = $state<string | null>(null);
  let success = $state(false);
  let loading = $state(false);
  let busyProvider = $state<'google' | 'github' | 'password' | 'otp' | 'resend' | null>(null);

  // After Supabase emails the confirmation, the user can paste the 6-digit
  // code instead of clicking the link. This is the prefetch-safe path —
  // email-scanner bots can't extract the OTP from the email content the
  // way they HEAD-request a URL.
  let otpCode = $state('');
  let otpError = $state<string | null>(null);
  let otpInfo = $state<string | null>(null);

  // Password strength rules — checked locally before form submit so users get
  // instant feedback. Supabase enforces server-side too.
  const rules = $derived([
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Contains a letter', ok: /[A-Za-z]/.test(password) },
    { label: 'Contains a number', ok: /[0-9]/.test(password) }
  ]);

  const passwordsMatch = $derived(
    password.length > 0 && password === confirmPassword
  );

  const canSubmit = $derived(
    !!email &&
    rules.every((r) => r.ok) &&
    passwordsMatch &&
    acceptTerms &&
    !loading
  );

  async function signUp() {
    if (!canSubmit) return;
    loading = true;
    busyProvider = 'password';
    error = null;
    try {
      await session.signUpWithPassword(email, password);
      success = true;
    } catch {
      // Generic message — a per-provider error string can leak
      // account-existence ("user already registered") and let attackers
      // enumerate emails. Pretend it always worked from the user's POV;
      // they'll either get the email or notice the address was wrong.
      error = "Couldn't create an account. Check your details and try again.";
    } finally {
      loading = false;
      busyProvider = null;
    }
  }

  async function google() {
    loading = true;
    busyProvider = 'google';
    error = null;
    try {
      await session.signInWithGoogle();
    } catch {
      // Generic error — never echo provider strings ("OAuth provider not
      // enabled", "redirect_to mismatch", rate-limit shape, etc) since
      // those help an attacker fingerprint the auth config.
      error = 'Sign-in could not complete. Try again.';
      loading = false;
      busyProvider = null;
    }
  }

  async function github() {
    loading = true;
    busyProvider = 'github';
    error = null;
    try {
      await session.signInWithGitHub();
    } catch {
      error = 'Sign-in could not complete. Try again.';
      loading = false;
      busyProvider = null;
    }
  }

  /** Verify the 6-digit code from the confirmation email. */
  async function verifyOtp() {
    if (!email || !otpCode) return;
    loading = true;
    busyProvider = 'otp';
    otpError = null;
    otpInfo = null;
    try {
      // type='email' covers both signup confirmation and email-change in
      // recent Supabase SDKs; for older versions, 'signup' is the canonical
      // signup-confirmation type.
      try {
        await session.verifyEmailOtp(email, otpCode, 'email');
      } catch {
        await session.verifyEmailOtp(email, otpCode, 'signup');
      }
      // verifyEmailOtp completes the session synchronously; the global
      // signed-in effect below will redirect to /chat.
    } catch {
      // Single non-leaking message. Don't distinguish "expired" vs
      // "wrong code" vs "rate limited" — that would hand attackers a
      // brute-force oracle.
      otpError = 'That code is invalid or expired.';
    } finally {
      loading = false;
      busyProvider = null;
    }
  }

  /** Resend the confirmation email with a fresh OTP. */
  async function resendCode() {
    if (!email) return;
    loading = true;
    busyProvider = 'resend';
    otpError = null;
    otpInfo = null;
    try {
      // Purpose-built resend for unconfirmed signups (vs starting a fresh
      // magic-link flow, which can confuse Supabase's rate limiter).
      await session.resendSignupOtp(email);
      otpInfo = 'New code sent.';
    } catch {
      // Show a generic, non-leaking error rather than echoing the
      // provider's exact message (rate-limit shape, account-existence
      // hints, etc).
      otpError = 'Could not send a new code right now. Try again in a minute.';
    } finally {
      loading = false;
      busyProvider = null;
    }
  }

  $effect(() => {
    if (session.isReady && session.isSignedIn) void goto(`${base}/chat`);
  });
</script>

<svelte:head>
  <title>Create account · Cryptex</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if !featureFlags.authEnabled}
  <div class="mx-auto mt-24 max-w-md px-6 text-center">
    <p class="text-muted-foreground">Auth is disabled in this build.</p>
  </div>
{:else}
  <div class="relative mx-auto mt-8 grid w-full max-w-5xl gap-8 px-6 sm:mt-14 lg:mt-16 lg:grid-cols-[1fr_minmax(360px,420px)] lg:items-center">
    <!-- Left: brand + value prop. Hidden on mobile so the form takes priority. -->
    <aside class="hidden lg:flex lg:flex-col lg:gap-5">
      <a href="{base}/" class="flex items-center gap-2.5 transition-opacity hover:opacity-85">
        <Logo size={28} />
        <span class="font-serif text-lg tracking-tight">Cryptex</span>
      </a>
      <h2 class="font-serif text-3xl tracking-tight text-balance">
        Sign up to <span class="text-primary italic">study</span> language models.
      </h2>
      <p class="max-w-md text-[14px] leading-relaxed text-muted-foreground">
        Free account, no card. We only store your email — chats stay in your browser.
      </p>
      <ul class="space-y-2 text-[13px] text-muted-foreground">
        <li class="flex items-start gap-2"><span class="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-primary"></span><span>26 specialized red-team workbenches.</span></li>
        <li class="flex items-start gap-2"><span class="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-primary"></span><span>162 transforms + 36 mutators, all browser-side.</span></li>
        <li class="flex items-start gap-2"><span class="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-primary"></span><span>BYOK — your provider keys never leave your device.</span></li>
      </ul>
    </aside>

    <!-- Right: form column -->
    <div class="flex flex-col items-center gap-5">
      <div class="flex flex-col items-center gap-2 lg:hidden">
        <Logo size={32} />
        <span class="font-serif text-xl tracking-tight">Cryptex</span>
      </div>

      <div class="text-center lg:text-left lg:self-stretch">
        <h1 class="font-serif text-2xl tracking-tight sm:text-3xl">
          {success ? 'Verify your email' : 'Create your account'}
        </h1>
        <p class="mt-1.5 text-[13px] text-muted-foreground">
          {success
            ? 'We sent a 6-digit code to your email.'
            : 'Free — your keys stay on your device.'}
        </p>
      </div>

      <div class="w-full rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur-sm">
      {#if success}
        <form
          onsubmit={(e) => { e.preventDefault(); void verifyOtp(); }}
          class="flex flex-col gap-4"
        >
          <p class="text-[13px] leading-relaxed text-muted-foreground">
            We sent a 6-digit code to <strong class="text-foreground break-all">{email}</strong>. Enter it below to finish creating your account.
          </p>

          <label class="flex flex-col gap-1.5 text-[11px]">
            <span class="font-medium text-foreground">Verification code</span>
            <input
              bind:value={otpCode}
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              pattern="[0-9]*"
              maxlength="10"
              placeholder="000000"
              class="w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2.5 text-center font-mono text-base tracking-[0.4em] shadow-inner focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          <button
            type="submit"
            disabled={loading || !otpCode}
            class="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-medium text-primary-foreground shadow-primary transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {#if busyProvider === 'otp'}
              <Loader size={13} class="animate-spin" /> Verifying…
            {:else}
              <KeyRound size={13} /> Verify code
            {/if}
          </button>

          <div class="flex flex-col gap-1.5 border-t border-border/40 pt-2.5 text-[11px]">
            <button
              type="button"
              onclick={resendCode}
              disabled={loading}
              class="text-left text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            >
              {busyProvider === 'resend' ? 'Sending new code…' : 'Send a new code'}
            </button>
            <p class="text-muted-foreground/80">
              Check spam if you don't see it within a minute.
            </p>
          </div>

          {#if otpInfo}
            <p role="status" class="rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px] text-foreground">{otpInfo}</p>
          {/if}
          {#if otpError}
            <p role="alert" class="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">{otpError}</p>
          {/if}
        </form>
      {:else}
        <form
          onsubmit={(e) => { e.preventDefault(); void signUp(); }}
          class="flex flex-col gap-3"
        >
          <label class="flex flex-col gap-1.5 text-xs">
            <span class="font-medium text-foreground">Email</span>
            <input
              bind:value={email}
              type="email"
              required
              autocomplete="email"
              inputmode="email"
              spellcheck="false"
              placeholder="you@example.com"
              class="w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm shadow-inner focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          <label class="flex flex-col gap-1.5 text-xs">
            <span class="font-medium text-foreground">Password</span>
            <div class="relative">
              <input
                bind:value={password}
                type={showPassword ? 'text' : 'password'}
                required
                minlength="8"
                autocomplete="new-password"
                placeholder="At least 8 characters"
                class="w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 pr-10 text-sm shadow-inner focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                onclick={() => (showPassword = !showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                {#if showPassword}
                  <EyeOff size={16} />
                {:else}
                  <Eye size={16} />
                {/if}
              </button>
            </div>
            {#if password.length > 0}
              <ul class="mt-1 flex flex-col gap-0.5 text-[11px]">
                {#each rules as rule}
                  <li class={rule.ok ? 'flex items-center gap-1 text-foreground' : 'flex items-center gap-1 text-muted-foreground'}>
                    {#if rule.ok}
                      <Check size={12} class="text-emerald-500" />
                    {:else}
                      <X size={12} class="text-muted-foreground/60" />
                    {/if}
                    <span>{rule.label}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </label>

          <label class="flex flex-col gap-1.5 text-xs">
            <span class="font-medium text-foreground">Confirm password</span>
            <input
              bind:value={confirmPassword}
              type={showPassword ? 'text' : 'password'}
              required
              autocomplete="new-password"
              placeholder="Repeat password"
              class="w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm shadow-inner focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {#if confirmPassword.length > 0 && !passwordsMatch}
              <span class="text-[11px] text-destructive">Passwords don't match.</span>
            {/if}
          </label>

          <label class="flex items-start gap-2 text-[11px] text-muted-foreground">
            <input
              bind:checked={acceptTerms}
              type="checkbox"
              required
              class="mt-0.5 h-3.5 w-3.5 rounded border-border/60 bg-background/60 text-primary focus:ring-primary/30"
            />
            <span>
              I agree to the
              <a href="{base}/about" class="text-foreground underline-offset-4 hover:underline">Terms</a>
              and acknowledge the privacy notice — Cryptex stores chats client-side and your account email at Supabase.
            </span>
          </label>

          <button
            type="submit"
            disabled={!canSubmit}
            class="mt-1 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >{busyProvider === 'password' ? 'Creating…' : 'Create account'}</button>
        </form>

        <div class="my-5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <div class="flex-1 border-t border-border/30"></div>
          <span class="uppercase tracking-wider">Or</span>
          <div class="flex-1 border-t border-border/30"></div>
        </div>

        <div class="flex flex-col gap-2">
          <button
            type="button"
            onclick={google}
            disabled={loading}
            class="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border/60 bg-background/60 text-sm hover:bg-muted/40 disabled:opacity-50"
          >
            <svg viewBox="0 0 18 18" class="h-4 w-4" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.95v2.32A9 9 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.96H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.32z"/>
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.97 8.97 0 0 0 9 0 9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"/>
            </svg>
            {busyProvider === 'google' ? 'Redirecting…' : 'Continue with Google'}
          </button>
          <button
            type="button"
            onclick={github}
            disabled={loading}
            class="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border/60 bg-background/60 text-sm hover:bg-muted/40 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4 fill-current" aria-hidden="true">
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.69-3.87-1.37-3.87-1.37-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a10.95 10.95 0 0 1 5.74 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.07 0 4.4-2.69 5.36-5.25 5.65.41.36.78 1.06.78 2.13v3.16c0 .31.21.66.79.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/>
            </svg>
            {busyProvider === 'github' ? 'Redirecting…' : 'Continue with GitHub'}
          </button>
        </div>

        {#if error}
          <p
            role="alert"
            class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
          >{error}</p>
        {/if}
      {/if}
    </div>

      <p class="text-[12px] text-muted-foreground">
        Already have an account? <a href="{base}/login" class="font-medium text-foreground underline-offset-4 hover:underline">Sign in</a>
      </p>
    </div>
  </div>
{/if}
