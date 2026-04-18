# Chat Playground UI — 2026 Research

Research target: add a first-class **multi-chat playground** to Cryptex built on
SvelteKit 2 + Svelte 5 (runes) + shadcn-svelte, feeling professional, with
per-chat quick settings over the chat, attachments, and Cryptex's 162
transformers exposed as tools. MCP server integration is stubbed here and
detailed in a sibling research doc.

Author date: 2026-04-18. Target reader: the implementer of the chat tab.

---

## 1. Current SvelteKit app surface

File tour done so the proposal lines up with reality, not theory.

### Stack (`app/package.json`)
- `@sveltejs/kit ^2.8.0`, `svelte ^5.1.9`, **adapter-static** (no server runtime)
- `bits-ui ^1.0.0-next.65` — shadcn-svelte's underlying primitive layer. **We
  have bits-ui but we do NOT yet have `$lib/components/ui/*` — shadcn-svelte
  primitives have not been generated into the project.**
- Styling: `tailwindcss ^3.4.14`, `tailwindcss-animate`, `@tailwindcss/typography`,
  `tailwind-merge`, `tailwind-variants`, `clsx`, `mode-watcher`
- Icons: `lucide-svelte ^0.454.0`
- Markdown: `mdsvex ^0.12.7` (only used for `$lib/guide/*.md`; not a streaming renderer)
- Tokens: `gpt-tokenizer ^2.9.0` (already in dependencies, used by Tokenizer tool)

### Layout shape (`app/src/routes/+layout.svelte`)
- Single-page shell: `HeaderBar` → radial backdrop → `TabRail` (12 tools, flex-wrap
  nav with sliding indicator) → `{@render children?.()}` → footer → drawers
  (`HistoryDrawer`, `ConsentBanner`, `ToastHost`).
- Each tool is a full route under `app/src/routes/<tool>/+page.svelte` that just
  mounts the matching `$lib/components/tools/<tool>/<Tool>.svelte`.
- `base` path is handled by `$app/paths` (static deploy under `/cryptex/`).

### State & storage (`app/src/lib/stores/`)
- `createPersistedState<T>(key, initial)` — the one reactive helper everything
  persisted goes through. **Uses `localStorage` + `JSON.stringify` inside a
  root `$effect`.** No Dexie, no idb, no IndexedDB anywhere.
- `sessionLog.svelte.ts`, `favorites.svelte.ts`, `lastUsed.svelte.ts`,
  `toast.svelte.ts`, `theme.svelte.ts`, `consent.svelte.ts` — tiny reactive
  modules with `.svelte.ts` extension.

### Existing AI integration (`app/src/lib/ai/`)
- `openrouter.ts` — BYOK client, `getApiKey()`, `hasApiKey()`, `chat(req)`,
  `fetchModels()`, `validateKey()`. **Today it is non-streaming** — it awaits
  the full response before returning. Models are normalized with provider +
  `isFree` flag.
- `models.svelte.ts` initializes a reactive catalog on mount.
- `ModelPicker.svelte` — already production-quality picker with search,
  provider grouping, free-tier badge.

### Existing "chat-ish" code
- `PromptCraftTool.svelte` — single prompt → N variants, no turn-taking.
- `TranslateTool.svelte` — single round-trip text field.
- **No multi-turn conversational code exists.** This is greenfield.

### Transformers (`app/src/lib/transformers/registry.ts`)
- `import.meta.glob('../../../../src/transformers/*/*.js', { eager: true })`
  surfaces all 162 transformers at build time.
- Exposes `allTransformers`, `transformersByCategory`, `getTransformer(name)`,
  every transformer carries `{ name, priority, canDecode, category,
  description, func, reverse, configurableOptions, detector }`.
- This is the single, clean surface we wrap into the chat's tool registry —
  no transformer file needs to change.

### Tailwind tokens (`app/tailwind.config.ts`)
- CSS-var-based theme: `--background`, `--foreground`, `--primary`, `--accent`,
  `--card`, `--muted`, `--popover`, `--border`, `--input`, `--ring`.
- Fonts: Inter (sans), Fraunces (serif, used for headings), JetBrains Mono.
- Bespoke shadows: `shadow-glass`, `shadow-primary`; `.glass` utility in
  `app.css`; radial backdrop baked into the layout.
- **This theme ALREADY matches the shadcn-svelte token contract** — when we
  run the CLI, the generated components will drop in without re-theming.

### Gap summary (what we still need before building chat)
1. Run the shadcn-svelte CLI to generate `$lib/components/ui/*` for the blocks
   we compose against (Button, Input, Textarea, Sheet, Sidebar, Tabs,
   Resizable, ScrollArea, Command, Dialog, DropdownMenu, Popover, Tooltip,
   Separator, Badge, Kbd, Sonner, Skeleton). The cli detects `bits-ui` and
   Tailwind tokens already in place.
2. Add `dexie` (chat storage), a streaming markdown renderer
   (`svelte-streamdown` or `svelte-exmarkdown`), Shiki (code blocks), and
   `@tanstack/svelte-virtual` (long-chat virtualization).
3. Teach `openrouter.ts` to stream (`stream: true` + `ReadableStream` parsing).

---

## 2. 2026 landscape

### 2.1 shadcn-svelte available primitives

As of 2026 the component set is feature-complete and actively maintained on
Svelte 5 runes. Components relevant to chat UX:

| Primitive        | Use in our chat                                         |
|------------------|---------------------------------------------------------|
| **Sidebar**      | Chat list sidebar (provider + collapsible groups)       |
| **Resizable**    | Sidebar ↔ workspace gutter; optionally split-view chats |
| **ScrollArea**   | Message list + sidebar scrollers (themed scrollbars)    |
| **Sheet**        | Mobile sidebar, per-chat full-settings drawer           |
| **Tabs**         | Only if we go multi-tab layout (see §6 Option B)        |
| **Dialog**       | Attachment preview, destructive confirmations           |
| **Command**      | Cmd-K palette: /new-chat, /model, /tool, /attach, etc.  |
| **DropdownMenu** | Per-message actions, per-chat actions                   |
| **Popover**      | The quick-settings bar's model, temperature, tools      |
| **Tooltip**      | Icon-button affordances on the composer                 |
| **Textarea**     | Composer (autosize behavior we add on top)              |
| **Input/OTP**    | Composer minor inputs, not the main composer            |
| **Sonner**       | Drop-in for the existing ToastHost (or keep custom)     |
| **Skeleton**     | Loading state for streamed messages                     |
| **Badge/Kbd**    | Token counts, shortcut hints                            |
| **Separator**    | Divider chips inside the message list                   |
| **Avatar**       | User / assistant / tool message avatars                 |
| **Spinner**      | Inline streaming indicator                              |

Crucially there is **NO first-party `Chat` block** in shadcn-svelte itself —
same as shadcn/ui React. We compose our own chat surface from the above.

### 2.2 Reference open-source chat shells

Evaluated as copy/crib targets:

1. **`vercel/ai-chatbot-svelte`** (official SvelteKit port of Vercel's
   AI Chatbot). SvelteKit 2 + Svelte 5 + shadcn-svelte + Bits UI + Vercel AI
   SDK (Svelte adapter). Fit: **high** for the message list / composer /
   streaming plumbing, **low** for persistence (Postgres + Blob, both server-
   side — we are static/offline). License: Apache-2.0 per Vercel convention.
   Use it for layout patterns, discard its storage.

2. **`jianyuan/sveltekit-ai-chatbot`** — an older unofficial port, similar
   shape. Less current than the Vercel one; skip unless Vercel's repo moves.

3. **`cliffordkleinsr/shadcn-svelte-chat`** (`@shadcn-svelte-chat/cli`) —
   shadcn-style CLI that drops a set of chat primitives (ChatMessageList,
   ChatBubble, ChatInput, ChatMessageActions) into `$lib/components/chat/`
   using the shadcn copy-paste model. Fit: **medium** — primitives are
   decent but opinionated single-chat. Worth `npx`-ing once to see its
   component shape; then hand-roll what we keep because it doesn't model
   multi-chat or per-chat settings. MIT.

4. **`shadcn-svelte-extras`** — extension pack with a Chat component,
   FileDropzone, ImageCropper. Chat component is a single-conversation
   demo. Fit: **low** for our needs but FileDropzone is lifted verbatim.

5. **`huggingface/chat-ui`** — HuggingChat's engine, Svelte + Mongo.
   Inspirational for architecture (message threading, tool-use chips) but
   server-bound. Apache-2.0. Read for ideas; don't import.

6. **LobeChat** (React/Next) — uses Dexie for client-side history. Even
   though it's React, its **Dexie schema is the best reference we have**
   for a local-first BYOK chat app. See §4.

### 2.3 Vercel AI Elements — verdict

`vercel/ai-elements` exists (launched 2025, maintained through 2026) and ships
a shadcn-style registry of 20+ AI-specific components: `Conversation`,
`Message`, `PromptInput`, `Reasoning`, `Response`, `Tool`, `Actions`,
`CodeBlock`, `Source`, `Task`, `Branch`, etc. It is **React-only** today. No
Svelte port from Vercel themselves.

What we get for Svelte:
- **`svelte-streamdown`** (by `beynar`) — community Svelte port of Vercel's
  `streamdown` markdown renderer. Handles incomplete markdown blocks during
  streaming, integrates with Shiki. This is the closest Svelte analogue to the
  `Response` AI Element.
- **`svelte-ai-elements`** project at `svelte-ai-elements.vercel.app` — a
  cookbook of Svelte 5 + AI SDK patterns. Not a component registry, but the
  guides are aligned with Vercel's React components.

**Decision:** we mimic Vercel's AI Elements component taxonomy (names and
responsibilities) but build Svelte-native versions under
`$lib/components/chat/`. Use `svelte-streamdown` for the response renderer.

### 2.4 Tab / workspace UX patterns for multi-chat (2026)

How the big incumbents handle multi-conversation with per-conversation settings:

- **ChatGPT (2026):** sidebar of conversations on the left + a model picker
  pinned above the chat header; per-chat "Customize" (system prompt) lives
  in a small drop-down over the chat, not in a separate settings page.
  Projects got first-class nesting in 2025. No real tab strip at the top —
  the switcher is always the sidebar.
- **Claude (2026):** a new **Cowork** tab sitting alongside Chat and Code in
  the desktop app; within Chat, Projects and per-project system prompts;
  model picker inline at the top of the conversation.
- **Poe:** one sidebar per bot + per-conversation thread under each bot. Model
  is effectively baked into the "bot" rather than switchable per message.
- **OpenWebUI:** three-level settings hierarchy — **per-chat**, per-model,
  per-account. The per-chat system prompt + parameters live in a
  "Chat Controls" pane that slides out from the right, plus a model picker
  at the top of the chat. Multi-model chat compares responses side-by-side.
- **LibreChat:** model dropdown + preset dropdown inline at the composer; fork
  any message to branch conversations.
- **Chatbox:** classic sidebar + single focused chat; per-chat settings via a
  gear icon that opens an inline panel.

**Pattern consensus for 2026:**
1. Sidebar on the left for chat history is universal.
2. Inline quick-settings (model + system prompt + temperature) above or
   inside the chat header is the dominant pattern; only deep advanced
   parameters live in a drawer.
3. Command-palette (Cmd-K) is ubiquitous for power users.
4. "Projects" or "Workspaces" group related chats; per-group system prompt
   inherits into children. Cryptex doesn't need this in v1 but the schema
   should leave a `projectId` field.
5. Branching/forking a conversation from any message is table stakes.

### 2.5 Streaming message rendering in Svelte 5

Stack choice:

- **Transport:** OpenRouter supports SSE streaming (`stream: true`). Parse
  with `response.body.getReader()` + a small SSE frame parser (~40 lines).
  No extra dep.
- **Markdown:** **`svelte-streamdown`** — handles incomplete tokens (dangling
  code fences, half-rendered bold, etc.) gracefully. If we want to stay
  zero-dep we can use `svelte-exmarkdown` + manual "buffer until safe boundary"
  logic, but `streamdown` already solves it.
- **Syntax highlighting:** **`shiki`** 1.x — ships dual themes (light +
  dark), uses `@shikijs/transformers` for line numbers and diff highlighting.
  Integrate via `svelte-streamdown`'s code component slot.
- **Reactivity:** each message holds `content = $state('')`; during stream we
  mutate that string. Svelte 5 reconciliation handles it.
- **Autoscroll:** `$effect` on message array length + `scrollIntoView` with a
  "pin-to-bottom" guard (stop auto-scrolling if user scrolled up >~200px).

### 2.6 Attachment UX patterns (2026)

Modern consensus:
- **Drag-and-drop the entire composer** — big drop overlay activates on
  `dragenter` bubbling to the window.
- **Paste image** via `paste` event listener on the composer (clipboard API).
- **File chips** below the composer with thumbnail, name, size, remove X.
- **Previews in dialog** on click (Dialog + ScrollArea).
- **Client-side extraction:**
  - Images: strip EXIF (optional; `piexifjs` or hand-rolled) + generate
    thumbnail via canvas.
  - PDFs: `pdfjs-dist` — text extraction and first-page thumbnail.
  - Word docs: `mammoth` — .docx → HTML/text.
  - Plain/code: read as text.
  - Everything else: keep raw bytes, send as `data:` URL or drop with a
    "not supported" badge.
- **Size limits:** 25 MB per file, 50 MB per message total — store in
  IndexedDB (Blob) not localStorage.
- **Vision models:** if selected model reports `modality` including `image`,
  send image parts as `image_url` content entries to OpenRouter.

### 2.7 State / storage (2026 best practice)

- **Dexie.js** is the consensus winner for client-side chat storage. See
  LobeChat's schema, BetterChatGPT's migration from localStorage to Dexie,
  and the `pkgpulse.com` 2026 comparison: Dexie for anything with real
  offline data, `localforage` for simple KV caching, raw `idb` if minimizing
  bundle size.
- Multi-tab safety: Dexie rides IndexedDB's tab-safe writes; use
  `BroadcastChannel` (Dexie has a built-in "observable" on queries) so an
  action in tab A updates tab B live.
- **Mix persistence layers:**
  - localStorage (via existing `createPersistedState`): chat UI prefs (last
    sidebar width, sidebar collapsed, active chat id), OpenRouter key.
  - Dexie: chats, messages, attachments (Blob), tool invocations.
- **PWA note:** adapter-static + Cryptex's offline pitch means IndexedDB
  beats localStorage for quota (LS is ~5 MB; IDB is tens of MB minimum,
  gigabytes on Chrome with persistent storage granted).
- **Storage persistence:** call `navigator.storage.persist()` on first
  successful chat save to hint the browser this data matters.

### 2.8 Virtualization for long chats

`@tanstack/svelte-virtual` is the 2026 pick. Headless, variable-size rows,
smooth dynamic measurement. Works with Svelte 5.

Alternatives considered and rejected:
- **CSS `content-visibility: auto`** — zero-JS, fine for static chat archives
  but measurement is wrong during streaming; scroll jumps when a row hydrates.
- **`svelte-virtual`** — older, less maintained; TanStack is the standard.

Rule of thumb: turn virtualization on past ~200 messages. Below that the
overhead (dynamic remeasure on Shiki highlight, markdown re-render) costs
more than it saves.

### 2.9 Accessibility & keyboard shortcuts (2026)

- **Command palette:** `cmdk-sv` (the Svelte port of Paco's cmdk) **or**
  shadcn-svelte's `Command` primitive (built on `bits-ui`). We already have
  bits-ui so use `Command` — one less dep.
- **Shortcut stack** for chat apps in 2026:
  - `Cmd/Ctrl+K` — command palette
  - `Cmd/Ctrl+N` or `Cmd/Ctrl+Shift+O` — new chat
  - `Cmd/Ctrl+/` — focus composer
  - `Cmd/Ctrl+Enter` — send
  - `Cmd/Ctrl+[` / `Cmd/Ctrl+]` — prev/next chat
  - `Cmd/Ctrl+Shift+\\` — toggle sidebar
  - `Esc` — close overlays / stop streaming
- **A11y requirements:**
  - Message list is `role="log"` with `aria-live="polite"`.
  - Tool calls announce their purpose to screen readers; collapsible `<details>`
    or `aria-expanded` chips.
  - Focus management: after sending, keep focus in composer; after selecting
    a chat from sidebar, scroll list + focus composer.
  - Full keyboard sidebar navigation via arrow keys.

---

## 3. Proposed component architecture

### 3.1 Top-level layout

Two resizable panes on desktop; mobile collapses the sidebar into a Sheet.

```
<Sidebar.Provider>
  <ChatSidebar />                     // left: chat list + new-chat button
  <Resizable.PaneGroup>
    <Resizable.Pane>
      <ChatWorkspace chatId={active}> // right: header → quick-settings → messages → composer
        <ChatHeader />                //   title (editable), actions menu
        <ChatQuickBar />              //   model | temp | system | tools | attach count
        <MessageList />               //   virtualized, message groups
        <Composer />                  //   textarea + attach + send
      </ChatWorkspace>
    </Resizable.Pane>
    <Resizable.Handle />
    <Resizable.Pane collapsible>      // optional right drawer
      <ChatSettingsDrawer />          //   advanced params + MCP panel
    </Resizable.Pane>
  </Resizable.PaneGroup>
</Sidebar.Provider>
```

Route: `app/src/routes/chat/+page.svelte` (singular — the chat id lives in
state, not URL path, so chat switching is instant and session-local). URL
param `?id=<chatId>` is used for deep-linkable "open chat X" but chats don't
need their own route.

Add it to the existing `TabRail.svelte` tools list between PromptCraft and
Anti-classifier, icon `MessageSquare` (currently used by `gibberish` — swap
gibberish to `Braces` or similar, or use `MessagesSquare` for chat).

### 3.2 Component tree

All paths under `app/src/lib/components/chat/`:

```
chat/
├── ChatRoot.svelte                // mounts provider + panes
├── sidebar/
│   ├── ChatSidebar.svelte         // Sidebar.Provider + Sidebar.Root
│   ├── ChatList.svelte            // virtualized list of ChatItem
│   ├── ChatItem.svelte            // row (title, preview, timestamp, menu)
│   ├── NewChatButton.svelte       // big primary button at sidebar top
│   └── ChatSearch.svelte          // fuzzy search over titles + messages
├── workspace/
│   ├── ChatWorkspace.svelte       // layout: header + quickbar + list + composer
│   ├── ChatHeader.svelte          // breadcrumb / editable title / menu
│   ├── ChatQuickBar.svelte        // model/temp/system/tools pills (POPOVERS)
│   ├── EmptyChat.svelte           // empty-state hero for a new chat
│   └── BranchBanner.svelte        // "forked from <parent> · unfork" banner
├── messages/
│   ├── MessageList.svelte         // tanstack-virtual message window
│   ├── Message.svelte             // role-aware container
│   ├── MessageUser.svelte
│   ├── MessageAssistant.svelte    // streams via svelte-streamdown
│   ├── MessageTool.svelte         // collapsible "Called <transformer>" card
│   ├── MessageError.svelte        // red banner with retry
│   ├── MessageActions.svelte      // copy, retry, branch, delete, edit
│   ├── Reasoning.svelte           // collapsible <details> reasoning block
│   └── Attachments.svelte         // chip list under a message
├── composer/
│   ├── Composer.svelte            // textarea + toolbar
│   ├── ComposerToolbar.svelte     // attach | tools | model | send
│   ├── AttachmentDropzone.svelte  // window-level overlay
│   ├── AttachmentChips.svelte     // pending attachments row
│   ├── AttachmentPreviewDialog.svelte
│   └── StopButton.svelte          // replaces Send while streaming
├── settings/
│   ├── QuickSettingsPopover.svelte   // popover content shown by ChatQuickBar
│   ├── SystemPromptEditor.svelte
│   ├── ToolsPicker.svelte            // list of 162 transformers w/ toggle
│   ├── AdvancedParamsDrawer.svelte   // temp, top_p, max_tokens, penalties
│   └── McpPanel.svelte               // stub: "Connect MCP server" (see sibling doc)
├── tools/
│   ├── transformerTools.ts           // adapter: transformer → tool-call spec
│   ├── toolDispatch.ts               // exec a tool call, return result
│   └── ToolCallCard.svelte           // renders tool-call + result inline
├── palette/
│   └── ChatCommandPalette.svelte     // Cmd-K — new chat, switch, change model, invoke tool
└── shared/
    ├── MarkdownMessage.svelte        // wraps svelte-streamdown + Shiki
    ├── CopyButton.svelte
    └── StreamIndicator.svelte
```

### 3.3 Svelte 5 state model

Three tiers:

**1. Per-chat reactive store** (`$lib/chat/stores/chat.svelte.ts`):

```ts
// rune-based factory, one instance per active chat id
export function createChatState(chatId: string) {
  let messages = $state<Message[]>([]);
  let draft = $state<string>('');
  let streaming = $state<AbortController | null>(null);
  let attachments = $state<PendingAttachment[]>([]);
  let settings = $state<ChatSettings>(DEFAULT_SETTINGS);

  // derived
  const tokenEstimate = $derived(estimateTokens(messages, draft));
  const canSend = $derived(draft.trim().length > 0 && !streaming);

  // lifecycle
  $effect(() => {
    // persist settings changes via dexie
    db.chats.update(chatId, { settings: $state.snapshot(settings) });
  });

  return { /* getters + actions: send, stop, branch, delete */ };
}
```

**2. Global chat index** (`$lib/chat/stores/chats.svelte.ts`):
- `activeChatId = $state<string | null>(null)`
- `chatMeta = $state<ChatMeta[]>([])` — list for sidebar (title, snippet,
  updatedAt, model).
- Hydrated from Dexie on mount; subscribed via Dexie's live query wrapper
  so external edits (tab B, IDB import) propagate.

**3. UI prefs** (existing `createPersistedState`):
- `cryptex.chat.sidebarWidth`, `cryptex.chat.sidebarCollapsed`,
  `cryptex.chat.lastActiveId`, `cryptex.chat.defaultModel`,
  `cryptex.chat.defaultSystemPrompt`.

### 3.4 Transformers-as-tools plug-in

Each chat carries `settings.enabledToolIds: Set<string>`. Default: empty
(user opts in per chat in the ToolsPicker).

Adapter in `$lib/components/chat/tools/transformerTools.ts`:

```ts
import { allTransformers, getTransformer } from '$lib/transformers/registry';

// Given a transformer, emit an OpenAI-style function-tool spec.
export function toToolSpec(t: Transformer): ToolSpec {
  return {
    type: 'function',
    function: {
      name: slugify(t.name),                 // "Base 64" → "base_64"
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

// Dispatch: called when a chat message contains a tool_call.
export function dispatch(call: ToolCall): ToolResult {
  const t = getTransformer(unslugify(call.name));
  if (!t) return { error: `Unknown transformer: ${call.name}` };
  const fn = call.arguments.reverse && t.reverse ? t.reverse : t.func;
  try {
    return { output: fn(call.arguments.text, call.arguments) };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
```

This runs **entirely in the browser** — no network hop for tool execution,
which is faithful to Cryptex's "zero telemetry / local-first" pitch.

Rendering: `MessageTool.svelte` shows a collapsible card:
```
[tool] base_64  ·  "Hello" → "SGVsbG8="     [▸ expand]
```
Expanded view shows args + full output with a copy button.

Also add two special "meta" tools that don't map to transformers:
- `auto_decode` — wraps the universal decoder in `$lib/transformers/decoder.ts`.
- `list_transformers` — returns the registry (for models to discover what's
  available when the user didn't pre-select tools).

**Tool-call flow (streaming):**
1. Composer sends messages + tool specs to OpenRouter.
2. Streamed response may contain `tool_calls`. Parse them from SSE frames.
3. Execute each tool synchronously in-browser via `dispatch()`.
4. Append a `role: 'tool'` message with the result to the conversation.
5. Continue the stream by firing a follow-up request including the tool result.
6. Loop until the model stops calling tools.

Cap: max 8 tool calls per user turn (configurable in AdvancedParamsDrawer) to
prevent runaway loops.

### 3.5 Attachment pipeline

```
  drop/paste/click-attach
         │
         ▼
 AttachmentDropzone (window-level)
         │  File objects
         ▼
 extractAttachment(file)  ──────────► image → canvas thumbnail + EXIF strip
  (in $lib/chat/attachments/)          pdf   → pdfjs-dist text + page-1 thumb
                                       docx  → mammoth → HTML + text
                                       code/txt → text
                                       other → raw blob + byte preview
         │
         ▼
 attachments = [{ id, kind, name, size, mime, text?, thumbUrl?, blob }]
         │
         ▼
 On send:
   - store `blob` in Dexie `attachments` table (keyed by messageId)
   - serialize to OpenRouter `content` array:
       text → { type: 'text', text }
       image → { type: 'image_url', image_url: { url: blob → base64 data URL } }
       pdf/docx → extracted text prefixed with "[filename.ext]\n"
   - attach `attachmentIds: string[]` to the user message
```

Size guardrails (from §2.6): 25 MB/file, 50 MB/message. UI-blocks above. For
vision attachments, check `model.modality` before enabling the image path —
otherwise downgrade to "extracted text (OCR not included)".

---

## 4. Persistence

### 4.1 Dexie schema (`$lib/chat/db.ts`)

```ts
import Dexie, { type Table } from 'dexie';

export interface ChatRow {
  id: string;                     // ulid
  title: string;                  // user-editable, auto-from-first-msg fallback
  createdAt: number;
  updatedAt: number;
  model: string;                  // openrouter model id
  settings: ChatSettings;         // see below
  parentId?: string;              // if branched from another chat
  pinned?: boolean;
  archivedAt?: number | null;
}

export interface ChatSettings {
  systemPrompt: string;
  temperature: number;
  topP?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  enabledToolIds: string[];       // transformer slugs
  toolChoice: 'auto' | 'none' | 'required';
  maxToolCalls: number;           // default 8
  mcpServers: string[];           // stubbed id list
}

export interface MessageRow {
  id: string;
  chatId: string;
  parentId?: string;              // for branching
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];         // on assistant
  toolCallId?: string;            // on tool-response
  attachmentIds?: string[];
  model?: string;                 // which model produced it
  createdAt: number;
  tokenUsage?: { prompt: number; completion: number };
  finishReason?: string;
  error?: string;
}

export interface AttachmentRow {
  id: string;
  messageId: string;
  kind: 'image' | 'pdf' | 'docx' | 'text' | 'other';
  name: string;
  mime: string;
  size: number;
  blob: Blob;
  extractedText?: string;
  thumbnail?: Blob;
  createdAt: number;
}

class CryptexChatDB extends Dexie {
  chats!:       Table<ChatRow, string>;
  messages!:    Table<MessageRow, string>;
  attachments!: Table<AttachmentRow, string>;

  constructor() {
    super('cryptex-chat');
    this.version(1).stores({
      chats:       'id, updatedAt, pinned, archivedAt',
      messages:    'id, chatId, [chatId+createdAt], parentId',
      attachments: 'id, messageId'
    });
  }
}

export const db = new CryptexChatDB();
```

Notes:
- `[chatId+createdAt]` compound index gives us cheap ordered loads.
- Soft-delete via `archivedAt` rather than `delete()` so undo works.
- MCP server list is stub — real schema ships in the sibling MCP research doc.

### 4.2 Quota handling

- On first successful save, try `navigator.storage.persist()` and store the
  grant decision in settings.
- On `QuotaExceededError`: prompt to archive oldest chats + offer export.
- Add a settings page panel: **Storage** — shows
  `navigator.storage.estimate()` usage, "Export all chats (JSON)", "Clear
  archive", "Clear everything".
- Export format: a single JSON file `{chats, messages, attachments[as b64]}`
  that re-imports via `db.transaction('rw', ...)`.

---

## 5. Keyboard + a11y

### 5.1 Shortcut map

Implemented in a single `useShortcuts()` rune helper that installs window-
level listeners.

| Shortcut                     | Action                                    |
|------------------------------|-------------------------------------------|
| `Cmd/Ctrl+K`                 | Open command palette                      |
| `Cmd/Ctrl+N`                 | New chat                                  |
| `Cmd/Ctrl+Shift+O`           | New chat in new "branch" from current     |
| `Cmd/Ctrl+/`                 | Focus composer                            |
| `Cmd/Ctrl+Enter`             | Send (also plain Enter when not shift)    |
| `Shift+Enter`                | Newline in composer                       |
| `Cmd/Ctrl+[` / `Cmd/Ctrl+]`  | Prev / next chat in sidebar               |
| `Cmd/Ctrl+Shift+\`           | Toggle sidebar                            |
| `Cmd/Ctrl+,`                 | Open chat settings drawer                 |
| `Cmd/Ctrl+U`                 | Attach file (opens picker)                |
| `Esc`                        | Close overlay; if streaming → stop        |
| `Cmd/Ctrl+Shift+T`           | Reopen last closed chat                   |
| `Cmd/Ctrl+Shift+F`           | Search within current chat                |
| `Alt+↑ / Alt+↓`              | Cycle through past user prompts in composer |

All shortcuts listed in the palette's help panel (discoverability).

### 5.2 A11y details

- `role="log"` + `aria-live="polite"` on MessageList.
- `aria-busy="true"` on the assistant message bubble during stream.
- Each message has a hidden `<label>` for role + timestamp so screen readers
  get "Assistant, 3 seconds ago, <content>".
- Tool cards expose `aria-expanded` and keyboard toggleable.
- Composer: `aria-label="Send a message"`, `aria-describedby` points at a
  hint with enabled tools summary + token count.
- Focus ring respects `--ring` token (matches the rest of the app).
- `prefers-reduced-motion` cuts the streaming-token animation (streamdown
  has a prop for this).
- Contrast: stream indicator and tool chips use `muted-foreground` with a
  tested AA contrast ratio against `--card`.

---

## 6. Three layout sketches — which of these do we pick?

### Option A — "Sidebar + Single Workspace" (classic ChatGPT / Claude)

```
┌───────────────────────────────────────────────────────────────────────┐
│ HeaderBar                                                             │
├──────────────────┬────────────────────────────────────────────────────┤
│                  │  ┌─ ChatHeader ─────────────────────────────────┐  │
│ + New chat       │  │  Title · Fraunces italic           ⋯ menu    │  │
│ ─────────────    │  └──────────────────────────────────────────────┘  │
│ 🔎 Search        │  ┌─ ChatQuickBar ───────────────────────────────┐  │
│                  │  │ [Claude Sonnet 4.5 ▾] [T 0.7 ▾] [system ▾]   │  │
│ ▸ Today          │  │ [🔧 3 tools ▾] [📎 0] [⚙ advanced ▾]          │  │
│  • Writing poem* │  └──────────────────────────────────────────────┘  │
│  • Decode b64    │  ┌─ MessageList (ScrollArea, virtualized) ──────┐  │
│  • Explore…      │  │                                              │  │
│ ▸ Yesterday      │  │  you: Transform this to base64: Hello        │  │
│  • Cipher quiz   │  │  tool: base_64 → "SGVsbG8="                  │  │
│  • Review PR     │  │  claude: Here it is: SGVsbG8= ...            │  │
│ ▸ Older (12)     │  │                                              │  │
│                  │  │                                              │  │
│                  │  └──────────────────────────────────────────────┘  │
│                  │  ┌─ Composer ───────────────────────────────────┐  │
│ ──────────       │  │ [📎] │ Type a message…                │ [➤] │  │
│ 🧪 MCP: 0 servers│  │      │                                │     │  │
│                  │  └──────────────────────────────────────────────┘  │
└──────────────────┴────────────────────────────────────────────────────┘
```

**Pros:** matches every user's mental model of a modern chat app. Sidebar is
low-friction for 50+ chats. Quick-settings row on top is inline but unobtrusive.
Single workspace means zero context-switch cost once a chat is chosen.

**Cons:** no direct view of two chats at once; comparing models requires
switching. Sidebar eats horizontal space on small laptops (mitigated by
Resizable + collapsible via Sidebar.Provider).

**Fit score: 9/10** for v1. Matches the product brief verbatim.

---

### Option B — "Browser-style Tab Strip over Workspace"

```
┌───────────────────────────────────────────────────────────────────────┐
│ HeaderBar                                                             │
├───────────────────────────────────────────────────────────────────────┤
│ [ Writing poem × ] [ Decode b64 × ] [ Cipher quiz × ] [ + ] [ ≡ list ]│ ← tabs
├───────────────────────────────────────────────────────────────────────┤
│  ┌─ ChatQuickBar ─────────────────────────────────────────────────┐   │
│  │ [Claude Sonnet 4.5 ▾] [T 0.7 ▾] [system ▾] [🔧 3 ▾] [📎 0]     │   │
│  └────────────────────────────────────────────────────────────────┘   │
│  ┌─ MessageList (ScrollArea, virtualized) ────────────────────────┐   │
│  │  you: Transform this to base64: Hello                          │   │
│  │  tool: base_64 → "SGVsbG8="                                    │   │
│  │  claude: Here it is: SGVsbG8= ...                              │   │
│  │                                                                │   │
│  └────────────────────────────────────────────────────────────────┘   │
│  ┌─ Composer ─────────────────────────────────────────────────────┐   │
│  │ [📎] │ Type a message…                                  │ [➤] │   │
│  └────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

Hamburger `≡ list` opens the full chat list in a Sheet overlay.

**Pros:** extremely on-brand for a "playground" — each chat is a window with
its own settings; tabs make that metaphor literal. Encourages short-lived
experiments. Pairs great with Resizable if we want split-view compare later.

**Cons:** tab strip doesn't scale past ~8 open chats without scrolling/
truncation. Requires two layers of discovery (tab strip + overflow list),
which is novel UX users may not immediately grasp. Mobile adaptation is
awkward (horizontal scroll tabs on a small viewport).

**Fit score: 7/10.** Compelling for the "playground" vibe but loses to A on
first-time usability. Good as a power-user option later.

---

### Option C — "Sidebar + Workspace + Right Inspector" (three-pane)

```
┌────────────────────────────────────────────────────────────────────────┐
│ HeaderBar                                                              │
├──────────────┬──────────────────────────────────────────┬──────────────┤
│ + New chat   │ ChatHeader · Title                    ⋯  │ Inspector    │
│ 🔎 Search    │──────────────────────────────────────────│              │
│              │ ChatQuickBar                             │ [Settings]   │
│ ▸ Today      │ [Claude ▾] [T 0.7] [sys ▾] [🔧3] [📎0]  │ ┌─ System ─┐ │
│  Writing *   │──────────────────────────────────────────│ │ You are… │ │
│  Decode b64  │                                          │ └──────────┘ │
│  Explore…    │  you: Transform to base64: Hello         │ Temp  0.7    │
│              │  tool: base_64 → SGVsbG8=                │ Top-p 1.0    │
│ ▸ Yesterday  │  claude: Here it is: SGVsbG8= ...        │ Max   4096   │
│  Cipher quiz │                                          │              │
│  Review PR   │                                          │ 🔧 Tools     │
│              │                                          │ ☑ base_64    │
│              │                                          │ ☑ caesar     │
│              │                                          │ ☐ morse      │
│              │                                          │ … (162)      │
│              │                                          │              │
│              │ ┌─ Composer ─────────────────────────┐   │ 🧪 MCP       │
│ 🧪 MCP: 0    │ │ [📎] │ Type a message… │ [➤]        │   │ + Connect   │
│              │ └────────────────────────────────────┘   │ server…      │
└──────────────┴──────────────────────────────────────────┴──────────────┘
```

**Pros:** maximum information density — everything visible at once, no
popovers. Power-user Cursor/VS Code vibe. Transformer/tool picker is
always-visible so users actually discover Cryptex's 162 transforms.

**Cons:** three panes is too much on anything under 1400px wide. We already
have a wide HeaderBar + radial backdrop; stacking another pane makes the
Cryptex layout feel cramped. Violates "seamless chat window" in the brief
(more chrome than chat).

**Fit score: 6/10** for v1. Revisit as "open inspector on demand" via
Resizable collapsible pane.

---

### Recommended pick

**Option A for v1**, with two explicit affordances that steal from B and C:

1. **From B:** make `Cmd+K → "Open chat in new tab"` open a second workspace
   inside a Tabs component — a lightweight "compare two chats" mode that
   doesn't require full tab-strip UX.
2. **From C:** the right-hand `Resizable.Pane` is **collapsible** and holds
   `ChatSettingsDrawer` (Advanced params + Tools picker + MCP panel).
   Default collapsed. Users who want the three-pane inspector just drag it
   open; everyone else sees clean Option A.

This gets us the "professional, user-friendly feel" of A with escape hatches
for power users, without paying B's discoverability cost or C's density cost.

---

## 7. Citations

### shadcn-svelte / component stack
- [shadcn-svelte docs — Components index](https://www.shadcn-svelte.com/docs/components)
- [shadcn-svelte Sidebar docs](https://shadcn-svelte.com/docs/components/sidebar)
- [shadcn-svelte Resizable docs](https://www.shadcn-svelte.com/docs/components/resizable)
- [shadcn-svelte Scroll Area docs](https://shadcn-svelte.com/docs/components/scroll-area)
- [shadcn-svelte Sheet docs](https://shadcn-svelte.com/docs/components/sheet)
- [shadcn-svelte Command docs](https://www.shadcn-svelte.com/docs/components/command)
- [shadcn-svelte-extras (Chat, FileDropzone, ImageCropper)](https://www.shadcn-svelte-extras.com/)
- [cliffordkleinsr/shadcn-svelte-chat CLI (GitHub)](https://github.com/cliffordkleinsr/shadcn-svelte-chat)

### Vercel AI ecosystem
- [vercel/ai-elements (React registry)](https://github.com/vercel/ai-elements)
- [Vercel changelog — Introducing AI Elements](https://vercel.com/changelog/introducing-ai-elements)
- [vercel/ai-chatbot-svelte (official SvelteKit port)](https://github.com/vercel/ai-chatbot-svelte)
- [Vercel AI SDK — Svelte getting started](https://ai-sdk.dev/docs/getting-started/svelte)
- [svelte-ai-elements cookbook](https://svelte-ai-elements.vercel.app/cookbook/getting-started)

### Streaming markdown + code highlighting
- [beynar/svelte-streamdown (GitHub)](https://github.com/beynar/svelte-streamdown)
- [vercel/streamdown (React origin)](https://github.com/vercel/streamdown)
- [ssssota/svelte-exmarkdown (GitHub)](https://github.com/ssssota/svelte-exmarkdown)
- [Rodney Lab — Shiki syntax highlighting in SvelteKit](https://rodneylab.com/sveltekit-shiki-syntax-highlighting/)

### Storage
- [Dexie.js docs](https://dexie.org/)
- [Dexie vs localforage vs idb (2026 comparison)](https://www.pkgpulse.com/blog/dexie-vs-localforage-vs-idb-indexeddb-browser-storage-2026)
- [Usage of Dexie in LobeChat (Medium)](https://medium.com/@ramunarasinga/usage-of-dexie-an-indexeddb-wrapper-in-lobechat-ea64728e5308)

### Virtualization
- [TanStack Virtual — Svelte adapter docs](https://tanstack.com/virtual/latest/docs/framework/svelte/svelte-virtual)
- [@tanstack/svelte-virtual on npm](https://www.npmjs.com/package/@tanstack/svelte-virtual)

### Reference chat shells
- [huggingface/chat-ui](https://github.com/huggingface/chat-ui)
- [OpenWebUI — Chat features](https://docs.openwebui.com/features/chat-conversations/chat-features/)
- [OpenWebUI — Chat parameters (per-chat system prompt)](https://docs.openwebui.com/features/chat-conversations/chat-features/chat-params/)
- [OpenWebUI — Multi-model chats](https://docs.openwebui.com/features/chat-conversations/chat-features/multi-model-chats/)
- [LibreChat vs OpenWebUI comparison 2026](https://blog.houseoffoss.com/post/open-webui-vs-librechat-2025-which-open-source-ai-chat-platform-is-better-for-you)

### Streaming transport
- [OpenRouter API — Streaming responses](https://openrouter.ai/docs/api/reference/streaming)
- [SvelteKit Streaming — complete guide (Khromov)](https://khromov.se/sveltekit-streaming-the-complete-guide/)
- [Svelte on Vercel — Streaming Chat](https://vercel.com/academy/svelte-on-vercel/streaming-chat)

### Command palette / keyboard
- [shadcn-svelte Command (bits-ui under the hood)](https://www.shadcn-svelte.com/docs/components/command)
- [cmdk-sv (Svelte port of Paco cmdk)](https://www.cmdk-sv.com/)
- [svelte-put/shortcut](https://svelte-put.vnphanquang.com/docs/shortcut)

### 2026 incumbents UX reference
- [ChatGPT + Claude power-user setup 2026 (The AI Corner)](https://www.the-ai-corner.com/p/chatgpt-claude-power-user-setup-guide-2026)
- [Both Claude and ChatGPT prepping major interface updates](https://handyai.substack.com/p/both-claude-and-chatgpt-prepping)
- [First impressions of Claude Cowork (Simon Willison, Jan 2026)](https://simonwillison.net/2026/Jan/12/claude-cowork/)

### Internal Cryptex references
- `app/src/lib/transformers/registry.ts` — 162-transformer Vite-glob registry
- `app/src/lib/ai/openrouter.ts` — BYOK client, non-streaming (today)
- `app/src/lib/ai/ModelPicker.svelte` — existing model picker we reuse
- `app/src/lib/stores/_persisted.svelte.ts` — `createPersistedState` helper
- `app/src/lib/components/shell/TabRail.svelte` — where we register the Chat tab
- `app/tailwind.config.ts` — CSS-var theme already compatible with shadcn-svelte
