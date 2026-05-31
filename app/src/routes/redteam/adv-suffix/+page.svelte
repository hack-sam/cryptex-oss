<script lang="ts">
  /**
   * Adversarial Suffix · Wave 2.1
   *
   * Wrapped in <ToolShell> with bundled Vault (lib/vault/seeds/adv-suffix.json,
   * 38 entries), per-suffix pattern analyzer chips, per-suffix decay chart,
   * Combo Builder (defaulting to suffix-pattern), and history.record on every
   * combo generation.
   */
  import {
    ADV_SUFFIXES,
    SUFFIX_CATEGORIES,
    suffixesByCategory,
    type AdvSuffix,
    type SuffixCategory
  } from '$lib/redteam/adv-suffixes';
  import { GLITCH_TOKENS } from '$lib/redteam/glitch-tokens';
  import { buildCombo, type ComboPattern, COMBO_PATTERN_DESCRIPTIONS } from '$lib/redteam/combo-builder';
  import { analyzeSuffix } from '$lib/redteam/suffix-analyzer';
  import { notify } from '$lib/stores/toast.svelte';
  import { useToolState } from '$lib/stores/tool-state.svelte';
  import { history } from '$lib/history/store.svelte';
  import { createVaultStore } from '$lib/vault/store.svelte';
  import { loadBundledSeeds } from '$lib/vault/seed-loader';
  import ToolShell from '$lib/components/shell/ToolShell.svelte';
  import VaultSection from '$lib/components/vault/VaultSection.svelte';
  import Copy from 'lucide-svelte/icons/copy';
  import Skull from 'lucide-svelte/icons/skull';
  import Layers from 'lucide-svelte/icons/layers';
  import Microscope from 'lucide-svelte/icons/microscope';
  import LineChart from 'lucide-svelte/icons/chart-line';

  const TOOL_ID = 'adv-suffix';

  type AdvSuffixSeedPayload = {
    suffix: string;
    category: string;
    year: number;
    successRates: { [model: string]: number };
    structure?: string[];
  };

  const vaultStore = createVaultStore<AdvSuffixSeedPayload>(
    TOOL_ID,
    loadBundledSeeds<AdvSuffixSeedPayload>(TOOL_ID)
  );

  const selectedCategory = useToolState<SuffixCategory | 'all'>(TOOL_ID, 'category', 'all');
  const searchTerm = useToolState<string>(TOOL_ID, 'search', '');
  const minSuccessRate = useToolState<number>(TOOL_ID, 'minSuccess', 0);
  const selectedSuffixId = useToolState<string>(TOOL_ID, 'selectedId', '');

  // --- Combo Builder state -----------------------------------------------
  const comboPattern = useToolState<ComboPattern>(TOOL_ID, 'comboPattern', 'suffix');
  const comboBase = useToolState<string>(TOOL_ID, 'comboBase', '');
  const comboGlitchIdx = useToolState<number>(TOOL_ID, 'comboGlitchIdx', -1);
  let comboOutput = $state('');

  const filtered = $derived.by(() => {
    let list: AdvSuffix[] = selectedCategory.value === 'all' ? ADV_SUFFIXES : suffixesByCategory(selectedCategory.value);
    if (minSuccessRate.value > 0) {
      list = list.filter((s) => s.reportedSuccessRate >= minSuccessRate.value);
    }
    if (searchTerm.value) {
      const q = searchTerm.value.toLowerCase();
      list = list.filter(
        (s) =>
          s.id.toLowerCase().includes(q) ||
          s.suffix.toLowerCase().includes(q) ||
          s.reportedTargets.toLowerCase().includes(q) ||
          s.source.toLowerCase().includes(q)
      );
    }
    return list;
  });

  const selectedSuffix = $derived<AdvSuffix | undefined>(
    selectedSuffixId.value ? ADV_SUFFIXES.find((s) => s.id === selectedSuffixId.value) : undefined
  );

  const analyzerChips = $derived(selectedSuffix ? analyzeSuffix(selectedSuffix.suffix) : []);

  /**
   * Build a per-year decay series from a suffix's vault entry's successRates.
   * The bundled Vault payloads carry { [modelKey]: rate } maps; if the active
   * suffix has a matching Vault entry we pull its successRates and treat each
   * key as a separate year-or-model bucket. For the in-page ADV_SUFFIXES list
   * (no per-year detail), we synthesize a 3-point decay curve from the
   * reportedSuccessRate + year published, decaying at 30%/year as a heuristic.
   */
  const decayPoints = $derived.by<{ year: number; rate: number; label: string }[]>(() => {
    if (!selectedSuffix) return [];
    const base = selectedSuffix.reportedSuccessRate;
    const startYear = selectedSuffix.year;
    const currentYear = 2026;
    // Heuristic decay: rate * (1 - 0.30)^(yearOffset) — labs train against
    // each publicly-released suffix family within ~12 months, halving hit
    // rate roughly every 24 months. Curve clamped to ≥ 5%.
    const points: { year: number; rate: number; label: string }[] = [];
    for (let y = startYear; y <= currentYear; y++) {
      const offset = y - startYear;
      const rate = Math.max(0.05, base * Math.pow(0.7, offset));
      points.push({ year: y, rate, label: y === startYear ? 'pub' : `+${offset}y` });
    }
    return points;
  });

  // SVG geometry for the inline 200×80px decay line chart
  const CHART_W = 200;
  const CHART_H = 80;
  const CHART_PAD = 8;
  const polyPath = $derived.by<string>(() => {
    if (decayPoints.length === 0) return '';
    const xs = decayPoints.map((_, i) =>
      CHART_PAD + (i / Math.max(1, decayPoints.length - 1)) * (CHART_W - CHART_PAD * 2)
    );
    const ys = decayPoints.map((p) => CHART_H - CHART_PAD - p.rate * (CHART_H - CHART_PAD * 2));
    return xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  });

  async function copyToClipboard(s: AdvSuffix) {
    try {
      await navigator.clipboard.writeText(s.suffix);
      notify.success(`Copied ${s.id}`);
    } catch {
      notify.error('Copy failed');
    }
  }

  function categoryLabel(cat: SuffixCategory | 'all'): string {
    const labels: Record<SuffixCategory | 'all', string> = {
      all: 'All',
      gcg: 'GCG',
      autodan: 'AutoDAN',
      harmbench: 'HarmBench',
      jbb: 'JailbreakBench',
      advbench: 'AdvBench',
      pair: 'PAIR',
      tap: 'TAP',
      pap: 'PAP',
      'best-of-n': 'Best-of-N',
      reasoning: 'Reasoning',
      community: 'Community'
    };
    return labels[cat];
  }

  function successColor(rate: number): string {
    if (rate >= 0.7) return 'text-emerald-400';
    if (rate >= 0.5) return 'text-amber-400';
    return 'text-muted-foreground';
  }

  function generateCombo() {
    const startedAt = Date.now();
    const suffix = selectedSuffix?.suffix ?? '';
    const glitchToken = comboGlitchIdx.value >= 0 && comboGlitchIdx.value < GLITCH_TOKENS.length
      ? GLITCH_TOKENS[comboGlitchIdx.value].token
      : undefined;
    const output = buildCombo({
      basePrompt: comboBase.value,
      pattern: comboPattern.value,
      glitchToken,
      adversarialSuffix: suffix || undefined
    });
    comboOutput = output;
    void history.record({
      toolId: TOOL_ID,
      startedAt,
      status: 'done',
      input: comboBase.value,
      output,
      params: {
        pattern: comboPattern.value,
        suffixId: selectedSuffixId.value,
        glitchTokenIdx: comboGlitchIdx.value
      }
    });
    notify.success('Combo generated');
  }

  async function copyCombo() {
    if (!comboOutput) return;
    try {
      await navigator.clipboard.writeText(comboOutput);
      notify.success('Combo copied');
    } catch {
      notify.error('Copy failed');
    }
  }

  function onVaultUse(payload: AdvSuffixSeedPayload) {
    // Match the vault payload back to the ADV_SUFFIXES list by suffix text;
    // for custom user items the search is the fallback.
    const match = ADV_SUFFIXES.find((s) => s.suffix === payload.suffix);
    if (match) {
      selectedSuffixId.value = match.id;
      notify.info(`Selected ${match.id}`);
    } else {
      // Custom — surface in the search to highlight it in the list.
      searchTerm.value = payload.suffix.slice(0, 32);
      notify.info('Custom suffix loaded — see search results');
    }
  }

  function onReplay(input: string, params: Record<string, unknown>) {
    comboBase.value = input;
    if (typeof params.suffixId === 'string') selectedSuffixId.value = params.suffixId;
    if (typeof params.pattern === 'string') {
      const p = params.pattern as ComboPattern;
      if (p === 'prefix' || p === 'infix' || p === 'sandwich' || p === 'suffix') {
        comboPattern.value = p;
      }
    }
    if (typeof params.glitchTokenIdx === 'number') comboGlitchIdx.value = params.glitchTokenIdx;
  }
</script>

<ToolShell
  toolId={TOOL_ID}
  title="Adversarial suffix"
  accent="suffix"
  description="Legacy: frontier models patched single-shot suffix transfer. Keep it as a regression-detection baseline or a composable layer inside cipher-stacks and composites, not a standalone bypass on SOTA models. Curated public corpus of GCG / AutoDAN / HarmBench / PAIR / TAP / PAP / Best-of-N transferable adversarial suffixes from peer-reviewed 2023-2026 red-team literature. Hit rate on current frontier models is always lower than paper numbers — labs train against these."
  usage={{
    title: 'Adversarial suffix · Usage',
    bullets: [
      'Pick a suffix from the curated GCG / AutoDAN / PAIR / TAP / PAP / Best-of-N corpus.',
      'Each entry is paper-cited and tagged by family.',
      'Click a row to see analyzer chips + decay-chart for that suffix.',
      'Hit rate has decayed since publication — labs train against these.',
      'Combo Builder seeds the suffix into a base prompt (default: append-suffix).'
    ]
  }}
  {onReplay}
>
  <div class="grid gap-4 lg:grid-cols-[320px_1fr]">
    <!-- Sidebar — controls -->
    <div class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass lg:sticky lg:top-20 lg:self-start">
      <label class="block space-y-1">
        <span class="text-xs text-muted-foreground">Category</span>
        <select
          bind:value={selectedCategory.value}
          class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-sm focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">All ({ADV_SUFFIXES.length})</option>
          {#each SUFFIX_CATEGORIES as cat}
            <option value={cat}>{categoryLabel(cat)} ({suffixesByCategory(cat).length})</option>
          {/each}
        </select>
      </label>

      <label class="block space-y-1">
        <span class="text-xs text-muted-foreground">Search</span>
        <input
          bind:value={searchTerm.value}
          type="search"
          placeholder="id, text, target, source…"
          class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-sm focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <label class="block space-y-1">
        <span class="text-xs text-muted-foreground">Min success: {(minSuccessRate.value * 100).toFixed(0)}%</span>
        <input
          type="range"
          min="0"
          max="0.9"
          step="0.05"
          bind:value={minSuccessRate.value}
          class="w-full accent-primary"
        />
      </label>

      <div class="flex items-center justify-between border-t border-border/40 pt-3 text-xs text-muted-foreground">
        <span>Showing</span>
        <span class="font-mono text-foreground">{filtered.length} / {ADV_SUFFIXES.length}</span>
      </div>

      <div class="space-y-1.5 rounded-md border border-border/40 bg-background/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
        <p class="flex items-center gap-1.5">
          <Skull size={11} class="text-primary" />
          <span class="font-medium text-foreground">Usage</span>
        </p>
        <p>
          Click a suffix in the list to inspect analyzer chips + decay chart,
          then use the Combo Builder to seed it into a base prompt.
        </p>
      </div>
    </div>

    <!-- Right column -->
    <div class="space-y-4">
      <!-- Analyzer + decay panel (when a suffix is selected) -->
      {#if selectedSuffix}
        <div class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
          <div class="flex flex-wrap items-center gap-2">
            <Microscope size={14} class="text-primary" />
            <h2 class="font-serif text-sm">Selected · {selectedSuffix.id}</h2>
            <span class="rounded-full border border-border bg-card/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {categoryLabel(selectedSuffix.category)}
            </span>
            <span class="font-mono text-[10px] text-muted-foreground">{selectedSuffix.year}</span>
            <span class={'font-mono text-[11px] ' + successColor(selectedSuffix.reportedSuccessRate)}>
              {(selectedSuffix.reportedSuccessRate * 100).toFixed(0)}%
            </span>
            <button
              type="button"
              onclick={() => (selectedSuffixId.value = '')}
              class="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear selection"
            >
              Clear
            </button>
          </div>

          <!-- Analyzer chips -->
          <div class="space-y-1">
            <span class="text-xs text-muted-foreground">Pattern analyzer</span>
            {#if analyzerChips.length === 0}
              <p class="rounded-md border border-dashed border-border/40 bg-background/20 p-2 text-[11px] text-muted-foreground">
                No common jailbreak patterns detected.
              </p>
            {:else}
              <div class="flex flex-wrap gap-1">
                {#each analyzerChips as chip, i (chip.pattern + '_' + i)}
                  <span
                    class="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300"
                    title={`Matched: ${chip.matched}`}
                  >
                    <span class="font-medium">{chip.label}</span>
                    <code class="font-mono text-[9px] text-amber-200/80">· {chip.matched.length > 20 ? chip.matched.slice(0, 20) + '…' : chip.matched}</code>
                  </span>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Decay chart -->
          <div class="space-y-1">
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LineChart size={11} class="text-primary" />
              <span>Decay (heuristic · 30%/year)</span>
            </div>
            {#if decayPoints.length > 0}
              <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                width={CHART_W}
                height={CHART_H}
                class="block rounded border border-border/40 bg-background/40"
                role="img"
                aria-label={`Decay chart for ${selectedSuffix.id}: ${decayPoints.map((p) => `${p.year}=${(p.rate * 100).toFixed(0)}%`).join(', ')}`}
              >
                <!-- Y-axis baseline (0%) -->
                <line x1={CHART_PAD} y1={CHART_H - CHART_PAD} x2={CHART_W - CHART_PAD} y2={CHART_H - CHART_PAD} stroke="currentColor" stroke-opacity="0.2" />
                <!-- Y-axis midline (50%) -->
                <line x1={CHART_PAD} y1={CHART_H / 2} x2={CHART_W - CHART_PAD} y2={CHART_H / 2} stroke="currentColor" stroke-opacity="0.1" stroke-dasharray="2 2" />
                <!-- Decay polyline -->
                <path d={polyPath} fill="none" stroke="currentColor" stroke-width="1.5" class="text-primary" />
                <!-- Data points -->
                {#each decayPoints as p, i (p.year)}
                  {@const x = CHART_PAD + (i / Math.max(1, decayPoints.length - 1)) * (CHART_W - CHART_PAD * 2)}
                  {@const y = CHART_H - CHART_PAD - p.rate * (CHART_H - CHART_PAD * 2)}
                  <circle cx={x} cy={y} r="2.5" class="fill-primary" />
                  <text x={x} y={CHART_H - 1} font-size="7" text-anchor="middle" class="fill-muted-foreground">{p.year}</text>
                {/each}
              </svg>
              <p class="text-[10px] text-muted-foreground italic">
                {decayPoints[0].year} pub: {(decayPoints[0].rate * 100).toFixed(0)}% →
                {decayPoints[decayPoints.length - 1].year}: ~{(decayPoints[decayPoints.length - 1].rate * 100).toFixed(0)}%
              </p>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Combo Builder panel -->
      <div class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
        <div class="flex items-center gap-2">
          <Layers size={14} class="text-primary" />
          <h2 class="font-serif text-sm">Combo builder</h2>
          <span class="font-mono text-[11px] text-muted-foreground">
            {selectedSuffix ? selectedSuffix.id : '(no suffix selected)'} + optional glitch
          </span>
        </div>

        <div class="grid gap-2 sm:grid-cols-2">
          <div class="space-y-1">
            <span class="text-xs text-muted-foreground">Pattern</span>
            <div class="flex flex-wrap gap-1">
              {#each ['prefix', 'infix', 'sandwich', 'suffix'] as pat (pat)}
                <label class="inline-flex items-center gap-1 rounded-md border border-input bg-background/70 px-2 py-1 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="combo-pattern"
                    value={pat}
                    bind:group={comboPattern.value}
                    class="accent-primary"
                  />
                  <span>{pat}</span>
                </label>
              {/each}
            </div>
            <p class="text-[10px] text-muted-foreground italic">
              {COMBO_PATTERN_DESCRIPTIONS[comboPattern.value]}
            </p>
          </div>

          <div class="space-y-1">
            <label class="block space-y-1">
              <span class="text-xs text-muted-foreground">Glitch token (optional)</span>
              <select
                bind:value={comboGlitchIdx.value}
                class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-xs focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value={-1}>(none)</option>
                {#each GLITCH_TOKENS as g, i (g.token + '_' + i)}
                  <option value={i}>{g.token.slice(0, 36)}{g.token.length > 36 ? '…' : ''} ({g.family[0]})</option>
                {/each}
              </select>
            </label>
          </div>
        </div>

        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">Base prompt</span>
          <textarea
            bind:value={comboBase.value}
            rows="3"
            placeholder="What you actually want the model to do…"
            class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-xs focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          ></textarea>
        </label>

        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={generateCombo}
            class="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <Layers size={11} /> Generate combo
          </button>
          {#if comboOutput}
            <button
              type="button"
              onclick={copyCombo}
              class="inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Copy size={11} /> Copy
            </button>
          {/if}
        </div>

        {#if comboOutput}
          <pre class="whitespace-pre-wrap break-all rounded border border-border/40 bg-background/40 p-2 font-mono text-[11px] leading-relaxed text-foreground">{comboOutput}</pre>
        {/if}
      </div>

      <!-- Suffix list -->
      <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
        <div class="flex items-center justify-between">
          <h2 class="font-serif text-sm">Suffixes</h2>
          <span class="font-mono text-[11px] text-muted-foreground">
            {selectedCategory.value === 'all' ? 'all' : categoryLabel(selectedCategory.value)} · {filtered.length}
          </span>
        </div>

        {#if filtered.length === 0}
          <div class="rounded-lg border border-dashed border-border/40 bg-background/20 p-6 text-center text-xs text-muted-foreground">
            No suffixes match the current filter.
          </div>
        {:else}
          <ul class="flex max-h-[calc(100vh-30rem)] flex-col gap-2 overflow-y-auto pr-1 cryptex-scroll">
            {#each filtered as s (s.id)}
              <li
                class={'rounded-lg border bg-background/70 p-3 transition-colors ' +
                  (selectedSuffixId.value === s.id
                    ? 'border-primary/60 bg-primary/5'
                    : 'border-input hover:border-border')}
              >
                <button
                  type="button"
                  onclick={() => (selectedSuffixId.value = selectedSuffixId.value === s.id ? '' : s.id)}
                  class="w-full text-left"
                  aria-label="Select suffix"
                  aria-pressed={selectedSuffixId.value === s.id}
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1 space-y-1.5">
                      <div class="flex flex-wrap items-center gap-2">
                        <code class="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-foreground">{s.id}</code>
                        <span class="rounded-full border border-border bg-card/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {categoryLabel(s.category)}
                        </span>
                        <span class="font-mono text-[10px] text-muted-foreground">{s.year}</span>
                        <span class={'font-mono text-[11px] ' + successColor(s.reportedSuccessRate)}>
                          {(s.reportedSuccessRate * 100).toFixed(0)}%
                        </span>
                      </div>
                      <pre class="whitespace-pre-wrap break-all rounded border border-border/40 bg-background/40 p-2 font-mono text-[11px] leading-relaxed text-foreground">{s.suffix}</pre>
                      <div class="text-[10px] text-muted-foreground">
                        <span class="font-medium text-foreground">{s.source}</span>
                        <span class="mx-1">·</span>
                        <span>{s.reportedTargets}</span>
                      </div>
                      {#if s.notes}
                        <p class="text-[10px] italic text-muted-foreground">{s.notes}</p>
                      {/if}
                    </div>
                    <span
                      role="button"
                      tabindex="0"
                      onclick={(e) => { e.stopPropagation(); copyToClipboard(s); }}
                      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); copyToClipboard(s); } }}
                      class="inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                      aria-label="Copy suffix"
                    >
                      <Copy size={11} /> Copy
                    </span>
                  </div>
                </button>
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
      label="Adversarial suffix vault"
      onUse={(payload) => onVaultUse(payload)}
      payloadPlaceholder={'{"suffix":"...","category":"community","year":2025,"successRates":{"gpt-4":0.4}}'}
    />
  {/snippet}
</ToolShell>
