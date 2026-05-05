import type { TechniqueDNA } from './godmode/dna';
import type { RefusalTier } from './attack-chain-refusal';

export type Role = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Snapshot of an in-progress Attack Chain configuration, persisted on the
 * parent chat row so the drawer state survives close / reopen / send-back
 * actions. Results are NOT persisted here — those live in `attackChainRuns`.
 */
export interface AttackChainConfig {
  input: string;
  layers: string[];
  layerParams: Array<Record<string, unknown>>;
  layerOutputEdits: Array<string | null>;
  executeEnabled: boolean;
  finalSystemPrompt: string;
  autoRetryEnabled: boolean;
  modelQualifiedId?: string;
  /** v3-three-model: orchestrator (drafts attack messages). Falls back to
   *  modelQualifiedId then chat.modelQualifiedId at read time. */
  orchestratorModelId?: string;
  /** v3-three-model: target (model under test). Falls back the same way. */
  targetModelId?: string;
  /** v3-three-model: judge (scores compliance + objective progress). */
  judgeModelId?: string;
  /** v3-three-model: per-chat dismissal of the orchestrator-fallback tip. */
  recommendedTipDismissed?: boolean;
}

/**
 * Snapshot of an in-progress Godmode tab configuration, persisted on the
 * parent chat row so the drawer state survives close / reopen / tab switch.
 * Run results are NOT persisted here — those live in `godmodeRuns`.
 */
export interface GodmodeConfig {
  task: string;
  K: 3 | 6 | 12;
  modelQualifiedId?: string;
  saveForm: {
    expanded: boolean;
    name: string;
    decompose: boolean;
  };
}

export interface ChatSettings {
  systemPrompt: string;
  temperature: number;
  topP?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  activeMode?: string | null;
  godmodeEnabled: boolean;
  enabledToolIds: string[];
  toolChoice: 'auto' | 'none' | 'required';
  maxToolCalls: number;
  attackChainConfig?: AttackChainConfig;
  godmodeConfig?: GodmodeConfig;
  workspaceTab?: 'chain' | 'godmode';
  workspaceOpen?: boolean;
  /** Width of the right workspace drawer in px. Persisted so the
   *  user's resize sticks across reloads. Clamped 320..800 at write. */
  workspaceWidth?: number;
  /** v3-UI: pixel width of the left sidebar tile. Clamped [240, 480] at use sites. */
  leftSidebarWidth?: number;
  /** v3-UI: pixel width of the right (attack workspace) sidebar tile. Clamped [320, 800].
   *  Supersedes `workspaceWidth`; readers prefer this when present. */
  rightSidebarWidth?: number;
  /** v3.2: pin a past Chain session's transcript as the chat's working context.
   *  When set, dispatch.sendTurn prepends the session's turns to every send so
   *  the target sees the conversation as continuing from the won state. Missing
   *  / deleted sessions trigger silent unpin at send time. */
  persistedAttackSessionId?: string;
}

export interface ChatRow {
  id: string;
  ownerId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  modelQualifiedId: string;
  settings: ChatSettings;
  parentChatId?: string;
  parentMessageId?: string;
  pinned?: boolean;
  archivedAt?: number | null;
  tags: string[];
  tombstoned?: boolean;
}

export interface ToolCallLog {
  toolCallId: string;
  source: 'transformer' | 'slash' | 'mcp' | 'attack-chain' | 'godmode' | 'chain_session';
  toolName: string;
  input: unknown;
  output: unknown;
  errorMessage?: string;
  durationMs: number;
}

export interface SamplingParams {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  reasoningEffort?: string;
  thinkingLevel?: string;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

export interface MessageRow {
  id: string;
  ownerId: string;
  chatId: string;
  parentId?: string;
  role: Role;
  createdAt: number;
  content: string;
  contentRaw?: string;
  reasoning?: string;
  toolCalls?: ToolCallLog[];
  toolCallId?: string;
  attachmentIds?: string[];
  modelRequested?: string;
  modelReturned?: string;
  provider?: 'openrouter' | 'anthropic' | 'openai-compat';
  providerInstanceId?: string;
  systemPromptSnapshot?: string;
  samplingParams?: SamplingParams;
  modeApplied?: string | null;
  tokenUsage?: TokenUsage;
  finishReason?: string;
  truncated?: boolean;
  latencyMs?: number;
  costUsd?: number;
  rating?: 1 | 2 | 3 | 4 | 5;
  thumbsUp?: boolean;
  thumbsDown?: boolean;
  tags: string[];
  trainingInclude?: boolean;
  split?: 'train' | 'val';
  error?: string;
  tombstoned?: boolean;
}

export interface AttachmentRow {
  id: string;
  ownerId: string;
  messageId: string;
  kind: 'image' | 'pdf' | 'docx' | 'text' | 'other';
  name: string;
  mime: string;
  size: number;
  blob: Blob;
  extractedText?: string;
  thumbnail?: Blob;
  createdAt: number;
  updatedAt: number;
  tombstoned?: boolean;
}

export interface ToolStateRow {
  toolId: string;
  ownerId: string;
  state: unknown;
  updatedAt: number;
}

/**
 * Trace row for one layer attempt in an Attack Chain run. Structured loosely
 * so existing layer-result shapes serialize cleanly without transformation.
 */
export interface AttackChainLayerTrace {
  layerIndex: number;
  attempt?: number;
  techniqueId: string;
  techniqueName: string;
  input: string;
  output: string;
  startedAt: number;
  durationMs: number;
  error?: string;
  finalPrompt?: string;
}

/**
 * Persisted row for one execution of an Attack Chain — seed input, chain
 * config, full per-layer trace, and the final output (executed model
 * response if the execute layer ran, else the last mutated prompt). Stored
 * in the `attackChainRuns` Dexie table, indexed by chatId + createdAt so
 * the drawer can show a per-chat history panel.
 */
export interface AttackChainRunRow {
  id: string;
  ownerId: string;
  chatId: string;
  createdAt: number;
  updatedAt: number;
  input: string;
  layers: string[];
  layerParams: Array<Record<string, unknown>>;
  finalSystemPrompt?: string;
  executeEnabled: boolean;
  results: AttackChainLayerTrace[];
  finalOutput?: string;
  tags: string[];
  tombstoned?: boolean;
}

/**
 * One successful candidate from a Godmode run. Failed candidates
 * (timeout / api_error / cancelled) are excluded from history.
 */
export interface GodmodeCandidateRecord {
  dna: TechniqueDNA;
  response: string;
  score: number;
  tier: RefusalTier;
  preview: string;
}

/**
 * Persisted row for one Godmode engine run — task, config, winner,
 * every successful candidate. Stored in the `godmodeRuns` Dexie table,
 * indexed by chatId + createdAt for the per-chat history panel.
 */
export interface GodmodeRunRow {
  id: string;
  ownerId: string;
  chatId: string;
  createdAt: number;
  updatedAt: number;
  task: string;
  K: 3 | 6 | 12;
  modelId: string;
  winner: GodmodeCandidateRecord;
  candidates: GodmodeCandidateRecord[];
  tombstoned?: boolean;
}

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  systemPrompt: 'You are Cryptex, a helpful assistant for security research, prompt engineering, and text transformation. Respond in English unless the user writes in another language. Be concise and useful.',
  temperature: 0.7,
  activeMode: null,
  godmodeEnabled: false,
  enabledToolIds: [],
  toolChoice: 'auto',
  maxToolCalls: 4
};

// ---- Chain Orchestrator v2 ---------------------------------------------------

/** 5-tier refusal classification — compliance dimension of scoring. */
export type ComplianceTier = 'refusal' | 'evasive' | 'partial' | 'substantive' | 'compliant';

/** The 12 jailbreak strategies the orchestrator picks among. See
 *  chain/orchestrator-strategies.ts for the definitions. */
export type StrategyId =
  | 'historical' | 'analogical' | 'roleplay' | 'ctf_framing'
  | 'academic' | 'hypothetical_world' | 'step_back' | 'payload_split'
  | 'chain_of_verification' | 'red_team_persona' | 'fiction_writing' | 'socratic_pivot';

export interface AttackSessionTurn {
  role: 'orchestrator' | 'target';
  strategyId?: StrategyId;
  text: string;
  rationale?: string;
  complianceTier?: ComplianceTier;
  objectiveProgress?: number;    // 0-10
  durationMs?: number;
  createdAt: number;
  error?: string;
}

export interface StrategyLogEntry {
  iteration: number;
  strategyId: StrategyId;
  action: 'turn' | 'pivot' | 'finish' | 'dossier';
  /** v3: which step within a strategy (1..turnsPerStrategy). Absent on non-turn actions. */
  stepIndex?: number;
  rationale: string;
}

/** Persisted row for one Chain orchestrator session — the multi-turn conversation
 *  plus strategy log plus final outcome. Stored in the `attackSessions` Dexie
 *  table, indexed by chatId + createdAt for the per-chat history panel. */
export interface AttackSessionRow {
  id: string;
  ownerId: string;
  chatId: string;
  createdAt: number;
  updatedAt: number;
  tombstoned?: boolean;
  objective: string;
  targetModelId: string;
  orchestratorModelId: string;
  maxAttempts: number;
  turns: AttackSessionTurn[];
  strategyLog: StrategyLogEntry[];
  finalOutcome: 'extracted' | 'partial' | 'abandoned' | null;
  finalConfidence: number | null;
  finalSummary: string | null;
  /** v3: research briefing prose produced when the orchestrator model
   *  natively browses. Null when skipped or dossier failed. */
  dossier: string | null;
  /** v3: URLs parsed out of the dossier (empty array if no dossier). */
  dossierCitations: string[];
  /** v3: the fixed rotation order locked at run start, persisted for replay. */
  strategyRotation: StrategyId[];
  /** v3: per-strategy turn budget (default 3). */
  turnsPerStrategy: number;
  /** v3.1: the answer the judge extracted from the target transcript at run termination.
   *  Null when no answer was extracted (target refused, or judge couldn't find one). */
  finalAnswer?: string | null;
  /** v3.1: judge confidence in the extracted answer (0..1). Null when finalAnswer is null. */
  finalAnswerConfidence?: number | null;
  /** v3.1: short prose rationale from the judge for the extraction decision. */
  finalAnswerRationale?: string | null;
}

/** Events emitted by runAttackSession's async generator. The UI consumes these
 *  to render the live conversation + strategy trace + final summary. */
export type OrchEvent =
  | { type: 'plan_start'; objective: string; maxAttempts: number }
  | { type: 'turn_started'; iteration: number; strategyId: StrategyId }
  | { type: 'orchestrator_turn_committed'; turn: AttackSessionTurn }
  | { type: 'target_reply_delta'; iteration: number; delta: string }
  | { type: 'target_turn_committed'; turn: AttackSessionTurn }
  | { type: 'turn_scored'; iteration: number; tier: ComplianceTier; progress: number }
  | {
      type: 'finished';
      outcome: 'extracted' | 'partial' | 'abandoned';
      confidence: number;
      summary: string;
      finalAnswer: string | null;
      finalAnswerConfidence: number;
      finalAnswerRationale: string;
    }
  | { type: 'error'; code: string; message: string; iteration?: number }
  // v3 additions
  | { type: 'dossier_started' }
  | { type: 'dossier_completed'; citationCount: number; dossier: string; citations: string[] }
  | { type: 'dossier_failed'; reason: string }
  | { type: 'strategy_started'; iteration: number; strategyId: StrategyId; stepBudget: number }
  | { type: 'strategy_pivoted'; iteration: number; from: StrategyId; to: StrategyId; reset: boolean };
