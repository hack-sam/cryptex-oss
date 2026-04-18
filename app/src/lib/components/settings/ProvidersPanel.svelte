<script lang="ts">
  import { listProviders } from '$lib/ai/providers.svelte';
  import { catalog } from '$lib/ai/catalog.svelte';
  import ProviderCard from './ProviderCard.svelte';
  import AddProviderDialog from './AddProviderDialog.svelte';
  import Plus from 'lucide-svelte/icons/plus';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';

  let dialogOpen = $state(false);
  let refreshing = $state(false);
  // $derived re-reads the rune-backed list so this section re-renders on changes
  const providers = $derived(listProviders());

  async function handleRefresh() {
    refreshing = true;
    try {
      await catalog.refresh(true);
    } finally {
      refreshing = false;
    }
  }
</script>

<section class="space-y-4" id="providers">
  <header class="flex items-start justify-between gap-2">
    <div>
      <h2 class="font-serif text-xl font-semibold">Providers</h2>
      <p class="text-sm text-muted-foreground">Use your own API keys. Keys are stored only in your browser.</p>
    </div>
    <button
      type="button"
      onclick={handleRefresh}
      disabled={refreshing}
      title="Refresh model catalog"
      class="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-white/10 disabled:opacity-50"
    >
      <RefreshCw size={12} class={refreshing ? 'animate-spin' : ''} />
      {refreshing ? 'Refreshing…' : 'Refresh models'}
    </button>
  </header>

  {#if providers.length === 0}
    <div class="glass rounded-lg border border-dashed border-white/15 p-6 text-center text-sm text-muted-foreground">
      No providers configured yet. Add one to start using AI tools.
    </div>
  {/if}

  {#each providers as record (record.id + ((record as { instanceId?: string }).instanceId ?? ''))}
    <ProviderCard {record} />
  {/each}

  <button
    type="button"
    onclick={() => dialogOpen = true}
    class="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 px-4 py-6 text-sm text-muted-foreground hover:bg-white/5"
  >
    <Plus class="h-4 w-4" /> Add provider
  </button>
</section>

<AddProviderDialog open={dialogOpen} onClose={() => dialogOpen = false} />
