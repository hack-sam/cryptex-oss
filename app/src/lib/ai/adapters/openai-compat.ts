import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { Adapter } from './base';
import type { Model, ProviderRecord } from '../types';
import { translateError } from '../errors';

export function openaiCompatAdapter(record: Extract<ProviderRecord, { id: 'openai-compat' }>): Adapter {
  const key = (record.apiKey || '').trim();

  const provider = createOpenAICompatible({
    name: record.name || 'openai-compat',
    baseURL: record.baseURL,
    headers: key ? { Authorization: `Bearer ${key}` } : {}
  });

  return {
    id: 'openai-compat',
    instanceId: record.instanceId,
    // baseURL check handles Custom preset before user fills it in; preset-backed records always have a non-empty baseURL.
    isConfigured: () => Boolean(key && record.baseURL),
    resolveModel: (modelId) => provider(modelId),
    validateKey: async (candidate, signal) => {
      // Explicit "Verify" path — POST /chat/completions with 1-token probe using test model.
      // testModel is populated from preset.defaultTestModel at record creation; fallback only fires for fresh Custom endpoints before the user sets one.
      const testModel = record.testModel || 'gpt-3.5-turbo';
      let resp: Response;
      try {
        resp = await fetch(`${record.baseURL}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${candidate}` },
          body: JSON.stringify({
            model: testModel, max_tokens: 1, messages: [{ role: 'user', content: '.' }]
          }),
          signal
        });
      } catch (e) {
        // Fetch throwing TypeError "Failed to fetch" in the browser is ambiguous:
        // it can mean a CORS block, a DNS/TLS failure, transient network drop, or
        // a browser extension intercepting the request. Prior code flagged all of
        // these as CORS — which is misleading for preset providers that demonstrably
        // support browser CORS (Groq, Together, Fireworks, DeepInfra, Cerebras,
        // SambaNova — verified via OPTIONS preflight). Only flag as CORS when the
        // endpoint is a user-entered 'custom' preset where we truly don't know.
        const suspectCors = !record.presetId || record.presetId === 'custom';
        throw translateError(e, 'openai-compat', { suspectCors });
      }
      if (resp.ok) return { label: record.name };
      const body = await resp.text().catch(() => '');
      throw translateError({ status: resp.status, message: body || `HTTP ${resp.status}` }, 'openai-compat');
    },
    fetchCatalog: async (signal) => {
      let resp: Response;
      try {
        resp = await fetch(`${record.baseURL}/models`, {
          method: 'GET',
          headers: key ? { Authorization: `Bearer ${key}` } : {},
          signal
        });
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') throw e;
        return []; // silent fallback — user will type model ids manually
      }
      if (!resp.ok) return [];
      let body: { data?: Array<Record<string, unknown>> };
      try { body = (await resp.json()) as typeof body; } catch { return []; }
      const raw = body.data ?? [];
      const out: Model[] = [];
      for (const r of raw) {
        const id = r.id;
        if (typeof id !== 'string') continue;
        out.push({
          id,
          qualifiedId: `openai-compat:${record.instanceId}/${id}`,
          name: (typeof r.name === 'string' && r.name) || id,
          provider: 'openai-compat',
          providerInstanceId: record.instanceId,
          upstreamProvider: record.name,
          contextLength: typeof r.context_window === 'number' ? r.context_window : (typeof r.context_length === 'number' ? r.context_length : undefined),
          capabilities: { streaming: true, tools: true }
        });
      }
      out.sort((a, b) => a.name.localeCompare(b.name));
      return out;
    }
  };
}
