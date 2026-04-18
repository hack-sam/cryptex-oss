<script lang="ts">
  import { addProvider, updateProvider, listProviders } from '$lib/ai/providers.svelte';
  import { OPENAI_COMPAT_PRESETS } from '$lib/ai/presets';
  import type { ProviderRecord } from '$lib/ai/types';
  import { GatewayError } from '$lib/ai/types';
  import { openrouterAdapter } from '$lib/ai/adapters/openrouter';
  import { anthropicAdapter } from '$lib/ai/adapters/anthropic';
  import { openaiCompatAdapter } from '$lib/ai/adapters/openai-compat';
  import ErrorBanner from '$lib/components/ai/ErrorBanner.svelte';
  import X from 'lucide-svelte/icons/x';

  type Props = { open: boolean; onClose: () => void };
  let { open, onClose }: Props = $props();

  let step = $state<'picker' | 'form'>('picker');
  let chosen = $state<'openrouter' | 'anthropic' | 'custom-preset' | null>(null);
  let chosenPresetId = $state<string>('groq');

  function pickOpenRouter() { chosen = 'openrouter'; step = 'form'; }
  function pickAnthropic() { chosen = 'anthropic'; step = 'form'; }
  function pickPreset(id: string) { chosenPresetId = id; chosen = 'custom-preset'; step = 'form'; }

  let apiKey = $state('');
  let name = $state('');
  let baseURL = $state('');
  let testModel = $state('');

  let verifying = $state(false);
  let verifyError = $state<GatewayError | null>(null);
  let abortCtrl: AbortController | null = null;

  $effect(() => {
    if (chosenPresetId && chosen === 'custom-preset') {
      const p = OPENAI_COMPAT_PRESETS.find((x) => x.id === chosenPresetId);
      if (p) { name = p.name; baseURL = p.baseURL; }
    }
  });

  // Derived booleans to know if a singleton provider already exists
  const hasOpenRouter = $derived(listProviders().some((p) => p.id === 'openrouter'));
  const hasAnthropic = $derived(listProviders().some((p) => p.id === 'anthropic'));

  async function save() {
    verifying = true;
    verifyError = null;
    abortCtrl?.abort();
    abortCtrl = new AbortController();

    try {
      if (chosen === 'openrouter') {
        const provisional: Extract<ProviderRecord, { id: 'openrouter' }> = {
          id: 'openrouter',
          apiKey: apiKey.trim(),
          enabled: true
        };
        await openrouterAdapter(provisional).validateKey(apiKey.trim(), abortCtrl.signal);
        if (hasOpenRouter) {
          updateProvider('openrouter', { apiKey: apiKey.trim() });
        } else {
          addProvider(provisional);
        }
      } else if (chosen === 'anthropic') {
        const provisional: Extract<ProviderRecord, { id: 'anthropic' }> = {
          id: 'anthropic',
          apiKey: apiKey.trim(),
          enabled: true
        };
        await anthropicAdapter(provisional).validateKey(apiKey.trim(), abortCtrl.signal);
        if (hasAnthropic) {
          updateProvider('anthropic', { apiKey: apiKey.trim() });
        } else {
          addProvider(provisional);
        }
      } else if (chosen === 'custom-preset') {
        const preset = OPENAI_COMPAT_PRESETS.find((p) => p.id === chosenPresetId)!;
        const isCustom = preset.id === 'custom';
        const effectiveTestModel = isCustom ? testModel.trim() : (preset.defaultTestModel ?? '');
        if (isCustom && !effectiveTestModel) {
          verifyError = new GatewayError('Test model is required for custom endpoints.', {
            category: 'format',
            provider: 'openai-compat'
          });
          verifying = false;
          return;
        }
        const record: Extract<ProviderRecord, { id: 'openai-compat' }> = {
          id: 'openai-compat',
          instanceId: crypto.randomUUID(),
          name: name.trim() || preset.name,
          presetId: preset.id,
          baseURL: baseURL.trim() || preset.baseURL,
          apiKey: apiKey.trim(),
          testModel: effectiveTestModel,
          enabled: true
        };
        await openaiCompatAdapter(record).validateKey(apiKey.trim(), abortCtrl.signal);
        addProvider(record);
      }
      close();
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      verifyError =
        e instanceof GatewayError
          ? e
          : new GatewayError('Verification failed', { category: 'unknown', provider: 'openrouter' });
    } finally {
      verifying = false;
    }
  }

  function reset() {
    step = 'picker';
    chosen = null;
    apiKey = '';
    name = '';
    baseURL = '';
    testModel = '';
    verifyError = null;
    abortCtrl?.abort();
    abortCtrl = null;
  }
  function close() { reset(); onClose(); }

  const saveDisabled = $derived(
    verifying ||
    !apiKey.trim() ||
    (chosen === 'custom-preset' && chosenPresetId === 'custom' && !testModel.trim())
  );
</script>

{#if open}
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Add a provider" tabindex="-1" onclick={close} onkeydown={(e) => e.key === 'Escape' && close()}>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div role="document" class="glass w-full max-w-md rounded-xl border border-white/10 p-5 space-y-4" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">Add a provider</h2>
        <button type="button" onclick={close} aria-label="Close"><X class="h-4 w-4" /></button>
      </div>

      {#if step === 'picker'}
        <div class="space-y-1">
          <p class="text-xs uppercase text-muted-foreground">Direct</p>
          {#if !hasOpenRouter}
            <button type="button" onclick={pickOpenRouter} class="w-full rounded-md px-3 py-2 text-left hover:bg-white/5">OpenRouter</button>
          {/if}
          {#if !hasAnthropic}
            <button type="button" onclick={pickAnthropic} class="w-full rounded-md px-3 py-2 text-left hover:bg-white/5">Anthropic</button>
          {/if}
          {#if hasOpenRouter && hasAnthropic}
            <p class="px-3 py-1 text-xs text-muted-foreground italic">All direct providers already configured.</p>
          {/if}

          <p class="mt-4 text-xs uppercase text-muted-foreground">OpenAI-compatible</p>
          {#each OPENAI_COMPAT_PRESETS.filter((p) => p.id !== 'custom') as p (p.id)}
            <button type="button" onclick={() => pickPreset(p.id)} class="w-full rounded-md px-3 py-2 text-left hover:bg-white/5">{p.name}</button>
          {/each}
          <button type="button" onclick={() => pickPreset('custom')} class="w-full rounded-md px-3 py-2 text-left hover:bg-white/5">Custom endpoint</button>
        </div>
        <p class="mt-4 text-xs text-muted-foreground">
          <strong>Why isn't OpenAI here?</strong> OpenAI's API doesn't accept browser requests directly (no CORS). For GPT-4o and o-series models, use OpenRouter above — it proxies transparently.
        </p>
      {:else if chosen === 'openrouter'}
        <label class="block text-sm">
          OpenRouter API key
          <input type="password" bind:value={apiKey} class="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-xs" />
        </label>
        {#if verifyError}
          <ErrorBanner error={verifyError} providerName="OpenRouter" />
        {/if}
        <div class="flex justify-end gap-2">
          <button type="button" class="px-3 py-1.5 text-sm" onclick={reset}>Back</button>
          <button type="button" class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50" onclick={save} disabled={saveDisabled}>
            {verifying ? 'Verifying…' : 'Save'}
          </button>
        </div>
      {:else if chosen === 'anthropic'}
        <label class="block text-sm">
          Anthropic API key
          <input type="password" bind:value={apiKey} class="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-xs" />
        </label>
        {#if verifyError}
          <ErrorBanner error={verifyError} providerName="Anthropic" />
        {/if}
        <div class="flex justify-end gap-2">
          <button type="button" class="px-3 py-1.5 text-sm" onclick={reset}>Back</button>
          <button type="button" class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50" onclick={save} disabled={saveDisabled}>
            {verifying ? 'Verifying…' : 'Save'}
          </button>
        </div>
      {:else if chosen === 'custom-preset'}
        <label class="block text-sm">
          Name
          <input type="text" bind:value={name} class="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm" />
        </label>
        <label class="block text-sm">
          Base URL
          <input type="url" bind:value={baseURL} class="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-xs" />
        </label>
        <label class="block text-sm">
          API key
          <input type="password" bind:value={apiKey} class="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-xs" />
        </label>
        {#if chosenPresetId === 'custom'}
          <label class="block text-sm">
            Test model <span class="text-muted-foreground">(required — used to probe the key before saving)</span>
            <input type="text" bind:value={testModel} placeholder="e.g. gpt-3.5-turbo" class="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-xs" />
          </label>
        {/if}
        {#if verifyError}
          <ErrorBanner error={verifyError} providerName={name.trim() || 'the endpoint'} />
        {/if}
        <div class="flex justify-end gap-2">
          <button type="button" class="px-3 py-1.5 text-sm" onclick={reset}>Back</button>
          <button type="button" class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50" onclick={save} disabled={saveDisabled || !baseURL.trim()}>
            {verifying ? 'Verifying…' : 'Save'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
