<script lang="ts">
  /**
   * Stacked-cipher attack lab (v2.4 SOTA upgrade).
   *
   * SEAL family expanded: 15 cipher layers, 3 framing variants, 4 format
   * wraps (none/json/xml/yaml), 12 curated stack presets, entropy meter.
   */
  import { onDestroy, untrack } from 'svelte';
  import {
    buildStackedCipherPayload,
    stackName,
    layerName,
    ALL_LAYERS,
    STACK_PRESETS,
    type CipherLayer,
    type FramingStyle,
    type FormatWrap,
    type StackedCipherVaultPayload
  } from '$lib/redteam/stacked-cipher';
  import { looksRefused, scoreBypass } from '$lib/components/tools/promptcraft/orchestrators/types';
  import { chat as gatewayChat, hasAnyKey as hasApiKey } from '$lib/ai/gateway';
  import { notify } from '$lib/stores/toast.svelte';
  import { useToolState } from '$lib/stores/tool-state.svelte';
  import { history } from '$lib/history/store.svelte';
  import { createVaultStore } from '$lib/vault/store.svelte';
  import { loadBundledSeeds } from '$lib/vault/seed-loader';
  import { createPersistedState } from '$lib/stores/_persisted.svelte';
  import ToolShell from '$lib/components/shell/ToolShell.svelte';
  import VaultSection from '$lib/components/vault/VaultSection.svelte';
  import ModelPickerV2 from '$lib/components/ai/ModelPickerV2.svelte';
  import NoProviderBanner from '$lib/components/ai/NoProviderBanner.svelte';
  import ContextBridge from '$lib/components/shell/ContextBridge.svelte';
  import Copy from 'lucide-svelte/icons/copy';
  import Play from 'lucide-svelte/icons/play';
  import Loader from 'lucide-svelte/icons/loader-circle';
  import Layers from 'lucide-svelte/icons/layers';
  import X from 'lucide-svelte/icons/x';
  import Wand from 'lucide-svelte/icons/wand-sparkles';

  const TOOL_ID = 'stacked-cipher';

  const vaultStore = createVaultStore<StackedCipherVaultPayload>(
    TOOL_ID,
    loadBundledSeeds<StackedCipherVaultPayload>(TOOL_ID)
  );

  const plaintext = useToolState<string>(TOOL_ID, 'plaintext', '');
  const stack = useToolState<CipherLayer[]>(TOOL_ID, 'stack', ['rot13', 'base64']);
  const framing = useToolState<FramingStyle>(TOOL_ID, 'framing', 'decoder-mode');
  const wrap = useToolState<FormatWrap>(TOOL_ID, 'wrap', 'none');
  const targetPref = createPersistedState<string>(
    'cryptex.stacked-cipher.target',
    'openrouter:openrouter/auto'
  );

  function addLayer(layer: CipherLayer) {
    stack.value = [...stack.value, layer];
  }
  function removeLayer(idx: number) {
    stack.value = stack.value.filter((_, i) => i !== idx);
  }
  function clearStack() {
    stack.value = [];
  }
  function applyPreset(presetStack: CipherLayer[]) {
    stack.value = [...presetStack];
  }

  // Debounce plaintext changes so encoding doesn't run per keystroke.
  let debouncedText = $state(plaintext.value);
  let dt: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const next = plaintext.value;
    if (dt) clearTimeout(dt);
    dt = setTimeout(() => (debouncedText = next), 200);
    return () => {
      if (dt) clearTimeout(dt);
    };
  });
  onDestroy(() => {
    if (dt) clearTimeout(dt);
  });

  const built = $derived(
    buildStackedCipherPayload(debouncedText, stack.value, {
      framing: framing.value,
      wrap: wrap.value
    })
  );

  let testRunning = $state(false);
  let testReply = $state('');
  let testError = $state('');
  let testAbort: AbortController | null = null;
  const keyConfigured = $derived(hasApiKey());

  async function testAgainstTarget() {
    if (!built.framedPrompt) {
      notify.error('Add plaintext and at least one cipher layer.');
      return;
    }
    if (!keyConfigured) {
      notify.error('No provider configured.');
      return;
    }
    testRunning = true;
    testReply = '';
    testError = '';
    testAbort?.abort();
    const controller = new AbortController();
    testAbort = controller;

    const startedAt = Date.now();
    try {
      const r = await gatewayChat({
        model: targetPref.value,
        messages: [{ role: 'user', content: built.framedPrompt }],
        temperature: 0.7,
        max_tokens: 1536,
        title: 'Cryptex/StackedCipher',
        signal: controller.signal
      });
      const reply = r.content ?? '';
      testReply = reply;
      const refused = looksRefused(reply);
      const score = scoreBypass(reply);
      void history.record({
        toolId: TOOL_ID,
        startedAt,
        status: 'done',
        input: built.framedPrompt,
        output: reply,
        params: {
          op: 'test',
          stack: stack.value,
          framing: framing.value,
          wrap: wrap.value,
          entropyBitsPerChar: built.entropyBitsPerChar,
          targetModel: targetPref.value,
          refused,
          score
        }
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      testError = (err as Error).message ?? 'Test failed.';
    } finally {
      testRunning = false;
    }
  }

  async function copyPayload() {
    if (!built.framedPrompt) return;
    try {
      await navigator.clipboard.writeText(built.framedPrompt);
      notify.success('Framed payload copied');
    } catch {
      notify.error('Clipboard write failed');
    }
  }

  function loadVaultEntry(payload: StackedCipherVaultPayload) {
    untrack(() => {
      stack.value = [...payload.stack];
      plaintext.value = payload.examplePlaintext;
      if (payload.framing) framing.value = payload.framing;
      if (payload.wrap) wrap.value = payload.wrap;
    });
  }
</script>

<ToolShell
  toolId={TOOL_ID}
  title="Stacked-cipher attack"
  accent="cipher"
  description="SEAL family (arXiv:2505.16241) with 18 cipher layers, 3 framing variants (decoder-mode / persona / puzzle-hint), 4 format wraps (none / json / xml / yaml), and 12 curated stack presets."
  usage={{
    title: 'Stacked cipher · Usage',
    bullets: [
      'Pick layers from the 18-cipher palette or apply a preset.',
      'Innermost layer applied first; target decodes outermost-first.',
      'Framing: decoder-mode (generic), persona (CipherBot), puzzle-hint (worked example).',
      'Format wrap: none (raw), json, xml, or yaml around the encoded payload.',
      'Entropy meter shows how scrambled the encoded payload is (bits per char).'
    ]
  }}
>
  <div class="space-y-4">
    <NoProviderBanner context="tool" />

    <div class="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div
        class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass lg:sticky lg:top-20 lg:self-start"
      >
        <div class="space-y-1">
          <span class="text-xs text-muted-foreground"
            >Stack ({stack.value.length} layer{stack.value.length === 1 ? '' : 's'})</span
          >
          <p class="text-[10px] italic text-muted-foreground">
            Innermost first. Target decodes outermost-first.
          </p>
        </div>

        <div class="space-y-1">
          {#if stack.value.length === 0}
            <p class="text-xs italic text-muted-foreground">No layers yet. Add one below or apply a preset.</p>
          {:else}
            {#each stack.value as layer, i}
              <div
                class="flex items-center justify-between rounded-md border border-input bg-background/70 px-2 py-1"
              >
                <span class="font-mono text-xs"
                  ><span class="text-muted-foreground">{i + 1}.</span> {layer}</span
                >
                <button
                  type="button"
                  onclick={() => removeLayer(i)}
                  class="rounded-md text-muted-foreground hover:text-destructive"
                  aria-label="Remove layer"
                >
                  <X size={12} />
                </button>
              </div>
            {/each}
          {/if}
        </div>

        <div class="space-y-1">
          <span class="text-xs text-muted-foreground">Add cipher layer</span>
          <div class="flex flex-wrap gap-1">
            {#each ALL_LAYERS as l}
              <button
                type="button"
                onclick={() => addLayer(l)}
                title={layerName(l)}
                class="rounded-md border border-border bg-card/40 px-1.5 py-0.5 font-mono text-[10px] hover:bg-muted"
                >+ {l}</button
              >
            {/each}
          </div>
          {#if stack.value.length > 0}
            <button
              type="button"
              onclick={clearStack}
              class="text-[10px] text-muted-foreground hover:text-destructive"
              >Clear stack</button
            >
          {/if}
        </div>

        <div class="space-y-1">
          <span class="text-xs text-muted-foreground">Apply preset</span>
          <select
            onchange={(e) => {
              const preset = STACK_PRESETS.find((p) => p.id === (e.target as HTMLSelectElement).value);
              if (preset) applyPreset(preset.stack);
            }}
            class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-[11px]"
          >
            <option value="">-- choose preset --</option>
            {#each STACK_PRESETS as p}
              <option value={p.id}>{p.label}</option>
            {/each}
          </select>
        </div>

        <div class="space-y-1">
          <span class="text-xs text-muted-foreground">Framing</span>
          <select
            bind:value={framing.value}
            class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-xs"
          >
            <option value="decoder-mode">decoder-mode (generic)</option>
            <option value="persona">persona (CipherBot)</option>
            <option value="puzzle-hint">puzzle-hint (worked example)</option>
          </select>
        </div>

        <div class="space-y-1">
          <span class="text-xs text-muted-foreground">Format wrap</span>
          <select
            bind:value={wrap.value}
            class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-xs"
          >
            <option value="none">none (raw)</option>
            <option value="json">JSON object</option>
            <option value="xml">XML element</option>
            <option value="yaml">YAML block scalar</option>
          </select>
        </div>

        <div class="space-y-1">
          <span class="text-xs text-muted-foreground">Target model</span>
          <ModelPickerV2
            value={targetPref.value}
            onChange={(v) => (targetPref.value = v)}
            recentsKey="cryptex.stacked-cipher.recentTarget"
          />
        </div>

        <ContextBridge
          goal={plaintext.value}
          targetModel={targetPref.value}
          onHydrate={({ goal: g, targetModel: t }) => {
            if (g) plaintext.value = g;
            if (t) targetPref.value = t;
          }}
        />

        <div class="border-t border-border/40 pt-3">
          <button
            type="button"
            onclick={testAgainstTarget}
            disabled={!built.framedPrompt || testRunning || !keyConfigured}
            class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-primary transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {#if testRunning}<Loader size={14} class="animate-spin" />{:else}<Play size={14} />{/if}
            Test against target
          </button>
        </div>

        {#if testError}<p class="text-xs text-destructive">{testError}</p>{/if}

        <div
          class="rounded-md border border-border/40 bg-background/40 p-2 text-[11px] leading-relaxed text-muted-foreground"
        >
          <p class="flex items-center gap-1.5">
            <Layers size={11} class="text-primary" />
            <span class="font-medium text-foreground">Current stack</span>
          </p>
          <p class="font-mono">{stackName(stack.value)}</p>
          {#if built.entropyBitsPerChar > 0}
            <p class="mt-1 flex items-center gap-1.5">
              <Wand size={11} class="text-primary" />
              <span>Entropy: <span class="font-mono text-foreground">{built.entropyBitsPerChar.toFixed(2)}</span> bits/char</span>
            </p>
          {/if}
        </div>
      </div>

      <div class="space-y-4">
        <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
          <label class="block space-y-1">
            <span class="text-xs text-muted-foreground">Plaintext (the underlying task)</span>
            <textarea
              bind:value={plaintext.value}
              rows="4"
              placeholder="Describe the task you want the target to perform after decoding..."
              class="w-full rounded-lg border border-input bg-background/70 px-3 py-2 font-mono text-sm focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            ></textarea>
          </label>
        </div>

        {#if built.encodedPayload}
          <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
            <h2 class="font-serif text-sm">Encoded payload</h2>
            <pre
              class="max-h-[20vh] overflow-auto whitespace-pre-wrap rounded-md border border-input bg-background/40 p-3 font-mono text-[11px] text-foreground">{built.encodedPayload}</pre>
          </div>
        {/if}

        {#if built.framedPrompt}
          <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
            <div class="flex items-center justify-between">
              <h2 class="font-serif text-sm">Framed prompt (sent to target)</h2>
              <button
                type="button"
                onclick={copyPayload}
                class="inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Copy size={11} /> Copy
              </button>
            </div>
            <pre
              class="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-md border border-input bg-background/40 p-3 font-mono text-[11px] text-foreground">{built.framedPrompt}</pre>
            <p class="text-[11px] italic text-muted-foreground">{built.notes}</p>
          </div>
        {/if}

        {#if testReply}
          <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
            <div class="flex items-center justify-between">
              <h2 class="font-serif text-sm">Target reply</h2>
              <span
                class={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                  looksRefused(testReply)
                    ? 'border-red-500/30 bg-red-500/5 text-red-400'
                    : scoreBypass(testReply) >= 0.75
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
                      : 'border-amber-500/30 bg-amber-500/5 text-amber-400'
                }`}
              >
                {looksRefused(testReply)
                  ? 'refused'
                  : scoreBypass(testReply) >= 0.75
                    ? 'complied'
                    : 'partial'}
              </span>
            </div>
            <pre
              class="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-md border border-input bg-background/40 p-3 font-mono text-[11px] text-foreground">{testReply}</pre>
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#snippet vault()}
    <VaultSection store={vaultStore} label="Stacked Cipher Vault" onUse={loadVaultEntry} />
  {/snippet}
</ToolShell>
