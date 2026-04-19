<script lang="ts">
  import { onMount } from 'svelte';
  import { runChain, buildLayerPrompt } from '$lib/chat/attack-chain';
  import type { LayerResultRow } from '$lib/chat/attack-chain';
  import type { ChatRow, AttackChainRunRow, AttackChainConfig } from '$lib/chat/types';
  import { repo } from '$lib/chat/repo';
  import { customPresets } from '$lib/chat/customPresets.svelte';
  import { chat as gatewayChat } from '$lib/ai/gateway';
  import { injectAttackChainTurn } from '$lib/chat/dispatch';
  import type { ChatMessage } from '$lib/ai/types';
  import LayerPicker from './LayerPicker.svelte';
  import LayerResult from './LayerResult.svelte';
  import PresetPicker from './PresetPicker.svelte';
  import HistoryPanel from './HistoryPanel.svelte';
  import Plus from 'lucide-svelte/icons/plus';
  import Play from 'lucide-svelte/icons/play';
  import Square from 'lucide-svelte/icons/square';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import Eye from 'lucide-svelte/icons/eye';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import Save from 'lucide-svelte/icons/save';
  import Check from 'lucide-svelte/icons/check';
  import X from 'lucide-svelte/icons/x';

  type Props = {
    open: boolean;
    chat: ChatRow;
    onClose: () => void;
    onInsertToComposer: (text: string) => void;
  };
  // `open` is passed but the parent controls visibility — this component
  // always renders when mounted; caller unmounts via `{#if open}`.
  let { chat, onClose, onInsertToComposer }: Props = $props();

  const MAX_LAYERS = 4;

  // Hydrate initial state from the persisted chat.settings.attackChainConfig.
  // If absent (new chat or pre-persistence chat), fall back to defaults.
  const persisted = chat.settings.attackChainConfig;

  let input = $state(persisted?.input ?? '');
  let layers = $state<string[]>(persisted?.layers ? [...persisted.layers] : ['', '']);
  let layerParams = $state<Array<Record<string, unknown>>>(
    persisted?.layerParams ? persisted.layerParams.map((p) => ({ ...p })) : [{}, {}]
  );
  let layerOutputEdits = $state<Array<string | null>>(
    persisted?.layerOutputEdits ? [...persisted.layerOutputEdits] : [null, null]
  );
  let results = $state<LayerResultRow[]>([]);
  let running = $state(false);
  let ctrl = $state<AbortController | null>(null);
  let previewText = $state<string | null>(null);
  let executeEnabled = $state(persisted?.executeEnabled ?? true);
  let finalSystemPrompt = $state(persisted?.finalSystemPrompt ?? '');
  let finalSystemPromptOpen = $state(false);
  // Auto-retry: on refusal detection, swap to a curated fallback technique
  // and re-run that layer before moving on. See attack-chain.ts FALLBACK_ORDER.
  let autoRetryEnabled = $state(persisted?.autoRetryEnabled ?? true);

  // Run history for this chat — populated on mount and refreshed on each
  // successful run / delete.
  let history = $state<AttackChainRunRow[]>([]);

  // Transient "Inserted" badge — shown for ~1.5s after a send-back button
  // fires. We keep the drawer open so the user can tweak + re-run.
  let insertedFlash = $state<'assistant' | 'composer' | null>(null);
  let insertedFlashTimer: ReturnType<typeof setTimeout> | null = null;

  // Save-as-preset inline editor state.
  let savePresetOpen = $state(false);
  let savePresetName = $state('');
  let savedPresetFlash = $state(false);
  let savedPresetFlashTimer: ReturnType<typeof setTimeout> | null = null;

  // Debounced persistence — 500ms after the last state change we mirror the
  // drawer config onto chat.settings.attackChainConfig so reopening the
  // drawer rehydrates from the same spot. Initial hydration already ran
  // above, so we skip the first effect invocation to avoid a no-op write.
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let hydratedOnce = false;

  onMount(async () => {
    try {
      history = await repo.listAttackChainRuns(chat.id);
    } catch (err) {
      console.error('[attack-chain] history load failed:', err);
    }
  });

  $effect(() => {
    // Touch every persisted field so Svelte tracks all of them.
    void input;
    void layers;
    void layerParams;
    void layerOutputEdits;
    void executeEnabled;
    void finalSystemPrompt;
    void autoRetryEnabled;

    if (!hydratedOnce) {
      hydratedOnce = true;
      return;
    }

    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      void persistConfig();
    }, 500);

    return () => {
      if (persistTimer) clearTimeout(persistTimer);
    };
  });

  async function persistConfig() {
    const config: AttackChainConfig = {
      input,
      layers: [...layers],
      layerParams: layerParams.map((p) => ({ ...p })),
      layerOutputEdits: [...layerOutputEdits],
      executeEnabled,
      finalSystemPrompt,
      autoRetryEnabled
    };
    try {
      // Re-read from DB so we merge against the latest settings (other
      // chat settings — mode, sampling knobs — may have changed between
      // the debounce tick and this write).
      const fresh = await repo.getChat(chat.id);
      const base = fresh?.settings ?? chat.settings;
      await repo.updateChat(chat.id, {
        settings: { ...base, attackChainConfig: config }
      });
    } catch (err) {
      console.error('[attack-chain] persist failed:', err);
    }
  }

  function flashInserted(which: 'assistant' | 'composer') {
    if (insertedFlashTimer) clearTimeout(insertedFlashTimer);
    insertedFlash = which;
    insertedFlashTimer = setTimeout(() => {
      insertedFlash = null;
    }, 1500);
  }

  const canRun = $derived(
    input.trim().length > 0 &&
    layers.length >= 2 &&
    layers.every((id) => id.trim().length > 0) &&
    !running
  );

  // The executed final row (successful __execute__ layer). Null if absent or errored.
  const executedRow = $derived(
    results.find((r) => r.techniqueId === '__execute__' && !r.error) ?? null
  );

  // The last non-execute successful layer's output — i.e. the fully-mutated
  // prompt that was sent to the model. Shown on the "Insert mutated prompt
  // into composer" button.
  const mutatedOutput = $derived(
    (() => {
      const nonExec = results.filter((r) => r.techniqueId !== '__execute__' && !r.error);
      return nonExec.length > 0 ? nonExec[nonExec.length - 1].output : null;
    })()
  );

  const chainDirty = $derived(layers.some((id) => id.trim().length > 0));

  function addLayer() {
    if (layers.length < MAX_LAYERS) {
      layers = [...layers, ''];
      layerParams = [...layerParams, {}];
      layerOutputEdits = [...layerOutputEdits, null];
    }
  }

  function removeLayer(i: number) {
    layers = layers.filter((_, idx) => idx !== i);
    layerParams = layerParams.filter((_, idx) => idx !== i);
    layerOutputEdits = layerOutputEdits.filter((_, idx) => idx !== i);
  }

  function setLayer(i: number, id: string) {
    layers = layers.map((v, idx) => (idx === i ? id : v));
    // Clear params when the technique changes — different schemas.
    layerParams = layerParams.map((p, idx) => (idx === i ? {} : p));
  }

  function setLayerParams(i: number, p: Record<string, unknown>) {
    layerParams = layerParams.map((v, idx) => (idx === i ? p : v));
  }

  function applyPreset(ids: string[], params?: Array<Record<string, unknown>>) {
    layers = ids.slice(0, MAX_LAYERS);
    layerParams = layers.map((_, i) => ({ ...(params?.[i] ?? {}) }));
    layerOutputEdits = layers.map(() => null);
    results = [];
  }

  function saveCurrentAsPreset() {
    const trimmed = savePresetName.trim();
    if (trimmed.length === 0) return;
    const activeLayers = layers.filter((id) => id.trim().length > 0);
    if (activeLayers.length < 2) return;
    // Pair each saved layer with its params, trimming to the active layers.
    const activeParams: Array<Record<string, unknown>> = [];
    for (let i = 0; i < layers.length; i++) {
      if (layers[i].trim().length === 0) continue;
      activeParams.push({ ...(layerParams[i] ?? {}) });
    }
    customPresets.save({
      name: trimmed,
      layers: activeLayers,
      layerParams: activeParams
    });
    savePresetName = '';
    savePresetOpen = false;
    if (savedPresetFlashTimer) clearTimeout(savedPresetFlashTimer);
    savedPresetFlash = true;
    savedPresetFlashTimer = setTimeout(() => { savedPresetFlash = false; }, 1500);
  }

  function cancelSavePreset() {
    savePresetOpen = false;
    savePresetName = '';
  }

  async function restoreRun(run: AttackChainRunRow) {
    input = run.input;
    layers = [...run.layers];
    layerParams = run.layerParams.map((p) => ({ ...p }));
    layerOutputEdits = run.layers.map(() => null);
    finalSystemPrompt = run.finalSystemPrompt ?? '';
    executeEnabled = run.executeEnabled;
    results = [];
    // Persist immediately so the restore is durable even before the debounce.
    await persistConfig();
  }

  async function deleteRun(id: string) {
    try {
      await repo.deleteAttackChainRun(id);
      history = history.filter((r) => r.id !== id);
    } catch (err) {
      console.error('[attack-chain] delete run failed:', err);
    }
  }

  function ctxFor(signal: AbortSignal) {
    const modelId = chat.modelQualifiedId;
    // Explicit max_tokens so providers (especially OpenRouter-routed ones
    // that default to ~512 when unset) don't silently truncate mutator
    // rewrites or the final execute turn mid-response. Users can raise this
    // via chat.settings.maxTokens; 4096 is a safe floor that every modern
    // model accepts without rejection.
    const maxTokens = chat.settings.maxTokens ?? 4096;
    return {
      model: modelId,
      callLLM: async (req: { system?: string; user: string; temperature?: number }) => {
        const msgs: ChatMessage[] = [];
        if (req.system) msgs.push({ role: 'system' as const, content: req.system });
        msgs.push({ role: 'user' as const, content: req.user });
        const resp = await gatewayChat({
          model: modelId,
          messages: msgs,
          temperature: req.temperature,
          max_tokens: maxTokens,
          signal
        });
        return resp.content;
      },
      signal
    };
  }

  async function run() {
    if (!canRun) return;
    results = [];
    previewText = null;
    running = true;
    const abort = new AbortController();
    ctrl = abort;

    const ctx = ctxFor(abort.signal);

    try {
      for await (const row of runChain(
        input,
        layers,
        layerParams,
        ctx,
        abort.signal,
        layerOutputEdits,
        { enabled: executeEnabled, systemPrompt: finalSystemPrompt.trim() || undefined },
        { enabled: autoRetryEnabled }
      )) {
        results = [...results, row];
        // Non-retry errors stop the chain. Refusal-retry rows also carry an
        // `error` field but their layerIndex will be re-emitted on the next
        // attempt — the runner itself decides whether to continue. Don't
        // break on every error here; the generator's completion signals end.
      }
    } finally {
      running = false;
      ctrl = null;
      // Persist the run to history so the user can recover prior chains.
      // We only save if the user actually produced results (no rows means
      // they cancelled before anything yielded, not worth a history row).
      if (results.length > 0 && !abort.signal.aborted) {
        void persistRunToHistory();
      } else if (results.length > 0) {
        // Cancelled mid-chain still produced results — still persist so the
        // user can come back to it; tag with "cancelled" via finalOutput=null.
        void persistRunToHistory();
      }
    }
  }

  async function persistRunToHistory() {
    try {
      const executed = results.find((r) => r.techniqueId === '__execute__' && !r.error) ?? null;
      const nonExec = results.filter((r) => r.techniqueId !== '__execute__' && !r.error);
      const lastMutated = nonExec.length > 0 ? nonExec[nonExec.length - 1].output : undefined;
      const finalOutput = executed?.output ?? lastMutated;
      const row = await repo.saveAttackChainRun({
        chatId: chat.id,
        inputText: input,
        layers: [...layers],
        layerParams: layerParams.map((p) => ({ ...p })),
        finalSystemPrompt: finalSystemPrompt.trim() || undefined,
        executeEnabled,
        results: results.map((r) => ({
          layerIndex: r.layerIndex,
          attempt: r.attempt,
          techniqueId: r.techniqueId,
          techniqueName: r.techniqueName,
          input: r.input,
          output: r.output,
          startedAt: r.startedAt,
          durationMs: r.durationMs,
          error: r.error,
          finalPrompt: r.finalPrompt
        })),
        finalOutput
      });
      history = [row, ...history].slice(0, 50);
    } catch (err) {
      console.error('[attack-chain] persistRunToHistory failed:', err);
    }
  }

  function abort() {
    ctrl?.abort();
  }

  /** Dry-run: for each layer that has a buildable prompt, concatenate a
   * preview. Layers whose prompt can't be built (cipher, composite) show
   * a placeholder so the user knows they'll be assembled at runtime. */
  function previewFinalPrompt() {
    const lines: string[] = [];
    for (let i = 0; i < layers.length; i++) {
      const id = layers[i];
      if (!id) continue;
      const p = buildLayerPrompt(id, i === 0 ? input : `<output of layer ${i}>`, layerParams[i] ?? {});
      lines.push(`--- Layer ${i + 1} (${id}) ---`);
      lines.push(p ?? '(dynamic prompt — assembled at runtime; no static preview available)');
      lines.push('');
    }
    previewText = lines.join('\n');
  }

  function handleEditOutput(layerIndex: number, newOutput: string) {
    // The edit replaces the input for the *next* layer when re-run.
    const nextIndex = layerIndex + 1;
    if (nextIndex < layerOutputEdits.length) {
      layerOutputEdits = layerOutputEdits.map((v, idx) => (idx === nextIndex ? newOutput : v));
    }
    // Also update the locally displayed row so the edit persists visually.
    results = results.map((r) =>
      r.layerIndex === layerIndex ? { ...r, output: newOutput } : r
    );
  }

  function handleRerun(layerIndex: number) {
    // Truncate results to just before the edited layer, then re-run the chain
    // from there. We reset `input` only for the first layer; subsequent layers
    // pick up the override from layerOutputEdits[layerIndex].
    results = results.filter((r) => r.layerIndex < layerIndex);
    run();
  }

  async function injectAssistantReply(content: string) {
    // Persist the attack-chain run as a user+assistant pair so the Dataset
    // Inspector can surface it. The user message carries the raw typed
    // input AND the fully-mutated prompt; toolCalls stores per-layer
    // trace (primary + refusal-retry attempts) with source='attack-chain'.
    const mutated = mutatedOutput ?? content;
    const layerTrace = results
      .filter((r) => r.techniqueId !== '__execute__')
      .map((r) => ({
        layerIndex: r.layerIndex,
        attempt: r.attempt ?? 0,
        techniqueId: r.techniqueId,
        techniqueName: r.techniqueName,
        input: r.input,
        output: r.output,
        error: r.error,
        durationMs: r.durationMs
      }));
    try {
      await injectAttackChainTurn(chat.id, {
        input,
        mutatedPrompt: mutated,
        modelResponse: content,
        finalSystemPrompt: finalSystemPrompt.trim() || undefined,
        modelId: chat.modelQualifiedId,
        layers: layerTrace
      });
    } catch (err) {
      alert('Failed to inject response: ' + (err as Error).message);
    }
  }
</script>

<aside
  class="flex h-full w-[440px] shrink-0 flex-col border-l border-border/50 bg-card/30 backdrop-blur-sm"
  aria-label="Attack Chain"
>
  <!-- Header -->
  <div class="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border/50 bg-card/80 px-4 py-3">
    <div class="flex flex-col">
      <span class="text-sm font-semibold text-foreground">Attack Chain</span>
      <span class="text-[10px] text-muted-foreground">Layered technique composition</span>
    </div>
    <button
      type="button"
      onclick={onClose}
      aria-label="Close Attack Chain"
      class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
    >
      <X size={14} />
    </button>
  </div>

  <!-- Body -->
  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 cryptex-scroll">
    <!-- Presets -->
    <PresetPicker isDirty={chainDirty} onApply={applyPreset} />

    <!-- History -->
    <HistoryPanel runs={history} onRestore={restoreRun} onDelete={deleteRun} />

    <!-- Input -->
    <div class="flex flex-col gap-1">
      <label for="chain-input" class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Input prompt
      </label>
      <textarea
        id="chain-input"
        bind:value={input}
        rows="4"
        placeholder="Paste the raw attack prompt to layer through the chain…"
        class="w-full resize-none rounded-md border border-border/50 bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 cryptex-scroll"
      ></textarea>
    </div>

    <!-- Layer chain -->
    <div class="flex flex-col gap-2">
      <span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Chain ({layers.length}/{MAX_LAYERS} layers)
      </span>
      {#each layers as id, i (i)}
        <LayerPicker
          index={i}
          value={id}
          params={layerParams[i] ?? {}}
          onChange={(v) => setLayer(i, v)}
          onParamsChange={(p) => setLayerParams(i, p)}
          onRemove={() => removeLayer(i)}
        />
      {/each}
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onclick={addLayer}
          disabled={layers.length >= MAX_LAYERS}
          class="flex items-center gap-1.5 self-start rounded-md border border-dashed border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus size={12} /> Add layer
        </button>
        <button
          type="button"
          onclick={() => { savePresetOpen = !savePresetOpen; }}
          disabled={layers.filter((id) => id.trim().length > 0).length < 2}
          class="flex items-center gap-1.5 self-start rounded-md border border-dashed border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
          title="Save this chain as a reusable custom preset"
        >
          <Save size={12} />
          {savedPresetFlash ? 'Saved!' : 'Save as preset'}
        </button>
      </div>
      {#if savePresetOpen}
        <div class="flex flex-wrap items-center gap-1.5 rounded-md border border-border/40 bg-background/60 px-2 py-1.5">
          <input
            type="text"
            bind:value={savePresetName}
            placeholder="Preset name"
            onkeydown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); saveCurrentAsPreset(); }
              else if (e.key === 'Escape') { e.preventDefault(); cancelSavePreset(); }
            }}
            class="min-w-0 flex-1 rounded border border-border/50 bg-background px-2 py-1 text-xs outline-none focus:border-primary/60"
          />
          <button
            type="button"
            onclick={saveCurrentAsPreset}
            disabled={savePresetName.trim().length === 0}
            class="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            onclick={cancelSavePreset}
            class="rounded-md border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      {/if}
    </div>

    <!-- Execute + auto-retry toggles -->
    <div class="flex flex-col gap-1.5">
      <label class="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" bind:checked={executeEnabled} class="h-3.5 w-3.5 rounded accent-primary" />
        Execute final prompt against model and capture response
      </label>
      <label class="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" bind:checked={autoRetryEnabled} class="h-3.5 w-3.5 rounded accent-primary" />
        Auto-retry with fallback technique on refusal (max 4 attempts per layer)
      </label>
    </div>

    <!-- Optional system prompt for the final turn -->
    <details class="group rounded-md border border-border/40 bg-background/40 text-xs" bind:open={finalSystemPromptOpen}>
      <summary class="flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 text-muted-foreground hover:text-foreground">
        <ChevronRight size={11} class="transition-transform group-open:rotate-90" />
        <span>System prompt for final turn (optional)</span>
      </summary>
      <textarea
        bind:value={finalSystemPrompt}
        rows="3"
        placeholder="Inject a system header for the final model call, e.g. 'You are a security practitioner answering authorized technical questions.'"
        class="w-full resize-none rounded-b-md border-t border-border/40 bg-background px-3 py-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 cryptex-scroll"
      ></textarea>
    </details>

    <!-- Preview / Run / Cancel -->
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onclick={previewFinalPrompt}
        disabled={!canRun}
        class="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <Eye size={12} /> Preview final prompt
      </button>
      {#if running}
        <button
          type="button"
          onclick={abort}
          class="inline-flex items-center gap-1.5 rounded-md bg-destructive/90 px-4 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive"
        >
          <Square size={12} /> Cancel
        </button>
        <span class="text-xs text-muted-foreground">Running…</span>
      {:else}
        <button
          type="button"
          onclick={run}
          disabled={!canRun}
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
        >
          <Play size={12} /> Run chain
        </button>
      {/if}
    </div>

    {#if previewText}
      <div class="flex flex-col gap-1 rounded-md border border-border/40 bg-background/60 p-2">
        <div class="flex items-center justify-between">
          <span class="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Preview</span>
          <button
            type="button"
            onclick={() => (previewText = null)}
            class="text-[9px] text-muted-foreground hover:text-foreground"
          >
            dismiss
          </button>
        </div>
        <pre class="max-h-64 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] text-muted-foreground cryptex-scroll">{previewText}</pre>
      </div>
    {/if}

    <!-- Results -->
    {#if results.length > 0}
      <div class="flex flex-col gap-1.5">
        <span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Results</span>
        {#each results as row (`${row.layerIndex}-${row.attempt ?? 0}-${row.techniqueId}`)}
          <LayerResult
            {row}
            onEditOutput={handleEditOutput}
            onRerunFromHere={handleRerun}
            canRerun={!running}
          />
        {/each}
      </div>

      {#if executedRow}
        <button
          type="button"
          onclick={async () => {
            await injectAssistantReply(executedRow.output);
            flashInserted('assistant');
          }}
          class="flex items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          {#if insertedFlash === 'assistant'}
            <Check size={12} /> Inserted
          {:else}
            <ArrowRight size={12} /> Insert model response as assistant reply
          {/if}
        </button>
      {/if}
      {#if mutatedOutput !== null}
        <button
          type="button"
          onclick={() => { onInsertToComposer(mutatedOutput); flashInserted('composer'); }}
          class="flex items-center justify-center gap-1.5 rounded-md border border-border/50 px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
        >
          {#if insertedFlash === 'composer'}
            <Check size={12} /> Inserted
          {:else}
            <ArrowRight size={12} /> Insert mutated prompt into composer
          {/if}
        </button>
      {/if}
    {/if}
  </div>
</aside>
