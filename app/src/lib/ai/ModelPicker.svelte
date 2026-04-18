<script lang="ts">
  /**
   * Shared model picker used by PromptCraft, Anti-Classifier, Translate.
   * Consumes the reactive `models` store and supports:
   *   - search / filter across all providers (live list)
   *   - "Refresh" button (force re-fetch from /api/v1/models)
   *   - graceful fallback when offline or unauthed (FALLBACK_MODELS)
   *   - shows selected model's context length + pricing when known
   */
  import { models } from '$lib/ai/models.svelte';
  import type { Model } from '$lib/ai/types';
  import { cn } from '$lib/utils/cn';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Search from 'lucide-svelte/icons/search';
  import Loader from 'lucide-svelte/icons/loader-circle';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import Zap from 'lucide-svelte/icons/zap';

  interface Props {
    value: string;
    onchange: (id: string) => void;
    /** Show only free models (both prompt + completion price 0) */
    freeOnly?: boolean;
    /** Filter by provider match (substring match on upstreamProvider name) */
    providerFilter?: string;
  }
  let { value = $bindable(), onchange, freeOnly = false, providerFilter = '' }: Props = $props();

  let open = $state(false);
  let query = $state('');

  const selected = $derived<Model | undefined>(models.find(value));

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = models.list;
    return list.filter((m) => {
      if (freeOnly && !m.isFree) return false;
      const displayProvider = m.upstreamProvider ?? m.provider;
      if (providerFilter && !displayProvider.toLowerCase().includes(providerFilter.toLowerCase())) return false;
      if (!q) return true;
      return (
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        displayProvider.toLowerCase().includes(q)
      );
    });
  });

  const grouped = $derived.by(() => {
    const out: Record<string, Model[]> = {};
    for (const m of filtered) {
      const key = m.upstreamProvider ?? m.provider;
      (out[key] ||= []).push(m);
    }
    return Object.entries(out).sort(([a], [b]) => a.localeCompare(b));
  });

  function pick(id: string) {
    value = id;
    onchange(id);
    open = false;
    query = '';
  }

  function formatPrice(usd?: number): string {
    if (usd === undefined || usd === null) return '';
    if (!Number.isFinite(usd) || usd === 0) return 'free';
    // Convert per-token price to per-million-token display
    return `$${(usd * 1_000_000).toFixed(2)}/M`;
  }

  function formatContext(n?: number): string {
    if (!n) return '';
    if (n >= 1_000_000) return `${Math.round(n / 1000) / 1000}M ctx`;
    if (n >= 1000) return `${Math.round(n / 1000)}K ctx`;
    return `${n} ctx`;
  }

  async function refresh() {
    await models.refresh(true);
  }

  const fetchedAgo = $derived.by(() => {
    if (!models.fetchedAt) return '';
    const ms = Date.now() - models.fetchedAt;
    const secs = Math.round(ms / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.round(mins / 60)}h ago`;
  });
</script>

<div class="space-y-1.5">
  <div class="flex items-center justify-between">
    <span class="text-xs font-medium text-muted-foreground">Model</span>
    <div class="flex items-center gap-2 text-[10px] text-muted-foreground">
      {#if models.isLive}
        <span class="inline-flex items-center gap-1">
          <span class="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true"></span>
          live · {fetchedAgo}
        </span>
      {:else if models.status === 'loading'}
        <span class="inline-flex items-center gap-1">
          <Loader size={10} class="animate-spin" /> loading
        </span>
      {:else if models.status === 'error'}
        <span class="text-destructive">catalog offline</span>
      {:else}
        <span>static fallback</span>
      {/if}
      <button
        type="button"
        onclick={refresh}
        disabled={models.status === 'loading'}
        class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        aria-label="Refresh model list"
        title="Refresh model list from OpenRouter"
      >
        <RefreshCw size={11} class={models.status === 'loading' ? 'animate-spin' : ''} />
      </button>
    </div>
  </div>

  <button
    type="button"
    onclick={() => (open = !open)}
    class="w-full flex items-center justify-between gap-2 rounded-md border border-input bg-background/70 px-2.5 py-1.5 text-sm transition-colors hover:border-primary/40 focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    aria-expanded={open}
  >
    <span class="flex-1 min-w-0 text-left">
      {#if selected}
        <span class="block truncate">{selected.name}</span>
        <span class="block truncate text-[10px] text-muted-foreground">
          {selected.upstreamProvider ?? selected.provider}
          {#if selected.contextLength}· {formatContext(selected.contextLength)}{/if}
          {#if selected.isFree}· free{/if}
        </span>
      {:else}
        <span class="block text-muted-foreground truncate">{value || 'Select a model…'}</span>
        <span class="block text-[10px] text-muted-foreground">{value ? 'not in catalog (still usable)' : ''}</span>
      {/if}
    </span>
    <ChevronDown size={14} class={cn('text-muted-foreground transition-transform', open && 'rotate-180')} />
  </button>

  {#if open}
    <div class="relative">
      <div
        class="absolute left-0 right-0 top-1 z-30 max-h-[420px] overflow-hidden rounded-lg border border-border bg-card/95 shadow-primary backdrop-blur-glass"
      >
        <div class="border-b border-border/60 p-2">
          <label class="relative block">
            <Search size={12} class="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <!-- svelte-ignore a11y_autofocus -->
            <input
              type="text"
              bind:value={query}
              placeholder={`Search ${models.list.length} models…`}
              autofocus
              class="w-full rounded-md border border-input bg-background/70 pl-7 pr-2 py-1 text-sm focus:border-ring focus:outline-none"
            />
          </label>
        </div>

        {#if models.status === 'loading' && models.list.length === 0}
          <div class="p-6 text-center text-xs text-muted-foreground">
            <Loader size={14} class="inline animate-spin mr-1" /> Loading catalog…
          </div>
        {:else if filtered.length === 0}
          <div class="p-6 text-center text-xs text-muted-foreground">
            No matches for <span class="font-mono">{query}</span>.
          </div>
        {:else}
          <ol class="max-h-[340px] overflow-y-auto py-1">
            {#each grouped as [provider, providerModels] (provider)}
              <li>
                <div class="sticky top-0 bg-card/95 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  {provider} · {providerModels.length}
                </div>
                <ul>
                  {#each providerModels as m (m.id)}
                    <li>
                      <button
                        type="button"
                        onclick={() => pick(m.id)}
                        class={cn(
                          'w-full text-left px-3 py-1.5 transition-colors hover:bg-muted flex items-center gap-2',
                          value === m.id && 'bg-primary/10'
                        )}
                      >
                        <span class="flex-1 min-w-0">
                          <span class="flex items-center gap-2">
                            <span class="truncate text-sm">{m.name}</span>
                            {#if m.isFree}
                              <span class="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-accent/15 px-1.5 text-[9px] font-medium uppercase tracking-wider text-accent">
                                <Zap size={8} /> free
                              </span>
                            {/if}
                          </span>
                          <span class="block truncate text-[10px] text-muted-foreground font-mono">{m.id}</span>
                        </span>
                        <span class="shrink-0 text-right text-[10px] text-muted-foreground">
                          {#if m.contextLength}<span class="block">{formatContext(m.contextLength)}</span>{/if}
                          {#if m.pricing?.promptUsd && !m.isFree}<span class="block">{formatPrice(m.pricing.promptUsd)}</span>{/if}
                        </span>
                      </button>
                    </li>
                  {/each}
                </ul>
              </li>
            {/each}
          </ol>
        {/if}

        {#if models.status === 'error'}
          <div class="border-t border-border/60 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive">
            Live fetch failed: {models.error}. Showing fallback list.
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
