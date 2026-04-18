<script lang="ts">
  import type { Model } from '$lib/ai/types';
  import CapabilityIcon from './CapabilityIcon.svelte';

  type Props = { model: Model; active?: boolean; onSelect: (m: Model) => void };
  let { model, active, onSelect }: Props = $props();

  const adapterLabel = $derived(
    model.provider === 'openrouter'     ? 'via OpenRouter' :
    model.provider === 'anthropic'      ? 'direct' :
    `via ${model.upstreamProvider ?? 'custom'}`
  );
</script>

<button type="button"
  onclick={() => onSelect(model)}
  class="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-white/5 {active ? 'bg-white/10' : ''}">
  <div class="min-w-0 flex-1">
    <div class="truncate font-medium">{model.name}</div>
    <div class="truncate text-xs text-muted-foreground">{model.id} · {adapterLabel}</div>
  </div>
  <div class="flex flex-none items-center gap-1 text-muted-foreground">
    {#if model.capabilities?.reasoning}<CapabilityIcon kind="reasoning" />{/if}
    {#if model.capabilities?.vision}<CapabilityIcon kind="vision" />{/if}
    {#if model.capabilities?.tools}<CapabilityIcon kind="tools" />{/if}
    {#if model.capabilities?.jsonSchema}<CapabilityIcon kind="jsonSchema" />{/if}
    {#if model.capabilities?.pdf}<CapabilityIcon kind="pdf" />{/if}
    {#if model.isFree}<CapabilityIcon kind="free" />{/if}
  </div>
</button>
