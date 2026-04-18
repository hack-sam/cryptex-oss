<script lang="ts">
  import { listProviders } from '$lib/ai/providers.svelte';
  import ProviderCard from './ProviderCard.svelte';
  import AddProviderDialog from './AddProviderDialog.svelte';
  import Plus from 'lucide-svelte/icons/plus';

  let dialogOpen = $state(false);
  // $derived re-reads the rune-backed list so this section re-renders on changes
  const providers = $derived(listProviders());
</script>

<section class="space-y-4" id="providers">
  <header>
    <h2 class="font-serif text-xl font-semibold">Providers</h2>
    <p class="text-sm text-muted-foreground">Use your own API keys. Keys are stored only in your browser.</p>
  </header>

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
