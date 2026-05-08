/**
 * chain-v4 entry point.
 *
 * Public surface: `runAttackSessionV4(ctx)` — async generator yielding
 * OrchEvent. Mirrors v3's `runAttackSession` signature so the caller in
 * AttackChainTab.svelte (post phase 7) only branches on
 * `attackChainConfig.engineVersion`.
 *
 * Phase 1 status: STUB. We delegate to v3's runAttackSession so the v4
 * code path is exercisable end-to-end while the actual modes (PAIR/TAP/
 * Crescendo) are implemented in phases 2–5. The stub yields one
 * `stream_started` + a delegated v3 run + one `stream_finished`, so
 * existing UI handlers light up the new stream-event surface immediately.
 *
 * Backward compat: when called with `mode === 'pair'` (default), this
 * stub is functionally identical to v3 — no behaviour change for users
 * who flip `engineVersion='v4'` early. Real PAIR semantics replace the
 * stub in phase 3.
 */
import type { OrchEvent } from '$lib/chat/types';
import {
  runAttackSession,
  type AttackSessionContext
} from '../chain/orchestrator';
import type { ChainV4Context } from './types';
import { runPairLoop } from './pair';
import { runTapLoop } from './tap';
import { runCrescendoLoop } from './crescendo';

export type { ChainV4Context };
export {
  DEFAULT_V4_BUDGET,
  DEFAULT_V4_MODE,
  DEFAULT_V4_STREAM_COUNT,
  DEFAULT_V4_BEST_OF_N
} from './types';

/**
 * Build a v3 AttackSessionContext from a v4 ChainV4Context. Used as a
 * fallback for modes that aren't implemented yet (TAP, Crescendo until
 * phases 4 and 5).
 */
function v4CtxToV3(ctx: ChainV4Context): AttackSessionContext {
  return {
    objective: ctx.objective,
    targetModelId: ctx.targetModelId,
    orchestratorModelId: ctx.orchestratorModelId,
    judgeModelId: ctx.judgeModelId,
    targetModelLabel: ctx.targetModelLabel,
    maxAttempts: ctx.budget.maxQueries,
    mainChatHistory: ctx.mainChatHistory,
    signal: ctx.signal,
    gatewayChat: ctx.gatewayChat,
    streamChat: ctx.streamChat
  };
}

/**
 * v4 entry point. Routes by `ctx.mode`:
 *
 *   pair       → real PAIR loop (phase 3, this commit)
 *   tap        → v3 fallback until phase 4
 *   crescendo  → v3 fallback until phase 5
 *
 * Yields `plan_start`, `stream_started`, the inner mode's events,
 * `stream_finished`, in that order. Existing UI handlers consume the
 * shared OrchEvent types unchanged.
 */
export async function* runAttackSessionV4(
  ctx: ChainV4Context
): AsyncGenerator<OrchEvent> {
  yield { type: 'plan_start', objective: ctx.objective, maxAttempts: ctx.budget.maxQueries };

  const streamId = 0;
  yield { type: 'stream_started', streamId };

  let outcome: 'extracted' | 'partial' | 'abandoned' = 'abandoned';
  try {
    if (ctx.mode === 'pair') {
      for await (const ev of runPairLoop(ctx, { streamId })) {
        yield ev;
        if (ev.type === 'finished') outcome = ev.outcome;
      }
    } else if (ctx.mode === 'tap') {
      for await (const ev of runTapLoop(ctx, { streamId })) {
        yield ev;
        if (ev.type === 'finished') outcome = ev.outcome;
      }
    } else if (ctx.mode === 'crescendo') {
      for await (const ev of runCrescendoLoop(ctx, { streamId })) {
        yield ev;
        if (ev.type === 'finished') outcome = ev.outcome;
      }
    } else {
      // No other modes today; fall back to v3 if some unknown mode is
      // configured so users get something instead of an error.
      yield {
        type: 'error',
        code: 'mode_not_implemented',
        message: `chain-v4 mode '${ctx.mode}' not yet implemented; falling back to v3`
      };
      for await (const ev of runAttackSession(v4CtxToV3(ctx))) {
        yield ev;
        if (ev.type === 'finished') outcome = ev.outcome;
      }
    }
  } finally {
    yield { type: 'stream_finished', streamId, outcome };
  }
}
