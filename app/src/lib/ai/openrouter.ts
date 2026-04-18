/**
 * @deprecated Since 2026-04-18. Use `$lib/ai/gateway` instead. This shim will be
 * removed in Commit 6 of the gateway rollout.
 */
import type {
  ChatMessage as GatewayChatMessage,
  ChatRequest as GatewayChatRequest,
  ChatResponse as GatewayChatResponse,
  KeyInfo as GatewayKeyInfo,
  Model as GatewayModel,
  ErrorCategory
} from './types';
import { GatewayError } from './types';
import { chat as gatewayChat, validateKey as gatewayValidateKey, fetchModels as gatewayFetchModels } from './gateway';
import { listProviders, updateProvider } from './providers.svelte';

export type { ErrorCategory };
export type ChatMessage = GatewayChatMessage;
export type ChatRequest = GatewayChatRequest;
export type ChatResponse = GatewayChatResponse;
export type KeyInfo = GatewayKeyInfo;
export type Model = GatewayModel;

/** @deprecated Use GatewayError from $lib/ai/types. */
export const OpenRouterError = GatewayError;
export type OpenRouterError = GatewayError;

function openrouterRecord() {
  return listProviders().find((p) => p.id === 'openrouter') as { apiKey: string } | undefined;
}

export function getApiKey(): string { return (openrouterRecord()?.apiKey ?? '').trim(); }
export function setApiKey(key: string): void { updateProvider('openrouter', { apiKey: key.trim() }); }
export function hasApiKey(): boolean { return getApiKey().length > 0; }

export function chat(req: ChatRequest): Promise<ChatResponse> {
  // If the caller passed a bare model (no prefix), stay on OpenRouter — matches legacy behavior.
  return gatewayChat(req);
}

export function validateKey(candidate: string, signal?: AbortSignal): Promise<KeyInfo> {
  return gatewayValidateKey('openrouter', candidate, { signal });
}

export async function fetchModels(signal?: AbortSignal): Promise<{ models: Model[]; fetchedAt: number; live: boolean }> {
  const models = await gatewayFetchModels(signal);
  // Only the OpenRouter models from the unified catalog
  const filtered = models.filter((m) => m.provider === 'openrouter');
  return { models: filtered, fetchedAt: Date.now(), live: filtered.length > 0 };
}

export const FALLBACK_MODELS: ReadonlyArray<Model> = Object.freeze([
  { id: 'openrouter/auto',                      qualifiedId: 'openrouter:openrouter/auto',                      name: 'Auto (best for price)', provider: 'openrouter', upstreamProvider: 'OpenRouter' },
  { id: 'anthropic/claude-sonnet-4.5',          qualifiedId: 'openrouter:anthropic/claude-sonnet-4.5',          name: 'Claude Sonnet 4.5',     provider: 'openrouter', upstreamProvider: 'Anthropic' },
  { id: 'anthropic/claude-haiku-4.5',           qualifiedId: 'openrouter:anthropic/claude-haiku-4.5',           name: 'Claude Haiku 4.5',      provider: 'openrouter', upstreamProvider: 'Anthropic' },
  { id: 'openai/gpt-4o',                        qualifiedId: 'openrouter:openai/gpt-4o',                        name: 'GPT-4o',                provider: 'openrouter', upstreamProvider: 'OpenAI' },
  { id: 'openai/gpt-4o-mini',                   qualifiedId: 'openrouter:openai/gpt-4o-mini',                   name: 'GPT-4o Mini',           provider: 'openrouter', upstreamProvider: 'OpenAI' },
  { id: 'google/gemini-2.5-flash-preview',      qualifiedId: 'openrouter:google/gemini-2.5-flash-preview',      name: 'Gemini 2.5 Flash',      provider: 'openrouter', upstreamProvider: 'Google' },
  { id: 'google/gemma-3-27b-it',                qualifiedId: 'openrouter:google/gemma-3-27b-it',                name: 'Gemma 3 27B',           provider: 'openrouter', upstreamProvider: 'Google' },
  { id: 'meta-llama/llama-3.3-70b-instruct',    qualifiedId: 'openrouter:meta-llama/llama-3.3-70b-instruct',    name: 'Llama 3.3 70B',         provider: 'openrouter', upstreamProvider: 'Meta' },
  { id: 'deepseek/deepseek-chat-v3-0324',       qualifiedId: 'openrouter:deepseek/deepseek-chat-v3-0324',       name: 'DeepSeek V3',           provider: 'openrouter', upstreamProvider: 'DeepSeek' },
  { id: 'x-ai/grok-4',                          qualifiedId: 'openrouter:x-ai/grok-4',                          name: 'Grok 4',                provider: 'openrouter', upstreamProvider: 'xAI' }
]);
