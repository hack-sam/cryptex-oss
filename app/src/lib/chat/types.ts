export type Role = 'user' | 'assistant' | 'system' | 'tool';

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

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  systemPrompt: 'You are Cryptex, a helpful assistant for security research, prompt engineering, and text transformation. Respond in English unless the user writes in another language. Be concise and useful.',
  temperature: 0.7,
  activeMode: null,
  godmodeEnabled: false,
  enabledToolIds: [],
  toolChoice: 'auto',
  maxToolCalls: 4
};
