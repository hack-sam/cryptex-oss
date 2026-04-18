import { generateText, streamText } from 'ai';
import type {
  ChatRequest, ChatResponse, StreamEvent, Model, KeyInfo, ProviderId, ProviderRecord
} from './types';
import { GatewayError } from './types';
import { translateError } from './errors';
import { listProviders, hasAnyKey as _hasAny } from './providers.svelte';
import { catalog, refreshCatalog } from './catalog.svelte';
import type { Adapter } from './adapters/base';
import { openrouterAdapter } from './adapters/openrouter';

export { listProviders, hasAnyKey } from './providers.svelte';

const PREFIX_RE = /^(openrouter|anthropic|openai-compat):(.+)$/;

function buildAdapter(record: ProviderRecord): Adapter {
  switch (record.id) {
    case 'openrouter': return openrouterAdapter(record);
    case 'anthropic':  throw new GatewayError('Anthropic adapter not installed yet', { category: 'not_found', provider: 'anthropic' });
    case 'openai-compat': throw new GatewayError('openai-compat adapter not installed yet', { category: 'not_found', provider: 'openai-compat' });
  }
}

export function resolve(modelId: string): { adapter: Adapter; modelId: string } {
  const m = PREFIX_RE.exec(modelId);
  if (m) {
    const [, providerId, inner] = m;
    if (providerId === 'openai-compat') {
      const [instanceId, ...rest] = inner.split('/');
      const record = listProviders().find(
        (p) => p.id === 'openai-compat' && (p as { instanceId: string }).instanceId === instanceId
      );
      if (!record) throw new GatewayError(`Unknown openai-compat instance: ${instanceId}`, { category: 'not_found', provider: 'openai-compat' });
      return { adapter: buildAdapter(record), modelId: rest.join('/') };
    }
    const pid = providerId as ProviderId;
    const record = listProviders().find((p) => p.id === pid);
    if (!record) throw new GatewayError(`Provider not configured: ${providerId}`, { category: 'not_found', provider: pid });
    return { adapter: buildAdapter(record), modelId: inner };
  }
  // Unqualified: route to first enabled OpenRouter record
  const fallback = listProviders().find((p) => p.id === 'openrouter');
  if (!fallback) throw new GatewayError('No OpenRouter provider configured', { category: 'not_found', provider: 'openrouter' });
  return { adapter: buildAdapter(fallback), modelId };
}

const RETRY_DELAYS = [1000, 4000, 16000];

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); }, { once: true });
  });
}

function normalizeRequest(req: ChatRequest): ChatRequest {
  return {
    ...req,
    maxOutputTokens: req.maxOutputTokens ?? req.max_tokens,
    topP: req.topP ?? req.top_p
  };
}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const norm = normalizeRequest(req);
  let adapter: Adapter;
  let modelId: string;
  try {
    const r = resolve(norm.model);
    adapter = r.adapter;
    modelId = r.modelId;
  } catch (e) {
    if (e instanceof GatewayError) throw e;
    throw translateError(e, 'openrouter'); // best-effort provider attribution
  }

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const result = await generateText({
        model: adapter.resolveModel(modelId) as never,
        messages: norm.messages as never,
        temperature: norm.temperature,
        maxOutputTokens: norm.maxOutputTokens,
        topP: norm.topP,
        tools: norm.tools as never,
        providerOptions: norm.providerOptions as never,
        abortSignal: norm.signal
      });
      // AI SDK v6: result.usage has inputTokens/outputTokens (not promptTokens/completionTokens)
      // result.reasoning is Array<ReasoningOutput> with .text property
      const reasoningText = Array.isArray(result.reasoning)
        ? result.reasoning.map((r: { text?: string }) => r.text ?? '').join('') || undefined
        : undefined;
      return {
        content: (result.text ?? '').trim(),
        reasoning: reasoningText,
        rawModel: result.response?.modelId ?? modelId,
        finishReason: result.finishReason,
        usage: result.usage ? {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0)
        } : undefined,
        toolCalls: result.toolCalls as ChatResponse['toolCalls']
      };
    } catch (e) {
      const err = translateError(e, adapter.id);
      const last = attempt === RETRY_DELAYS.length;
      const transient = err.category === 'rate_limit' || err.category === 'server_unavailable' || err.category === 'network';
      if (!transient || last) throw err;
      const wait = err.retryAfterMs ?? RETRY_DELAYS[attempt];
      await sleep(wait, norm.signal);
    }
  }
  // unreachable: the last iteration's catch always throws
  throw new Error('unreachable');
}

export async function* streamChat(req: ChatRequest): AsyncGenerator<StreamEvent> {
  const norm = normalizeRequest(req);
  const { adapter, modelId } = resolve(norm.model);
  const result = streamText({
    model: adapter.resolveModel(modelId) as never,
    messages: norm.messages as never,
    temperature: norm.temperature,
    maxOutputTokens: norm.maxOutputTokens,
    topP: norm.topP,
    tools: norm.tools as never,
    providerOptions: norm.providerOptions as never,
    abortSignal: norm.signal
  });
  for await (const part of result.fullStream) {
    switch (part.type) {
      // AI SDK v6: text-delta has .text (not .textDelta)
      case 'text-delta':      yield { type: 'text-delta', delta: (part as unknown as { text: string }).text }; break;
      // AI SDK v6: reasoning stream part is 'reasoning-delta' with .text
      case 'reasoning-delta': yield { type: 'reasoning-delta', delta: (part as unknown as { text: string }).text }; break;
      // AI SDK v6: tool-call has .input (not .args)
      case 'tool-call':       yield { type: 'tool-call', toolName: (part as unknown as { toolName: string }).toolName, input: (part as unknown as { input: unknown }).input, toolCallId: (part as unknown as { toolCallId: string }).toolCallId }; break;
      // AI SDK v6: tool-result has .output (not .result)
      case 'tool-result':     yield { type: 'tool-result', toolCallId: (part as unknown as { toolCallId: string }).toolCallId, result: (part as unknown as { output: unknown }).output }; break;
      // AI SDK v6: finish has .totalUsage (not .usage)
      case 'finish':          yield { type: 'finish', finishReason: part.finishReason, usage: { inputTokens: part.totalUsage.inputTokens, outputTokens: part.totalUsage.outputTokens } }; break;
    }
  }
}

export async function fetchModels(signal?: AbortSignal): Promise<Model[]> {
  await refreshCatalog(false, signal);
  return [...catalog.list];
}

export async function validateKey(
  providerId: ProviderId,
  candidate: string,
  opts?: { instanceId?: string; signal?: AbortSignal }
): Promise<KeyInfo> {
  const record = listProviders().find((p) => {
    if (p.id !== providerId) return false;
    if (providerId === 'openai-compat' && opts?.instanceId) return (p as { instanceId: string }).instanceId === opts.instanceId;
    return true;
  });
  if (!record) throw new GatewayError(`Provider not configured: ${providerId}`, { category: 'not_found', provider: providerId });
  return buildAdapter(record).validateKey(candidate, opts?.signal);
}
