# Brainstormed-Plan.md

**Cryptex 2026 modernization roadmap — synthesis of five parallel research threads.**

Research window: April 2026.
Target: Cryptex mid-migration from Vue 2 → SvelteKit 2 + Svelte 5 + shadcn-svelte, deployed static to GitHub Pages + a Dokploy/Traefik Docker host.
Constraint: BYOK, browser-only, no backend additions.

This is the **umbrella brainstorm**, not an implementation plan. Each of the five sub-projects below still needs its own design → spec → plan cycle before code. The source research is verbatim and complete in `.planning/research/brainstorm-*.md` — this file is the executive view on top.

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Scope decomposition — why five sub-projects](#2-scope-decomposition--why-five-sub-projects)
3. [Dependency graph + recommended build order](#3-dependency-graph--recommended-build-order)
4. [Sub-project 1 — Multi-provider BYOK gateway](#4-sub-project-1--multi-provider-byok-gateway)
5. [Sub-project 2 — Prompts & AI-technique overhaul](#5-sub-project-2--prompts--ai-technique-overhaul)
6. [Sub-project 3 — Chat playground UI (shadcn-svelte)](#6-sub-project-3--chat-playground-ui-shadcn-svelte)
7. [Sub-project 4 — MCP browser integration](#7-sub-project-4--mcp-browser-integration)
8. [Sub-project 5 — WebGPU local models](#8-sub-project-5--webgpu-local-models)
9. [Cross-cutting concerns](#9-cross-cutting-concerns)
10. [Bundle / performance budget](#10-bundle--performance-budget)
11. [Security posture — consolidated checklist](#11-security-posture--consolidated-checklist)
12. [Risk register](#12-risk-register)
13. [What this plan deliberately leaves out](#13-what-this-plan-deliberately-leaves-out)
14. [Immediate next steps](#14-immediate-next-steps)

---

## 1. Executive summary

**Cryptex's AI surfaces (PromptCraft, Anti-Classifier, AI Translation) are wired on 2023-era prompt patterns and a single-provider OpenRouter client.** To reach 2026-current UX and model coverage we do five things, in this order:

1. **Unify provider access behind Vercel AI SDK 6.** Preserve the existing `chat({model, messages, ...}) → {content, usage}` contract so callers don't change. Add adapters for OpenRouter (default), Anthropic-direct (browser CORS works), and user-configurable OpenAI-compatible endpoints (Groq / Together / Fireworks / vLLM). **Direct OpenAI and direct Google Gemini remain CORS-blocked from browsers in 2026** — users wanting those models route through OpenRouter. Bundle cost: ~+26 KB gzipped, lazy-loadable per route.

2. **Rewrite every system prompt using XML-first / CTCO structure.** Drop the Adderall / "GIANT bonus" / Monday-in-October 2023-era boosters, drop 20-years-experience persona overclaims, drop negative-framing "do NOT" rules, add positive-framed instructions, add one few-shot example per strategy, add deterministic `<rewrite>` / `<translation>` / `<json>` output wrappers. Anti-Classifier gets a structured JSON output contract and the two techniques that actually defeat 2026 detectors — **perplexity/burstiness raising** and **structural variation**. Per-model parameter tuning (`tuneParams()`): Gemini 3 → temp 1.0 + thinking_level low; GPT-5.x → reasoning_effort scaled to task; Claude 4.7 → adaptive thinking with `output_config.effort` rather than `budget_tokens`.

3. **Ship a multi-chat shadcn-svelte playground.** Sidebar (chat list) + workspace (editable title + quick-settings bar + virtualized message list + composer) + collapsible right-hand inspector (advanced params, tools, MCP). Quick-settings — model / temp / system prompt / tools / attachments — live in popovers *over* the chat; the inspector is the escape hatch for power users. Per-chat state persisted via **Dexie + IndexedDB** (not localStorage — quota, blobs, live queries). Streaming + Shiki-highlighted Markdown via **`svelte-streamdown`**. Virtualization via **`@tanstack/svelte-virtual`** past ~200 messages. **Cryptex's 162 transformers become chat tools via a local, zero-network adapter** — Cryptex's most defensible feature in the playground.

4. **Add MCP server connect/configure in the chat UI.** Streamable HTTP transport only (stdio is unreachable from a browser; WebSocket is non-standard in 2026). OAuth 2.1 + PKCE via **Client ID Metadata Documents** (CIMD) — we already have a static HTTPS origin, so hosting `/oauth/client-metadata.json` is free. Per-server tool allowlist + confirm-before-call + rate-limit + kill-switch make it shippable. Cryptex transformers win priority over MCP tools when names collide.

5. **WebGPU local models as a first-class provider.** `@mlc-ai/web-llm` primary (native OpenAI Chat Completions shape — trivial adapter), `@wllama/wllama` WASM fallback for the no-WebGPU tier. Three-tier model picker (Tiny 230 MB / Balanced 2 GB / Power 4.6 GB). Weights cached via Cache API (migrate to OPFS when WebLLM issue #660 lands). Honest first-run UX: explicit download confirmation, progress per shard, cancellable, resumable, clearable. tok/s badge live during streaming so users see their own hardware truth.

**The gateway (#1) unblocks #3, #4, #5. Prompts (#2) are independent and can run in parallel.** Each sub-project is independently shippable and valuable — there is no "all or nothing."

---

## 2. Scope decomposition — why five sub-projects

The user's brief bundled prompt rewrites, a chat UI, multi-provider support, MCP, and WebGPU into one ask. That is five independent problem domains touching different layers of the stack and requiring different research. Bundling them into a single spec produces a wishlist that never ships.

| # | Sub-project | Layer | Touches UI? | Touches network? | Independent? |
|---|------------|-------|:---:|:---:|:---:|
| 1 | BYOK gateway | Core AI | No (API-compatible) | Yes (new providers) | Yes — everything else assumes it |
| 2 | Prompts overhaul | Content | Minimal (output parser update) | No | Fully — ship anytime |
| 3 | Chat playground UI | UI | Yes (large) | Yes (streaming) | Depends on #1 for multi-provider |
| 4 | MCP integration | Integration | Yes (settings + chat) | Yes (arbitrary servers) | Depends on #3 having a tool surface |
| 5 | WebGPU local models | Runtime | Yes (model picker + first-run UX) | No (weights from HF) | Depends on #1 being a "provider" abstraction |

Each gets its own spec → plan → implementation cycle. This document's job is to ensure the five stay coherent, share vocabulary, and don't contradict each other.

---

## 3. Dependency graph + recommended build order

```
      ┌─────────────────────────────┐
      │  #1  BYOK Gateway           │       #2 runs in parallel with #1
      │  (Vercel AI SDK 6 adapters) │   ┌────────────────────────────────┐
      │  - OpenRouter  (default)    │   │  #2  Prompts & Technique       │
      │  - Anthropic-direct         │   │     Overhaul                   │
      │  - OpenAI-compat (Groq/     │   │  - PromptCraft rewrites        │
      │    Together/Fireworks/vLLM) │   │  - Anti-Classifier rewrite     │
      │  - LocalProvider (#5 later) │   │  - AI Translation rewrite      │
      └──────────────┬──────────────┘   │  - shared prompt-scaffold.ts   │
                     │                  └────────────────────────────────┘
                     │ (no dependency on #2 — prompts just call chat())
                     ▼
      ┌─────────────────────────────┐
      │  #3  Chat Playground UI     │
      │  - multi-chat + settings    │
      │  - attachments              │
      │  - transformers as tools    │
      │  - shadcn-svelte shell      │
      └──────────────┬──────────────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
 ┌────────────────┐     ┌──────────────────────┐
 │ #4  MCP        │     │ #5  WebGPU local     │
 │    Integration │     │    models            │
 │  - add/remove  │     │  - WebLLM primary    │
 │    servers     │     │  - wllama fallback   │
 │  - OAuth 2.1   │     │  - 3-tier picker     │
 │  - tool bridge │     │  - OPFS/Cache API    │
 │    to gateway  │     │  - plugs into #1 as  │
 └────────────────┘     │    a provider        │
                        └──────────────────────┘
```

**Natural build order: 1 → 2 (parallel) → 3 → 4 + 5 (parallel).**

- **#1 first** because everything after uses the gateway's `chat()` surface and provider abstraction. Delivering #1 alone is invisible to users but unlocks the rest. Migration risk is low: existing callers change one import line.
- **#2 can run in parallel with #1.** The new prompts call `chat({...})` — same signature before and after the gateway lands. Ship prompt improvements the moment they're tested.
- **#3 requires #1** to expose multiple providers in the model picker and to give per-chat "which provider" settings meaningful.
- **#4 and #5 are independent siblings** once #3 is in place. MCP adds an external tool surface; WebGPU adds a local provider. They don't conflict — an MCP-enabled local-model chat is fine.

**Alternate if budget is small:** ship #2 first in isolation. It's pure content — touches ~6 source files, no new deps, immediately improves every AI feature's quality. Then do #1. Then decide whether the chat UI (#3), MCP (#4), or local models (#5) has the highest product leverage given where Cryptex is.

---

## 4. Sub-project 1 — Multi-provider BYOK gateway

**Source research:** `.planning/research/brainstorm-gateway.md` (615 lines).

### 4.1 Problem

Cryptex's AI features (PromptCraft, Anti-Classifier, Translate) speak only OpenRouter through a hand-rolled `app/src/lib/ai/openrouter.ts`. The user wants seamless support for OpenAI, Anthropic, and OpenAI-compatible providers without losing BYOK semantics and without writing a lot of new code.

### 4.2 Key findings

- **Cryptex already has the right interface.** `chat({model, messages, temperature, max_tokens, top_p, title, signal}) → {content, rawModel, finishReason, usage}` — this is exactly the surface a gateway needs to preserve. The reactive model catalog (`models.svelte.ts`) and categorized `OpenRouterError` taxonomy are also keepers.

- **CORS reality pins provider options.** From April 2026 hand-tested browser calls:
  - ✅ **Anthropic direct**: works with `anthropic-dangerous-direct-browser-access: true` header (since Aug 2024).
  - ✅ **OpenRouter**: CORS open by design.
  - ✅ **Groq / Together / Fireworks / DeepInfra**: all CORS-open (they court browser devs).
  - ✅ **Self-hosted vLLM / Ollama**: only if operator configures `--cors-allow-origin`.
  - ❌ **OpenAI direct** (`api.openai.com`): no CORS. Dead end from a static site.
  - ❌ **Google Gemini direct** (`generativelanguage.googleapis.com`): no CORS. Dead end.

  Implication: "direct OpenAI keys" and "direct Gemini keys" must route through OpenRouter. A pure-static app has no way around this without a proxy server we don't have.

- **Vercel AI SDK 6 is the right framework.** Shipped Dec 2025. Unified API with `@ai-sdk/*` providers; **`@openrouter/ai-sdk-provider`** is first-class; **`@ai-sdk/anthropic`** supports browser use; **`@ai-sdk/openai-compatible`** covers the long tail (one adapter factory, one baseURL per user-added endpoint). Tree-shakeable. Svelte bindings available (`@ai-sdk/svelte`) for future streaming/chat UI.

- **Bundle tax is acceptable.** `ai` core ~67 KB gz → ~25–30 KB after tree-shake. Each adapter +5–10 KB. Lazy-loaded per route, the default OpenRouter-only page adds ~26 KB gz over today's hand-rolled client — a worthwhile trade for the normalization, streaming, tool-call, and reasoning surfaces "for free."

- **localStorage plaintext remains the honest default.** WebCrypto-encrypted-at-rest doesn't defeat XSS (the real BYOK threat), only physical disk access. Offer AES-GCM + PBKDF2 (SHA-512, 1M iterations) passphrase encryption as an opt-in toggle for users who want it. Never move to OPFS — same origin, same XSS surface, no upside.

- **LangChain.js and LiteLLM are wrong tools.** LangChain is 101 KB gz before tree-shake, overkill for single-shot / fan-out prompts. LiteLLM has no credible JS port in 2026 (Python only).

### 4.3 Recommended architecture

Thin facade that preserves existing interface:

```
app/src/lib/ai/
  gateway.ts              ← NEW: chat, streamChat, fetchModels, validateKey
  adapters/
    openrouter.ts         ← @openrouter/ai-sdk-provider (default)
    anthropic.ts          ← @ai-sdk/anthropic + dangerouslyAllowBrowser
    openai-compat.ts      ← @ai-sdk/openai-compatible factory (Groq/Together/…)
  providers.svelte.ts     ← reactive multi-provider registry (keys + base URLs)
  models.svelte.ts        ← KEEP, extend to multi-provider catalog aggregation
  openrouter.ts           ← KEEP as deprecated re-export from gateway
```

**Qualified model ids** (`"openrouter:openai/gpt-5.4"`, `"anthropic:claude-opus-4-7"`, `"openai-compat:groq/llama-4-70b"`) route to the right adapter. Unqualified ids fall back to the default provider (OpenRouter for back-compat with today's stored model prefs).

**Unified types:** `ChatRequest`, `ChatMessage` (content: `string | ContentPart[]` — parts unlock attachments later), `ChatResponse` (adds optional `reasoning` + `toolCalls`), `StreamEvent` (text-delta / reasoning-delta / tool-call / tool-result / finish), `GatewayError` with full category taxonomy including provider id.

**Streaming, tool-calls, attachments, caching** — all exposed through `providerOptions` pass-through, normalized by Vercel AI SDK. Cryptex's existing callers ignore them; new features (chat UI, MCP tools) use them.

### 4.4 Migration path

| Caller | Change |
|---|---|
| `PromptCraftTool.svelte` | `import { chat } from '$lib/ai/openrouter'` → `from '$lib/ai/gateway'`; optionally prefix model id with `openrouter:` |
| `AntiClassifierTool.svelte` | Same one-line import change |
| `TranslateTool.svelte` | Same, plus handle `not_found` identically |
| `Settings` page | `getApiKey`/`setApiKey`/`validateKey` → parameterized per provider id |
| `ModelPicker` | Uses same module; now returns multi-provider list grouped by `upstreamProvider` |

Legacy `$lib/ai/openrouter.ts` becomes a thin re-export from the gateway during a deprecation window. Legacy migration: on first load, seed `providers[0].apiKey` from `cryptex.openrouterApiKey`.

### 4.5 Key dependencies to add

```json
"ai": "^6.x",
"@ai-sdk/anthropic": "^1.x",
"@ai-sdk/openai-compatible": "^1.x",
"@openrouter/ai-sdk-provider": "^1.x"
```

Pin exact versions — `@ai-sdk/anthropic` browser detection has regressed on point releases.

### 4.6 Risks

- **CORS surprises.** User adds a custom OpenAI-compat baseURL without CORS → fail loudly with a "cors" category error and a docs link.
- **CSP `connect-src` explosion.** Every provider host must be explicitly listed. Custom endpoints force the user to choose between (a) we document and accept the risk, or (b) we weaken `connect-src`. Recommend (a) with a UI warning.
- **Anthropic SDK regressions.** 2025–2026 had two browser-detection breakages across minor releases. Pin exact versions + add a smoke-test job.
- **Direct OpenAI/Gemini temptation.** Will come up as a user request repeatedly. Answer: "use OpenRouter with BYOK" is the correct one for a static site.

### 4.7 Definition of done

- [ ] `gateway.ts` fully covers today's `chat()` surface with a single test suite that proves API compatibility
- [ ] All three tool features work identically against OpenRouter through the gateway
- [ ] Anthropic-direct adapter loads and chat completes for Opus 4.7 / Sonnet 4.6 / Haiku 4.5
- [ ] Groq and Together endpoints work via `openai-compat` adapter
- [ ] Settings page lists multiple providers, validates each independently
- [ ] Model picker groups by upstream provider (OpenAI / Anthropic / Google / Meta / …)
- [ ] Bundle-size regression on the AI routes is under +30 KB gzipped
- [ ] CSP `connect-src` updated + documented

---

## 5. Sub-project 2 — Prompts & AI-technique overhaul

**Source research:** `.planning/research/brainstorm-prompts.md` (~620 lines).

### 5.1 Problem

The three AI tool system prompts (PromptCraft's 9 strategies, Anti-Classifier, AI Translation) were authored against 2023-era models and 2023-era jailbreak patterns. They contain specific phrases that are **actively harmful** on 2026 frontier models, they use structure (flat markdown, negative-framing rules) that the April 2026 Anthropic doc explicitly warns against, and the Anti-Classifier tool's claim to defeat AI-writing detectors is unsupported because it doesn't use the only two techniques that work against 2026 detectors (perplexity/burstiness raising, structural variation).

### 5.2 Key findings

**Dead 2023-era patterns the current prompts still use:**
- `"Take a deep breath, relax, and enter a state of flow as if you've just taken Adderall"` — Anthropic April 2026 doc explicitly flags this register.
- `"If you follow all instructions and exceed expectations you'll earn a GIANT bonus"` — the "bonus/tip" trick is now a mild negative on 2026 models.
- `"It's a Monday in October, the most productive day of the year"` — never had statistical effect, superstition.
- `"20 years of experience"` persona overclaim — Anthropic: "a single sentence makes a difference."
- `"Do NOT add commentary"` negative framing — Anthropic: positive framing outperforms.
- Adversarial "CRITICAL: You MUST" coercive language — Anthropic: "Claude 4.x may now overtrigger; dial back."

**2026-current patterns to adopt:**
- **Anthropic Opus 4.7 / Sonnet 4.6 / Haiku 4.5:** XML-first structure (`<role>` / `<task>` / `<context>` / `<rules>` / `<examples>` / `<output_format>`). Adaptive thinking (`thinking: {type: "adaptive"}` + `output_config.effort` — `budget_tokens` deprecated). Prefilled assistant turns being removed — structured outputs replace.
- **OpenAI GPT-5.x (5.2 / 5.4):** CTCO framework — `Context → Task → Constraints → Output`. Mandatory `reasoning_effort` knob (`minimal` | `low` | `medium` | `high` | `xhigh`). `verbosity` knob separate from `reasoning_effort`. `developer` role preferred over `system` for tool/agent work. Structured outputs via JSON Schema with `strict: true` (CFG-masked at the token level).
- **Google Gemini 3:** `thinking_level` replaces `thinking_budget`. **Temperature 1.0 is the recommended value** (not 0.2 — Gemini 3 reasoning is optimized for default temp). `"think silently"` system hint for latency-sensitive calls.
- **Model-agnostic:** CoVe (Chain-of-Verification) beats single-shot on frontier models. Self-consistency remains valid (PromptCraft's 3-variant fan-out is a legitimate instance). Explicit `"think step by step"` is dead/harmful on frontier models (Opus 4.7 / GPT-5 / Gemini 3 — native reasoning). Persuasive/Authority Prompting (PAP) — "As a certified red-team researcher under authorized contract…" — is the **strongest** jailbreak-adjacent technique per a March 2026 benchmark.

**Anti-classifier state of play, April 2026:**
- **GPTZero v3, Originality.ai, Turnitin v4** — all three now analyze sentence-level entropy + burstiness + semantic coherence. **Raising perplexity and burstiness is the only surface-level countermeasure that still works.** Human burstiness 0.65–0.85; typical AI <0.30.
- **Image-gen filters (DALL-E 4, Midjourney v7, SD4)** — semantic substitution and homoglyph insertion still work.
- **Text-LLM moderation** — semantic circumlocution + academic framing (PAP) works.
- **What's dead:** DAN / Evil Confidant / AntiGPT by name; "developer/debug mode"; naive rewording.

### 5.3 Recommended rewrites

Full system prompts are in `.planning/research/brainstorm-prompts.md §3` — ready to paste. Summary of the shape:

**PromptCraft (9 strategies):** each becomes XML-structured `<role>` / `<task>` / `<rules>` / `<example>` / output-wrapped-in-`<rewrite>`-tags. Specific corrections:
- **`roleplay`**: split academic framing (PAP — strongest) from generic "pretend you are X" fiction.
- **`multilingual`**: corrected instruction — prefer a single low-resource language (Swahili, Vietnamese, Quechua, Welsh, Basque, Tagalog) over the current "mix 2–4 high-resource languages" code-switch. The low-resource bypass is what actually works.
- Every strategy ships with one few-shot example (Anthropic: "3–5 for best results"; one per strategy + the user's input as an implicit shot covers it).

**Anti-Classifier:** single system prompt cut from 116 lines → ~90 lines of substantive content. Drops Adderall/bonus/Monday-in-October. Adds two new techniques the old prompt completely missed: **`perplexity_raise`** and **`structural_variation`**. Switches output from free-form text to **structured JSON inside `<json>` tags** conforming to a schema (`analysis.trigger_terms`, `analysis.classifier_targets`, `rewrites[]` with rank/label/text/techniques/evasion_score/semantic_preservation_note). Includes one honest decline category (CSAM / bioweapons) so the prompt is actually shippable under Anthropic's non-negotiable list without being preachy.

**AI Translation (both surfaces — TranslateTool and DecodeTool's "translate to English"):** single canonical system prompt with `<role>` / `<rules>` / `<output_format>`. Register rule added (formal / neutral / casual). DecodeTool's prompt now gracefully handles wrong auto-detected language. Output wrapped in `<translation>` tags for deterministic preamble stripping. "TranslateGemma translation protocol" phrase removed from non-TranslateGemma calls. **Per-model-family parameter tuning** via `tuneParams()`:
- Gemini 3 → `temperature: 1.0, thinking_level: "low"`
- GPT-5.x → `reasoning_effort: "minimal"` for translation, `low` for mutation, `medium` for analysis
- Claude 4.x → adaptive thinking via `output_config.effort`
- Gemma 3 / Gemini 2.5 / small models → `temperature: 0.2` (kept)

### 5.4 Shared scaffolding

New module `app/src/lib/ai/prompt-scaffold.ts`:

```ts
export const OUTPUT_WRAPPERS = {
  rewrite:    { open: '<rewrite>',    close: '</rewrite>' },
  translation:{ open: '<translation>',close: '</translation>' },
  json:       { open: '<json>',       close: '</json>' }
} as const;

export function unwrap(raw: string, wrapper: keyof typeof OUTPUT_WRAPPERS): string;
export function tuneParams(modelId: string, task: 'translate' | 'mutate' | 'analyze'): {
  temperature?: number; reasoning_effort?: string; thinking_level?: string;
};
```

All three tools call `unwrap()` on response and `tuneParams()` on request.

### 5.5 Prompt caching hooks

- **PromptCraft:** 9 strategy-dependent prefixes. Cache each via `cache_control: {type: "ephemeral"}`. Within a session's 3-variant batch, first creates the cache, other two hit (~10–15% cost savings).
- **Anti-Classifier:** single ~1500-token static prefix. Strong candidate. Use `ttl: "1h"` explicitly to override March-2026 5m silent default.
- **AI Translation:** ~200 tokens — not worth explicit caching; implicit prefix caching on Gemini 2.5 / OpenAI routes gets it for free.

Per-tool `X-Title` header suffix: `Cryptex/PromptCraft/rephrase-v2`, `Cryptex/AntiClassifier-v2`, `Cryptex/Translate-v2` — makes hit rates visible in OpenRouter dashboard and lets us detect cache regressions.

### 5.6 Lexeme analysis integration (free win)

Cryptex already runs a client-side `LexemeAnalysis` Latin-root detector on all three tools' inputs — currently purely cosmetic. Feed its findings into the system prompt as `<context>` so the model knows **which** AI-signature terms to target. One-line wiring change, roughly doubles Anti-Classifier effectiveness against AI-writing detectors.

### 5.7 Definition of done

- [ ] `prompt-scaffold.ts` with `unwrap()` and `tuneParams()` shipped with unit tests
- [ ] All 9 PromptCraft strategies replaced; regression-tested across one model per family (Anthropic / OpenAI / Google / Meta / DeepSeek / xAI)
- [ ] Anti-Classifier prompt replaced; new structured JSON output rendered as a ranked table in the UI (both legacy Vue and SvelteKit)
- [ ] AI Translation prompt replaced; both surfaces (TranslateTool + DecodeTool) share the same canonical system prompt
- [ ] Per-model-family `tuneParams()` applied automatically based on selected model
- [ ] Prompt caching enabled on the two long prompts with verified cache hits in the OpenRouter dashboard
- [ ] Lexeme analysis piped into `<context>` blocks for all three tools
- [ ] Legacy Vue prompt sources and SvelteKit ports re-unified (no more 116 vs 56 line drift between `anticlassifierPrompt.js` and `anticlassifier/prompt.ts`)

### 5.8 Risks

- **Output format regressions** — models that used to emit plain text now need to produce `<rewrite>` / `<translation>` / `<json>` wrappers. `unwrap()` must degrade gracefully when the wrapper is missing (fall back to raw text). Covered in tests.
- **Small-model drift** — very small models (Gemma 3 4B, Llama 3.2 1B) may ignore XML structure. Gemini/Gemma already do this ~5% of the time with translation preambles. Fallback behavior handles it.
- **Structured JSON strictness** — on providers that don't support `response_format: {type: "json_schema", strict: true}`, fall back to `<json>` tag parsing; don't fail hard.
- **Cache hit rate blind spots** — without the `X-Title` suffix we can't verify cache actually hits. Ship the naming convention with the prompts.

---

## 6. Sub-project 3 — Chat playground UI (shadcn-svelte)

**Source research:** `.planning/research/brainstorm-chat-ui.md` (880 lines — includes ASCII layout sketches and Dexie schemas).

### 6.1 Problem

Cryptex currently has three single-shot AI surfaces but zero multi-turn conversational code. The user wants a professional, multi-chat playground where each chat is an independent experimentation surface: own context, own model, own system prompt, own tools, own attachments, quick settings directly over the chat.

### 6.2 Current app surface (what we start from)

- SvelteKit 2 + Svelte 5 runes + adapter-static.
- **`bits-ui` already installed; shadcn-svelte primitives NOT yet generated.** Running `shadcn-svelte` CLI will drop in `$lib/components/ui/*` against the existing Tailwind theme tokens, which already match the shadcn contract — no re-theming needed.
- `createPersistedState<T>(key, initial)` is the one reactive helper everything persistent goes through. Uses `localStorage` + `JSON.stringify` in a root `$effect`. **No Dexie / idb / IndexedDB anywhere today.**
- `app/src/lib/ai/openrouter.ts` is non-streaming today — awaits full response before returning.
- `app/src/lib/transformers/registry.ts` already exposes all 162 transformers via `import.meta.glob` with `{ name, category, func, reverse, configurableOptions, detector, priority, description }`. This is the clean surface we wrap into the chat's tool registry.

### 6.3 Key findings

- **No first-party `Chat` block in shadcn-svelte** (same as shadcn/ui React). Compose from: Sidebar, Resizable, ScrollArea, Sheet, Command, Dialog, DropdownMenu, Popover, Tooltip, Textarea, Sonner, Skeleton, Separator, Avatar, Badge, Kbd, Spinner.
- **Reference shells:** `vercel/ai-chatbot-svelte` (official SvelteKit port) — great for message-list/composer/streaming plumbing, useless for storage (Postgres + Blob). `cliffordkleinsr/shadcn-svelte-chat` — a shadcn-style CLI that drops chat primitives; worth one `npx` to see the shape, then hand-roll what we keep. `shadcn-svelte-extras` → lift `FileDropzone` verbatim.
- **Vercel AI Elements is React-only** in 2026. Mimic its component taxonomy (`Conversation` / `Message` / `PromptInput` / `Reasoning` / `Response` / `Tool` / `Actions`), build Svelte-native versions under `$lib/components/chat/`.
- **Streaming Markdown:** `beynar/svelte-streamdown` (community Svelte port of Vercel's `streamdown`) handles incomplete tokens during streaming and integrates with Shiki for code blocks. This is the `Response` equivalent.
- **2026 UX consensus** across ChatGPT, Claude, OpenWebUI, LibreChat, Poe, Chatbox:
  1. Sidebar-left for chat history is universal.
  2. Inline quick-settings above the chat is dominant.
  3. Cmd-K command palette is ubiquitous.
  4. Projects/workspaces group related chats (deferred to v2; schema leaves a `projectId` slot).
  5. Branching/forking from any message is table stakes.
- **Storage:** **Dexie.js** is the 2026 consensus for local-first chat persistence (LobeChat, BetterChatGPT post-migration, etc.). `localStorage` is ~5 MB quota; IndexedDB is tens of MB baseline, GB with `navigator.storage.persist()`. Mix layers: localStorage for tiny UI prefs (sidebar width, active chat id), Dexie for everything else.
- **Virtualization:** `@tanstack/svelte-virtual` — turn on past ~200 messages.
- **Attachments:** drag-drop everywhere, paste-image from clipboard, file chips with thumb/size/X, preview in Dialog. Client-side extraction via `pdfjs-dist` (PDFs), `mammoth` (docx), native canvas (image thumbs + EXIF strip). Limits: 25 MB/file, 50 MB/message. Images sent as `image_url` content parts when the selected model reports vision capability; PDFs/docx sent as extracted text.

### 6.4 Recommended layout — Option A + escape hatches from B and C

Three layouts were evaluated (full ASCII sketches in the research doc). Winner: **Option A "Sidebar + Single Workspace"** (classic ChatGPT/Claude shape), enhanced with:
- From Option B: `Cmd+K → "Open chat in new tab"` opens a secondary workspace inside a Tabs component for "compare two chats" without the tab-strip discoverability cost.
- From Option C: The right-hand Resizable pane is **collapsible** and holds `ChatSettingsDrawer` (Advanced params + Tools picker + MCP panel). Default collapsed — users who want the three-pane inspector drag it open.

Layout skeleton:

```
<Sidebar.Provider>
  <ChatSidebar />                     // left: list + new-chat button + search
  <Resizable.PaneGroup>
    <Resizable.Pane>
      <ChatWorkspace chatId={active}>
        <ChatHeader />                //   editable title + actions menu
        <ChatQuickBar />              //   [Model▾] [T 0.7▾] [System▾] [🔧N▾] [📎0] [⚙Adv]
        <MessageList />               //   virtualized, role-aware
        <Composer />                  //   textarea + attachments + send/stop
      </ChatWorkspace>
    </Resizable.Pane>
    <Resizable.Handle />
    <Resizable.Pane collapsible>
      <ChatSettingsDrawer />          //   Advanced params + Tools + MCP panel
    </Resizable.Pane>
  </Resizable.PaneGroup>
</Sidebar.Provider>
```

Route: `app/src/routes/chat/+page.svelte` (singular — chat id in state, not URL path, for instant switching). Optional `?id=<chatId>` for deep links.

### 6.5 Component tree (under `app/src/lib/components/chat/`)

Full tree in the research doc; highlights:

- `sidebar/` — ChatSidebar, ChatList, ChatItem, NewChatButton, ChatSearch
- `workspace/` — ChatWorkspace, ChatHeader, ChatQuickBar, EmptyChat, BranchBanner
- `messages/` — MessageList, Message, MessageUser, MessageAssistant (streams via `svelte-streamdown`), MessageTool (collapsible "Called X" card), MessageError, MessageActions, Reasoning (collapsible `<details>`), Attachments
- `composer/` — Composer, ComposerToolbar, AttachmentDropzone (window-level), AttachmentChips, AttachmentPreviewDialog, StopButton
- `settings/` — QuickSettingsPopover, SystemPromptEditor, ToolsPicker (162 transformers with toggle), AdvancedParamsDrawer, McpPanel (hook — see sub-project 4)
- `tools/` — transformerTools.ts (adapter), toolDispatch.ts, ToolCallCard.svelte
- `palette/` — ChatCommandPalette.svelte (Cmd-K)
- `shared/` — MarkdownMessage (wraps `svelte-streamdown` + Shiki), CopyButton, StreamIndicator

### 6.6 Svelte 5 state model

Three tiers:

1. **Per-chat reactive store** (`$lib/chat/stores/chat.svelte.ts`): factory `createChatState(chatId)` returning rune-backed `messages`, `draft`, `streaming` (AbortController), `attachments`, `settings`, with `$derived` `tokenEstimate` / `canSend`, and `$effect` persisting to Dexie.
2. **Global chat index** (`$lib/chat/stores/chats.svelte.ts`): `activeChatId`, `chatMeta[]` hydrated from Dexie on mount via live-query subscription — tab A edits propagate to tab B.
3. **UI prefs** (existing `createPersistedState`): sidebar width/collapsed, last active chat id, default model, default system prompt. These stay in `localStorage` — they're <1 KB.

### 6.7 Transformers-as-tools

Each chat carries `settings.enabledToolIds: Set<string>`. Adapter in `$lib/components/chat/tools/transformerTools.ts` emits OpenAI-style function-tool specs from the transformer registry:

```ts
export function toToolSpec(t: Transformer): ToolSpec {
  return {
    type: 'function',
    function: {
      name: slugify(t.name),  // "Base 64" → "base_64"
      description: t.description ?? t.name,
      parameters: {
        type: 'object',
        properties: {
          text:    { type: 'string', description: 'Input text' },
          reverse: { type: 'boolean', description: 'Decode (default false)' },
          ...paramsFromOptions(t.configurableOptions)
        },
        required: ['text']
      }
    }
  };
}
```

Execution runs **entirely in the browser** — no network for tool dispatch, faithful to Cryptex's local-first promise. Two meta-tools added that don't map to transformers: `auto_decode` (wraps the universal decoder) and `list_transformers` (returns the registry for model discovery).

Loop: max 8 tool calls per user turn (configurable in AdvancedParamsDrawer) to prevent runaway.

### 6.8 Dexie schema

Tables: `chats`, `messages`, `attachments`. Full TypeScript shape in the research doc. Key choices:
- Compound index `[chatId+createdAt]` for ordered message loads.
- Soft delete via `archivedAt` (undo-friendly).
- `parentId` on messages for branching.
- `attachments.blob: Blob` — IndexedDB handles blobs natively; no base64 serialization needed until export.

Quota handling: `navigator.storage.persist()` on first save. On `QuotaExceededError`: prompt archive + offer export. Settings page "Storage" panel shows `navigator.storage.estimate()` usage + export-all / clear-archive / clear-everything buttons. Export format: single JSON `{chats, messages, attachments[as b64]}`.

### 6.9 Streaming

Teach `openrouter.ts` (or new `gateway.streamChat()` — sub-project 1) to stream:
- Transport: `response.body.getReader()` + ~40-line SSE frame parser. No new dep.
- Reactivity: each message holds `content = $state('')`; stream deltas mutate it. Svelte 5 handles reconciliation.
- Autoscroll: `$effect` on message length + `scrollIntoView` with pin-to-bottom guard (stop if user scrolled >200 px up).

### 6.10 Keyboard + a11y

Shortcut stack (full table in research doc):
`Cmd+K` palette, `Cmd+N` new chat, `Cmd+/` focus composer, `Cmd+Enter` send, `Shift+Enter` newline, `Cmd+[` / `Cmd+]` prev/next chat, `Cmd+Shift+\` toggle sidebar, `Cmd+,` settings drawer, `Cmd+U` attach, `Esc` stop/close, `Cmd+Shift+T` reopen last closed, `Cmd+Shift+F` search within chat, `Alt+↑/↓` cycle past prompts.

A11y: `role="log"` + `aria-live="polite"` on message list, `aria-busy="true"` on streaming bubble, hidden role/timestamp labels per message, tool cards `aria-expanded`, `prefers-reduced-motion` cuts streaming animation.

### 6.11 Dependencies to add

```json
"dexie": "^4.x",
"svelte-streamdown": "^latest",
"shiki": "^1.x",
"@tanstack/svelte-virtual": "^3.x",
"pdfjs-dist": "^4.x",
"mammoth": "^1.x"
```

Plus `shadcn-svelte` CLI run to generate `$lib/components/ui/*` for Button/Input/Textarea/Sheet/Sidebar/Tabs/Resizable/ScrollArea/Command/Dialog/DropdownMenu/Popover/Tooltip/Separator/Badge/Kbd/Sonner/Skeleton/Avatar.

### 6.12 Definition of done

- [ ] `shadcn-svelte` CLI run; all needed primitives generated and theme matches
- [ ] New route `/chat` shows Option A layout with resizable right inspector
- [ ] Create, rename, archive, delete, branch, export chat all work
- [ ] Multi-chat: active chat id in state, instant switching via sidebar + Cmd+[/]
- [ ] Quick-settings popover: model, temperature, system prompt inline editor, tools picker, attachments counter
- [ ] Advanced params drawer: top-p, max tokens, frequency/presence penalties, max tool calls
- [ ] Composer: autosize textarea, drag-drop/paste/click attach, file chips with preview dialog, stop button during streaming
- [ ] Streaming Markdown + Shiki code blocks via `svelte-streamdown`
- [ ] Message list virtualized past 200 messages
- [ ] All 162 transformers available as tools via tools picker; tool call cards render with expand
- [ ] Cmd-K palette with shortcut help
- [ ] `role="log"` / `aria-live` etc. a11y requirements met
- [ ] Dexie storage with live queries; multi-tab edits propagate
- [ ] Storage panel in Settings with usage + export / clear buttons

### 6.13 Risks

- **Dexie schema churn.** We almost certainly get the schema wrong on v1. Ship behind `db.version(N)` with upgrade scripts from day one.
- **Streaming + tool-call interleaving.** Tool calls arrive as SSE events alongside text deltas; the parser needs to split them cleanly. Test with real OpenRouter streams early.
- **Attachment quota.** Chrome's persistent-storage grant is heuristic. Document that unclaimed attachments can disappear under storage pressure.
- **Quick-settings popover vs composer focus.** Popovers dismissing on outside click will dismiss when the user clicks the composer. Use `bits-ui` modal behavior + explicit "Apply" close.

---

## 7. Sub-project 4 — MCP browser integration

**Source research:** `.planning/research/brainstorm-mcp.md` (351 lines).

### 7.1 Problem

Users want to connect arbitrary MCP servers from inside Cryptex and expose their tools to the chat — without Cryptex running any backend.

### 7.2 Key findings

- **MCP spec as of April 2026:** 2025-11-25 is current stable. 2026 roadmap: no new transports this cycle. Combined TS + Python SDKs at 97 M monthly downloads — effective industry standard.
- **Transports:** stdio (browser-unreachable — subprocess), HTTP+SSE (deprecated since 2025-03-26), **Streamable HTTP** (recommended — single endpoint, POST for client→server, SSE upgrade for server→client), WebSocket (SEP-1288 proposed, not standard).
- **Browser reachability: Streamable HTTP only.** Every other transport is either dead or impossible from a static SPA. Clear "connect via desktop client" error messaging for `stdio://` inputs.
- **Client library:** `@modelcontextprotocol/sdk` client half is browser-usable but needs Vite `optimizeDeps.include` + `resolve.alias` due to known ESM/CJS quirks (issues #217, #460). Hand-measured ~120–160 KB min+gz with only Streamable HTTP transport. Cloudflare's `use-mcp` (React hook, archived 2026-02-06) has the best reference for "what does a browser MCP client actually need to do"; we port ~600 LOC of its transport/OAuth core if SDK bloat bites.
- **Auth:** 2025-11-25 made **PKCE mandatory**. Three flows to support:
  1. **No-auth** (demo / LAN servers): just `POST /mcp`.
  2. **API-key header**: user-supplied `Authorization: Bearer` or `X-API-Key`.
  3. **OAuth 2.1 + PKCE**: with **Client ID Metadata Documents (CIMD)** as the natural primary fit — Cryptex has a static HTTPS origin, we host `/oauth/client-metadata.json` with `client_id` equal to that URL. Fallback to Dynamic Client Registration (DCR). **GitHub and some other big names reject DCR entirely** — UI must accept manually-pasted static `client_id`.
- **CORS reality:** Notion, Cloudflare-managed, GitHub, Atlassian Rovo, Mistral ship full CORS. FastMCP and Spring AI MCP default to CORS off. Community Vercel/Workers servers wildly inconsistent. Honest path: staged "Test connection" probe (transport / PRM / AS / token / tools/list) with step-by-step error reporting. **Never silently proxy** — public CORS proxies MITM auth tokens.
- **Security threats (OWASP MCP Top 10 beta + 2026 advisories):** tool-poisoning via descriptions, rug pulls, tool shadowing, tool-call exfiltration, covert tool invocation via `listChanged`, token exfil through argument channels, sampling-driven prompt injection.

### 7.3 Recommended architecture

Per-server config in localStorage under `cryptex.mcp.servers`:

```ts
interface McpServerConfig {
  id: string;           // uuid
  nickname: string;
  url: string;          // https://.../mcp
  auth: { kind: 'none' } | { kind: 'header'; name: string; value: string } |
        { kind: 'oauth'; clientId?: string; scopes?: string[] };
  enabled: boolean;
  toolAllowlist?: string[];    // null = all; [] = none; [names] = those
  confirmByDefault: boolean;   // default true
  lastStatus?: 'ok' | 'auth_required' | 'cors' | 'unreachable' | 'error';
  lastCheckedAt?: number;
}
```

Settings UI: new "MCP servers" sub-section under OpenRouter key block. Per-server rows show status dot + last-checked timestamp + URL + Test / Edit / Remove / Tools… buttons. Add flow is 3 screens: URL + nickname → auto-probe → tool list with allowlist checkboxes.

Global chat-header "MCP: 2 servers, 7 tools active" toggle to temporarily disable all.

### 7.4 MCP tools → gateway tools bridging

1. **Session bootstrap**: on chat open, `tools/list` each enabled server, cache 10 min, invalidate on `notifications/tools/list_changed`.
2. **Schema conversion**: MCP tools are JSON Schema Draft 2020-12; OpenAI/OpenRouter wants `{type: "function", function: {name, description, parameters}}`. Namespace collisions → `mcp_<serverId>__<toolName>`. Strip unsupported JSON Schema features (`if/then/else` rejected; `$defs`, `format: "date-time"` kept). Mastra's tool-compat layer crosswalk (dropped error rates 15 % → 3 %) worth cribbing.
3. **Call dispatch**: model emits `tool_calls` → parse namespaced name → look up `{serverId, toolName}` → show confirm dialog if enabled → `tools/call` on MCP client → flatten `CallToolResult.content[]` to provider tool-result shape.
4. **Streaming**: v1 blocks and returns final result; v2 surfaces SSE progress events as typing indicator.
5. **Elicitation**: render modal form from JSON Schema (reuse shadcn-svelte form components), post response. Cancel = tool error.
6. **Sampling** (server-initiated LLM calls): **v1 hard-rejects** — biggest prompt-injection vector. v2 opt-in per-server with tight spend cap.

### 7.5 Unified tool gateway

New module `app/src/lib/tools/gateway.ts` merges three tool sources the LLM sees as one flat list:
1. **Cryptex transformers** — `cryptex__<category>__<name>`. Always available, zero network, no confirm ever (can't leave the tab).
2. **MCP servers** — `mcp_<serverId>__<name>`. Per-server confirm policy applies.
3. **Built-in chat tools** — e.g., "open fuzzer with X", "run decode on Y".

**Transformer-first resolution** — if an MCP server duplicates a transformer's capability (remote base64 tool), the local one wins. User sees grouped-by-source list; LLM sees a flat list.

### 7.6 Security controls (must ship v1)

1. **Per-server tool allowlist** — LLM only sees ticked tools. Default: unknown servers → all unticked.
2. **Confirm-before-call** — first call per tool per session requires one-click with full args pretty-printed. Destructive names (write/create/delete/send) always confirm.
3. **Description sanity check** — flag suspicious patterns (`<!--`, "ignore previous", "system:", newline-heavy) with warning badge in tool list. User decides; we don't silently strip.
4. **Origin isolation** — MCP code runs from same origin; no proxy through anything we control.
5. **No cross-tool data flow** by default — tool responses don't auto-feed another tool on a different server.
6. **Rate limit** — max N tool calls/60 s/server; max M total/conversation. Trip to manual-approval on burst.
7. **Per-server kill switch** — "Disconnect" button in chat header when MCP tool active.
8. **Scope minimization on OAuth** — only the scopes the server's `WWW-Authenticate` challenges. Never blanket scopes.
9. **`mcp-scan`-style signature regex** port from Invariant Labs for pre-connect static check.
10. **Live data-boundary header** — "Your message will be sent to: OpenRouter (model), GitHub MCP (tools list, tool calls), and nowhere else."

### 7.7 Implementation phases (M1–M6)

- **M1** — Settings UI (read-only list, add/remove, test-connection stub).
- **M2** — Streamable HTTP client in `lib/mcp/`. No-auth + header-auth. Tool listing + calling wired into chat as `mcp_*` functions.
- **M3** — OAuth 2.1 + PKCE + CIMD. Host `/oauth/client-metadata.json`. Popup callback at `/oauth/callback`; fallback to full redirect.
- **M4** — Allowlist UI + confirm-before-call + description sanity check + rate limit.
- **M5** — Unified tool gateway (§7.5) merging transformers + MCP + built-in.
- **M6** — Elicitation modals; `sampling` still rejected by default.

Total: ~1500–2500 LOC client-side + one static JSON file.

### 7.8 Definition of done

- [ ] Streamable HTTP client working against Notion, Cloudflare catalog, or a self-hosted FastMCP with CORS
- [ ] OAuth 2.1 + PKCE + CIMD end-to-end flow verified against a real remote server
- [ ] Pre-registered static `client_id` path working (for GitHub-class servers rejecting DCR)
- [ ] Test-connection button shows staged per-step results
- [ ] Per-server allowlist + confirm-before-call dialogs
- [ ] Rate-limit + kill switch
- [ ] Transformer-first unified tool gateway
- [ ] Documented threat model + user-facing "your data goes to X, Y, Z" header
- [ ] Elicitation modal renders a JSON-schema form; sampling rejected with clear error

### 7.9 Risks

- **CORS rejection storm.** Users will paste URLs that fail CORS. Messaging must be brutally honest and link to "how to add CORS to your MCP server" docs.
- **OAuth callback hijack.** Full-redirect callback loses unsaved chat state. Popup path must gracefully fall back without data loss.
- **Token refresh races.** SPAs should treat refresh tokens as short-lived + rotated. Coordinate across tabs via BroadcastChannel or Dexie live queries.
- **SDK bundle creep.** Budget 120–160 KB gz for the MCP path; if it exceeds, port `use-mcp` core as Option B.

---

## 8. Sub-project 5 — WebGPU local models

**Source research:** `.planning/research/brainstorm-webgpu.md` (610 lines).

### 8.1 Problem

Run LLMs locally in the browser via WebGPU so users get an "offline, private, no-token-cost" provider — same chat UI, same gateway, just a different adapter.

### 8.2 Key findings

- **WebGPU coverage April 2026: ~80% of users.** Chrome/Edge 113+ on by default (desktop all platforms; Android 121+ on Qualcomm/ARM; Linux still needs `--enable-unsafe-webgpu` on most distros). Firefox 141+ on Windows + macOS Apple Silicon. **Safari 26 / iOS 26 / iPadOS 26 ship WebGPU default-on** — first iOS release to do so, with aggressive per-origin memory ceilings (~1 GB on iPhone). Remaining ~20%: Linux Chrome without flag, older Android, Linux Firefox, embedded browsers.
- **Runtime pick: `@mlc-ai/web-llm` primary, `@wllama/wllama` fallback.**
  - WebLLM ships a **native OpenAI Chat Completions surface** (`engine.chat.completions.create()` — `stream`, `json_mode`, `response_format`, `logit_bias`, `seed`, preliminary `tools`/`tool_choice`, grammar via XGrammar). Adapter is trivial. WebWorkerMLCEngine + ServiceWorkerMLCEngine variants keep inference off the UI thread.
  - Prebuilt model zoo: Llama 3/3.2/3.3/4, Phi 3/3.5/4, Gemma 2/3, Qwen 2/2.5, Mistral, Hermes-2-Pro, SmolLM/SmolLM2 — no conversion step.
  - Wllama covers CPU-only (WebGL GPU path planned but not WebGPU yet) for the no-WebGPU tier. Needs COOP/COEP for SharedArrayBuffer.
- **Skipped runtimes:**
  - **Transformers.js v4** — great model variety + ONNX, but no native OpenAI shape; more glue code. Keep in back pocket for local **embeddings / ASR / TTS**.
  - **ONNX Runtime Web** — too low-level, you write your own generation loop.
  - **Candle-wasm** / **Burn** — niche, rougher WebGPU, smaller zoo.
- **Weight caching:** Cache API today (WebLLM default, keyed by model URL + shard hash). **OPFS migration when WebLLM issue #660 lands** — OPFS has stream-based reads, no deserialization cost on load; IndexedDB avoided for large weights (serialization cost). Quota check via `navigator.storage.estimate()` before offering download; `navigator.storage.persist()` on confirm. 1.3 GB model cold load measured ~23 s OPFS vs comparable Cache API vs painful IndexedDB.

### 8.3 Model shortlist (April 2026 realistic tiers)

Full perf table in the research doc across M-series / RTX / iGPU / Android / iOS. Summary:

| Tier | Model | Download | VRAM | Target users |
|---|---|---|---|---|
| **Tiny** | `SmolLM2-360M-Instruct-q4f16_1-MLC` | 230 MB | ~500 MB | Default on mobile / first visit |
| **Tiny** | `Llama-3.2-1B-Instruct-q4f16_1-MLC` | 750 MB | ~1.1 GB | Minimum viable conversation |
| **Balanced** | `Llama-3.2-3B-Instruct-q4f16_1-MLC` | 2.0 GB | ~2.7 GB | **Recommended default on desktop** |
| **Balanced** | `Phi-3.5-mini-instruct-q4f16_1-MLC` | 2.3 GB | ~3.0 GB | Quality/size sweet spot |
| **Power** | `Qwen2.5-7B-Instruct-q4f16_1-MLC` | 4.6 GB | ~5.8 GB | Power users, opt-in only |

iOS caps at Tiny tier only (per-origin ~1 GB quota). Android Snapdragon 8 Gen 3+ reaches Balanced on good days.

tok/s honesty (rounded, conservative):
- Apple M2/M3/M4 — Balanced 35–110 tok/s; Power 15–60 tok/s.
- RTX 4060 — Balanced 45–60 tok/s; Power 25–35 tok/s.
- RTX 4090 — Balanced 130+ tok/s; Power 75+ tok/s.
- Integrated iGPU (Intel Arc / AMD 780M/890M) — Tiny 35–70 tok/s; Balanced 12–25 tok/s.

### 8.4 Provider-adapter shape

New module `app/src/lib/ai/local.ts` mirrors the gateway's provider interface:

```ts
export async function isAvailable(): Promise<boolean>; // navigator.gpu + adapter.requestDevice probe
export async function loadModel(id, onProgress?, signal?): Promise<void>;
export async function unloadModel(): Promise<void>;
export async function chat(req: ChatRequest): Promise<ChatResponse>;
export async function* chatStream(req: ChatRequest): AsyncGenerator<string>;
export class LocalError extends Error { category: 'no_webgpu'|'no_model'|'load_failed'|'oom'|'aborted'|'api' }
export const LOCAL_MODELS = [/* 5 prebuilt tiers */] as const;
```

Plugs into `gateway.ts` as provider id `local`:

```ts
export async function chat(providerId: ProviderId, req: ChatRequest): Promise<ChatResponse> {
  if (providerId === 'local') return local.chat(req);
  return openrouter.chat(req);
}
```

The chat UI imports only from `gateway.ts`. It never knows whether the model is local or remote.

### 8.5 First-run UX

Principles: no surprise multi-GB downloads; honest progress; cancellable; resumable; clearable.

```
User opens chat → gateway probes isAvailable()
  └── WebGPU OK → show provider segmented: (•) OpenRouter  ( ) Local
  └── No WebGPU → hide Local segment, tooltip explains

Click Local (first time):
  Modal: "Run models on your device"
    - Explainer: one-time download, offline after
    - Tier pick: Tiny / Balanced / Power (sizes shown, disk-free checked)
    - Quota check (navigator.storage.estimate): green ✓ or red ✗
    - [ Cancel ] [ Download and load ]

Progress:
  ● Fetching weights — shard 5 of 18 (1.1/4.0 GB, 12 MB/s, ETA 4m)
  ○ Compiling WGSL kernels
  ○ Warming up
  [ Cancel ]

Once loaded:
  Small badge next to send: "Local · Llama 3.2 3B · 42 tok/s"
  (click to open model picker)
```

Settings "Local models" panel: currently loaded / unload button, cached models list (each with size + delete), clear-all button, tips.

Interrupt: wire `engine.interruptGenerate()` into the existing Stop button.

### 8.6 Dependencies to add

```json
"@mlc-ai/web-llm": "^0.2.8x",
"@wllama/wllama": "^latest"   // fallback only, lazy-loaded
```

### 8.7 Security + privacy

- **GPU fingerprinting.** `adapter.requestAdapterInfo()` exposes GPU model + driver without running a shader. Disclose: _"Local models use WebGPU, which exposes your GPU model and driver version to this page. Your prompts and responses never leave your device."_
- **2025–2026 CVEs.** CVE-2026-5281 (Chromium Dawn UAF, CISA KEV), CVE-2025-12725 (WebGPU bounds-check). Browser-level — keep Chrome current; nothing we code around.
- **Side channels.** WebGPU-SPY (arXiv 2401.04349) and GPUBreach (April 2026) demonstrate real side-channel attacks from malicious WebGPU shaders. Mitigations at browser level, not app. Users concerned should not enable WebGPU on untrusted origins.
- **COOP/COEP.** WebLLM works without; **wllama needs** `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` for its pthread path. Traefik labels change, no code change.
- **CSP additions:** `connect-src` → `huggingface.co` + `cdn-lfs.huggingface.co` (WebLLM weight CDN). `script-src` → `'wasm-unsafe-eval'`.

### 8.8 Memory management

- **Tab backgrounding** throttles WebGPU; detect `document.visibilityState === 'hidden'` during generation and show "Paused — reactivate tab to continue."
- **`GPUDevice.lost`** fires when OS reclaims GPU memory. Null the engine; offer one-click "Reload model."
- **SPA route unmount**: `onDestroy` must call `unloadModel()` — otherwise GPU buffers leak.
- **Benchmark on first load**: record 50-token tok/s into localStorage. Pre-populate the badge next session. If tok/s < 5 for 5 s straight, surface toast: "Your device is slow for this model. Try Tiny, or use OpenRouter."

### 8.9 Definition of done

- [ ] `local.ts` adapter mirrors full gateway provider shape
- [ ] `isAvailable()` detection works across Chrome/Firefox/Safari, with correct negative-detection in Linux-Chrome-no-flag
- [ ] Download progress accurate per shard; cancel stops mid-download and resumes next try
- [ ] Three tiers loadable on real hardware (M-series Mac, RTX laptop, Snapdragon Android)
- [ ] Structured output via `response_format: json_schema` demonstrated on WebLLM
- [ ] Stop button interrupts generation
- [ ] Storage panel in Settings shows cached models + delete
- [ ] tok/s benchmark recorded + pre-populated
- [ ] GPU leak test passed — `chrome://gpu-internals` confirms no pinned buffers after unload
- [ ] `COOP/COEP` headers on Dokploy deploy if wllama fallback ships
- [ ] CSP updated for `huggingface.co` + `cdn-lfs.huggingface.co`

### 8.10 Risks

- **Consumer GPU variance.** Benchmarks vary 3–4× across "Balanced" tier on mid-range hardware. Set expectations honestly in UI.
- **iOS 1 GB quota.** Cap picker to Tiny tier on iOS. Silent-fail downloads past quota are a known iOS WebKit behavior.
- **WebLLM OPFS pending.** Cache API works but loads are 10–15% slower. Plan migration when issue #660 lands.
- **Tool calling "preliminary."** MLC themselves mark it preliminary — for Cryptex's chat-tool integration, test each model's tool compliance and fall back to manual-prompted XML if a given model struggles.

---

## 9. Cross-cutting concerns

### 9.1 Shared types & modules

After all five sub-projects, Cryptex should have these modules in `app/src/lib/`:

```
ai/
  gateway.ts              ← central chat()/streamChat()/fetchModels()/validateKey()
  prompt-scaffold.ts      ← unwrap() + tuneParams()
  providers.svelte.ts     ← reactive multi-provider registry
  models.svelte.ts        ← multi-provider catalog aggregation
  local.ts                ← WebGPU provider (WebLLM + wllama fallback)
  adapters/
    openrouter.ts
    anthropic.ts
    openai-compat.ts
  types.ts                ← ChatMessage / ChatRequest / ChatResponse / StreamEvent / Model / Usage / GatewayError
tools/
  gateway.ts              ← unified tool list (transformers + MCP + built-in)
  transformer-tools.ts    ← 162-transformer → tool-spec adapter
  mcp-tools.ts            ← MCP → tool-spec adapter
chat/
  db.ts                   ← Dexie schema + instance
  stores/
    chat.svelte.ts        ← per-chat factory
    chats.svelte.ts       ← global index + live queries
  (components under components/chat/ — see §6.5)
mcp/
  client.ts               ← Streamable HTTP client
  oauth.ts                ← PKCE + CIMD + DCR flows
  servers.svelte.ts       ← persisted server registry
```

### 9.2 Migration strategy (Vue → SvelteKit)

All five sub-projects target the SvelteKit (`app/`) side. The legacy Vue side (`js/`, `css/`, `templates/`, `build/`) stays frozen — no new features added. Prompt rewrites (#2) should be **applied to both sides** during the transition window (the two ports have already drifted — `anticlassifierPrompt.js` 116 lines vs `anticlassifier/prompt.ts` 56 lines). Use a single canonical source: `app/src/lib/ai/prompts/` ships the new XML-structured prompts, and the legacy Vue build imports them via a build-time copy if needed.

### 9.3 Testing strategy per sub-project

- **Gateway (#1)**: API-compat tests — identical `chat()` calls produce identical responses against OpenRouter through the facade. Snapshot tests across each provider adapter.
- **Prompts (#2)**: fixture-based regression tests. Pick 5 representative inputs per strategy, hash the output against snapshots, allow small diffs (temperature > 0). Run across one model per family; fail only on catastrophic deviation (empty output, preamble leak past `unwrap()`, JSON schema violation).
- **Chat UI (#3)**: component tests via `@testing-library/svelte`. Playwright E2E for create/send/attach/branch/export. Visual regression via Chromatic or Playwright screenshot diff on key states.
- **MCP (#4)**: integration tests against a pinned `fastmcp`-based local test server (spun up in CI via docker-compose). OAuth flow tested with a mock AS (e.g., `keycloak` in a test container).
- **WebGPU (#5)**: unit tests for the adapter module (mocked engine); E2E on a WebGPU-capable runner (GitHub Actions' Linux runner has no GPU — use a self-hosted runner or skip live inference tests, rely on manual pre-release verification).

### 9.4 Documentation updates needed

- `CLAUDE.md` — add sections on gateway module, chat route, MCP settings, WebGPU provider.
- `DEPLOY.md` — COOP/COEP headers if wllama ships; CSP `connect-src` list; static `oauth/client-metadata.json` location.
- `README.md` — transformer catalog unchanged; add chat playground + BYOK multi-provider + MCP + local models as headline features.

### 9.5 Telemetry / analytics posture

Unchanged. Cryptex is no-telemetry by default (Plausible on Guide page only, already behind `consent.svelte.ts`). The chat playground must **not** add any analytics. Prompt/response content never leaves the browser except to the chosen provider.

---

## 10. Bundle / performance budget

Target: the AI-route critical path stays under a combined +200 KB gzipped vs today.

| Addition | gzipped | After tree-shake | Lazy-loadable? |
|---|---|---|---|
| **Gateway (#1)** — `ai` + `@openrouter/ai-sdk-provider` baseline | ~73 KB | ~30 KB | Yes (per-route) |
| + `@ai-sdk/anthropic` | +10 KB | +8 KB | Yes (only when Anthropic selected) |
| + `@ai-sdk/openai-compatible` | +5 KB | +4 KB | Yes (only when compat endpoint added) |
| **Prompts (#2)** | ~0 KB | ~0 KB | — (content only) |
| **Chat UI (#3)** — `dexie` + `svelte-streamdown` + `shiki` + `@tanstack/svelte-virtual` + `pdfjs-dist` (lazy) + `mammoth` (lazy) | ~60 KB (shell) + ~500 KB lazy | ~45 KB shell | Yes for pdfjs/mammoth/shiki-languages |
| **MCP (#4)** — `@modelcontextprotocol/sdk` Streamable HTTP only | ~120–160 KB | ~80 KB | Yes (behind Settings tab) |
| **WebGPU (#5)** — `@mlc-ai/web-llm` | ~800 KB engine + multi-GB weights | engine served as a separate chunk | Yes (only when "Local" provider selected) |

**Critical path today (AI routes): ~4 KB** (hand-rolled `openrouter.ts`).
**Critical path after #1 + #2: ~34 KB gzipped** (+30 KB).
**Critical path after #3 (chat route): ~80 KB gzipped** (+46 KB, keeping MCP and WebGPU off-route).
**/settings route after #4: +80 KB gzipped** lazy chunk.
**/chat route when Local selected: +800 KB gzipped** lazy chunk.

Acceptable for a 5 MB dist that already ships 162 transformer files. Worth confirming with a bundle analyzer (`rollup-plugin-visualizer` or `vite-bundle-visualizer`) at the end of #1.

**Perf SLOs** worth holding:
- First-byte to interactive on /chat route with existing chat loaded: <2 s on good connection.
- Keystroke → character in composer: <16 ms (one frame).
- Message streaming: no frame drops at 50 tok/s.
- Virtualized list scroll at 1000 messages: 60 fps.

---

## 11. Security posture — consolidated checklist

Combining findings across all five sub-projects:

### 11.1 Content Security Policy (response header, configured in Dokploy/Traefik)

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
  https://api.deepinfra.com
  https://huggingface.co
  https://cdn-lfs.huggingface.co
  <user-configured openai-compat endpoints>
  <user-configured MCP server URLs>;
img-src 'self' data: blob:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
require-trusted-types-for 'script';
```

The `connect-src` list grows as the user adds providers / MCP servers — must be regenerated from the `cryptex.providers` + `cryptex.mcp.servers` registry and injected at build time or via a runtime meta-CSP.

### 11.2 BYOK key storage

- **Default**: `localStorage` plaintext. Documented XSS caveat.
- **Opt-in**: WebCrypto AES-GCM + PBKDF2-SHA512 (1M iterations, 32-byte salt, fresh 12-byte IV per encrypt, non-extractable CryptoKey in memory). Passphrase prompt on app load.
- **Never**: OPFS for keys (same origin, same XSS surface, no upside).

### 11.3 XSS hardening

- Audit `{@html}` usage in `app/src/` before each release; target zero uses.
- `require-trusted-types-for 'script'` CSP directive fails loudly on any future unsafe DOM sink.
- All rendered user input (session log, model names, chat content) goes through text nodes — never innerHTML.

### 11.4 MCP tool safety

Per §7.6 — allowlist, confirm-before-call, description sanity check, rate limit, per-server kill switch, scope minimization, `mcp-scan` signature regex, live data-boundary header, sampling rejected by default.

### 11.5 WebGPU fingerprinting disclosure

Per §8.7 — explicit user disclosure when the Local provider is first enabled.

### 11.6 Supply chain

- Pin exact versions for `@ai-sdk/*`, `@openrouter/ai-sdk-provider`, `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`, `@mlc-ai/web-llm`.
- `npm audit` in `.github/workflows/deploy.yml`, fail on high severity.
- `"resolutions"` for transitive `openai` / `@anthropic-ai/sdk` where adapters hoist them.
- SRI for any third-party CDN script tags (AdSense excepted — no stable hash; isolate to Guide/About routes as today).

---

## 12. Risk register

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Direct OpenAI / Gemini CORS blocked | Medium — users ask for it repeatedly | Certain | Documented "use OpenRouter" path; ship with clarity |
| 2 | Anthropic SDK browser detection regression | High — breaks Anthropic-direct | Medium (history) | Pin exact version, smoke-test on upgrade |
| 3 | Dexie schema churn v1→v2 | Medium — user data migration | High | `db.version(N)` + upgrade scripts from day one |
| 4 | MCP server CORS failure storm | Medium — adds user friction | High | Staged test-connection, honest error messages, docs link |
| 5 | WebGPU tok/s disappoints on mid-range hardware | Low — user expectation | Medium | Live tok/s badge, "try Tiny" toast when <5 tok/s |
| 6 | WebLLM tool-calling still preliminary | Medium — limits local-chat tool use | Medium | Fall back to manual-prompted XML tool schemas per-model |
| 7 | Bundle size regression on /chat | Medium — TTI slip | Medium | Lazy-load providers, adapters, pdfjs, mammoth, WebLLM engine |
| 8 | BYOK key exfil via XSS | Very high | Low (static site, no dynamic content) | CSP + no `{@html}` + trusted-types + opt-in passphrase encryption |
| 9 | MCP tool poisoning | High | Medium | Allowlist, confirm-before-call, sanity regex, scope minimization |
| 10 | Dokploy CSP/COOP/COEP header mismatch with static deploy | Medium — breaks wllama or WebGPU | Low | Test header paths early; Traefik labels rather than code |
| 11 | Prompt regression on small models post-rewrite | Medium — quality drop on Gemma/Llama-1B | Medium | Snapshot tests per model family + `unwrap()` fallback |
| 12 | Cache TTL 5m default (Anthropic March 2026) masks caching win | Low — we ship anyway | Certain | Pass `ttl: "1h"` explicitly on long prompts |

---

## 13. What this plan deliberately leaves out

To keep each sub-project shippable:

- **Direct OpenAI key support via proxy.** Would require Cryptex to run server code. Not in scope.
- **Multi-user / account sync.** Pure BYOK + local-first. No accounts, no sync. Users who want cross-device sync export JSON and import.
- **Voice input / output / TTS in chat.** Nice to have — Transformers.js ships Whisper & Chatterbox; defer to a post-v1 feature.
- **Embeddings / vector search for chat memory.** Not in scope v1. If added later, Transformers.js + a local IndexedDB vector index (e.g., `voy-search-js`).
- **Image generation.** Anti-Classifier improves against image filters; we don't host image generation ourselves.
- **Chat projects / folders.** Schema leaves `projectId` slot; UI ships in v2.
- **Branching diff view.** v1 branches create a new chat linked by `parentId`; v2 visualizes the tree.
- **Server-side logging / analytics.** Never. Cryptex stays no-telemetry.
- **SSO / enterprise features.** Out of scope for a static BYOK tool.
- **MCP sampling (server → LLM).** Hard-rejected in v1 — biggest prompt-injection vector. v2 optional per-server with spend cap.
- **Transformers.js chat backend.** Skipped in favor of WebLLM for the chat path. Reserved for embeddings/ASR/TTS if those features land.

---

## 14. Immediate next steps

Pick **one** of the five sub-projects to enter the proper brainstorming → spec → plan cycle first. Recommendation: **#1 (Gateway) → spec → plan → execute**. It unblocks #3, #4, #5; it is the most load-bearing; and it is independently valuable (multi-provider support is a headline feature on its own).

When ready:

1. Run `/gsd-new-project` (if not already initialized) or `/gsd-add-phase` to create a phase for the gateway.
2. Run `/gsd-plan-phase` with the gateway brief — the research doc `.planning/research/brainstorm-gateway.md` already contains the architecture sketch, TypeScript interfaces, adapter shape, migration path, and bundle estimates.
3. Execute.
4. Ship.
5. Repeat for #2, #3, #4, #5.

Parallel track: **#2 (Prompts) can start immediately** — it doesn't depend on the gateway. Both can be in flight at once without conflict since #2 is pure content and #1 is pure plumbing.

### Artifacts produced by this brainstorm

- `.planning/research/brainstorm-gateway.md` (615 lines) — sub-project 1 research, full TS sketch, citations.
- `.planning/research/brainstorm-prompts.md` (~620 lines) — sub-project 2 research, verbatim current prompts, verbatim proposed rewrites, citations.
- `.planning/research/brainstorm-chat-ui.md` (880 lines) — sub-project 3 research, ASCII layouts, Dexie schema, citations.
- `.planning/research/brainstorm-mcp.md` (351 lines) — sub-project 4 research, OAuth 2.1 + CIMD flow, security model, citations.
- `.planning/research/brainstorm-webgpu.md` (610 lines) — sub-project 5 research, runtime comparison, model perf table, citations.
- `Brainstormed-Plan.md` (this file) — synthesis + dependency graph + build order.

~3400 lines of verified 2026-current research behind this plan.
