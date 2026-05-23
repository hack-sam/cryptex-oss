<script lang="ts">
  /**
   * Chat-bubble layout for Crescendo. Alternating user/assistant bubbles
   * with a benignness chip per turn (green → yellow → red gradient) and a
   * refused chip when the target refuses.
   */
  import type { CrescendoThread } from '../orchestrators/types';

  type Props = { thread: CrescendoThread };
  let { thread }: Props = $props();

  function chipColor(b: number | undefined): string {
    if (b === undefined) return 'border-muted text-muted-foreground bg-card';
    if (b >= 0.66) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    if (b >= 0.33) return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300';
    return 'border-red-500/30 bg-red-500/10 text-red-300';
  }

  function chipLabel(b: number | undefined): string {
    if (b === undefined) return '—';
    if (b >= 0.66) return 'benign';
    if (b >= 0.33) return 'pivot';
    return 'on-goal';
  }
</script>

<div class="space-y-3">
  <div class="text-[10px] text-muted-foreground">{thread.turns.length} turns</div>
  <ol class="flex flex-col gap-2">
    {#each thread.turns as turn (turn.index)}
      <li
        class={'flex items-start gap-2 ' + (turn.role === 'user' ? 'justify-start' : 'justify-end')}
      >
        {#if turn.role === 'user'}
          <span
            class={'shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider ' +
              chipColor(turn.benignness)}
            title={`benignness ${(turn.benignness ?? 0).toFixed(2)}`}
          >
            {chipLabel(turn.benignness)}
          </span>
        {/if}
        <div
          class={'max-w-[78%] rounded-lg border p-2.5 ' +
            (turn.role === 'user'
              ? 'bg-card/60 border-border/50'
              : turn.refused
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-primary/10 border-primary/30')}
        >
          <div class="flex items-center gap-2 mb-1">
            <span class="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {turn.role}
            </span>
            {#if turn.role === 'assistant' && turn.refused}
              <span
                class="rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0 text-[9px] text-red-300"
              >
                refused
              </span>
            {/if}
          </div>
          <pre class="font-mono text-[11px] whitespace-pre-wrap break-words">{turn.text}</pre>
        </div>
        {#if turn.role === 'assistant'}
          <span
            class={'shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider ' +
              chipColor(turn.benignness)}
            title={`benignness ${(turn.benignness ?? 0).toFixed(2)}`}
          >
            {chipLabel(turn.benignness)}
          </span>
        {/if}
      </li>
    {/each}
  </ol>
</div>
