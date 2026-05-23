<script lang="ts">
  /**
   * Scrollable shot stack for Many-Shot runs. Each shot as a row with a
   * relevance score bar. Final query highlighted as "Real query".
   */
  import type { ManyShotStack } from '../orchestrators/types';
  import Target from 'lucide-svelte/icons/target';

  type Props = { stack: ManyShotStack };
  let { stack }: Props = $props();

  function barColor(rel: number): string {
    if (rel >= 0.75) return 'bg-red-500/70';
    if (rel >= 0.5) return 'bg-yellow-500/70';
    return 'bg-emerald-500/70';
  }
</script>

<div class="space-y-3">
  <div class="text-[10px] text-muted-foreground">
    {stack.shots.length} shot{stack.shots.length === 1 ? '' : 's'} · final query appended
  </div>

  <ol class="space-y-1.5 max-h-[480px] overflow-y-auto cryptex-scroll pr-1">
    {#each stack.shots as entry (entry.index)}
      <li class="rounded-md border border-border/50 bg-background/40 p-2 space-y-1">
        <div class="flex items-center gap-2">
          <span class="shrink-0 font-mono text-[10px] text-muted-foreground w-6 text-right">
            #{entry.index + 1}
          </span>
          <div class="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
            <div
              class={'h-full ' + barColor(entry.relevance)}
              style:width={`${Math.round(entry.relevance * 100)}%`}
            ></div>
          </div>
          <span class="shrink-0 font-mono text-[9px] text-muted-foreground">
            rel {entry.relevance.toFixed(2)}
          </span>
        </div>
        <pre class="font-mono text-[10.5px] whitespace-pre-wrap break-words bg-card/40 p-2 rounded">{entry.shot}</pre>
      </li>
    {/each}

    {#if stack.finalQuery}
      <li class="rounded-md border-2 border-primary/40 bg-primary/5 p-2 space-y-1">
        <div class="flex items-center gap-2 text-primary">
          <Target size={11} />
          <span class="text-[10px] font-medium uppercase tracking-wider">Final query (real)</span>
        </div>
        <pre class="font-mono text-[11px] whitespace-pre-wrap break-words bg-card/40 p-2 rounded">{stack.finalQuery}</pre>
      </li>
    {/if}
  </ol>
</div>
