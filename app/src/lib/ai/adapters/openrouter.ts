import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { browser } from '$app/environment';
import type { Adapter, LanguageModel } from './base';
import type { KeyInfo, Model, ProviderRecord } from '../types';
import { GatewayError } from '../types';
import { translateError } from '../errors';

const BASE_URL = 'https://openrouter.ai/api/v1';

export function openrouterAdapter(record: Extract<ProviderRecord, { id: 'openrouter' }>): Adapter {
  const key = (record.apiKey || '').trim();
  const referer = (browser && typeof window !== 'undefined' && window.location?.origin) || 'https://cryptex.app';

  const provider = createOpenRouter({
    apiKey: key,
    headers: { 'HTTP-Referer': referer, 'X-Title': 'Cryptex' }
  });

  return {
    id: 'openrouter',
    isConfigured: () => Boolean(key),
    resolveModel: (modelId): LanguageModel => provider.chat(modelId) as unknown as LanguageModel,
    validateKey: async (candidate, signal) => {
      let resp: Response;
      try {
        resp = await fetch(`${BASE_URL}/auth/key`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${candidate}` },
          signal
        });
      } catch (e) { throw translateError(e, 'openrouter'); }
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw translateError({ status: resp.status, message: body || `HTTP ${resp.status}` }, 'openrouter');
      }
      try {
        const json = (await resp.json()) as { data?: KeyInfo };
        return json.data ?? {};
      } catch {
        throw new GatewayError('unexpected /auth/key response', { category: 'format', provider: 'openrouter', status: resp.status });
      }
    },
    fetchCatalog: async (signal) => {
      let resp: Response;
      try {
        resp = await fetch(`${BASE_URL}/models`, {
          method: 'GET',
          headers: key ? { Authorization: `Bearer ${key}` } : {},
          signal
        });
      } catch (e) { throw translateError(e, 'openrouter'); }
      if (!resp.ok) {
        throw translateError({ status: resp.status, message: `/models HTTP ${resp.status}` }, 'openrouter');
      }
      const body = (await resp.json()) as { data?: Array<Record<string, unknown>> };
      const raw = body.data ?? [];
      const out: Model[] = [];
      for (const r of raw) {
        const id = r.id;
        if (typeof id !== 'string') continue;
        const name = (typeof r.name === 'string' && r.name) || id;
        const pricing = r.pricing as { prompt?: string; completion?: string } | undefined;
        const promptPrice = pricing?.prompt;
        const completionPrice = pricing?.completion;
        const isFree =
          (promptPrice === '0' || Number(promptPrice) === 0) &&
          (completionPrice === '0' || Number(completionPrice) === 0);
        out.push({
          id,
          qualifiedId: `openrouter:${id}`,
          name,
          provider: 'openrouter',
          upstreamProvider: deriveUpstream(id),
          contextLength: typeof r.context_length === 'number' ? r.context_length : undefined,
          isFree,
          capabilities: deriveCapabilities(r)
        });
      }
      out.sort((a, b) => {
        if (a.id === 'openrouter/auto') return -1;
        if (b.id === 'openrouter/auto') return 1;
        return a.name.localeCompare(b.name);
      });
      return out;
    }
  };
}

function deriveUpstream(modelId: string): string {
  const slash = modelId.indexOf('/');
  if (slash <= 0) return 'Other';
  const raw = modelId.slice(0, slash);
  const map: Record<string, string> = {
    'x-ai': 'xAI', 'openai': 'OpenAI', 'anthropic': 'Anthropic', 'google': 'Google',
    'meta-llama': 'Meta', 'deepseek': 'DeepSeek', 'mistralai': 'Mistral', 'qwen': 'Qwen',
    'cohere': 'Cohere', 'perplexity': 'Perplexity', 'nousresearch': 'Nous', 'openrouter': 'OpenRouter'
  };
  return map[raw] ?? raw.charAt(0).toUpperCase() + raw.slice(1);
}

function deriveCapabilities(r: Record<string, unknown>): Model['capabilities'] {
  const modality = (r.modality || r.architecture) as string | { input_modalities?: string[] } | undefined;
  const modStr = typeof modality === 'string' ? modality : '';
  const inputMods = (typeof modality === 'object' && modality?.input_modalities) || [];
  const hasImage = modStr.includes('image') || inputMods.includes('image');
  return {
    streaming: true,
    tools: Array.isArray(r.supported_parameters) && r.supported_parameters.includes('tools'),
    vision: hasImage,
    reasoning: /reasoning|o[13]|thinking/i.test(String(r.id ?? ''))
  };
}
