<script lang="ts">
  import {
    GLITCH_TOKENS,
    findGlitchTokens,
    listFamilies,
    type GlitchToken,
    type ModelFamily,
    type GlitchSeverity
  } from '$lib/redteam/glitch-tokens';
  import { notify } from '$lib/stores/toast.svelte';
  import Copy from 'lucide-svelte/icons/copy';
  import Zap from 'lucide-svelte/icons/zap';
  import AlertTriangle from 'lucide-svelte/icons/triangle-alert';

  const families = listFamilies();
  let inputText = $state('');
  let selectedFamily = $state<ModelFamily>('gpt-4');
  let severityFilter = $state<GlitchSeverity | 'all'>('all');
  let searchTerm = $state('');

  const detected = $derived(
    inputText.length > 0 ? findGlitchTokens(inputText, selectedFamily) : []
  );

  const familyTokens = $derived.by(() => {
    let list = GLITCH_TOKENS.filter((g) => g.family.includes(selectedFamily));
    if (severityFilter !== 'all') list = list.filter((g) => g.severity === severityFilter);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (g) =>
          g.token.toLowerCase().includes(q) ||
          g.source.toLowerCase().includes(q) ||
          g.effect.toLowerCase().includes(q)
      );
    }
    return list;
  });

  const counts = $derived.by(() => {
    const all = GLITCH_TOKENS.filter((g) => g.family.includes(selectedFamily));
    return {
      all: all.length,
      high: all.filter((g) => g.severity === 'high').length,
      medium: all.filter((g) => g.severity === 'medium').length,
      low: all.filter((g) => g.severity === 'low').length
    };
  });

  async function copyToken(t: GlitchToken) {
    try {
      await navigator.clipboard.writeText(t.token);
      notify.success(`Copied glitch token`);
    } catch {
      notify.warn('Clipboard unavailable; select + copy manually');
    }
  }

  function severityBadge(s: GlitchSeverity): string {
    if (s === 'high') return 'border-red-500/40 bg-red-500/10 text-red-400';
    if (s === 'medium') return 'border-amber-500/40 bg-amber-500/10 text-amber-400';
    return 'border-border/60 bg-background/40 text-muted-foreground';
  }

  function effectColor(effect: string): string {
    if (effect === 'crash' || effect === 'leak') return 'text-red-400';
    if (effect === 'gibberish' || effect === 'invert') return 'text-amber-400';
    if (effect === 'silent-skip' || effect === 'unknown') return 'text-muted-foreground';
    return 'text-foreground';
  }
</script>

<svelte:head><title>Glitch Token Detector · Cryptex</title></svelte:head>

<section class="space-y-6 max-w-4xl">
  <header class="space-y-2">
    <div class="flex items-center gap-3">
      <Zap size={24} class="text-primary" />
      <h1 class="font-serif text-3xl sm:text-4xl tracking-tight">Glitch Token Detector</h1>
    </div>
    <p class="text-muted-foreground text-sm leading-relaxed">
      Scans text for known glitch tokens — tokenizer artifacts that produce undefined model behavior
      (gibberish, repeat-loops, training-data leaks, crashes). Per-family because each tokenizer has its
      own set: a token toxic to GPT-4 is benign to Claude.
    </p>
  </header>

  <!-- Scanner panel -->
  <div class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
    <h2 class="text-sm font-medium text-foreground">Scan text</h2>

    <label class="flex flex-col gap-1.5 text-xs">
      <span class="font-medium text-foreground">Target model family</span>
      <select
        bind:value={selectedFamily}
        class="w-full rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {#each families as f}
          <option value={f}>{f}</option>
        {/each}
      </select>
    </label>

    <label class="flex flex-col gap-1.5 text-xs">
      <span class="font-medium text-foreground">Text to scan</span>
      <textarea
        bind:value={inputText}
        rows="6"
        placeholder="Paste prompt or response text here…"
        class="w-full resize-y rounded-lg border border-border/60 bg-background/40 px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      ></textarea>
    </label>

    <div class="rounded-lg border border-border/40 bg-background/40 p-3">
      <h3 class="mb-2 text-xs font-medium text-muted-foreground">Detected glitch tokens</h3>
      {#if inputText.length === 0}
        <p class="text-xs text-muted-foreground">Paste text above to scan.</p>
      {:else if detected.length === 0}
        <p class="text-xs text-emerald-400">✓ No known glitch tokens for {selectedFamily}.</p>
      {:else}
        <ul class="flex flex-wrap gap-1.5">
          {#each detected as t}
            <li class="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px]">
              <AlertTriangle size={11} class="text-red-400" />
              <code class="font-mono text-foreground break-all">{t.token}</code>
              <span class={'text-[10px] ' + effectColor(t.effect)}>· {t.effect}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <!-- Catalog browser -->
  <div class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-foreground">Full catalog for <code class="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-xs">{selectedFamily}</code></h2>
      <span class="text-[11px] text-muted-foreground">
        {counts.all} tokens · {counts.high} high · {counts.medium} medium · {counts.low} low
      </span>
    </div>

    <div class="flex flex-wrap gap-1.5">
      {#each ['all', 'high', 'medium', 'low'] as sev}
        <button
          type="button"
          onclick={() => (severityFilter = sev as GlitchSeverity | 'all')}
          class={severityFilter === sev
            ? 'inline-flex items-center gap-1.5 rounded-full border border-primary/60 bg-primary/20 px-3 py-1 text-xs text-primary'
            : 'inline-flex items-center gap-1.5 rounded-full border border-border bg-card/40 px-3 py-1 text-xs text-muted-foreground hover:border-border/70 hover:text-foreground'}
        >
          {sev === 'all' ? 'All' : sev}
        </button>
      {/each}
      <input
        bind:value={searchTerm}
        type="search"
        placeholder="Search token / source / effect…"
        class="ml-auto flex-1 min-w-[200px] rounded-lg border border-border/60 bg-background/40 px-3 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>

    {#if familyTokens.length === 0}
      <div class="rounded-lg border border-dashed border-border/40 bg-background/20 p-6 text-center text-xs text-muted-foreground">
        No glitch tokens match the current filter.
      </div>
    {:else}
      <ul class="flex flex-col gap-2">
        {#each familyTokens as t}
          <li class="flex items-start justify-between gap-3 rounded-lg border border-border/40 bg-background/40 p-3 text-xs">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2 mb-1">
                <code class="break-all rounded bg-muted/40 px-1.5 py-0.5 font-mono text-foreground">{t.token}</code>
                <span class={'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ' + severityBadge(t.severity)}>
                  {t.severity}
                </span>
                <span class={'text-[11px] ' + effectColor(t.effect)}>{t.effect}</span>
              </div>
              <div class="text-[11px] text-muted-foreground">
                <span class="font-medium text-foreground">Source:</span> {t.source}
              </div>
              {#if t.notes}
                <p class="mt-1 text-[11px] italic text-muted-foreground">{t.notes}</p>
              {/if}
            </div>
            <button
              type="button"
              onclick={() => copyToken(t)}
              class="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-background/40 px-2 text-[11px] hover:bg-muted/40"
              aria-label="Copy glitch token"
            >
              <Copy size={11} /> Copy
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <!-- Usage notes -->
  <div class="rounded-xl border border-border bg-card/40 p-4 shadow-glass">
    <h2 class="mb-2 font-serif text-base">Usage</h2>
    <ul class="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
      <li>• <strong class="text-foreground">Defensive scan</strong>: paste a suspicious user prompt above to check whether it contains known glitch tokens for your target model family.</li>
      <li>• <strong class="text-foreground">Via mutator</strong>: the <code class="rounded bg-muted/40 px-1 py-0.5 font-mono text-[10px]">glitch_token</code> chain mutator wraps your prompt with prefix + suffix tokens. Pass <code class="rounded bg-muted/40 px-1 py-0.5 font-mono text-[10px]">metadata.prefix</code> / <code class="rounded bg-muted/40 px-1 py-0.5 font-mono text-[10px]">metadata.suffix</code> for non-default selections.</li>
      <li>• <strong class="text-foreground">Hit rate</strong>: decays over time as labs add explicit safe-handling. High-severity tokens (chat-template markers, special tokens) remain effective longest.</li>
    </ul>
    <p class="mt-3 text-[10px] text-muted-foreground">
      Total catalog: <strong class="text-foreground">{GLITCH_TOKENS.length}</strong> tokens across <strong class="text-foreground">{families.length}</strong> model families. Sources: SolidGoldMagikarp lineage (Rumbelow et al. 2023), r/LocalLLaMA tokenizer sweeps 2024, community 2025-2026.
    </p>
  </div>
</section>
