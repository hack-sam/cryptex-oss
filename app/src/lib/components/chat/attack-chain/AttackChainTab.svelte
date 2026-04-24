<script lang="ts">
  import { onMount } from 'svelte';
  import type { ChatRow, AttackSessionRow, OrchEvent, StrategyLogEntry, AttackSessionTurn } from '$lib/chat/types';
  import { repo } from '$lib/chat/repo';
  import { runOrchestrator, type OrchestratorContext } from '$lib/chat/chain/orchestrator';
  import { injectAttackSessionTurn } from '$lib/chat/dispatch';
  import { chat as gatewayChat, streamChat } from '$lib/ai/gateway';
  import OrchestratorTurnBubble from './OrchestratorTurnBubble.svelte';
  import StrategyTraceBar from './StrategyTraceBar.svelte';
  import AttackSessionHistory from './AttackSessionHistory.svelte';
  import LayerPicker from './LayerPicker.svelte';
  import Play from 'lucide-svelte/icons/play';
  import Square from 'lucide-svelte/icons/square';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import Plus from 'lucide-svelte/icons/plus';

  type Props = {
    chat: ChatRow;
    // Declared for callsite API compat; unused in orchestrator-driven UI.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onInsertToComposer: (text: string) => void;
  };
  let { chat /*, onInsertToComposer */ }: Props = $props();

  // ---- Form state ----
  let objective = $state(chat.settings.attackChainConfig?.input ?? '');
  let maxAttempts = $state<number>(6);
  let hintLayers = $state<string[]>(chat.settings.attackChainConfig?.layers ?? []);

  // ---- Run state ----
  let running = $state(false);
  let ctrl: AbortController | null = null;
  let liveTurns = $state<AttackSessionTurn[]>([]);
  let liveLog = $state<StrategyLogEntry[]>([]);
  let currentSessionId = $state<string | null>(null);
  let finalOutcome = $state<AttackSessionRow['finalOutcome']>(null);
  let finalConfidence = $state<number | null>(null);
  let finalSummary = $state<string | null>(null);

  // ---- History ----
  let sessions = $state<AttackSessionRow[]>([]);
  onMount(async () => {
    try { sessions = await repo.listAttackSessions(chat.id); }
    catch (err) { console.error('[chain-tab] list sessions failed:', err); }
  });

  const canRun = $derived(objective.trim().length > 0 && !running);

  function updateHint(i: number, id: string) {
    hintLayers = hintLayers.map((h, idx) => (idx === i ? id : h));
  }
  function removeHint(i: number) {
    hintLayers = hintLayers.filter((_, idx) => idx !== i);
  }
  function addHint() {
    hintLayers = [...hintLayers, ''];
  }

  async function run() {
    if (!canRun) return;
    running = true;
    ctrl = new AbortController();
    liveTurns = [];
    liveLog = [];
    finalOutcome = null;
    finalConfidence = null;
    finalSummary = null;

    // Create the session row up front so mid-run updates can patch it.
    const orchestratorModelId = chat.settings.attackChainConfig?.modelQualifiedId ?? chat.modelQualifiedId;
    const targetModelId = orchestratorModelId;

    const session = await repo.saveAttackSession({
      chatId: chat.id,
      objective,
      targetModelId,
      orchestratorModelId,
      maxAttempts,
      turns: [],
      strategyLog: [],
      finalOutcome: null,
      finalConfidence: null,
      finalSummary: null
    });
    currentSessionId = session.id;

    // ---- Adapters over existing gateway ----
    const orchestratorClient = {
      async complete({ system, messages, tools, signal }: {
        system: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        tools: unknown;
        signal?: AbortSignal;
      }) {
        const out = await gatewayChat({
          model: orchestratorModelId,
          messages: [{ role: 'system', content: system }, ...messages],
          tools,
          toolChoice: 'required',
          max_tokens: 1500,
          signal
        } as never);
        const toolCalls = (out.toolCalls ?? []).map((tc) => ({
          name: (tc as { toolName?: string; name?: string }).toolName ?? (tc as { name?: string }).name ?? '',
          args: ((tc as { input?: Record<string, unknown>; args?: Record<string, unknown> }).input
            ?? (tc as { args?: Record<string, unknown> }).args
            ?? {}) as Record<string, unknown>
        }));
        return { toolCalls };
      }
    };
    const targetClient = {
      async *stream({ model, messages, signal }: {
        model: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        signal?: AbortSignal;
      }) {
        for await (const ev of streamChat({ model, messages, signal } as never)) {
          if (ev.type === 'text-delta') yield { type: 'text-delta' as const, delta: ev.delta };
          if (ev.type === 'finish') yield { type: 'finish' as const };
        }
      }
    };
    const judgeClient = {
      async complete({ system, user, signal }: {
        system: string;
        user: string;
        signal?: AbortSignal;
      }): Promise<unknown> {
        const out = await gatewayChat({
          model: orchestratorModelId, // reuse; cheap-model selection is future work
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          max_tokens: 200,
          signal
        } as never);
        try { return JSON.parse(out.content); }
        catch { return { tier: 'no' }; }
      }
    };

    const recentMessages = await repo.listMessages(chat.id);
    const ctx: OrchestratorContext = {
      objective,
      targetModelId,
      orchestratorModelId,
      targetModelLabel: targetModelId,
      maxAttempts,
      mainChatHistory: recentMessages
        .slice(-8)
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      layerHints: hintLayers.filter((h) => h.trim().length > 0),
      signal: ctrl.signal,
      orchestratorClient: orchestratorClient as never,
      targetClient: targetClient as never,
      judgeClient: judgeClient as never
    };

    try {
      for await (const ev of runOrchestrator(ctx)) {
        applyEvent(ev);
        // persist incrementally
        void repo.updateAttackSession(session.id, {
          turns: liveTurns,
          strategyLog: liveLog,
          finalOutcome,
          finalConfidence,
          finalSummary
        });
      }
    } finally {
      running = false;
      ctrl = null;
      // Final persist
      await repo.updateAttackSession(session.id, {
        turns: liveTurns,
        strategyLog: liveLog,
        finalOutcome,
        finalConfidence,
        finalSummary
      });
      const refreshed = await repo.listAttackSessions(chat.id);
      sessions = refreshed;
    }
  }

  function stop() {
    ctrl?.abort();
  }

  function applyEvent(e: OrchEvent) {
    switch (e.type) {
      case 'orchestrator_turn_committed':
        liveTurns = [...liveTurns, e.turn];
        break;
      case 'target_turn_committed':
        // Replace trailing in-flight target turn (if any) with the final committed one
        if (liveTurns.length > 0 && liveTurns[liveTurns.length - 1].role === 'target') {
          liveTurns = [...liveTurns.slice(0, -1), e.turn];
        } else {
          liveTurns = [...liveTurns, e.turn];
        }
        break;
      case 'target_reply_delta': {
        const last = liveTurns[liveTurns.length - 1];
        if (last?.role === 'target') {
          liveTurns = [...liveTurns.slice(0, -1), { ...last, text: (last.text ?? '') + e.delta }];
        } else {
          liveTurns = [...liveTurns, { role: 'target', text: e.delta, createdAt: Date.now() }];
        }
        break;
      }
      case 'pivoted':
        liveLog = [...liveLog, { iteration: e.iteration, strategyId: e.strategyId, action: 'pivot', rationale: e.reset ? 'reset context' : 'soft pivot' }];
        break;
      case 'turn_started':
        liveLog = [...liveLog, { iteration: e.iteration, strategyId: e.strategyId, action: 'turn', rationale: '' }];
        break;
      case 'finished':
        finalOutcome = e.outcome;
        finalConfidence = e.confidence;
        finalSummary = e.summary;
        break;
      case 'error':
        console.error('[orchestrator]', e.code, e.message);
        break;
    }
  }

  async function promoteFullSession(session: AttackSessionRow) {
    try {
      await injectAttackSessionTurn(chat.id, session);
    } catch (err) {
      alert('Promote failed: ' + (err as Error).message);
    }
  }

  async function deleteSession(id: string) {
    try {
      await repo.deleteAttackSession(id);
      sessions = sessions.filter((s) => s.id !== id);
    } catch (err) {
      console.error('[chain-tab] delete failed:', err);
    }
  }

  async function promoteCurrentSession() {
    if (!currentSessionId) return;
    const row = await repo.listAttackSessions(chat.id).then((list) => list.find((s) => s.id === currentSessionId));
    if (row) await promoteFullSession(row);
  }

  function handleObjectiveKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canRun) void run();
    }
  }
</script>

<div class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
  <!-- Objective input -->
  <label class="flex flex-col gap-1 text-xs">
    <span class="font-medium text-foreground">Objective</span>
    <textarea
      bind:value={objective}
      onkeydown={handleObjectiveKey}
      rows="3"
      placeholder="What do you want to extract? e.g. 'explain how X works in detail'"
      class="resize-y rounded-md border border-border/40 bg-background/40 p-2 text-[12px] focus:border-border focus:outline-none"
    ></textarea>
    <span class="text-[10px] text-muted-foreground">Cmd/Ctrl+Enter to run</span>
  </label>

  <!-- maxAttempts slider -->
  <label class="flex items-center gap-2 text-xs">
    <span class="font-medium text-foreground">Max attempts</span>
    <input type="range" min="3" max="12" bind:value={maxAttempts} class="flex-1" />
    <span class="w-6 text-right font-mono text-[11px]">{maxAttempts}</span>
  </label>

  <!-- Actions -->
  <div class="flex gap-2">
    {#if running}
      <button type="button" onclick={stop} class="inline-flex items-center gap-1 rounded-md border border-border/40 px-3 py-1.5 text-xs"><Square size={10} /> Stop</button>
    {:else}
      <button type="button" onclick={run} disabled={!canRun} class="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"><Play size={10} /> Run</button>
    {/if}
  </div>

  <!-- Advanced hints disclosure -->
  <details class="rounded-md border border-border/40 bg-background/20 text-[11px]">
    <summary class="cursor-pointer px-3 py-1.5 text-muted-foreground hover:text-foreground">Starting strategy hints (optional)</summary>
    <div class="flex flex-col gap-2 border-t border-border/40 p-2">
      {#each hintLayers as hint, i (i)}
        <LayerPicker
          index={i}
          value={hint}
          onChange={(id) => updateHint(i, id)}
          onRemove={() => removeHint(i)}
        />
      {/each}
      <button
        type="button"
        onclick={addHint}
        class="inline-flex items-center gap-1 self-start rounded-md border border-dashed border-border/50 px-2 py-1 text-[10px] text-muted-foreground hover:border-border hover:text-foreground"
      >
        <Plus size={10} /> Add hint
      </button>
    </div>
  </details>

  <!-- Strategy trace -->
  {#if liveLog.length > 0}
    <StrategyTraceBar log={liveLog} />
  {/if}

  <!-- Conversation view -->
  {#if liveTurns.length > 0}
    <div class="flex flex-col gap-2">
      {#each liveTurns as turn, i (i)}
        <OrchestratorTurnBubble {turn} live={running && i === liveTurns.length - 1} />
      {/each}
    </div>
  {/if}

  <!-- Final summary card -->
  {#if finalOutcome}
    <div class="rounded-md border border-primary/30 bg-primary/5 p-3">
      <div class="mb-2 flex items-center gap-2 text-xs">
        <span class={'rounded px-1.5 py-0.5 text-[9px] uppercase ' + (finalOutcome === 'extracted' ? 'bg-green-500/20 text-green-400' : finalOutcome === 'partial' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-orange-500/20 text-orange-400')}>{finalOutcome}</span>
        <span class="text-[10px] text-muted-foreground">confidence {finalConfidence?.toFixed(2) ?? '—'}</span>
      </div>
      {#if finalSummary}
        <p class="text-[11px] text-muted-foreground leading-relaxed">{finalSummary}</p>
      {/if}
      <div class="mt-2 flex gap-2">
        <button type="button" onclick={promoteCurrentSession} class="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground hover:bg-primary/90"><ArrowRight size={10} /> Send thread to main chat</button>
      </div>
    </div>
  {/if}

  <!-- History -->
  <AttackSessionHistory {sessions} onPromote={promoteFullSession} onDelete={deleteSession} />
</div>
