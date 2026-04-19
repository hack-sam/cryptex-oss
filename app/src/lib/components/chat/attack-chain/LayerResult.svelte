<script lang="ts">
  import type { LayerResultRow } from '$lib/chat/attack-chain';
  import { detectRefusal } from '$lib/chat/attack-chain-refusal';
  import Copy from 'lucide-svelte/icons/copy';
  import Check from 'lucide-svelte/icons/check';
  import AlertCircle from 'lucide-svelte/icons/circle-alert';
  import AlertTriangle from 'lucide-svelte/icons/triangle-alert';
  import Pencil from 'lucide-svelte/icons/pencil';
  import FileText from 'lucide-svelte/icons/file-text';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';

  type Props = {
    row: LayerResultRow;
    onEditOutput?: (layerIndex: number, newOutput: string) => void;
    onRerunFromHere?: (layerIndex: number) => void;
    canRerun?: boolean;
  };
  let {
    row,
    onEditOutput = () => {},
    onRerunFromHere = () => {},
    canRerun = false
  }: Props = $props();

  let copied = $state(false);
  let editing = $state(false);
  let draft = $state('');
  let showPrompt = $state(false);

  const isExecuted = $derived(row.techniqueId === '__execute__');
  const refusal = $derived(row.error ? { detected: false } : detectRefusal(row.output));

  async function copy() {
    await navigator.clipboard.writeText(row.output);
    copied = true;
    setTimeout(() => { copied = false; }, 1500);
  }

  function startEdit() {
    draft = row.output;
    editing = true;
  }

  function saveEdit() {
    onEditOutput(row.layerIndex, draft);
    editing = false;
  }

  function cancelEdit() {
    editing = false;
  }

  function formatMs(ms: number): string {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
</script>

<details open class="group rounded-md border border-border/50 bg-card">
  <summary class="flex cursor-pointer select-none list-none items-center justify-between gap-2 px-3 py-2">
    <div class="flex min-w-0 items-center gap-2">
      <span class="shrink-0 text-[10px] font-semibold text-muted-foreground">
        Layer {row.layerIndex + 1}
      </span>
      <span class={isExecuted
        ? 'truncate rounded px-1.5 py-0.5 text-[10px] font-semibold bg-primary/15 text-primary'
        : 'truncate text-xs font-medium text-foreground'}>
        {row.techniqueName}
      </span>
      {#if !isExecuted}
        <code class="hidden shrink-0 text-[9px] text-muted-foreground sm:inline">{row.techniqueId}</code>
      {/if}
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <span class="text-[10px] text-muted-foreground">{formatTime(row.startedAt)} · {formatMs(row.durationMs)}</span>
      {#if !row.error}
        {#if row.finalPrompt}
          <button
            type="button"
            onclick={(e) => { e.preventDefault(); showPrompt = !showPrompt; }}
            aria-label="Show prompt for layer {row.layerIndex + 1}"
            title="Show the exact prompt sent to the LLM"
            class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            class:text-foreground={showPrompt}
          >
            <FileText size={12} />
          </button>
        {/if}
        <button
          type="button"
          onclick={(e) => { e.preventDefault(); startEdit(); }}
          aria-label="Edit layer {row.layerIndex + 1} output"
          title="Edit output — next layer picks up edited text"
          class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          onclick={(e) => { e.preventDefault(); copy(); }}
          aria-label="Copy layer {row.layerIndex + 1} output"
          class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          {#if copied}
            <Check size={12} class="text-green-500" />
          {:else}
            <Copy size={12} />
          {/if}
        </button>
      {/if}
    </div>
  </summary>

  <div class="flex flex-col gap-2 border-t border-border/40 px-3 py-2">
    {#if row.error}
      <div class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
        <AlertCircle size={13} class="mt-0.5 shrink-0" />
        <span>{row.error}</span>
      </div>
    {:else}
      {#if refusal.detected}
        <div class="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-400">
          <AlertTriangle size={13} class="mt-0.5 shrink-0" />
          <span>
            <span class="font-semibold">Refusal detected ({refusal.reason}).</span>
            Try pivoting to a different technique or editing this layer's output below.
          </span>
        </div>
      {/if}

      {#if editing}
        <textarea
          bind:value={draft}
          rows="6"
          class="w-full resize-y rounded-md border border-primary/40 bg-background px-2 py-1 font-mono text-xs text-foreground outline-none focus:border-primary cryptex-scroll"
        ></textarea>
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={saveEdit}
            class="rounded-md bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            Save edit
          </button>
          <button
            type="button"
            onclick={cancelEdit}
            class="rounded-md border border-border/50 px-3 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            Cancel
          </button>
          {#if canRerun}
            <button
              type="button"
              onclick={() => onRerunFromHere(row.layerIndex)}
              class="ml-auto inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] text-primary hover:bg-primary/20"
            >
              <RefreshCw size={10} /> Re-run from here
            </button>
          {/if}
        </div>
      {:else}
        <pre class="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs text-foreground cryptex-scroll">{row.output}</pre>
      {/if}

      {#if showPrompt && row.finalPrompt}
        <div class="flex flex-col gap-1 rounded-md border border-border/40 bg-background/60 p-2">
          <span class="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Exact prompt sent to LLM</span>
          <pre class="max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] text-muted-foreground cryptex-scroll">{row.finalPrompt}</pre>
        </div>
      {/if}
    {/if}
  </div>
</details>
