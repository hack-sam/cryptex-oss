<script lang="ts">
  /**
   * Horizontal stepper for PAIR runs. Each PairStep is a card with prompt,
   * response, refused chip, and refinement notes. Arrow between steps shows
   * direction of refinement. Converged badge at the end.
   */
  import type { PairTrace } from '../orchestrators/types';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import Check from 'lucide-svelte/icons/check';
  import X from 'lucide-svelte/icons/x';

  type Props = { trace: PairTrace };
  let { trace }: Props = $props();
</script>

<div class="space-y-3">
  <div class="flex items-center gap-2 text-[10px] text-muted-foreground">
    <span>{trace.steps.length} round{trace.steps.length === 1 ? '' : 's'}</span>
    {#if trace.converged}
      <span
        class="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300"
      >
        <Check size={10} /> converged
      </span>
    {:else if trace.steps.length > 0}
      <span
        class="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-yellow-300"
      >
        budget exhausted
      </span>
    {/if}
  </div>

  <ol class="flex flex-col gap-3">
    {#each trace.steps as step, i (i)}
      <li class="grid gap-2 md:grid-cols-[1fr_24px_1fr]">
        <article
          class={'rounded-lg border bg-card/40 p-3 space-y-1.5 ' +
            (step.refused
              ? 'border-red-500/30'
              : i === trace.steps.length - 1 && trace.converged
                ? 'border-emerald-500/40'
                : 'border-border/50')}
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Round {i + 1} · prompt
            </span>
            {#if step.refused}
              <span
                class="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0 text-[9px] text-red-300"
              >
                <X size={9} /> refused
              </span>
            {:else if step.response}
              <span
                class="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[9px] text-emerald-300"
              >
                <Check size={9} /> complied
              </span>
            {/if}
          </div>
          <pre
            class="font-mono text-[11px] whitespace-pre-wrap break-words max-h-36 overflow-y-auto cryptex-scroll bg-background/40 p-2 rounded">{step.prompt}</pre>
          {#if step.response}
            <div class="text-[10px] text-muted-foreground">Target response</div>
            <pre
              class="font-mono text-[11px] whitespace-pre-wrap break-words max-h-36 overflow-y-auto cryptex-scroll bg-background/40 p-2 rounded">{step.response}</pre>
          {/if}
        </article>

        {#if i < trace.steps.length - 1}
          <div class="flex items-center justify-center text-muted-foreground">
            <ArrowRight size={16} />
          </div>
          <article class="rounded-lg border border-dashed border-border/40 bg-background/30 p-3 space-y-1">
            <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Refinement → round {i + 2}
            </span>
            {#if step.refinementNotes}
              <p class="text-[11px] text-foreground/80">{step.refinementNotes}</p>
            {:else}
              <p class="text-[11px] text-muted-foreground italic">(no refiner notes captured)</p>
            {/if}
          </article>
        {:else}
          <div class="hidden md:block"></div>
          <div class="hidden md:block"></div>
        {/if}
      </li>
    {/each}
  </ol>
</div>
