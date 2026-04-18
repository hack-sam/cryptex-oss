# BYOK Multi-Provider Gateway — Design Spec

**Date:** 2026-04-18
**Sub-project:** #1 of Brainstormed-Plan.md
**Status:** Draft — awaiting user review before plan
**Supersedes:** the hand-rolled `app/src/lib/ai/openrouter.ts` as the single AI entry point
**Research basis:** `.planning/research/brainstorm-gateway.md`

---

## 1. Goal

Give Cryptex seamless support for **OpenAI, Anthropic, OpenRouter, and any OpenAI-compatible provider** from a pure-static BYOK browser app, without rewriting the three existing AI tool callers (PromptCraft, Anti-Classifier, AI Translation) beyond a one-line import change.

Success = the three tools work unchanged against OpenRouter on day one, and a user who pastes an Anthropic key + picks Claude Opus 4.7 gets a working call through the same UI and the same feature code.

---

## 2. Non-goals

- Streaming rendering in the three tools. `streamChat()` ships in the gateway; tool UIs stay non-streaming. Streaming lands in the chat-playground sub-project.
- The chat playground UI, MCP integration, WebGPU local provider. Each is its own sub-project.
- Direct OpenAI and direct Google Gemini keys from the browser — they don't return CORS from `api.openai.com` / `generativelanguage.googleapis.com`. Users route those models through OpenRouter. Documented in §11.
- Server-side proxy infrastructure. Cryptex stays static.
- Retrofitting the legacy Vue side (`js/tools/*Tool.js`). That code is frozen per the migration plan.

---

## 3. User decisions locked in brainstorming

| # | Decision | Choice |
|---|---|---|
| 1 | Migration shape | **B** — new `gateway.ts` + deprecated re-export from `openrouter.ts` |
| 2 | Provider onboarding UX | **B** — progressive disclosure, "+ Add provider" flow |
| 3 | Key validation timing | **A** — validate on blur with rate-limit guards (800 ms debounce, 3 s per-provider throttle, AbortController, dedupe, 60 s 401 lockout) |
| 4 | OpenAI-compat presets | **C** — presets + `/models` catalog discovery, preset name editable |
| 5 | Error surfacing | **C** — inline banner with category-specific CTAs, 1 s/4 s/16 s backoff auto-retry on `rate_limit` |
| 6 | Model picker scale | **A** — single flat picker with search + capability filter chips; Cmd+M palette shortcut; recent-5 pinned; adapter as secondary label |
| 7 | Streaming this phase | **A** — non-streaming in tools; `streamChat()` shipped unused |
| — | Commit cadence | 7 atomic commits, manual verify + push after each |
| — | Model picker grouping | Upstream provider (OpenAI / Anthropic / Google / Meta) with "via X" adapter sub-label |
| — | Sticky model preferences | Per-tool, kept in localStorage (current behavior) |
| — | Fallback config | Per-provider-configurable (Anthropic → Haiku 4.5; OpenAI-compat → user-chosen; OpenRouter → keep Gemma 3 27B) |

---

## 4. Architecture

### 4.1 Module layout

```
app/src/lib/ai/
  gateway.ts                ← NEW. Public facade: chat, streamChat, fetchModels,
                              validateKey, resolve, listProviders. Imports adapters
                              lazily.
  types.ts                  ← NEW. All cross-module types: ChatMessage, ChatRequest,
                              ChatResponse, StreamEvent, Model, Usage, KeyInfo,
                              ProviderId, QualifiedModelId, ErrorCategory,
                              GatewayError, ProviderRecord, ProviderPreset.
  providers.svelte.ts       ← NEW. Reactive multi-provider registry (rune-backed,
                              persisted). Seeds from legacy cryptex.openrouterApiKey
                              on first load.
  catalog.svelte.ts         ← NEW (rename of models.svelte.ts). Aggregates catalogs
                              across providers. Keeps existing cache TTL shape.
  presets.ts                ← NEW. OpenAI-compatible preset templates (Groq,
                              Together, Fireworks, DeepInfra, Cerebras, SambaNova,
                              Custom) with baseURL + verify hints.
  validate.ts               ← NEW. Per-provider key validation with debounce,
                              dedupe, throttle, abort. Returns KeyInfo | throws
                              GatewayError.
  errors.ts                 ← NEW. GatewayError + translateError() per provider.
  adapters/
    base.ts                 ← NEW. Adapter interface + shared helpers.
    openrouter.ts           ← NEW. @openrouter/ai-sdk-provider.
    anthropic.ts            ← NEW. @ai-sdk/anthropic + dangerouslyAllowBrowser.
    openai-compat.ts        ← NEW. @ai-sdk/openai-compatible factory — one instance
                              per user-added endpoint.
  openrouter.ts             ← KEEP AS SHIM. Re-exports from gateway with deprecation
                              JSDoc. Deleted in commit 6.
  models.svelte.ts          ← KEEP AS SHIM. Re-exports from catalog with deprecation
                              JSDoc. Deleted in commit 6.
```

Commit 1 creates everything except `adapters/anthropic.ts` and `adapters/openai-compat.ts` (commits 2 and 3). Commits 2 and 3 add adapters; commit 4 wires the Settings UI; commit 5 wires the picker; commit 6 deletes the shims; commit 7 updates docs.

### 4.2 Types (canonical, from commit 1)

```ts
// app/src/lib/ai/types.ts

export type ProviderId =
  | 'openrouter'
  | 'anthropic'
  | 'openai-compat';

/** Fully-qualified model id: "openrouter:openai/gpt-5.4", "anthropic:claude-opus-4-7",
 *  "openai-compat:<endpointId>/<model>". Unqualified ids default to OpenRouter for
 *  back-compat with stored prefs. */
export type QualifiedModelId = `${ProviderId}:${string}` | string;

export type ErrorCategory =
  | 'auth' | 'credit' | 'forbidden' | 'not_found'
  | 'rate_limit' | 'network' | 'format' | 'cors' | 'api' | 'unknown';

export class GatewayError extends Error {
  readonly category: ErrorCategory;
  readonly status?: number;
  readonly provider: ProviderId;
  readonly retryAfterMs?: number;   // populated on rate_limit
  readonly raw?: unknown;           // upstream body for debugging
  constructor(msg: string, opts: {
    category: ErrorCategory; status?: number; provider: ProviderId;
    retryAfterMs?: number; raw?: unknown;
  });
}

/** Content parts enable attachments later without breaking string-based callers. */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string | ArrayBuffer; mediaType?: string }
  | { type: 'file'; data: ArrayBuffer; mediaType: string; filename?: string };

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
};

export type ChatRequest = {
  /** Qualified or unqualified. Resolved via resolve() before dispatch. */
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;         // canonical. Aliased from max_tokens for legacy.
  max_tokens?: number;              // alias, accepted, mapped.
  topP?: number;
  top_p?: number;                   // alias.
  title?: string;                   // propagated as X-Title on OpenRouter.
  tools?: Record<string, ToolDef>;
  /** Provider-native knobs: { anthropic: { cacheControl, thinking },
   *  openai: { reasoningEffort }, google: { thinkingLevel } } */
  providerOptions?: Record<string, unknown>;
  signal?: AbortSignal;
};

export type ToolDef = {
  description: string;
  inputSchema: unknown;             // zod schema in practice
  execute?: (input: unknown) => Promise<unknown>;
};

export type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;       // Anthropic cache_read / OpenAI cached_prompt
  reasoningTokens?: number;         // thinking / reasoning emitted
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
  | { type: 'text-delta';       delta: string }
  | { type: 'reasoning-delta';  delta: string }
  | { type: 'tool-call';        toolName: string; input: unknown; toolCallId: string }
  | { type: 'tool-result';      toolCallId: string; result: unknown }
  | { type: 'finish';           finishReason: string; usage: Usage };

export type Model = {
  id: string;                       // unqualified within provider
  qualifiedId: QualifiedModelId;    // "openrouter:openai/gpt-5.4"
  name: string;
  provider: ProviderId;
  providerInstanceId?: string;      // for openai-compat: which endpoint
  upstreamProvider?: string;        // "OpenAI", "Anthropic", "Google", "Meta", ...
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

/** Stored in localStorage under `cryptex.providers`. */
export type ProviderRecord =
  | { id: 'openrouter'; apiKey: string; enabled: boolean; fallbackModel?: string }
  | { id: 'anthropic'; apiKey: string; enabled: boolean; fallbackModel?: string }
  | {
      id: 'openai-compat';
      instanceId: string;           // uuid, stable
      name: string;                 // editable, defaults from preset
      presetId: string | 'custom';
      baseURL: string;
      apiKey: string;
      enabled: boolean;
      fallbackModel?: string;
      testModel?: string;           // used for explicit "Verify" click
    };

export type ProviderPreset = {
  id: string;
  name: string;
  baseURL: string;
  docsUrl: string;
  defaultTestModel?: string;
  /** When false, auto-validate is skipped — user must click Verify. */
  supportsAuthProbe: boolean;
};
```

### 4.3 Adapter interface

```ts
// app/src/lib/ai/adapters/base.ts
import type { LanguageModelV2 } from '@ai-sdk/provider';
import type {
  ProviderId, Model, KeyInfo, ChatRequest, ChatResponse, StreamEvent
} from '../types';

export interface Adapter {
  readonly id: ProviderId;
  readonly instanceId?: string;       // only for openai-compat
  isConfigured(): boolean;
  validateKey(candidate: string, signal?: AbortSignal): Promise<KeyInfo>;
  resolveModel(modelId: string): LanguageModelV2;
  fetchCatalog(signal?: AbortSignal): Promise<Model[]>;
}
```

Each adapter module exports a factory — `openrouterAdapter(record)`, `anthropicAdapter(record)`, `openaiCompatAdapter(record)` — returning an `Adapter`. All three are **lazy-imported** from `gateway.ts` on first use per provider to keep the default bundle small.

### 4.4 `gateway.ts` public API

```ts
// app/src/lib/ai/gateway.ts

export async function chat(req: ChatRequest): Promise<ChatResponse>;
export async function* streamChat(req: ChatRequest): AsyncGenerator<StreamEvent>;
export async function fetchModels(signal?: AbortSignal): Promise<Model[]>;
export async function validateKey(
  providerId: ProviderId,
  candidate: string,
  opts?: { instanceId?: string; signal?: AbortSignal }
): Promise<KeyInfo>;
export function resolve(modelId: string): { adapter: Adapter; modelId: string };
export function listProviders(): ProviderRecord[];
export function hasAnyKey(): boolean;
```

`chat()` signature is a **superset** of today's `openrouter.chat()` — every existing field (`model`, `messages`, `temperature`, `max_tokens`, `top_p`, `title`, `signal`) is accepted verbatim. `maxOutputTokens` / `topP` are added as the canonical names; the old names are kept as accepted aliases. Return shape matches `ChatResponse` exactly so callers don't change.

### 4.5 Resolution

`resolve("openrouter:openai/gpt-5.4")` → `{adapter: openrouterAdapter, modelId: "openai/gpt-5.4"}`.
`resolve("anthropic:claude-opus-4-7")` → `{adapter: anthropicAdapter, modelId: "claude-opus-4-7"}`.
`resolve("openai-compat:<uuid>/llama-4-70b-instant")` → `{adapter: openaiCompatAdapter(<uuid>), modelId: "llama-4-70b-instant"}`.
`resolve("openai/gpt-5.4")` (unqualified) → routes to the first enabled provider, OpenRouter by default. This preserves today's stored `cryptex.pc.model = "openai/gpt-4o"` prefs.

### 4.6 Provider registry (`providers.svelte.ts`)

Rune-backed, persisted under `cryptex.providers`. Seeds on first load:

```ts
[
  { id: 'openrouter', apiKey: <legacy cryptex.openrouterApiKey || ''>, enabled: true }
]
```

Reactivity: changing `apiKey` triggers (a) catalog refetch for that provider, (b) re-validation flag flip, (c) picker re-render. Existing `$effect.root` in the legacy openrouter module moves here.

### 4.7 Catalog (`catalog.svelte.ts`)

Aggregates per-provider catalogs into a unified `Model[]`. Cache per-provider with 1 h TTL (unchanged from today). Grouping for the picker uses `upstreamProvider` (derived from the model id — OpenRouter's `openai/gpt-5.4` → "OpenAI", Anthropic's `claude-opus-4-7` → "Anthropic", OpenAI-compat's `llama-*` → "Meta", etc.). A small lookup table maps prefixes → upstream labels.

### 4.8 Error translation (`errors.ts`)

`translateError(e, providerId)` maps adapter-layer errors into `GatewayError` with the full category taxonomy plus `retryAfterMs` parsed from `Retry-After` / rate-limit headers. CORS failures come back with `category: 'cors'` and a remediation hint message ("this endpoint doesn't return CORS headers — if self-hosted, run with `--cors-allow-origin`").

### 4.9 Validation (`validate.ts`)

One-liner per provider probe with rate-limit guards:

```ts
// Guards (module-level):
const DEBOUNCE_MS = 800;
const THROTTLE_MS = 3000;         // per-provider-instance
const LOCKOUT_401_THRESHOLD = 3;
const LOCKOUT_DURATION_MS = 60_000;

// State per provider instance (keyed by providerId + instanceId):
type ValidationState = {
  lastKey?: string;
  lastValidatedAt?: number;
  consecutiveAuthFails: number;
  lockoutUntil?: number;
  inflight?: AbortController;
};

// Probes:
// - openrouter: GET https://openrouter.ai/api/v1/auth/key (free, returns KeyInfo)
// - anthropic:  POST https://api.anthropic.com/v1/messages with
//               { model: 'claude-haiku-4-5', max_tokens: 1, messages: [{role:'user',content:'.'}] }
//               → treat 200 as ok; 401/403 → auth; 429 → rate_limit; network → network.
// - openai-compat: no auto-probe (presets set supportsAuthProbe: false by default).
//               Explicit Verify button calls POST {baseURL}/chat/completions with
//               the preset's defaultTestModel + max_tokens:1, same classification.

// Public API:
export function scheduleValidate(providerId, instanceId, candidate): void; // debounced
export function verifyNow(providerId, instanceId, candidate): Promise<KeyInfo>;
```

Guards applied: debounce, dedupe (skip if `candidate === lastKey` within TTL), throttle (skip if last request <3 s ago), abort in-flight on re-schedule, 60 s lockout after 3 consecutive 401s.

### 4.10 Auto-retry policy

Inside `chat()`: on `rate_limit`, retry up to 3 times with delays 1 s / 4 s / 16 s. Honor `Retry-After` header when present (prefer its value over the static schedule). `signal` aborts the retry loop immediately. `auth` / `credit` / `cors` / `not_found` / `forbidden` never auto-retry — they surface to the UI with category-specific CTAs.

Code shape:

```ts
async function chatWithRetry(req, adapter, modelId): Promise<ChatResponse> {
  const delays = [1000, 4000, 16000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await dispatchOnce(req, adapter, modelId);
    } catch (e) {
      const err = translateError(e, adapter.id);
      const last = attempt === delays.length;
      if (err.category !== 'rate_limit' || last) throw err;
      const wait = err.retryAfterMs ?? delays[attempt];
      await sleep(wait, req.signal);
    }
  }
  throw new GatewayError('retry exhausted', { category: 'rate_limit', provider: adapter.id });
}
```

### 4.11 Fallback handling

`ChatRequest.model` is the requested model. If the resolved adapter throws `not_found`, the gateway consults the provider's `fallbackModel` field in `ProviderRecord` and retries **once**. If the fallback also fails or is undefined, the `not_found` error propagates unchanged. Defaults wired in commit 4's migration:

- OpenRouter: `google/gemma-3-27b-it` (today's hard-coded fallback).
- Anthropic: `claude-haiku-4-5`.
- OpenAI-compat: none by default; user sets per-endpoint.

---

## 5. Settings UI — progressive disclosure

Commit 4. Location: `app/src/routes/settings/+page.svelte` gets a new **Providers** section at the top, above the existing OpenRouter key block (which becomes a card within this section).

### 5.1 Shape

```
┌──────────────────────────────────────────────────────────────────────┐
│  Providers                                                           │
│  Use your own API keys. Keys are stored only in your browser.        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  OpenRouter                                    [ Remove ]      │  │
│  │  ──────────────────────────────────────────────────────────    │  │
│  │  API key     [••••••••••••••••••••••  ]  ✓ Verified            │  │
│  │                                           Usage: $2.14 / $10   │  │
│  │  Fallback    [ google/gemma-3-27b-it ▾ ]                       │  │
│  │  Status dot  ● Ready · 284 models available                    │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                                                                │  │
│  │              + Add provider                                    │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 Add-Provider picker (Dialog, opens on "+ Add provider")

```
┌──────────── Add a provider ───────────┐
│                                       │
│  Direct                               │
│  [  Anthropic                   ▸ ]   │
│                                       │
│  OpenAI-compatible                    │
│  [  Groq                        ▸ ]   │
│  [  Together                    ▸ ]   │
│  [  Fireworks                   ▸ ]   │
│  [  DeepInfra                   ▸ ]   │
│  [  Cerebras                    ▸ ]   │
│  [  SambaNova                   ▸ ]   │
│  [  Custom endpoint             ▸ ]   │
│                                       │
│  Coming later                         │
│  [  Local (WebGPU)             🔒 ]   │
│                                       │
└───────────────────────────────────────┘
```

Clicking a row replaces the Dialog body with a card form specific to that provider. Anthropic = key only. OpenAI-compat preset = name (editable, preset-filled) + key. Custom = name + baseURL + key + optional test model.

### 5.3 Per-card behavior

- **Key field**: `type="password"` (show-toggle eye icon). Paste triggers debounced validation on blur if `supportsAuthProbe`. While validating: subtle spinner at the right of the field. On success: `✓ Verified` + KeyInfo summary (usage, rate limit where available). On error: inline banner in the card with category-specific CTA (§6).
- **Fallback selector**: disabled until first successful catalog fetch; then a dropdown of that provider's models. Stored in `ProviderRecord.fallbackModel`.
- **Status dot**: `●` colors — green (ready + catalog loaded), amber (validated, catalog loading), red (error), grey (disabled or no key).
- **Remove button**: confirm dialog ("Remove Anthropic? Any tools using this provider will fall back to OpenRouter.").
- **Disable toggle** (hidden in a `…` menu): unchecks `enabled` without removing the config.
- **Verify now button** (next to key field on OpenAI-compat, always visible): triggers explicit validation when `supportsAuthProbe: false`.

### 5.4 OpenAI-compat preset registry

```ts
// app/src/lib/ai/presets.ts
export const OPENAI_COMPAT_PRESETS: ProviderPreset[] = [
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
  { id: 'sambanova',  name: 'SambaNova',  baseURL: 'https://api.sambanova.ai/v1',
    docsUrl: 'https://docs.sambanova.ai/cloud/api-reference/endpoints/chat',
    defaultTestModel: 'Meta-Llama-3.3-70B-Instruct', supportsAuthProbe: true },
  { id: 'custom',     name: 'Custom',     baseURL: '',
    docsUrl: '', defaultTestModel: undefined, supportsAuthProbe: false },
];
```

Preset baseURLs are editable after creation — users can change if a provider URL changes. A JSDoc comment above this list says "Sourced 2026-04-18 — verify if preset becomes stale."

### 5.5 Catalog discovery on add

After a new provider card saves with a valid key, gateway calls `adapter.fetchCatalog(signal)`. For `openai-compat`, that's `GET {baseURL}/models`. On success, the model list populates; on failure ("/models not supported" / 404 / network), card surfaces a small "Model list unavailable — enter model ids manually in each tool" hint. Users can still use the provider by typing the model id in the picker's search bar (picker handles free-text fallback).

---

## 6. Error surfacing — category-specific inline banners

Commit 4 also ships a new shared component: `app/src/lib/components/ai/ErrorBanner.svelte`.

```svelte
<!-- props: error: GatewayError, providerRecord: ProviderRecord, onRetry?: () => void -->
<!-- renders a single inline banner with category-specific CTA -->
```

| Category | Copy | CTA(s) | Notes |
|---|---|---|---|
| `auth` | `{Provider} key isn't working.` | **[Open Settings]** | Deep-links to the provider's card in Settings |
| `credit` | `{Provider} credit exhausted.` | **[Top up]** (→ provider docs URL) · **[Switch provider]** | Switch opens picker |
| `forbidden` | `{Provider} rejected this request.` | **[Learn more]** (raw body tooltip) | |
| `not_found` | `Model "{model}" isn't available.` | **[Use fallback: {fallback}]** · **[Change model]** | Auto-fallback triggered once before this shows |
| `rate_limit` | `Rate limited — retrying in {n}s…` → after 3 tries: `Still rate limited.` | **[Retry now]** · **[Switch provider]** | Auto-retry 1 s/4 s/16 s before manual |
| `network` | `Couldn't reach {provider}.` | **[Retry]** | |
| `format` | `Got an unexpected response shape from {provider}.` | **[Retry]** · **[Report issue]** (→ GitHub issues) | |
| `cors` | `Can't reach {endpoint} from the browser.` | **[Learn why]** (→ CORS docs page) · **[Remove endpoint]** | Only happens on openai-compat |
| `api` | `{Provider} API error: {message}` | **[Retry]** | Fallback bucket |
| `unknown` | `Something went wrong.` | **[Retry]** | |

Banner style: subtle red/amber background, `<Alert>` from shadcn-svelte primitive (to be generated in sub-project #3, but we can bootstrap a minimal version in this phase using existing Cryptex styles — the radial-backdrop + `.glass` utility already in the theme). The banner mounts in each tool's existing output header slot.

---

## 7. ModelPicker redesign

Commit 5. Target: `app/src/lib/components/ai/ModelPicker.svelte` — replaces the existing one.

### 7.1 Anatomy

```
┌─ Model ───────────────────────────────────────────────── [⌘M] ─┐
│  🔎 Search…                                                    │
│                                                                │
│  Filters:  [ 🧠 Reasoning ] [ 👁 Vision ] [ 🆓 Free ]           │
│            [ 🛠 Tools    ] [ { } JSON  ] [ ⭐ Recent ]          │
│                                                                │
│  Recent  (pinned 5)                                            │
│    ● openai/gpt-5.4-mini      via OpenRouter      🧠 👁 🛠      │
│    ● anthropic/claude-sonnet-4-6   direct         🧠 🛠         │
│    …                                                            │
│                                                                │
│  OpenAI  (via OpenRouter)                                       │
│    openai/gpt-5.4                                  🧠 👁 🛠      │
│    openai/gpt-5.4-mini                             🧠 👁 🛠      │
│    openai/gpt-5.4-turbo                            🧠 👁 🛠      │
│    openai/o4-mini                                  🧠            │
│    …                                                            │
│                                                                │
│  Anthropic  (direct)                                            │
│    claude-opus-4-7                                 🧠 👁 🛠      │
│    claude-sonnet-4-6                               🧠 👁 🛠      │
│    claude-haiku-4-5                                🧠 👁 🛠      │
│                                                                │
│  Meta  (via Groq)                                               │
│    llama-4-scout-70b                               🛠            │
│    llama-3.3-70b-versatile                         🛠            │
│                                                                │
│  Google, DeepSeek, xAI, Mistral, … (via OpenRouter)             │
│    …                                                            │
└────────────────────────────────────────────────────────────────┘
```

### 7.2 Behavior

- **Search** is fuzzy across model id + display name + upstream provider. Updates as you type.
- **Filter chips** AND-combine (`Reasoning + Vision` → reasoning AND vision models). Click-toggle. Reset on backdrop click or Esc.
- **Recent-5** tracks the last 5 models selected **in the current tool**. Stored per-tool in localStorage under `cryptex.<tool>.recentModels`. Pinned at top when no filter is active.
- **Grouping** by `upstreamProvider` (derived). Each group header shows count. Inside a group, models sorted by capability richness then alphabetically.
- **Adapter tag**: small muted `via OpenRouter` / `direct` / `via Groq` label after the model name. Uses `Model.provider + providerInstanceId`.
- **Capability icons**: `🧠` reasoning, `👁` vision, `🛠` tools, `📄` PDF, `{ }` JSON schema, `🆓` free. Icons use `lucide-svelte` equivalents (Brain / Eye / Wrench / File / Braces / Gift).
- **Keyboard**: `Cmd+M` (or `Ctrl+M`) opens the picker from anywhere in the app. Arrow keys navigate, Enter selects, Esc closes. First match auto-highlighted.
- **Free-text fallback**: if search returns zero matches, the search bar caption shows "Press Enter to use `{search}` anyway" — selecting it sets the model id to the raw string (useful for openai-compat endpoints where `/models` didn't work).
- **Empty provider state**: if no providers configured, picker shows a single centered CTA "Add a provider in Settings" → link.

### 7.3 Sticky per-tool

Each tool keeps its own `cryptex.<tool>.model` slot. Unchanged from today — the picker just returns the qualified id and the tool stores it.

---

## 8. Per-commit details

### Commit 1 — `feat(ai): gateway facade + OpenRouter adapter behind Vercel AI SDK`

**Files added:**
- `app/src/lib/ai/types.ts`
- `app/src/lib/ai/gateway.ts` (chat/streamChat/fetchModels/validateKey/resolve/listProviders/hasAnyKey)
- `app/src/lib/ai/providers.svelte.ts`
- `app/src/lib/ai/catalog.svelte.ts`
- `app/src/lib/ai/errors.ts`
- `app/src/lib/ai/validate.ts`
- `app/src/lib/ai/adapters/base.ts`
- `app/src/lib/ai/adapters/openrouter.ts`
- `app/src/lib/ai/presets.ts` (skeleton)

**Files changed:**
- `app/src/lib/ai/openrouter.ts` → becomes a re-export shim from `gateway.ts`.
- `app/src/lib/ai/models.svelte.ts` → becomes a re-export shim from `catalog.svelte.ts`.
- `app/package.json` → add `ai`, `@openrouter/ai-sdk-provider`, exact-pin versions.

**npm deps added (pinned exactly):**
```json
"ai": "6.0.0",  // or current exact
"@openrouter/ai-sdk-provider": "1.0.0"
```

**Tests:**
- `app/src/lib/ai/__tests__/gateway.test.ts` — covers: `resolve()` qualified vs unqualified; `chat()` preserves request shape; `translateError()` maps adapter errors; `chatWithRetry()` backoff + abort; validation guards (debounce, dedupe, throttle, lockout).
- Snapshot test: an existing tool's `chat()` call with `{model, messages, temperature, max_tokens, title, signal}` → same response shape as before.

**User-visible change:** none. App behaves identically.

**Manual test before push:**
1. `cd app && npm install && npm run app:check && npm run app:test`
2. `npm run app:dev` → open localhost:5173 → PromptCraft/Anti-Classifier/Translate all work with the existing OpenRouter key.
3. DevTools Network: confirm calls still go to `openrouter.ai/api/v1/chat/completions`.
4. Delete key + paste it again in Settings → existing Verify flow still works.

### Commit 2 — `feat(ai): Anthropic-direct adapter`

**Files added:**
- `app/src/lib/ai/adapters/anthropic.ts`

**Files changed:**
- `app/src/lib/ai/gateway.ts` — registers Anthropic adapter in the lazy-import switch.
- `app/src/lib/ai/validate.ts` — adds Anthropic probe.

**npm deps added:**
```json
"@ai-sdk/anthropic": "1.0.0"
```

**Tests:**
- Unit: adapter validates, fetches static catalog (hard-coded Opus 4.7 / Sonnet 4.6 / Haiku 4.5 as of 2026-04-18), translates error categories.
- Integration smoke test (manual only — no CI Anthropic key): paste real key, select `anthropic:claude-haiku-4-5`, run PromptCraft `rephrase` on a short input, assert 200.

**User-visible change:** none yet (no UI exposes Anthropic). Adapter is dormant.

**Manual test:** same as commit 1 — app behavior unchanged. Type-check passes.

### Commit 3 — `feat(ai): OpenAI-compatible adapter + presets + /models discovery`

**Files added:**
- `app/src/lib/ai/adapters/openai-compat.ts`

**Files changed:**
- `app/src/lib/ai/presets.ts` — final preset list with 6 known-good + custom.
- `app/src/lib/ai/gateway.ts` — registers openai-compat adapter (multi-instance).
- `app/src/lib/ai/validate.ts` — adds explicit-verify probe (no auto-probe).
- `app/src/lib/ai/catalog.svelte.ts` — handles per-instance catalog aggregation.

**npm deps added:**
```json
"@ai-sdk/openai-compatible": "1.0.0"
```

**Tests:**
- Unit: preset list well-formed; catalog adapter normalizes `/models` response across two fixtures (Groq, Together); qualifiedId generation stable per instance.

**User-visible change:** none. No UI wires this up yet.

**Manual test:** app behavior unchanged. Type-check passes.

### Commit 4 — `feat(settings): progressive-disclosure provider cards + Add-Provider picker`

**Files added:**
- `app/src/lib/components/settings/ProvidersPanel.svelte`
- `app/src/lib/components/settings/ProviderCard.svelte`
- `app/src/lib/components/settings/AddProviderDialog.svelte`
- `app/src/lib/components/settings/ProviderFormAnthropic.svelte`
- `app/src/lib/components/settings/ProviderFormOpenAICompat.svelte`
- `app/src/lib/components/ai/ErrorBanner.svelte`

**Files changed:**
- `app/src/routes/settings/+page.svelte` — mounts `ProvidersPanel` at top; legacy OpenRouter block now rendered by `ProviderCard` instance.
- `app/src/lib/components/tools/promptcraft/PromptCraftTool.svelte` — replaces ad-hoc error rendering with `<ErrorBanner>`.
- `app/src/lib/components/tools/anticlassifier/AntiClassifierTool.svelte` — same.
- `app/src/lib/components/tools/translate/TranslateTool.svelte` — same.

**Visual:** Settings page gets the progressive-disclosure layout from §5. Error surfacing in all three tools now uses category-specific CTAs from §6.

**User-visible change:** major.
- Settings: new layout with Provider cards + Add-Provider button.
- Tools: error banners now show actionable CTAs instead of a flat string.
- Validation: blur-validated with guards. Existing OpenRouter card migrates smoothly.

**Manual test before push:**
1. Open Settings → see OpenRouter card with existing key, green Verified. ✅
2. Click `+ Add provider` → picker dialog appears. ✅
3. Click Anthropic → form appears; paste bad key → inline auth error after 800 ms blur. ✅
4. Type 5 characters rapidly in key field → blur → exactly one probe request fires. ✅
5. Paste real Anthropic key → verified, KeyInfo shows. ✅
6. Go to PromptCraft → existing model still selected → generate → succeeds. ✅
7. Intentionally expire OpenRouter key (edit to wrong value) → generate in PromptCraft → banner shows `OpenRouter key isn't working [Open Settings]`. Click Settings → deep-links to OpenRouter card. ✅
8. Restore key, throw a manual rate limit (if possible) → see backoff retry behavior.
9. Remove Anthropic card → confirm dialog. ✅

### Commit 5 — `feat(ai): ModelPicker upstream-provider grouping + capability filter chips + Cmd+M palette`

**Files added:**
- `app/src/lib/components/ai/ModelPickerV2.svelte`
- `app/src/lib/components/ai/ModelRow.svelte`
- `app/src/lib/components/ai/CapabilityIcon.svelte`

**Files changed:**
- `app/src/lib/components/tools/promptcraft/PromptCraftTool.svelte` — swap picker component.
- `app/src/lib/components/tools/anticlassifier/AntiClassifierTool.svelte` — swap.
- `app/src/lib/components/tools/translate/TranslateTool.svelte` — swap.
- `app/src/lib/ai/ModelPicker.svelte` (legacy) — deleted in this commit.
- Global keyboard handler: registered in `app/src/routes/+layout.svelte` for `Cmd/Ctrl+M`.

**User-visible change:** new picker visible in all three tools.

**Manual test before push:**
1. Open PromptCraft → click model button → new picker opens. ✅
2. Search "opus" → Claude Opus 4.7 appears under Anthropic group. ✅
3. Click `🧠 Reasoning` chip → non-reasoning models hide. ✅
4. Select Claude Opus 4.7 → picker closes, model selected, tool card updates. ✅
5. Generate a rephrase → call goes to Anthropic direct (DevTools confirms `api.anthropic.com`). ✅
6. Cmd+M (or Ctrl+M) anywhere → picker opens. Esc closes. ✅
7. Select a different model in Anti-Classifier → it stays sticky next visit. ✅
8. Open Recent section — last 5 models listed. ✅
9. Search something nonexistent → "Press Enter to use X anyway" — pressing Enter sets free-text. ✅

### Commit 6 — `refactor(ai): migrate tool callers to gateway; drop openrouter.ts re-export`

**Files changed:**
- `app/src/lib/components/tools/promptcraft/PromptCraftTool.svelte` — `import { chat } from '$lib/ai/openrouter'` → `from '$lib/ai/gateway'`. Update model references to qualified ids (`openrouter:` prefix on legacy stored values via migration step below).
- Same for AntiClassifier and Translate.
- `app/src/routes/settings/+page.svelte` — final import cleanup.
- `app/src/lib/ai/openrouter.ts` → **deleted**.
- `app/src/lib/ai/models.svelte.ts` → **deleted**.
- `app/src/lib/ai/ModelPicker.svelte` → already deleted in commit 5.
- One-time migration helper in `providers.svelte.ts`: on first hydration, if stored per-tool `cryptex.pc.model` / `.ac.model` / `.tg.model` is unqualified, prefix with `openrouter:` in-place.

**User-visible change:** none. Internal refactor only.

**Manual test:**
1. Full app regression pass — all three tools, Settings flows.
2. `grep -r "from '\\$lib/ai/openrouter'"` → zero hits.
3. Type-check passes.
4. All existing stored model prefs still work (migration ran).

### Commit 7 — `docs: update CLAUDE.md + DEPLOY.md with multi-provider CSP connect-src`

**Files changed:**
- `CLAUDE.md` — add "### Multi-provider BYOK gateway" subsection under Architecture. Point to `gateway.ts` as the single AI entry point; explain qualified model ids; note Anthropic-direct + OpenAI-compat.
- `DEPLOY.md` — add CSP `connect-src` entries for the provider hosts:
  ```
  connect-src 'self'
    https://openrouter.ai
    https://api.anthropic.com
    https://api.groq.com
    https://api.together.xyz
    https://api.fireworks.ai
    https://api.deepinfra.com
    https://api.cerebras.ai
    https://api.sambanova.ai
    ;  # user-added custom endpoints: see docs/CUSTOM-ENDPOINTS.md
  ```
- Add `docs/CUSTOM-ENDPOINTS.md` — one-page explainer for users adding custom OpenAI-compat endpoints (CSP note, CORS note, self-hosted vLLM flag).

**User-visible change:** none. Documentation only.

**Manual test:** glance over the rendered markdown, deploy to Dokploy, confirm CSP headers served.

---

## 9. Interaction specifications

### 9.1 Validation state machine per provider instance

```
idle ──(key typed, blur)──▶ debouncing (800 ms timer)
   ▲                               │
   │   (key changes during timer) ─┘
   │
debouncing ──(timer fires)──▶ throttled? ─yes─▶ skip (show cached status)
                                  │
                                  no
                                  ▼
                             inflight (abortable)
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                  success       auth_fail     other_err
                    │             │             │
                    ▼             ▼             ▼
                  ok          authFails++   (show banner, stay in error)
                                  │
                      (authFails ≥ 3)
                                  │
                                  ▼
                            locked_out (60 s)
                                  │
                         (timer → back to idle)
```

### 9.2 Deep-link from ErrorBanner → Settings

Banner's "Open Settings" CTA navigates to `/settings#provider-<id>` (fragment = provider id / instance id). Settings page reads the fragment on mount and:
1. Scrolls that card into view.
2. Expands it if collapsed.
3. Focuses the key input.
4. Adds a subtle ring highlight for 2 s.

### 9.3 "Switch provider" quick-action

When a banner offers `[Switch provider]`, clicking it opens ModelPicker scoped to the other providers (filtered to exclude the failing one). On selection, the tool's sticky model is updated and the failing request is retried. One-tap recovery.

---

## 10. Bundle impact

Measured during commit 1 using `vite-bundle-visualizer`:

| Route | Baseline (today) | After commit 1 | After commit 3 | After commit 5 |
|---|---|---|---|---|
| `/promptcraft` (and siblings) | ~4 KB gz hand-rolled | ~30 KB gz (AI SDK + OpenRouter) | ~30 KB gz (adapters lazy) | ~38 KB gz (picker adds ~8 KB) |
| `/settings` | ~3 KB gz | ~3 KB gz | ~3 KB gz | ~45 KB gz (card forms + error banner) |

Lazy-load rules:
- `adapters/anthropic.ts` and `@ai-sdk/anthropic` loaded only when an Anthropic model is selected OR the Anthropic card is rendered in Settings.
- Same for `openai-compat`.
- Picker's Cmd+M palette split into a separate chunk, loaded on first open.

Hard budget: AI-route critical path ≤ 50 KB gz. Fails CI (`size-limit` or `@size-limit/preset-app`) if exceeded.

---

## 11. CORS reality documented in UI

When user picks Anthropic / OpenAI-compat: works. When user attempts to add **OpenAI direct** as a preset: we **do not ship that preset** — the Add-Provider dialog's footer has a subtle note:

> **Why isn't OpenAI here?** OpenAI's API doesn't accept browser requests from `localhost` or `cryptex.*`. For GPT-5 and o-series models, use OpenRouter with BYOK — it proxies transparently.

Same note for Google Gemini direct. This puts the truth in the UI rather than surprising users with `cors` banners.

---

## 12. Test plan

### 12.1 Unit tests (Vitest)

- `gateway.test.ts`: `resolve()`, `chat()` request/response shape, retry backoff, abort, error translation.
- `validate.test.ts`: debounce, dedupe, throttle, abort-on-rekey, 401 lockout.
- `catalog.test.ts`: multi-provider aggregation, grouping by `upstreamProvider`, cache TTL.
- `providers.test.ts`: legacy key migration, persistence, reactivity.
- `presets.test.ts`: preset shape, `/models` response normalization across 3 fixtures.

### 12.2 Component tests (`@testing-library/svelte`)

- `ProviderCard`: validates on blur, shows spinner, renders success state, renders each error category's banner.
- `AddProviderDialog`: row selection, form swap, submit behavior.
- `ModelPickerV2`: search, filters (combined), recent, keyboard navigation, free-text fallback, empty state.
- `ErrorBanner`: each category renders its CTA set.

### 12.3 Integration smoke (manual, per commit)

Listed in §8 per commit.

### 12.4 Regression

Existing tests continue to pass: `tests/test_universal.js`, `tests/test_steganography_options.js`, `tests/test_lexeme_analysis.js`, `tests/test_lexeme_ui_surface.js`. None touch `app/` — they operate on `src/transformers/` which is untouched by this phase.

---

## 13. Risks (scoped to this phase)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `@ai-sdk/anthropic` browser detection regression across point releases | Medium | High | Pin exact version; smoke-test on bump; keep `anthropic-dangerous-direct-browser-access` header explicit |
| Preset baseURL goes stale | Low | Low | Editable in card; JSDoc stamp; documented in `CUSTOM-ENDPOINTS.md` |
| User pastes a self-hosted vLLM / Ollama endpoint without CORS | Medium | Medium | `cors` category banner with explicit remediation + docs link |
| Bundle budget exceeded | Medium | Medium | `size-limit` CI gate; lazy adapters; code-split picker palette |
| Legacy model id prefs break after migration | Low | Medium | One-time migration in `providers.svelte.ts`; tested in commit 6 |
| Anthropic validation probe costs a cent here and there | Low | Low | `max_tokens: 1` + cheapest model (Haiku 4.5) + throttle + 401 lockout |
| User hits OpenRouter rate limit validating repeatedly | Low | Medium | 3 s throttle + dedupe cover this; `/auth/key` is free anyway |

---

## 14. Out-of-scope explicitly

- Streaming in tools (sub-project #3 will use `streamChat()`).
- Reasoning-block rendering in tools (tools stay text-output; reasoning surfaces in the chat playground).
- Tool-calls from within the three tools (reserved for chat playground).
- Local (WebGPU) provider (sub-project #5 adds a `LocalAdapter` that satisfies the same `Adapter` interface — zero gateway changes required then).
- MCP tool source (sub-project #4; also independent of gateway).
- Encrypted-at-rest key storage (optional, post-v1 if user demand materializes; design already noted in `brainstorm-gateway.md`).

---

## 15. Definition of done (this phase only)

- [ ] Commits 1–7 merged to master, each atomically, each manually verified before push.
- [ ] All three tools work against: OpenRouter (all models), Anthropic-direct (Haiku/Sonnet/Opus 4.x), at least one OpenAI-compat preset (Groq or Together) with real key.
- [ ] New Settings UI matches §5 shape; error banners match §6.
- [ ] ModelPicker matches §7 — search, filters, recent, Cmd+M, free-text fallback.
- [ ] Bundle budget held (`size-limit` green).
- [ ] No `from '$lib/ai/openrouter'` imports remain.
- [ ] `CLAUDE.md` and `DEPLOY.md` updated; `CUSTOM-ENDPOINTS.md` written.
- [ ] `npm run app:check && npm run app:test && npm run test:all` all green.
- [ ] Legacy Vue build (`npm run build:legacy`) still succeeds — we didn't touch its files.
- [ ] CSP `connect-src` list extended on the Dokploy deploy.

---

## 16. Next steps

1. **User reviews this spec.**
2. If approved: I invoke `writing-plans` skill to produce `docs/superpowers/plans/2026-04-18-byok-gateway-plan.md` — ordered by commit, with per-commit task breakdowns, review checkpoints, and TDD test-first ordering.
3. After plan approval: begin commit 1. Pause for manual verification. Push. Repeat through commit 7.
