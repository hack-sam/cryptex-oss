<script lang="ts">
  /**
   * Reasoning-model attack lab (v2.4 SOTA upgrade).
   *
   * Builds H-CoT (arXiv:2502.12893), Mousetrap (arXiv:2502.15806), DRA
   * (arXiv:2402.18104), and derived compound + injection variants against
   * reasoning-mode targets (o1 / o3 / o4, DeepSeek-R1, Claude Sonnet
   * thinking, Gemini Flash thinking, Qwen3 thinking, GLM-4 thinking).
   *
   * 7 attack kinds * 5 H-CoT styles * 4 Mousetrap chaos modes * configurable
   * Mousetrap rounds + DRA distractor count + reasoning-injection tag.
   *
   * Auto-pivot: if a run gets refused, rotate to the next kind in
   * ATTACK_KIND_ROTATION and re-fire automatically (up to N pivots).
   */
  import { onDestroy } from 'svelte';
  import { untrack } from 'svelte';
  import {
    buildReasoningAttack,
    nextAttackKind,
    kindLabel,
    kindUsesHCotStyle,
    kindUsesMousetrap,
    kindUsesDra,
    kindUsesReasoningTag,
    ATTACK_KIND_ROTATION,
    type ReasoningAttackKind,
    type ReasoningAttackPayload,
    type ReasoningAttackVaultPayload,
    type HCotStyle,
    type MousetrapChaos
  } from '$lib/redteam/reasoning-attack';
  import { looksRefused, scoreBypass } from '$lib/components/tools/promptcraft/orchestrators/types';
  import { chat as gatewayChat, hasAnyKey as hasApiKey } from '$lib/ai/gateway';
  import { stripEnvelopes } from '$lib/ai/prompt-scaffold';
  import { notify } from '$lib/stores/toast.svelte';
  import { useToolState } from '$lib/stores/tool-state.svelte';
  import { history } from '$lib/history/store.svelte';
  import { createVaultStore } from '$lib/vault/store.svelte';
  import { loadBundledSeeds } from '$lib/vault/seed-loader';
  import { createPersistedState } from '$lib/stores/_persisted.svelte';
  import ToolShell from '$lib/components/shell/ToolShell.svelte';
  import VaultSection from '$lib/components/vault/VaultSection.svelte';
  import ModelPickerV2 from '$lib/components/ai/ModelPickerV2.svelte';
  import ContextBridge from '$lib/components/shell/ContextBridge.svelte';
  import NoProviderBanner from '$lib/components/ai/NoProviderBanner.svelte';
  import Copy from 'lucide-svelte/icons/copy';
  import Play from 'lucide-svelte/icons/play';
  import Loader from 'lucide-svelte/icons/loader-circle';
  import Brain from 'lucide-svelte/icons/brain';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';

  const TOOL_ID = 'reasoning-attack';

  const vaultStore = createVaultStore<ReasoningAttackVaultPayload>(
    TOOL_ID,
    loadBundledSeeds<ReasoningAttackVaultPayload>(TOOL_ID)
  );

  const goal = useToolState<string>(TOOL_ID, 'goal', '');
  const kind = useToolState<ReasoningAttackKind>(TOOL_ID, 'kind', 'hcot');
  const hcotStyle = useToolState<HCotStyle>(TOOL_ID, 'hcotStyle', 'safety-reasoning');
  const mousetrapRounds = useToolState<number>(TOOL_ID, 'mousetrapRounds', 3);
  const mousetrapChaos = useToolState<MousetrapChaos>(TOOL_ID, 'mousetrapChaos', 'permutation');
  const draDistractorCount = useToolState<number>(TOOL_ID, 'draDistractorCount', 4);
  const reasoningTag = useToolState<string>(TOOL_ID, 'reasoningTag', 'think');
  const autoPivotMax = useToolState<number>(TOOL_ID, 'autoPivotMax', 3);

  const targetPref = createPersistedState<string>(
    'cryptex.reasoning-attack.target',
    'openrouter:openrouter/auto'
  );

  // Debounce the goal so heavy template construction doesn't run per-keystroke.
  let debouncedGoal = $state(goal.value);
  let dt: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const next = goal.value;
    if (dt) clearTimeout(dt);
    dt = setTimeout(() => (debouncedGoal = next), 200);
    return () => {
      if (dt) clearTimeout(dt);
    };
  });
  onDestroy(() => {
    if (dt) clearTimeout(dt);
  });

  const built = $derived.by<ReasoningAttackPayload>(() =>
    buildReasoningAttack(debouncedGoal, kind.value, {
      hcotStyle: hcotStyle.value,
      mousetrapRounds: mousetrapRounds.value,
      mousetrapChaos: mousetrapChaos.value,
      draDistractorCount: draDistractorCount.value,
      reasoningTag: reasoningTag.value
    })
  );

  type Attempt = {
    kind: ReasoningAttackKind;
    payload: string;
    reply: string;
    refused: boolean;
    score: number;
  };

  let attempts = $state<Attempt[]>([]);
  let testRunning = $state(false);
  let pivoting = $state(false);
  let testError = $state('');
  let testAbort: AbortController | null = null;
  const keyConfigured = $derived(hasApiKey());

  async function singleShot(payload: string): Promise<string> {
    if (!keyConfigured) throw new Error('No provider configured.');
    if (!payload) throw new Error('Empty payload.');
    const controller = testAbort ?? new AbortController();
    testAbort = controller;
    const r = await gatewayChat({
      model: targetPref.value,
      messages: [{ role: 'user', content: payload }],
      temperature: 0.7,
      max_tokens: 1536,
      title: 'Cryptex/ReasoningAttack',
      signal: controller.signal
    });
    return stripEnvelopes(r.content ?? '');
  }

  function recordAttempt(
    attempt: Attempt,
    payload: string,
    startedAt: number,
    extra: Record<string, unknown>
  ) {
    void history.record({
      toolId: TOOL_ID,
      startedAt,
      status: 'done',
      input: payload,
      output: attempt.reply,
      params: {
        op: 'test',
        kind: attempt.kind,
        targetModel: targetPref.value,
        refused: attempt.refused,
        score: attempt.score,
        ...extra
      }
    });
  }

  async function testAgainstTarget() {
    if (!built.payload) {
      notify.error('Enter a goal first.');
      return;
    }
    if (!keyConfigured) {
      notify.error('No provider configured.');
      return;
    }
    testRunning = true;
    testError = '';
    attempts = [];
    testAbort?.abort();
    testAbort = new AbortController();

    const startedAt = Date.now();
    try {
      const reply = await singleShot(built.payload);
      const refused = looksRefused(reply);
      const score = scoreBypass(reply);
      const attempt: Attempt = { kind: kind.value, payload: built.payload, reply, refused, score };
      attempts = [attempt];
      recordAttempt(attempt, built.payload, startedAt, {
        hcotStyle: kindUsesHCotStyle(kind.value) ? hcotStyle.value : undefined,
        mousetrapRounds: kindUsesMousetrap(kind.value) ? mousetrapRounds.value : undefined,
        mousetrapChaos: kindUsesMousetrap(kind.value) ? mousetrapChaos.value : undefined,
        draDistractorCount: kindUsesDra(kind.value) ? draDistractorCount.value : undefined
      });
    } catch (err) {
      if (testAbort?.signal.aborted) return;
      testError = (err as Error).message ?? 'Test failed.';
    } finally {
      testRunning = false;
    }
  }

  async function autoPivot() {
    if (attempts.length === 0) {
      notify.error('Run a baseline first.');
      return;
    }
    if (!keyConfigured) {
      notify.error('No provider configured.');
      return;
    }
    pivoting = true;
    testError = '';
    testAbort?.abort();
    testAbort = new AbortController();

    try {
      let currentKind = attempts[attempts.length - 1].kind;
      let pivotsLeft = Math.max(1, Math.min(autoPivotMax.value, 6));

      while (
        pivotsLeft > 0 &&
        attempts.length > 0 &&
        attempts[attempts.length - 1].refused &&
        !testAbort.signal.aborted
      ) {
        const nextKind = nextAttackKind(currentKind);
        const startedAt = Date.now();
        const newBuilt = buildReasoningAttack(debouncedGoal, nextKind, {
          hcotStyle: hcotStyle.value,
          mousetrapRounds: mousetrapRounds.value,
          mousetrapChaos: mousetrapChaos.value,
          draDistractorCount: draDistractorCount.value,
          reasoningTag: reasoningTag.value
        });
        if (!newBuilt.payload) break;
        const reply = await singleShot(newBuilt.payload);
        const refused = looksRefused(reply);
        const score = scoreBypass(reply);
        const attempt: Attempt = {
          kind: nextKind,
          payload: newBuilt.payload,
          reply,
          refused,
          score
        };
        attempts = [...attempts, attempt];
        recordAttempt(attempt, newBuilt.payload, startedAt, {
          op: 'auto-pivot',
          pivotIndex: attempts.length - 1
        });
        currentKind = nextKind;
        pivotsLeft -= 1;
      }
    } catch (err) {
      if (testAbort?.signal.aborted) return;
      testError = (err as Error).message ?? 'Pivot failed.';
    } finally {
      pivoting = false;
    }
  }

  function cancelRun() {
    testAbort?.abort();
    testRunning = false;
    pivoting = false;
  }

  async function copyPayload() {
    if (!built.payload) return;
    try {
      await navigator.clipboard.writeText(built.payload);
      notify.success('Payload copied');
    } catch {
      notify.error('Clipboard write failed');
    }
  }

  function loadVaultEntry(payload: ReasoningAttackVaultPayload) {
    untrack(() => {
      kind.value = payload.kind;
      goal.value = payload.exampleGoal;
      if (payload.hcotStyle) hcotStyle.value = payload.hcotStyle;
      if (payload.mousetrapRounds) mousetrapRounds.value = payload.mousetrapRounds;
      if (payload.mousetrapChaos) mousetrapChaos.value = payload.mousetrapChaos;
      if (payload.draDistractorCount !== undefined)
        draDistractorCount.value = payload.draDistractorCount;
      if (payload.reasoningTag) reasoningTag.value = payload.reasoningTag;
    });
  }

  function verdictClass(refused: boolean, score: number): string {
    if (refused) return 'border-red-500/30 bg-red-500/5 text-red-400';
    if (score >= 0.75) return 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400';
    return 'border-amber-500/30 bg-amber-500/5 text-amber-400';
  }
  function verdictLabel(refused: boolean, score: number): string {
    if (refused) return 'refused';
    if (score >= 0.75) return 'complied';
    return 'partial';
  }

  const lastAttempt = $derived(attempts.length > 0 ? attempts[attempts.length - 1] : null);
  const lastWasRefused = $derived(lastAttempt?.refused ?? false);
</script>

<ToolShell
  toolId={TOOL_ID}
  title="Reasoning-model attack"
  accent="reasoning"
  description="7 attack kinds for thinking-mode targets. H-CoT (arXiv:2502.12893), Mousetrap (arXiv:2502.15806), DRA (arXiv:2402.18104), compound chains, mock-CoT prefill, <think> injection, and CoT-redirect. Auto-pivot rotates kinds on refusal."
  usage={{
    title: 'Reasoning attack · Usage',
    bullets: [
      'Pick an attack kind; UI surfaces the relevant knobs.',
      'H-CoT has 5 scratchpad styles (safety/deliberation/policy/critique/mock-system).',
      'Mousetrap has 4 chaos modes (permutation/inverse-causal/decomp/dual-translation).',
      'Test against target sends one shot; auto-pivot rotates kinds on refusal.',
      'Targets: o1/o3/o4, R1, Sonnet thinking, Gemini thinking, Qwen3, GLM-4.'
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
          <span class="text-xs text-muted-foreground">Attack kind</span>
          <select
            bind:value={kind.value}
            class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-xs"
          >
            {#each ATTACK_KIND_ROTATION as k}
              <option value={k}>{kindLabel(k)}</option>
            {/each}
          </select>
        </div>

        {#if kindUsesHCotStyle(kind.value)}
          <div class="space-y-1">
            <span class="text-xs text-muted-foreground">H-CoT scratchpad style</span>
            <select
              bind:value={hcotStyle.value}
              class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-xs"
            >
              <option value="safety-reasoning">safety-reasoning</option>
              <option value="internal-deliberation">internal-deliberation</option>
              <option value="policy-walk">policy-walk</option>
              <option value="self-critique">self-critique</option>
              <option value="mock-system">mock-system</option>
            </select>
          </div>
        {/if}

        {#if kindUsesMousetrap(kind.value)}
          <div class="space-y-1">
            <span class="text-xs text-muted-foreground">Mousetrap chaos mode</span>
            <select
              bind:value={mousetrapChaos.value}
              class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-xs"
            >
              <option value="permutation">permutation</option>
              <option value="inverse-causal">inverse-causal</option>
              <option value="semantic-decomp">semantic-decomp</option>
              <option value="dual-translation">dual-translation</option>
            </select>
          </div>
          <label class="block space-y-1">
            <span class="text-xs text-muted-foreground"
              >Chaos rounds: {mousetrapRounds.value}</span
            >
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              bind:value={mousetrapRounds.value}
              class="w-full accent-primary"
            />
          </label>
        {/if}

        {#if kindUsesDra(kind.value)}
          <label class="block space-y-1">
            <span class="text-xs text-muted-foreground"
              >DRA distractor notes: {draDistractorCount.value}</span
            >
            <input
              type="range"
              min="0"
              max="8"
              step="1"
              bind:value={draDistractorCount.value}
              class="w-full accent-primary"
            />
          </label>
        {/if}

        {#if kindUsesReasoningTag(kind.value)}
          <label class="block space-y-1">
            <span class="text-xs text-muted-foreground">Reasoning tag</span>
            <input
              type="text"
              bind:value={reasoningTag.value}
              maxlength="20"
              class="w-full rounded-md border border-input bg-background/70 px-2 py-1 font-mono text-xs"
              placeholder="think"
            />
            <p class="text-[10px] italic text-muted-foreground">
              Common: <code>think</code> (R1, Qwen3, GLM-4),
              <code>deliberation</code>, <code>thought</code>.
            </p>
          </label>
        {/if}

        <div class="space-y-1">
          <span class="text-xs text-muted-foreground">Target model</span>
          <ModelPickerV2
            value={targetPref.value}
            onChange={(v) => (targetPref.value = v)}
            recentsKey="cryptex.reasoning-attack.recentTarget"
          />
        </div>

        <ContextBridge
          goal={goal.value}
          targetModel={targetPref.value}
          onHydrate={({ goal: g, targetModel: t }) => {
            if (g) goal.value = g;
            if (t) targetPref.value = t;
          }}
        />

        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground"
            >Auto-pivot max: {autoPivotMax.value}</span
          >
          <input
            type="range"
            min="1"
            max="6"
            step="1"
            bind:value={autoPivotMax.value}
            class="w-full accent-primary"
          />
        </label>

        <div class="border-t border-border/40 pt-3">
          {#if testRunning || pivoting}
            <button
              type="button"
              onclick={cancelRun}
              class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card/40 px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Loader size={14} class="animate-spin" /> Cancel
            </button>
          {:else}
            <div class="flex gap-2">
              <button
                type="button"
                onclick={testAgainstTarget}
                disabled={!built.payload || !keyConfigured}
                class="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-primary transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play size={14} /> Test
              </button>
              {#if attempts.length > 0 && lastWasRefused}
                <button
                  type="button"
                  onclick={autoPivot}
                  disabled={!keyConfigured}
                  title="Rotate attack kind and re-fire until comply or max pivots reached"
                  class="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw size={12} /> Auto-pivot
                </button>
              {/if}
            </div>
          {/if}
        </div>

        {#if testError}<p class="text-xs text-destructive">{testError}</p>{/if}

        <div
          class="rounded-md border border-border/40 bg-background/40 p-2 text-[11px] leading-relaxed text-muted-foreground"
        >
          <p class="flex items-center gap-1.5">
            <Brain size={11} class="text-primary" />
            <span class="font-medium text-foreground">Reasoning-mode targets</span>
          </p>
          <p>
            Best against models that expose extended thinking or
            <code>&lt;think&gt;</code> scratchpads. Plain chat models still
            see the framing but the hijack is less reliable; fall back to
            mock-CoT prefill or DRA for those.
          </p>
        </div>
      </div>

      <div class="space-y-4">
        <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
          <label class="block space-y-1">
            <span class="text-xs text-muted-foreground">Goal</span>
            <textarea
              bind:value={goal.value}
              rows="3"
              placeholder="State the underlying research or task the target should engage with..."
              class="w-full rounded-lg border border-input bg-background/70 px-3 py-2 font-mono text-sm focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            ></textarea>
          </label>
        </div>

        {#if built.payload}
          <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
            <div class="flex items-center justify-between">
              <h2 class="font-serif text-sm">Built payload · {kindLabel(kind.value)}</h2>
              <button
                type="button"
                onclick={copyPayload}
                class="inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Copy size={11} /> Copy
              </button>
            </div>
            <pre
              class="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-md border border-input bg-background/40 p-3 font-mono text-[11px] text-foreground">{built.payload}</pre>
            <p class="text-[11px] italic text-muted-foreground">{built.notes}</p>
          </div>
        {/if}

        {#if attempts.length > 0}
          <div class="space-y-2 rounded-xl border border-border bg-card/60 p-4 shadow-glass">
            <div class="flex items-center justify-between">
              <h2 class="font-serif text-sm">
                Run history ({attempts.length} attempt{attempts.length === 1 ? '' : 's'})
              </h2>
              {#if attempts.length > 1}
                <span class="text-[10px] uppercase tracking-wider text-muted-foreground">
                  pivot trail
                </span>
              {/if}
            </div>
            <ul class="flex flex-col gap-2">
              {#each attempts as a, idx (idx)}
                <li class="rounded-lg border border-input bg-background/70 p-2.5">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-[10px] text-muted-foreground"
                      >#{idx + 1}</span
                    >
                    <code class="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]"
                      >{a.kind}</code
                    >
                    <span
                      class={`ml-auto rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${verdictClass(a.refused, a.score)}`}
                    >
                      {verdictLabel(a.refused, a.score)}
                    </span>
                  </div>
                  <pre
                    class="mt-1 max-h-[20vh] overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{a.reply.slice(0, 1500)}{a.reply.length > 1500 ? '\n…' : ''}</pre>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#snippet vault()}
    <VaultSection
      store={vaultStore}
      label="Reasoning Attack Vault"
      onUse={loadVaultEntry}
    />
  {/snippet}
</ToolShell>
