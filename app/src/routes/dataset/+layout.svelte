<script lang="ts">
  import { session } from '$lib/auth/session.svelte';
  import { featureFlags } from '$lib/config/featureFlags';
  import SignInWall from '$lib/components/billing/SignInWall.svelte';
  let { children } = $props();
</script>

{#if featureFlags.authEnabled && !session.isSignedIn}
  <SignInWall feature="the Dataset Inspector" />
{:else}
  {@render children?.()}
{/if}
