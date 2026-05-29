<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { theme, apply as applyTheme } from '$lib/stores/theme.svelte';
  import { favorites } from '$lib/stores/favorites.svelte';
  import { lastUsed } from '$lib/stores/lastUsed.svelte';
  import { sessionLog } from '$lib/stores/sessionLog.svelte';
  import { notify } from '$lib/stores/toast.svelte';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Sun from 'lucide-svelte/icons/sun';
  import Moon from 'lucide-svelte/icons/moon';
  import Monitor from 'lucide-svelte/icons/monitor';
  import KeyRound from 'lucide-svelte/icons/key-round';
  import Database from 'lucide-svelte/icons/database';
  import Palette from 'lucide-svelte/icons/palette';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import Cloud from 'lucide-svelte/icons/cloud';
  import ProvidersPanel from '$lib/components/settings/ProvidersPanel.svelte';
  import CloudSyncPanel from '$lib/components/settings/CloudSyncPanel.svelte';
  import { createPersistedState } from '$lib/stores/_persisted.svelte';
  import { APP_VERSION } from '$lib/config/version';
  import { clearUpdateCheckCache } from '$lib/release/update-check';

  const updateCheckEnabled = createPersistedState<boolean>('cryptex.updateCheck.enabled', true);

  type SectionId = 'providers' | 'cloud-sync' | 'theme' | 'data';

  const sections: Array<{ id: SectionId; label: string; icon: typeof KeyRound; visible: () => boolean }> = [
    { id: 'providers',  label: 'AI Providers', icon: KeyRound, visible: () => true },
    { id: 'cloud-sync', label: 'Cloud Sync',   icon: Cloud,    visible: () => true },
    { id: 'theme',      label: 'Appearance',   icon: Palette,  visible: () => true },
    { id: 'data',       label: 'Local Data',   icon: Database, visible: () => true }
  ];

  const visibleSections = $derived(sections.filter((s) => s.visible()));
  let active = $state<SectionId>('providers');

  function setActive(id: SectionId) {
    active = id;
    // Update hash without forcing a scroll; nice for deep-linking + back-button.
    if (typeof window !== 'undefined') {
      history.replaceState(null, '', `${window.location.pathname}#${id}`);
    }
  }

  function applyHashIfPresent(hash: string) {
    if (!hash) return;
    const target = (hash.startsWith('#') ? hash.slice(1) : hash) as SectionId;
    if (visibleSections.some((s) => s.id === target)) {
      active = target;
    } else {
      // Legacy deep links (e.g. #providers, #provider-anthropic) — still navigate
      // to providers panel, then try to scroll to the matching anchor.
      if (target.startsWith('provider')) {
        active = 'providers';
        void tick().then(() => {
          const el = document.getElementById(target);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-highlight');
            setTimeout(() => el.classList.remove('ring-highlight'), 2000);
          }
        });
      }
    }
  }

  onMount(() => {
    applyHashIfPresent(window.location.hash);
  });
  afterNavigate(({ type, to }) => {
    if (type === 'link' || type === 'goto') applyHashIfPresent(to?.url.hash ?? '');
  });

  function setMode(m: 'light' | 'dark' | 'system') {
    theme.set(m);
    applyTheme();
  }

  function clearRecent() {
    lastUsed.clear();
    notify.info('Recent transforms cleared');
  }

  function clearFavorites() {
    favorites.items.forEach((n) => favorites.remove(n));
    notify.info('Favorites cleared');
  }

  function clearHistory() {
    sessionLog.clear();
    notify.info('Session history cleared');
  }

  const themeModes: Array<{ id: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }> = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor }
  ];
</script>

<svelte:head><title>Settings · Cryptex</title></svelte:head>

<section class="space-y-6">
  <header class="space-y-2">
    <h1 class="font-serif text-3xl sm:text-4xl tracking-tight text-balance">
      Settings
    </h1>
    <p class="text-muted-foreground max-w-2xl text-sm sm:text-base">
      Everything stays local. API keys are stored only in your browser and sent directly to the provider you configure.
    </p>
  </header>

  <div class="grid gap-6 lg:grid-cols-[240px_1fr]">
    <!-- Sidebar nav -->
    <aside class="lg:sticky lg:top-20 lg:self-start">
      <nav aria-label="Settings sections" class="rounded-xl border border-border bg-card/60 p-2 shadow-glass">
        <ul class="flex flex-col gap-0.5 cryptex-scroll">
          {#each visibleSections as s (s.id)}
            <li class="w-full">
              <button
                type="button"
                onclick={() => setActive(s.id)}
                class={active === s.id
                  ? 'flex min-h-11 w-full items-center gap-2 rounded-lg bg-primary/15 px-3 py-2 text-sm font-medium text-primary sm:min-h-9'
                  : 'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:min-h-9'}
                aria-current={active === s.id ? 'page' : undefined}
              >
                <s.icon size={14} />
                <span>{s.label}</span>
              </button>
            </li>
          {/each}
        </ul>
      </nav>

      <div class="mt-3 hidden lg:block rounded-xl border border-border/40 bg-background/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <p class="flex items-center gap-1.5">
          <Sparkles size={11} class="text-primary" />
          <span class="font-medium text-foreground">Local-first</span>
        </p>
        <p>No telemetry. No analytics. Keys never leave your browser.</p>
      </div>
    </aside>

    <!-- Content panel -->
    <div class="min-w-0 space-y-6">
      {#if active === 'providers'}
        <ProvidersPanel />
      {:else if active === 'cloud-sync'}
        <CloudSyncPanel />
      {:else if active === 'theme'}
        <div class="space-y-3 rounded-xl border border-border bg-card/60 p-5 shadow-glass">
          <div class="flex items-center gap-2">
            <Palette size={16} class="text-primary" />
            <h2 class="font-serif text-lg">Appearance</h2>
          </div>
          <p class="text-sm text-muted-foreground">
            Pick a theme. <span class="font-medium text-foreground">System</span> follows your OS preference.
          </p>
          <div class="inline-flex gap-1 rounded-lg border border-border bg-card/40 p-1">
            {#each themeModes as m (m.id)}
              <button
                type="button"
                onclick={() => setMode(m.id)}
                class={theme.mode === m.id
                  ? 'inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground'
                  : 'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground'}
              >
                <m.icon size={14} />
                {m.label}
              </button>
            {/each}
          </div>
          <p class="text-xs text-muted-foreground">
            Currently resolved as <strong class="text-foreground">{theme.resolved}</strong>.
          </p>
        </div>
      {:else if active === 'data'}
        <div class="space-y-3 rounded-xl border border-border bg-card/60 p-5 shadow-glass">
          <div class="flex items-center gap-2">
            <Database size={16} class="text-primary" />
            <h2 class="font-serif text-lg">Local data</h2>
          </div>
          <p class="text-sm text-muted-foreground">
            Cryptex stores favorites, recent transforms, and session activity in your browser. Clear any of them below.
          </p>
          <div class="divide-y divide-border/50 rounded-lg border border-border/60 bg-background/30">
            <div class="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <div class="font-medium">Favorites</div>
                <div class="text-xs text-muted-foreground">{favorites.items.length} pinned transforms</div>
              </div>
              <button
                type="button"
                onclick={clearFavorites}
                disabled={favorites.items.length === 0}
                class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <Trash2 size={12} /> Clear
              </button>
            </div>
            <div class="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <div class="font-medium">Recently used</div>
                <div class="text-xs text-muted-foreground">{lastUsed.ordered.length} recent transforms tracked</div>
              </div>
              <button
                type="button"
                onclick={clearRecent}
                disabled={lastUsed.ordered.length === 0}
                class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <Trash2 size={12} /> Clear
              </button>
            </div>
            <div class="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <div class="font-medium">Session history</div>
                <div class="text-xs text-muted-foreground">{sessionLog.size} entries (visible in the History drawer)</div>
              </div>
              <button
                type="button"
                onclick={clearHistory}
                disabled={sessionLog.size === 0}
                class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <Trash2 size={12} /> Clear
              </button>
            </div>
          </div>

          <div class="mt-4 space-y-2">
            <div class="flex items-center gap-2">
              <Sparkles size={14} class="text-primary" />
              <h3 class="font-serif text-sm">Release notifications</h3>
            </div>
            <p class="text-xs text-muted-foreground">
              Running <strong class="text-foreground">v{APP_VERSION}</strong>. Cryptex can check
              <a class="text-primary hover:underline" href="https://github.com/m4xx101/cryptex-oss/releases" target="_blank" rel="noreferrer noopener">GitHub Releases</a>
              on launch to let you know when a newer self-host image is available.
            </p>
            <label class="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-background/40 p-3 text-sm">
              <input
                type="checkbox"
                bind:checked={updateCheckEnabled.value}
                class="h-4 w-4 accent-primary"
              />
              <span class="flex-1">
                <span class="font-medium">Check for updates on launch</span>
                <span class="block text-xs text-muted-foreground">One outbound GET to <code class="rounded bg-muted/40 px-1">api.github.com</code> per session, cached 6 hours. No tracking; turn off to disable.</span>
              </span>
              <button
                type="button"
                onclick={() => { clearUpdateCheckCache(); notify.success('Update-check cache cleared.'); }}
                class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card/40 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Re-check now
              </button>
            </label>
          </div>
        </div>
      {/if}
    </div>
  </div>
</section>

<style>
  :global(.ring-highlight) {
    outline: 2px solid #6366f1;
    outline-offset: 2px;
    animation: ring-pulse 2s ease-out forwards;
  }
  @keyframes ring-pulse {
    0%   { outline-color: #6366f1; }
    100% { outline-color: transparent; }
  }
</style>
