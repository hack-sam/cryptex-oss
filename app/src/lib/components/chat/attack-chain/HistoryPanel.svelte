<script lang="ts">
  /**
   * Collapsible history panel — renders the 10 most recent Attack Chain
   * runs for the current chat. Each row shows timestamp, input preview,
   * chain size, and Restore / Delete actions. Empty state when no runs.
   *
   * Data loading and soft-delete both go through the parent via
   * {onRestore, onDelete}; this component is presentational.
   */
  import type { AttackChainRunRow } from '$lib/chat/types';
  import History from 'lucide-svelte/icons/history';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';

  type Props = {
    runs: AttackChainRunRow[];
    onRestore: (run: AttackChainRunRow) => void;
    onDelete: (id: string) => void;
  };
  let { runs, onRestore, onDelete }: Props = $props();

  const visible = $derived(runs.slice(0, 10));

  function relativeTime(ts: number): string {
    const delta = Math.max(0, Date.now() - ts);
    const s = Math.floor(delta / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  function inputPreview(s: string): string {
    const trimmed = s.trim();
    if (trimmed.length <= 60) return trimmed;
    return `${trimmed.slice(0, 60)}…`;
  }
</script>

<details class="group rounded-md border border-border/40 bg-background/40 text-xs" open>
  <summary class="flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 text-muted-foreground hover:text-foreground">
    <ChevronRight size={11} class="transition-transform group-open:rotate-90" />
    <History size={11} />
    <span>History</span>
    <span class="ml-auto text-[10px] text-muted-foreground">
      {runs.length === 0 ? 'none' : `${runs.length} run${runs.length === 1 ? '' : 's'}`}
    </span>
  </summary>

  <div class="flex flex-col gap-1 border-t border-border/40 px-2 py-2">
    {#if visible.length === 0}
      <p class="px-2 py-3 text-center text-[11px] text-muted-foreground">
        No runs yet for this chat.
      </p>
    {:else}
      {#each visible as run (run.id)}
        <div
          class="group/row flex flex-col gap-0.5 rounded border border-border/30 bg-background/60 px-2 py-1.5 transition-colors hover:border-primary/40"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="shrink-0 text-[10px] font-medium text-muted-foreground">
              {relativeTime(run.createdAt)}
            </span>
            <span class="shrink-0 text-[10px] text-muted-foreground">
              {run.layers.length}-layer{run.executeEnabled ? ' + execute' : ''}
              {#if run.finalOutput}
                · {run.finalOutput.length} chars out
              {/if}
            </span>
          </div>
          <p class="truncate text-[11px] text-foreground" title={run.input}>
            {inputPreview(run.input)}
          </p>
          <div class="flex items-center justify-end gap-1 opacity-70 transition-opacity group-hover/row:opacity-100">
            <button
              type="button"
              onclick={() => onRestore(run)}
              class="inline-flex items-center gap-1 rounded border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              aria-label="Restore this run"
            >
              <RotateCcw size={9} /> Restore
            </button>
            <button
              type="button"
              onclick={() => onDelete(run.id)}
              class="inline-flex items-center gap-1 rounded border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
              aria-label="Delete this run"
            >
              <Trash2 size={9} /> Delete
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</details>
