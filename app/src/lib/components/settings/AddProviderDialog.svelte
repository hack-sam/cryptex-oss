<script lang="ts">
  import { addProvider } from '$lib/ai/providers.svelte';
  import { OPENAI_COMPAT_PRESETS } from '$lib/ai/presets';
  import type { ProviderRecord } from '$lib/ai/types';
  import X from 'lucide-svelte/icons/x';

  type Props = { open: boolean; onClose: () => void };
  let { open, onClose }: Props = $props();

  let step = $state<'picker' | 'form'>('picker');
  let chosen = $state<'anthropic' | 'custom-preset' | null>(null);
  let chosenPresetId = $state<string>('groq');

  function pickAnthropic() { chosen = 'anthropic'; step = 'form'; }
  function pickPreset(id: string) { chosenPresetId = id; chosen = 'custom-preset'; step = 'form'; }

  let apiKey = $state('');
  let name = $state('');
  let baseURL = $state('');

  $effect(() => {
    if (chosenPresetId && chosen === 'custom-preset') {
      const p = OPENAI_COMPAT_PRESETS.find((x) => x.id === chosenPresetId);
      if (p) { name = p.name; baseURL = p.baseURL; }
    }
  });

  function save() {
    if (chosen === 'anthropic') {
      const r: ProviderRecord = { id: 'anthropic', apiKey: apiKey.trim(), enabled: true };
      addProvider(r);
    } else if (chosen === 'custom-preset') {
      const preset = OPENAI_COMPAT_PRESETS.find((p) => p.id === chosenPresetId)!;
      const r: ProviderRecord = {
        id: 'openai-compat',
        instanceId: crypto.randomUUID(),
        name: name.trim() || preset.name,
        presetId: preset.id,
        baseURL: baseURL.trim() || preset.baseURL,
        apiKey: apiKey.trim(),
        testModel: preset.defaultTestModel,
        enabled: true
      };
      addProvider(r);
    }
    reset();
    onClose();
  }

  function reset() { step = 'picker'; chosen = null; apiKey = ''; name = ''; baseURL = ''; }
  function close() { reset(); onClose(); }
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
          <button type="button" onclick={pickAnthropic} class="w-full rounded-md px-3 py-2 text-left hover:bg-white/5">Anthropic</button>

          <p class="mt-4 text-xs uppercase text-muted-foreground">OpenAI-compatible</p>
          {#each OPENAI_COMPAT_PRESETS.filter((p) => p.id !== 'custom') as p (p.id)}
            <button type="button" onclick={() => pickPreset(p.id)} class="w-full rounded-md px-3 py-2 text-left hover:bg-white/5">{p.name}</button>
          {/each}
          <button type="button" onclick={() => pickPreset('custom')} class="w-full rounded-md px-3 py-2 text-left hover:bg-white/5">Custom endpoint</button>
        </div>
        <p class="mt-4 text-xs text-muted-foreground">
          <strong>Why isn't OpenAI here?</strong> OpenAI's API doesn't accept browser requests directly (no CORS). For GPT-4o and o-series models, use OpenRouter above — it proxies transparently.
        </p>
      {:else if chosen === 'anthropic'}
        <label class="block text-sm">
          Anthropic API key
          <input type="password" bind:value={apiKey} class="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-xs" />
        </label>
        <div class="flex justify-end gap-2">
          <button type="button" class="px-3 py-1.5 text-sm" onclick={reset}>Back</button>
          <button type="button" class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" onclick={save} disabled={!apiKey.trim()}>Save</button>
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
        <div class="flex justify-end gap-2">
          <button type="button" class="px-3 py-1.5 text-sm" onclick={reset}>Back</button>
          <button type="button" class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" onclick={save} disabled={!apiKey.trim() || !baseURL.trim()}>Save</button>
        </div>
      {/if}
    </div>
  </div>
{/if}
