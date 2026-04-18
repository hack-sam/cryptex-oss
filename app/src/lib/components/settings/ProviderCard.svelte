<script lang="ts">
  import type { ProviderRecord } from '$lib/ai/types';
  import { updateProvider, removeProvider } from '$lib/ai/providers.svelte';
  import { scheduleValidate, verifyNow, subscribeValidation } from '$lib/ai/validate';
  import { validateKey as gatewayValidate } from '$lib/ai/gateway';
  import { getPreset } from '$lib/ai/presets';
  import ErrorBanner from '$lib/components/ai/ErrorBanner.svelte';
  import { GatewayError } from '$lib/ai/types';
  import Eye from 'lucide-svelte/icons/eye';
  import EyeOff from 'lucide-svelte/icons/eye-off';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import CircleX from 'lucide-svelte/icons/circle-x';
  import Loader from 'lucide-svelte/icons/loader-circle';
  import ExternalLink from 'lucide-svelte/icons/external-link';

  type Props = { record: ProviderRecord; onRemove?: () => void };
  let { record, onRemove }: Props = $props();

  let showKey = $state(false);
  // keyInput seeds from the prop's initial value; the user edits it locally before blur-saving
  // svelte-ignore state_referenced_locally
  let keyInput = $state(record.apiKey);
  let validating = $state(false);
  let verifiedAt = $state<number | null>(null);
  let lastError = $state<GatewayError | null>(null);

  const instanceId = $derived(record.id === 'openai-compat' ? (record as { instanceId: string }).instanceId : undefined);
  const preset = $derived(record.id === 'openai-compat' ? getPreset((record as { presetId: string }).presetId) : undefined);

  // Subscribe to validation outcomes for this provider instance.
  $effect(() => {
    const unsub = subscribeValidation(record.id, instanceId, (r) => {
      validating = false;
      if ('error' in r) {
        lastError = r.error instanceof GatewayError ? r.error : new GatewayError('validation failed', { category: 'unknown', provider: record.id });
      } else {
        lastError = null; verifiedAt = Date.now();
      }
    });
    return () => unsub();
  });

  function onBlur() {
    const candidate = keyInput.trim();
    if (!candidate || (candidate === record.apiKey && verifiedAt)) return;
    updateProvider(record.id, { apiKey: candidate } as never, instanceId);
    if (record.id === 'openai-compat' && !preset?.supportsAuthProbe) return; // wait for explicit Verify
    const probeFn = (k: string, signal: AbortSignal) => gatewayValidate(record.id, k, { instanceId, signal });
    lastError = null;
    const enqueued = scheduleValidate(record.id, instanceId, candidate, probeFn);
    if (enqueued) validating = true;
    // If not enqueued (lockout/throttle), keep prior verified state; don't spin.
  }

  async function verifyClick() {
    validating = true; lastError = null;
    try {
      await verifyNow(record.id, instanceId, keyInput.trim(), (k, s) => gatewayValidate(record.id, k, { instanceId, signal: s }));
      verifiedAt = Date.now();
    } catch (e) {
      lastError = e instanceof GatewayError ? e : new GatewayError('verification failed', { category: 'unknown', provider: record.id });
    } finally {
      validating = false;
    }
  }

  function remove() {
    if (!confirm(`Remove ${(record as { name?: string }).name ?? record.id}?`)) return;
    removeProvider(record.id, instanceId);
    onRemove?.();
  }

  function providerDisplayName(): string {
    if (record.id === 'openrouter') return 'OpenRouter';
    if (record.id === 'anthropic') return 'Anthropic';
    return (record as { name?: string }).name ?? record.id;
  }
</script>

<div id={`provider-${record.id}${instanceId ? '-' + instanceId : ''}`} class="glass rounded-lg border border-white/10 p-4 space-y-3">
  <div class="flex items-center justify-between">
    <h3 class="font-semibold">{providerDisplayName()}</h3>
    <button type="button" onclick={remove} class="text-muted-foreground hover:text-destructive" aria-label="Remove provider">
      <Trash2 class="h-4 w-4" />
    </button>
  </div>

  <label class="block text-sm">
    <span class="text-muted-foreground">API key</span>
    <div class="mt-1 flex gap-2">
      <input
        type={showKey ? 'text' : 'password'}
        bind:value={keyInput}
        onblur={onBlur}
        placeholder="sk-..."
        class="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-xs"
        autocomplete="off"
        spellcheck="false"
      />
      <button type="button" onclick={() => showKey = !showKey} class="text-muted-foreground" aria-label={showKey ? 'Hide key' : 'Show key'}>
        {#if showKey}<EyeOff class="h-4 w-4" />{:else}<Eye class="h-4 w-4" />{/if}
      </button>
      {#if record.id === 'openai-compat' && !preset?.supportsAuthProbe}
        <button type="button" onclick={verifyClick} class="text-sm text-primary underline">Verify</button>
      {/if}
    </div>
  </label>

  <div class="flex items-center gap-2 text-xs text-muted-foreground">
    {#if validating}
      <Loader class="h-3 w-3 animate-spin" /> Validating…
    {:else if lastError}
      <CircleX class="h-3 w-3 text-red-400" /> {lastError.category}
    {:else if verifiedAt}
      <CircleCheck class="h-3 w-3 text-emerald-400" /> Verified
    {/if}
  </div>

  {#if lastError}
    <ErrorBanner
      error={lastError}
      providerName={providerDisplayName()}
      onRetry={() => verifyClick()}
      onLearnWhy={record.id === 'openai-compat'
        ? () => window.open('https://github.com/cryptex-app/cryptex/blob/master/docs/CUSTOM-ENDPOINTS.md', '_blank')
        : undefined}
    />
  {/if}

  {#if record.id === 'openai-compat' && preset && preset.docsUrl}
    <a href={preset.docsUrl} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      {preset.name} API docs <ExternalLink class="h-3 w-3" />
    </a>
  {/if}
</div>
