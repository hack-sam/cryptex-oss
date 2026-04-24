<script lang="ts">
  import type { AttackSessionTurn, ComplianceTier } from '$lib/chat/types';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';

  type Props = {
    turn: AttackSessionTurn;
    live?: boolean;
    onPromote?: () => void;
  };
  let { turn, live = false, onPromote }: Props = $props();

  let expandRationale = $state(false);

  const tierClass = $derived(
    turn.complianceTier === 'refusal' ? 'bg-red-500/20 text-red-400'
    : turn.complianceTier === 'evasive' ? 'bg-orange-500/20 text-orange-400'
    : turn.complianceTier === 'partial' ? 'bg-yellow-500/20 text-yellow-400'
    : turn.complianceTier === 'substantive' ? 'bg-green-500/20 text-green-400'
    : turn.complianceTier === 'compliant' ? 'bg-emerald-500/30 text-emerald-300'
    : 'bg-muted/40 text-muted-foreground'
  );
</script>

{#if turn.role === 'orchestrator'}
  <div class="flex flex-col gap-1 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
    <div class="flex items-center gap-2">
      <span class="rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-primary">
        {turn.strategyId ?? 'no_strategy'}
      </span>
      <span class="text-[10px] text-muted-foreground">orchestrator</span>
      {#if turn.rationale}
        <button
          type="button"
          onclick={() => (expandRationale = !expandRationale)}
          class="ml-auto inline-flex items-center text-[10px] text-muted-foreground hover:text-foreground"
          aria-expanded={expandRationale}
        >
          <ChevronRight size={10} class={expandRationale ? 'rotate-90 transition-transform' : 'transition-transform'} />
          why
        </button>
      {/if}
    </div>
    <pre class="whitespace-pre-wrap font-sans text-[12px] leading-snug text-foreground">{turn.text}</pre>
    {#if expandRationale && turn.rationale}
      <div class="rounded bg-muted/30 p-1.5 text-[10px] italic text-muted-foreground">{turn.rationale}</div>
    {/if}
  </div>
{:else}
  <div class="flex flex-col gap-1 rounded-md border border-border/40 bg-background/40 p-2 text-xs">
    <div class="flex items-center gap-2">
      <span class="text-[10px] text-muted-foreground">target</span>
      {#if turn.complianceTier}
        <span class={'rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide ' + tierClass}>{turn.complianceTier}</span>
      {/if}
      {#if typeof turn.objectiveProgress === 'number'}
        <div class="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>progress</span>
          <div class="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
            <div class="h-full bg-primary transition-all" style:width="{(turn.objectiveProgress / 10) * 100}%"></div>
          </div>
          <span>{turn.objectiveProgress}/10</span>
        </div>
      {/if}
    </div>
    <pre class="whitespace-pre-wrap font-sans text-[12px] leading-snug text-foreground">{turn.text}{live ? '…' : ''}</pre>
    {#if turn.error}
      <div class="rounded bg-orange-500/10 p-1.5 text-[10px] text-orange-400">{turn.error}</div>
    {/if}
    {#if !live && onPromote}
      <div class="flex justify-end">
        <button
          type="button"
          onclick={onPromote}
          class="inline-flex items-center gap-1 rounded border border-border/40 px-2 py-0.5 text-[10px] hover:bg-muted/40"
        >
          <ArrowRight size={10} /> Send pair to main chat
        </button>
      </div>
    {/if}
  </div>
{/if}
