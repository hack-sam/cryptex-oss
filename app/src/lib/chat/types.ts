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
  source: 'transformer' | 'slash' | 'mcp' | 'attack-chain';
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
