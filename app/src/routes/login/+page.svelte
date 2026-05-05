<script lang="ts">
  import { session } from '$lib/auth/session.svelte';
  import { featureFlags } from '$lib/config/featureFlags';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import Logo from '$lib/components/brand/Logo.svelte';

  let mode = $state<'password' | 'magic'>('password');
  let email = $state('');
  let password = $state('');
  let error = $state<string | null>(null);
  let info = $state<string | null>(null);
  let loading = $state(false);

  async function google() {
    loading = true;
    error = null;
    try {
      await session.signInWithGoogle();
    } catch (e) {
      error = (e as Error).message;
      loading = false;
    }
  }

  async function github() {
    loading = true;
    error = null;
    try {
      await session.signInWithGitHub();
    } catch (e) {
      error = (e as Error).message;
      loading = false;
    }
  }

  async function passwordSignIn() {
    if (!email || !password) return;
    loading = true;
    error = null;
    info = null;
    try {
      await session.signInWithPassword(email, password);
    } catch (e) {
      error = (e as Error).message;
      loading = false;
    }
  }

  async function magicLink() {
    if (!email) return;
    loading = true;
    error = null;
    info = null;
    try {
      await session.signInWithMagicLink(email);
      info = `Magic link sent to ${email}. Check your inbox.`;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (session.isSignedIn) void goto(`${base}/chat`);
  });
</script>

<svelte:head><title>Sign in · Cryptex</title></svelte:head>

{#if !featureFlags.authEnabled}
  <p class="m-auto mt-24 text-center text-muted-foreground">Auth is disabled in this build.</p>
{:else}
  <div class="mx-auto mt-24 flex max-w-md flex-col items-center gap-6 px-6 text-center">
    <Logo size={40} />
    <h1 class="font-serif text-3xl tracking-tight">Sign in to Cryptex</h1>
    <p class="text-sm text-muted-foreground">
      Your keys stay on your device. Your chats stay private to your account.
    </p>

    {#if mode === 'password'}
      <form
        onsubmit={(e) => { e.preventDefault(); void passwordSignIn(); }}
        class="flex w-full flex-col gap-2 text-left"
      >
        <input
          bind:value={email}
          type="email"
          required
          placeholder="Email"
          class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
        />
        <input
          bind:value={password}
          type="password"
          required
          minlength="8"
          placeholder="Password"
          class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          class="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >{loading ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <button
        type="button"
        onclick={() => { mode = 'magic'; error = null; info = null; }}
        class="text-xs text-muted-foreground hover:text-foreground"
      >Use a magic link instead</button>
    {:else}
      <form
        onsubmit={(e) => { e.preventDefault(); void magicLink(); }}
        class="flex w-full flex-col gap-2 text-left"
      >
        <input
          bind:value={email}
          type="email"
          required
          placeholder="Email"
          class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          class="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >{loading ? 'Sending…' : 'Send magic link'}</button>
      </form>
      <button
        type="button"
        onclick={() => { mode = 'password'; error = null; info = null; }}
        class="text-xs text-muted-foreground hover:text-foreground"
      >Use a password instead</button>
    {/if}

    <div class="my-2 flex w-full items-center gap-2 text-xs text-muted-foreground">
      <div class="flex-1 border-t border-border/30"></div>
      <span>or continue with</span>
      <div class="flex-1 border-t border-border/30"></div>
    </div>

    <div class="flex w-full flex-col gap-2">
      <button
        type="button"
        onclick={google}
        disabled={loading}
        class="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-50"
      >Continue with Google</button>
      <button
        type="button"
        onclick={github}
        disabled={loading}
        class="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-50"
      >Continue with GitHub</button>
    </div>

    {#if info}<p class="text-sm text-foreground">{info}</p>{/if}
    {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

    <p class="text-xs text-muted-foreground">
      No account? <a href="{base}/signup" class="underline hover:text-foreground">Create one</a>
    </p>
    <p class="text-xs text-muted-foreground">
      Transform and other offline tools work without sign-in.
    </p>
  </div>
{/if}
