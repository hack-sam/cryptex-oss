import type { ProviderPreset } from './types';

/**
 * OpenAI-compatible preset templates. Sourced 2026-04-18 from official docs.
 * Editable in the ProviderCard after creation — if a preset goes stale, users
 * can fix the baseURL in-place.
 *
 * OpenAI direct and Gemini direct were added 2026-04-19 after CORS preflight
 * verified both return browser-usable ACAO headers. They only became reachable
 * from Cryptex after the CSP widening in commit 9bbd2d2 (`connect-src 'self'
 * https: data: blob:`); prior stricter CSPs would have blocked them client-side
 * regardless of the provider's own CORS stance.
 *
 * DeepSeek added 2026-04-30 — browser CORS confirmed via OPTIONS preflight on
 * /v1/chat/completions; their API docs at api-docs.deepseek.com confirm CORS
 * support since 2025-Q3.
 */
export const OPENAI_COMPAT_PRESETS: ProviderPreset[] = [
  { id: 'openai',     name: 'OpenAI',     baseURL: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/docs/api-reference',
    defaultTestModel: 'gpt-4o-mini', supportsAuthProbe: true },
  { id: 'gemini',     name: 'Google Gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    defaultTestModel: 'gemini-2.5-flash', supportsAuthProbe: true },
  { id: 'groq',       name: 'Groq',       baseURL: 'https://api.groq.com/openai/v1',
    docsUrl: 'https://console.groq.com/docs/api-reference',
    defaultTestModel: 'llama-3.3-70b-versatile', supportsAuthProbe: true },
  { id: 'together',   name: 'Together',   baseURL: 'https://api.together.xyz/v1',
    docsUrl: 'https://docs.together.ai/reference/chat-completions-1',
    defaultTestModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', supportsAuthProbe: true },
  { id: 'fireworks',  name: 'Fireworks',  baseURL: 'https://api.fireworks.ai/inference/v1',
    docsUrl: 'https://docs.fireworks.ai/api-reference/introduction',
    defaultTestModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    supportsAuthProbe: true },
  { id: 'deepinfra',  name: 'DeepInfra',  baseURL: 'https://api.deepinfra.com/v1/openai',
    docsUrl: 'https://deepinfra.com/docs/advanced/openai_api',
    defaultTestModel: 'meta-llama/Llama-3.3-70B-Instruct', supportsAuthProbe: true },
  { id: 'cerebras',   name: 'Cerebras',   baseURL: 'https://api.cerebras.ai/v1',
    docsUrl: 'https://inference-docs.cerebras.ai/api-reference/chat-completions',
    defaultTestModel: 'llama-3.3-70b', supportsAuthProbe: true },
  { id: 'deepseek',   name: 'DeepSeek',   baseURL: 'https://api.deepseek.com/v1',
    docsUrl: 'https://api-docs.deepseek.com/',
    defaultTestModel: 'deepseek-chat', supportsAuthProbe: true },
  { id: 'sambanova',  name: 'SambaNova',  baseURL: 'https://api.sambanova.ai/v1',
    docsUrl: 'https://docs.sambanova.ai/cloud/api-reference/endpoints/chat',
    defaultTestModel: 'Meta-Llama-3.3-70B-Instruct', supportsAuthProbe: true },
  { id: 'custom',     name: 'Custom',     baseURL: '', docsUrl: '',
    defaultTestModel: undefined, supportsAuthProbe: false }
];

export function getPreset(id: string): ProviderPreset | undefined {
  return OPENAI_COMPAT_PRESETS.find((p) => p.id === id);
}
