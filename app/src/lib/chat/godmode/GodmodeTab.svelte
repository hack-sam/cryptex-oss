<script lang="ts">
  import { onMount } from 'svelte';
  import type { ChatRow, GodmodeConfig, GodmodeRunRow, GodmodeCandidateRecord } from '$lib/chat/types';
  import type { EngineEvent, SynthesizeResult } from './types';
  import type { TechniqueDNA } from './dna';
  import type { RefusalTier } from '../attack-chain-refusal';
  import { runGodmode } from './client';
  import { saveAsTechnique } from './synthesizer-client';
  import { injectGodmodeTurn } from '$lib/chat/dispatch';
  import { repo } from '$lib/chat/repo';
  import { session } from '$lib/auth/session.svelte';

  type Props = {
    chat: ChatRow;
    onNotify: (kind: 'info' | 'error', text: string) => void;
  };
  let { chat, onNotify }: Props = $props();

  const persisted: GodmodeConfig | undefined = chat.settings.godmodeConfig;

  // Form state — hydrated from persisted config when present.
  let task = $state(persisted?.task ?? '');
  let K = $state<3 | 6 | 12>(persisted?.K ?? 6);
  let saveName = $state(persisted?.saveForm.name ?? '');
  let saveDecompose = $state(persisted?.saveForm.decompose ?? false);
  let saveExpanded = $state(persisted?.saveForm.expanded ?? false);

  // Run lifecycle state.
  let running = $state(false);
  let controller: AbortController | null = null;

  // Per-run in-memory records. Keyed by index (0..K-1) for O(1) updates.
  type CandidateState = {
    idx: number;
    dna: TechniqueDNA | null;
    status: 'running' | 'scored' | 'failed';
    score?: number;
    tier?: RefusalTier;
    preview?: string;
    confidence?: 'high' | 'low';
    response?: string;            // populated ONLY for the winner; losers have only preview
    error?: string;
  };
  let candidates = $state<CandidateState[]>([]);
  let winner = $state<{ idx: number; response: string; dna: TechniqueDNA; tier: RefusalTier } | null>(null);
  let planned = $state<TechniqueDNA[] | null>(null);
  let runError = $state<{ code: string; message: string } | null>(null);
  let doneAt = $state<number | null>(null);

  // Save-as-technique state.
  let saving = $state(false);
  let saveResult = $state<SynthesizeResult | null>(null);
  let saveError = $state<string | null>(null);

  // History state — hydrated onMount, refreshed after save.
  let history = $state<GodmodeRunRow[]>([]);

  // Per-chat models — reads from tab config, falls back to chat's model.
  const effectiveModel = $derived(chat.settings.godmodeConfig?.modelQualifiedId ?? chat.modelQualifiedId);

  onMount(async () => {
    try {
      history = await repo.listGodmodeRuns(chat.id);
    } catch (err) {
      console.error('[godmode-tab] history load failed:', err);
    }
  });

  // Debounced persist — mirrors AttackChainTab. Fires 500ms after any
  // tracked field change. We deliberately persist form-only (task/K/
  // saveForm); model lives in the parent and is persisted there.
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let hydratedOnce = false;
  $effect(() => {
    void task;
    void K;
    void saveName;
    void saveDecompose;
    void saveExpanded;
    if (!hydratedOnce) { hydratedOnce = true; return; }
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => { void persistConfig(); }, 500);
    return () => { if (persistTimer) clearTimeout(persistTimer); };
  });

  async function persistConfig() {
    const config: GodmodeConfig = {
      task,
      K,
      modelQualifiedId: chat.settings.godmodeConfig?.modelQualifiedId,
      saveForm: { expanded: saveExpanded, name: saveName, decompose: saveDecompose }
    };
    try {
      const fresh = await repo.getChat(chat.id);
      const base = fresh?.settings ?? chat.settings;
      await repo.updateChat(chat.id, {
        settings: { ...base, godmodeConfig: { ...config, modelQualifiedId: base.godmodeConfig?.modelQualifiedId } }
      });
    } catch (err) {
      console.error('[godmode-tab] persist failed:', err);
    }
  }

  async function go() {
    if (running) return;
    candidates = [];
    winner = null;
    planned = null;
    runError = null;
    doneAt = null;
    running = true;
    const started = Date.now();
    controller = new AbortController();
    try {
      const jwt = session.supabaseSession?.access_token;
      if (!jwt) {
        runError = { code: 'no_session', message: 'Not signed in. Godmode requires an authenticated session.' };
        return;
      }
      for await (const e of runGodmode({
        task,
        K,
        model: effectiveModel,
        jwt,
        signal: controller.signal
      })) {
        applyEvent(e);
      }
      // Stream ended — if we got a winner, persist to history.
      // Capture winner into a local const so TS narrowing survives the
      // ensuing awaits. TS flow-analysis narrows `winner` to `null` at
      // this point (it can't track closure writes from `applyEvent`);
      // the cast widens back to the declared $state type.
      const w = winner as { idx: number; response: string; dna: TechniqueDNA; tier: RefusalTier } | null;
      if (w) {
        try {
          const successful: GodmodeCandidateRecord[] = candidates
            .filter((c): c is CandidateState & { dna: TechniqueDNA; score: number; tier: RefusalTier; preview: string } =>
              c.status === 'scored' && !!c.dna && c.score !== undefined && !!c.tier && c.preview !== undefined)
            .map((c) => ({
              dna: c.dna,
              response: c.response ?? c.preview,
              score: c.score,
              tier: c.tier,
              preview: c.preview
            }));
          const matched = candidates.find((c) => c.idx === w.idx && c.status === 'scored');
          if (!matched) console.warn('[godmode-tab] winner idx not in successful list — score unknown', w.idx);
          const winnerRecord: GodmodeCandidateRecord = {
            dna: w.dna,
            response: w.response,
            score: matched?.score ?? -1,
            tier: w.tier,
            preview: w.response.slice(0, 120)
          };
          const row = await repo.saveGodmodeRun({
            chatId: chat.id,
            task,
            K,
            modelId: effectiveModel,
            winner: winnerRecord,
            candidates: successful
          });
          history = [row, ...history];
        } catch (err) {
          console.error('[godmode-tab] save run failed:', err);
          onNotify('error', 'Run history save failed');
        }
      }
    } catch (err) {
      runError = { code: 'client_error', message: String(err) };
    } finally {
      running = false;
      controller = null;
      doneAt = Date.now() - started;
    }
  }

  function applyEvent(e: EngineEvent) {
    switch (e.type) {
      case 'plan':
        planned = e.dnas;
        candidates = e.dnas.map((d, i) => ({ idx: i, dna: d, status: 'running' as const }));
        break;
      case 'candidate_started':
        // idempotent — row already created in 'plan'
        candidates = candidates.map((c) => c.idx === e.idx ? { ...c, dna: e.dna, status: 'running' } : c);
        break;
      case 'candidate_scored':
        candidates = candidates.map((c) => c.idx === e.idx ? {
          ...c,
          status: 'scored',
          score: e.score,
          tier: e.tier,
          preview: e.preview,
          confidence: e.confidence
        } : c);
        break;
      case 'candidate_failed':
        candidates = candidates.map((c) => c.idx === e.idx ? { ...c, status: 'failed', error: `${e.reason}${e.detail ? ': ' + e.detail : ''}` } : c);
        break;
      case 'winner':
        winner = { idx: e.idx, response: e.response, dna: e.dna, tier: e.tier };
        candidates = candidates.map((c) => c.idx === e.idx ? { ...c, response: e.response } : c);
        break;
      case 'done':
        break;
      case 'error':
        runError = { code: e.code, message: e.message };
        break;
    }
  }

  function stop() {
    controller?.abort();
  }

  async function save() {
    if (saving || !task.trim() || !saveName.trim()) return;
    saving = true;
    saveError = null;
    saveResult = null;
    try {
      const jwt = session.supabaseSession?.access_token;
      if (!jwt) { saveError = 'Not signed in.'; return; }
      saveResult = await saveAsTechnique({ prompt: task, name: saveName, decompose: saveDecompose, jwt });
      window.dispatchEvent(new CustomEvent('registry:refresh-custom'));
    } catch (err) {
      saveError = String(err);
    } finally {
      saving = false;
    }
  }

  async function promoteWinner() {
    if (!winner) return;
    try {
      await injectGodmodeTurn(chat.id, {
        task,
        winningResponse: winner.response,
        winningDna: winner.dna,
        modelId: effectiveModel,
        durationMs: doneAt ?? 0
      });
      onNotify('info', 'Sent to main chat');
    } catch (err) {
      onNotify('error', 'Promote failed: ' + String(err));
    }
  }

  async function promoteCandidate(c: CandidateState) {
    if (!c.dna || !c.response) {
      onNotify('error', 'Can only promote scored candidates with a response');
      return;
    }
    try {
      await injectGodmodeTurn(chat.id, {
        task,
        winningResponse: c.response,
        winningDna: c.dna,
        modelId: effectiveModel
      });
      onNotify('info', 'Sent to main chat');
    } catch (err) {
      onNotify('error', 'Promote failed: ' + String(err));
    }
  }

  async function promoteHistory(row: GodmodeRunRow, record: GodmodeCandidateRecord) {
    try {
      await injectGodmodeTurn(chat.id, {
        task: row.task,
        winningResponse: record.response,
        winningDna: record.dna,
        modelId: row.modelId
      });
      onNotify('info', 'Sent to main chat');
    } catch (err) {
      onNotify('error', 'Promote failed: ' + String(err));
    }
  }

  async function deleteRun(id: string) {
    try {
      await repo.deleteGodmodeRun(id);
      history = history.filter((r) => r.id !== id);
    } catch (err) {
      console.error('[godmode-tab] delete run failed:', err);
    }
  }

  // Ctrl/Cmd+Enter → run. Only active when the task textarea is focused.
  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !running && task.trim()) {
      e.preventDefault();
      void go();
    }
  }

  const runningCount = $derived(candidates.filter((c) => c.status === 'running').length);
  const scoredCount = $derived(candidates.filter((c) => c.status === 'scored').length);
</script>

<div class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
  <!-- Task input -->
  <label class="flex flex-col gap-1 text-xs">
    <span class="font-medium text-foreground">Task</span>
    <textarea
      bind:value={task}
      rows="4"
      placeholder="What do you want godmode to do?"
      onkeydown={handleKeydown}
      class="resize-y rounded-md border border-border/40 bg-background/40 p-2 font-mono text-xs focus:border-border focus:outline-none"
    ></textarea>
    <span class="text-[10px] text-muted-foreground">Cmd/Ctrl+Enter to run</span>
  </label>

  <!-- K pills -->
  <label class="flex flex-col gap-1 text-xs">
    <span class="font-medium text-foreground">Candidates (K)</span>
    <div class="flex gap-1">
      {#each [3, 6, 12] as k}
        <button
          type="button"
          onclick={() => (K = k as 3 | 6 | 12)}
          class={K === k
            ? 'rounded-full border border-primary/60 bg-primary/20 px-3 py-1 text-xs text-primary'
            : 'rounded-full border border-border/40 bg-transparent px-3 py-1 text-xs text-muted-foreground hover:border-border/70 hover:text-foreground'}
        >{k}</button>
      {/each}
    </div>
  </label>

  <!-- Actions -->
  <div class="flex gap-2">
    {#if running}
      <button type="button" onclick={stop} class="inline-flex items-center gap-1 rounded-md border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Stop</button>
    {:else}
      <button type="button" onclick={go} disabled={!task.trim()} class="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">Run godmode</button>
    {/if}
    {#if running}
      <span class="text-[11px] text-muted-foreground">{runningCount} running · {scoredCount} scored</span>
    {/if}
  </div>

  <!-- Status strip -->
  {#if runError}
    <div role="alert" class="rounded-md border border-orange-500/40 bg-orange-500/10 p-2 text-xs text-orange-400">
      <strong>{runError.code}:</strong> {runError.message}
    </div>
  {/if}
  {#if planned && !running && !runError}
    <div class="text-[11px] text-muted-foreground">Done · {scoredCount}/{candidates.length} scored{doneAt ? ` · ${doneAt}ms` : ''}</div>
  {/if}

  <!-- Candidate rows — placeholder until Task 7 lands CandidateRow -->
  {#if candidates.length > 0}
    <ul class="flex flex-col gap-1 text-xs">
      {#each candidates as c (c.idx)}
        <li class="rounded border border-border/40 px-2 py-1">
          <span class="font-mono text-[10px] text-muted-foreground">#{c.idx}</span>
          <span class="ml-2">{c.status}</span>
          {#if c.tier}<span class="ml-2 text-[10px] uppercase">{c.tier}</span>{/if}
          {#if c.score !== undefined}<span class="ml-2 text-[10px]">{c.score.toFixed(2)}</span>{/if}
          {#if c.error}<span class="ml-2 text-orange-400">{c.error}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}

  <!-- Winner card — placeholder until Task 8 lands WinnerCard -->
  {#if winner}
    <div class="rounded-md border border-border/40 bg-background/40 p-3">
      <div class="mb-2 flex items-center gap-2 text-xs">
        <span class="uppercase tracking-wide text-muted-foreground">Winner</span>
        <span class="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] text-primary">{winner.tier}</span>
      </div>
      <pre class="whitespace-pre-wrap text-xs">{winner.response}</pre>
      <div class="mt-2 flex gap-2">
        <button type="button" onclick={promoteWinner} class="rounded border border-border/40 px-2 py-1 text-[10px] hover:bg-muted/40">Send to main chat</button>
      </div>
    </div>
  {/if}

  <!-- History — placeholder until Task 9 lands GodmodeHistoryPanel -->
  {#if history.length > 0}
    <details class="rounded-md border border-border/40 p-2 text-xs">
      <summary class="cursor-pointer text-muted-foreground">History ({history.length})</summary>
      <ul class="mt-2 flex flex-col gap-1">
        {#each history as r (r.id)}
          <li class="rounded border border-border/40 px-2 py-1">
            <span class="text-[10px] text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
            <span class="ml-2">{r.task.slice(0, 60)}</span>
            <button type="button" onclick={() => promoteHistory(r, r.winner)} class="ml-2 text-[10px] underline">send</button>
            <button type="button" onclick={() => deleteRun(r.id)} class="ml-2 text-[10px] text-destructive">delete</button>
          </li>
        {/each}
      </ul>
    </details>
  {/if}

  <!-- Save as custom technique — unchanged from panel.svelte -->
  <div class="border-t border-border/40 pt-3">
    <button
      type="button"
      onclick={() => (saveExpanded = !saveExpanded)}
      aria-expanded={saveExpanded}
      class="text-xs text-muted-foreground hover:text-foreground"
    >{saveExpanded ? '▾' : '▸'} Save as custom technique</button>

    {#if saveExpanded}
      <div class="mt-2 flex flex-col gap-2 text-xs">
        <label class="flex flex-col gap-1">
          <span>Name</span>
          <input type="text" bind:value={saveName} placeholder="e.g. my-research-framing" maxlength="128" class="rounded border border-border/40 bg-background/40 px-2 py-1" />
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" bind:checked={saveDecompose} />
          <span>Decompose into per-DNA-axis rows</span>
        </label>
        <div>
          <button type="button" onclick={save} disabled={saving || !task.trim() || !saveName.trim()} class="rounded border border-border/40 px-3 py-1 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {#if saveError}<div role="alert" class="text-orange-400">{saveError}</div>{/if}
        {#if saveResult}
          <div class="rounded border border-border/40 bg-muted/20 p-2">
            <div><strong>Rows created:</strong> {saveResult.rowIds.length} (mode: {saveResult.analysis.mode}, confidence: {saveResult.analysis.confidence})</div>
            <div><strong>Why it works:</strong> {saveResult.analysis.why_it_works}</div>
            {#if saveResult.fallback}
              <div class="text-orange-400"><strong>Fallback:</strong> {saveResult.fallback}</div>
            {/if}
            {#if saveResult.analysis.strategy_tags.length}
              <div class="flex flex-wrap gap-1">
                <strong class="mr-1">Tags:</strong>
                {#each saveResult.analysis.strategy_tags as t}
                  <span class="rounded bg-muted/40 px-1 py-0.5 text-[10px]">{t}</span>
                {/each}
              </div>
            {/if}
            {#if saveResult.analysis.shibboleth}
              <div class="text-orange-400">
                <strong>Shibboleths detected</strong> ({saveResult.analysis.shibboleth.detected.length}):
                {saveResult.analysis.shibboleth.rewrote ? 'rewritten' : 'left in place'}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
