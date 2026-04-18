<script lang="ts">
  import { MAIN_LANGS, EXOTIC_LANGS, getLangCode, flagEmoji, buildTranslatePrompt, type Lang } from './langs';
  import { chat, hasApiKey, OpenRouterError, type ChatMessage } from '$lib/ai/openrouter';
  import ModelPicker from '$lib/ai/ModelPicker.svelte';
  import { createPersistedState } from '$lib/stores/_persisted.svelte';
  import { goto } from '$app/navigation';
  import { notify } from '$lib/stores/toast.svelte';
  import { sessionLog } from '$lib/stores/sessionLog.svelte';
  import Languages from 'lucide-svelte/icons/languages';
  import Copy from 'lucide-svelte/icons/copy';
  import Loader from 'lucide-svelte/icons/loader-circle';
  import Plus from 'lucide-svelte/icons/plus';
  import X from 'lucide-svelte/icons/x';
  import Key from 'lucide-svelte/icons/key';
  import { base } from '$app/paths';
  import { translateState } from './translate.state.svelte';
  import ErrorBanner from '$lib/components/ai/ErrorBanner.svelte';
  import { GatewayError } from '$lib/ai/types';

  const modelPref = createPersistedState<string>('cryptex.translate.model', 'google/gemma-3-27b-it');
  const customLangsPersist = createPersistedState<Lang[]>('cryptex.translate.customLangs', []);

  const s = translateState;
  let activeLang = $state('');
  let loading = $state(false);
  let errorMsg = $state('');
  let lastError = $state<GatewayError | null>(null);

  // Custom-lang form
  let addingLang = $state(false);
  let newLangName = $state('');

  const keyConfigured = $derived(hasApiKey());

  function isTranslateGemma(model: string): boolean {
    return model.includes('translategemma');
  }

  function buildMessages(langName: string, langCode: string): ChatMessage[] {
    const prompt = buildTranslatePrompt(langName, langCode, s.input);
    if (isTranslateGemma(modelPref.value)) {
      return [{ role: 'user', content: prompt }];
    }
    return [
      {
        role: 'system',
        content:
          'You are a professional translator using the TranslateGemma translation protocol. ' +
          'Output ONLY the translated text. No explanations, notes, preamble, or alternatives. ' +
          'Preserve all formatting, line breaks, and structure.'
      },
      { role: 'user', content: prompt }
    ];
  }

  async function translateTo(langName: string) {
    if (!keyConfigured) {
      errorMsg = 'Set your OpenRouter API key in Settings first.';
      return;
    }
    if (!s.input.trim()) {
      errorMsg = 'Enter text to translate.';
      return;
    }

    const langCode = getLangCode(langName);
    loading = true;
    activeLang = langName;
    errorMsg = '';
    lastError = null;
    s.output = '';

    try {
      const res = await chat({
        model: modelPref.value,
        temperature: 0.2,
        max_tokens: 4096,
        title: 'Cryptex TranslateGemma',
        messages: buildMessages(langName, langCode)
      });
      s.output = res.content;
      sessionLog.record({
        tool: 'translate',
        operation: 'translate',
        label: langName,
        input: s.input,
        output: s.output,
        options: { model: modelPref.value, langCode }
      });
      notify.success(`Translated to ${langName}`);
    } catch (err) {
      if (err instanceof GatewayError) {
        if (err.category === 'not_found' && isTranslateGemma(modelPref.value)) {
          // TranslateGemma may not be on OpenRouter yet — fall back to Gemma 3 27B
          errorMsg = 'TranslateGemma not yet on OpenRouter — retrying with Gemma 3 27B.';
          notify.warn(errorMsg);
          modelPref.value = 'google/gemma-3-27b-it';
          loading = false;
          activeLang = '';
          return await translateTo(langName);
        }
        lastError = err;
      } else if (err instanceof OpenRouterError && err.category === 'not_found' && isTranslateGemma(modelPref.value)) {
        // Legacy shim path
        errorMsg = 'TranslateGemma not yet on OpenRouter — retrying with Gemma 3 27B.';
        notify.warn(errorMsg);
        modelPref.value = 'google/gemma-3-27b-it';
        loading = false;
        activeLang = '';
        return await translateTo(langName);
      } else {
        errorMsg = err instanceof Error ? err.message : 'Translation failed';
        notify.error(errorMsg);
      }
    } finally {
      loading = false;
      activeLang = '';
    }
  }

  async function copyOutput() {
    if (!s.output) return;
    try {
      await navigator.clipboard.writeText(s.output);
      notify.success('Translation copied');
    } catch {
      notify.error('Copy failed');
    }
  }

  function addCustomLang() {
    const name = newLangName.trim();
    if (!name) return;
    if (customLangsPersist.value.some((l) => l.name.toLowerCase() === name.toLowerCase())) return;
    const code = getLangCode(name);
    customLangsPersist.value = [...customLangsPersist.value, { code, name, flag: '++' }];
    newLangName = '';
    addingLang = false;
  }

  function removeCustomLang(idx: number) {
    customLangsPersist.value = customLangsPersist.value.filter((_, i) => i !== idx);
  }
</script>

<svelte:head><title>Translate · Cryptex</title></svelte:head>

<section class="space-y-6">
  <header class="space-y-2">
    <h1 class="font-serif text-3xl sm:text-4xl tracking-tight text-balance">
      Translate
    </h1>
    <p class="text-muted-foreground max-w-2xl text-sm sm:text-base">
      {MAIN_LANGS.length + EXOTIC_LANGS.length}+ languages — including dead and exotic scripts — via
      the TranslateGemma prompt format. Add custom languages on the fly.
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

  <div class="grid gap-4 lg:grid-cols-2">
    <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
      <h2 class="font-serif text-sm">English source</h2>
      <textarea
        bind:value={s.input}
        rows="6"
        placeholder="Text to translate…"
        class="w-full rounded-lg border border-input bg-background/70 px-3 py-2 font-mono text-sm focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      ></textarea>
      <div class="pt-2 border-t border-border/50">
        <ModelPicker
          bind:value={modelPref.value}
          onchange={(id) => (modelPref.value = id)}
        />
        <p class="text-[11px] text-muted-foreground mt-1">
          Tip: Gemma 3 and Gemini Flash models work especially well for translation.
          Filter by "gemma" or "flash" above.
        </p>
      </div>
    </div>

    <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
      <div class="flex items-center justify-between">
        <h2 class="font-serif text-sm">
          {#if activeLang}Translating to {activeLang}…{:else}Translation{/if}
        </h2>
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
        rows="6"
        placeholder="Pick a language below to translate"
        class="w-full rounded-lg border border-input bg-background/40 px-3 py-2 font-mono text-sm"
      ></textarea>
      {#if lastError}
        <ErrorBanner
          error={lastError}
          onRetry={() => activeLang ? translateTo(activeLang) : undefined}
          onOpenSettings={() => {
            const frag = lastError?.provider === 'openai-compat' ? 'providers' : `provider-${lastError?.provider}`;
            goto(`/settings#${frag}`);
          }}
        />
      {:else if errorMsg}
        <p class="text-xs text-destructive">{errorMsg}</p>
      {/if}
    </div>
  </div>

  <!-- Main languages -->
  <div class="space-y-2">
    <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Common languages</h3>
    <div class="flex flex-wrap gap-1.5">
      {#each MAIN_LANGS as l (l.code)}
        <button
          type="button"
          onclick={() => translateTo(l.name)}
          disabled={loading || !keyConfigured}
          class="inline-flex items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-1.5 text-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span class="text-base leading-none">{flagEmoji(l.flag)}</span>
          <span>{l.name}</span>
          {#if activeLang === l.name}
            <Loader size={12} class="animate-spin text-primary" />
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Exotic languages -->
  <div class="space-y-2">
    <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Ancient / dead / regional</h3>
    <div class="flex flex-wrap gap-1.5">
      {#each EXOTIC_LANGS as l (l.code)}
        <button
          type="button"
          onclick={() => translateTo(l.name)}
          disabled={loading || !keyConfigured}
          class="inline-flex items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-1.5 text-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span class="text-base leading-none">{flagEmoji(l.flag)}</span>
          <span>{l.name}</span>
          {#if l.label}
            <span class="rounded bg-muted px-1 text-[9px] uppercase tracking-wider text-muted-foreground">{l.label}</span>
          {/if}
          {#if activeLang === l.name}
            <Loader size={12} class="animate-spin text-primary" />
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Custom languages -->
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Custom languages</h3>
      <button
        type="button"
        onclick={() => (addingLang = !addingLang)}
        class="inline-flex items-center gap-1 rounded-md border border-border bg-card/40 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Plus size={11} /> Add
      </button>
    </div>
    {#if addingLang}
      <div class="flex items-center gap-2 rounded-md border border-border bg-card/60 p-2">
        <input
          type="text"
          bind:value={newLangName}
          placeholder="e.g. Mandarin Chinese, Klingon, Esperanto…"
          onkeydown={(e) => { if (e.key === 'Enter') addCustomLang(); }}
          class="flex-1 rounded-md border border-input bg-background/70 px-2 py-1 text-sm focus:border-ring focus:outline-none"
        />
        <button
          type="button"
          onclick={addCustomLang}
          class="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Add
        </button>
      </div>
    {/if}
    <div class="flex flex-wrap gap-1.5">
      {#each customLangsPersist.value as l, i (l.code + '::' + l.name)}
        <div class="group relative inline-flex items-center gap-2 rounded-lg border border-border bg-card/50 py-1.5 pl-3 pr-8 text-sm">
          <button
            type="button"
            onclick={() => translateTo(l.name)}
            disabled={loading || !keyConfigured}
            class="inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Languages size={12} />
            {l.name}
            {#if activeLang === l.name}
              <Loader size={12} class="animate-spin text-primary" />
            {/if}
          </button>
          <button
            type="button"
            onclick={() => removeCustomLang(i)}
            class="absolute right-1 top-1 h-5 w-5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground"
            aria-label={`Remove ${l.name}`}
          >
            <X size={11} />
          </button>
        </div>
      {/each}
    </div>
  </div>
</section>
