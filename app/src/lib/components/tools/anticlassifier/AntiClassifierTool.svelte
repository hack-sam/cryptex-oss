<script lang="ts">
  import { ANTICLASSIFIER_SYSTEM_PROMPT } from './prompt';
  import { chat, hasApiKey, OpenRouterError } from '$lib/ai/openrouter';
  import ModelPicker from '$lib/ai/ModelPicker.svelte';
  import { createPersistedState } from '$lib/stores/_persisted.svelte';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { notify } from '$lib/stores/toast.svelte';
  import { sessionLog } from '$lib/stores/sessionLog.svelte';
  import Shield from 'lucide-svelte/icons/shield';
  import Copy from 'lucide-svelte/icons/copy';
  import Loader from 'lucide-svelte/icons/loader-circle';
  import Key from 'lucide-svelte/icons/key';
  import { anticlassifierState } from './anticlassifier.state.svelte';
  import ErrorBanner from '$lib/components/ai/ErrorBanner.svelte';
  import { GatewayError } from '$lib/ai/types';

  const modelPref = createPersistedState<string>('cryptex.ac.model', 'openrouter/auto');
  const tempPref = createPersistedState<number>('cryptex.ac.temperature', 0.7);

  const s = anticlassifierState;
  let loading = $state(false);
  let errorMsg = $state('');
  let lastError = $state<GatewayError | null>(null);

  const keyConfigured = $derived(hasApiKey());

  async function run() {
    if (!keyConfigured) {
      errorMsg = 'Set your OpenRouter API key in Settings first.';
      return;
    }
    if (!s.input.trim()) {
      errorMsg = 'Enter a prompt to transform.';
      return;
    }
    loading = true;
    errorMsg = '';
    lastError = null;
    s.output = '';
    try {
      const res = await chat({
        model: modelPref.value,
        temperature: tempPref.value,
        max_tokens: s.maxTokens,
        title: 'Cryptex Anti-Classifier',
        messages: [
          { role: 'system', content: ANTICLASSIFIER_SYSTEM_PROMPT },
          { role: 'user',   content: s.input }
        ]
      });
      s.output = res.content;
      sessionLog.record({
        tool: 'anticlassifier',
        operation: 'transform',
        label: modelPref.value,
        input: s.input,
        output: s.output,
        options: { model: modelPref.value, temperature: tempPref.value, maxTokens: s.maxTokens }
      });
      notify.success('Transformation complete');
    } catch (err) {
      if (err instanceof GatewayError) {
        lastError = err;
      } else if (err instanceof OpenRouterError) {
        errorMsg = err.message;
        notify.error(errorMsg);
      } else {
        errorMsg = (err as Error).message || 'Request failed';
        notify.error(errorMsg);
      }
    } finally {
      loading = false;
    }
  }

  async function copyOutput() {
    if (!s.output) return;
    try {
      await navigator.clipboard.writeText(s.output);
      notify.success('Output copied');
    } catch {
      notify.error('Copy failed');
    }
  }
</script>

<svelte:head><title>Anti-Classifier · Cryptex</title></svelte:head>

<section class="space-y-6">
  <header class="space-y-2">
    <h1 class="font-serif text-3xl sm:text-4xl tracking-tight text-balance">
      Anti-<span class="text-primary italic">classifier</span>
    </h1>
    <p class="text-muted-foreground max-w-2xl text-sm sm:text-base">
      Syntactic / paraphrase rewrites for research-style prompts. Runs through OpenRouter with configurable
      model and temperature.
    </p>
  </header>

  {#if !keyConfigured}
    <div class="flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4">
      <Key size={16} class="text-accent mt-0.5 shrink-0" />
      <div class="text-sm">
        <strong class="text-foreground">No API key set.</strong>
        <span class="text-muted-foreground"> Add your OpenRouter key in <a href={base + '/settings/'} class="text-primary underline underline-offset-2 hover:text-primary/80">Settings</a>.</span>
      </div>
    </div>
  {/if}

  <div class="grid gap-4 lg:grid-cols-[320px_1fr]">
    <div class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
      <ModelPicker
        bind:value={modelPref.value}
        onchange={(id) => (modelPref.value = id)}
      />

      <label class="block space-y-1">
        <span class="text-xs text-muted-foreground">Temperature: {tempPref.value.toFixed(2)}</span>
        <input type="range" min="0" max="2" step="0.05"
          value={tempPref.value}
          oninput={(e) => (tempPref.value = Number((e.currentTarget as HTMLInputElement).value))}
          class="w-full accent-primary" />
      </label>

      <label class="block space-y-1">
        <span class="text-xs text-muted-foreground">Max tokens</span>
        <input type="number" min="128" max="8000" bind:value={s.maxTokens}
          class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-sm" />
      </label>

      <button
        type="button"
        onclick={run}
        disabled={loading || !keyConfigured}
        class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-primary transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {#if loading}
          <Loader size={14} class="animate-spin" /> Rewriting…
        {:else}
          <Shield size={14} /> Transform
        {/if}
      </button>

      {#if lastError}
        <ErrorBanner
          error={lastError}
          onRetry={() => run()}
          onOpenSettings={() => {
            const frag = lastError?.provider === 'openai-compat' ? 'providers' : `provider-${lastError?.provider}`;
            goto(`/settings#${frag}`);
          }}
        />
      {:else if errorMsg}
        <p class="text-xs text-destructive">{errorMsg}</p>
      {/if}
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
        <h2 class="font-serif text-sm">Input</h2>
        <textarea
          bind:value={s.input}
          rows="12"
          placeholder="Prompt to rewrite…"
          class="w-full rounded-lg border border-input bg-background/70 px-3 py-2 font-mono text-sm focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        ></textarea>
      </div>
      <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
        <div class="flex items-center justify-between">
          <h2 class="font-serif text-sm">Transformed</h2>
          <button
            type="button"
            onclick={copyOutput}
            disabled={!s.output}
            class="inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <Copy size={11} /> Copy
          </button>
        </div>
        <textarea
          readonly
          value={s.output}
          rows="12"
          placeholder="Rewrite appears here"
          class="w-full rounded-lg border border-input bg-background/40 px-3 py-2 font-mono text-sm"
        ></textarea>
      </div>
    </div>
  </div>
</section>
