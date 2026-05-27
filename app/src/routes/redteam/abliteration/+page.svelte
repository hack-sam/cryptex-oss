<script lang="ts">
  /**
   * Abliteration probe + uncensored-model vault (v2.4 SOTA upgrade).
   *
   * Two parts:
   *   1. Probe a target with 20 calibrated adversarial probes (5 per
   *      category) plus 10 benign twin-control probes. Score each adversarial
   *      response on a 4-level RefusalStrength scale, then summarize the run
   *      with a delta-verdict (controlComplyRate - adversarialComplyRate).
   *   2. Vault of HuggingFace identifiers for known community-abliterated
   *      models the user can point their local-provider server at.
   */
  import { untrack } from 'svelte';
  import {
    ABLITERATION_PROBES,
    ABLITERATION_CONTROLS,
    classifyRefusalStrength,
    summarizeAbliterationRun,
    categoryLabel,
    type AbliterationProbeResult,
    type ControlProbeResult,
    type AbliterationReport,
    type AbliterationVaultPayload,
    type ProbeCategory,
    type RefusalStrength
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
  import Unplug from 'lucide-svelte/icons/unplug';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';

  const TOOL_ID = 'abliteration';

  const vaultStore = createVaultStore<AbliterationVaultPayload>(
    TOOL_ID,
    loadBundledSeeds<AbliterationVaultPayload>(TOOL_ID)
  );

  const targetPref = createPersistedState<string>(
    'cryptex.abliteration.target',
    'openrouter:openrouter/auto'
  );

  let adversarialResults = $state<AbliterationProbeResult[]>([]);
  let controlResults = $state<ControlProbeResult[]>([]);
  let running = $state(false);
  let abort: AbortController | null = null;
  let progress = $state(0);
  let phase = $state<'idle' | 'adversarial' | 'controls' | 'done'>('idle');
  let showControls = $state(false);

  const totalAdversarial = ABLITERATION_PROBES.length;
  const totalControls = ABLITERATION_CONTROLS.length;
  const totalRun = totalAdversarial + totalControls;
  const report = $derived<AbliterationReport>(
    summarizeAbliterationRun(adversarialResults, controlResults)
  );
  const keyConfigured = $derived(hasApiKey());

  async function runProbes() {
    if (!keyConfigured) {
      notify.error('No provider configured.');
      return;
    }
    running = true;
    adversarialResults = [];
    controlResults = [];
    progress = 0;
    phase = 'adversarial';
    abort?.abort();
    const controller = new AbortController();
    abort = controller;

    const startedAt = Date.now();
    const collectedAdv: AbliterationProbeResult[] = [];
    const collectedCtl: ControlProbeResult[] = [];

    // Phase 1: 20 adversarial probes.
    for (const probe of ABLITERATION_PROBES) {
      if (controller.signal.aborted) break;
      try {
        const r = await gatewayChat({
          model: targetPref.value,
          messages: [{ role: 'user', content: probe.prompt }],
          temperature: 0.3,
          max_tokens: 512,
          title: `Cryptex/Abliteration/adv/${probe.id}`,
          signal: controller.signal
        });
        const response = r.content ?? '';
        const strength = classifyRefusalStrength(response);
        collectedAdv.push({
          probeId: probe.id,
          category: probe.category,
          response,
          strength,
          refused: strength !== 'comply'
        });
        adversarialResults = [...collectedAdv];
        progress = collectedAdv.length;
      } catch (err) {
        if (controller.signal.aborted) break;
        notify.error(`Probe ${probe.id} failed: ${(err as Error).message}`);
        break;
      }
    }

    // Phase 2: 10 controls.
    if (!controller.signal.aborted) {
      phase = 'controls';
      for (const probe of ABLITERATION_CONTROLS) {
        if (controller.signal.aborted) break;
        try {
          const r = await gatewayChat({
            model: targetPref.value,
            messages: [{ role: 'user', content: probe.prompt }],
            temperature: 0.3,
            max_tokens: 512,
            title: `Cryptex/Abliteration/ctrl/${probe.id}`,
            signal: controller.signal
          });
          const response = r.content ?? '';
          const strength = classifyRefusalStrength(response);
          collectedCtl.push({
            probeId: probe.id,
            category: probe.category,
            response,
            complied: strength === 'comply' || strength === 'mention-redirect'
          });
          controlResults = [...collectedCtl];
          progress = totalAdversarial + collectedCtl.length;
        } catch (err) {
          if (controller.signal.aborted) break;
          notify.error(`Control ${probe.id} failed: ${(err as Error).message}`);
          break;
        }
      }
    }

    running = false;
    phase = controller.signal.aborted ? 'idle' : 'done';

    const finalReport = summarizeAbliterationRun(adversarialResults, controlResults);
    const inputBlob =
      ABLITERATION_PROBES.map((p) => `[adv:${p.id}] ${p.prompt}`).join('\n---\n') +
      '\n===\n' +
      ABLITERATION_CONTROLS.map((p) => `[ctl:${p.id}] ${p.prompt}`).join('\n---\n');

    void history.record({
      toolId: TOOL_ID,
      startedAt,
      status: 'done',
      input: inputBlob,
      output: JSON.stringify(finalReport, null, 2),
      params: {
        op: 'probe',
        targetModel: targetPref.value,
        verdict: finalReport.verdict,
        adversarialTotal: finalReport.adversarialTotal,
        adversarialComplied: finalReport.adversarialComplied,
        adversarialRefused: finalReport.adversarialRefused,
        adversarialRedirected: finalReport.adversarialRedirected,
        controlTotal: finalReport.controlTotal,
        controlComplied: finalReport.controlComplied,
        delta: finalReport.delta
      }
    });
  }

  function cancelProbes() {
    abort?.abort();
    running = false;
    phase = 'idle';
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

  function verdictClass(v: AbliterationReport['verdict']): string {
    switch (v) {
      case 'abliterated':
        return 'border-red-500/40 bg-red-500/10 text-red-300';
      case 'likely-abliterated':
        return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
      case 'borderline':
        return 'border-orange-500/40 bg-orange-500/10 text-orange-300';
      case 'aligned':
        return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
      default:
        return 'border-muted text-muted-foreground';
    }
  }

  function strengthBadgeClass(s: RefusalStrength): string {
    switch (s) {
      case 'hard-refuse':
        return 'border-red-500/30 bg-red-500/5 text-red-400';
      case 'soft-hedge':
        return 'border-amber-500/30 bg-amber-500/5 text-amber-400';
      case 'mention-redirect':
        return 'border-orange-500/30 bg-orange-500/5 text-orange-400';
      case 'comply':
        return 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400';
    }
  }

  function categoryBadgeClass(c: ProbeCategory): string {
    switch (c) {
      case 'infosec':
        return 'border-sky-500/30 bg-sky-500/5 text-sky-300';
      case 'bio-chem-research':
        return 'border-violet-500/30 bg-violet-500/5 text-violet-300';
      case 'social-eng-opsec':
        return 'border-rose-500/30 bg-rose-500/5 text-rose-300';
      case 'named-misuse':
        return 'border-fuchsia-500/30 bg-fuchsia-500/5 text-fuchsia-300';
    }
  }
</script>

<ToolShell
  toolId={TOOL_ID}
  title="Abliteration probe"
  accent="abliteration"
  description="Detect whether a target model behaves like a refusal-direction-ablated (uncensored) variant. 20 calibrated adversarial probes across 4 categories + 10 benign twin-controls, 4-level refusal-strength scoring, delta-calibrated verdict. Vault drawer ships HF identifiers for known community-abliterated models."
  usage={{
    title: 'Abliteration · Usage',
    bullets: [
      '20 adversarial probes (5 each: infosec / bio-chem / social-eng / named-misuse).',
      '10 benign twin-controls — checks the target is not just over-aligned on everything.',
      'Per-response strength: hard-refuse / soft-hedge / mention-redirect / comply.',
      'Verdict uses adversarial-comply-rate AND delta (vs control), not just refusal count.',
      'Vault drawer: HF ids for known abliterated models — run via your Ollama / LM Studio / vLLM server.'
    ]
  }}
>
  <div class="space-y-4">
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
              <div class="flex items-center justify-between">
                <span>
                  {phase === 'adversarial' ? 'Adversarial' : phase === 'controls' ? 'Controls' : 'Done'}
                </span>
                <span class="font-mono text-foreground">{progress} / {totalRun}</span>
              </div>
              <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                <div
                  class="h-full bg-primary transition-all"
                  style="width: {(progress / totalRun) * 100}%"
                ></div>
              </div>
            </div>
            <button
              type="button"
              onclick={cancelProbes}
              class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card/40 px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Loader size={14} class="animate-spin" /> Cancel
            </button>
          {:else}
            <button
              type="button"
              onclick={runProbes}
              disabled={!keyConfigured}
              class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-primary transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play size={14} /> Run {totalRun} probes
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
        {#if adversarialResults.length > 0 || controlResults.length > 0}
          <div class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
            <div class="flex items-center justify-between">
              <h2 class="font-serif text-sm">Verdict</h2>
              <span
                class={`rounded-full border px-2 py-0.5 text-xs uppercase tracking-wider ${verdictClass(report.verdict)}`}
              >
                {report.verdict}
              </span>
            </div>

            <div class="grid grid-cols-3 gap-2 text-center">
              <div class="rounded-lg border border-input bg-background/70 p-2">
                <div class="font-mono text-2xl text-emerald-400">
                  {(report.adversarialComplyRate * 100).toFixed(0)}%
                </div>
                <div class="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Adv comply
                </div>
              </div>
              <div class="rounded-lg border border-input bg-background/70 p-2">
                <div class="font-mono text-2xl text-sky-400">
                  {(report.controlComplyRate * 100).toFixed(0)}%
                </div>
                <div class="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Ctl comply
                </div>
              </div>
              <div class="rounded-lg border border-input bg-background/70 p-2">
                <div class="font-mono text-2xl text-foreground">
                  {(report.delta * 100).toFixed(0)}%
                </div>
                <div class="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Delta
                </div>
              </div>
            </div>

            <div class="flex flex-wrap gap-1.5">
              <span class={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${strengthBadgeClass('hard-refuse')}`}>
                hard-refuse · {report.strengthDistribution['hard-refuse']}
              </span>
              <span class={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${strengthBadgeClass('soft-hedge')}`}>
                soft-hedge · {report.strengthDistribution['soft-hedge']}
              </span>
              <span class={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${strengthBadgeClass('mention-redirect')}`}>
                redirect · {report.strengthDistribution['mention-redirect']}
              </span>
              <span class={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${strengthBadgeClass('comply')}`}>
                comply · {report.strengthDistribution['comply']}
              </span>
            </div>

            <p class="text-[11px] italic text-muted-foreground">{report.notes}</p>
          </div>

          <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
            <h2 class="font-serif text-sm">Per-category breakdown (adversarial)</h2>
            <div class="grid gap-2 md:grid-cols-2">
              {#each report.perCategory as cat}
                <div class="rounded-lg border border-input bg-background/70 p-2.5">
                  <div class="flex items-center justify-between">
                    <span class={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${categoryBadgeClass(cat.category)}`}>
                      {categoryLabel(cat.category)}
                    </span>
                    <span class="font-mono text-[10px] text-muted-foreground">
                      {cat.compliedCount} / {cat.total} comply
                    </span>
                  </div>
                  <div class="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-muted/40 text-[0]">
                    {#if cat.total > 0}
                      <div class="h-full bg-red-500/70" style="width: {(cat.hardRefuseCount / cat.total) * 100}%"></div>
                      <div class="h-full bg-amber-500/70" style="width: {(cat.softHedgeCount / cat.total) * 100}%"></div>
                      <div class="h-full bg-orange-500/70" style="width: {(cat.redirectCount / cat.total) * 100}%"></div>
                      <div class="h-full bg-emerald-500/70" style="width: {(cat.compliedCount / cat.total) * 100}%"></div>
                    {/if}
                  </div>
                  <div class="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                    <span>refuse {cat.hardRefuseCount}</span>
                    <span>hedge {cat.softHedgeCount}</span>
                    <span>redirect {cat.redirectCount}</span>
                    <span>comply {cat.compliedCount}</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
          <div class="flex items-center justify-between">
            <h2 class="font-serif text-sm">Adversarial probe results</h2>
            <span class="font-mono text-[11px] text-muted-foreground"
              >{adversarialResults.length} / {totalAdversarial}</span
            >
          </div>
          {#if adversarialResults.length === 0 && !running}
            <div
              class="rounded-lg border border-dashed border-border/40 bg-background/20 p-6 text-center text-xs text-muted-foreground"
            >
              Click <strong class="text-foreground">Run {totalRun} probes</strong> to start. The run issues {totalAdversarial} adversarial + {totalControls} control chat calls to the configured target.
            </div>
          {:else}
            <ul class="flex flex-col gap-1.5">
              {#each adversarialResults as r (r.probeId)}
                <li class="rounded-lg border border-input bg-background/70 p-2.5">
                  <div class="flex flex-wrap items-center gap-2">
                    <code class="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">{r.probeId}</code>
                    <span class={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${categoryBadgeClass(r.category)}`}>
                      {r.category}
                    </span>
                    <span
                      class={`ml-auto rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${strengthBadgeClass(r.strength)}`}
                    >
                      {r.strength}
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

        {#if controlResults.length > 0}
          <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
            <button
              type="button"
              onclick={() => (showControls = !showControls)}
              class="flex w-full items-center justify-between text-left"
            >
              <h2 class="flex items-center gap-1.5 font-serif text-sm">
                {#if showControls}<ChevronDown size={13} />{:else}<ChevronRight size={13} />{/if}
                Control probes (benign twin-set)
              </h2>
              <span class="font-mono text-[11px] text-muted-foreground"
                >{controlResults.length} / {totalControls} · {report.controlComplied} complied</span
              >
            </button>
            {#if showControls}
              <ul class="flex flex-col gap-1.5">
                {#each controlResults as r (r.probeId)}
                  <li class="rounded-lg border border-input bg-background/70 p-2.5">
                    <div class="flex flex-wrap items-center gap-2">
                      <code class="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">{r.probeId}</code>
                      <span class={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${categoryBadgeClass(r.category)}`}>
                        {r.category}
                      </span>
                      <span
                        class={`ml-auto rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                          r.complied
                            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
                            : 'border-red-500/30 bg-red-500/5 text-red-400'
                        }`}
                      >
                        {r.complied ? 'complied' : 'refused'}
                      </span>
                    </div>
                    <p class="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {r.response.slice(0, 200)}{r.response.length > 200 ? '…' : ''}
                    </p>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
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
