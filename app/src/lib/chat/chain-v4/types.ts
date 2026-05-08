/**
 * Internal types for the chain-v4 engine. Persistence types
 * (AttackChainConfig, AttackSessionRow, OrchEvent, JudgeStageResult,
 * AttackTreeNode) live in $lib/chat/types.ts so other surfaces can
 * read them without importing from chain-v4/.
 *
 * This file holds runtime-only types: attacker output shape,
 * cascaded-judge return shape, the per-stream context bag, the
 * runner config, and the budget runtime state.
 *
 * Phase 1: types only. Implementations land in phase 2+.
 */
import type { GatewayChatFn, StreamChatFn } from '../chain/orchestrator';

export type EngineMode = 'pair' | 'tap' | 'crescendo';

/**
 * Strict-JSON output shape the attacker LLM is asked to emit on every
 * iteration. The orchestrator parses this; malformed output triggers a
 * one-shot retry, then a fallback.
 */
export interface AttackerOutput {
  /** What the attacker thinks went wrong on the prior turn (CoT). Optional
   *  on the first turn (no prior turn). */
  improvement?: string;
  /** The candidate prompt to send to the target on this turn. */
  prompt: string;
  /** Optional persona id the attacker chose for this turn (defaults to
   *  the runner-selected persona). */
  persona?: string;
}

/**
 * Cascaded judge output. Stage 1 is the cheap refusal classifier;
 * stage 2 is the substantive jailbreak grader. Stage 2 is only run
 * when stage 1 says NOT refused (saves judge tokens on obvious refusals).
 */
export interface CascadedJudgeResult {
  /** Stage 1: did the target refuse / safety-deflect? */
  refused: boolean;
  /** Stage 2: 0..10 substantive jailbreak score. 0 when refused. */
  jailbreakScore: number;
  /** Short rationale combining both stages. */
  reasoning: string;
  /** Whether the judge believes the response actually fulfilled the goal
   *  (independent of score — used for early-stop decisions). */
  fulfillsGoal: boolean;
}

/**
 * Off-topic pruner output. Cheap-model call decides whether the candidate
 * still asks the original goal or has drifted into a benign substitute.
 */
export interface OffTopicResult {
  /** True when the candidate is still asking for the goal. */
  onTopic: boolean;
  /** Short rationale. */
  reasoning?: string;
}

/**
 * Runtime budget tracking. Decremented on each call; the runner aborts
 * when any field crosses its cap.
 */
export interface BudgetState {
  startedAt: number;
  /** Caps as configured. */
  maxQueries: number;
  maxUsd: number;
  maxWallclockMs: number;
  /** Live counters. */
  queriesUsed: number;
  usdUsed: number;
  /** Convenience: returns true when ANY cap is exhausted. */
  exhausted: () => false | 'queries' | 'usd' | 'time';
}

/**
 * Per-stream runtime context. Multiple streams may run concurrently in
 * the orchestrator's race+early-stop loop.
 */
export interface StreamContext {
  streamId: number;
  /** Per-stream attacker conversation history (the attacker LLM's
   *  in-context memory of past (response, score, reasoning) tuples). */
  attackerHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  /** Persona id selected for this stream. */
  personaId: string;
  /** TAP-only: per-stream tree node store. */
  tree?: Map<string, unknown>;
}

/**
 * The full v4 runner context. Mirrors v3's AttackSessionContext shape
 * for the parts the orchestrator's caller already provides; adds the
 * v4-specific knobs.
 */
export interface ChainV4Context {
  objective: string;
  targetModelId: string;
  orchestratorModelId: string;
  judgeModelId: string;
  /** Cheap model used for refusal classification + off-topic pruning.
   *  Falls back to judgeModelId if not provided. */
  cheapModelId?: string;
  targetModelLabel: string;
  mainChatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  signal: AbortSignal;
  gatewayChat: GatewayChatFn;
  streamChat: StreamChatFn;

  // v4-specific
  mode: EngineMode;
  budget: {
    maxQueries: number;
    maxUsd: number;
    maxWallclockSec: number;
  };
  streamCount: number;
  enableCotHijack: boolean;
  enableBestOfN: boolean;
  bestOfN: number;
  /** Optional persona-id hints. Selected first by pickPersona() when
   *  they intersect the heuristic candidate pool; family + memory
   *  ranking applies only after preferred ids are exhausted. Only
   *  consumed by PAIR + TAP (Crescendo uses its own attacker
   *  system prompt and ignores hints). */
  personaHints?: string[];
}

// ── Default budget values (used when config doesn't provide them) ────────
export const DEFAULT_V4_BUDGET = {
  maxQueries: 20,
  maxUsd: 0.5,
  maxWallclockSec: 300
} as const;

export const DEFAULT_V4_MODE: EngineMode = 'pair';
export const DEFAULT_V4_STREAM_COUNT = 1;
export const DEFAULT_V4_BEST_OF_N = 3;
