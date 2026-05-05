<script lang="ts">
  import { session } from '$lib/auth/session.svelte';
  import { featureFlags } from '$lib/config/featureFlags';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import Logo from '$lib/components/brand/Logo.svelte';

  let email = $state('');
  let password = $state('');
  let error = $state<string | null>(null);
  let success = $state(false);
  let loading = $state(false);

  async function signUp() {
    if (!email || !password) return;
    loading = true;
    error = null;
    try {
      await session.signUpWithPassword(email, password);
      success = true;
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

<svelte:head><title>Create account · Cryptex</title></svelte:head>

{#if !featureFlags.authEnabled}
  <p class="m-auto mt-24 text-center text-muted-foreground">Auth is disabled in this build.</p>
{:else}
  <div class="mx-auto mt-24 flex max-w-md flex-col items-center gap-6 px-6 text-center">
    <Logo size={40} />
    <h1 class="font-serif text-3xl tracking-tight">Create your Cryptex account</h1>

    {#if success}
      <p class="text-sm text-foreground">
        Check your email <strong>{email}</strong> for a confirmation link.
      </p>
      <p class="text-xs text-muted-foreground">
        <a href="{base}/login" class="underline hover:text-foreground">Back to sign in</a>
      </p>
    {:else}
      <p class="text-sm text-muted-foreground">
        Free — your keys stay on your device, your chats stay private to your account.
      </p>
      <form
        onsubmit={(e) => { e.preventDefault(); void signUp(); }}
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
          placeholder="Password (min 8 characters)"
          class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          class="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >{loading ? 'Creating…' : 'Create account'}</button>
      </form>
      {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
      <p class="text-xs text-muted-foreground">
        Already have an account? <a href="{base}/login" class="underline hover:text-foreground">Sign in</a>
      </p>
    {/if}
  </div>
{/if}
