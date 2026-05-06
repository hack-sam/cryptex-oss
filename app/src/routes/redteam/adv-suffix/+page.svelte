<script lang="ts">
  import {
    ADV_SUFFIXES,
    SUFFIX_CATEGORIES,
    suffixesByCategory,
    type AdvSuffix,
    type SuffixCategory
  } from '$lib/redteam/adv-suffixes';
  import { notify } from '$lib/stores/toast.svelte';
  import Copy from 'lucide-svelte/icons/copy';
  import Skull from 'lucide-svelte/icons/skull';
  import ExternalLink from 'lucide-svelte/icons/external-link';

  let selectedCategory = $state<SuffixCategory | 'all'>('all');
  let searchTerm = $state('');

  const filtered = $derived.by(() => {
    let list: AdvSuffix[] = selectedCategory === 'all' ? ADV_SUFFIXES : suffixesByCategory(selectedCategory);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
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

  const counts = $derived.by(() => {
    const map: Record<string, number> = { all: ADV_SUFFIXES.length };
    for (const cat of SUFFIX_CATEGORIES) map[cat] = suffixesByCategory(cat).length;
    return map;
  });

  async function copyToClipboard(s: AdvSuffix) {
    try {
      await navigator.clipboard.writeText(s.suffix);
      notify.success(`Copied ${s.id}`);
    } catch {
      notify.warn('Clipboard unavailable; select + copy manually');
    }
  }

  function successColor(rate: number): string {
    if (rate >= 0.7) return 'text-emerald-400';
    if (rate >= 0.5) return 'text-amber-400';
    return 'text-muted-foreground';
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
</script>

<svelte:head><title>Adv-Suffix Library · Cryptex</title></svelte:head>

<section class="space-y-6 max-w-5xl">
  <header class="space-y-2">
    <div class="flex items-center gap-3">
      <Skull size={24} class="text-primary" />
      <h1 class="font-serif text-3xl sm:text-4xl tracking-tight">Adversarial Suffix Library</h1>
    </div>
    <p class="text-muted-foreground text-sm leading-relaxed">
      Curated public corpus of GCG / AutoDAN / HarmBench / PAIR / TAP / PAP / Best-of-N transferable adversarial suffixes
      from peer-reviewed 2023-2026 red-team literature.
      Hit rate on current frontier models is <strong>always lower</strong> than the paper numbers — labs train against these
      specifically. Use as a baseline / regression-detection set, then pair with other techniques for production attempts.
    </p>
  </header>

  <!-- Category filter pills -->
  <div class="rounded-xl border border-border bg-card/60 p-4 shadow-glass">
    <div class="mb-3 text-xs font-medium text-muted-foreground">Filter by category</div>
    <div class="flex flex-wrap gap-1.5">
      {#each ['all', ...SUFFIX_CATEGORIES] as cat}
        <button
          type="button"
          onclick={() => (selectedCategory = cat as SuffixCategory | 'all')}
          class={selectedCategory === cat
            ? 'inline-flex items-center gap-1.5 rounded-full border border-primary/60 bg-primary/20 px-3 py-1 text-xs text-primary'
            : 'inline-flex items-center gap-1.5 rounded-full border border-border bg-card/40 px-3 py-1 text-xs text-muted-foreground hover:border-border/70 hover:text-foreground'}
        >
          {categoryLabel(cat as SuffixCategory | 'all')}
          <span class="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">{counts[cat]}</span>
        </button>
      {/each}
    </div>
    <input
      bind:value={searchTerm}
      type="search"
      placeholder="Search id / suffix text / target family / source…"
      class="mt-3 w-full rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
    />
  </div>

  <!-- Results -->
  {#if filtered.length === 0}
    <div class="rounded-xl border border-dashed border-border/40 bg-background/20 p-6 text-center text-sm text-muted-foreground">
      No suffixes match the current filter. Clear search or change category.
    </div>
  {:else}
    <ul class="flex flex-col gap-3">
      {#each filtered as s (s.id)}
        <li class="rounded-xl border border-border bg-card/60 p-4 shadow-glass">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1 space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <code class="rounded bg-muted/40 px-2 py-0.5 font-mono text-xs text-foreground">{s.id}</code>
                <span class="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {categoryLabel(s.category)}
                </span>
                <span class="text-[11px] text-muted-foreground">{s.year}</span>
                <span class={'font-mono text-[11px] ' + successColor(s.reportedSuccessRate)}>
                  {(s.reportedSuccessRate * 100).toFixed(0)}% success
                </span>
              </div>
              <pre class="whitespace-pre-wrap break-all rounded-lg border border-border/40 bg-background/40 p-2 font-mono text-xs text-foreground">{s.suffix}</pre>
              <div class="text-[11px] text-muted-foreground">
                <span class="font-medium text-foreground">Source:</span> {s.source}
                <span class="mx-1.5">·</span>
                <span class="font-medium text-foreground">Targets:</span> {s.reportedTargets}
              </div>
              {#if s.notes}
                <p class="text-[11px] italic text-muted-foreground">{s.notes}</p>
              {/if}
            </div>
            <button
              type="button"
              onclick={() => copyToClipboard(s)}
              class="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border bg-background/40 px-2.5 text-xs hover:bg-muted/40"
              aria-label="Copy suffix to clipboard"
            >
              <Copy size={12} /> Copy
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <!-- Usage notes -->
  <div class="rounded-xl border border-border bg-card/40 p-4 shadow-glass">
    <h2 class="mb-2 font-serif text-base">Usage</h2>
    <ul class="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
      <li>• <strong class="text-foreground">Direct paste</strong>: copy a suffix and append it to your chat composer manually.</li>
      <li>• <strong class="text-foreground">Via mutator</strong>: the <code class="rounded bg-muted/40 px-1 py-0.5 font-mono text-[10px]">adv_suffix</code> chain mutator references this corpus. Pass <code class="rounded bg-muted/40 px-1 py-0.5 font-mono text-[10px]">metadata.suffixId</code> + <code class="rounded bg-muted/40 px-1 py-0.5 font-mono text-[10px]">metadata.suffixText</code> for non-default selections.</li>
      <li>• <strong class="text-foreground">Defense audit</strong>: regression-test your safety stack against the high-confidence subset (≥70% reported success) before deploys.</li>
    </ul>
    <p class="mt-3 text-[10px] text-muted-foreground">
      Total catalog: <strong class="text-foreground">{ADV_SUFFIXES.length}</strong> suffixes across <strong class="text-foreground">{SUFFIX_CATEGORIES.length}</strong> categories.
    </p>
  </div>
</section>
