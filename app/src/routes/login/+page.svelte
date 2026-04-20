<script lang="ts">
  import { session } from '$lib/auth/session.svelte';
  import { featureFlags } from '$lib/config/featureFlags';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import Logo from '$lib/components/brand/Logo.svelte';

  let error = $state<string | null>(null);
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
    <div class="flex w-full flex-col gap-2">
      <button
        type="button"
        onclick={google}
        disabled={loading}
        class="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-50"
      >
        Continue with Google
      </button>
      <button
        type="button"
        onclick={github}
        disabled={loading}
        class="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-50"
      >
        Continue with GitHub
      </button>
    </div>
    {#if error}
      <p class="text-sm text-destructive">{error}</p>
    {/if}
    <p class="text-xs text-muted-foreground">
      Transform and other offline tools work without sign-in.
    </p>
  </div>
{/if}
