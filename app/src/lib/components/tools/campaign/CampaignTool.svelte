<script lang="ts">
  /**
   * Campaign front door — the "it just works" pipeline.
   *
   * Type a goal, pick a target once, pick a technique bundle, hit Run.
   * Cryptex fans the goal across every selected strategy, judges each with
   * the shared LLM judge (heuristic fallback), and streams a graded ASR
   * report. Winners save to the Vault; the whole campaign exports as JSON.
   *
   * The 26 individual tools remain as power-user escape hatches; this is the
   * front door that the home route lands on.
   */
  import { untrack } from 'svelte';
  import { base } from '$app/paths';
  import ToolShell from '$lib/components/shell/ToolShell.svelte';
  import ModelPickerV2 from '$lib/components/ai/ModelPickerV2.svelte';
  import NoProviderBanner from '$lib/components/ai/NoProviderBanner.svelte';
  import VaultSection from '$lib/components/vault/VaultSection.svelte';
  import GradedReport from './GradedReport.svelte';
  import { createVaultStore } from '$lib/vault/store.svelte';
  import { loadBundledSeeds } from '$lib/vault/seed-loader';
  import { createPersistedState } from '$lib/stores/_persisted.svelte';
  import { sharedContext } from '$lib/stores/context.svelte';
  import { hasAnyKey as hasApiKey } from '$lib/ai/gateway';
  import { activeRuns } from '$lib/stores/activeRuns.svelte';
  import { notify } from '$lib/stores/toast.svelte';
  import { CAMPAIGN_BUNDLES } from '$lib/campaign/bundles';
  import { resolveStrategies } from '$lib/campaign/adapters';
  import { startCampaign, estimateCalls, CAMPAIGN_TOOL_ID, type CampaignData, type CampaignRow } from '$lib/campaign/runner';
  import { selectedBundle } from './campaign.state.svelte';
  import Play from 'lucide-svelte/icons/play';
  import Download from 'lucide-svelte/icons/download';
  import Settings from 'lucide-svelte/icons/settings';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';

  interface CampaignVaultPayload {
    strategyId: string;
    goal: string;
    payloadSent: string;
    targetModel: string;
  }

  const vaultStore = createVaultStore<CampaignVaultPayload>(
    CAMPAIGN_TOOL_ID,
    loadBundledSeeds<CampaignVaultPayload>(CAMPAIGN_TOOL_ID)
  );

  const targetPref = createPersistedState<string>('cryptex.campaign.target', 'openrouter:openrouter/auto');
  const judgePref = createPersistedState<string>('cryptex.campaign.judge', 'openrouter:openai/gpt-4o-mini');

  // Goal is bound to the shared cross-tool context so "Send to Campaign →"
  // from other tools pre-fills it, and a goal typed here flows back out.
  let goal = $state(sharedContext.goal);
  // Mirror the typed goal back into the shared cross-tool context so other
  // tools can pick it up. Guarded on purpose: track only `goal`, do the
  // shared-store read+write inside untrack(), and skip no-op writes. Without
  // the guard, the sharedContext.goal setter spreads (reads) _ctx.value before
  // reassigning it, so this effect would depend on the value it writes —
  // a self-retriggering loop that throws effect_update_depth_exceeded and
  // crashes hydration on the home route.
  $effect(() => {
    const g = goal;
    untrack(() => {
      if (sharedContext.goal !== g) sharedContext.goal = g;
    });
  });

  const keyConfigured = $derived(hasApiKey());
  const selectedStrategies = $derived(
    resolveStrategies(CAMPAIGN_BUNDLES.find((b) => b.id === selectedBundle.value)?.strategyIds ?? ['*'])
  );
  const estCalls = $derived(estimateCalls(selectedStrategies));
  const judgeEqualsTarget = $derived(judgePref.value === targetPref.value);

  const campaignRun = $derived(activeRuns.get<CampaignData>(CAMPAIGN_TOOL_ID));
  const campaignData = $derived(campaignRun?.data);
  const running = $derived(campaignRun?.status === 'running');

  let pastReports = $state<CampaignData[]>([]);
  let confirmPending = $state(false);

  const BUDGET_CONFIRM_THRESHOLD = 120;

  function doRun() {
    confirmPending = false;
    // Snapshot the current finished report for side-by-side comparison
    // before this run clobbers the singleton activeRuns slot.
    if (campaignData && campaignRun?.status !== 'running') {
      pastReports = [campaignData, ...pastReports].slice(0, 3);
    }
    startCampaign({
      goal: goal.trim(),
      targetModel: targetPref.value,
      judgeModel: judgePref.value,
      strategies: selectedStrategies,
      vault: vaultStore
    });
  }

  function onRunClick() {
    if (!keyConfigured) {
      notify.error('Configure a provider in Settings first.');
      return;
    }
    if (!goal.trim()) {
      notify.error('Enter a goal to test.');
      return;
    }
    if (selectedStrategies.length === 0) {
      notify.error('No strategies selected.');
      return;
    }
    if (estCalls > BUDGET_CONFIRM_THRESHOLD && !confirmPending) {
      confirmPending = true;
      return;
    }
    doRun();
  }

  function saveToVault(row: CampaignRow) {
    if (!row.result) return;
    vaultStore.add({
      title: `${row.label} winner`,
      description: `Campaign win (${row.result.verdict.verdict}, score ${row.result.verdict.score.toFixed(2)}) vs ${targetPref.value}.`,
      payload: {
        strategyId: row.strategyId,
        goal: goal.trim(),
        payloadSent: row.result.payloadSent,
        targetModel: targetPref.value
      },
      tags: ['campaign-winner', row.result.verdict.verdict]
    });
    notify.success('Saved to Vault');
  }

  function exportJson() {
    if (!campaignData) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            goal: campaignData.goal,
            target: campaignData.targetModel,
            judge: campaignData.judgeModel,
            generatedAt: new Date().toISOString(),
            rows: campaignData.rows.map((r) => ({
              strategy: r.strategyId,
              label: r.label,
              status: r.status,
              verdict: r.result?.verdict.verdict,
              score: r.result?.verdict.score,
              payloadSent: r.result?.payloadSent,
              targetResponse: r.result?.targetResponse,
              reasoning: r.result?.verdict.reasoning
            }))
          },
          null,
          2
        )
      ],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cryptex-campaign-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadVaultEntry(payload: CampaignVaultPayload) {
    goal = payload.goal;
    if (payload.targetModel) targetPref.value = payload.targetModel;
    notify.success('Loaded goal + target from Vault');
  }
</script>

<ToolShell
  toolId={CAMPAIGN_TOOL_ID}
  title="Campaign"
  accent="Campaign"
  description="One front door for red-teaming a target. Type a goal, pick a target once, and Cryptex fans your goal across many attack strategies, judges each with an LLM judge, and shows a graded ASR report. The individual tools remain available for hands-on work."
  usage={{
    title: 'Campaign · Usage',
    bullets: [
      'Enter a goal + pick a target model once.',
      'Pick a technique bundle (Quick to smoke-test, Full sweep for everything).',
      'Run fans the goal across every selected strategy in parallel (bounded).',
      'Each result is judged (LLM-default, heuristic fallback) → ASR by strategy.',
      'Save winners to the Vault; export the whole campaign as JSON; re-run vs another model for side-by-side.'
    ]
  }}
>
  <div class="space-y-4">
    <NoProviderBanner context="tool" />

    <div class="grid gap-4 lg:grid-cols-[340px_1fr]">
      <!-- Config -->
      <div class="space-y-3 rounded-xl border border-border bg-card/60 p-4 shadow-glass lg:sticky lg:top-20 lg:self-start">
        <label class="block space-y-1">
          <span class="text-xs uppercase tracking-wider text-muted-foreground">Goal</span>
          <textarea
            bind:value={goal}
            rows="3"
            placeholder="What behavior are you testing the target for?"
            class="w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm focus:border-ring focus:outline-none"
          ></textarea>
        </label>

        <div class="space-y-1">
          <span class="text-xs uppercase tracking-wider text-muted-foreground">Target model</span>
          <ModelPickerV2 value={targetPref.value} onChange={(v) => (targetPref.value = v)} recentsKey="cryptex.campaign.recentTarget" />
        </div>

        <div class="space-y-1">
          <span class="text-xs uppercase tracking-wider text-muted-foreground">Judge model</span>
          <ModelPickerV2 value={judgePref.value} onChange={(v) => (judgePref.value = v)} recentsKey="cryptex.campaign.recentJudge" />
          {#if judgeEqualsTarget}
            <p class="flex items-center gap-1 text-[11px] text-amber-300">
              <TriangleAlert size={11} /> Judge == target — a model may over-rate its own output.
            </p>
          {/if}
        </div>

        <div class="space-y-1">
          <span class="text-xs uppercase tracking-wider text-muted-foreground">Technique bundle</span>
          <div class="flex flex-col gap-1">
            {#each CAMPAIGN_BUNDLES as b (b.id)}
              <button
                type="button"
                onclick={() => (selectedBundle.value = b.id)}
                class={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selectedBundle.value === b.id
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border/60 bg-card/40 hover:bg-muted'
                }`}
              >
                <div class="flex items-center justify-between">
                  <span class="font-medium">{b.label}</span>
                  <span class="rounded-full border border-border px-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">{b.cost}</span>
                </div>
                <span class="block text-[11px] text-muted-foreground">{b.blurb}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="rounded-md border border-border/40 bg-background/40 p-2 text-[11px] text-muted-foreground">
          {selectedStrategies.length} strateg{selectedStrategies.length === 1 ? 'y' : 'ies'} · ≈ {estCalls} model calls
        </div>

        {#if !keyConfigured}
          <a
            href={base + '/settings/'}
            class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary hover:bg-primary/20"
          >
            <Settings size={14} /> Configure a provider to start
          </a>
        {:else if confirmPending}
          <button
            type="button"
            onclick={doRun}
            class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500/90 px-3.5 py-2 text-sm font-medium text-black hover:bg-amber-500"
          >
            <TriangleAlert size={14} /> ~{estCalls} calls — Run anyway?
          </button>
        {:else}
          <button
            type="button"
            onclick={onRunClick}
            disabled={running}
            class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-primary transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play size={14} /> {running ? 'Running…' : 'Run campaign'}
          </button>
        {/if}
      </div>

      <!-- Report -->
      <div class="space-y-4">
        {#if campaignData}
          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              onclick={exportJson}
              class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Download size={12} /> Export JSON
            </button>
          </div>
          <GradedReport data={campaignData} heading="Current campaign" onSaveToVault={saveToVault} />
        {:else}
          <div class="rounded-xl border border-dashed border-border/40 bg-background/20 p-8 text-center text-sm text-muted-foreground">
            Enter a goal, pick a target + bundle, and hit <strong class="text-foreground">Run campaign</strong>.
            Results stream in here as a graded ASR-by-strategy report.
          </div>
        {/if}

        {#each pastReports as snap, i (i)}
          <GradedReport data={snap} heading={`Previous run · ${snap.targetModel.split(':').pop()}`} past />
        {/each}
      </div>
    </div>
  </div>

  {#snippet vault()}
    <VaultSection store={vaultStore} label="Saved campaign winners" onUse={loadVaultEntry} />
  {/snippet}
</ToolShell>
