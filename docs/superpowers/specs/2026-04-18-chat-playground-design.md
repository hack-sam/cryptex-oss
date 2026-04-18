# Chat Playground + Research Dataset Pipeline — Design Spec

**Date:** 2026-04-18
**Sub-project:** #3 of `Brainstormed-Plan.md`
**Status:** Draft — awaiting user review before plan
**Research basis:** `.planning/research/brainstorm-chat-ui.md`
**Depends on:** Sub-project #1 (BYOK Gateway — shipped at `30ca94e`)

---

## 1. Goal

Ship a chat-first research surface on top of Cryptex that:

1. **Seamlessly blends** with the existing Cryptex aesthetic (glass, Fraunces serif, radial backdrop) and coexists with the current toolbox (Transform / Decode / Emoji / Gibberish / Tokenizer / etc.) behind a single top-level mode switch — Chat vs Tools.
2. **Captures research-grade training data** — every chat turn records model/provider/system prompt/sampling params/thinking trace/tool calls/tokens/latency/tags for offensive-defensive LLM fine-tuning.
3. **Unifies all Cryptex techniques** — 162 transformers, 9 PromptCraft mutators, 9 Anti-Classifier techniques, and new composer modes (Creative / Intelligent / Adaptive) behind one extensible Technique registry.
4. **Architects for future login + multi-user** without shipping auth today. Wiring the seams now so retrofit is a config change.

Success = users can hold a conversation with any configured provider, transform any selected text via any Cryptex technique, persist everything across sessions, and export the whole corpus as ShareGPT JSONL or raw metadata JSONL ready for SFT/DPO.

---

## 2. Non-goals

- Shipping login/user management in v1 (architected but disabled).
- Real-time multi-device sync.
- Server-side chat storage. Everything stays in IndexedDB via Dexie.
- WebGPU local inference (Sub-project #5 adds it later as another gateway provider).
- MCP server integration (Sub-project #4).
- Voice / audio / video I/O.
- Image generation output rendering.
- DPO / RLHF-pair export in v1 (deferred).
- Anthropic / OpenAI / HF-datasets training formats in v1 (deferred — ShareGPT + raw JSONL cover).
- Projects / workspace grouping of chats (deferred — tags handle v1).
- Godmode jailbreak chains (button disabled; architecture in place).
- Retrofitting the legacy Vue app. All work under `app/`.

---

## 3. User decisions locked in brainstorming

| # | Decision | Choice |
|---|---|---|
| 1 | Navigation | **C** — top-level `Chat` / `Tools` mode pill; both persist full state |
| 2 | Export formats | **ShareGPT JSONL + raw metadata JSONL** (v1), Anthropic/OpenAI/HF/DPO deferred |
| 3 | Dataset inspector | **Yes** — in-app `/dataset` route with filters, sort, bulk retag, train/val split, preview |
| 4 | Chat organization | **A+C** — flat sidebar chat list + branch-from-any-message |
| 5 | Tools in chat | **C** — slash commands (deterministic, no LLM cost) AND LLM tool-calling (trains tool-use) |
| 6a | Mode stacking | **A** — one mode at a time (radio) |
| 6b | Raw-vs-sent capture | **B** user's pick; overridden to **both** — keep `contentRaw` AND transformed `content` on user rows. Cost: one string field per user turn. Value: lossless reconstruction of alternative training targets. |
| 6c | Selection panel | **C** — always-visible right sidebar + floating popover on selection |
| 7 | Future auth | Wire seams now; v1 stays BYOK-local |
| — | Layout | Three-pane: chat list (L) / workspace (C) / techniques (R); all resizable; mobile collapses to Sheets |
| — | Default home | Tools mode stays default; `/chat` is the new route |
| — | Godmode v1 | Button disabled + tooltip; `jailbreakSequence()` pipeline scaffolded and covered by a no-op stub |
| — | Modes implementation | **Local templates** (no sub-LLM call); deterministic prefix/suffix wrappers |
| — | Long-chat cost | Anthropic `cache_control: {type:'ephemeral'}` on system + history when provider is Anthropic; OpenAI implicit caching free |
| — | Max tool iterations | 4 (configurable per chat) |
| — | Tool-state migration | Phased: tools keep localStorage authoritative; Dexie mirror added lazily on first Chat visit |

---

## 4. Top-level layout & routing

### 4.1 Mode switch

A two-value pill group added to `HeaderBar.svelte` (right side, next to theme + settings icons):

```
[ Chat ][ Tools ]
```

Tools is the default so existing users land on the app they know. The pill persists the user's choice under `cryptex.ui.mode` (device-local, non-synced). Clicking swaps the main content area; state on both sides survives the swap.

### 4.2 Routes

| Route | Surface | Mode auto-set |
|---|---|---|
| `/` | Existing home (Tools — currently the bijection/generic landing) | Tools |
| `/chat` | Chat playground; opens last-active chat id or New Chat | Chat |
| `/chat/:id` | Deep-link to a specific chat | Chat |
| `/dataset` | Dataset Inspector (table + filters + preview + export) | Chat |
| `/settings` | Existing Settings | (preserves mode) |
| `/promptcraft`, `/anticlassifier`, `/translate`, `/decode`, `/emoji`, `/gibberish`, `/tokenizer`, `/transform`, `/bijection`, `/fuzzer`, `/splitter`, `/tokenade` | Existing tool pages — fully preserved | Tools |

Routing is SPA; mode pill auto-syncs on navigation. Old deep-links never 404. All existing tool routes are untouched.

### 4.3 Chat-mode three-pane layout

```
HeaderBar · right-side pill: [ Chat ][ Tools ]  ⚙  ☀

┌───────────┬───────────────────────────────────────────┬───────────────────┐
│ ＋ New    │ Title (editable)    ⋯ menu · branches     │ 🔍 Technique      │
│ 🔍 Search │                                           │                   │
│ ▸ Today   │ [Model▾] [Mode▾] [Sys▾] [⚙]              │ Transform (162)   │
│   · a     │                                           │ Mutate (9)        │
│ ▸ Yester  │ ╭─ user / assistant bubbles (virtualized,│ Classifier (9)    │
│ ▸ Older   │    branching, reasoning collapsible,      │ Mode (3)          │
│           │    tool-call cards, attachments) ─────╮   │ Godmode (1, 🔒)   │
│           │ ╰────────────────────────────────────╯    │                   │
│           │ ┌─ Composer ───────────────────────────┐  │ Recent:           │
│           │ │ [📎][Creative|Intelligent|Adaptive]   │  │   base_64, …     │
│           │ │ [🔒Godmode] [/]                        │  │                   │
│           │ │ Type…                      [➤ Send]   │  │                   │
│           │ └─────────────────────────────────────┘  │                   │
├───────────┴───────────────────────────────────────────┴───────────────────┤
│ Dataset · {N} samples · Last: {model} · [Inspector] [Export ▾]            │
└───────────────────────────────────────────────────────────────────────────┘
```

- Left (chat list): virtualized, grouped by recency, searchable, collapsible to 48px icon-only rail.
- Center (workspace): editable title + quick-settings row + virtualized messages + composer.
- Right (Techniques): always visible on desktop, collapsible; grouped by category; searchable; Recent-5 at bottom.
- Floating selection popover: anchors to any selection in any message; 3 recent techniques + "more…".
- Footer strip: live dataset status, Inspector button, Export dropdown.

Mobile (<768px): chat list + techniques collapse into slide-in Sheets.

---

## 5. Data model

### 5.1 Dexie database: `cryptex-chat` (v1)

Tables:

- `chats` — one row per chat; primary key ULID; indexed on `ownerId`, `updatedAt`, `pinned`, `archivedAt`, `parentChatId`, and `*tags`.
- `messages` — one row per turn (user, assistant, system, tool); primary key ULID; compound index `[chatId+createdAt]` for ordered loads; indexed on `parentId`, `role`, `*tags`, `trainingInclude`, `ownerId`.
- `attachments` — blob-bearing; indexed on `messageId`, `ownerId`.
- `toolStates` — per-tool opaque state blob for persisted Tools-mode sessions; key `[toolId+ownerId]`.

Row shapes (verbatim from brainstorming Section 2.1; auth-readiness adds `ownerId` and `tombstoned?: boolean` to every table):

Salient fields on `messages` for fine-tuning:
- `contentRaw` (user role only) — the text user typed before mode template applied.
- `content` — what was actually sent to the model.
- `reasoning` — extended-thinking trace, verbatim, optional.
- `toolCalls[]` — ordered events: `{toolCallId, source, toolName, input, output, errorMessage, durationMs}`.
- `modelRequested` / `modelReturned` — distinguishes what the user picked from what the provider actually served.
- `provider` + `providerInstanceId` — for OpenAI-compat, which endpoint served the call.
- `systemPromptSnapshot` — system prompt verbatim at call time (chats can edit theirs between turns; we snapshot).
- `samplingParams` — temperature, topP, maxTokens, reasoningEffort, thinkingLevel — exactly what went on the wire.
- `modeApplied` — technique id or null.
- `tokenUsage` — inputTokens, outputTokens, cachedInputTokens, reasoningTokens.
- `finishReason`, `latencyMs`, `costUsd`.
- `rating` (1–5), `thumbsUp`, `thumbsDown`, `tags[]`, `trainingInclude` (default true).
- `error` — populated on failure path; row still persists for training-data "what went wrong" analysis.

All primary keys are ULIDs. All rows carry `updatedAt`. All rows carry `ownerId` (v1 = `'local'`). Sync-ready; no schema migration when auth lands.

### 5.2 Technique registry (one source of truth)

Location: `$lib/chat/techniques/registry.ts`. Populates at boot from five sources:

1. **Transformers** — every entry in `src/transformers/registry.ts` auto-wrapped with `category:'transform'`, `local:true`.
2. **Mutators** — the 9 PromptCraft strategies with `category:'mutate'`, `local:false`.
3. **Classifier techniques** — the 9 Anti-Classifier named techniques with `category:'classifier'`, `local:false`.
4. **Modes** — hand-written, one file per mode under `$lib/chat/techniques/modes/`, `category:'mode'`, `local:true` (template-only in v1).
5. **Godmode chains** — hand-written under `$lib/chat/techniques/godmode/`, `category:'godmode'`, `local:false`. v1 ships one disabled stub.

Technique shape:

```ts
interface Technique {
  id: string;
  name: string;
  description: string;
  category: 'transform' | 'mutate' | 'classifier' | 'mode' | 'godmode';
  icon?: string;
  local: boolean;
  apply: (input: string, ctx: TechniqueContext) => Promise<{ output: string; metadata?: Record<string, unknown> }>;
  wrapDraft?: (draft: string, ctx: TechniqueContext) => Promise<string>;  // mode-only
  jailbreakSequence?: (ctx: TechniqueContext) => Promise<ChatMessage[]>;  // godmode-only
}
```

Public API: `allTechniques()`, `byCategory(cat)`, `find(id)`, `search(query)`.

---

## 6. Flow semantics

### 6.1 Happy path text turn

1. Composer reads: user draft, active mode, selected model, chat history.
2. On Send:
   a. Build user `MessageRow` with `contentRaw` = draft.
   b. If mode active and `local:true`: apply mode's template → `content`. Else `content = contentRaw`.
   c. Persist row (via `repo.saveMessage`).
   d. Call `gateway.streamChat({ model, messages: [...history, userContent], providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' }}}, ... })`.
   e. Render assistant bubble streaming via `svelte-streamdown`; reasoning collapsible via `<details>`.
   f. On `finish` event: freeze assistant `MessageRow` with `modelReturned`, `samplingParams`, `tokenUsage`, `latencyMs`, `finishReason`.

### 6.2 Tool-calling

- **Slash `/base64 encode hi`** — composer parses leading `/` against Technique registry, executes `technique.apply()` locally, creates user row + tool row atomically, no LLM call.
- **LLM tool-calling** — `settings.enabledToolIds` maps to OpenAI/Anthropic tool schemas; model emits `tool-call` events; dispatcher runs `technique.apply()`; result feeds back into `streamChat()` for continuation. Capped at `settings.maxToolCalls` (default 4).

All tool events captured into `MessageRow.toolCalls[]` with `source: 'transformer' | 'slash' | 'mcp'`.

### 6.3 Mode application

Modes are **deterministic local templates** in v1:

```ts
// $lib/chat/techniques/modes/creative.ts
export default {
  id: 'creative', name: 'Creative', category: 'mode', local: true,
  description: 'Vivid, narrative, exploratory tone.',
  apply: async (input) => ({ output: input }),
  wrapDraft: async (draft) => `Respond with vivid, creative, narrative energy.\n\nUser: ${draft}`
};
```

Zero extra LLM calls. `contentRaw` preserves user's real input; `content` is the wrapped version.

### 6.4 Godmode

Scaffolded architecture, disabled UI. `Technique.jailbreakSequence(ctx)` returns an ordered `ChatMessage[]` prelude. When enabled in the future:

1. Before user's real message sends, each prelude turn fires as its own `streamChat` call.
2. Each prelude assistant response captured as a `MessageRow` tagged `godmode_prelude`.
3. Real user turn sends with full history intact.

v1 button: greyed, tooltip "Jailbreak chains coming in v2".

### 6.5 Branching

Retry / fork creates a new assistant `MessageRow` whose `parentId` points at the user message; original partial or first attempt stays in the tree. UI renders a branch indicator on messages with siblings. A "Fork chat from here" action creates a new `ChatRow` with `parentChatId` and `parentMessageId` lineage — everything up to that point is copied, and the new chat starts fresh from that turn.

### 6.6 Text-selection transform

User highlights text in any message. Floating popover appears with 3 recent techniques + "more…".
- `local:true` technique: selection replaced in place. For sent messages, creates a new user `MessageRow` prefilled in composer with `contentRaw` = selection, `content` = transformed, `modeApplied` = technique id.
- `local:false` technique: spinner on the popover; runs `technique.apply()` (sub-LLM call); same rules apply when result returns.

### 6.7 Chat state machine

```
idle → drafting → preparing → streaming → (tool-loop?) → finalized
                                │              │
                                ▼              ▼
                             errored         aborted
```

Svelte 5 `$state` on `createChatState(chatId)` factory per chat.

---

## 7. Auth-readiness (wire now, activate later)

### 7.1 `$lib/auth/session.svelte.ts`

Single source of truth for identity. v1:

```ts
export const session = {
  get currentUser() { return { id: 'local', label: 'You', role: 'owner', token: null }; },
  get isAuthenticated() { return true; },
  hasFeature(flag) { return true; },  // v1 returns true for all
  async login() { /* noop */ },
  async logout() { /* noop */ },
  getAuthHeader() { return {}; }
};
```

### 7.2 Repositories, not direct Dexie

`$lib/chat/repo.ts` — `listChats()`, `createChat()`, `updateChat()`, `deleteChat()`, `listMessages(chatId)`, `saveMessage()`, `saveAttachment()`. Each implicitly reads `ownerId` from `session.currentUser`. Every query filters on it.

`$lib/tools/repo.ts` — `saveToolState(toolId, state)`, `loadToolState(toolId)`. Same pattern.

**Hard rule:** no Svelte component imports `Dexie` directly. All persistence through repos.

### 7.3 KeyVault

`$lib/auth/key-vault.ts` wraps localStorage. All keys prefixed `cryptex.${currentUser.id}.*`:

```ts
keyVault.get('providers')  // v1: reads `cryptex.local.providers`
keyVault.set('chat.settings', data)
```

Migration on Chat-mode first load: read legacy `cryptex.providers` / `cryptex.ui.mode` / etc. → write to namespaced keys → delete legacy. Idempotent.

UI-device prefs stay OUT of KeyVault (under plain `cryptex.ui.*`): theme, sidebar width, last-active chat id, active mode pill. These deliberately don't sync across users.

### 7.4 Feature flags

Sprinkled through UI wherever login gating will later matter:

```svelte
{#if session.hasFeature('godmode')}
  <GodmodeButton />
{/if}
```

v1: all flags true. Later: role-gated.

### 7.5 Sync primitives pre-wired

- ULIDs everywhere — no autoincrement.
- `updatedAt` on every row — last-write-wins groundwork.
- `tombstoned?: boolean` — soft-delete for sync.
- Attachments as `Blob` — swap to object storage via the attachment repo without touching UI.

---

## 8. Dataset Inspector (`/dataset`)

Single-page table with left filter rail and right preview.

**Filters (AND-combined):**
- Chat, Model, Provider, Tags (multi-select).
- Date range.
- Has thinking (yes/no/any).
- Uses tools (any/none/specific id).
- Rating (≥N stars).
- Training include (yes/no/any).
- Mode applied (any/specific).

**Columns (sortable):** timestamp, chat title, role, model, tokens_in, tokens_out, latency_ms, cost_usd, rating, tags.

**Row actions:**
- Click → preview pane shows full MessageRow as JSONL + prev/next nav.
- Bulk select → retag, toggle training include, delete, star.
- Split train/val: seed + ratio (default 80/20) → assigns `split: 'train'|'val'` to selected rows.

**Export dropdown:**
- **ShareGPT JSONL** — `{conversations: [{from:'human'|'gpt'|'system'|'tool', value: string}]}` per chat, respects filters + split.
- **Raw JSONL** — every MessageRow field verbatim including tool calls, reasoning, metadata.

Both export via `Blob` + anchor download. Export file includes a leading `// cryptex-dataset-export v1 {...manifest}` line with generator version, export timestamp, active filter set.

---

## 9. Keyboard map

```
Cmd/Ctrl+K      command palette (techniques + chats + actions)
Cmd/Ctrl+N      new chat
Cmd/Ctrl+Shift+N fork current chat from last message
Cmd/Ctrl+/      focus composer
Cmd/Ctrl+Enter  send
Shift+Enter     newline
Cmd/Ctrl+[ ]    prev/next chat
Cmd/Ctrl+,      open chat settings
Cmd/Ctrl+M      open model picker (existing)
Cmd/Ctrl+U      attach file
Esc             close overlay; stop streaming
```

Implemented by extending `$lib/stores/shortcuts.svelte.ts` with a generic `registerShortcut(keyspec, fn)` API; no new shortcut library.

---

## 10. Error handling

- `ErrorBanner` reused unchanged. Mounted above the composer for any `GatewayError` that leaks from `streamChat`.
- Gateway's existing auto-retry on `rate_limit` / `server_unavailable` / `network` still applies.
- New error surface: **inline tool-execution error card** — collapsible, rendered in the assistant bubble when a technique's `apply()` throws. Does NOT abort the conversation; the model can see the error string and retry.

---

## 11. Dependencies

New npm deps (pinned exactly):

```json
"dexie": "^4.x",
"svelte-streamdown": "^latest-stable",
"shiki": "^1.x",
"@tanstack/svelte-virtual": "^3.x",
"pdfjs-dist": "^4.x",
"mammoth": "^1.x",
"ulid": "^2.x"
```

shadcn-svelte CLI run once to generate the primitive set:
`Button, Input, Textarea, Sheet, Sidebar, Tabs, Resizable, ScrollArea, Command, Dialog, DropdownMenu, Popover, Tooltip, Separator, Badge, Kbd, Sonner, Skeleton, Avatar`.

All new lucide icons added to `vite.config.ts` `optimizeDeps.include` at the commit that introduces them, to preserve the no-dev-reload-cascade property established in Sub-project #1.

No new backend. No auth provider dependency in v1.

---

## 12. Bundle budget

- `/chat` route critical path: ≤ **120 KB gzipped** (includes Dexie + svelte-streamdown + Shiki baseline).
- Lazy-loaded on demand:
  - `pdfjs-dist` + `mammoth` (attachment extraction) — only when user actually attaches a PDF/docx.
  - Shiki languages beyond js/ts/python/markdown — on detection.
  - `@tanstack/svelte-virtual` — only when a chat exceeds 200 messages.
- `/dataset` route critical path: ≤ **40 KB gzipped** (table + filters + export logic).

size-limit CI gate extended to cover both routes.

---

## 13. Migration / non-breakage

- Tools mode = existing app, untouched.
- Chat's Dexie DB name `cryptex-chat` — new namespace, no collision.
- `toolStates` migration: tools keep localStorage authoritative in v1. First Chat-mode visit runs a one-shot idempotent migration reading each tool's localStorage → Dexie `toolStates`. Legacy keys left in place for 30 days then cleaned up.
- `cryptex.providers` and other AI-related localStorage entries migrated into KeyVault namespacing (`cryptex.local.providers`) ONLY on first Chat-mode load. Users who never open Chat keep their exact current storage layout.
- Gateway module untouched. Chat consumes `streamChat()` unchanged.
- All existing tool routes (`/promptcraft`, etc.) continue to work identically.

---

## 14. Commit cadence

Seven atomic commits, user-verified and pushed between each:

1. **`feat(chat): top-level mode switch + Chat shell`** — HeaderBar pill, routes, empty three-pane shell with placeholders. No streaming, no persistence yet. Proves layout.
2. **`feat(chat): Dexie persistence + repo layer + auth-readiness seams`** — `cryptex-chat` DB, `$lib/chat/repo.ts`, `$lib/tools/repo.ts`, `$lib/auth/session.svelte.ts`, `$lib/auth/key-vault.ts`, legacy localStorage migration.
3. **`feat(chat): Technique registry + right sidebar + selection popover`** — unified registry wiring 162 transformers + 9 mutators + 9 classifier techniques + 3 modes + 1 godmode stub. Right sidebar browsable. Selection popover functional for local techniques.
4. **`feat(chat): streaming + tool-calling + branching`** — wires `gateway.streamChat()`, live assistant rendering via `svelte-streamdown`, reasoning collapsible, tool-call cards, slash commands, branch/fork.
5. **`feat(chat): attachments + keyboard map + error handling`** — drag/drop/paste, PDF/docx extraction (lazy), shortcuts bus, inline error cards.
6. **`feat(chat): Dataset Inspector + ShareGPT/raw JSONL export`** — `/dataset` route, table, filters, preview, export.
7. **`docs: chat playground docs + CSP additions`** — CLAUDE.md / DEPLOY.md / docs updates.

---

## 15. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Dexie schema v1 locks wrong shape | High | High | Use `db.version(1).stores(...)` with upgrade paths; `tombstoned` and `updatedAt` already in schema for future sync. |
| svelte-streamdown incompatible with Svelte 5 runes | Medium | High | Verify on install; fallback to `svelte-exmarkdown` + manual buffer-until-safe-boundary logic. |
| Cmd+M / Cmd+K conflict with browser shortcuts on some platforms | Low | Medium | Already handled in existing `shortcuts.svelte.ts`; extend pattern. |
| Technique registry bundle size | Medium | Medium | 162 transformers + 9 mutators + 9 classifiers = ~190 entries of thin wrappers; measured impact <10 KB gzipped at commit 3. |
| PDF/docx extraction balloons dep footprint | Medium | Medium | Lazy-load `pdfjs-dist` + `mammoth` on first attachment event; not in critical path. |
| Dataset export of 10k+ rows blocks UI | Medium | Medium | Stream export via ReadableStream + Blob assembly; chunk at 1000 rows. |
| IndexedDB quota hits on large attachments | Low | High | Call `navigator.storage.persist()` on first chat save; document attachment size limits (25 MB/file). |
| Auth retrofit forces schema changes | Low | Medium | `ownerId` + `tombstoned` + ULID + `updatedAt` already in place. |
| Tool-state migration from localStorage loses data | Low | High | Read-only migration; legacy keys preserved 30 days; idempotent. |
| `svelteTesting()` + new component tests interact badly | Low | Low | Infrastructure proven in Commit 4 of Sub-project #1. |

---

## 16. Out-of-scope explicitly

- Login, session, OAuth, JWT, anything user-authentication related (architected, not shipped).
- Real-time sync, multi-device state, CRDT.
- Server-side chat storage, backend APIs.
- Projects / workspaces hierarchy of chats.
- Active Godmode jailbreak chains.
- Sub-LLM-call modes (all v1 modes are local templates).
- Voice / image / audio / video I/O.
- MCP server-configured tools (Sub-project #4).
- WebGPU local provider (Sub-project #5).
- DPO / RLHF pair export.
- Anthropic / OpenAI / HF-native training format exports.
- Sharing / collaboration features.
- Analytics / telemetry (Cryptex remains no-telemetry).

---

## 17. Definition of done

- [ ] Seven commits merged to master, user-verified between each, pushed one-by-one.
- [ ] `/chat` route functional with streaming against OpenRouter, Anthropic-direct, and an OpenAI-compat endpoint.
- [ ] Three-pane layout matches §4.3; mobile collapses cleanly.
- [ ] Flat sidebar chat list + branching from any message works.
- [ ] Unified Technique registry with 162 transformers + 9 mutators + 9 classifier techniques + 3 modes + 1 godmode stub; Cmd+K palette searchable across all.
- [ ] Selection popover + right-sidebar both operate on highlighted text.
- [ ] Composer mode pills (Creative/Intelligent/Adaptive) apply local templates; `contentRaw` and `content` both captured.
- [ ] Godmode button greyed with tooltip; pipeline executable with a no-op stub verified by unit test.
- [ ] Attachments: drag/drop + paste + picker; PDF + docx extraction lazy; images send as content parts when model supports vision.
- [ ] Reasoning traces captured + rendered in collapsible `<details>`.
- [ ] Tool calls (slash + LLM-tool) captured into `MessageRow.toolCalls[]` with source tag.
- [ ] Dexie schema v1 live; all CRUD through `$lib/chat/repo.ts`; no Svelte file imports Dexie directly.
- [ ] `session.svelte.ts` + `key-vault.ts` abstractions in place; all relevant localStorage usage migrated.
- [ ] `ownerId`, `updatedAt`, `tombstoned` fields populated on every row.
- [ ] Dataset Inspector at `/dataset` with filters, preview, train/val split, ShareGPT + raw JSONL export.
- [ ] Keyboard shortcuts match §9.
- [ ] Legacy tool routes (`/promptcraft`, `/decode`, etc.) unchanged in behavior.
- [ ] Bundle budgets hold: `/chat` ≤120 KB gz, `/dataset` ≤40 KB gz.
- [ ] CSP `connect-src` extended for HF CDN (svelte-streamdown imports) if needed; otherwise no CSP change.
- [ ] CLAUDE.md + DEPLOY.md updated.
- [ ] All tests pass: existing 81 + new suite (expect ~20–30 new tests across technique registry, repo layer, export shape, key vault, mode template application).

---

## 18. Next steps

1. **User reviews this spec.**
2. If approved → invoke `writing-plans` skill to produce `docs/superpowers/plans/2026-04-18-chat-playground-plan.md` with per-commit task breakdowns, TDD ordering, manual-test checklists.
3. After plan approval → begin Commit 1. Pause for manual verification. Push. Repeat through Commit 7.
