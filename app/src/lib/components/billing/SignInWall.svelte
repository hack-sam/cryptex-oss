<script lang="ts">
  import { session } from '$lib/auth/session.svelte';
  import Logo from '$lib/components/brand/Logo.svelte';

  type Props = { feature?: string };
  let { feature = 'this feature' }: Props = $props();

  let loading = $state(false);
  let error = $state<string | null>(null);

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
</script>

<div class="mx-auto mt-24 flex max-w-md flex-col items-center gap-6 px-6 text-center">
  <Logo size={36} />
  <h2 class="font-serif text-2xl tracking-tight">Sign in to use {feature}</h2>
  <p class="text-sm text-muted-foreground">Free — your keys stay on your device.</p>
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
  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
</div>
