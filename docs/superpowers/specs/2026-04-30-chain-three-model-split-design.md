# Chain Three-Model Split Design

**Status:** Approved, ready for implementation plan.

**Trigger:** User-reported jailbreak ineffectiveness. Today, Chain v3 yokes orchestrator + target + judge to one model — when that model is aligned (Claude / GPT), the orchestrator refuses to draft attack messages, the judge under-scores its own responses, and the engine's "complete run" gives back nothing useful. Splitting role assignment is the highest-leverage single change for actually breaking aligned targets.

## Goal

Allow the user to pick three independent models — Orchestrator, Target, Judge — for any Chain attack session, with smart defaults that recommend an uncensored model for orchestrator and a small/cheap model for judge while leaving target as the chat's main model. Each picker selects from the full catalog of any configured provider.

## Non-goals

- Provider account / billing UI changes.
- New uncensored-model integrations beyond what OpenRouter already serves.
- Auto-detecting "uncensored" status at runtime (we use a small static list + name-pattern heuristic).
- Backward-compat migration that proactively rewrites old configs (read-side fallback handles it).
- Per-strategy model overrides (single triple per session).

## Locked decisions (from brainstorm Q1–Q2)

- **Q1 = (a)** Three labelled stacked pickers above the objective, always visible.
- **Q2 = (b) + multi-provider** Smart defaults via a `RECOMMENDED_DEFAULTS` map, with full catalog selection in each picker (any model from any configured provider).

---

## Architecture

```
┌─ AttackChainTab ─────────────────────────────────────────────┐
│ Orchestrator   drafts the attack messages                     │
│ <ModelPickerV2 value={orchestrator} onChange={persist} />     │
│ ⓘ Tip: pick an uncensored model — see Guide                  │  ← only when fallback fired and not dismissed
│                                                                │
│ Target          the model under test                          │
│ <ModelPickerV2 value={target}        onChange={persist} />    │
│                                                                │
│ Judge           scores responses (cheap is fine)              │
│ <ModelPickerV2 value={judge}         onChange={persist} />    │
│                                                                │
│ Objective                                                      │
│ <textarea>                                                     │
│ Total turns: <slider>                                         │
│ [Run attack]                                                  │
└──────────────────────────────────────────────────────────────┘
```

The three pickers persist independently to `chat.settings.attackChainConfig.{orchestrator,target,judge}ModelId`. The engine reads all three from the resolved config (with read-side fallback chain) and routes each LLM interaction to the correct model.

### Engine routing matrix

| Engine call site | Model used |
|---|---|
| `runDossierPhase(...)` (Phase 0 — research) | `orchestratorModelId` (browsing-capable detection still applies) |
| `refineTurn(...)` (per-iteration draft polish) | `orchestratorModelId` |
| `streamChat(...)` (per-iteration target reply) | `targetModelId` |
| Inline `judgeClient.complete(...)` (compliance + progress scoring) | `judgeModelId` |

`runAttackSession`'s context type gains `judgeModelId: string`. The inline judgeClient at the score step (currently using `ctx.orchestratorModelId`) switches to `ctx.judgeModelId`.

---

## Section 1 — Persistence

Extend `AttackChainConfig` (the nested object on `chat.settings`):

```ts
export interface AttackChainConfig {
  // existing
  input?: string;
  layers?: string[];
  modelQualifiedId?: string;       // legacy single field — kept read-side only

  // v3-three-model
  orchestratorModelId?: string;
  targetModelId?: string;
  judgeModelId?: string;
  recommendedTipDismissed?: boolean;
}
```

### Read-side fallback chain (per role)

For each of `{ orchestrator, target, judge }`:

```
attackChainConfig.<role>ModelId
  ?? attackChainConfig.modelQualifiedId        // legacy single-model
  ?? chat.modelQualifiedId                     // chat default (always present)
```

Existing rows with only `modelQualifiedId` set keep working — all three roles resolve to that one model. Once the user touches any picker, the new fields are written and the legacy field is left untouched but ignored for that role.

---

## Section 2 — Default model resolver

New file `app/src/lib/chat/chain/default-models.ts`.

### `RECOMMENDED_DEFAULTS`

A small static map of recommended models per role, ordered by preference:

```ts
export const RECOMMENDED_DEFAULTS = {
  orchestrator: [
    'openrouter:deepseek/deepseek-r1',
    'openrouter:deepseek/deepseek-chat-v3.1',
    'openrouter:nousresearch/hermes-3-llama-3.1-405b',
    'openrouter:cognitivecomputations/dolphin-mixtral-8x22b'
  ],
  judge: [
    'openrouter:openai/gpt-4o-mini',
    'openrouter:google/gemini-2.5-flash',
    'openrouter:anthropic/claude-haiku-4-5'
  ]
} as const;
```

Adding a new recommendation is a one-line change. Models go stale; a maintainer updates the list.

### `resolveDefaultModels`

```ts
export function resolveDefaultModels(args: {
  chat: ChatRow;
  availableModels: Array<{ qualifiedId: string }>;
}): { orchestrator: string; target: string; judge: string } {
  const ids = new Set(args.availableModels.map((m) => m.qualifiedId));
  const pick = (candidates: readonly string[]) =>
    candidates.find((id) => ids.has(id));
  return {
    orchestrator: pick(RECOMMENDED_DEFAULTS.orchestrator) ?? args.chat.modelQualifiedId,
    target:       args.chat.modelQualifiedId,
    judge:        pick(RECOMMENDED_DEFAULTS.judge)        ?? args.chat.modelQualifiedId
  };
}
```

If the user has no provider that serves any of the recommended models, all three fall back to the chat's main model. The tip in Section 3 fires in that case.

### `isUncensoredOrchestrator`

Heuristic for whether to show the orchestrator-fallback tip:

```ts
export function isUncensoredOrchestrator(modelId: string): boolean {
  if (!modelId) return false;
  if ((RECOMMENDED_DEFAULTS.orchestrator as readonly string[]).includes(modelId)) return true;
  return /deepseek|hermes|dolphin|nous|abliterated|uncensored|venice|llama-?3-?70b-?instruct$/i.test(modelId);
}
```

False positives are fine — they just suppress a tip that's already advisory. False negatives (a real uncensored model not matched) just keep the tip on, which is also harmless.

---

## Section 3 — UI components

### `RoleModelPicker.svelte` (new)

Small wrapper around `<ModelPickerV2>` that adds the role label, description, and optional inline tip:

```svelte
<script lang="ts">
  import ModelPickerV2 from '$lib/components/ai/ModelPickerV2.svelte';
  import type { Snippet } from 'svelte';

  type Props = {
    label: string;
    description: string;
    value: string;
    onChange: (id: string) => void;
    tip?: Snippet | null;
  };
  let { label, description, value, onChange, tip = null }: Props = $props();
</script>

<div class="flex flex-col gap-1">
  <div class="flex items-baseline gap-2 text-xs">
    <span class="font-medium text-foreground">{label}</span>
    <span class="text-[10px] text-muted-foreground">{description}</span>
  </div>
  <ModelPickerV2 {value} {onChange} />
  {#if tip}{@render tip()}{/if}
</div>
```

### `AttackChainTab.svelte` (modify)

Add three `<RoleModelPicker>` instances above the existing objective input. Each picker reads from the resolved fallback chain and writes through a `setRoleModel(role, id)` helper that calls `repo.updateChat`.

The orchestrator picker conditionally renders a dismissible tip when `!isUncensoredOrchestrator(orchestratorModelId)` and `!attackChainConfig.recommendedTipDismissed`:

```svelte
{#snippet orchestratorTip()}
  <div class="flex items-start gap-1 rounded bg-yellow-500/10 px-2 py-1 text-[10px] text-yellow-400">
    <Info size={10} class="shrink-0 mt-0.5" />
    <span class="flex-1">
      Aligned models often refuse to draft attack messages. Pick an uncensored
      orchestrator (DeepSeek R1, Nous Hermes, Dolphin) for higher success rates.
      <a href="{base}/guide/chat/attack-chain" class="underline">Learn more</a>
    </span>
    <button type="button" onclick={dismissTip} class="text-yellow-400/60 hover:text-yellow-400">×</button>
  </div>
{/snippet}
```

### Where pickers fit

Pickers go between the existing tile header (left-edge handle + Attack workspace title + History disclosure) and the objective textarea. They become the FIRST thing the user sees inside the form area — by design, so users pause to consider role assignment before clicking Run.

---

## Section 4 — Engine changes

### `AttackSessionContext` extension

Add `judgeModelId: string` (required, not optional — caller must always supply).

```ts
export interface AttackSessionContext {
  objective: string;
  targetModelId: string;
  orchestratorModelId: string;
  judgeModelId: string;            // NEW
  targetModelLabel: string;
  maxAttempts: number;
  mainChatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  signal: AbortSignal;
  gatewayChat: GatewayChatFn;
  streamChat: StreamChatFn;
}
```

### Engine route changes

In `runAttackSession`, the inline `judgeClient` block currently passes `model: ctx.orchestratorModelId`. Change to `model: ctx.judgeModelId`. `runDossierPhase` and `refineTurn` continue to use `orchestratorModelId`. `streamChat` continues to use `targetModelId`.

No other engine logic changes. The state machine, scorer, dossier phase, refine prompt — all unchanged.

---

## Section 5 — File surface

| File | Action |
|---|---|
| `app/src/lib/chat/types.ts` | Extend `AttackChainConfig` interface with three new model-id fields + `recommendedTipDismissed?: boolean` |
| `app/src/lib/chat/chain/default-models.ts` | Create — `RECOMMENDED_DEFAULTS`, `resolveDefaultModels`, `isUncensoredOrchestrator` |
| `app/src/lib/chat/chain/__tests__/default-models.test.ts` | Create — resolver fallback, heuristic regex coverage |
| `app/src/lib/chat/chain/orchestrator.ts` | Add `judgeModelId` to `AttackSessionContext`; route judge calls through it |
| `app/src/lib/chat/chain/__tests__/orchestrator.test.ts` | Add scenario: judge call uses judgeModelId, target uses targetModelId, refine uses orchestratorModelId |
| `app/src/lib/components/chat/attack-chain/RoleModelPicker.svelte` | Create — wrapper around ModelPickerV2 with label + description + tip slot |
| `app/src/lib/components/chat/attack-chain/AttackChainTab.svelte` | Add three RoleModelPickers above objective; resolve defaults; persist on change; dismiss-tip handler; pass `judgeModelId` to engine context |

---

## Section 6 — Test plan

### Unit
- `default-models.test.ts`:
  - `resolveDefaultModels` returns chat's main model for all three when no recommended is in `availableModels`.
  - Returns recommended orchestrator + judge when those IDs are in the catalog.
  - `target` always returns the chat's main model regardless.
  - `isUncensoredOrchestrator` returns true for each entry in `RECOMMENDED_DEFAULTS.orchestrator`, true for `deepseek-chat-v3.1`, `dolphin-mixtral`, `nous-hermes`, `llama-3-70b-instruct`. False for `claude-sonnet-4-5`, `gpt-4o`, `gemini-2.5-pro`.
- `orchestrator.test.ts`:
  - New scenario "Scenario I — judge isolation" — wires three different mock model IDs, asserts `gatewayChat`'s `model` argument per call: dossier + refine = `'mock:orch'`, judges = `'mock:judge'`, streams = `'mock:target'`.
  - Existing 8 scenarios update their `makeCtx` to include `judgeModelId: 'mock:orch'` (preserves current single-model behavior in tests that don't care).

### Manual smoke
1. Open Chain in a fresh chat with only OpenRouter configured. Verify three pickers default to: orchestrator = deepseek/deepseek-r1, target = chat's main, judge = openai/gpt-4o-mini.
2. Switch orchestrator to `claude-sonnet-4-5`. Tip appears.
3. Click × on tip. Tip disappears, reload page — stays dismissed for that chat.
4. Switch back to deepseek. Tip stays hidden (was dismissed).
5. Open Chain in a different chat — tip reappears (per-chat dismissal).
6. Run an attack. Open the Network panel — confirm the gateway requests use the right `model` per role: dossier+refine to deepseek, target streams to claude, judge calls to gpt-4o-mini.
7. Old chat with only `attackChainConfig.modelQualifiedId` set: all three pickers populated with that legacy ID; attack runs identically to before.

---

## Section 7 — Risks

1. **Recommended models go stale.** OpenRouter deprecates `deepseek-r1` someday. Mitigation: `pickFirstAvailable` falls through the priority list; if all candidates are missing, the chat's main model is used. Add a periodic check to update the list.
2. **Multi-provider catalog aggregation may be slow on first render.** `availableModels` comes from `<ModelPickerV2>`'s store — already cached per session. No new latency introduced.
3. **`judgeClient` change could break existing test mocks.** All existing orchestrator tests need their `makeCtx` updated to include `judgeModelId`. ~8 tests touched.
4. **Per-chat dismissed flag means a user re-creating chats sees the tip again.** Acceptable — each new chat is a fresh decision point.

---

## Section 8 — Out of scope (deferred)

- Auto-recommending models based on objective domain (security → red-team-trained models, fiction → creative models).
- Per-strategy model assignment (different orchestrator for each of the 12 strategies).
- A "Use recommended defaults" reset button on the Chain tab (user can reload chat to re-resolve, or pick manually).
- Live cost estimation per-run based on the three model picks.
- Auto-rotating to fallback model when the chosen orchestrator returns 429 or 5xx for N consecutive turns.

## Scope coverage checklist

| Brainstorm decision | Implementing section |
|---|---|
| Q1 three stacked labelled pickers above objective | Section 3 |
| Q2 smart defaults with multi-provider selection | Sections 2, 3 |
| Engine routes judge to its own model | Section 4 |
| Persistence with read-side fallback | Section 1 |
| Backward compat with legacy `modelQualifiedId` | Section 1 |
