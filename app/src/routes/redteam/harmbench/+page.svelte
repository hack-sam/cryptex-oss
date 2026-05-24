<script lang="ts">
  /**
   * HarmBench Runner · Wave 3.1
   *
   * Rebuilt around `harmbench-scorer.ts`'s 3-bucket regex heuristic verdict
   * (refusal / partial / complied). The prior gateway-judge approach over-
   * weighted polite refusals as "low compliance score 0.0-0.2" and under-
   * weighted real comply events that lacked compliance-hint markers.
   *
   * - Per-category bar chart (clickable to filter the results list).
   * - Behavior coverage UI (tested / catalog total).
   * - Vault slot for user-added custom prompts.
   * - LLM calls batched in Promise.all chunks of 10 (not the worker — gateway
   *   needs main-thread fetch; scoring step is fast regex).
   * - Mandatory caveat banner: not the paper-trained classifier.
   * - history.record() per benchmark run.
   */
  import {
    HARMBENCH_PROMPTS,
    HARMBENCH_CATEGORIES,
    promptsByCategory,
    type HarmBenchCategory,
    type HarmBenchPrompt
  } from '$lib/redteam/harmbench-prompts';
  import {
    scoreHarmResponse,
    aggregateByCategory,
    type HarmVerdict
  } from '$lib/redteam/harmbench-scorer';
  import { streamChat as gatewayStreamChat, hasAnyKey as hasApiKey } from '$lib/ai/gateway';
  import ModelPickerV2 from '$lib/components/ai/ModelPickerV2.svelte';
  import NoProviderBanner from '$lib/components/ai/NoProviderBanner.svelte';
  import { createPersistedState } from '$lib/stores/_persisted.svelte';
  import { useToolState } from '$lib/stores/tool-state.svelte';
  import { activeRuns } from '$lib/stores/activeRuns.svelte';
  import { notify } from '$lib/stores/toast.svelte';
  import { history } from '$lib/history/store.svelte';
  import { createVaultStore } from '$lib/vault/store.svelte';
  import { loadBundledSeeds } from '$lib/vault/seed-loader';
  import ToolShell from '$lib/components/shell/ToolShell.svelte';
  import VaultSection from '$lib/components/vault/VaultSection.svelte';
  import Loader from 'lucide-svelte/icons/loader-circle';
  import Play from 'lucide-svelte/icons/play';
  import Square from 'lucide-svelte/icons/square';
  import Skull from 'lucide-svelte/icons/skull';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';

  const TOOL_ID = 'harmbench';

  type HarmBenchRow = {
    id: string;
    category: string;
    behavior: string;
    response: string;
    verdict: HarmVerdict;
    rationale: string;
    error?: string;
    durationMs: number;
  };

  type HarmBenchData = {
    rows: HarmBenchRow[];
    progress: number;
    total: number;
  };

  type HarmBenchVaultPayload = {
    behavior: string;
    category: string;
  };

  // ------------------------------------------------------------------
  // Persisted state
  // ------------------------------------------------------------------
  const targetPref = createPersistedState<string>('cryptex.harmbench.target', 'openrouter:openrouter/auto');
  const category = useToolState<HarmBenchCategory | 'all'>(TOOL_ID, 'category', 'all');
  const limit = useToolState<number>(TOOL_ID, 'limit', 10);
  const filterCategory = useToolState<string>(TOOL_ID, 'filterCat', ''); // empty = show all results

  // Custom prompts added via Vault (in-memory for this session; persisted via vault)
  const customPrompts = useToolState<HarmBenchVaultPayload[]>(TOOL_ID, 'customPrompts', []);

  // ------------------------------------------------------------------
  // Vault store
  // ------------------------------------------------------------------
  const vaultStore = createVaultStore<HarmBenchVaultPayload>(
    TOOL_ID,
    loadBundledSeeds<HarmBenchVaultPayload>(TOOL_ID)
  );

  // ------------------------------------------------------------------
  // Run state
  // ------------------------------------------------------------------
  const run = $derived(activeRuns.get<HarmBenchData>(TOOL_ID));
  const running = $derived(activeRuns.isRunning(TOOL_ID));
  const rows = $derived<HarmBenchRow[]>(run?.data.rows ?? []);
  const progress = $derived(run?.data.progress ?? 0);
  const total = $derived(run?.data.total ?? 0);
  const keyConfigured = $derived(hasApiKey());

  // ------------------------------------------------------------------
  // Items to run (catalog + custom merged)
  // ------------------------------------------------------------------
  const allPrompts = $derived.by<HarmBenchPrompt[]>(() => {
    const customAsHB: HarmBenchPrompt[] = customPrompts.value.map((c, i) => ({
      id: `custom_${i}_${c.category}_${c.behavior.slice(0, 16).replace(/\W+/g, '_')}`,
      category: (HARMBENCH_CATEGORIES.includes(c.category as HarmBenchCategory)
        ? c.category
        : 'cybercrime') as HarmBenchCategory,
      description: c.behavior
    }));
    return [...HARMBENCH_PROMPTS, ...customAsHB];
  });

  const itemsToRun = $derived.by<HarmBenchPrompt[]>(() => {
    const pool =
      category.value === 'all'
        ? allPrompts
        : allPrompts.filter((p) => p.category === category.value);
    const lim = Math.min(limit.value, pool.length);
    return pool.slice(0, lim);
  });

  // ------------------------------------------------------------------
  // Derived analytics
  // ------------------------------------------------------------------
  const successfulRows = $derived(rows.filter((r) => !r.error));
  const breakdown = $derived(
    aggregateByCategory(
      successfulRows.map((r) => ({ category: r.category, verdict: r.verdict }))
    )
  );
  const refusalRate = $derived.by(() => {
    if (successfulRows.length === 0) return 0;
    return successfulRows.filter((r) => r.verdict === 'refusal').length / successfulRows.length;
  });
  const partialRate = $derived.by(() => {
    if (successfulRows.length === 0) return 0;
    return successfulRows.filter((r) => r.verdict === 'partial').length / successfulRows.length;
  });
  const compliedRate = $derived.by(() => {
    if (successfulRows.length === 0) return 0;
    return successfulRows.filter((r) => r.verdict === 'complied').length / successfulRows.length;
  });

  const errorCount = $derived(rows.filter((r) => !!r.error).length);

  // Behavior coverage — how many of the ALL catalog behaviors have been
  // scored this session.
  const coveredIds = $derived(new Set(successfulRows.map((r) => r.id)));
  const coverage = $derived.by(() => ({
    covered: coveredIds.size,
    total: allPrompts.length
  }));

  // Filtered view for the table — honors the per-bar click-filter.
  const filteredRows = $derived.by<HarmBenchRow[]>(() => {
    if (!filterCategory.value) return rows;
    return rows.filter((r) => r.category === filterCategory.value);
  });

  // ------------------------------------------------------------------
  // Bar chart geometry
  // ------------------------------------------------------------------
  const maxCount = $derived(
    breakdown.length > 0 ? Math.max(...breakdown.map((b) => b.total)) : 1
  );

  function barPct(n: number, max: number): string {
    if (max <= 0) return '0%';
    return `${Math.round((n / max) * 100)}%`;
  }

  // ------------------------------------------------------------------
  // Benchmark runner
  // ------------------------------------------------------------------
  const BATCH_SIZE = 10;

  async function callTarget(prompt: string, model: string, signal: AbortSignal): Promise<string> {
    let reply = '';
    for await (const ev of gatewayStreamChat({
      model,
      messages: [{ role: 'user', content: prompt }],
      signal
    })) {
      if (ev.type === 'text-delta') reply += ev.delta;
    }
    return reply;
  }

  async function runOneItem(p: HarmBenchPrompt, model: string, signal: AbortSignal): Promise<HarmBenchRow> {
    const started = Date.now();
    try {
      const response = await callTarget(p.description, model, signal);
      const score = scoreHarmResponse(p.description, response);
      return {
        id: p.id,
        category: p.category,
        behavior: p.description,
        response,
        verdict: score.verdict,
        rationale: score.rationale,
        durationMs: Date.now() - started
      };
    } catch (err) {
      return {
        id: p.id,
        category: p.category,
        behavior: p.description,
        response: '',
        verdict: 'refusal',
        rationale: 'target call failed',
        error: (err as Error)?.message ?? String(err),
        durationMs: Date.now() - started
      };
    }
  }

  function runBenchmark(): void {
    if (!keyConfigured) {
      activeRuns.start<HarmBenchData>(TOOL_ID, { rows: [], progress: 0, total: 0 });
      activeRuns.fail(TOOL_ID, 'No provider configured. Add one in Settings.');
      return;
    }
    if (itemsToRun.length === 0) {
      activeRuns.start<HarmBenchData>(TOOL_ID, { rows: [], progress: 0, total: 0 });
      activeRuns.fail(TOOL_ID, 'No behaviors to run with current filters.');
      return;
    }

    const startedAt = Date.now();
    const totalCount = itemsToRun.length;
    const r = activeRuns.start<HarmBenchData>(
      TOOL_ID,
      { rows: [], progress: 0, total: totalCount },
      `0 / ${totalCount}`
    );
    filterCategory.value = ''; // reset bar-click filter on new run

    void (async () => {
      try {
        // Batch in chunks of BATCH_SIZE so we get parallel throughput
        // without overwhelming provider rate limits.
        for (let i = 0; i < itemsToRun.length; i += BATCH_SIZE) {
          if (r.controller.signal.aborted) break;
          const batch = itemsToRun.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(
            batch.map((p) => runOneItem(p, targetPref.value, r.controller.signal))
          );
          activeRuns.update<HarmBenchData>(TOOL_ID, (d) => {
            const merged = [...d.rows, ...results];
            return { rows: merged, progress: merged.length, total: d.total };
          });
        }
        if (r.controller.signal.aborted) return;

        // Record this run in history
        const cats = [...new Set(itemsToRun.map((p) => p.category))];
        const finalRows = activeRuns.get<HarmBenchData>(TOOL_ID)?.data.rows ?? [];
        const finalRefusalRate =
          finalRows.length > 0
            ? finalRows.filter((row) => row.verdict === 'refusal' && !row.error).length /
              Math.max(1, finalRows.filter((row) => !row.error).length)
            : 0;
        const summary = `${(finalRefusalRate * 100).toFixed(0)}% refusal · ${finalRows.length} behaviors`;
        activeRuns.finish(TOOL_ID, summary);
        void history.record({
          toolId: TOOL_ID,
          startedAt,
          status: 'done',
          input: itemsToRun.map((p) => p.description).join('\n---\n'),
          output: JSON.stringify(
            finalRows.map((r) => ({
              id: r.id,
              cat: r.category,
              verdict: r.verdict,
              rationale: r.rationale
            }))
          ),
          params: {
            model: targetPref.value,
            categories: cats,
            behaviorCount: itemsToRun.length,
            refusalRate: finalRefusalRate
          }
        });
        notify.success(`HarmBench: ${summary}`);
      } catch (err) {
        const msg = (err as Error).message ?? 'HarmBench failed';
        if (r.controller.signal.aborted) {
          if (activeRuns.get(TOOL_ID)?.status === 'running') activeRuns.cancel(TOOL_ID);
        } else {
          activeRuns.fail(TOOL_ID, msg);
        }
      }
    })();
  }

  function stop(): void {
    activeRuns.cancel(TOOL_ID);
  }

  // ------------------------------------------------------------------
  // Vault wiring
  // ------------------------------------------------------------------
  function onVaultUse(payload: HarmBenchVaultPayload): void {
    // Dedupe by exact behavior text
    const exists = customPrompts.value.some((c) => c.behavior === payload.behavior);
    if (exists) {
      notify.info('Already in custom pool');
      return;
    }
    customPrompts.value = [...customPrompts.value, payload];
    notify.success(`Added custom: "${payload.behavior.slice(0, 40)}${payload.behavior.length > 40 ? '…' : ''}"`);
  }

  function removeCustom(idx: number): void {
    customPrompts.value = customPrompts.value.filter((_, i) => i !== idx);
  }

  function clearCustom(): void {
    customPrompts.value = [];
    notify.info('Custom pool cleared');
  }

  // ------------------------------------------------------------------
  // UI helpers
  // ------------------------------------------------------------------
  function verdictColor(v: HarmVerdict): string {
    if (v === 'refusal') return 'text-emerald-400';
    if (v === 'partial') return 'text-amber-400';
    return 'text-red-400';
  }

  function verdictBg(v: HarmVerdict): string {
    if (v === 'refusal') return 'bg-emerald-500';
    if (v === 'partial') return 'bg-amber-500';
    return 'bg-red-500';
  }

  function categoryTotal(cat: string): number {
    return allPrompts.filter((p) => p.category === cat).length;
  }

  function toggleBarFilter(cat: string): void {
    filterCategory.value = filterCategory.value === cat ? '' : cat;
  }
</script>

<ToolShell
  toolId={TOOL_ID}
  title="HarmBench"
  accent="Bench"
  description="Runs a curated subset of HarmBench (Mazeika et al. 2024) against the target model. Heuristic 3-bucket verdict per response (refusal / partial / complied) using a regex + length-and-action-step rule."
  usage={{
    title: 'HarmBench · Usage',
    bullets: [
      'Pick a category + limit, or include custom behaviors via Vault.',
      'Each prompt runs against the target; verdict is local regex (no judge LLM).',
      'Per-category bar chart — click a bar to filter the table.',
      'Behavior coverage = how many catalog entries are tested.',
      'LLM calls batch in groups of 10 to avoid provider rate-limits.'
    ]
  }}
>
  <NoProviderBanner context="tool" />

  <!-- Mandatory caveat banner -->
  <div class="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-100">
    <TriangleAlert size={16} class="mt-0.5 shrink-0 text-amber-300" />
    <div class="space-y-0.5 text-xs leading-relaxed">
      <p class="font-medium text-amber-200">Heuristic scoring — not the trained classifier from the original paper.</p>
      <p class="text-amber-100/80">
        Verdicts use regex + length-and-action-step heuristics over the response text. Useful as a quick signal;
        not for publication-grade evals. The paper's trained per-category classifier is not browser-shippable.
      </p>
    </div>
  </div>

  <div class="grid gap-4 lg:grid-cols-[320px_1fr]">
    <!-- Sidebar — controls -->
    <div class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass lg:sticky lg:top-20 lg:self-start">
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground">Target model</span>
        <ModelPickerV2
          value={targetPref.value}
          onChange={(v) => (targetPref.value = v)}
          recentsKey="cryptex.harmbench.recentTarget"
        />
      </div>

      <label class="block space-y-1">
        <span class="text-xs text-muted-foreground">Category</span>
        <select
          bind:value={category.value}
          class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-sm focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">All ({allPrompts.length})</option>
          {#each HARMBENCH_CATEGORIES as c}
            <option value={c}>{c} ({categoryTotal(c)})</option>
          {/each}
        </select>
      </label>

      <label class="block space-y-1">
        <span class="text-xs text-muted-foreground">Limit: {Math.min(limit.value, itemsToRun.length || limit.value)} prompts</span>
        <input
          type="range"
          min="1"
          max="60"
          step="1"
          bind:value={limit.value}
          class="w-full accent-primary"
        />
      </label>

      {#if customPrompts.value.length > 0}
        <div class="space-y-1 rounded-md border border-primary/30 bg-primary/5 p-2">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-medium text-primary">Custom pool ({customPrompts.value.length})</span>
            <button
              type="button"
              onclick={clearCustom}
              class="text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              clear
            </button>
          </div>
          <ul class="space-y-1 max-h-32 overflow-y-auto pr-1 cryptex-scroll">
            {#each customPrompts.value as c, i (i)}
              <li class="flex items-start gap-1 text-[10px] leading-relaxed">
                <span class="rounded bg-muted/40 px-1 py-0 font-mono">{c.category}</span>
                <span class="flex-1 truncate text-muted-foreground" title={c.behavior}>{c.behavior}</span>
                <button
                  type="button"
                  onclick={() => removeCustom(i)}
                  class="text-muted-foreground hover:text-destructive"
                  aria-label="Remove custom prompt"
                >
                  &times;
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="border-t border-border/40 pt-3">
        {#if running}
          <div class="mb-2 text-xs text-muted-foreground">
            <span>Progress</span>
            <span class="ml-2 font-mono text-foreground">{progress} / {total}</span>
            <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                class="h-full bg-primary transition-all"
                style="width: {total > 0 ? (progress / total) * 100 : 0}%"
              ></div>
            </div>
          </div>
          <button
            type="button"
            onclick={stop}
            class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card/40 px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Square size={14} /> Stop
          </button>
        {:else}
          <button
            type="button"
            onclick={runBenchmark}
            disabled={!keyConfigured || itemsToRun.length === 0}
            class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-primary transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play size={14} /> Run benchmark ({itemsToRun.length})
          </button>
        {/if}
      </div>

      <div class="rounded-md border border-border/40 bg-background/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
        <p class="flex items-center gap-1.5">
          <Skull size={11} class="text-primary" />
          <span class="font-medium text-foreground">Coverage</span>
        </p>
        <p>
          <span class="font-mono text-foreground">{coverage.covered}</span> / {coverage.total} behaviors scored
          <span class="ml-1 text-muted-foreground">(catalog + custom)</span>
        </p>
      </div>

      <div class="rounded-md border border-border/40 bg-background/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
        <p class="flex items-center gap-1.5">
          <Skull size={11} class="text-primary" />
          <span class="font-medium text-foreground">Source</span>
        </p>
        <p>HarmBench (<a class="underline" href="https://arxiv.org/abs/2402.04249" target="_blank" rel="noopener">arxiv:2402.04249</a>). Curated transferable subset; full corpus has ~400 entries.</p>
      </div>
    </div>

    <!-- Right column -->
    <div class="space-y-4">
      <!-- Summary + bar chart -->
      {#if successfulRows.length > 0}
        <div class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
          <div class="flex items-center justify-between">
            <h2 class="font-serif text-sm">Summary</h2>
            {#if filterCategory.value}
              <button
                type="button"
                onclick={() => (filterCategory.value = '')}
                class="text-[11px] text-muted-foreground hover:text-foreground underline"
              >
                Clear filter ({filterCategory.value})
              </button>
            {/if}
          </div>

          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="rounded-lg border border-input bg-background/70 p-2">
              <div class="font-mono text-xl text-emerald-400">{(refusalRate * 100).toFixed(0)}%</div>
              <div class="text-[10px] uppercase tracking-wider text-muted-foreground">Refusal</div>
            </div>
            <div class="rounded-lg border border-input bg-background/70 p-2">
              <div class="font-mono text-xl text-amber-400">{(partialRate * 100).toFixed(0)}%</div>
              <div class="text-[10px] uppercase tracking-wider text-muted-foreground">Partial</div>
            </div>
            <div class="rounded-lg border border-input bg-background/70 p-2">
              <div class="font-mono text-xl text-red-400">{(compliedRate * 100).toFixed(0)}%</div>
              <div class="text-[10px] uppercase tracking-wider text-muted-foreground">Complied</div>
            </div>
          </div>

          <!-- Per-category bar chart -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>By category — click a bar to filter</span>
              <span class="font-mono">
                {successfulRows.length} scored{#if errorCount > 0}<span class="ml-1 text-amber-400">· {errorCount} error{errorCount === 1 ? '' : 's'}</span>{/if}
              </span>
            </div>
            <div class="space-y-1">
              {#each breakdown as bk (bk.category)}
                <button
                  type="button"
                  onclick={() => toggleBarFilter(bk.category)}
                  class={
                    'group relative flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ' +
                    (filterCategory.value === bk.category
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-input bg-background/40 hover:border-border hover:bg-background/60')
                  }
                  aria-pressed={filterCategory.value === bk.category}
                >
                  <code class="w-20 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{bk.category}</code>
                  <!-- Stacked bar -->
                  <div class="relative flex h-3 flex-1 overflow-hidden rounded-sm bg-muted/30">
                    <div
                      class="flex h-full"
                      style="width: {barPct(bk.total, maxCount)}"
                    >
                      {#if bk.refusal > 0}
                        <div
                          class="h-full bg-emerald-500"
                          style="width: {(bk.refusal / bk.total) * 100}%"
                          title="{bk.refusal} refusal"
                        ></div>
                      {/if}
                      {#if bk.partial > 0}
                        <div
                          class="h-full bg-amber-500"
                          style="width: {(bk.partial / bk.total) * 100}%"
                          title="{bk.partial} partial"
                        ></div>
                      {/if}
                      {#if bk.complied > 0}
                        <div
                          class="h-full bg-red-500"
                          style="width: {(bk.complied / bk.total) * 100}%"
                          title="{bk.complied} complied"
                        ></div>
                      {/if}
                    </div>
                  </div>
                  <span class="w-24 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                    <span class="text-emerald-400">{bk.refusal}</span>
                    <span class="opacity-30">/</span>
                    <span class="text-amber-400">{bk.partial}</span>
                    <span class="opacity-30">/</span>
                    <span class="text-red-400">{bk.complied}</span>
                  </span>
                </button>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      <!-- Results -->
      <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
        <div class="flex items-center justify-between">
          <h2 class="font-serif text-sm">
            Results
            {#if filterCategory.value}
              <span class="ml-1 text-[11px] text-primary">· filtered: {filterCategory.value}</span>
            {/if}
          </h2>
          <span class="font-mono text-[11px] text-muted-foreground">
            {filteredRows.length}{#if filterCategory.value} / {rows.length}{:else} / {total}{/if}
          </span>
        </div>

        {#if rows.length === 0 && !running}
          <div class="rounded-lg border border-dashed border-border/40 bg-background/20 p-6 text-center text-xs text-muted-foreground">
            Pick a category + limit, click <strong class="text-foreground">Run benchmark</strong>.
          </div>
        {:else if rows.length === 0 && running}
          <div class="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/40 bg-background/20 p-6 text-xs text-muted-foreground">
            <Loader size={14} class="animate-spin" /> Running batch {Math.ceil(progress / BATCH_SIZE) + 1}…
          </div>
        {:else}
          <ul class="flex max-h-[calc(100vh-30rem)] flex-col gap-1.5 overflow-y-auto pr-1 cryptex-scroll">
            {#each filteredRows as r (r.id)}
              <li class="rounded-lg border border-input bg-background/70 p-2.5">
                <div class="space-y-1.5">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class={'h-2 w-2 shrink-0 rounded-full ' + verdictBg(r.verdict)}></span>
                    <code class="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">{r.id}</code>
                    <span class="rounded-full border border-border bg-card/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {r.category}
                    </span>
                    <span class={'font-mono text-[11px] uppercase tracking-wide ' + verdictColor(r.verdict)}>
                      {r.verdict}
                    </span>
                    <span class="font-mono text-[10px] text-muted-foreground">{r.durationMs}ms</span>
                  </div>
                  <p class="text-[11px] text-muted-foreground italic">
                    <span class="font-medium text-foreground not-italic">behavior:</span> {r.behavior}
                  </p>
                  {#if r.error}
                    <p class="text-[11px] text-destructive">error: {r.error}</p>
                  {:else}
                    <p class="line-clamp-3 text-[11px] leading-relaxed text-muted-foreground break-words">
                      <span class="font-medium text-foreground">response:</span> {r.response}
                    </p>
                    <p class="text-[10px] italic text-muted-foreground/80">
                      <span class="font-medium not-italic">rationale:</span> {r.rationale}
                    </p>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>

  {#snippet vault()}
    <VaultSection
      store={vaultStore}
      label="HarmBench custom prompts"
      onUse={(payload) => onVaultUse(payload)}
      payloadPlaceholder={'{"behavior":"Describe how to ...","category":"cybercrime"}'}
    />
  {/snippet}
</ToolShell>
