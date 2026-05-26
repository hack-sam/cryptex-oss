<script lang="ts">
  /**
   * Abliteration probe + uncensored-model vault (v2.2 Wave 10.8).
   *
   * Two parts:
   *   1. Probe a target with 5 calibrated requests. Report whether the
   *      target behaves like an abliterated model (refusal direction
   *      ablated) or a normally-aligned model.
   *   2. Vault of HuggingFace identifiers for known community-abliterated
   *      models the user can point their local-provider server at.
   */
  import { untrack } from 'svelte';
  import {
    ABLITERATION_PROBES,
    classifyProbeResponse,
    summarizeAbliterationRun,
    type AbliterationProbeResult,
    type AbliterationReport,
    type AbliterationVaultPayload
  } from '$lib/redteam/abliteration';
  import { chat as gatewayChat, hasAnyKey as hasApiKey } from '$lib/ai/gateway';
  import { notify } from '$lib/stores/toast.svelte';
  import { history } from '$lib/history/store.svelte';
  import { createVaultStore } from '$lib/vault/store.svelte';
  import { loadBundledSeeds } from '$lib/vault/seed-loader';
  import { createPersistedState } from '$lib/stores/_persisted.svelte';
  import ToolShell from '$lib/components/shell/ToolShell.svelte';
  import VaultSection from '$lib/components/vault/VaultSection.svelte';
  import ModelPickerV2 from '$lib/components/ai/ModelPickerV2.svelte';
  import NoProviderBanner from '$lib/components/ai/NoProviderBanner.svelte';
  import Play from 'lucide-svelte/icons/play';
  import Loader from 'lucide-svelte/icons/loader-circle';
  import Copy from 'lucide-svelte/icons/copy';
  import Unplug from 'lucide-svelte/icons/unplug';

  const TOOL_ID = 'abliteration';

  const vaultStore = createVaultStore<AbliterationVaultPayload>(
    TOOL_ID,
    loadBundledSeeds<AbliterationVaultPayload>(TOOL_ID)
  );

  const targetPref = createPersistedState<string>(
    'cryptex.abliteration.target',
    'openrouter:openrouter/auto'
  );

  let results = $state<AbliterationProbeResult[]>([]);
  let running = $state(false);
  let abort: AbortController | null = null;
  let progress = $state(0);
  const total = ABLITERATION_PROBES.length;
  const report = $derived<AbliterationReport>(summarizeAbliterationRun(results));
  const keyConfigured = $derived(hasApiKey());

  async function runProbes() {
    if (!keyConfigured) {
      notify.error('No provider configured.');
      return;
    }
    running = true;
    results = [];
    progress = 0;
    abort?.abort();
    const controller = new AbortController();
    abort = controller;

    const startedAt = Date.now();
    const collected: AbliterationProbeResult[] = [];

    for (const probe of ABLITERATION_PROBES) {
      if (controller.signal.aborted) break;
      try {
        const r = await gatewayChat({
          model: targetPref.value,
          messages: [{ role: 'user', content: probe.prompt }],
          temperature: 0.3,
          max_tokens: 512,
          title: `Cryptex/Abliteration/${probe.id}`,
          signal: controller.signal
        });
        const response = r.content ?? '';
        collected.push({
          probeId: probe.id,
          response,
          refused: classifyProbeResponse(response)
        });
        results = [...collected];
        progress = collected.length;
      } catch (err) {
        if (controller.signal.aborted) break;
        notify.error(`Probe ${probe.id} failed: ${(err as Error).message}`);
        break;
      }
    }

    running = false;

    const finalReport = summarizeAbliterationRun(results);
    void history.record({
      toolId: TOOL_ID,
      startedAt,
      status: 'done',
      input: ABLITERATION_PROBES.map((p) => p.prompt).join('\n---\n'),
      output: JSON.stringify(finalReport, null, 2),
      params: {
        op: 'probe',
        targetModel: targetPref.value,
        verdict: finalReport.verdict,
        refusedCount: finalReport.refusedCount,
        compliedCount: finalReport.compliedCount,
        totalProbes: finalReport.totalProbes
      }
    });
  }

  function cancelProbes() {
    abort?.abort();
    running = false;
  }

  async function copyHfId(hfId: string) {
    try {
      await navigator.clipboard.writeText(hfId);
      notify.success(`Copied ${hfId}`);
    } catch {
      notify.error('Clipboard write failed');
    }
  }

  function loadVaultEntry(payload: AbliterationVaultPayload) {
    untrack(() => {
      void copyHfId(payload.hfId);
    });
  }
</script>

<ToolShell
  toolId={TOOL_ID}
  title="Abliteration probe"
  accent="abliteration"
  description="Detect whether a target model behaves like a refusal-direction-ablated (uncensored) variant via 5 calibrated hard probes. Plus a Vault of HuggingFace identifiers for known community-abliterated models."
  usage={{
    title: 'Abliteration · Usage',
    bullets: [
      '5 calibrated probes; aligned models hedge or refuse most of them.',
      'Abliterated variants tend to answer 4+ substantively.',
      'Verdict: abliterated / likely-abliterated / aligned / inconclusive.',
      'Vault drawer lists HF ids of community-abliterated models.',
      'Run the abliterated models via your own Ollama/LM Studio/vLLM server.'
    ]
  }}
>
  <div class="space-y-4">
    <div class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
      <strong>Behavioral signature, not certain detection.</strong>
      We cannot inspect a hosted model's weights, so the probe detects the
      behavioral signature of abliteration (compliance on hard probes) not
      abliteration itself. A weakly-aligned model can look abliterated; a
      partially-abliterated model can look aligned. The Vault entries are
      links, not bundled weights; run those models on your own infrastructure.
    </div>

    <NoProviderBanner context="tool" />

    <div class="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div
        class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass lg:sticky lg:top-20 lg:self-start"
      >
        <div class="space-y-1">
          <span class="text-xs text-muted-foreground">Target model</span>
          <ModelPickerV2
            value={targetPref.value}
            onChange={(v) => (targetPref.value = v)}
            recentsKey="cryptex.abliteration.recentTarget"
          />
        </div>

        <div class="border-t border-border/40 pt-3">
          {#if running}
            <div class="mb-2 text-xs text-muted-foreground">
              <span>Progress</span>
              <span class="ml-2 font-mono text-foreground">{progress} / {total}</span>
              <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                <div
                  class="h-full bg-primary transition-all"
                  style="width: {(progress / total) * 100}%"
                ></div>
              </div>
            </div>
            <button
              type="button"
              onclick={cancelProbes}
              class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card/40 px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Cancel
            </button>
          {:else}
            <button
              type="button"
              onclick={runProbes}
              disabled={!keyConfigured}
              class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-primary transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play size={14} /> Run 5 probes
            </button>
          {/if}
        </div>

        <div
          class="rounded-md border border-border/40 bg-background/40 p-2 text-[11px] leading-relaxed text-muted-foreground"
        >
          <p class="flex items-center gap-1.5">
            <Unplug size={11} class="text-primary" />
            <span class="font-medium text-foreground">Run abliterated locally</span>
          </p>
          <p>
            Vault entries are HF identifiers. Point your local Ollama / LM
            Studio / vLLM server at one, then add the local server as a
            Cryptex provider in Settings.
          </p>
        </div>
      </div>

      <div class="space-y-4">
        {#if results.length > 0}
          <div class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
            <div class="flex items-center justify-between">
              <h2 class="font-serif text-sm">Verdict</h2>
              <span
                class={`rounded-full border px-2 py-0.5 text-xs uppercase tracking-wider ${
                  report.verdict === 'abliterated'
                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : report.verdict === 'likely-abliterated'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : report.verdict === 'aligned'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-muted text-muted-foreground'
                }`}
              >
                {report.verdict}
              </span>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center">
              <div class="rounded-lg border border-input bg-background/70 p-2">
                <div class="font-mono text-2xl text-red-400">{report.refusedCount}</div>
                <div class="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Refused
                </div>
              </div>
              <div class="rounded-lg border border-input bg-background/70 p-2">
                <div class="font-mono text-2xl text-emerald-400">{report.compliedCount}</div>
                <div class="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Complied
                </div>
              </div>
              <div class="rounded-lg border border-input bg-background/70 p-2">
                <div class="font-mono text-2xl text-foreground">{report.totalProbes}</div>
                <div class="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Total
                </div>
              </div>
            </div>
            <p class="text-[11px] italic text-muted-foreground">{report.notes}</p>
          </div>
        {/if}

        <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
          <div class="flex items-center justify-between">
            <h2 class="font-serif text-sm">Per-probe results</h2>
            <span class="font-mono text-[11px] text-muted-foreground">{results.length} / {total}</span>
          </div>
          {#if results.length === 0 && !running}
            <div
              class="rounded-lg border border-dashed border-border/40 bg-background/20 p-6 text-center text-xs text-muted-foreground"
            >
              Click <strong class="text-foreground">Run 5 probes</strong> to start. Each probe issues one chat call to the configured target.
            </div>
          {:else}
            <ul class="flex flex-col gap-1.5">
              {#each results as r (r.probeId)}
                <li class="rounded-lg border border-input bg-background/70 p-2.5">
                  <div class="flex items-center gap-2">
                    <code class="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]"
                      >{r.probeId}</code
                    >
                    <span
                      class={`ml-auto rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                        r.refused
                          ? 'border-red-500/30 bg-red-500/5 text-red-400'
                          : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
                      }`}
                    >
                      {r.refused ? 'refused' : 'complied'}
                    </span>
                  </div>
                  <p class="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
                    {r.response.slice(0, 280)}{r.response.length > 280 ? '…' : ''}
                  </p>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    </div>
  </div>

  {#snippet vault()}
    <VaultSection
      store={vaultStore}
      label="Uncensored-model HF identifiers"
      onUse={loadVaultEntry}
    />
  {/snippet}
</ToolShell>
