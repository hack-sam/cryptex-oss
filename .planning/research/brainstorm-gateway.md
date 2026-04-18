# Unified BYOK Gateway — 2026 Research

> Research date: 2026-04-18
> Target: Cryptex (SvelteKit 2 + Svelte 5, static deploy to GitHub Pages + Dokploy)
> Constraint: no backend — browser → provider direct, user-supplied keys in `localStorage`.

---

## 1. Current OpenRouter integration (how it actually works today)

Cryptex is mid-migration Vue 2 → SvelteKit. The **new** SvelteKit-side OpenRouter code is already modern and focused. The **legacy** Vue side (`js/tools/*Tool.js`, `js/data/openrouterModels.js`) is being retired.

### 1.1 Key storage

`app/src/lib/ai/openrouter.ts` (lines 26–66) persists the key under the `cryptex.openrouterApiKey` localStorage slot using the generic reactive helper `createPersistedState` from `app/src/lib/stores/_persisted.svelte.ts`. On module load in the browser it **backfills** from three legacy slots (`openrouter-api-key`, `openrouter_api_key`, `plinyos-api-key`). Components read the key via `getApiKey()` inside `$derived` / `$effect` — flipping the key in Settings auto-propagates everywhere.

```ts
// app/src/lib/ai/openrouter.ts:36
const apiKey = createPersistedState<string>('cryptex.openrouterApiKey', '');
```

No encryption at rest. `localStorage` in plaintext.

### 1.2 Request surface

One single call shape: `chat({ model, messages, temperature, max_tokens, top_p, title, signal })` → `ChatResponse { content, rawModel, finishReason, usage }`.

- **Endpoint**: `https://openrouter.ai/api/v1/chat/completions` (POST).
- **Auth**: `Authorization: Bearer <key>` set via `commonHeaders()`.
- **Headers**: also sets `HTTP-Referer: window.location.origin` and `X-Title: Cryptex` (or a per-call `title`) so the OpenRouter dashboard shows per-tool attribution.
- **Error taxonomy**: a custom `OpenRouterError` with a `category` of `auth | credit | forbidden | not_found | rate_limit | network | format | api | cors | unknown`. The UI branches on category (see `AntiClassifierTool.svelte:58`, `TranslateTool.svelte:87` for the "model not found → fall back to Gemma 3 27B" path).
- **Upstream unwrapping**: `decodeUpstreamError()` recursively walks `metadata.raw` so the user sees the real provider error (e.g. "Invalid language" from Google) instead of the generic "Provider returned error" wrapper.
- **No streaming today** — `chat()` is a single round-trip `await`.
- **No tool-calls today** — messages are plain `{ role, content }` strings.
- **No attachments today**.

### 1.3 Model catalog

`app/src/lib/ai/models.svelte.ts` is a Svelte 5 `$state`-backed store:

- `refreshModels(force)` → `GET /api/v1/models`, normalizes rows via `normalizeModel()`, sorts with `openrouter/auto` pinned first.
- Cached under `cryptex.openrouterModelsCache` with a 1-hour TTL.
- Hydrates synchronously from cache on first access, then kicks a background refresh.
- A `$effect.root` watches the API key; when it flips the list is re-fetched so authenticated availability is accurate.
- `FALLBACK_MODELS` (static list of ~10 safe bets) is served when the fetch fails.

### 1.4 Callers (the four AI features)

| Feature | File | Call shape |
|---|---|---|
| PromptCraft | `app/src/lib/components/tools/promptcraft/PromptCraftTool.svelte:43` | `Promise.allSettled(Array.from({length:n}, () => chat({...})))` — fan-out for N variants |
| Anti-Classifier | `app/src/lib/components/tools/anticlassifier/AntiClassifierTool.svelte:37` | single `chat({ system, user })` |
| Translate (TranslateGemma) | `app/src/lib/components/tools/translate/TranslateTool.svelte:69` | single `chat()` with fallback on `not_found` |
| Decoder "translate to English" | (not yet wired on SvelteKit side) | — |

All four import the same three exports: `chat`, `hasApiKey`, `OpenRouterError` from `$lib/ai/openrouter`. Per-tool model + temperature prefs live in localStorage under `cryptex.pc.model`, `cryptex.ac.model`, `cryptex.tg.model`, etc.

### 1.5 Key-validation flow

Settings page (`app/src/routes/settings/+page.svelte:45-79`): on save it calls `validateKey(candidate)` → `GET /api/v1/auth/key`. Status classifies `auth | credit | rate_limit | api`. On success it triggers `models.refresh(true)`. Key is persisted **before** validation so the UI doesn't block on a network call — validation is cosmetic ("verified" checkmark).

### 1.6 What this tells us about the gateway design

1. **We already have the right interface.** A single `chat({model, messages, temperature, max_tokens, signal}) → {content, usage}` entry point fans out to every feature. The gateway's job is to keep this surface and route by model prefix.
2. **We already normalize errors.** `OpenRouterError + category` is the pattern every provider needs to adopt.
3. **We already have a reactive model catalog.** It needs to grow to understand multi-provider catalogs, not be rewritten.
4. **No streaming / tool-calls / attachments exist today.** Adding them is opt-in for new features — the existing three features don't need to change behaviour.

---

## 2. 2026 landscape

### 2.1 Vercel AI SDK (`ai` + `@ai-sdk/*`)

**State as of April 2026:** AI SDK 6 shipped December 2025 ([Vercel blog](https://vercel.com/blog/ai-sdk-6)) with a "unified API layer that lets developers switch between 25+ AI providers by changing just two lines of code." The package split has stabilized:

- Core: `ai` (the `generateText`, `streamText`, `generateObject`, `streamObject`, provider registry, tool runtime)
- Providers: `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai-compatible`
- UI bindings: `@ai-sdk/svelte` (also React/Vue/Solid split out)

**Bundle footprint** ([Strapi 2026 comparison](https://strapi.io/blog/langchain-vs-vercel-ai-sdk-vs-openai-sdk-comparison-guide)):

- `ai` core: ~67 KB gzipped, tree-shakeable "often under 30 KB after build"
- Each `@ai-sdk/*` provider is a separate npm package with its own tree-shakeable entry
- Versus LangChain.js 101 KB gzipped and `openai` SDK ~34 KB gzipped

**Browser support in 2026**: Core pieces (`generateText`, `streamText`, provider factories) are isomorphic. The catches:

- `@ai-sdk/anthropic` passes `dangerouslyAllowBrowser` through to the underlying client, but there have been regressions (GitHub [vercel/ai#3041](https://github.com/vercel/ai/issues/3041), anthropic-sdk-typescript [#248](https://github.com/anthropics/anthropic-sdk-typescript/issues/248)) where environment detection flips between versions.
- `@ai-sdk/openai` requires `dangerouslyAllowBrowser: true` for browser use. **OpenAI's `/v1/chat/completions` does not return CORS headers** as of 2026 ([OpenAI community 2026 thread](https://community.openai.com/t/has-the-cors-policy-changed-responses-api/1372791)), so direct browser calls to `api.openai.com` still fail CORS unless the user proxies. This is a hard blocker for a "direct OpenAI" adapter.
- `@ai-sdk/google` likewise fails CORS against `generativelanguage.googleapis.com` ([Google discuss 2026](https://discuss.ai.google.dev/t/neither-the-genai-api-nor-the-openai-endpoints-support-cors-from-localhost/79681)). No browser path.
- `@ai-sdk/openai-compatible` with `createOpenAICompatible({ baseURL, apiKey, headers })` works fine browser-side for any endpoint that returns CORS (OpenRouter, Groq, Together, Fireworks, DeepInfra, self-hosted vLLM with CORS enabled). Covers the long-tail for free.

**Streaming**: `streamText` returns a `ReadableStream`-backed result with `.textStream`, `.fullStream` (text + tool-call + reasoning deltas), and `.toDataStreamResponse()`. `@ai-sdk/svelte`'s `Chat` class binds straight to Svelte 5 runes ([AI SDK 5 blog](https://vercel.com/blog/ai-sdk-5), [AI SDK streamText ref](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)).

**Tool-call normalization**: `tool({ description, inputSchema: z.object({...}), execute })` is identical across providers. The SDK normalizes OpenAI's JSON-string-args, Anthropic's object-args, and Gemini's protobuf-style ([TokenMix 2026 guide](https://tokenmix.ai/blog/function-calling-guide)). The user writes one `tool()` definition.

**Reasoning normalization**: `providerOptions.anthropic = { thinking: { type: 'enabled', budgetTokens: N }, display: 'summarized' }` and `providerOptions.openai = { reasoningEffort: 'high' }` — then read `result.reasoning` in a uniform shape ([Vercel AI Gateway reasoning](https://vercel.com/docs/ai-gateway/capabilities/reasoning)). Note the 2026 change: Anthropic Opus 4.7 defaults to omitting thinking text unless `display: 'summarized'` is set.

**Prompt caching**: Cross-provider. Anthropic's `cache_control` is exposed via `providerOptions.anthropic.cacheControl = { type: 'ephemeral' }` ([AI SDK dynamic caching cookbook](https://ai-sdk.dev/cookbook/node/dynamic-prompt-caching)). OpenAI/Google/DeepSeek cache automatically with nothing to set. As of Feb 5, 2026 Anthropic moved to workspace-level cache isolation.

**Multimodal**: Message content can be an array of parts `{ type: 'text' | 'image' | 'file', ... }`; SDK routes images to vision models, PDFs to Anthropic/Gemini, raises on unsupported ([AI SDK multi-modal cookbook](https://ai-sdk.dev/v4/cookbook/guides/multi-modal-chatbot)).

**Pros (for Cryptex):**

- One adapter layer covers Anthropic-direct, OpenRouter (via OpenAI-compatible), Groq/Together/Fireworks/DeepInfra/vLLM (all via OpenAI-compatible), and any future provider with CORS.
- Native Svelte bindings (`@ai-sdk/svelte`) — if we later add a chat UI.
- Tool-calls, reasoning, caching "for free" when we eventually want them.
- Streaming "for free" the day we want to add it.

**Cons:**

- Roughly +67 KB gzipped for `ai` + one provider. We can mitigate by lazy-importing on first AI-tool route.
- OpenAI-direct and Google-direct remain CORS-blocked. Users who want those models must route through OpenRouter.
- `@ai-sdk/anthropic` browser support has been fragile across 2025–2026 (pin version in `package.json`).

### 2.2 Direct SDK route (OpenAI, Anthropic, Google)

`openai` npm ([npm](https://www.npmjs.com/package/openai)) and `@anthropic-ai/sdk` both support `new X({ apiKey, dangerouslyAllowBrowser: true })`. Bundle: `openai` ~34 KB gzipped, Anthropic similar.

**CORS reality in 2026:**

| Provider | CORS to browser? | How |
|---|---|---|
| Anthropic | Yes | Set `anthropic-dangerous-direct-browser-access: true` header OR SDK `dangerouslyAllowBrowser: true`. Since Aug 2024 ([Simon Willison notes](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/)). |
| OpenAI | **No** | `api.openai.com` still doesn't return `Access-Control-Allow-Origin`. 2026 community threads confirm. |
| Google Gemini | **No** | `generativelanguage.googleapis.com` blocks browsers. |
| OpenRouter | Yes | CORS open, has been since launch. |
| Groq / Together / Fireworks / DeepInfra | Yes | All allow browser CORS (they want the developer-onboarding flow). |
| vLLM / Ollama self-hosted | Depends | Requires operator-side `--cors-allow-origin`. |

**Implication**: for the foreseeable future the only sensible "all major models" path from a pure-static site is **OpenRouter + Anthropic-direct + any OpenAI-compatible endpoint**. Direct OpenAI and Gemini aren't reachable from the browser without a server. If a user insists on direct OpenAI keys, they go through OpenRouter with BYOK ([OpenRouter BYOK guide](https://openrouter.ai/docs/guides/overview/auth/byok)).

**Pros (direct SDKs):**

- Smallest per-provider bundle.
- Most faithful to each provider's native features.

**Cons:**

- Each provider has a different message shape, different error shape, different streaming primitive, different tool-call shape. Rewriting all four AI tools per-provider is exactly what we want to avoid.

### 2.3 LangChain.js

Still relevant for server-side agent orchestration, but for a pure-static BYOK browser app it's **overkill**:

- 101 KB gzipped before tree-shaking ([LangChainJS bundle issue](https://github.com/langchain-ai/langchainjs/issues/809)), and in practice its module graph is large enough that tree-shaking rarely hits the Vercel AI SDK's <30 KB.
- Its value-add (chains, agents, retrievers, memory) is zero for Cryptex's use cases — we do single-shot and fan-out prompts, not multi-step reasoning.
- It does run client-side ([LangChain client-side post](https://blog.langchain.com/building-llm-powered-web-apps-with-client-side-technology/)) but the docs assume server environments.

**Verdict: reject.** Wrong tool for a static steganography utility.

### 2.4 LiteLLM

Python-first and going strong in 2026 (v1.83.9, April 17 2026). The [litellmjs](https://github.com/zya/litellmjs) JS port exists but is not feature-complete, not widely adopted, and not actively maintained at the pace of the Python package.

**Verdict: reject.** Python-only for production purposes; JS port is not credible as a dependency in 2026.

### 2.5 OpenRouter-specific SDKs

Three exist: [`@openrouter/sdk`](https://www.npmjs.com/package/@openrouter/sdk) (official), [`@openrouter/ai-sdk-provider`](https://www.npmjs.com/package/@openrouter/ai-sdk-provider) (plugin for Vercel AI SDK), and the community [`openrouter-kit`](https://github.com/mmeerrkkaa/openrouter-kit).

`@openrouter/ai-sdk-provider` is the interesting one — it's a drop-in `@ai-sdk/*` provider. If we go the Vercel AI SDK route, this gives us first-class OpenRouter with model routing, reasoning tokens, and tool-calls matching our existing feature set.

**Verdict: use `@openrouter/ai-sdk-provider` alongside `ai` + `@ai-sdk/anthropic` + `@ai-sdk/openai-compatible`.**

---

## 3. Recommended architecture

### 3.1 High-level picture

A thin in-repo `gateway.ts` that wraps the Vercel AI SDK and presents **exactly the interface Cryptex already uses** (`chat(req) → {content, usage}`) plus a forward-looking streaming variant (`streamChat(req)`) that the existing non-streaming callers ignore.

```
app/src/lib/ai/
  gateway.ts              ← NEW: unified facade (chat, streamChat, fetchModels, validateKey)
  adapters/
    openrouter.ts         ← @openrouter/ai-sdk-provider (default)
    anthropic.ts          ← @ai-sdk/anthropic + dangerouslyAllowBrowser
    openai-compat.ts      ← @ai-sdk/openai-compatible factory — handles Groq/Together/Fireworks/vLLM
  providers.svelte.ts     ← reactive multi-provider registry (keys + base URLs)
  models.svelte.ts        ← KEEP, extend to aggregate catalogs across providers
  openrouter.ts           ← KEEP temporarily, re-export from gateway for back-compat
```

Existing callers (`PromptCraftTool`, `AntiClassifierTool`, `TranslateTool`) continue to `import { chat } from '$lib/ai/openrouter'` with zero line changes. When ready, they switch the import to `$lib/ai/gateway`. We preserve the `OpenRouterError` export name as a deprecated alias for `GatewayError`.

### 3.2 Provider adapter interface (TypeScript sketch)

```ts
// app/src/lib/ai/gateway.ts

import type { LanguageModelV2 } from '@ai-sdk/provider';

export type ProviderId = 'openrouter' | 'anthropic' | 'openai-compat';

/** A model id qualified by provider. "openrouter:openai/gpt-5.4" or "anthropic:claude-opus-4-7". */
export type QualifiedModelId = `${ProviderId}:${string}`;

export type ErrorCategory =
  | 'auth' | 'credit' | 'forbidden' | 'not_found'
  | 'rate_limit' | 'network' | 'format' | 'cors' | 'api' | 'unknown';

export class GatewayError extends Error {
  readonly category: ErrorCategory;
  readonly status?: number;
  readonly provider: ProviderId;
  constructor(msg: string, opts: { category: ErrorCategory; status?: number; provider: ProviderId }) {
    super(msg);
    this.category = opts.category;
    this.status = opts.status;
    this.provider = opts.provider;
  }
}

/** Message shape — superset of the current one. Content can stay a string for
 *  backward compat; parts-array enables attachments without breaking callers. */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string | ArrayBuffer; mediaType?: string }
  | { type: 'file'; data: ArrayBuffer; mediaType: string; filename?: string };

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
};

export type ChatRequest = {
  /** "openrouter:openai/gpt-5.4" or plain "openai/gpt-5.4" — plain routes to default provider. */
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;   // renamed from max_tokens, alias preserved
  topP?: number;
  title?: string;             // propagated as X-Title on OpenRouter
  tools?: Record<string, ToolDef>;
  /** Provider-native knobs: thinking, cache_control, reasoning_effort, etc. */
  providerOptions?: Record<string, unknown>;
  signal?: AbortSignal;
};

export type ToolDef = {
  description: string;
  inputSchema: unknown; // zod schema in practice
  execute?: (input: unknown) => Promise<unknown>;
};

export type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** Anthropic: input tokens read from cache. OpenAI: cached_prompt_tokens. */
  cachedInputTokens?: number;
  /** When the model emitted reasoning tokens (Anthropic thinking, OpenAI reasoning). */
  reasoningTokens?: number;
};

export type ChatResponse = {
  content: string;
  reasoning?: string;        // null if the model didn't think out loud
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

export interface Adapter {
  readonly id: ProviderId;
  /** Does this adapter currently have credentials? */
  isConfigured(): boolean;
  /** Validate credentials (e.g. OpenRouter /auth/key). Throws GatewayError. */
  validateKey(candidate: string, signal?: AbortSignal): Promise<KeyInfo>;
  /** Resolve a model id (e.g. "openai/gpt-5.4") to a Vercel AI SDK LanguageModelV2. */
  resolveModel(modelId: string): LanguageModelV2;
  /** Fetch live catalog for this provider. May return a curated fallback. */
  fetchCatalog(signal?: AbortSignal): Promise<Model[]>;
}

export type Model = {
  id: string;               // unqualified within the provider (e.g. "openai/gpt-5.4")
  qualifiedId: QualifiedModelId; // "openrouter:openai/gpt-5.4"
  name: string;
  provider: ProviderId;
  upstreamProvider?: string; // "OpenAI", "Anthropic" — for grouping in the picker
  contextLength?: number;
  isFree?: boolean;
  capabilities?: { streaming?: boolean; tools?: boolean; vision?: boolean; pdf?: boolean; reasoning?: boolean };
};

export type KeyInfo = {
  label?: string;
  limit?: number | null;
  usage?: number;
  rateLimit?: { requests?: number; interval?: string };
};

// The public facade — what tools import.
export function chat(req: ChatRequest): Promise<ChatResponse>;
export function streamChat(req: ChatRequest): AsyncIterable<StreamEvent>;
export function fetchModels(signal?: AbortSignal): Promise<Model[]>;
export function validateKey(providerId: ProviderId, candidate: string): Promise<KeyInfo>;
```

### 3.3 How each adapter plugs in

```ts
// adapters/openrouter.ts
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

export function openrouterAdapter(key: string): Adapter {
  const provider = createOpenRouter({
    apiKey: key,
    headers: {
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://cryptex.app',
      'X-Title': 'Cryptex'
    }
  });
  return {
    id: 'openrouter',
    isConfigured: () => Boolean(key),
    resolveModel: (modelId) => provider.chat(modelId),
    validateKey: /* GET https://openrouter.ai/api/v1/auth/key — port existing validateKey */,
    fetchCatalog: /* GET /api/v1/models — port existing fetchModels */,
  };
}

// adapters/anthropic.ts
import { createAnthropic } from '@ai-sdk/anthropic';

export function anthropicAdapter(key: string): Adapter {
  const provider = createAnthropic({
    apiKey: key,
    headers: { 'anthropic-dangerous-direct-browser-access': 'true' }
  });
  return {
    id: 'anthropic',
    isConfigured: () => Boolean(key),
    resolveModel: (modelId) => provider(modelId),
    validateKey: /* POST /v1/messages with max_tokens:1 as a probe */,
    fetchCatalog: /* static list — Anthropic has no /models endpoint like OpenRouter */,
  };
}

// adapters/openai-compat.ts — one instance per baseURL the user adds
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export function openaiCompatAdapter(cfg: { name: string; baseURL: string; apiKey: string }): Adapter {
  const provider = createOpenAICompatible({
    name: cfg.name,
    baseURL: cfg.baseURL,
    headers: { Authorization: `Bearer ${cfg.apiKey}` }
  });
  return { id: 'openai-compat', /* ... */ };
}
```

Inside `gateway.ts::chat()`:

```ts
export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const { adapter, modelId } = resolve(req.model); // "openrouter:x" → adapter+"x"
  try {
    const result = await generateText({
      model: adapter.resolveModel(modelId),
      messages: req.messages as any,
      temperature: req.temperature,
      maxOutputTokens: req.maxOutputTokens,
      topP: req.topP,
      tools: req.tools,
      providerOptions: req.providerOptions,
      abortSignal: req.signal,
    });
    return {
      content: result.text,
      reasoning: result.reasoning?.map(r => r.text).join('') || undefined,
      rawModel: result.response.modelId,
      finishReason: result.finishReason,
      usage: mapUsage(result.usage),
      toolCalls: result.toolCalls,
    };
  } catch (e) {
    throw translateError(e, adapter.id);
  }
}
```

`translateError` keeps the existing category taxonomy.

### 3.4 Reactive provider registry

`providers.svelte.ts` replaces the single-key module in `openrouter.ts`:

```ts
type ProviderRecord = {
  id: ProviderId;
  apiKey: string;
  baseURL?: string;         // only for openai-compat
  name?: string;            // only for openai-compat ("Groq", "Together", etc.)
  enabled: boolean;
};

const providers = createPersistedState<ProviderRecord[]>('cryptex.providers', [
  { id: 'openrouter', apiKey: '', enabled: true } // default
]);
```

Legacy migration: on first load, if `cryptex.openrouterApiKey` is set, seed `providers[0].apiKey` from it.

### 3.5 Normalizing the three primitives

**Streaming** — hide `streamText` internals behind `streamChat()` which yields `StreamEvent` objects. Callers iterate with `for await`. Tool-calls, reasoning deltas, and final usage are all events on the same stream. OpenRouter SSE → Vercel SDK → our events; Anthropic SSE → Vercel SDK → our events. Same shape.

**Tool-calls** — one `tool({ description, inputSchema, execute })` definition per tool. Vercel AI SDK translates to OpenAI-JSON, Anthropic-object, Gemini-protobuf under the hood. MCP-over-the-wire is a future extension point ([2026 convergence](https://tokenmix.ai/blog/function-calling-guide)) — not needed for Cryptex.

**Attachments** — message `content` becomes a parts array. The gateway validates capability via `Model.capabilities.vision` / `.pdf` before dispatch. Cryptex has no attachment features today; this just keeps the door open.

**Prompt caching** — gateway exposes a convenience in `ChatRequest`:

```ts
providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }
```

passed through unchanged. Cryptex's long ANTICLASSIFIER_SYSTEM_PROMPT is a perfect candidate — future work for a separate phase.

### 3.6 Key storage — localStorage vs WebCrypto

**Recommendation: keep localStorage for the default case, add an opt-in "encrypt with passphrase" layer.** Rationale:

1. The honest security truth ([furkanbaytekin.dev guide](https://www.furkanbaytekin.dev/blogs/software/using-webcrypto-safely-a-practical-guide-for-developers), [Medium: just stop using localStorage](https://medium.com/@stanislavbabenko/just-stop-using-localstorage-for-secrets-honestly-ea9ef9af9022)) is that **WebCrypto does not protect keys from XSS**. If an attacker lands JS on `cryptex.app`, they can read the passphrase from the form, call `decrypt()`, and exfiltrate. Encryption only helps against physical/forensic access to disk — a threat model that doesn't match "user pasted a key into a browser extension-adjacent tool."
2. BYOK semantics already shift the risk to the user. The key is theirs; Cryptex never sees it; XSS is the only practical exfil vector.
3. Adding WebCrypto-AES-GCM with PBKDF2-derived keys (256-bit length, 32-byte salt, SHA-512, 1M iterations per current OWASP guidance) is ~40 lines. Offer it behind an "Encrypt keys at rest (requires passphrase on app load)" toggle in Settings for users who care. Default off — matches current UX.
4. **Do not** use OPFS (OriginPrivateFileSystem). Same origin, same XSS attack surface, more API surface to get wrong, no upside for BYOK.

Concrete pattern when enabled:

```ts
// on save: derive key from passphrase, encrypt apiKey, store ciphertext + IV
const salt = crypto.getRandomValues(new Uint8Array(32));
const pbkdf2 = await crypto.subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
const aesKey = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 1_000_000, hash: 'SHA-512' },
  pbkdf2, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
);
const iv = crypto.getRandomValues(new Uint8Array(12)); // FRESH PER ENCRYPT
const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, te.encode(apiKey));
// persist { salt, iv, ct } as base64
```

Generate fresh IV every encrypt. Non-extractable keys in memory. GCM (authenticated). Never SHA-256-a-password.

### 3.7 How existing features migrate

Zero functional change, minimal import change:

| Feature | Before | After |
|---|---|---|
| PromptCraft | `import { chat } from '$lib/ai/openrouter'` | `import { chat } from '$lib/ai/gateway'` + prefix `openrouter:` to the model id if not already qualified |
| Anti-Classifier | same | same |
| Translate | same | same + handle `not_found` the same way |
| Settings | imports `{ getApiKey, setApiKey, validateKey }` | `{ getProviderKey, setProviderKey, validateKey }` — parameterized by provider id |
| ModelPicker | imports models from `models.svelte.ts` | same module, now returns multi-provider list grouped by upstream provider |

The legacy `$lib/ai/openrouter` can re-export from `$lib/ai/gateway` for a deprecation window.

---

## 4. Bundle-size / load-impact estimates

Measurements pulled from [Strapi's April 2026 benchmark](https://strapi.io/blog/langchain-vs-vercel-ai-sdk-vs-openai-sdk-comparison-guide) and the bundle-size discussion on the Vercel AI SDK 5 post.

| Option | Gzipped | After tree-shake (Cryptex usage) | Notes |
|---|---|---|---|
| **Current `openrouter.ts`** (hand-rolled fetch) | ~4 KB | ~4 KB | baseline |
| `ai` core only (generateText) | 67 KB | ~25–30 KB | strips streamText, UI bindings, structured output |
| + `@openrouter/ai-sdk-provider` | +6 KB | +5 KB | |
| + `@ai-sdk/anthropic` | +10 KB | +8 KB | only if user adds Anthropic key |
| + `@ai-sdk/openai-compatible` | +5 KB | +4 KB | only if user adds a compat endpoint |
| **Gateway total worst case** | ~88 KB | **~42 KB** | if all three adapters are lazy-loaded on demand we serve ~25–30 KB baseline |
| LangChain.js alternative | 101 KB | ~70 KB | rejected |

**Lazy-load strategy**: the AI-driven routes (`/promptcraft`, `/anticlassifier`, `/translate`) are separate SvelteKit pages. `gateway.ts` should `await import('./adapters/anthropic')` only when the user's selected model is `anthropic:*`. Default load is OpenRouter-only → ~30 KB gzipped, a +26 KB regression versus today. Acceptable for a 5 MB dist that ships 162 transformer files.

**Alternative**: don't adopt the Vercel AI SDK yet. Keep the hand-rolled `openrouter.ts` and add a second hand-rolled `anthropic.ts` adapter using `@anthropic-ai/sdk` directly with `dangerouslyAllowBrowser`. Zero SDK bundle tax but we rewrite the normalization code ourselves.

Recommended: **Vercel AI SDK**. The normalization, streaming, and tool-calling code we'd otherwise write by hand is worth more than 26 KB on-the-wire.

---

## 5. Security checklist

### 5.1 Content Security Policy (CSP)

A static site like Cryptex can ship a meta-CSP or (better, under Dokploy/Traefik) a response-header CSP. Minimum policy for the gateway:

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
connect-src 'self'
  https://openrouter.ai
  https://api.anthropic.com
  https://api.groq.com
  https://api.together.xyz
  https://api.fireworks.ai
  https://api.deepinfra.com;
img-src 'self' data: blob:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

- **`connect-src`** is the critical directive. Every provider base URL must be listed explicitly. When a user adds a custom OpenAI-compat baseURL, they must configure CSP themselves or we reject it — OR we drop CSP on `connect-src` (weaker). I recommend the former: document it.
- **No `'unsafe-eval'`** (Vercel AI SDK doesn't need it). `wasm-unsafe-eval` is for potential future wasm tokenizers.
- **`frame-ancestors 'none'`** to prevent clickjacking credential dialogs.
- Past Anthropic CSP bugs ([claude-code #25024](https://github.com/anthropics/claude-code/issues/25024)) prove this is worth being explicit about.

### 5.2 Subresource Integrity (SRI)

SvelteKit does not auto-generate SRI hashes for its build artifacts ([sveltejs/kit #10458](https://github.com/sveltejs/kit/discussions/10458)). However since everything ships from `self`, SRI against our own origin adds little. For **third-party CDN imports (lucide-svelte icons, etc.)** we already bundle everything — no CDN script tags in production. Confirm this stays true when adopting the AI SDK (it ships from npm, bundled by Vite — OK).

If we ever add a CDN script (Plausible, AdSense — we already do AdSense on the Guide page), they need `integrity="sha384-..."` + `crossorigin="anonymous"`. AdSense doesn't publish a stable hash so SRI is impractical for that one; accept the risk, isolate AdSense to the Guide/About routes (already the case per `consent.svelte.ts`).

### 5.3 XSS mitigation (the real threat)

Because BYOK keys sit in localStorage in plaintext (or WebCrypto-encrypted with a passphrase that's just typed into a form), **XSS is game-over**. Defense in depth:

1. **Hardened CSP** as above — blocks inline script and eval.
2. **No `v-html`-equivalent (`{@html ...}`) in the new SvelteKit UI.** Audit `app/src/` for `{@html` usage before ship.
3. **Sanitize user input at render time.** Session log entries, prompt outputs, Model catalog names — all rendered as text nodes, never as HTML.
4. **Lock down extensions in docs.** Note in Settings: "Browser extensions with access to this page can read your API key. Use in a dedicated browser profile if concerned."
5. **Trusted Types** — SvelteKit doesn't auto-apply but a `require-trusted-types-for 'script'` CSP directive costs nothing and fails loudly if a future commit introduces unsafe DOM sinks.

### 5.4 Key exfiltration vectors — checklist

- [x] **Inline script**: blocked by CSP `script-src 'self'`.
- [x] **Third-party CDN tamper**: mitigated by bundling everything we can + SRI for what we can't.
- [x] **Referrer leakage**: `Referrer-Policy: strict-origin-when-cross-origin` (default). Our outgoing requests to OpenRouter/Anthropic carry the origin but never a query string with the key.
- [x] **Key in URL**: no code path writes the key to a URL. Verified by grep.
- [x] **Key in error stack traces**: `GatewayError.message` must never interpolate the key. Audit `decodeUpstreamError()`.
- [x] **Key in localStorage under a predictable name**: yes (`cryptex.openrouterApiKey`). Known trade-off; fine for BYOK.
- [x] **DevTools inspection**: unavoidable — this is BYOK from a static site. Document it.
- [x] **Service Worker cache poisoning**: Cryptex has no SW today. If added, ensure it doesn't cache API responses with auth headers.
- [x] **Cross-tab attacks**: localStorage is same-origin, not accessible from other origins. Safe.
- [ ] **Verify**: no `sessionLog` entries include request headers.
- [ ] **Verify**: no telemetry/analytics library (Plausible is OK — no cookies) accidentally captures form fields.

### 5.5 Supply-chain

- Pin `@ai-sdk/*` and `@openrouter/ai-sdk-provider` versions exactly in `package.json`. The 2026 Anthropic SDK regressions ([claude-code-action #1126](https://github.com/anthropics/claude-code-action/issues/1126)) show minor releases can break browser detection.
- Enable `npm audit` in the CI workflow (`.github/workflows/deploy.yml`), fail on high severity.
- Prefer `"resolutions"` pinning for transitive `openai` / `@anthropic-ai/sdk` versions if the SDK providers hoist them.

---

## 6. Citations

1. [Vercel AI SDK 6 blog (Dec 2025)](https://vercel.com/blog/ai-sdk-6) — unified API layer, 25+ providers, two-line provider switches.
2. [Vercel AI SDK 5 blog (2025)](https://vercel.com/blog/ai-sdk-5) — type-safe chat, agentic loops, tool enhancements, speech.
3. [AI SDK reference: streamText](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) — streaming primitives.
4. [AI SDK: provider & model management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management) — registry pattern.
5. [AI SDK: OpenAI-compatible custom providers](https://ai-sdk.dev/providers/openai-compatible-providers/custom-providers) — `createOpenAICompatible({baseURL, apiKey, headers})`.
6. [AI SDK: OpenAI-compatible providers overview](https://ai-sdk.dev/providers/openai-compatible-providers).
7. [AI SDK: Anthropic provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic) — thinking, cache_control, providerOptions.
8. [AI SDK: Google Generative AI provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai).
9. [AI SDK: Groq provider](https://ai-sdk.dev/providers/ai-sdk-providers/groq).
10. [AI SDK cookbook: dynamic prompt caching](https://ai-sdk.dev/cookbook/node/dynamic-prompt-caching).
11. [AI SDK: multi-modal chatbot](https://ai-sdk.dev/v4/cookbook/guides/multi-modal-chatbot).
12. [AI SDK: tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling).
13. [OpenAI npm package](https://www.npmjs.com/package/openai) — `dangerouslyAllowBrowser`.
14. [Anthropic SDK TypeScript #248](https://github.com/anthropics/anthropic-sdk-typescript/issues/248) — add `dangerouslyAllowBrowser`.
15. [vercel/ai #3041](https://github.com/vercel/ai/issues/3041) — Support dangerouslyAllowBrowser for Anthropic.
16. [Simon Willison: Claude dangerous direct browser access (Aug 2024)](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/) — Anthropic CORS header.
17. [OpenAI community: CORS 2026 thread](https://community.openai.com/t/has-the-cors-policy-changed-responses-api/1372791) — still blocked.
18. [Google AI dev forum 2026](https://discuss.ai.google.dev/t/neither-the-genai-api-nor-the-openai-endpoints-support-cors-from-localhost/79681) — Gemini no-CORS.
19. [OpenRouter quickstart](https://openrouter.ai/docs/quickstart) — BYOK, browser-safe.
20. [OpenRouter BYOK guide](https://openrouter.ai/docs/guides/overview/auth/byok).
21. [@openrouter/sdk npm](https://www.npmjs.com/package/@openrouter/sdk).
22. [@openrouter/ai-sdk-provider](https://www.npmjs.com/package/@openrouter/ai-sdk-provider).
23. [openrouter-kit](https://github.com/mmeerrkkaa/openrouter-kit) — community alternative.
24. [Anthropic prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — 5-min / 1-hour caches, workspace isolation from Feb 2026.
25. [Anthropic extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) — adaptive thinking, `display: 'summarized'`.
26. [Vercel AI Gateway: reasoning](https://vercel.com/docs/ai-gateway/capabilities/reasoning).
27. [OpenRouter: prompt caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching).
28. [OpenRouter: reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).
29. [LangChain.js bundle size issue #809](https://github.com/langchain-ai/langchainjs/issues/809).
30. [LangChain.js client-side blog](https://blog.langchain.com/building-llm-powered-web-apps-with-client-side-technology/).
31. [Strapi 2026 comparison: LangChain vs Vercel AI SDK vs OpenAI SDK](https://strapi.io/blog/langchain-vs-vercel-ai-sdk-vs-openai-sdk-comparison-guide) — gzipped sizes.
32. [LiteLLM](https://github.com/BerriAI/litellm) — Python primary.
33. [litellmjs](https://github.com/zya/litellmjs) — experimental JS port.
34. [TokenMix 2026: function calling compared](https://tokenmix.ai/blog/function-calling-guide) — OpenAI/Anthropic/Google differences, MCP convergence.
35. [OWASP CSP cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html).
36. [MDN: connect-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src).
37. [anthropics/claude-code #25024](https://github.com/anthropics/claude-code/issues/25024) — CSP missing a-api.anthropic.com, 2026.
38. [OWASP SRI](https://owasp.org/www-community/controls/SubresourceIntegrity).
39. [sveltejs/kit #10458](https://github.com/sveltejs/kit/discussions/10458) — SvelteKit SRI status.
40. [furkanbaytekin.dev: Using WebCrypto safely](https://www.furkanbaytekin.dev/blogs/software/using-webcrypto-safely-a-practical-guide-for-developers) — GCM, non-extractable keys, PBKDF2 1M iterations, SHA-512.
41. [Medium: Just stop using localStorage for secrets](https://medium.com/@stanislavbabenko/just-stop-using-localstorage-for-secrets-honestly-ea9ef9af9022) — threat-model reality check.
42. [trevorlasn.com: localStorage unsafe for tokens](https://www.trevorlasn.com/blog/the-problem-with-local-storage).
43. Cryptex in-repo:
    - `app/src/lib/ai/openrouter.ts` — current client.
    - `app/src/lib/ai/models.svelte.ts` — reactive catalog.
    - `app/src/lib/stores/_persisted.svelte.ts` — localStorage helper.
    - `app/src/lib/components/tools/promptcraft/PromptCraftTool.svelte` — fan-out caller.
    - `app/src/lib/components/tools/anticlassifier/AntiClassifierTool.svelte` — single caller.
    - `app/src/lib/components/tools/translate/TranslateTool.svelte` — fallback caller.
    - `app/src/routes/settings/+page.svelte` — key save + validate flow.
    - `js/data/openrouterModels.js` — legacy static catalog (being retired).
