<script lang="ts">
  import type { TechniqueDNA } from './dna';
  import type { RefusalTier } from '../attack-chain-refusal';
  import { onDestroy } from 'svelte';
  import Copy from 'lucide-svelte/icons/copy';
  import Check from 'lucide-svelte/icons/check';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';

  type Props = {
    response: string;
    dna: TechniqueDNA;
    tier: RefusalTier;
    onPromote: () => void;
  };
  let { response, dna, tier, onPromote }: Props = $props();

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (copyTimer) clearTimeout(copyTimer);
  });

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(response);
      copied = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = false), 1500);
    } catch {
      // clipboard blocked — silently no-op
    }
  }

  const tierClass = $derived(
    tier === 'refusal' ? 'bg-red-500/20 text-red-400'
    : tier === 'evasive' ? 'bg-orange-500/20 text-orange-400'
    : tier === 'partial' ? 'bg-yellow-500/20 text-yellow-400'
    : tier === 'substantive' ? 'bg-green-500/20 text-green-400'
    : 'bg-emerald-500/30 text-emerald-300'
  );

  function dnaChip(d: TechniqueDNA): string {
    const parts: string[] = [];
    if (d.mutatorId) parts.push(d.mutatorId);
    if (d.classifierId) parts.push(d.classifierId);
    if (d.wrapperId) parts.push(d.wrapperId);
    parts.push(d.tempBucket);
    return parts.length > 0 ? parts.join(' · ') : 'empty';
  }
</script>

<div class="rounded-md border border-primary/40 bg-primary/5 p-3 text-xs">
  <div class="mb-2 flex items-center gap-2">
    <span class="uppercase tracking-wide text-[10px] text-muted-foreground">Winner</span>
    <span class={'rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide ' + tierClass}>{tier}</span>
    <span class="text-[10px] text-muted-foreground">{dnaChip(dna)}</span>
  </div>
  <pre class="whitespace-pre-wrap rounded bg-background/40 p-2 text-[11px] leading-snug">{response}</pre>
  <div class="mt-2 flex gap-2">
    <button type="button" onclick={copyToClipboard} class="inline-flex items-center gap-1 rounded border border-border/40 px-2 py-1 hover:bg-muted/40">
      {#if copied}<Check size={10} /> Copied{:else}<Copy size={10} /> Copy{/if}
    </button>
    <button type="button" onclick={onPromote} class="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-primary-foreground hover:bg-primary/90">
      <ArrowRight size={10} /> Send to main chat
    </button>
  </div>
</div>
