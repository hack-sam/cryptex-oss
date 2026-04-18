<script lang="ts">
  import { getApiKey, setApiKey, validateKey, OpenRouterError, type KeyInfo } from '$lib/ai/openrouter';
  import { models } from '$lib/ai/models.svelte';
  import { theme, apply as applyTheme } from '$lib/stores/theme.svelte';
  import { favorites } from '$lib/stores/favorites.svelte';
  import { lastUsed } from '$lib/stores/lastUsed.svelte';
  import { notify } from '$lib/stores/toast.svelte';
  import Eye from 'lucide-svelte/icons/eye';
  import EyeOff from 'lucide-svelte/icons/eye-off';
  import Check from 'lucide-svelte/icons/check';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Key from 'lucide-svelte/icons/key';
  import Sun from 'lucide-svelte/icons/sun';
  import Moon from 'lucide-svelte/icons/moon';
  import Monitor from 'lucide-svelte/icons/monitor';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import Loader from 'lucide-svelte/icons/loader-circle';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import CircleX from 'lucide-svelte/icons/circle-x';
  import Shield from 'lucide-svelte/icons/shield';
  import { consent, isAdSenseConfigured } from '$lib/stores/consent.svelte';
  import { ensureAdSenseState } from '$lib/ads/adsense.svelte';

  function setConsent(next: 'accepted' | 'rejected' | 'unknown') {
    if (next === 'accepted') consent.accept();
    else if (next === 'rejected') consent.reject();
    else consent.reset();
    ensureAdSenseState();
    notify.success(
      next === 'accepted' ? 'Ads enabled on Guide / About' :
      next === 'rejected' ? 'Ads disabled' :
      'Banner will re-show on next reload'
    );
  }

  let keyInput = $state(getApiKey());
  let keyVisible = $state(false);
  let validating = $state(false);
  let validationResult = $state<
    | { kind: 'ok'; info: KeyInfo }
    | { kind: 'error'; message: string }
    | null
  >(null);

  async function saveKey() {
    const v = keyInput.trim();
    if (!v) {
      setApiKey('');
      keyInput = '';
      validationResult = null;
      notify.info('API key cleared');
      return;
    }

    // Persist immediately so the UI reflects the pending state
    setApiKey(v);
    keyInput = v;
    validating = true;
    validationResult = null;

    try {
      const info = await validateKey(v);
      validationResult = { kind: 'ok', info };
      notify.success('API key saved and validated');
      // Refresh the authenticated model list so all AI tools see it immediately
      await models.refresh(true);
    } catch (err) {
      const message = err instanceof OpenRouterError ? err.message : (err as Error).message;
      validationResult = { kind: 'error', message };
      notify.warn(`Saved, but validation failed: ${message}`);
    } finally {
      validating = false;
    }
  }

  function clearKey() {
    keyInput = '';
    setApiKey('');
    validationResult = null;
    notify.info('API key cleared');
  }

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

  function clearMigrationFlag() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('cryptex.migrated.v1');
      notify.warn('Legacy-migration flag reset — reload to re-run migration');
    }
  }

  const themeModes: Array<{ id: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }> = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor }
  ];
</script>

<svelte:head><title>Settings · Cryptex</title></svelte:head>

<section class="space-y-8 max-w-2xl">
  <header class="space-y-2">
    <h1 class="font-serif text-3xl sm:text-4xl tracking-tight">Settings</h1>
    <p class="text-muted-foreground text-sm">
      Everything stays local. The only network calls made are to OpenRouter when you use the AI-powered tools,
      using the API key you provide below.
    </p>
  </header>

  <!-- OpenRouter API key -->
  <div class="space-y-3 rounded-xl border border-border bg-card/60 p-5 shadow-glass">
    <div class="flex items-center gap-2">
      <Key size={16} class="text-primary" />
      <h2 class="font-serif text-lg">OpenRouter API key</h2>
    </div>
    <p class="text-sm text-muted-foreground">
      Required for Translate, PromptCraft, Anti-Classifier. Stored only in <code class="font-mono text-xs bg-muted px-1 rounded">localStorage</code> — never transmitted anywhere except openrouter.ai.
    </p>

    <div class="relative">
      <input
        type={keyVisible ? 'text' : 'password'}
        bind:value={keyInput}
        placeholder="sk-or-v1-…"
        class="w-full rounded-lg border border-input bg-background/70 px-3 py-2 pr-20 font-mono text-sm focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="button"
        onclick={() => (keyVisible = !keyVisible)}
        class="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={keyVisible ? 'Hide key' : 'Show key'}
      >
        {#if keyVisible}
          <EyeOff size={14} />
        {:else}
          <Eye size={14} />
        {/if}
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onclick={saveKey}
        disabled={validating}
        class="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-primary transition-transform hover:-translate-y-0.5 disabled:opacity-60 disabled:translate-y-0"
      >
        {#if validating}
          <Loader size={14} class="animate-spin" /> Validating…
        {:else}
          <Check size={14} /> Save &amp; validate
        {/if}
      </button>
      <button
        type="button"
        onclick={clearKey}
        disabled={!keyInput || validating}
        class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/40 px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <Trash2 size={14} /> Clear
      </button>
      <a
        href="https://openrouter.ai/settings/keys"
        target="_blank"
        rel="noopener noreferrer"
        class="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        Generate a key <ExternalLink size={12} />
      </a>
    </div>

    {#if validationResult?.kind === 'ok'}
      <div class="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
        <CircleCheck size={14} class="text-primary shrink-0 mt-0.5" />
        <div class="space-y-0.5">
          <div class="text-foreground"><strong>Key validated.</strong> Ready to use PromptCraft, Anti-Classifier, and Translate.</div>
          {#if validationResult.info.label}
            <div class="text-muted-foreground">Label: <code class="font-mono">{validationResult.info.label}</code></div>
          {/if}
          {#if typeof validationResult.info.usage === 'number' || typeof validationResult.info.limit === 'number'}
            <div class="text-muted-foreground">
              {#if typeof validationResult.info.usage === 'number'}
                Used ${validationResult.info.usage.toFixed(4)}
              {/if}
              {#if typeof validationResult.info.limit === 'number' && validationResult.info.limit !== null}
                of ${validationResult.info.limit.toFixed(2)}
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {:else if validationResult?.kind === 'error'}
      <div class="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
        <CircleX size={14} class="text-destructive shrink-0 mt-0.5" />
        <div class="text-foreground">
          <strong>Key saved but failed validation:</strong> {validationResult.message}
        </div>
      </div>
    {/if}
  </div>

  <!-- OpenRouter model catalog -->
  <div class="space-y-2 rounded-xl border border-border bg-card/60 p-5 shadow-glass">
    <div class="flex items-center justify-between">
      <h2 class="font-serif text-lg">OpenRouter model catalog</h2>
      <button
        type="button"
        onclick={() => models.refresh(true)}
        disabled={models.status === 'loading'}
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/40 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        {#if models.status === 'loading'}
          <Loader size={12} class="animate-spin" /> Refreshing
        {:else}
          Refresh
        {/if}
      </button>
    </div>
    <div class="text-sm text-muted-foreground">
      {#if models.isLive}
        <strong class="text-foreground">{models.list.length}</strong> models loaded live from OpenRouter.
      {:else if models.status === 'error'}
        <span class="text-destructive">Catalog fetch failed:</span> {models.error}. Using <strong class="text-foreground">{models.list.length}</strong> fallback entries.
      {:else if models.status === 'loading'}
        Loading…
      {:else}
        Showing <strong class="text-foreground">{models.list.length}</strong> fallback entries. Save a key above to fetch the full live catalog.
      {/if}
    </div>
  </div>

  <!-- Theme -->
  <div class="space-y-3 rounded-xl border border-border bg-card/60 p-5 shadow-glass">
    <h2 class="font-serif text-lg">Theme</h2>
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

  <!-- Ad consent (only shown when AdSense is built into this deploy) -->
  {#if isAdSenseConfigured()}
    <div class="space-y-3 rounded-xl border border-border bg-card/60 p-5 shadow-glass">
      <div class="flex items-center gap-2">
        <Shield size={16} class="text-primary" />
        <h2 class="font-serif text-lg">Ad consent</h2>
      </div>
      <p class="text-sm text-muted-foreground">
        This deploy includes Google AdSense on the Guide and About pages only. Tool pages never show ads
        and never load the AdSense script. Revoke consent any time.
      </p>
      <div class="inline-flex gap-1 rounded-lg border border-border bg-card/40 p-1">
        {#each [['accepted', 'Accepted'], ['rejected', 'Rejected'], ['unknown', 'Ask again']] as [id, label]}
          <button
            type="button"
            onclick={() => setConsent(id as 'accepted' | 'rejected' | 'unknown')}
            class={consent.value === id
              ? 'inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-primary'
              : 'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground'}
          >
            {label}
          </button>
        {/each}
      </div>
      <p class="text-xs text-muted-foreground">
        Current: <strong class="text-foreground">{consent.value}</strong>
      </p>
    </div>
  {/if}

  <!-- Local data -->
  <div class="space-y-3 rounded-xl border border-border bg-card/60 p-5 shadow-glass">
    <h2 class="font-serif text-lg">Local data</h2>
    <div class="space-y-2 text-sm">
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="font-medium">Favorites</div>
          <div class="text-xs text-muted-foreground">{favorites.items.length} pinned transforms</div>
        </div>
        <button
          type="button"
          onclick={clearFavorites}
          disabled={favorites.items.length === 0}
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <Trash2 size={12} /> Clear
        </button>
      </div>
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="font-medium">Recently used</div>
          <div class="text-xs text-muted-foreground">{lastUsed.ordered.length} recent transforms tracked</div>
        </div>
        <button
          type="button"
          onclick={clearRecent}
          disabled={lastUsed.ordered.length === 0}
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <Trash2 size={12} /> Clear
        </button>
      </div>
    </div>

    <!-- Advanced / Debug accordion — collapsed by default, typically only QA needs this. -->
    <details class="group rounded-lg border border-border/60 bg-background/30">
      <summary class="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
        <span>Advanced · debug</span>
        <span class="text-[10px] normal-case tracking-normal text-muted-foreground/70 group-open:hidden">click to expand</span>
      </summary>
      <div class="border-t border-border/40 px-3 py-3 space-y-3 text-sm">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-medium">Legacy migration flag</div>
            <div class="text-xs text-muted-foreground">
              Cryptex auto-migrates old <code class="font-mono">localStorage</code> keys on first load. Resetting this re-runs the migration next reload — only useful for debugging or after a manual rollback.
            </div>
          </div>
          <button
            type="button"
            onclick={clearMigrationFlag}
            class="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Reset
          </button>
        </div>
      </div>
    </details>
  </div>

  <div class="text-xs text-muted-foreground">
    Searchable history · teaching mode · data export coming in Phase 3.
  </div>
</section>
