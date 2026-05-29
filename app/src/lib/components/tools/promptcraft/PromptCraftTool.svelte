<script lang="ts">
  import { untrack } from 'svelte';
  import { applyTechniqueForVariant, listPromptCraftTechniques } from './strategies';
  import { tuneParams, stripEnvelopes } from '$lib/ai/prompt-scaffold';
  import { chat, hasAnyKey as hasApiKey } from '$lib/ai/gateway';
  import { GatewayError as OpenRouterError } from '$lib/ai/types';
  import ModelPickerV2 from '$lib/components/ai/ModelPickerV2.svelte';
  import ContextBridge from '$lib/components/shell/ContextBridge.svelte';
  import { Combobox } from '$lib/components/ui/combobox';
  import type { ComboboxOption } from '$lib/components/ui/combobox';
  import { createPersistedState } from '$lib/stores/_persisted.svelte';
  import { activeRuns } from '$lib/stores/activeRuns.svelte';
  import { goto } from '$app/navigation';
  import { notify } from '$lib/stores/toast.svelte';
  import { sessionLog } from '$lib/stores/sessionLog.svelte';
  import { history } from '$lib/history/store.svelte';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import Copy from 'lucide-svelte/icons/copy';
  import Loader from 'lucide-svelte/icons/loader-circle';
  import ArrowUp from 'lucide-svelte/icons/arrow-up';
  import Play from 'lucide-svelte/icons/play';
  import NoProviderBanner from '$lib/components/ai/NoProviderBanner.svelte';
  import { promptcraftState, type PromptCraftMode } from './promptcraft.state.svelte';
  import ErrorBanner from '$lib/components/ai/ErrorBanner.svelte';
  import { GatewayError } from '$lib/ai/types';
  import ToolShell from '$lib/components/shell/ToolShell.svelte';
  import VaultSection from '$lib/components/vault/VaultSection.svelte';
  import { createVaultStore } from '$lib/vault/store.svelte';
  import { loadBundledSeeds } from '$lib/vault/seed-loader';
  import TechniqueMetadataPanel from './TechniqueMetadataPanel.svelte';
  import TapTreeViz from './viz/TapTreeViz.svelte';
  import PairTimelineViz from './viz/PairTimelineViz.svelte';
  import CrescendoThreadViz from './viz/CrescendoThreadViz.svelte';
  import ManyShotViz from './viz/ManyShotViz.svelte';

  import { runTap } from './orchestrators/tap';
  import { runPair } from './orchestrators/pair';
  import { runCrescendo } from './orchestrators/crescendo';
  import { runManyShot } from './orchestrators/many_shot';
  import type {
    OrchestratorConfig,
    OrchestratorRun,
    TapTree,
    PairTrace,
    CrescendoThread,
    ManyShotStack
  } from './orchestrators/types';

  type PromptCraftData = { lastError: GatewayError | null };
  const TOOL_ID = 'promptcraft';

  const MODES: Array<{ id: PromptCraftMode; label: string }> = [
    { id: 'single', label: 'Single-shot mutators' },
    { id: 'tap', label: 'TAP' },
    { id: 'pair', label: 'PAIR' },
    { id: 'crescendo', label: 'Crescendo' },
    { id: 'many_shot', label: 'Many-Shot' }
  ];

  // Map mode → technique id for the metadata panel.
  const MODE_TO_TECH: Record<PromptCraftMode, string | undefined> = {
    single: undefined,
    tap: 'tap',
    pair: 'pair',
    crescendo: 'crescendo',
    many_shot: 'many_shot'
  };

  // All eligible techniques (mutators + composites) keyed to Combobox options.
  const techniques = listPromptCraftTechniques();
  const techniqueOptions: ComboboxOption[] = techniques.map((t) => ({
    id: t.id,
    label: t.name,
    description: t.desc,
    group: t.group
  }));

  const modelPref = createPersistedState<string>('cryptex.pc.model', 'openrouter:openrouter/auto');

  // One-shot mount-time normalizer for legacy unqualified model ids ("gpt-4o" -> "openrouter:gpt-4o").
  // Wrapped in untrack so the effect does not re-subscribe to modelPref.value after the write.
  // Without this, createPersistedState's localStorage round-trip can re-trigger the effect on the
  // same tick, pegging the main thread on /promptcraft mount.
  $effect(() => {
    untrack(() => {
      const v = modelPref.value;
      if (v && !v.includes(':')) modelPref.value = `openrouter:${v}`;
    });
  });
  const tempPref = createPersistedState<number>('cryptex.pc.temperature', 0.9);

  const s = promptcraftState;

  const run_ = $derived(activeRuns.get<PromptCraftData>(TOOL_ID));
  const loading = $derived(activeRuns.isRunning(TOOL_ID));
  const errorMsg = $derived(run_?.error ?? '');
  const lastError = $derived(run_?.data.lastError ?? null);

  const keyConfigured = $derived(hasApiKey());

  type PromptCraftSeed = {
    technique: 'tap' | 'pair' | 'crescendo' | 'many_shot';
    params: Record<string, unknown>;
  };
  const vaultStore = createVaultStore<PromptCraftSeed>(
    TOOL_ID,
    loadBundledSeeds<PromptCraftSeed>(TOOL_ID)
  );

  // -- single-shot mode (preserved verbatim from prior Wave) ------------------

  function runSingleShot() {
    if (!keyConfigured) {
      activeRuns.start<PromptCraftData>(TOOL_ID, { lastError: null });
      activeRuns.fail(TOOL_ID, 'No provider configured. Add one in Settings to unlock this tool.');
      return;
    }
    if (!s.input.trim()) {
      activeRuns.start<PromptCraftData>(TOOL_ID, { lastError: null });
      activeRuns.fail(TOOL_ID, 'Enter a prompt to mutate.');
      return;
    }

    const r = activeRuns.start<PromptCraftData>(TOOL_ID, { lastError: null }, 'mutating…');

    void (async () => {
      const { system, user } = applyTechniqueForVariant(s.strategy, s.input, s.customInstruction);
      const n = Math.max(1, Math.min(10, s.count));
      const { temperature } = tuneParams(modelPref.value, 'mutate');
      const runs = Array.from({ length: n }, () =>
        chat({
          model: modelPref.value,
          temperature: temperature ?? tempPref.value,
          max_tokens: 2048,
          title: `Cryptex/PromptCraft/${s.strategy}-v2`,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          signal: r.controller.signal
        })
      );

      const results = await Promise.allSettled(runs);
      const fulfilled: string[] = [];
      let lastErrMsg = '';
      let lastGwError: GatewayError | null = null;
      for (const res of results) {
        if (res.status === 'fulfilled') fulfilled.push(stripEnvelopes(res.value.content));
        else if (res.reason instanceof GatewayError) {
          lastGwError = res.reason;
          lastErrMsg = res.reason.message;
        } else if (res.reason instanceof OpenRouterError) {
          lastErrMsg = res.reason.message;
        } else if (res.reason instanceof Error) lastErrMsg = res.reason.message;
      }

      if (fulfilled.length === 0) {
        if (lastGwError) {
          activeRuns.update<PromptCraftData>(TOOL_ID, () => ({ lastError: lastGwError }));
          activeRuns.fail(TOOL_ID, '');
        } else {
          const msg = lastErrMsg || 'All variants failed. Check your model or try again.';
          activeRuns.fail(TOOL_ID, msg);
          notify.error(msg);
        }
      } else {
        s.outputs = fulfilled;
        if (fulfilled.length < n) notify.warn(`${fulfilled.length}/${n} variants succeeded`);
        else notify.success(`Generated ${fulfilled.length} variants`);
        sessionLog.record({
          tool: 'promptcraft',
          operation: s.strategy,
          label: `${fulfilled.length} variants`,
          input: s.input,
          output: fulfilled.join('\n\n---\n\n'),
          options: { model: modelPref.value, temperature: tempPref.value, count: n }
        });
        activeRuns.finish(TOOL_ID, `Generated ${fulfilled.length} variants`);
      }
    })();
  }

  // -- multi-step modes -------------------------------------------------------

  function startedAt(): number {
    return Date.now();
  }

  async function recordHistory(
    op: string,
    input: string,
    output: string,
    params: Record<string, unknown>,
    started: number
  ): Promise<void> {
    try {
      await history.record({
        toolId: TOOL_ID,
        startedAt: started,
        status: 'done',
        input,
        output,
        params: { mode: s.mode, technique: op, ...params }
      });
    } catch {
      /* swallow — history failure should not break the run */
    }
  }

  function runTapMode() {
    if (!gateGuard()) return;
    const goal = s.goal.trim();
    if (!goal) return failNeedGoal();
    const started = startedAt();
    const r = activeRuns.start<PromptCraftData>(TOOL_ID, { lastError: null }, 'running TAP…');

    const config: OrchestratorConfig = {
      targetModel: modelPref.value,
      params: {
        maxDepth: s.tapMaxDepth,
        branchingFactor: s.tapBranchingFactor,
        pruningThreshold: s.tapPruningThreshold,
        baseGoal: goal
      }
    };

    s.lastRun = { kind: 'tap', tree: { rootId: '', nodes: new Map() } };
    void (async () => {
      try {
        const tree: TapTree = await runTap(
          config,
          r.controller.signal,
          (snap) => {
            s.lastRun = { kind: 'tap', tree: snap };
          },
          vaultStore // self-evolution: winning chains auto-promote here
        );
        s.lastRun = { kind: 'tap', tree };
        const best = tree.bestLeafId ? tree.nodes.get(tree.bestLeafId) : undefined;
        await recordHistory(
          'tap',
          goal,
          best?.prompt ?? '',
          {
            maxDepth: s.tapMaxDepth,
            branchingFactor: s.tapBranchingFactor,
            pruningThreshold: s.tapPruningThreshold,
            model: modelPref.value
          },
          started
        );
        activeRuns.finish(TOOL_ID, `TAP run finished (${tree.nodes.size} nodes)`);
        notify.success('TAP run finished');
      } catch (err) {
        await handleRunError(err);
      }
    })();
  }

  function runPairMode() {
    if (!gateGuard()) return;
    const goal = s.goal.trim();
    if (!goal) return failNeedGoal();
    const started = startedAt();
    const r = activeRuns.start<PromptCraftData>(TOOL_ID, { lastError: null }, 'running PAIR…');

    const config: OrchestratorConfig = {
      targetModel: modelPref.value,
      params: {
        initialPrompt: goal,
        goal,
        maxRounds: s.pairMaxRounds
      }
    };

    s.lastRun = { kind: 'pair', trace: { steps: [], converged: false } };
    void (async () => {
      try {
        const trace: PairTrace = await runPair(
          config,
          r.controller.signal,
          (snap) => {
            s.lastRun = { kind: 'pair', trace: snap };
          },
          vaultStore
        );
        s.lastRun = { kind: 'pair', trace };
        const last = trace.steps[trace.steps.length - 1];
        await recordHistory(
          'pair',
          goal,
          last?.prompt ?? '',
          { maxRounds: s.pairMaxRounds, converged: trace.converged, model: modelPref.value },
          started
        );
        activeRuns.finish(
          TOOL_ID,
          trace.converged ? `PAIR converged in ${trace.steps.length} rounds` : 'PAIR budget exhausted'
        );
        notify.success(trace.converged ? 'PAIR converged' : 'PAIR finished');
      } catch (err) {
        await handleRunError(err);
      }
    })();
  }

  function runCrescendoMode() {
    if (!gateGuard()) return;
    const goal = s.goal.trim();
    if (!goal) return failNeedGoal();
    const started = startedAt();
    const r = activeRuns.start<PromptCraftData>(TOOL_ID, { lastError: null }, 'running Crescendo…');

    const config: OrchestratorConfig = {
      targetModel: modelPref.value,
      params: {
        goal,
        escalationSteps: s.crescendoSteps,
        benignSeed: s.crescendoBenignSeed.trim() || undefined
      }
    };

    s.lastRun = { kind: 'crescendo', thread: { turns: [] } };
    void (async () => {
      try {
        const thread: CrescendoThread = await runCrescendo(
          config,
          r.controller.signal,
          (snap) => {
            s.lastRun = { kind: 'crescendo', thread: snap };
          },
          vaultStore
        );
        s.lastRun = { kind: 'crescendo', thread };
        const transcript = thread.turns
          .map((t) => `${t.role.toUpperCase()}: ${t.text}`)
          .join('\n\n');
        await recordHistory(
          'crescendo',
          goal,
          transcript,
          {
            escalationSteps: s.crescendoSteps,
            benignSeed: s.crescendoBenignSeed || null,
            model: modelPref.value
          },
          started
        );
        activeRuns.finish(TOOL_ID, `Crescendo finished (${thread.turns.length} turns)`);
        notify.success('Crescendo finished');
      } catch (err) {
        await handleRunError(err);
      }
    })();
  }

  function runManyShotMode() {
    if (!gateGuard()) return;
    const goal = s.goal.trim();
    if (!goal) return failNeedGoal();
    const started = startedAt();
    const r = activeRuns.start<PromptCraftData>(TOOL_ID, { lastError: null }, 'running Many-Shot…');

    const config: OrchestratorConfig = {
      targetModel: modelPref.value,
      params: {
        finalQuery: goal,
        shotCount: s.manyShotCount,
        theme: s.manyShotTheme.trim() || undefined
      }
    };

    s.lastRun = { kind: 'many_shot', stack: { shots: [], finalQuery: goal } };
    void (async () => {
      try {
        const stack: ManyShotStack = await runManyShot(
          config,
          r.controller.signal,
          (snap) => {
            s.lastRun = { kind: 'many_shot', stack: snap };
          },
          vaultStore
        );
        s.lastRun = { kind: 'many_shot', stack };
        const block = buildManyShotBlock(stack);
        await recordHistory(
          'many_shot',
          goal,
          block,
          {
            shotCount: s.manyShotCount,
            theme: s.manyShotTheme || null,
            model: modelPref.value
          },
          started
        );
        activeRuns.finish(TOOL_ID, `Many-Shot finished (${stack.shots.length} shots)`);
        notify.success('Many-Shot finished');
      } catch (err) {
        await handleRunError(err);
      }
    })();
  }

  function buildManyShotBlock(stack: ManyShotStack): string {
    return stack.shots.map((e) => e.shot).join('\n\n') + `\n\nQ: ${stack.finalQuery}\nA:`;
  }

  function gateGuard(): boolean {
    if (!keyConfigured) {
      activeRuns.start<PromptCraftData>(TOOL_ID, { lastError: null });
      activeRuns.fail(TOOL_ID, 'No provider configured. Add one in Settings to unlock this tool.');
      return false;
    }
    return true;
  }

  function failNeedGoal() {
    activeRuns.start<PromptCraftData>(TOOL_ID, { lastError: null });
    activeRuns.fail(TOOL_ID, 'Enter an attack goal to run this orchestrator.');
  }

  async function handleRunError(err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      activeRuns.cancel(TOOL_ID);
      return;
    }
    if (err instanceof GatewayError) {
      activeRuns.update<PromptCraftData>(TOOL_ID, () => ({ lastError: err }));
      activeRuns.fail(TOOL_ID, '');
      return;
    }
    const msg = err instanceof Error ? err.message : 'Run failed';
    activeRuns.fail(TOOL_ID, msg);
    notify.error(msg);
  }

  // -- run dispatcher ---------------------------------------------------------

  function run() {
    switch (s.mode) {
      case 'single':
        runSingleShot();
        break;
      case 'tap':
        runTapMode();
        break;
      case 'pair':
        runPairMode();
        break;
      case 'crescendo':
        runCrescendoMode();
        break;
      case 'many_shot':
        runManyShotMode();
        break;
    }
  }

  // -- vault wiring -----------------------------------------------------------

  function onVaultUse(payload: PromptCraftSeed) {
    s.mode = payload.technique;
    const p = payload.params;
    if (payload.technique === 'tap') {
      if (typeof p.maxDepth === 'number') s.tapMaxDepth = p.maxDepth;
      if (typeof p.branchingFactor === 'number') s.tapBranchingFactor = p.branchingFactor;
      if (typeof p.pruningThreshold === 'number') s.tapPruningThreshold = p.pruningThreshold;
    } else if (payload.technique === 'pair') {
      if (typeof p.maxRounds === 'number') s.pairMaxRounds = p.maxRounds;
    } else if (payload.technique === 'crescendo') {
      if (typeof p.escalationSteps === 'number') s.crescendoSteps = p.escalationSteps;
      if (typeof p.benignSeed === 'string') s.crescendoBenignSeed = p.benignSeed;
    } else if (payload.technique === 'many_shot') {
      if (typeof p.shotCount === 'number') s.manyShotCount = p.shotCount;
      if (typeof p.theme === 'string') s.manyShotTheme = p.theme;
    }
    notify.info(`Loaded ${payload.technique} preset — set a goal and Run.`);
  }

  // -- copy helpers -----------------------------------------------------------

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify.success(label);
    } catch {
      notify.error('Copy failed');
    }
  }

  function copyBestVariant() {
    const last = s.lastRun;
    if (!last) return;
    let text = '';
    if (last.kind === 'tap') {
      const id = last.tree.bestLeafId;
      const best = id ? last.tree.nodes.get(id) : undefined;
      text = best?.prompt ?? '';
    } else if (last.kind === 'pair') {
      const lastStep = last.trace.steps[last.trace.steps.length - 1];
      text = lastStep?.prompt ?? '';
    } else if (last.kind === 'crescendo') {
      text = last.thread.turns.map((t) => `${t.role.toUpperCase()}: ${t.text}`).join('\n\n');
    } else if (last.kind === 'many_shot') {
      text = buildManyShotBlock(last.stack);
    }
    if (text) copy(text, 'Copied best variant');
  }

  function useAsInput(text: string) {
    s.input = text;
    s.mode = 'single';
    notify.info('Pulled variant into input — single-shot mode');
  }

  // -- header description -----------------------------------------------------

  const description = $derived.by(() => {
    switch (s.mode) {
      case 'tap':
        return 'TAP — Tree of Attacks with Pruning. Build a tree of refined attack prompts; prune low-scoring branches.';
      case 'pair':
        return 'PAIR — Prompt Automatic Iterative Refinement. Iterate prompt against target until non-refusal or budget exhausted.';
      case 'crescendo':
        return 'Crescendo — multi-turn escalation. Benign opener → pivot turns → on-goal final.';
      case 'many_shot':
        return 'Many-Shot — fill context with benign Q/A demos, append real query last.';
      default:
        return 'The full registry of mutator and composite techniques, searchable. Generate multiple variants in parallel with adjustable temperature.';
    }
  });
</script>

<ToolShell
  toolId={TOOL_ID}
  title="PromptCraft"
  accent="Craft"
  {description}
  usage={{
    title: 'PromptCraft · Usage',
    bullets: [
      'Single-shot: 36 mutators + 4 composites for fast variant generation.',
      'TAP/PAIR/Crescendo/Many-Shot: bespoke orchestrators with live visualization.',
      'Each multi-step run is bounded — TAP ≤50 calls, PAIR ≤10 rounds, Crescendo ≤7 turns, Many-Shot ≤200 shots.',
      'Vault carries 20 pre-built chain configs (5 per orchestrator) referencing the original papers.'
    ]
  }}
>
  <NoProviderBanner context="tool" />

  <!-- Mode tabs -->
  <div class="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card/40 p-1">
    {#each MODES as m (m.id)}
      <button
        type="button"
        onclick={() => (s.mode = m.id)}
        aria-pressed={s.mode === m.id}
        class={'rounded-md px-3 py-1.5 text-xs font-medium transition-colors ' +
          (s.mode === m.id
            ? 'bg-primary text-primary-foreground shadow-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/40')}
      >
        {m.label}
      </button>
    {/each}
  </div>

  {#if MODE_TO_TECH[s.mode]}
    {@const tid = MODE_TO_TECH[s.mode] as string}
    <TechniqueMetadataPanel techniqueId={tid} techniqueName={tid} />
  {/if}

  <div class="grid gap-4 lg:grid-cols-[320px_1fr]">
    <!-- Config sidebar -->
    <div
      class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass lg:sticky lg:top-20 lg:self-start"
    >
      {#if s.mode === 'single'}
        <h2 class="font-serif text-sm">Technique</h2>
        <Combobox
          value={s.strategy}
          options={techniqueOptions}
          placeholder="Search techniques..."
          onChange={(id) => (s.strategy = id)}
        />

        {#if s.strategy === 'custom'}
          <label class="block space-y-1">
            <span class="text-xs text-muted-foreground">Your custom instruction</span>
            <textarea
              bind:value={s.customInstruction}
              rows="3"
              placeholder="System prompt for the mutation model…"
              class="w-full rounded-md border border-input bg-background/70 px-2 py-1.5 font-mono text-xs"
            ></textarea>
          </label>
        {/if}
      {:else if s.mode === 'tap'}
        <h2 class="font-serif text-sm">TAP config</h2>
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">Max depth: {s.tapMaxDepth}</span>
          <input
            type="range"
            min="1"
            max="5"
            step="1"
            value={s.tapMaxDepth}
            oninput={(e) =>
              (s.tapMaxDepth = Number((e.currentTarget as HTMLInputElement).value))}
            class="w-full accent-primary"
          />
        </label>
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">Branching: {s.tapBranchingFactor}</span>
          <input
            type="range"
            min="1"
            max="4"
            step="1"
            value={s.tapBranchingFactor}
            oninput={(e) =>
              (s.tapBranchingFactor = Number((e.currentTarget as HTMLInputElement).value))}
            class="w-full accent-primary"
          />
        </label>
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">
            Survivors per depth: {s.tapPruningThreshold}
          </span>
          <input
            type="range"
            min="1"
            max="4"
            step="1"
            value={s.tapPruningThreshold}
            oninput={(e) =>
              (s.tapPruningThreshold = Number((e.currentTarget as HTMLInputElement).value))}
            class="w-full accent-primary"
          />
        </label>
        <p class="text-[10px] text-muted-foreground italic">Hard cap: 50 LLM calls per run.</p>
      {:else if s.mode === 'pair'}
        <h2 class="font-serif text-sm">PAIR config</h2>
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">Max rounds: {s.pairMaxRounds}</span>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={s.pairMaxRounds}
            oninput={(e) =>
              (s.pairMaxRounds = Number((e.currentTarget as HTMLInputElement).value))}
            class="w-full accent-primary"
          />
        </label>
        <p class="text-[10px] text-muted-foreground italic">Stops early on convergence.</p>
      {:else if s.mode === 'crescendo'}
        <h2 class="font-serif text-sm">Crescendo config</h2>
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">
            Escalation steps: {s.crescendoSteps}
          </span>
          <input
            type="range"
            min="2"
            max="7"
            step="1"
            value={s.crescendoSteps}
            oninput={(e) =>
              (s.crescendoSteps = Number((e.currentTarget as HTMLInputElement).value))}
            class="w-full accent-primary"
          />
        </label>
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">Benign seed (optional)</span>
          <input
            type="text"
            bind:value={s.crescendoBenignSeed}
            placeholder="e.g., household chemistry"
            class="w-full rounded-md border border-input bg-background/70 px-2 py-1 text-xs"
          />
        </label>
      {:else if s.mode === 'many_shot'}
        <h2 class="font-serif text-sm">Many-Shot config</h2>
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">Shot count: {s.manyShotCount}</span>
          <input
            type="number"
            min="1"
            max="200"
            bind:value={s.manyShotCount}
            class="w-full rounded-md border border-input bg-background/70 px-2 py-1 text-sm"
          />
        </label>
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">Theme (optional)</span>
          <input
            type="text"
            bind:value={s.manyShotTheme}
            placeholder="e.g., chemistry, electronics"
            class="w-full rounded-md border border-input bg-background/70 px-2 py-1 text-xs"
          />
        </label>
        <p class="text-[10px] text-muted-foreground italic">
          Hard cap: 200 shots. Generated in batches of 8.
        </p>
      {/if}

      <div class="space-y-2 pt-2 border-t border-border/50">
        <ModelPickerV2
          value={modelPref.value}
          onChange={(v) => (modelPref.value = v)}
          recentsKey="cryptex.pc.recentModels"
        />

        <ContextBridge
          goal={s.input}
          targetModel={modelPref.value}
          onHydrate={({ goal: g, targetModel: t }) => {
            if (g) s.input = g;
            if (t) modelPref.value = t;
          }}
        />

        {#if s.mode === 'single'}
          <label class="block space-y-1">
            <span class="text-xs text-muted-foreground">
              Temperature: {tempPref.value.toFixed(2)}
            </span>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={tempPref.value}
              oninput={(e) =>
                (tempPref.value = Number((e.currentTarget as HTMLInputElement).value))}
              class="w-full accent-primary"
            />
          </label>

          <label class="block space-y-1">
            <span class="text-xs text-muted-foreground">Variants (1–10)</span>
            <input
              type="number"
              min="1"
              max="10"
              bind:value={s.count}
              class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-sm"
            />
          </label>
        {/if}
      </div>

      <button
        type="button"
        onclick={run}
        disabled={loading || !keyConfigured}
        class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-primary transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {#if loading}
          <Loader size={14} class="animate-spin" /> Running…
        {:else if s.mode === 'single'}
          <Sparkles size={14} /> Mutate
        {:else}
          <Play size={14} /> Run {s.mode.toUpperCase()}
        {/if}
      </button>

      {#if lastError}
        <ErrorBanner
          error={lastError}
          onRetry={() => run()}
          onOpenSettings={() => {
            const frag =
              lastError?.provider === 'openai-compat'
                ? 'providers'
                : `provider-${lastError?.provider}`;
            goto(`/settings#${frag}`);
          }}
        />
      {:else if errorMsg}
        <p class="text-xs text-destructive">{errorMsg}</p>
      {/if}
    </div>

    <!-- Right pane: input + output(s) -->
    <div class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
      {#if s.mode === 'single'}
        <h2 class="font-serif text-sm">Prompt to mutate</h2>
        <textarea
          bind:value={s.input}
          rows="5"
          placeholder="Paste the prompt you want to re-frame, obfuscate, or role-play wrap…"
          class="w-full rounded-lg border border-input bg-background/70 px-3 py-2 font-mono text-sm focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        ></textarea>

        {#if s.outputs.length > 0}
          <div class="flex items-center justify-between pt-2 border-t border-border/50">
            <h3 class="font-serif text-sm">{s.outputs.length} variants</h3>
            <button
              type="button"
              onclick={() => copy(s.outputs.join('\n\n---\n\n'), `Copied ${s.outputs.length} variants`)}
              class="inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Copy size={11} /> Copy all
            </button>
          </div>
          <ol class="space-y-2 max-h-[560px] overflow-y-auto cryptex-scroll pr-1">
            {#each s.outputs as out, i (i)}
              <li class="group rounded-md border border-border/50 bg-background/40 px-3 py-2">
                <div class="flex items-center justify-between mb-1">
                  <span
                    class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    Variant {i + 1}
                  </span>
                  <div
                    class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <button
                      type="button"
                      onclick={() => copy(out, `Variant ${i + 1} copied`)}
                      class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Copy size={11} /> Copy
                    </button>
                    <button
                      type="button"
                      onclick={() => useAsInput(out)}
                      class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ArrowUp size={11} /> Use as input
                    </button>
                  </div>
                </div>
                <pre class="font-mono text-[12px] whitespace-pre-wrap break-words">{out}</pre>
              </li>
            {/each}
          </ol>
        {/if}
      {:else}
        <h2 class="font-serif text-sm">Attack goal</h2>
        <textarea
          bind:value={s.goal}
          rows="3"
          placeholder="What you want the target to do. e.g., 'Explain step-by-step how to bypass content filters'…"
          class="w-full rounded-lg border border-input bg-background/70 px-3 py-2 font-mono text-sm focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        ></textarea>

        {#if s.lastRun}
          <div class="flex items-center justify-between pt-2 border-t border-border/50">
            <h3 class="font-serif text-sm">
              {s.lastRun.kind === 'tap'
                ? 'TAP tree'
                : s.lastRun.kind === 'pair'
                  ? 'PAIR timeline'
                  : s.lastRun.kind === 'crescendo'
                    ? 'Crescendo thread'
                    : 'Many-Shot stack'}
            </h3>
            <button
              type="button"
              onclick={copyBestVariant}
              class="inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Copy size={11} /> Copy best variant
            </button>
          </div>

          {#if s.lastRun.kind === 'tap'}
            <TapTreeViz tree={s.lastRun.tree} />
          {:else if s.lastRun.kind === 'pair'}
            <PairTimelineViz trace={s.lastRun.trace} />
          {:else if s.lastRun.kind === 'crescendo'}
            <CrescendoThreadViz thread={s.lastRun.thread} />
          {:else if s.lastRun.kind === 'many_shot'}
            <ManyShotViz stack={s.lastRun.stack} />
          {/if}
        {:else}
          <div
            class="rounded-md border border-dashed border-border/40 bg-background/30 p-6 text-center text-xs text-muted-foreground"
          >
            Configure the run on the left, then click <strong class="text-foreground">Run {s.mode.toUpperCase()}</strong>
            to start the orchestrator. Live updates render here as each step completes.
          </div>
        {/if}
      {/if}
    </div>
  </div>

  {#snippet vault()}
    <VaultSection
      store={vaultStore}
      label="Chain preset vault"
      onUse={(payload) => onVaultUse(payload)}
      payloadPlaceholder={'{"technique":"tap","params":{"maxDepth":3,"branchingFactor":2,"pruningThreshold":2}}'}
    />
  {/snippet}
</ToolShell>
