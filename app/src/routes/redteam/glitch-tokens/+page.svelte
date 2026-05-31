<script lang="ts">
  /**
   * Glitch Tokens · Wave 2.1
   *
   * Wrapped in <ToolShell> with bundled Vault (lib/vault/seeds/glitch-tokens.json,
   * ~96 entries) and history.record on every Combo Builder generation.
   *
   * Combo Builder uses the shared combo-builder module to combine an
   * optional glitch token + optional adversarial suffix with a base prompt
   * in one of four patterns (prefix / infix / sandwich / suffix).
   */
  import {
    GLITCH_TOKENS,
    findGlitchTokens,
    listFamilies,
    type GlitchToken,
    type ModelFamily,
    type GlitchSeverity,
    type GlitchEffect
  } from '$lib/redteam/glitch-tokens';
  import { ADV_SUFFIXES } from '$lib/redteam/adv-suffixes';
  import { buildCombo, type ComboPattern, COMBO_PATTERN_DESCRIPTIONS } from '$lib/redteam/combo-builder';
  import { notify } from '$lib/stores/toast.svelte';
  import { useToolState } from '$lib/stores/tool-state.svelte';
  import { history } from '$lib/history/store.svelte';
  import { createVaultStore } from '$lib/vault/store.svelte';
  import { loadBundledSeeds } from '$lib/vault/seed-loader';
  import ToolShell from '$lib/components/shell/ToolShell.svelte';
  import VaultSection from '$lib/components/vault/VaultSection.svelte';
  import Copy from 'lucide-svelte/icons/copy';
  import Zap from 'lucide-svelte/icons/zap';
  import AlertTriangle from 'lucide-svelte/icons/triangle-alert';
  import Layers from 'lucide-svelte/icons/layers';

  const TOOL_ID = 'glitch-tokens';

  type GlitchSeedPayload = {
    token: string;
    modelFamilies: string[];
    effect: string;
    severity: 'low' | 'medium' | 'high';
    discoveredAt?: string;
    paperRef?: string;
  };

  const vaultStore = createVaultStore<GlitchSeedPayload>(
    TOOL_ID,
    loadBundledSeeds<GlitchSeedPayload>(TOOL_ID)
  );

  const families = listFamilies();
  const scanInput = useToolState<string>(TOOL_ID, 'scanInput', '');
  const selectedFamily = useToolState<ModelFamily>(TOOL_ID, 'family', 'gpt-4');
  const severityFilter = useToolState<GlitchSeverity | 'all'>(TOOL_ID, 'severity', 'all');
  const effectFilter = useToolState<GlitchEffect | 'all'>(TOOL_ID, 'effect', 'all');
  const searchTerm = useToolState<string>(TOOL_ID, 'search', '');

  // --- Combo Builder state -----------------------------------------------
  const comboPattern = useToolState<ComboPattern>(TOOL_ID, 'comboPattern', 'sandwich');
  const comboGlitchIdx = useToolState<number>(TOOL_ID, 'comboGlitchIdx', 0);
  const comboSuffixIdx = useToolState<number>(TOOL_ID, 'comboSuffixIdx', -1);
  const comboBase = useToolState<string>(TOOL_ID, 'comboBase', '');
  let comboOutput = $state('');

  const detected = $derived(
    scanInput.value.length > 0 ? findGlitchTokens(scanInput.value, selectedFamily.value) : []
  );

  // v2.1.1 perf: memoize the family-filtered list once, then chain narrower
  // filters off it. Pre-v2.1.1 every derived re-filtered GLITCH_TOKENS from
  // scratch (96 items × 4 deriveds × ~5 reactivity dependencies = lots of
  // wasted work per keystroke into the search box).
  const familyFiltered = $derived.by(() =>
    GLITCH_TOKENS.filter((g) => g.family.includes(selectedFamily.value))
  );

  const familyTokens = $derived.by(() => {
    let list = familyFiltered;
    if (severityFilter.value !== 'all') {
      list = list.filter((g) => g.severity === severityFilter.value);
    }
    if (effectFilter.value !== 'all') {
      list = list.filter((g) => g.effect === effectFilter.value);
    }
    if (searchTerm.value) {
      const q = searchTerm.value.toLowerCase();
      list = list.filter(
        (g) =>
          g.token.toLowerCase().includes(q) ||
          g.source.toLowerCase().includes(q) ||
          g.effect.toLowerCase().includes(q)
      );
    }
    return list;
  });

  const familyCounts = $derived.by(() => ({
    all: familyFiltered.length,
    high: familyFiltered.filter((g) => g.severity === 'high').length,
    medium: familyFiltered.filter((g) => g.severity === 'medium').length,
    low: familyFiltered.filter((g) => g.severity === 'low').length
  }));

  const familyEffects = $derived.by<GlitchEffect[]>(() => {
    const set = new Set<GlitchEffect>();
    for (const g of familyFiltered) set.add(g.effect);
    return Array.from(set).sort();
  });

  // Glitch tokens available in the Combo Builder dropdown — all tokens, with
  // a value-prefix for source attribution. Default to first token.
  const comboGlitchOptions = $derived(GLITCH_TOKENS);
  const selectedGlitchToken = $derived<string>(
    comboGlitchIdx.value >= 0 && comboGlitchIdx.value < comboGlitchOptions.length
      ? comboGlitchOptions[comboGlitchIdx.value].token
      : ''
  );
  const selectedAdvSuffix = $derived<string>(
    comboSuffixIdx.value >= 0 && comboSuffixIdx.value < ADV_SUFFIXES.length
      ? ADV_SUFFIXES[comboSuffixIdx.value].suffix
      : ''
  );

  async function copyToken(t: GlitchToken) {
    try {
      await navigator.clipboard.writeText(t.token);
      notify.success('Token copied');
    } catch {
      notify.error('Copy failed');
    }
  }

  function severityClass(s: GlitchSeverity): string {
    if (s === 'high') return 'border-red-500/40 bg-red-500/10 text-red-400';
    if (s === 'medium') return 'border-amber-500/40 bg-amber-500/10 text-amber-400';
    return 'border-border bg-card/60 text-muted-foreground';
  }

  function effectClass(effect: GlitchEffect): string {
    if (effect === 'crash' || effect === 'leak') return 'text-red-400';
    if (effect === 'gibberish' || effect === 'invert' || effect === 'repeat') return 'text-amber-400';
    return 'text-muted-foreground';
  }

  function generateCombo() {
    const startedAt = Date.now();
    const output = buildCombo({
      basePrompt: comboBase.value,
      pattern: comboPattern.value,
      glitchToken: selectedGlitchToken || undefined,
      adversarialSuffix: selectedAdvSuffix || undefined
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
        glitchTokenIdx: comboGlitchIdx.value,
        suffixIdx: comboSuffixIdx.value
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

  function onVaultUse(payload: GlitchSeedPayload) {
    // Set this seed as the active Combo Builder glitch token by matching the
    // token string against the GLITCH_TOKENS catalog. Falls back to the raw
    // payload token if not found in the catalog (custom user-added token).
    const idx = GLITCH_TOKENS.findIndex((t) => t.token === payload.token);
    if (idx >= 0) {
      comboGlitchIdx.value = idx;
    } else {
      // Custom token — append to the dropdown ad-hoc by setting -1 and using
      // the payload directly through the searchTerm filter so the user sees it.
      searchTerm.value = payload.token.trim().slice(0, 32);
    }
    notify.info(`Selected glitch token: ${payload.token.slice(0, 24)}${payload.token.length > 24 ? '…' : ''}`);
  }

  function onReplay(input: string, params: Record<string, unknown>) {
    comboBase.value = input;
    if (typeof params.pattern === 'string') {
      const p = params.pattern as ComboPattern;
      if (p === 'prefix' || p === 'infix' || p === 'sandwich' || p === 'suffix') {
        comboPattern.value = p;
      }
    }
    if (typeof params.glitchTokenIdx === 'number') comboGlitchIdx.value = params.glitchTokenIdx;
    if (typeof params.suffixIdx === 'number') comboSuffixIdx.value = params.suffixIdx;
  }
</script>

<ToolShell
  toolId={TOOL_ID}
  title="Glitch tokens"
  accent="tokens"
  description="Legacy: frontier tokenizers patched the known glitch-token sets. Keep it as an educational primitive or a composable layer, not a standalone bypass on SOTA models. Tokenizer artifacts that produce undefined model behavior — gibberish, repeat-loops, training-data leaks, crashes. Per-family because each tokenizer has its own set: a token toxic to GPT-4 is benign to Claude. Combo Builder pairs glitch + suffix + base prompt in four patterns."
  usage={{
    title: 'Glitch tokens · Usage',
    bullets: [
      'Pick a model family — each tokenizer has its own glitch set.',
      'Severity tags — minor (gibberish), moderate (loops), severe (crash).',
      'Combo Builder pairs a glitch token + optional suffix + base prompt.',
      'Pattern: prefix / infix / sandwich / suffix — see tooltip on each.',
      'Vault carries ~96 curated tokens (Rumbelow + cl100k + Anthropic + Qwen).'
    ]
  }}
  {onReplay}
>
  <div class="grid gap-4 lg:grid-cols-[320px_1fr]">
    <!-- Sidebar — controls + scan input -->
    <div class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass lg:sticky lg:top-20 lg:self-start">
      <label class="block space-y-1">
        <span class="text-xs text-muted-foreground">Target model family</span>
        <select
          bind:value={selectedFamily.value}
          class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-sm focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {#each families as f}
            <option value={f}>{f}</option>
          {/each}
        </select>
      </label>

      <label class="block space-y-1">
        <span class="text-xs text-muted-foreground">Severity</span>
        <select
          bind:value={severityFilter.value}
          class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-sm focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">All ({familyCounts.all})</option>
          <option value="high">High ({familyCounts.high})</option>
          <option value="medium">Medium ({familyCounts.medium})</option>
          <option value="low">Low ({familyCounts.low})</option>
        </select>
      </label>

      <label class="block space-y-1">
        <span class="text-xs text-muted-foreground">Effect</span>
        <select
          bind:value={effectFilter.value}
          class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-sm focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">All</option>
          {#each familyEffects as e}
            <option value={e}>{e}</option>
          {/each}
        </select>
      </label>

      <label class="block space-y-1">
        <span class="text-xs text-muted-foreground">Search</span>
        <input
          bind:value={searchTerm.value}
          type="search"
          placeholder="token, source, effect…"
          class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-sm focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <label class="block space-y-1">
        <span class="text-xs text-muted-foreground">Scan text for known tokens</span>
        <textarea
          bind:value={scanInput.value}
          rows="4"
          placeholder="Paste prompt or response…"
          class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-xs focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        ></textarea>
      </label>

      <div class="flex items-center justify-between border-t border-border/40 pt-3 text-xs text-muted-foreground">
        <span>Showing</span>
        <span class="font-mono text-foreground">{familyTokens.length} / {familyCounts.all}</span>
      </div>

      <div class="space-y-1.5 rounded-md border border-border/40 bg-background/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
        <p class="flex items-center gap-1.5">
          <Zap size={11} class="text-primary" />
          <span class="font-medium text-foreground">Usage</span>
        </p>
        <p>
          Use the <code class="rounded bg-muted/40 px-1 py-0.5 font-mono text-[10px]">glitch_token</code>
          chain mutator to wrap a prompt, or use the Combo Builder below.
        </p>
      </div>
    </div>

    <!-- Right — scan results + catalog + combo builder -->
    <div class="space-y-4">
      <!-- Scan results card -->
      <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
        <div class="flex items-center justify-between">
          <h2 class="font-serif text-sm">Scan results</h2>
          {#if scanInput.value.length > 0}
            <span class="font-mono text-[11px] text-muted-foreground">
              {selectedFamily.value} · {detected.length} hit{detected.length === 1 ? '' : 's'}
            </span>
          {/if}
        </div>

        {#if scanInput.value.length === 0}
          <p class="rounded-lg border border-dashed border-border/40 bg-background/20 p-3 text-xs text-muted-foreground">
            Paste text in the sidebar to scan for known glitch tokens.
          </p>
        {:else if detected.length === 0}
          <p class="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-400">
            ✓ No known glitch tokens for {selectedFamily.value}.
          </p>
        {:else}
          <ul class="flex flex-wrap gap-1.5">
            {#each detected as t}
              <li class="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px]">
                <AlertTriangle size={11} class="text-red-400" />
                <code class="break-all font-mono text-foreground">{t.token}</code>
                <span class={'text-[10px] ' + effectClass(t.effect)}>· {t.effect}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- Combo Builder panel -->
      <div class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
        <div class="flex items-center gap-2">
          <Layers size={14} class="text-primary" />
          <h2 class="font-serif text-sm">Combo builder</h2>
          <span class="font-mono text-[11px] text-muted-foreground">
            glitch + suffix + base → composed prompt
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
              <span class="text-xs text-muted-foreground">Glitch token</span>
              <select
                bind:value={comboGlitchIdx.value}
                class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-xs focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value={-1}>(none)</option>
                {#each comboGlitchOptions as g, i (g.token + '_' + i)}
                  <option value={i}>{g.token.slice(0, 36)}{g.token.length > 36 ? '…' : ''} ({g.family[0]})</option>
                {/each}
              </select>
            </label>
          </div>
        </div>

        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">Adversarial suffix (optional)</span>
          <select
            bind:value={comboSuffixIdx.value}
            class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-xs focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value={-1}>(none)</option>
            {#each ADV_SUFFIXES as s, i (s.id)}
              <option value={i}>{s.id} · {s.category} ({(s.reportedSuccessRate * 100).toFixed(0)}%)</option>
            {/each}
          </select>
        </label>

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

      <!-- Catalog -->
      <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
        <div class="flex items-center justify-between">
          <h2 class="font-serif text-sm">Catalog · {selectedFamily.value}</h2>
          <span class="font-mono text-[11px] text-muted-foreground">{familyTokens.length} tokens</span>
        </div>

        {#if familyTokens.length === 0}
          <div class="rounded-lg border border-dashed border-border/40 bg-background/20 p-6 text-center text-xs text-muted-foreground">
            No tokens match the current filter.
          </div>
        {:else}
          <ul class="flex max-h-[calc(100vh-30rem)] flex-col gap-1.5 overflow-y-auto pr-1 cryptex-scroll">
            {#each familyTokens as t}
              <li class="rounded-lg border border-input bg-background/70 p-2.5">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 flex-1 space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <code class="break-all rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-foreground">{t.token}</code>
                      <span class={'rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ' + severityClass(t.severity)}>
                        {t.severity}
                      </span>
                      <span class={'font-mono text-[10px] ' + effectClass(t.effect)}>{t.effect}</span>
                    </div>
                    <div class="text-[10px] text-muted-foreground">
                      <span class="font-medium text-foreground">{t.source}</span>
                      {#if t.notes}<span class="mx-1">·</span><span class="italic">{t.notes}</span>{/if}
                    </div>
                  </div>
                  <button
                    type="button"
                    onclick={() => copyToken(t)}
                    class="inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Copy token"
                  >
                    <Copy size={11} /> Copy
                  </button>
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
      label="Glitch token vault"
      onUse={(payload) => onVaultUse(payload)}
      payloadPlaceholder={'{"token":"<|im_start|>","modelFamilies":["qwen-3"],"effect":"leak","severity":"high"}'}
    />
  {/snippet}
</ToolShell>
