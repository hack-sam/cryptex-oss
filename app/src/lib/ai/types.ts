export type ProviderId = 'openrouter' | 'anthropic' | 'openai-compat';

export type QualifiedModelId = `${ProviderId}:${string}` | string;

export type ErrorCategory =
  | 'auth' | 'credit' | 'forbidden' | 'not_found'
  | 'rate_limit' | 'network' | 'format' | 'cors' | 'api' | 'server_unavailable' | 'unknown';

export class GatewayError extends Error {
  readonly category: ErrorCategory;
  readonly status?: number;
  readonly provider: ProviderId;
  readonly retryAfterMs?: number;
  readonly raw?: unknown;
  constructor(msg: string, opts: {
    category: ErrorCategory; status?: number; provider: ProviderId;
    retryAfterMs?: number; raw?: unknown;
  }) {
    super(msg);
    this.name = 'GatewayError';
    this.category = opts.category;
    this.status = opts.status;
    this.provider = opts.provider;
    this.retryAfterMs = opts.retryAfterMs;
    this.raw = opts.raw;
  }
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string | ArrayBuffer; mediaType?: string }
  | { type: 'file'; data: ArrayBuffer; mediaType: string; filename?: string };

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
};

export type ToolDef = {
  description: string;
  inputSchema: unknown;
  execute?: (input: unknown) => Promise<unknown>;
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  max_tokens?: number;
  topP?: number;
  top_p?: number;
  title?: string;
  tools?: Record<string, ToolDef>;
  providerOptions?: Record<string, unknown>;
  signal?: AbortSignal;
};

export type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
};

export type ChatResponse = {
  content: string;
  reasoning?: string;
  rawModel: string;
  finishReason?: string;
  usage?: Usage;
  toolCalls?: Array<{ toolName: string; input: unknown; toolCallId: string }>;
};

export type StreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'reasoning-delta'; delta: string }
  | { type: 'tool-call'; toolName: string; input: unknown; toolCallId: string }
  | { type: 'tool-result'; toolCallId: string; result: unknown }
  | { type: 'finish'; finishReason: string; usage: Usage };

export type Model = {
  id: string;
  qualifiedId: QualifiedModelId;
  name: string;
  provider: ProviderId;
  providerInstanceId?: string;
  upstreamProvider?: string;
  contextLength?: number;
  isFree?: boolean;
  capabilities?: {
    streaming?: boolean;
    tools?: boolean;
    vision?: boolean;
    pdf?: boolean;
    reasoning?: boolean;
    jsonSchema?: boolean;
  };
  pricing?: { promptUsd?: number; completionUsd?: number };
};

export type KeyInfo = {
  label?: string;
  limit?: number | null;
  usage?: number;
  rateLimit?: { requests?: number; interval?: string };
  raw?: unknown;
};

export type ProviderRecord =
  | { id: 'openrouter'; apiKey: string; enabled: boolean; fallbackModel?: string }
  | { id: 'anthropic'; apiKey: string; enabled: boolean; fallbackModel?: string }
  | {
      id: 'openai-compat';
      instanceId: string;
      name: string;
      presetId: string | 'custom';
      baseURL: string;
      apiKey: string;
      enabled: boolean;
      fallbackModel?: string;
      testModel?: string;
    };

export type ProviderPreset = {
  id: string;
  name: string;
  baseURL: string;
  docsUrl: string;
  defaultTestModel?: string;
  supportsAuthProbe: boolean;
};
