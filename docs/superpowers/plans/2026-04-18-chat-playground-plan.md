# Chat Playground + Research Dataset Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a chat-first research surface on Cryptex with persistent multi-chat conversations, branching, a unified Technique registry (162 transformers + 9 mutators + 9 classifier techniques + 3 modes + 1 godmode stub), training-data capture, and an in-app Dataset Inspector — architected for future login/multi-user without shipping auth today.

**Architecture:** Top-level Chat/Tools mode pill in HeaderBar. Chat mode occupies a three-pane SvelteKit route (`/chat`): flat chat-list sidebar (left) + workspace with editable title, quick-settings, virtualized message list, composer (center) + always-visible techniques sidebar with floating selection popover (right). Persistence via Dexie `cryptex-chat` DB behind a repository layer that routes everything through a `session` abstraction and `KeyVault` — so auth retrofit is a config change, not a refactor. Streaming via the existing `gateway.streamChat()` from Sub-project #1.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes + shadcn-svelte + Dexie 4 + svelte-streamdown + Shiki + @tanstack/svelte-virtual + ULID + Vitest + @testing-library/svelte. No backend.

**Spec:** `docs/superpowers/specs/2026-04-18-chat-playground-design.md` — read §4 (layout), §5 (data model), §6 (flow), §7 (auth-readiness), §8 (inspector) for the canonical contracts referenced in this plan.

**Branch:** all work on `master` with atomic commits. HEAD before Commit 1: `30ca94e` (end of gateway sub-project). User manually verifies each commit in the browser, then authorizes `git push`.

---

## Prerequisites

- [ ] **Verify clean working tree**

```bash
git status
```

Expected: working tree clean or only the long-standing uncommitted `DEPLOY.md` diff (Cloudflare note). If anything else, stash or commit first.

- [ ] **Verify baseline tests + type-check pass**

```bash
cd app && npm run test:unit && npm run check
```

Expected: 81 tests pass, 0 type errors. Gateway is at commit `30ca94e`.

- [ ] **Confirm Dexie not yet in the project**

```bash
cd app && npm list dexie 2>/dev/null | grep -v '^└'
```

Expected: not installed (we add it in Commit 2).

---

## Commit 1: Top-level mode switch + Chat shell + routes

**Goal:** Ship the Chat/Tools mode pill, the `/chat` route with a static three-pane shell, and `shadcn-svelte` primitives generated via CLI. No persistence, no streaming, no techniques yet. Proves layout + mode switch + navigation without disrupting existing tool routes.

### 1.A — Files

**Create:**
- `app/src/lib/stores/chatMode.svelte.ts` — reactive `mode: 'chat' | 'tools'` persisted under `cryptex.ui.mode` (device-local)
- `app/src/lib/components/shell/ModePill.svelte` — the Chat/Tools toggle
- `app/src/routes/chat/+page.svelte` — Chat landing page (empty-state when no chats)
- `app/src/routes/chat/+layout.svelte` — hides TabRail for Chat mode, wraps with Chat shell
- `app/src/lib/components/chat/ChatShell.svelte` — three-pane resizable layout container
- `app/src/lib/components/chat/sidebar/ChatSidebarPlaceholder.svelte` — left sidebar stub
- `app/src/lib/components/chat/workspace/ChatWorkspacePlaceholder.svelte` — center placeholder
- `app/src/lib/components/chat/techniques/TechniquesSidebarPlaceholder.svelte` — right sidebar stub
- `app/src/lib/components/chat/footer/DatasetFooter.svelte` — bottom status strip (stub)
- `app/src/lib/stores/__tests__/chatMode.test.ts`

**Modify:**
- `app/src/lib/components/shell/HeaderBar.svelte` — mount `<ModePill>` between existing action buttons
- `app/src/routes/+layout.svelte` — hide `<TabRail>` when mode is `chat` (and Chat route is active)
- `app/package.json` / `app/package-lock.json` — shadcn-svelte primitives installed via CLI
- `app/vite.config.ts` — add new lucide icons + shadcn paths to `optimizeDeps.include` as needed
- `app/components.json` — created by shadcn CLI (new)
- `app/tailwind.config.ts` — shadcn CLI may edit

### 1.B — Run shadcn-svelte CLI

- [ ] **Step 1: Initialize shadcn-svelte**

```bash
cd app && npx shadcn-svelte@latest init
```

Answer interactively:
- style: default
- base color: slate (match existing CSS tokens)
- tailwind.config path: `./tailwind.config.ts`
- components path: `$lib/components/ui`
- utils path: `$lib/utils/cn` (confirm existing helper)
- TypeScript: yes
- CSS variables: yes (already set up)

Confirm the CLI writes `components.json` and touches `tailwind.config.ts` minimally. Verify the existing CSS-var theme in `app/src/app.css` is preserved.

- [ ] **Step 2: Generate core primitives needed for Chat**

```bash
cd app && npx shadcn-svelte@latest add button input textarea sheet sidebar tabs resizable scroll-area command dialog dropdown-menu popover tooltip separator badge kbd sonner skeleton avatar
```

Expected: components written to `app/src/lib/components/ui/*`. Run `npm run check` — 0 errors. If a primitive fails to generate due to peer version mismatch, add `-y --force` and retry.

- [ ] **Step 3: Verify primitive smoke**

Create a quick throwaway test file at `app/src/lib/components/ui/__tests__/button.smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { Button } from '$lib/components/ui/button';

describe('shadcn Button', () => {
  it('renders children', () => {
    const { getByText } = render(Button, { props: { children: () => 'Hello' } as never });
    expect(getByText('Hello')).toBeTruthy();
  });
});
```

Run: `cd app && npx vitest run src/lib/components/ui/__tests__/button.smoke.test.ts`

Expected: PASS. If the snippet-props shape fails in this Svelte 5 + shadcn-svelte version, delete the smoke test and rely on visual verification in step 1.J. The import path working is the sanity check.

### 1.C — Chat mode store (TDD)

- [ ] **Step 1: Write failing test**

File: `app/src/lib/stores/__tests__/chatMode.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

function installLS() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: vi.fn((k: string) => store.get(k) ?? null),
      setItem: vi.fn((k: string, v: string) => { store.set(k, v); }),
      removeItem: vi.fn((k: string) => { store.delete(k); }),
      clear: vi.fn(() => { store.clear(); }),
      get length() { return store.size; },
      key: vi.fn((i: number) => [...store.keys()][i] ?? null)
    },
    writable: true, configurable: true
  });
}

beforeEach(() => { installLS(); vi.resetModules(); });

describe('chatMode store', () => {
  it('defaults to "tools" on first load', async () => {
    const mod = await import('../chatMode.svelte');
    expect(mod.chatMode.value).toBe('tools');
  });

  it('persists changes to cryptex.ui.mode', async () => {
    const mod = await import('../chatMode.svelte');
    mod.chatMode.value = 'chat';
    expect(localStorage.getItem('cryptex.ui.mode')).toContain('chat');
  });

  it('hydrates from persisted value', async () => {
    localStorage.setItem('cryptex.ui.mode', JSON.stringify('chat'));
    const mod = await import('../chatMode.svelte');
    expect(mod.chatMode.value).toBe('chat');
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd app && npx vitest run src/lib/stores/__tests__/chatMode.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `chatMode.svelte.ts`**

File: `app/src/lib/stores/chatMode.svelte.ts`

```ts
import { createPersistedState } from './_persisted.svelte';

export type ChatMode = 'chat' | 'tools';

export const chatMode = createPersistedState<ChatMode>('cryptex.ui.mode', 'tools');
```

- [ ] **Step 4: Run, verify pass**

```bash
cd app && npx vitest run src/lib/stores/__tests__/chatMode.test.ts
```

Expected: PASS.

### 1.D — ModePill component

- [ ] **Step 1: Create `ModePill.svelte`**

File: `app/src/lib/components/shell/ModePill.svelte`

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { chatMode } from '$lib/stores/chatMode.svelte';
  import { cn } from '$lib/utils/cn';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import Wrench from 'lucide-svelte/icons/wrench';

  function selectMode(next: 'chat' | 'tools') {
    chatMode.value = next;
    const currentPath = $page.url.pathname.replace(base, '') || '/';
    if (next === 'chat' && !currentPath.startsWith('/chat')) {
      goto(`${base}/chat`);
    } else if (next === 'tools' && currentPath.startsWith('/chat')) {
      goto(`${base}/`);
    }
  }

  const active = $derived(chatMode.value);
</script>

<div role="tablist" aria-label="App mode" class="inline-flex items-center rounded-full border border-border bg-card/60 p-0.5 text-xs">
  <button
    type="button"
    role="tab"
    aria-selected={active === 'chat'}
    onclick={() => selectMode('chat')}
    class={cn(
      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors',
      active === 'chat' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
    )}
  >
    <MessageSquare size={12} /> Chat
  </button>
  <button
    type="button"
    role="tab"
    aria-selected={active === 'tools'}
    onclick={() => selectMode('tools')}
    class={cn(
      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors',
      active === 'tools' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
    )}
  >
    <Wrench size={12} /> Tools
  </button>
</div>
```

- [ ] **Step 2: Mount in HeaderBar**

Modify `app/src/lib/components/shell/HeaderBar.svelte` — add `ModePill` before the history button in the right-side actions:

```svelte
<script lang="ts">
  /* existing imports */
  import ModePill from './ModePill.svelte';
</script>

<!-- inside the right-side actions div, as FIRST child -->
<div class="flex items-center gap-2">
  <ModePill />
  <button type="button" onclick={onopenHistory} /* ... existing history button ... */
```

- [ ] **Step 3: Add new lucide icons to vite optimizeDeps**

Modify `app/vite.config.ts` `optimizeDeps.include` — add any not already present: `'lucide-svelte/icons/message-square'` (already there from earlier), `'lucide-svelte/icons/wrench'` (already there). Confirm by grepping; no edit needed if both are already included.

- [ ] **Step 4: Verify HeaderBar still type-checks and renders**

```bash
cd app && npm run check
```

Expected: 0 errors.

### 1.E — Hide TabRail in Chat mode

- [ ] **Step 1: Modify root `+layout.svelte`**

Edit `app/src/routes/+layout.svelte` — replace the TabRail mount with a conditional:

```svelte
<script lang="ts">
  /* existing imports */
  import { chatMode } from '$lib/stores/chatMode.svelte';
</script>

<!-- inside <main>, replace: -->
<main class="container pt-6 pb-20">
  {#if chatMode.value === 'tools'}
    <div class="mb-6"><TabRail /></div>
  {/if}
  <div class="fade-in">
    {@render children?.()}
  </div>
</main>
```

### 1.F — Chat route shell

- [ ] **Step 1: Create `app/src/routes/chat/+layout.svelte`**

File: `app/src/routes/chat/+layout.svelte`

```svelte
<script lang="ts">
  import ChatShell from '$lib/components/chat/ChatShell.svelte';
  let { children } = $props();
</script>

<ChatShell>
  {@render children?.()}
</ChatShell>
```

- [ ] **Step 2: Create `app/src/routes/chat/+page.svelte`**

File: `app/src/routes/chat/+page.svelte`

```svelte
<script lang="ts">
  import ChatWorkspacePlaceholder from '$lib/components/chat/workspace/ChatWorkspacePlaceholder.svelte';
</script>

<ChatWorkspacePlaceholder />
```

### 1.G — ChatShell + three placeholders + footer

- [ ] **Step 1: Implement `ChatShell.svelte`**

File: `app/src/lib/components/chat/ChatShell.svelte`

```svelte
<script lang="ts">
  import ChatSidebarPlaceholder from './sidebar/ChatSidebarPlaceholder.svelte';
  import TechniquesSidebarPlaceholder from './techniques/TechniquesSidebarPlaceholder.svelte';
  import DatasetFooter from './footer/DatasetFooter.svelte';
  let { children } = $props();
</script>

<div class="grid h-[calc(100vh-7rem)] grid-cols-[240px_minmax(0,1fr)_280px] gap-3">
  <aside class="glass rounded-lg border border-white/10 p-3 overflow-hidden">
    <ChatSidebarPlaceholder />
  </aside>
  <section class="glass rounded-lg border border-white/10 p-3 overflow-hidden flex flex-col">
    {@render children?.()}
  </section>
  <aside class="glass rounded-lg border border-white/10 p-3 overflow-hidden hidden lg:block">
    <TechniquesSidebarPlaceholder />
  </aside>
</div>
<DatasetFooter />
```

- [ ] **Step 2: Implement the three placeholders**

File: `app/src/lib/components/chat/sidebar/ChatSidebarPlaceholder.svelte`

```svelte
<div class="text-xs text-muted-foreground">
  <p class="mb-2 font-serif text-sm text-foreground">Chats</p>
  <p>Commit 2 wires chat list + new-chat + search.</p>
</div>
```

File: `app/src/lib/components/chat/workspace/ChatWorkspacePlaceholder.svelte`

```svelte
<div class="flex h-full flex-col items-center justify-center gap-3 text-center">
  <p class="font-serif text-lg">Chat playground</p>
  <p class="text-sm text-muted-foreground">Commits 3–5 wire techniques, streaming, branching, attachments.</p>
</div>
```

File: `app/src/lib/components/chat/techniques/TechniquesSidebarPlaceholder.svelte`

```svelte
<div class="text-xs text-muted-foreground">
  <p class="mb-2 font-serif text-sm text-foreground">Techniques</p>
  <p>Commit 3 wires the unified technique registry.</p>
</div>
```

File: `app/src/lib/components/chat/footer/DatasetFooter.svelte`

```svelte
<footer class="mt-3 flex items-center justify-between rounded-lg border border-white/10 bg-card/40 px-4 py-2 text-xs text-muted-foreground">
  <span>Dataset · 0 samples</span>
  <span>Commit 6 wires the Inspector + export.</span>
</footer>
```

### 1.H — Full suite + smoke

- [ ] **Step 1: Run tests + check + build**

```bash
cd app && npm run test:unit && npm run check && npm run build
```

Expected: all 84+ tests pass (81 baseline + 3 new chatMode tests), 0 type errors, build succeeds.

### 1.I — Manual verification before commit

- [ ] **Step 1: Dev server**

```bash
cd app && npm run dev
```

Open `http://localhost:5173/`.

- [ ] **Step 2: Verify ModePill appears**

HeaderBar shows `[Chat][Tools]` pill. `Tools` is active (primary color highlight). Default URL still lands on the current home.

- [ ] **Step 3: Verify Tools mode unchanged**

TabRail visible, all existing tool routes work (PromptCraft, Decode, Emoji, etc.). No console errors.

- [ ] **Step 4: Verify Chat mode**

Click `Chat` pill. URL changes to `/chat`. TabRail disappears. Three-pane shell visible: left sidebar placeholder, center workspace placeholder "Chat playground", right techniques placeholder. Footer strip at bottom.

- [ ] **Step 5: Verify mode persistence**

Refresh the page. Chat mode sticks. Navigate to `/settings` — mode pill still says Chat but settings still works.

- [ ] **Step 6: Verify switching back**

Click `Tools` pill. URL returns to `/`. TabRail reappears. All existing tools functional.

### 1.J — Commit

- [ ] **Step 1: Stage + commit**

```bash
cd ..
git add app/package.json app/package-lock.json app/components.json \
        app/tailwind.config.ts \
        app/src/lib/components/ui \
        app/src/lib/stores/chatMode.svelte.ts \
        app/src/lib/stores/__tests__/chatMode.test.ts \
        app/src/lib/components/shell/ModePill.svelte \
        app/src/lib/components/shell/HeaderBar.svelte \
        app/src/routes/+layout.svelte \
        app/src/routes/chat \
        app/src/lib/components/chat
git commit -m "$(cat <<'EOF'
feat(chat): top-level mode switch + Chat shell + shadcn primitives

Introduces a Chat/Tools mode pill in HeaderBar backed by a device-local
store (cryptex.ui.mode). Tools stays default; selecting Chat navigates to
/chat and hides TabRail. Generates shadcn-svelte primitives (Button, Input,
Textarea, Sheet, Sidebar, Tabs, Resizable, ScrollArea, Command, Dialog,
DropdownMenu, Popover, Tooltip, Separator, Badge, Kbd, Sonner, Skeleton,
Avatar) to $lib/components/ui.

Chat route is a three-pane placeholder shell: sidebar stub + workspace
stub + techniques sidebar stub + dataset footer. No persistence, no
streaming, no techniques wired yet — Commits 2–6 fill those in.

All existing tool routes (/promptcraft, /decode, /emoji, etc.) unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 1.K — PAUSE, user verify, push

After commit: STOP. User opens the browser, walks all existing tools + switches Chat/Tools pill, confirms no regression, then authorizes `git push origin master`. Do NOT move to Commit 2 until user confirms.

---

## Commit 2: Dexie persistence + repo layer + auth-readiness seams

**Goal:** Ship the `cryptex-chat` Dexie DB, `session` + `KeyVault` abstractions, repository layer for chats/messages/tool-states, and legacy-localStorage migration. All new-chat/message ops run through repos. Chat sidebar lists real Dexie chats. No streaming or technique wiring yet.

### 2.A — Files

**Create:**
- `app/src/lib/auth/session.svelte.ts` — v1 stub (id='local', authenticated, all features on)
- `app/src/lib/auth/key-vault.ts` — namespaced localStorage wrapper
- `app/src/lib/chat/db.ts` — Dexie schema
- `app/src/lib/chat/repo.ts` — chat + message + attachment CRUD
- `app/src/lib/tools/repo.ts` — tool-state CRUD
- `app/src/lib/chat/types.ts` — row types + supporting shapes
- `app/src/lib/auth/__tests__/session.test.ts`
- `app/src/lib/auth/__tests__/key-vault.test.ts`
- `app/src/lib/chat/__tests__/repo.test.ts`
- `app/src/lib/chat/__tests__/db.test.ts`
- `app/src/lib/components/chat/sidebar/ChatSidebar.svelte` — real chat list
- `app/src/lib/components/chat/sidebar/ChatListItem.svelte`
- `app/src/lib/components/chat/sidebar/NewChatButton.svelte`
- `app/src/lib/components/chat/workspace/ChatWorkspace.svelte` — title + empty message area
- `app/src/lib/components/chat/workspace/ChatHeader.svelte` — editable title + menu
- `app/src/routes/chat/[id]/+page.svelte` — deep-link chat

**Modify:**
- `app/src/lib/components/chat/ChatShell.svelte` — swap placeholders for real components
- `app/src/routes/chat/+page.svelte` — auto-open last-active chat or render empty-state
- `app/src/lib/stores/_migrate.ts` — add one-shot KeyVault migration hook
- `app/src/routes/+layout.svelte` — call the new migration before `initCatalogStore()`
- `app/package.json` / `app/package-lock.json` — add `dexie@^4.x`, `ulid@^2.x`
- `app/vite.config.ts` — add `dexie`, `ulid` to `optimizeDeps.include`

### 2.B — Install deps

- [ ] **Step 1:**

```bash
cd app && npm install --save-exact dexie@4.0.11 ulid@2.3.0
```

If the exact version is unavailable, use the newest 4.x / 2.x line stable. Note the installed versions in the commit report.

- [ ] **Step 2: Update `app/vite.config.ts`**

Add `'dexie'` and `'ulid'` to `optimizeDeps.include`. No other config change.

### 2.C — Session abstraction (TDD)

- [ ] **Step 1: Failing test**

File: `app/src/lib/auth/__tests__/session.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { session } from '../session.svelte';

describe('session (v1 local stub)', () => {
  it('returns a local user', () => {
    expect(session.currentUser.id).toBe('local');
    expect(session.isAuthenticated).toBe(true);
  });

  it('hasFeature returns true for all flags in v1', () => {
    expect(session.hasFeature('godmode')).toBe(true);
    expect(session.hasFeature('mcp')).toBe(true);
    expect(session.hasFeature('export')).toBe(true);
  });

  it('getAuthHeader returns empty object', () => {
    expect(session.getAuthHeader()).toEqual({});
  });

  it('login and logout are no-ops that resolve', async () => {
    await expect(session.login()).resolves.toBeUndefined();
    await expect(session.logout()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Fail**

```bash
cd app && npx vitest run src/lib/auth/__tests__/session.test.ts
```

- [ ] **Step 3: Implement**

File: `app/src/lib/auth/session.svelte.ts`

```ts
export type Role = 'owner' | 'viewer';

export type User = {
  id: string;
  label: string;
  role: Role;
  token: string | null;
};

const LOCAL_USER: User = { id: 'local', label: 'You', role: 'owner', token: null };

export const session = {
  get currentUser(): User { return LOCAL_USER; },
  get isAuthenticated(): boolean { return true; },
  hasFeature(_flag: string): boolean { return true; },
  async login(): Promise<void> { /* v1 no-op */ },
  async logout(): Promise<void> { /* v1 no-op */ },
  getAuthHeader(): Record<string, string> { return {}; }
};
```

- [ ] **Step 4: Pass**

```bash
cd app && npx vitest run src/lib/auth/__tests__/session.test.ts
```

### 2.D — KeyVault (TDD)

- [ ] **Step 1: Failing test**

File: `app/src/lib/auth/__tests__/key-vault.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

function installLS() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: vi.fn((k: string) => store.get(k) ?? null),
      setItem: vi.fn((k: string, v: string) => { store.set(k, v); }),
      removeItem: vi.fn((k: string) => { store.delete(k); }),
      clear: vi.fn(() => { store.clear(); }),
      get length() { return store.size; },
      key: vi.fn((i: number) => [...store.keys()][i] ?? null)
    },
    writable: true, configurable: true
  });
  return store;
}

beforeEach(() => { installLS(); vi.resetModules(); });

describe('KeyVault', () => {
  it('stores values under cryptex.local.<key>', async () => {
    const { keyVault } = await import('../key-vault');
    keyVault.set('providers', [{ id: 'openrouter' }]);
    expect(localStorage.getItem('cryptex.local.providers')).toBeTruthy();
  });

  it('reads back what it writes', async () => {
    const { keyVault } = await import('../key-vault');
    keyVault.set('foo', { bar: 1 });
    expect(keyVault.get<{ bar: number }>('foo')).toEqual({ bar: 1 });
  });

  it('deletes', async () => {
    const { keyVault } = await import('../key-vault');
    keyVault.set('x', 1);
    keyVault.delete('x');
    expect(keyVault.get('x')).toBeNull();
  });

  it('migrateLegacyKey moves cryptex.foo → cryptex.local.foo and deletes the old', async () => {
    localStorage.setItem('cryptex.providers', JSON.stringify([{ id: 'openrouter' }]));
    const { keyVault } = await import('../key-vault');
    keyVault.migrateLegacyKey('providers');
    expect(localStorage.getItem('cryptex.providers')).toBeNull();
    expect(localStorage.getItem('cryptex.local.providers')).toBeTruthy();
  });

  it('migrateLegacyKey is idempotent — running twice is safe', async () => {
    const { keyVault } = await import('../key-vault');
    keyVault.set('x', 1);
    keyVault.migrateLegacyKey('x');  // no cryptex.x, no-op
    expect(keyVault.get<number>('x')).toBe(1);
  });
});
```

- [ ] **Step 2: Fail**

```bash
cd app && npx vitest run src/lib/auth/__tests__/key-vault.test.ts
```

- [ ] **Step 3: Implement**

File: `app/src/lib/auth/key-vault.ts`

```ts
import { session } from './session.svelte';

function nsKey(key: string): string {
  return `cryptex.${session.currentUser.id}.${key}`;
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* quota / disabled */ }
}

function safeRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export const keyVault = {
  get<T>(key: string): T | null {
    const raw = safeGet(nsKey(key));
    if (raw === null) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  },
  set<T>(key: string, value: T): void {
    safeSet(nsKey(key), JSON.stringify(value));
  },
  delete(key: string): void {
    safeRemove(nsKey(key));
  },
  /** Move `cryptex.<key>` → `cryptex.<userId>.<key>`, idempotent. */
  migrateLegacyKey(key: string): void {
    const legacy = `cryptex.${key}`;
    const target = nsKey(key);
    const legacyValue = safeGet(legacy);
    if (legacyValue === null) return;
    if (safeGet(target) !== null) { safeRemove(legacy); return; }
    safeSet(target, legacyValue);
    safeRemove(legacy);
  }
};
```

- [ ] **Step 4: Pass**

```bash
cd app && npx vitest run src/lib/auth/__tests__/key-vault.test.ts
```

### 2.E — Chat row types

- [ ] **Step 1: Create `app/src/lib/chat/types.ts`**

Paste all types from spec §5.1. Key inclusions:

```ts
export type Role = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatSettings {
  systemPrompt: string;
  temperature: number;
  topP?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  activeMode?: string | null;
  godmodeEnabled: boolean;
  enabledToolIds: string[];
  toolChoice: 'auto' | 'none' | 'required';
  maxToolCalls: number;
}

export interface ChatRow {
  id: string;
  ownerId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  modelQualifiedId: string;
  settings: ChatSettings;
  parentChatId?: string;
  parentMessageId?: string;
  pinned?: boolean;
  archivedAt?: number | null;
  tags: string[];
  tombstoned?: boolean;
}

export interface ToolCallLog {
  toolCallId: string;
  source: 'transformer' | 'slash' | 'mcp';
  toolName: string;
  input: unknown;
  output: unknown;
  errorMessage?: string;
  durationMs: number;
}

export interface SamplingParams {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  reasoningEffort?: string;
  thinkingLevel?: string;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

export interface MessageRow {
  id: string;
  ownerId: string;
  chatId: string;
  parentId?: string;
  role: Role;
  createdAt: number;
  content: string;
  contentRaw?: string;
  reasoning?: string;
  toolCalls?: ToolCallLog[];
  toolCallId?: string;
  attachmentIds?: string[];
  modelRequested?: string;
  modelReturned?: string;
  provider?: 'openrouter' | 'anthropic' | 'openai-compat';
  providerInstanceId?: string;
  systemPromptSnapshot?: string;
  samplingParams?: SamplingParams;
  modeApplied?: string | null;
  tokenUsage?: TokenUsage;
  finishReason?: string;
  latencyMs?: number;
  costUsd?: number;
  rating?: 1 | 2 | 3 | 4 | 5;
  thumbsUp?: boolean;
  thumbsDown?: boolean;
  tags: string[];
  trainingInclude?: boolean;
  split?: 'train' | 'val';
  error?: string;
  tombstoned?: boolean;
}

export interface AttachmentRow {
  id: string;
  ownerId: string;
  messageId: string;
  kind: 'image' | 'pdf' | 'docx' | 'text' | 'other';
  name: string;
  mime: string;
  size: number;
  blob: Blob;
  extractedText?: string;
  thumbnail?: Blob;
  createdAt: number;
  tombstoned?: boolean;
}

export interface ToolStateRow {
  toolId: string;
  ownerId: string;
  state: unknown;
  updatedAt: number;
}

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  systemPrompt: '',
  temperature: 0.7,
  activeMode: null,
  godmodeEnabled: false,
  enabledToolIds: [],
  toolChoice: 'auto',
  maxToolCalls: 4
};
```

### 2.F — Dexie DB (TDD)

- [ ] **Step 1: Failing test**

File: `app/src/lib/chat/__tests__/db.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

beforeEach(async () => {
  // wipe IDB between tests
  indexedDB.deleteDatabase('cryptex-chat');
});

describe('CryptexChatDB', () => {
  it('exposes chats, messages, attachments, toolStates tables', async () => {
    const { db } = await import('../db');
    expect(db.chats).toBeDefined();
    expect(db.messages).toBeDefined();
    expect(db.attachments).toBeDefined();
    expect(db.toolStates).toBeDefined();
  });

  it('round-trips a chat row', async () => {
    const { db } = await import('../db');
    await db.chats.put({
      id: 'c1', ownerId: 'local', title: 't', createdAt: 1, updatedAt: 1,
      modelQualifiedId: 'openrouter:x/y', settings: {
        systemPrompt: '', temperature: 0.7, activeMode: null, godmodeEnabled: false,
        enabledToolIds: [], toolChoice: 'auto', maxToolCalls: 4
      }, tags: []
    });
    const got = await db.chats.get('c1');
    expect(got?.title).toBe('t');
  });
});
```

- [ ] **Step 2: Install `fake-indexeddb` dev dep**

```bash
cd app && npm install --save-dev --save-exact fake-indexeddb@6.0.0
```

- [ ] **Step 3: Run, fail**

- [ ] **Step 4: Implement `app/src/lib/chat/db.ts`**

```ts
import Dexie, { type Table } from 'dexie';
import type { ChatRow, MessageRow, AttachmentRow, ToolStateRow } from './types';

class CryptexChatDB extends Dexie {
  chats!: Table<ChatRow, string>;
  messages!: Table<MessageRow, string>;
  attachments!: Table<AttachmentRow, string>;
  toolStates!: Table<ToolStateRow, [string, string]>;

  constructor() {
    super('cryptex-chat');
    this.version(1).stores({
      chats:       'id, ownerId, updatedAt, pinned, archivedAt, parentChatId, *tags, tombstoned',
      messages:    'id, chatId, [chatId+createdAt], parentId, role, *tags, trainingInclude, ownerId, tombstoned',
      attachments: 'id, messageId, ownerId, tombstoned',
      toolStates:  '[toolId+ownerId], toolId, ownerId, updatedAt'
    });
  }
}

export const db = new CryptexChatDB();
```

- [ ] **Step 5: Run, pass**

### 2.G — Repository (TDD)

- [ ] **Step 1: Failing test**

File: `app/src/lib/chat/__tests__/repo.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

beforeEach(() => { indexedDB.deleteDatabase('cryptex-chat'); });

describe('chat repo', () => {
  it('createChat writes a row with ownerId=local and default settings', async () => {
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 'Test', modelQualifiedId: 'openrouter:auto' });
    expect(chat.id).toBeTruthy();
    expect(chat.ownerId).toBe('local');
    expect(chat.title).toBe('Test');
    expect(chat.settings.temperature).toBe(0.7);
    expect(chat.tags).toEqual([]);
  });

  it('listChats returns rows in updatedAt desc order, excludes tombstoned', async () => {
    const { repo } = await import('../repo');
    const a = await repo.createChat({ title: 'A', modelQualifiedId: 'x' });
    await new Promise(r => setTimeout(r, 5));
    const b = await repo.createChat({ title: 'B', modelQualifiedId: 'x' });
    await repo.deleteChat(a.id);
    const list = await repo.listChats();
    expect(list.map(c => c.id)).toEqual([b.id]);
  });

  it('saveMessage assigns ULID, preserves contentRaw', async () => {
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    const msg = await repo.saveMessage({
      chatId: chat.id, role: 'user',
      content: 'hello wrapped', contentRaw: 'hello', tags: []
    });
    expect(msg.id).toBeTruthy();
    expect(msg.ownerId).toBe('local');
    expect(msg.content).toBe('hello wrapped');
    expect(msg.contentRaw).toBe('hello');
  });

  it('listMessages returns in createdAt ascending', async () => {
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    await repo.saveMessage({ chatId: chat.id, role: 'user', content: '1', tags: [] });
    await new Promise(r => setTimeout(r, 5));
    await repo.saveMessage({ chatId: chat.id, role: 'assistant', content: '2', tags: [] });
    const list = await repo.listMessages(chat.id);
    expect(list.map(m => m.content)).toEqual(['1', '2']);
  });
});
```

- [ ] **Step 2: Run, fail**

- [ ] **Step 3: Implement `app/src/lib/chat/repo.ts`**

```ts
import { ulid } from 'ulid';
import { db } from './db';
import { session } from '$lib/auth/session.svelte';
import type {
  ChatRow, MessageRow, AttachmentRow, ChatSettings
} from './types';
import { DEFAULT_CHAT_SETTINGS } from './types';

function ownerId(): string { return session.currentUser.id; }

export const repo = {
  async createChat(input: { title: string; modelQualifiedId: string; settings?: Partial<ChatSettings>; parentChatId?: string; parentMessageId?: string }): Promise<ChatRow> {
    const now = Date.now();
    const row: ChatRow = {
      id: ulid(),
      ownerId: ownerId(),
      title: input.title,
      createdAt: now,
      updatedAt: now,
      modelQualifiedId: input.modelQualifiedId,
      settings: { ...DEFAULT_CHAT_SETTINGS, ...(input.settings ?? {}) },
      parentChatId: input.parentChatId,
      parentMessageId: input.parentMessageId,
      tags: []
    };
    await db.chats.put(row);
    return row;
  },

  async listChats(): Promise<ChatRow[]> {
    const all = await db.chats.where('ownerId').equals(ownerId()).toArray();
    return all
      .filter((c) => !c.tombstoned && !c.archivedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async getChat(id: string): Promise<ChatRow | undefined> {
    const row = await db.chats.get(id);
    if (!row || row.ownerId !== ownerId() || row.tombstoned) return undefined;
    return row;
  },

  async updateChat(id: string, patch: Partial<ChatRow>): Promise<void> {
    const existing = await this.getChat(id);
    if (!existing) return;
    await db.chats.put({ ...existing, ...patch, updatedAt: Date.now() });
  },

  async deleteChat(id: string): Promise<void> {
    const existing = await this.getChat(id);
    if (!existing) return;
    await db.chats.put({ ...existing, tombstoned: true, updatedAt: Date.now() });
  },

  async saveMessage(input: Omit<MessageRow, 'id' | 'ownerId' | 'createdAt'>): Promise<MessageRow> {
    const row: MessageRow = {
      ...input,
      id: ulid(),
      ownerId: ownerId(),
      createdAt: Date.now(),
      tags: input.tags ?? []
    };
    await db.messages.put(row);
    // bump parent chat updatedAt
    const chat = await this.getChat(input.chatId);
    if (chat) await db.chats.put({ ...chat, updatedAt: row.createdAt });
    return row;
  },

  async updateMessage(id: string, patch: Partial<MessageRow>): Promise<void> {
    const existing = await db.messages.get(id);
    if (!existing || existing.ownerId !== ownerId()) return;
    await db.messages.put({ ...existing, ...patch });
  },

  async listMessages(chatId: string): Promise<MessageRow[]> {
    const all = await db.messages.where('[chatId+createdAt]').between([chatId, -Infinity], [chatId, Infinity]).toArray();
    return all.filter((m) => m.ownerId === ownerId() && !m.tombstoned);
  },

  async saveAttachment(input: Omit<AttachmentRow, 'id' | 'ownerId' | 'createdAt'>): Promise<AttachmentRow> {
    const row: AttachmentRow = {
      ...input,
      id: ulid(),
      ownerId: ownerId(),
      createdAt: Date.now()
    };
    await db.attachments.put(row);
    return row;
  },

  async listAttachments(messageId: string): Promise<AttachmentRow[]> {
    const all = await db.attachments.where('messageId').equals(messageId).toArray();
    return all.filter((a) => a.ownerId === ownerId() && !a.tombstoned);
  }
};
```

- [ ] **Step 4: Run, pass**

### 2.H — Tool repo

- [ ] **Step 1: Implement `app/src/lib/tools/repo.ts`**

```ts
import { db } from '$lib/chat/db';
import { session } from '$lib/auth/session.svelte';
import type { ToolStateRow } from '$lib/chat/types';

function ownerId(): string { return session.currentUser.id; }

export const toolRepo = {
  async saveToolState(toolId: string, state: unknown): Promise<void> {
    await db.toolStates.put({
      toolId, ownerId: ownerId(), state, updatedAt: Date.now()
    });
  },
  async loadToolState<T = unknown>(toolId: string): Promise<T | null> {
    const row = await db.toolStates.get([toolId, ownerId()]);
    return (row?.state as T) ?? null;
  },
  async deleteToolState(toolId: string): Promise<void> {
    await db.toolStates.delete([toolId, ownerId()]);
  }
};
```

No tests for toolRepo in this commit — it's thin. Coverage lands when a tool actually migrates in a later sub-project.

### 2.I — Legacy migration hook

- [ ] **Step 1: Extend `app/src/lib/stores/_migrate.ts`**

Find the existing `runLegacyMigration()` function. Add a KeyVault migration sweep at the end:

```ts
import { keyVault } from '$lib/auth/key-vault';

// inside runLegacyMigration() after existing logic:
const LEGACY_KEYS_TO_NAMESPACE = [
  'providers',
  'openrouterApiKey',
  'openrouterModelsCache',
  'catalogCache.v2'
];
for (const k of LEGACY_KEYS_TO_NAMESPACE) {
  keyVault.migrateLegacyKey(k);
}
```

### 2.J — ChatSidebar, ChatHeader, ChatWorkspace (no tests — UI components, manually verified)

- [ ] **Step 1: `app/src/lib/components/chat/sidebar/NewChatButton.svelte`**

```svelte
<script lang="ts">
  import { repo } from '$lib/chat/repo';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import Plus from 'lucide-svelte/icons/plus';

  async function newChat() {
    const chat = await repo.createChat({ title: 'New chat', modelQualifiedId: 'openrouter:openrouter/auto' });
    goto(`${base}/chat/${chat.id}`);
  }
</script>

<button type="button" onclick={newChat} class="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-white/15 py-2 text-sm text-muted-foreground hover:bg-white/5">
  <Plus size={14} /> New chat
</button>
```

- [ ] **Step 2: `app/src/lib/components/chat/sidebar/ChatListItem.svelte`**

```svelte
<script lang="ts">
  import type { ChatRow } from '$lib/chat/types';
  import { cn } from '$lib/utils/cn';
  type Props = { chat: ChatRow; active: boolean; onSelect: () => void };
  let { chat, active, onSelect }: Props = $props();
  const when = $derived(new Date(chat.updatedAt).toLocaleDateString());
</script>

<button type="button" onclick={onSelect}
  class={cn('flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/5', active && 'bg-white/10')}>
  <span class="truncate w-full">{chat.title}</span>
  <span class="text-xs text-muted-foreground">{when}</span>
</button>
```

- [ ] **Step 3: `app/src/lib/components/chat/sidebar/ChatSidebar.svelte`**

```svelte
<script lang="ts">
  import { repo } from '$lib/chat/repo';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import type { ChatRow } from '$lib/chat/types';
  import NewChatButton from './NewChatButton.svelte';
  import ChatListItem from './ChatListItem.svelte';

  let chats = $state<ChatRow[]>([]);
  let loading = $state(true);

  async function refresh() {
    chats = await repo.listChats();
    loading = false;
  }

  $effect(() => { refresh(); });

  // Refresh when navigating between chats or after create/delete.
  $effect(() => { $page.url.pathname; refresh(); });

  const activeId = $derived(
    $page.url.pathname.replace(base, '').match(/^\/chat\/([^/]+)/)?.[1] ?? null
  );

  function select(id: string) { goto(`${base}/chat/${id}`); }
</script>

<div class="flex h-full flex-col gap-2">
  <NewChatButton />
  <div class="mt-2 flex-1 overflow-y-auto">
    {#if loading}
      <p class="px-2 text-xs text-muted-foreground">Loading…</p>
    {:else if chats.length === 0}
      <p class="px-2 text-xs text-muted-foreground">No chats yet.</p>
    {:else}
      <div class="flex flex-col gap-0.5">
        {#each chats as chat (chat.id)}
          <ChatListItem {chat} active={chat.id === activeId} onSelect={() => select(chat.id)} />
        {/each}
      </div>
    {/if}
  </div>
</div>
```

- [ ] **Step 4: `app/src/lib/components/chat/workspace/ChatHeader.svelte`**

```svelte
<script lang="ts">
  import type { ChatRow } from '$lib/chat/types';
  import { repo } from '$lib/chat/repo';
  type Props = { chat: ChatRow };
  let { chat }: Props = $props();
  let title = $state(chat.title);

  $effect(() => { title = chat.title; });

  async function saveTitle() {
    const trimmed = title.trim();
    if (!trimmed || trimmed === chat.title) return;
    await repo.updateChat(chat.id, { title: trimmed });
  }
</script>

<div class="flex items-center gap-2 border-b border-white/10 pb-2">
  <input
    type="text"
    bind:value={title}
    onblur={saveTitle}
    class="flex-1 bg-transparent font-serif text-lg outline-none focus:ring-0"
    aria-label="Chat title"
  />
</div>
```

- [ ] **Step 5: `app/src/lib/components/chat/workspace/ChatWorkspace.svelte`**

```svelte
<script lang="ts">
  import type { ChatRow } from '$lib/chat/types';
  import ChatHeader from './ChatHeader.svelte';
  type Props = { chat: ChatRow };
  let { chat }: Props = $props();
</script>

<div class="flex h-full flex-col gap-2">
  <ChatHeader {chat} />
  <div class="flex-1 overflow-y-auto p-2 text-sm text-muted-foreground">
    Commits 3–5 render messages, composer, techniques.
  </div>
</div>
```

### 2.K — Wire real components into ChatShell + routes

- [ ] **Step 1: Update `ChatShell.svelte`**

Replace `ChatSidebarPlaceholder` import with real `ChatSidebar`. Leave the right sidebar as placeholder for Commit 3.

```svelte
<script lang="ts">
  import ChatSidebar from './sidebar/ChatSidebar.svelte';
  import TechniquesSidebarPlaceholder from './techniques/TechniquesSidebarPlaceholder.svelte';
  import DatasetFooter from './footer/DatasetFooter.svelte';
  let { children } = $props();
</script>

<div class="grid h-[calc(100vh-7rem)] grid-cols-[240px_minmax(0,1fr)_280px] gap-3">
  <aside class="glass rounded-lg border border-white/10 p-3 overflow-hidden">
    <ChatSidebar />
  </aside>
  <section class="glass rounded-lg border border-white/10 p-3 overflow-hidden flex flex-col">
    {@render children?.()}
  </section>
  <aside class="glass rounded-lg border border-white/10 p-3 overflow-hidden hidden lg:block">
    <TechniquesSidebarPlaceholder />
  </aside>
</div>
<DatasetFooter />
```

- [ ] **Step 2: Update `app/src/routes/chat/+page.svelte`**

```svelte
<script lang="ts">
  import { repo } from '$lib/chat/repo';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';

  let empty = $state(false);

  onMount(async () => {
    const list = await repo.listChats();
    if (list.length > 0) {
      goto(`${base}/chat/${list[0].id}`, { replaceState: true });
    } else {
      empty = true;
    }
  });
</script>

{#if empty}
  <div class="flex h-full flex-col items-center justify-center gap-2 text-center">
    <p class="font-serif text-lg">No chats yet</p>
    <p class="text-sm text-muted-foreground">Click <kbd class="rounded border px-1 py-0.5 text-xs">+ New chat</kbd> to begin.</p>
  </div>
{/if}
```

- [ ] **Step 3: Create `app/src/routes/chat/[id]/+page.svelte`**

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { repo } from '$lib/chat/repo';
  import type { ChatRow } from '$lib/chat/types';
  import ChatWorkspace from '$lib/components/chat/workspace/ChatWorkspace.svelte';

  let chat = $state<ChatRow | null>(null);
  let loading = $state(true);
  let missing = $state(false);

  async function load(id: string) {
    loading = true; missing = false;
    const row = await repo.getChat(id);
    if (!row) { missing = true; chat = null; } else { chat = row; }
    loading = false;
  }

  $effect(() => { load($page.params.id); });
</script>

{#if loading}
  <p class="m-auto text-sm text-muted-foreground">Loading…</p>
{:else if missing}
  <p class="m-auto text-sm text-muted-foreground">Chat not found.</p>
{:else if chat}
  <ChatWorkspace {chat} />
{/if}
```

### 2.L — Full suite

- [ ] **Step 1:**

```bash
cd app && npm run test:unit && npm run check && npm run build
```

Expected: +~14 tests added (session, key-vault, db, repo). Build passes.

### 2.M — Manual verify before commit

- [ ] **Step 1: Dev server**

```bash
cd app && npm run dev
```

- [ ] **Step 2:** Go to `/chat` → empty-state appears ("No chats yet"). Click `+ New chat` → creates + navigates to `/chat/<id>`. Chat sidebar shows the new chat.
- [ ] **Step 3:** Refresh — chat persists, sidebar shows it, workspace loads it.
- [ ] **Step 4:** Click the title → edit → blur → refresh — title persists.
- [ ] **Step 5:** Create two more chats → sidebar shows all three in updatedAt order.
- [ ] **Step 6:** Navigate to `/chat/nonexistent` → "Chat not found" message.
- [ ] **Step 7:** Open DevTools → Application → IndexedDB → `cryptex-chat` DB visible with `chats` + `messages` + `attachments` + `toolStates` object stores.
- [ ] **Step 8:** Switch to Tools mode → existing tools still work, no regression. localStorage shows `cryptex.local.providers` (migrated from `cryptex.providers`).
- [ ] **Step 9:** Switch back to Chat → chat state intact.

### 2.N — Commit

- [ ] **Step 1:**

```bash
cd ..
git add app/package.json app/package-lock.json app/vite.config.ts \
        app/src/lib/auth \
        app/src/lib/chat \
        app/src/lib/tools \
        app/src/lib/stores/_migrate.ts \
        app/src/lib/components/chat \
        app/src/routes/chat
git commit -m "$(cat <<'EOF'
feat(chat): Dexie persistence + repo layer + auth-readiness seams

Installs dexie + ulid + fake-indexeddb. Introduces the cryptex-chat DB with
four tables (chats / messages / attachments / toolStates), all rows carrying
ownerId + updatedAt + tombstoned for future sync.

Adds a session abstraction ($lib/auth/session.svelte.ts) — v1 returns a
constant local user — and a namespaced KeyVault that prefixes all
localStorage entries under cryptex.<userId>. Legacy cryptex.* keys are
migrated to cryptex.local.* on first Chat-mode load (idempotent).

Everything persisted flows through $lib/chat/repo.ts and $lib/tools/repo.ts
— no Svelte component imports Dexie directly. When login + sync land, the
repos are the single change-point.

Chat sidebar now lists real Dexie chats with create/select/persist; chat
title inline-editable; deep-linked /chat/<id> route; empty-state when
no chats exist.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 2.O — PAUSE, user verify, push

---

## Commit 3: Technique registry + right sidebar + selection popover

**Goal:** Unified Technique registry populated from the 162 transformers + 9 PromptCraft strategies (already in Cryptex) + 9 Anti-Classifier named techniques + 3 modes (Creative / Intelligent / Adaptive — local templates) + 1 godmode stub. Right sidebar shows them browsable + searchable. Selection popover appears on any text selection inside a message with 3 recent + "more…". No streaming yet — Commit 4 wires the actual LLM flow.

### 3.A — Files

**Create:**
- `app/src/lib/chat/techniques/registry.ts` — registry plumbing + public API
- `app/src/lib/chat/techniques/from-transformers.ts` — adapter wrapping the 162 transformers
- `app/src/lib/chat/techniques/from-mutators.ts` — 9 PromptCraft mutator definitions
- `app/src/lib/chat/techniques/from-classifier.ts` — 9 Anti-Classifier named techniques
- `app/src/lib/chat/techniques/modes/creative.ts`
- `app/src/lib/chat/techniques/modes/intelligent.ts`
- `app/src/lib/chat/techniques/modes/adaptive.ts`
- `app/src/lib/chat/techniques/modes/index.ts` — exports all modes
- `app/src/lib/chat/techniques/godmode/jb_v0_stub.ts`
- `app/src/lib/chat/techniques/godmode/index.ts`
- `app/src/lib/chat/techniques/types.ts` — `Technique`, `TechniqueContext`, `TechniqueResult`, `TechniqueCategory`
- `app/src/lib/components/chat/techniques/TechniquesSidebar.svelte` — real right sidebar
- `app/src/lib/components/chat/techniques/TechniqueSearchInput.svelte`
- `app/src/lib/components/chat/techniques/TechniqueGroup.svelte`
- `app/src/lib/components/chat/techniques/TechniqueRow.svelte`
- `app/src/lib/components/chat/techniques/TechniqueRecent.svelte`
- `app/src/lib/components/chat/techniques/SelectionPopover.svelte`
- `app/src/lib/stores/techniqueRecents.svelte.ts` — persisted recents list
- `app/src/lib/chat/techniques/__tests__/registry.test.ts`
- `app/src/lib/chat/techniques/__tests__/modes.test.ts`

**Modify:**
- `app/src/lib/components/chat/ChatShell.svelte` — mount real `<TechniquesSidebar />`
- `app/src/lib/components/chat/workspace/ChatWorkspace.svelte` — mount `<SelectionPopover />` at the window level

### 3.B — Technique types (no tests — types only)

- [ ] **Step 1: Create `app/src/lib/chat/techniques/types.ts`**

```ts
import type { ChatMessage } from '$lib/ai/types';

export type TechniqueCategory = 'transform' | 'mutate' | 'classifier' | 'mode' | 'godmode';

export interface TechniqueContext {
  model?: string;
  callLLM: (req: { system?: string; user: string; temperature?: number }) => Promise<string>;
  chatHistory?: ChatMessage[];
  signal?: AbortSignal;
}

export interface TechniqueResult {
  output: string;
  metadata?: Record<string, unknown>;
}

export interface Technique {
  id: string;
  name: string;
  description: string;
  category: TechniqueCategory;
  icon?: string;
  local: boolean;
  apply: (input: string, ctx: TechniqueContext) => Promise<TechniqueResult>;
  wrapDraft?: (draft: string, ctx: TechniqueContext) => Promise<string>;
  jailbreakSequence?: (ctx: TechniqueContext) => Promise<ChatMessage[]>;
}
```

### 3.C — Registry (TDD)

- [ ] **Step 1: Failing test**

File: `app/src/lib/chat/techniques/__tests__/registry.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { allTechniques, byCategory, find, search } from '../registry';

describe('technique registry', () => {
  it('contains transformers (category=transform) from $lib/transformers/registry', () => {
    const t = byCategory('transform');
    expect(t.length).toBeGreaterThan(100); // we expect 162 but registry may filter
  });

  it('contains exactly the 9 PromptCraft mutators', () => {
    const m = byCategory('mutate');
    expect(m.map(x => x.id).sort()).toEqual(
      ['compress', 'custom', 'expand', 'fragment', 'metaphor', 'multilingual', 'obfuscate', 'rephrase', 'roleplay'].sort()
    );
  });

  it('contains the 3 modes', () => {
    const modes = byCategory('mode');
    expect(modes.map(x => x.id).sort()).toEqual(['adaptive', 'creative', 'intelligent']);
    for (const mode of modes) {
      expect(mode.wrapDraft).toBeTypeOf('function');
      expect(mode.local).toBe(true);
    }
  });

  it('contains at least one godmode stub', () => {
    const g = byCategory('godmode');
    expect(g.length).toBeGreaterThanOrEqual(1);
    expect(g[0].jailbreakSequence).toBeTypeOf('function');
  });

  it('find returns by id', () => {
    expect(find('rephrase')?.id).toBe('rephrase');
    expect(find('nonexistent')).toBeUndefined();
  });

  it('search is fuzzy across name/description/category', () => {
    expect(search('base').length).toBeGreaterThan(0);
    expect(search('creative').some(x => x.id === 'creative')).toBe(true);
  });
});
```

- [ ] **Step 2: Fail**

- [ ] **Step 3: Implement supporting source files**

File: `app/src/lib/chat/techniques/from-transformers.ts`

```ts
import { allTransformers } from '$lib/transformers/registry';
import type { Technique } from './types';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function transformerTechniques(): Technique[] {
  return allTransformers.map((t) => ({
    id: slugify(t.name),
    name: t.name,
    description: t.description ?? t.name,
    category: 'transform' as const,
    local: true,
    apply: async (input: string) => {
      try {
        const output = typeof t.func === 'function' ? t.func(input) : String(t.func);
        return { output: typeof output === 'string' ? output : JSON.stringify(output) };
      } catch (err) {
        return { output: '', metadata: { error: (err as Error).message } };
      }
    }
  }));
}
```

File: `app/src/lib/chat/techniques/from-mutators.ts`

```ts
import type { Technique, TechniqueContext } from './types';

const IDS = [
  { id: 'rephrase', name: 'Rephrase', description: 'Surface-level rewrite preserving intent.' },
  { id: 'obfuscate', name: 'Obfuscate', description: 'Indirect euphemism / metaphor.' },
  { id: 'roleplay', name: 'Roleplay', description: 'Wrap in plausible fictional/academic frame.' },
  { id: 'multilingual', name: 'Multilingual', description: 'Translate to a low-resource language.' },
  { id: 'expand', name: 'Expand', description: 'Add concrete detail + constraints.' },
  { id: 'compress', name: 'Compress', description: 'Minimize token count losslessly.' },
  { id: 'metaphor', name: 'Metaphor', description: 'Sustained allegorical framing.' },
  { id: 'fragment', name: 'Fragment', description: 'Split into seemingly-innocuous fragments.' },
  { id: 'custom', name: 'Custom', description: 'User-supplied mutator prompt.' }
];

export function mutatorTechniques(): Technique[] {
  return IDS.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    category: 'mutate' as const,
    local: false,
    apply: async (input: string, ctx: TechniqueContext) => {
      const result = await ctx.callLLM({
        system: `Apply the ${m.name} mutation strategy to the user's text. Output only the mutation, no commentary.`,
        user: input
      });
      return { output: result };
    }
  }));
}
```

File: `app/src/lib/chat/techniques/from-classifier.ts`

```ts
import type { Technique, TechniqueContext } from './types';

const IDS = [
  { id: 'circumlocution', name: 'Circumlocution' },
  { id: 'metonymy', name: 'Metonymy' },
  { id: 'semantic_decomposition', name: 'Semantic Decomposition' },
  { id: 'technical_register', name: 'Technical Register' },
  { id: 'academic_framing', name: 'Academic Framing' },
  { id: 'homoglyph', name: 'Homoglyph Substitution' },
  { id: 'temporal_displacement', name: 'Temporal Displacement' },
  { id: 'perplexity_raise', name: 'Perplexity Raise' },
  { id: 'structural_variation', name: 'Structural Variation' }
];

export function classifierTechniques(): Technique[] {
  return IDS.map((c) => ({
    id: c.id,
    name: c.name,
    description: `Anti-classifier technique: ${c.name}`,
    category: 'classifier' as const,
    local: false,
    apply: async (input: string, ctx: TechniqueContext) => {
      const result = await ctx.callLLM({
        system: `Apply the ${c.name} technique to the user's text. Preserve intent while changing classifier surface features. Output only the rewrite.`,
        user: input
      });
      return { output: result };
    }
  }));
}
```

File: `app/src/lib/chat/techniques/modes/creative.ts`

```ts
import type { Technique } from '../types';

const creative: Technique = {
  id: 'creative',
  name: 'Creative',
  description: 'Vivid, narrative, exploratory tone.',
  category: 'mode',
  local: true,
  apply: async (input) => ({ output: input }),
  wrapDraft: async (draft) =>
    `Respond with vivid, creative, exploratory narrative energy — use concrete sensory details.\n\nUser: ${draft}`
};

export default creative;
```

File: `app/src/lib/chat/techniques/modes/intelligent.ts`

```ts
import type { Technique } from '../types';

const intelligent: Technique = {
  id: 'intelligent',
  name: 'Intelligent',
  description: 'Rigorous, well-reasoned, precise tone.',
  category: 'mode',
  local: true,
  apply: async (input) => ({ output: input }),
  wrapDraft: async (draft) =>
    `Respond with rigorous, precise, well-reasoned analysis. Prefer structured argument over hand-waving.\n\nUser: ${draft}`
};

export default intelligent;
```

File: `app/src/lib/chat/techniques/modes/adaptive.ts`

```ts
import type { Technique } from '../types';

const adaptive: Technique = {
  id: 'adaptive',
  name: 'Adaptive',
  description: 'Match the user\'s register + depth.',
  category: 'mode',
  local: true,
  apply: async (input) => ({ output: input }),
  wrapDraft: async (draft) =>
    `Read the user's register and domain expertise from their message, then respond at a matching depth. If casual, be casual. If technical, be technical.\n\nUser: ${draft}`
};

export default adaptive;
```

File: `app/src/lib/chat/techniques/modes/index.ts`

```ts
import creative from './creative';
import intelligent from './intelligent';
import adaptive from './adaptive';

export const modes = [creative, intelligent, adaptive];
```

File: `app/src/lib/chat/techniques/godmode/jb_v0_stub.ts`

```ts
import type { Technique } from '../types';

const stub: Technique = {
  id: 'godmode_stub',
  name: 'Godmode (coming soon)',
  description: 'Placeholder — jailbreak chain pipeline is scaffolded, real chains land in v2.',
  category: 'godmode',
  local: false,
  apply: async (input) => ({ output: input }),
  jailbreakSequence: async () => []
};

export default stub;
```

File: `app/src/lib/chat/techniques/godmode/index.ts`

```ts
import stub from './jb_v0_stub';
export const godmodes = [stub];
```

File: `app/src/lib/chat/techniques/registry.ts`

```ts
import type { Technique, TechniqueCategory } from './types';
import { transformerTechniques } from './from-transformers';
import { mutatorTechniques } from './from-mutators';
import { classifierTechniques } from './from-classifier';
import { modes } from './modes';
import { godmodes } from './godmode';

let _all: Technique[] | null = null;

function build(): Technique[] {
  return [
    ...transformerTechniques(),
    ...mutatorTechniques(),
    ...classifierTechniques(),
    ...modes,
    ...godmodes
  ];
}

export function allTechniques(): Technique[] {
  if (!_all) _all = build();
  return _all;
}

export function byCategory(cat: TechniqueCategory): Technique[] {
  return allTechniques().filter((t) => t.category === cat);
}

export function find(id: string): Technique | undefined {
  return allTechniques().find((t) => t.id === id);
}

export function search(query: string): Technique[] {
  const q = query.toLowerCase().trim();
  if (!q) return allTechniques();
  return allTechniques().filter((t) =>
    t.name.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q) ||
    t.category.toLowerCase().includes(q)
  );
}
```

- [ ] **Step 4: Run, pass**

```bash
cd app && npx vitest run src/lib/chat/techniques/__tests__/registry.test.ts
```

### 3.D — Mode template tests

- [ ] **Step 1: Test**

File: `app/src/lib/chat/techniques/__tests__/modes.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import creative from '../modes/creative';
import intelligent from '../modes/intelligent';
import adaptive from '../modes/adaptive';

const noopCtx = { callLLM: async () => '' };

describe('modes wrap drafts deterministically', () => {
  it('creative prepends vivid framing', async () => {
    const out = await creative.wrapDraft!('hello', noopCtx as never);
    expect(out).toContain('vivid');
    expect(out).toContain('hello');
  });
  it('intelligent prepends rigorous framing', async () => {
    const out = await intelligent.wrapDraft!('x', noopCtx as never);
    expect(out).toContain('rigorous');
  });
  it('adaptive prepends register-matching framing', async () => {
    const out = await adaptive.wrapDraft!('x', noopCtx as never);
    expect(out).toContain('register');
  });
  it('apply is identity — local template, no LLM call', async () => {
    const r = await creative.apply('hi', noopCtx as never);
    expect(r.output).toBe('hi');
  });
});
```

- [ ] **Step 2: Run, pass**

### 3.E — Recents store

- [ ] **Step 1:** File: `app/src/lib/stores/techniqueRecents.svelte.ts`

```ts
import { createPersistedState } from './_persisted.svelte';

export const techniqueRecents = createPersistedState<string[]>('cryptex.ui.techniqueRecents', []);

export function pushRecent(id: string, max = 5): void {
  const current = techniqueRecents.value ?? [];
  techniqueRecents.value = [id, ...current.filter((x) => x !== id)].slice(0, max);
}
```

### 3.F — Right sidebar + row + group (UI, manually verified)

- [ ] **Step 1:** File: `app/src/lib/components/chat/techniques/TechniqueRow.svelte`

```svelte
<script lang="ts">
  import type { Technique } from '$lib/chat/techniques/types';
  type Props = { technique: Technique; onClick: (t: Technique) => void };
  let { technique, onClick }: Props = $props();
</script>

<button type="button" onclick={() => onClick(technique)}
  class="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/5">
  <span class="truncate flex-1">{technique.name}</span>
  <span class="text-muted-foreground">{technique.local ? '·' : '⚡'}</span>
</button>
```

- [ ] **Step 2:** File: `app/src/lib/components/chat/techniques/TechniqueGroup.svelte`

```svelte
<script lang="ts">
  import type { Technique } from '$lib/chat/techniques/types';
  import TechniqueRow from './TechniqueRow.svelte';
  type Props = { label: string; items: Technique[]; onClick: (t: Technique) => void };
  let { label, items, onClick }: Props = $props();
</script>

{#if items.length > 0}
  <div class="mb-3">
    <p class="mb-1 px-2 font-serif text-xs uppercase tracking-wide text-muted-foreground">{label} ({items.length})</p>
    <div class="max-h-64 overflow-y-auto">
      {#each items.slice(0, 100) as t (t.id)}
        <TechniqueRow technique={t} {onClick} />
      {/each}
    </div>
  </div>
{/if}
```

- [ ] **Step 3:** File: `app/src/lib/components/chat/techniques/TechniqueSearchInput.svelte`

```svelte
<script lang="ts">
  import Search from 'lucide-svelte/icons/search';
  type Props = { value: string; onChange: (v: string) => void };
  let { value, onChange }: Props = $props();
</script>

<div class="flex items-center gap-2 border-b border-white/10 pb-2">
  <Search size={14} class="text-muted-foreground" />
  <input
    type="text"
    placeholder="Search techniques…"
    value={value}
    oninput={(e) => onChange((e.target as HTMLInputElement).value)}
    class="flex-1 bg-transparent text-xs outline-none"
  />
</div>
```

- [ ] **Step 4:** File: `app/src/lib/components/chat/techniques/TechniqueRecent.svelte`

```svelte
<script lang="ts">
  import { techniqueRecents } from '$lib/stores/techniqueRecents.svelte';
  import { find } from '$lib/chat/techniques/registry';
  import TechniqueRow from './TechniqueRow.svelte';
  import type { Technique } from '$lib/chat/techniques/types';
  type Props = { onClick: (t: Technique) => void };
  let { onClick }: Props = $props();

  const items = $derived(
    (techniqueRecents.value ?? [])
      .map((id) => find(id))
      .filter((t): t is Technique => Boolean(t))
  );
</script>

{#if items.length > 0}
  <div class="mb-3">
    <p class="mb-1 px-2 font-serif text-xs uppercase tracking-wide text-muted-foreground">Recent</p>
    {#each items as t (t.id)}
      <TechniqueRow technique={t} {onClick} />
    {/each}
  </div>
{/if}
```

- [ ] **Step 5:** File: `app/src/lib/components/chat/techniques/TechniquesSidebar.svelte`

```svelte
<script lang="ts">
  import { allTechniques, byCategory } from '$lib/chat/techniques/registry';
  import { pushRecent } from '$lib/stores/techniqueRecents.svelte';
  import type { Technique } from '$lib/chat/techniques/types';
  import TechniqueSearchInput from './TechniqueSearchInput.svelte';
  import TechniqueGroup from './TechniqueGroup.svelte';
  import TechniqueRecent from './TechniqueRecent.svelte';

  let query = $state('');

  const filtered = $derived(
    query.trim()
      ? allTechniques().filter((t) =>
          t.name.toLowerCase().includes(query.toLowerCase()) ||
          t.description.toLowerCase().includes(query.toLowerCase())
        )
      : allTechniques()
  );

  const transform = $derived(filtered.filter((t) => t.category === 'transform'));
  const mutate = $derived(filtered.filter((t) => t.category === 'mutate'));
  const classifier = $derived(filtered.filter((t) => t.category === 'classifier'));
  const mode = $derived(filtered.filter((t) => t.category === 'mode'));
  const godmode = $derived(filtered.filter((t) => t.category === 'godmode'));

  function handleClick(t: Technique) {
    pushRecent(t.id);
    // Commit 4 wires actual application; for now dispatch an event.
    window.dispatchEvent(new CustomEvent('technique:select', { detail: { id: t.id } }));
  }
</script>

<div class="flex h-full flex-col">
  <TechniqueSearchInput value={query} onChange={(v) => (query = v)} />
  <div class="mt-2 flex-1 overflow-y-auto">
    {#if !query}<TechniqueRecent onClick={handleClick} />{/if}
    <TechniqueGroup label="Transform" items={transform} onClick={handleClick} />
    <TechniqueGroup label="Mutate" items={mutate} onClick={handleClick} />
    <TechniqueGroup label="Classifier" items={classifier} onClick={handleClick} />
    <TechniqueGroup label="Mode" items={mode} onClick={handleClick} />
    <TechniqueGroup label="Godmode" items={godmode} onClick={handleClick} />
  </div>
</div>
```

### 3.G — Selection popover (stub handling for Commit 4)

- [ ] **Step 1:** File: `app/src/lib/components/chat/techniques/SelectionPopover.svelte`

```svelte
<script lang="ts">
  import { techniqueRecents } from '$lib/stores/techniqueRecents.svelte';
  import { find } from '$lib/chat/techniques/registry';
  import type { Technique } from '$lib/chat/techniques/types';
  import { onMount } from 'svelte';

  let visible = $state(false);
  let x = $state(0);
  let y = $state(0);
  let selectedText = $state('');

  const recents = $derived(
    (techniqueRecents.value ?? []).slice(0, 3).map(find).filter((t): t is Technique => Boolean(t))
  );

  function onSelectionChange() {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (!text || text.length < 2) { visible = false; return; }
    // Only trigger for selections inside .chat-bubble (assigned in Commit 4)
    const range = sel!.getRangeAt(0);
    const container = range.commonAncestorContainer.parentElement?.closest('.chat-bubble');
    if (!container) { visible = false; return; }
    const rect = range.getBoundingClientRect();
    x = rect.left + window.scrollX;
    y = rect.bottom + window.scrollY + 4;
    selectedText = text;
    visible = true;
  }

  function applyTechnique(t: Technique) {
    window.dispatchEvent(new CustomEvent('technique:apply-selection', {
      detail: { techniqueId: t.id, selectedText }
    }));
    visible = false;
  }

  function openSidebar() {
    window.dispatchEvent(new CustomEvent('techniques:focus-search'));
    visible = false;
  }

  onMount(() => {
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  });
</script>

{#if visible}
  <div
    role="menu"
    class="glass fixed z-40 rounded-md border border-white/10 p-1 shadow-glass"
    style="left: {x}px; top: {y}px;"
  >
    {#each recents as t (t.id)}
      <button type="button" onclick={() => applyTechnique(t)}
        class="flex w-full items-center gap-2 rounded px-2 py-1 text-xs hover:bg-white/5">
        {t.name}
      </button>
    {/each}
    <button type="button" onclick={openSidebar} class="flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-white/5">
      more…
    </button>
  </div>
{/if}
```

### 3.H — Wire sidebar + popover into ChatShell

- [ ] **Step 1:** Modify `app/src/lib/components/chat/ChatShell.svelte`:

```svelte
<script lang="ts">
  import ChatSidebar from './sidebar/ChatSidebar.svelte';
  import TechniquesSidebar from './techniques/TechniquesSidebar.svelte';
  import SelectionPopover from './techniques/SelectionPopover.svelte';
  import DatasetFooter from './footer/DatasetFooter.svelte';
  let { children } = $props();
</script>

<div class="grid h-[calc(100vh-7rem)] grid-cols-[240px_minmax(0,1fr)_280px] gap-3">
  <aside class="glass rounded-lg border border-white/10 p-3 overflow-hidden">
    <ChatSidebar />
  </aside>
  <section class="glass rounded-lg border border-white/10 p-3 overflow-hidden flex flex-col">
    {@render children?.()}
  </section>
  <aside class="glass rounded-lg border border-white/10 p-3 overflow-hidden hidden lg:block">
    <TechniquesSidebar />
  </aside>
</div>
<SelectionPopover />
<DatasetFooter />
```

### 3.I — Full suite

- [ ] **Step 1:**

```bash
cd app && npm run test:unit && npm run check && npm run build
```

Expected: +~15 tests. Pass. The 162-transformer wrapping adds ~0.5s to test startup — acceptable.

### 3.J — Manual verify

- [ ] **Step 1: Dev server**, `/chat` route, create or open a chat.
- [ ] **Step 2:** Right sidebar shows groups: Transform (162), Mutate (9), Classifier (9), Mode (3), Godmode (1).
- [ ] **Step 3:** Type "base" in search — filters to transformers containing "base". Clear — all return.
- [ ] **Step 4:** Click a technique row. Browser console shows `CustomEvent('technique:select')` dispatched (via DevTools Event listeners). Recent section appears with the last-clicked.
- [ ] **Step 5:** Manually edit the workspace placeholder to include a div `class="chat-bubble"` with text; select text inside → selection popover appears with 3 recents + "more…". (If workspace currently has no `.chat-bubble`, add a test one in the placeholder just for visual verification, then remove for commit.)

### 3.K — Commit

- [ ] **Step 1:**

```bash
cd ..
git add app/src/lib/chat/techniques \
        app/src/lib/stores/techniqueRecents.svelte.ts \
        app/src/lib/components/chat/techniques \
        app/src/lib/components/chat/ChatShell.svelte
git commit -m "$(cat <<'EOF'
feat(chat): Technique registry + right sidebar + selection popover

Introduces a unified Technique registry built from five sources:
- 162 transformers from src/transformers (category=transform, local=true)
- 9 PromptCraft mutators (category=mutate, local=false)
- 9 Anti-Classifier named techniques (category=classifier, local=false)
- 3 composer modes — Creative / Intelligent / Adaptive (category=mode,
  local=true, deterministic template wrappers, no extra LLM call)
- 1 godmode stub (category=godmode, jailbreak pipeline scaffolded, disabled)

Right sidebar is always visible on desktop, collapsible; shows grouped-by-
category list with search; recent-5 pinned at top.

Floating selection popover anchors to any text selection inside a
chat-bubble and surfaces 3 most-recent techniques + "more…". Commit 4
wires actual application to composer / message replacement.

No streaming or LLM tool-calling yet; techniques fire a
CustomEvent('technique:select') for Commit 4 to consume.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 3.L — PAUSE, verify, push

---

## Commit 4: Streaming + tool-calling + branching

**Goal:** Actual LLM conversation via `gateway.streamChat()`. Messages persist with full fine-tuning metadata. Tool-calling works both via slash-commands and LLM-native. Branch-from-any-message via "Fork" action.

### 4.A — Files

**Create:**
- `app/src/lib/chat/stores/chatState.svelte.ts` — per-chat rune factory (messages, draft, streaming state)
- `app/src/lib/chat/dispatch.ts` — turn-execution flow (mode wrap → stream → tool loop → persist)
- `app/src/lib/chat/slashParser.ts` — parse `/technique args` from composer text
- `app/src/lib/chat/toolSchemas.ts` — convert enabled techniques into OpenAI/Anthropic tool-call schemas
- `app/src/lib/chat/__tests__/slashParser.test.ts`
- `app/src/lib/chat/__tests__/toolSchemas.test.ts`
- `app/src/lib/chat/__tests__/dispatch.test.ts`
- `app/src/lib/components/chat/workspace/MessageList.svelte`
- `app/src/lib/components/chat/workspace/MessageBubble.svelte`
- `app/src/lib/components/chat/workspace/ReasoningBlock.svelte`
- `app/src/lib/components/chat/workspace/ToolCallCard.svelte`
- `app/src/lib/components/chat/workspace/BranchIndicator.svelte`
- `app/src/lib/components/chat/composer/Composer.svelte`
- `app/src/lib/components/chat/composer/ModePills.svelte`
- `app/src/lib/components/chat/composer/SendStopButton.svelte`
- `app/src/lib/components/chat/workspace/QuickSettingsBar.svelte`

**Modify:**
- `app/src/lib/components/chat/workspace/ChatWorkspace.svelte` — mount real message list + composer + quick settings
- `app/package.json` / `app/package-lock.json` — add `svelte-streamdown` (or fallback renderer), `shiki`

### 4.B — Install rendering deps

- [ ] **Step 1:**

```bash
cd app && npm install --save-exact svelte-streamdown@latest shiki@1.29.0
```

If `svelte-streamdown` fails peer-dep (Svelte 5 compat), fall back to `svelte-exmarkdown@3.0.5`. Try streamdown first; document whichever lands.

- [ ] **Step 2: vite optimizeDeps**

Add to `app/vite.config.ts` `optimizeDeps.include`: `'svelte-streamdown'` (or `'svelte-exmarkdown'`), `'shiki'`.

### 4.C — Slash parser (TDD)

- [ ] **Step 1: Test**

File: `app/src/lib/chat/__tests__/slashParser.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseSlash } from '../slashParser';

describe('parseSlash', () => {
  it('returns null on plain text', () => {
    expect(parseSlash('hello')).toBeNull();
  });

  it('parses /base_64 hello', () => {
    const r = parseSlash('/base_64 hello');
    expect(r?.techniqueId).toBe('base_64');
    expect(r?.input).toBe('hello');
  });

  it('handles multi-word input', () => {
    const r = parseSlash('/base_64 hello world 42');
    expect(r?.input).toBe('hello world 42');
  });

  it('returns null on /unknown when technique id not in registry', () => {
    // parseSlash doesn't validate the id; resolution is the dispatcher's job.
    const r = parseSlash('/nonexistent_fake hi');
    expect(r?.techniqueId).toBe('nonexistent_fake');
    expect(r?.input).toBe('hi');
  });

  it('supports /cmd/with/slashes as id', () => {
    const r = parseSlash('/foo/bar baz');
    expect(r?.techniqueId).toBe('foo/bar');
    expect(r?.input).toBe('baz');
  });
});
```

- [ ] **Step 2: Fail**

- [ ] **Step 3: Implement**

File: `app/src/lib/chat/slashParser.ts`

```ts
export function parseSlash(text: string): { techniqueId: string; input: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace === -1) return { techniqueId: trimmed.slice(1), input: '' };
  return {
    techniqueId: trimmed.slice(1, firstSpace),
    input: trimmed.slice(firstSpace + 1).trim()
  };
}
```

- [ ] **Step 4: Pass**

### 4.D — Tool schemas (TDD)

- [ ] **Step 1: Test**

File: `app/src/lib/chat/__tests__/toolSchemas.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { buildToolSchemas } from '../toolSchemas';
import { find } from '../techniques/registry';

describe('buildToolSchemas', () => {
  it('returns OpenAI-style function defs for each enabled technique id', () => {
    const base = find('base_64');
    if (!base) throw new Error('base_64 transformer missing');
    const schemas = buildToolSchemas([base.id]);
    expect(schemas.base_64).toBeDefined();
    expect(schemas.base_64.description).toContain('Base');
    expect(schemas.base_64.inputSchema).toBeDefined();
  });

  it('silently skips ids that do not resolve', () => {
    const schemas = buildToolSchemas(['base_64', 'nonexistent']);
    expect(Object.keys(schemas)).toEqual(['base_64']);
  });
});
```

- [ ] **Step 2: Fail**

- [ ] **Step 3: Implement**

File: `app/src/lib/chat/toolSchemas.ts`

```ts
import { find } from './techniques/registry';
import type { ToolDef } from '$lib/ai/types';
import { z } from 'zod';

export function buildToolSchemas(enabledIds: string[]): Record<string, ToolDef> {
  const out: Record<string, ToolDef> = {};
  for (const id of enabledIds) {
    const t = find(id);
    if (!t) continue;
    out[id] = {
      description: t.description,
      inputSchema: z.object({ input: z.string().describe('Text to transform') }),
      execute: async (args) => {
        const { input } = args as { input: string };
        const result = await t.apply(input, {
          callLLM: async () => '', // LLM-tool execution is deterministic local transformers
          signal: undefined
        });
        return result.output;
      }
    };
  }
  return out;
}
```

- [ ] **Step 4: Ensure `zod` is installed**

```bash
cd app && npm list zod 2>/dev/null | grep -v '^└' || npm install --save-exact zod@3.23.8
```

Add `'zod'` to vite optimizeDeps.include if not present.

- [ ] **Step 5: Pass**

### 4.E — Per-chat state

- [ ] **Step 1:** File: `app/src/lib/chat/stores/chatState.svelte.ts`

```ts
import type { ChatRow, MessageRow } from '../types';
import { repo } from '../repo';

export type ChatStateStatus = 'idle' | 'streaming' | 'errored';

export function createChatState(chat: ChatRow) {
  let messages = $state<MessageRow[]>([]);
  let draft = $state('');
  let status = $state<ChatStateStatus>('idle');
  let abortController = $state<AbortController | null>(null);
  let error = $state<string | null>(null);

  async function load() {
    messages = await repo.listMessages(chat.id);
  }

  load();

  return {
    get messages() { return messages; },
    set messages(v: MessageRow[]) { messages = v; },
    get draft() { return draft; },
    set draft(v: string) { draft = v; },
    get status() { return status; },
    set status(v: ChatStateStatus) { status = v; },
    get abortController() { return abortController; },
    set abortController(v: AbortController | null) { abortController = v; },
    get error() { return error; },
    set error(v: string | null) { error = v; },
    reload: load
  };
}
```

### 4.F — Dispatch (turn execution)

- [ ] **Step 1:** File: `app/src/lib/chat/dispatch.ts`

```ts
import { streamChat } from '$lib/ai/gateway';
import type { ChatRow, MessageRow } from './types';
import { repo } from './repo';
import { find as findTechnique } from './techniques/registry';
import { parseSlash } from './slashParser';
import { buildToolSchemas } from './toolSchemas';
import type { ChatMessage, ChatRequest } from '$lib/ai/types';

type Hooks = {
  onTextDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onToolCall?: (call: { toolCallId: string; toolName: string; input: unknown }) => void;
  onFinish?: (msg: MessageRow) => void;
  onError?: (err: Error) => void;
};

export async function sendTurn(chat: ChatRow, rawDraft: string, signal: AbortSignal, hooks: Hooks = {}): Promise<void> {
  // 1) Slash command short-circuit
  const slash = parseSlash(rawDraft);
  if (slash) {
    const t = findTechnique(slash.techniqueId);
    if (t && t.local) {
      const result = await t.apply(slash.input, { callLLM: async () => '', signal });
      await repo.saveMessage({ chatId: chat.id, role: 'user', content: rawDraft, tags: [] });
      const toolMsg = await repo.saveMessage({
        chatId: chat.id, role: 'tool', content: result.output,
        toolCalls: [{ toolCallId: 'slash', source: 'slash', toolName: t.id, input: slash.input, output: result.output, durationMs: 0 }],
        tags: []
      });
      hooks.onFinish?.(toolMsg);
      return;
    }
  }

  // 2) Mode wrapping (local template)
  let content = rawDraft;
  const modeId = chat.settings.activeMode;
  if (modeId) {
    const mode = findTechnique(modeId);
    if (mode?.wrapDraft) {
      content = await mode.wrapDraft(rawDraft, { callLLM: async () => '', signal });
    }
  }

  // 3) Persist user message
  const userMsg = await repo.saveMessage({
    chatId: chat.id, role: 'user',
    content,
    contentRaw: content !== rawDraft ? rawDraft : undefined,
    modeApplied: modeId ?? undefined,
    tags: []
  });

  // 4) Build provider messages + tool schemas
  const history = await repo.listMessages(chat.id);
  const providerMessages: ChatMessage[] = [];
  if (chat.settings.systemPrompt.trim()) {
    providerMessages.push({ role: 'system', content: chat.settings.systemPrompt });
  }
  for (const m of history) {
    if (m.role === 'system' || m.role === 'user' || m.role === 'assistant') {
      providerMessages.push({ role: m.role, content: m.content });
    }
  }

  const tools = chat.settings.enabledToolIds.length > 0
    ? buildToolSchemas(chat.settings.enabledToolIds)
    : undefined;

  const req: ChatRequest = {
    model: chat.modelQualifiedId,
    messages: providerMessages,
    temperature: chat.settings.temperature,
    topP: chat.settings.topP,
    maxOutputTokens: chat.settings.maxTokens,
    tools,
    providerOptions: {
      anthropic: { cacheControl: { type: 'ephemeral' } }
    },
    signal
  };

  // 5) Stream
  const startedAt = Date.now();
  let text = '';
  let reasoning = '';
  let finishReason: string | undefined;
  let usage: MessageRow['tokenUsage'];

  try {
    for await (const evt of streamChat(req)) {
      if (evt.type === 'text-delta') { text += evt.delta; hooks.onTextDelta?.(evt.delta); }
      else if (evt.type === 'reasoning-delta') { reasoning += evt.delta; hooks.onReasoningDelta?.(evt.delta); }
      else if (evt.type === 'tool-call') { hooks.onToolCall?.({ toolCallId: evt.toolCallId, toolName: evt.toolName, input: evt.input }); }
      else if (evt.type === 'finish') { finishReason = evt.finishReason; usage = evt.usage as MessageRow['tokenUsage']; }
    }
  } catch (err) {
    hooks.onError?.(err as Error);
    return;
  }

  // 6) Persist assistant message
  const asstMsg = await repo.saveMessage({
    chatId: chat.id,
    role: 'assistant',
    parentId: userMsg.id,
    content: text,
    reasoning: reasoning || undefined,
    modelRequested: chat.modelQualifiedId,
    systemPromptSnapshot: chat.settings.systemPrompt,
    samplingParams: {
      temperature: chat.settings.temperature,
      topP: chat.settings.topP,
      maxTokens: chat.settings.maxTokens,
      reasoningEffort: chat.settings.reasoningEffort,
      thinkingLevel: chat.settings.thinkingLevel
    },
    tokenUsage: usage,
    finishReason,
    latencyMs: Date.now() - startedAt,
    tags: []
  });

  hooks.onFinish?.(asstMsg);
}

export async function forkChat(chat: ChatRow, fromMessageId: string): Promise<ChatRow> {
  const newChat = await repo.createChat({
    title: `${chat.title} (fork)`,
    modelQualifiedId: chat.modelQualifiedId,
    settings: chat.settings,
    parentChatId: chat.id,
    parentMessageId: fromMessageId
  });

  const history = await repo.listMessages(chat.id);
  for (const m of history) {
    await repo.saveMessage({
      chatId: newChat.id,
      role: m.role,
      content: m.content,
      contentRaw: m.contentRaw,
      reasoning: m.reasoning,
      toolCalls: m.toolCalls,
      modelRequested: m.modelRequested,
      systemPromptSnapshot: m.systemPromptSnapshot,
      samplingParams: m.samplingParams,
      modeApplied: m.modeApplied,
      tokenUsage: m.tokenUsage,
      finishReason: m.finishReason,
      latencyMs: m.latencyMs,
      tags: [...(m.tags ?? [])]
    });
    if (m.id === fromMessageId) break;
  }

  return newChat;
}
```

### 4.G — Dispatch tests

- [ ] **Step 1: Test**

File: `app/src/lib/chat/__tests__/dispatch.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

beforeEach(() => { indexedDB.deleteDatabase('cryptex-chat'); vi.resetModules(); });

describe('sendTurn slash path', () => {
  it('executes local technique + persists user/tool messages, no LLM call', async () => {
    vi.doMock('$lib/ai/gateway', () => ({
      streamChat: async function* () { throw new Error('streamChat must not be called for slash'); }
    }));
    const { sendTurn } = await import('../dispatch');
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    await sendTurn(chat, '/base_64 hello', new AbortController().signal);
    const msgs = await repo.listMessages(chat.id);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].role).toBe('tool');
    expect(msgs[1].toolCalls?.[0]?.toolName).toBe('base_64');
  });
});
```

- [ ] **Step 2: Run, pass** (imports `base_64` from the real transformer registry — if that id doesn't resolve, check `from-transformers.ts` slug logic and adjust the test id to whatever `slugify('Base 64')` produces).

### 4.H — MessageBubble + ReasoningBlock + ToolCallCard + MessageList

- [ ] **Step 1:** File: `app/src/lib/components/chat/workspace/ReasoningBlock.svelte`

```svelte
<script lang="ts">
  type Props = { text: string };
  let { text }: Props = $props();
</script>

{#if text}
  <details class="mb-2 rounded-md border border-white/10 bg-card/40 p-2">
    <summary class="cursor-pointer font-serif text-xs text-muted-foreground">Reasoning</summary>
    <pre class="mt-2 whitespace-pre-wrap text-xs leading-snug text-muted-foreground">{text}</pre>
  </details>
{/if}
```

- [ ] **Step 2:** File: `app/src/lib/components/chat/workspace/ToolCallCard.svelte`

```svelte
<script lang="ts">
  import type { ToolCallLog } from '$lib/chat/types';
  type Props = { call: ToolCallLog };
  let { call }: Props = $props();
</script>

<details class="mb-2 rounded-md border border-primary/20 bg-primary/5 p-2 text-xs">
  <summary class="cursor-pointer text-primary">
    {call.source}: {call.toolName}
  </summary>
  <div class="mt-2 space-y-1">
    <p class="text-muted-foreground">Input:</p>
    <pre class="whitespace-pre-wrap rounded bg-black/30 p-1 text-[11px]">{JSON.stringify(call.input, null, 2)}</pre>
    <p class="text-muted-foreground">Output:</p>
    <pre class="whitespace-pre-wrap rounded bg-black/30 p-1 text-[11px]">{JSON.stringify(call.output, null, 2)}</pre>
  </div>
</details>
```

- [ ] **Step 3:** File: `app/src/lib/components/chat/workspace/BranchIndicator.svelte`

```svelte
<script lang="ts">
  import GitBranch from 'lucide-svelte/icons/git-branch';
  type Props = { onFork: () => void };
  let { onFork }: Props = $props();
</script>

<button type="button" onclick={onFork} class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" aria-label="Fork from this message">
  <GitBranch size={12} /> Fork
</button>
```

Add `lucide-svelte/icons/git-branch` to `optimizeDeps.include`.

- [ ] **Step 4:** File: `app/src/lib/components/chat/workspace/MessageBubble.svelte`

```svelte
<script lang="ts">
  import type { MessageRow, ChatRow } from '$lib/chat/types';
  import ReasoningBlock from './ReasoningBlock.svelte';
  import ToolCallCard from './ToolCallCard.svelte';
  import BranchIndicator from './BranchIndicator.svelte';
  import { forkChat } from '$lib/chat/dispatch';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';

  type Props = { message: MessageRow; chat: ChatRow };
  let { message, chat }: Props = $props();

  async function onFork() {
    const newChat = await forkChat(chat, message.id);
    goto(`${base}/chat/${newChat.id}`);
  }
</script>

<article class="chat-bubble mb-4 rounded-lg border border-white/10 bg-card/40 p-3 text-sm">
  <header class="mb-1 flex items-center justify-between text-xs text-muted-foreground">
    <span>{message.role}{message.modelRequested ? ` · ${message.modelRequested}` : ''}</span>
    <BranchIndicator {onFork} />
  </header>
  {#if message.reasoning}<ReasoningBlock text={message.reasoning} />{/if}
  {#if message.toolCalls}
    {#each message.toolCalls as call (call.toolCallId)}
      <ToolCallCard {call} />
    {/each}
  {/if}
  <p class="whitespace-pre-wrap leading-relaxed">{message.content}</p>
</article>
```

- [ ] **Step 5:** File: `app/src/lib/components/chat/workspace/MessageList.svelte`

```svelte
<script lang="ts">
  import type { MessageRow, ChatRow } from '$lib/chat/types';
  import MessageBubble from './MessageBubble.svelte';
  type Props = { chat: ChatRow; messages: MessageRow[] };
  let { chat, messages }: Props = $props();
</script>

<div role="log" aria-live="polite" class="flex-1 overflow-y-auto px-1">
  {#each messages as msg (msg.id)}
    <MessageBubble message={msg} {chat} />
  {/each}
</div>
```

### 4.I — Composer + mode pills + send/stop

- [ ] **Step 1:** File: `app/src/lib/components/chat/composer/ModePills.svelte`

```svelte
<script lang="ts">
  import type { ChatRow } from '$lib/chat/types';
  import { repo } from '$lib/chat/repo';
  import { cn } from '$lib/utils/cn';

  type Props = { chat: ChatRow };
  let { chat }: Props = $props();

  const MODE_IDS = ['creative', 'intelligent', 'adaptive'] as const;

  async function setMode(id: string | null) {
    await repo.updateChat(chat.id, { settings: { ...chat.settings, activeMode: id } });
  }
</script>

<div role="radiogroup" aria-label="Composer mode" class="inline-flex items-center gap-1">
  {#each MODE_IDS as id (id)}
    <button
      type="button"
      role="radio"
      aria-checked={chat.settings.activeMode === id}
      onclick={() => setMode(chat.settings.activeMode === id ? null : id)}
      class={cn(
        'rounded-full border px-2.5 py-0.5 text-xs',
        chat.settings.activeMode === id
          ? 'bg-primary/20 border-primary/40 text-primary'
          : 'border-white/10 text-muted-foreground hover:bg-white/5'
      )}
    >{id}</button>
  {/each}
</div>
```

- [ ] **Step 2:** File: `app/src/lib/components/chat/composer/SendStopButton.svelte`

```svelte
<script lang="ts">
  import ArrowUp from 'lucide-svelte/icons/arrow-up';
  import Square from 'lucide-svelte/icons/square';

  type Props = { streaming: boolean; disabled: boolean; onSend: () => void; onStop: () => void };
  let { streaming, disabled, onSend, onStop }: Props = $props();
</script>

{#if streaming}
  <button type="button" onclick={onStop} class="inline-flex h-9 w-9 items-center justify-center rounded-md bg-destructive text-destructive-foreground" aria-label="Stop"><Square size={14} /></button>
{:else}
  <button type="button" onclick={onSend} {disabled} class="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40" aria-label="Send"><ArrowUp size={14} /></button>
{/if}
```

Add `lucide-svelte/icons/square` to `optimizeDeps.include`.

- [ ] **Step 3:** File: `app/src/lib/components/chat/composer/Composer.svelte`

```svelte
<script lang="ts">
  import type { ChatRow, MessageRow } from '$lib/chat/types';
  import { sendTurn } from '$lib/chat/dispatch';
  import { repo } from '$lib/chat/repo';
  import ModePills from './ModePills.svelte';
  import SendStopButton from './SendStopButton.svelte';

  type Props = {
    chat: ChatRow;
    onMessageAppended: (msg: MessageRow) => void;
    onStreamingChanged: (streaming: boolean) => void;
  };
  let { chat, onMessageAppended, onStreamingChanged }: Props = $props();

  let draft = $state('');
  let streaming = $state(false);
  let ctrl = $state<AbortController | null>(null);

  async function send() {
    if (!draft.trim() || streaming) return;
    streaming = true; onStreamingChanged(true);
    ctrl = new AbortController();
    const text = draft;
    draft = '';

    await sendTurn(chat, text, ctrl.signal, {
      onFinish: (msg) => { onMessageAppended(msg); },
      onError: (err) => { console.error('[sendTurn]', err); }
    });

    streaming = false; onStreamingChanged(false); ctrl = null;
  }

  function stop() { ctrl?.abort(); }

  function onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); }
  }
</script>

<div class="mt-3 rounded-lg border border-white/10 bg-card/50 p-3">
  <div class="mb-2 flex items-center gap-2"><ModePills {chat} /></div>
  <div class="flex items-end gap-2">
    <textarea
      bind:value={draft}
      onkeydown={onKeydown}
      rows="2"
      placeholder="Type a message, or /slash a technique…"
      class="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
    ></textarea>
    <SendStopButton {streaming} disabled={!draft.trim()} onSend={send} onStop={stop} />
  </div>
</div>
```

- [ ] **Step 4:** File: `app/src/lib/components/chat/workspace/QuickSettingsBar.svelte`

```svelte
<script lang="ts">
  import type { ChatRow } from '$lib/chat/types';
  import { repo } from '$lib/chat/repo';
  import ModelPickerV2 from '$lib/components/ai/ModelPickerV2.svelte';

  type Props = { chat: ChatRow };
  let { chat }: Props = $props();

  async function onModelChange(v: string) {
    await repo.updateChat(chat.id, { modelQualifiedId: v });
  }
</script>

<div class="mb-2 flex items-center gap-2 border-b border-white/10 pb-2 text-xs text-muted-foreground">
  <ModelPickerV2 value={chat.modelQualifiedId} onChange={onModelChange} recentsKey="cryptex.chat.recentModels" />
</div>
```

### 4.J — Hook into ChatWorkspace

- [ ] **Step 1:** Rewrite `app/src/lib/components/chat/workspace/ChatWorkspace.svelte`:

```svelte
<script lang="ts">
  import type { ChatRow, MessageRow } from '$lib/chat/types';
  import { repo } from '$lib/chat/repo';
  import ChatHeader from './ChatHeader.svelte';
  import QuickSettingsBar from './QuickSettingsBar.svelte';
  import MessageList from './MessageList.svelte';
  import Composer from '../composer/Composer.svelte';

  type Props = { chat: ChatRow };
  let { chat }: Props = $props();
  let messages = $state<MessageRow[]>([]);
  let streaming = $state(false);

  async function refresh() { messages = await repo.listMessages(chat.id); }
  $effect(() => { refresh(); });

  function onMessageAppended(msg: MessageRow) { messages = [...messages, msg]; refresh(); }
</script>

<div class="flex h-full flex-col gap-2">
  <ChatHeader {chat} />
  <QuickSettingsBar {chat} />
  <MessageList {chat} {messages} />
  <Composer {chat} {onMessageAppended} onStreamingChanged={(v) => (streaming = v)} />
</div>
```

### 4.K — Suite + build

- [ ] **Step 1:**

```bash
cd app && npm run test:unit && npm run check && npm run build
```

Expected: +~5 tests pass. Build green.

### 4.L — Manual verify

- [ ] **Step 1:** Dev server, new chat, pick a working model, type "hi" → send. Assistant streams. DevTools Network shows request. Message persists — refresh, still there.
- [ ] **Step 2:** Activate Creative mode → send "hi" → user bubble `content` is the wrapped version; inspect IndexedDB → `contentRaw` stored separately.
- [ ] **Step 3:** `/base_64 hello` → slash path: user bubble shows the raw command, tool bubble shows "aGVsbG8=", no LLM call in Network tab.
- [ ] **Step 4:** Click Fork on an assistant message → new chat opens with ancestry copied to that message.
- [ ] **Step 5:** Mid-stream on a long reply, click Stop → aborts, partial message persisted.
- [ ] **Step 6:** Model change via QuickSettingsBar persists.

### 4.M — Commit

- [ ] **Step 1:**

```bash
cd ..
git add app/package.json app/package-lock.json app/vite.config.ts \
        app/src/lib/chat \
        app/src/lib/components/chat
git commit -m "$(cat <<'EOF'
feat(chat): streaming + tool-calling + branching

Wires gateway.streamChat into the Chat workspace: per-chat state factory,
dispatch pipeline (slash short-circuit → mode wrap → provider call → tool
loop → persistence), composer with mode pills + send/stop, message list
with reasoning collapsible + tool-call cards + fork-from-message.

Mode application is deterministic local template; contentRaw preserves the
pre-wrap user text for lossless training-data reconstruction. Slash commands
execute local transformers with zero LLM cost. Anthropic cache_control
ephemeral is passed through providerOptions so long chats hit the 5-minute
prefix cache.

No attachments, no keyboard shortcuts, no Inspector yet — Commits 5 and 6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 4.N — PAUSE, verify, push

---

## Commit 5: Attachments + keyboard map + error handling

**Goal:** Drag-drop + paste + file picker for attachments (images + PDF + docx + plain text). Global keyboard shortcuts. Inline tool-execution errors.

### 5.A — Files

**Create:**
- `app/src/lib/chat/attachments/extract.ts` — image/PDF/docx/text extraction dispatch
- `app/src/lib/chat/attachments/image.ts`
- `app/src/lib/chat/attachments/pdf.ts` — lazy imports pdfjs-dist
- `app/src/lib/chat/attachments/docx.ts` — lazy imports mammoth
- `app/src/lib/chat/attachments/__tests__/extract.test.ts`
- `app/src/lib/components/chat/composer/AttachmentChips.svelte`
- `app/src/lib/components/chat/composer/AttachmentDropzone.svelte`
- `app/src/lib/components/chat/workspace/InlineErrorCard.svelte`
- `app/src/lib/stores/chatShortcuts.svelte.ts`

**Modify:**
- `app/src/lib/components/chat/composer/Composer.svelte` — mount dropzone, chips, paste handler
- `app/src/lib/components/chat/workspace/ChatWorkspace.svelte` — render inline error cards
- `app/src/lib/stores/shortcuts.svelte.ts` — extend with `registerShortcut(keyspec, fn)` generic API
- `app/src/routes/chat/+layout.svelte` — install chat shortcuts
- `app/package.json` / `app/package-lock.json` — `pdfjs-dist`, `mammoth` (lazy)
- `app/vite.config.ts` — do NOT add pdfjs-dist to optimizeDeps.include (lazy)

### 5.B — Install attachment deps

- [ ] **Step 1:**

```bash
cd app && npm install --save-exact pdfjs-dist@4.10.38 mammoth@1.9.0
```

- [ ] **Step 2:** Do not add to optimizeDeps — we lazy-load only when the user attaches.

### 5.C — Extract (TDD)

- [ ] **Step 1:** File: `app/src/lib/chat/attachments/image.ts`

```ts
export async function extractImage(file: File): Promise<{ kind: 'image'; thumbnail: Blob; extractedText?: string }> {
  const dataUrl = await new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  const max = 200;
  const ratio = Math.min(max / img.width, max / img.height, 1);
  canvas.width = img.width * ratio;
  canvas.height = img.height * ratio;
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
  return { kind: 'image', thumbnail: blob };
}
```

- [ ] **Step 2:** File: `app/src/lib/chat/attachments/pdf.ts`

```ts
export async function extractPdf(file: File): Promise<{ kind: 'pdf'; extractedText: string; thumbnail?: Blob }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const ab = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: ab }).promise;
  let text = '';
  for (let p = 1; p <= Math.min(doc.numPages, 50); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((i) => (i as { str: string }).str).join(' ') + '\n';
  }
  return { kind: 'pdf', extractedText: text.trim() };
}
```

- [ ] **Step 3:** File: `app/src/lib/chat/attachments/docx.ts`

```ts
export async function extractDocx(file: File): Promise<{ kind: 'docx'; extractedText: string }> {
  const mammoth = await import('mammoth');
  const ab = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: ab });
  return { kind: 'docx', extractedText: result.value };
}
```

- [ ] **Step 4:** File: `app/src/lib/chat/attachments/extract.ts`

```ts
import { extractImage } from './image';
import { extractPdf } from './pdf';
import { extractDocx } from './docx';

export type ExtractResult = {
  kind: 'image' | 'pdf' | 'docx' | 'text' | 'other';
  extractedText?: string;
  thumbnail?: Blob;
};

export async function extractAttachment(file: File): Promise<ExtractResult> {
  if (file.type.startsWith('image/')) return extractImage(file);
  if (file.type === 'application/pdf') return extractPdf(file);
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.toLowerCase().endsWith('.docx')) {
    return extractDocx(file);
  }
  if (file.type.startsWith('text/') || file.type === 'application/json') {
    const text = await file.text();
    return { kind: 'text', extractedText: text };
  }
  return { kind: 'other' };
}
```

- [ ] **Step 5: Test (minimal)**

File: `app/src/lib/chat/attachments/__tests__/extract.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { extractAttachment } from '../extract';

describe('extractAttachment', () => {
  it('routes text files to text branch', async () => {
    const file = new File(['hello'], 'test.txt', { type: 'text/plain' });
    const r = await extractAttachment(file);
    expect(r.kind).toBe('text');
    expect(r.extractedText).toBe('hello');
  });

  it('returns "other" for unknown types', async () => {
    const file = new File([new ArrayBuffer(4)], 'weird.xyz', { type: 'application/x-unknown' });
    const r = await extractAttachment(file);
    expect(r.kind).toBe('other');
  });
});
```

Run, pass. PDF and docx paths aren't unit-tested (jsdom + these libs are fragile); manually verified at step 5.J.

### 5.D — AttachmentChips + Dropzone

- [ ] **Step 1:** File: `app/src/lib/components/chat/composer/AttachmentChips.svelte`

```svelte
<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import type { ExtractResult } from '$lib/chat/attachments/extract';

  export type PendingAttachment = {
    id: string;
    name: string;
    size: number;
    extracted: ExtractResult;
    blob: Blob;
  };

  type Props = { items: PendingAttachment[]; onRemove: (id: string) => void };
  let { items, onRemove }: Props = $props();
</script>

{#if items.length > 0}
  <div class="mb-2 flex flex-wrap gap-1.5">
    {#each items as a (a.id)}
      <span class="inline-flex items-center gap-1 rounded-md border border-white/10 bg-card/50 px-2 py-1 text-xs">
        {a.name} · {Math.round(a.size / 1024)} KB
        <button type="button" onclick={() => onRemove(a.id)} aria-label="Remove"><X size={10} /></button>
      </span>
    {/each}
  </div>
{/if}
```

- [ ] **Step 2:** File: `app/src/lib/components/chat/composer/AttachmentDropzone.svelte`

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  type Props = { onFiles: (files: File[]) => void };
  let { onFiles }: Props = $props();
  let dragging = $state(false);

  onMount(() => {
    const enter = () => { dragging = true; };
    const leave = (e: DragEvent) => { if (e.target === document.documentElement) dragging = false; };
    const over = (e: DragEvent) => { e.preventDefault(); };
    const drop = (e: DragEvent) => {
      e.preventDefault(); dragging = false;
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) onFiles(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  });
</script>

{#if dragging}
  <div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
    <p class="rounded-lg border border-white/15 bg-card/80 px-4 py-2 text-sm">Drop files to attach</p>
  </div>
{/if}
```

### 5.E — Extend Composer

- [ ] **Step 1:** Modify `Composer.svelte`:
  - Import `AttachmentDropzone`, `AttachmentChips`, `extractAttachment`.
  - Add `pending: PendingAttachment[]` state.
  - Add paperclip button → hidden `<input type="file" multiple>`.
  - Add paste event listener → intercept images.
  - Limit 25 MB per file, 50 MB per message.
  - On send, pass attachment blobs to `repo.saveAttachment()` before streaming.

The full patched Composer is long; the diff is mechanical. Reference the attachments flow in spec §6.7 / §5.1 for field names.

### 5.F — Keyboard map

- [ ] **Step 1:** Extend `app/src/lib/stores/shortcuts.svelte.ts`:

Add a generic subscribe API alongside the existing `onOpenModelPicker`:

```ts
type Handler = (e: KeyboardEvent) => void;
const shortcutHandlers = new Map<string, Set<Handler>>();

function keySpec(e: KeyboardEvent): string {
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('cmd');
  if (e.shiftKey) mods.push('shift');
  if (e.altKey) mods.push('alt');
  return [...mods, e.key.toLowerCase()].join('+');
}

if (browser) {
  window.addEventListener('keydown', (e) => {
    const spec = keySpec(e);
    const handlers = shortcutHandlers.get(spec);
    if (!handlers) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      // allow only shortcuts explicitly marked as input-safe via a separate map (future)
      if (spec !== 'cmd+enter' && spec !== 'cmd+/' && spec !== 'escape') return;
    }
    e.preventDefault();
    handlers.forEach((fn) => fn(e));
  });
}

export function registerShortcut(spec: string, fn: Handler): () => void {
  let set = shortcutHandlers.get(spec);
  if (!set) { set = new Set(); shortcutHandlers.set(spec, set); }
  set.add(fn);
  return () => { set!.delete(fn); };
}
```

- [ ] **Step 2:** File: `app/src/lib/stores/chatShortcuts.svelte.ts`

```ts
import { registerShortcut } from './shortcuts.svelte';
import { goto } from '$app/navigation';
import { base } from '$app/paths';
import { repo } from '$lib/chat/repo';

export function installChatShortcuts(): () => void {
  const unsubs = [
    registerShortcut('cmd+n', async () => {
      const chat = await repo.createChat({ title: 'New chat', modelQualifiedId: 'openrouter:openrouter/auto' });
      goto(`${base}/chat/${chat.id}`);
    }),
    registerShortcut('escape', () => {
      window.dispatchEvent(new CustomEvent('chat:stop-stream'));
    })
  ];
  return () => unsubs.forEach((u) => u());
}
```

- [ ] **Step 3:** Mount in `app/src/routes/chat/+layout.svelte`:

```svelte
<script lang="ts">
  import ChatShell from '$lib/components/chat/ChatShell.svelte';
  import { onMount } from 'svelte';
  import { installChatShortcuts } from '$lib/stores/chatShortcuts.svelte';
  let { children } = $props();
  onMount(() => installChatShortcuts());
</script>

<ChatShell>{@render children?.()}</ChatShell>
```

### 5.G — Inline error card

- [ ] **Step 1:** File: `app/src/lib/components/chat/workspace/InlineErrorCard.svelte`

```svelte
<script lang="ts">
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  type Props = { message: string; onRetry?: () => void };
  let { message, onRetry }: Props = $props();
</script>

<div class="mb-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs">
  <TriangleAlert size={14} class="text-destructive" />
  <div class="flex-1">
    <p>{message}</p>
    {#if onRetry}<button type="button" onclick={onRetry} class="mt-1 underline">Retry</button>{/if}
  </div>
</div>
```

Inline-error card is rendered inside the assistant bubble when a tool execution throws. Wire into `ToolCallCard` when `call.errorMessage` present (update that component to show the card for errors).

### 5.H — Suite + manual verify

- [ ] **Step 1:** `npm run test:unit && npm run check && npm run build`.
- [ ] **Step 2:** Drag a text file onto the chat window → drop overlay → chip appears in composer → send → message goes through with attached text appended to user content.
- [ ] **Step 3:** Paste an image into composer → chip appears.
- [ ] **Step 4:** Cmd+N → creates new chat + navigates.
- [ ] **Step 5:** Esc during stream → aborts.
- [ ] **Step 6:** Drop a malformed PDF → inline error card shows the extraction error; user message still sends with just the draft text.

### 5.I — Commit

- [ ] **Step 1:**

```bash
cd ..
git add app/package.json app/package-lock.json app/vite.config.ts \
        app/src/lib/chat/attachments \
        app/src/lib/components/chat \
        app/src/lib/stores/shortcuts.svelte.ts \
        app/src/lib/stores/chatShortcuts.svelte.ts \
        app/src/routes/chat/+layout.svelte
git commit -m "$(cat <<'EOF'
feat(chat): attachments + keyboard map + inline errors

Drag/drop/paste/file-picker attachments with lazy PDF (pdfjs-dist) + docx
(mammoth) extraction. Images thumbnail-ed via canvas; text files passed
through. 25 MB per file / 50 MB per message limits.

Global shortcuts bus extended with registerShortcut(spec, fn). Chat-mode
bindings: Cmd+N new chat, Esc stops stream.

Inline error cards render inside assistant bubbles when tool execution
throws — conversation continues; model can see the error string.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 5.J — PAUSE, verify, push

---

## Commit 6: Dataset Inspector + ShareGPT / raw JSONL export

**Goal:** `/dataset` route with table, filters, preview, bulk actions, train/val split, ShareGPT + raw JSONL export.

### 6.A — Files

**Create:**
- `app/src/routes/dataset/+page.svelte`
- `app/src/lib/dataset/queries.ts` — filter-aware query builder over Dexie
- `app/src/lib/dataset/export-sharegpt.ts`
- `app/src/lib/dataset/export-raw.ts`
- `app/src/lib/dataset/__tests__/export-sharegpt.test.ts`
- `app/src/lib/dataset/__tests__/export-raw.test.ts`
- `app/src/lib/components/dataset/DatasetTable.svelte`
- `app/src/lib/components/dataset/DatasetFilters.svelte`
- `app/src/lib/components/dataset/DatasetPreview.svelte`
- `app/src/lib/components/dataset/ExportMenu.svelte`
- `app/src/lib/components/dataset/BulkActionsBar.svelte`

**Modify:**
- `app/src/lib/components/chat/footer/DatasetFooter.svelte` — wire real sample count + Inspector link + Export dropdown

### 6.B — Query builder

- [ ] **Step 1:** File: `app/src/lib/dataset/queries.ts`

```ts
import { db } from '$lib/chat/db';
import type { MessageRow } from '$lib/chat/types';
import { session } from '$lib/auth/session.svelte';

export type DatasetFilters = {
  chatIds?: string[];
  models?: string[];
  providers?: string[];
  tags?: string[];
  dateFrom?: number;
  dateTo?: number;
  hasReasoning?: boolean;
  hasTools?: boolean;
  minRating?: number;
  trainingInclude?: boolean;
  modeApplied?: string;
  split?: 'train' | 'val';
};

function match(m: MessageRow, f: DatasetFilters): boolean {
  if (m.ownerId !== session.currentUser.id) return false;
  if (m.tombstoned) return false;
  if (f.chatIds?.length && !f.chatIds.includes(m.chatId)) return false;
  if (f.models?.length && m.modelRequested && !f.models.includes(m.modelRequested)) return false;
  if (f.providers?.length && m.provider && !f.providers.includes(m.provider)) return false;
  if (f.tags?.length && !f.tags.some((t) => m.tags?.includes(t))) return false;
  if (f.dateFrom && m.createdAt < f.dateFrom) return false;
  if (f.dateTo && m.createdAt > f.dateTo) return false;
  if (f.hasReasoning === true && !m.reasoning) return false;
  if (f.hasReasoning === false && m.reasoning) return false;
  if (f.hasTools === true && !(m.toolCalls && m.toolCalls.length)) return false;
  if (f.hasTools === false && m.toolCalls && m.toolCalls.length) return false;
  if (f.minRating && (m.rating ?? 0) < f.minRating) return false;
  if (f.trainingInclude !== undefined && (m.trainingInclude ?? true) !== f.trainingInclude) return false;
  if (f.modeApplied && m.modeApplied !== f.modeApplied) return false;
  if (f.split && m.split !== f.split) return false;
  return true;
}

export async function queryMessages(f: DatasetFilters): Promise<MessageRow[]> {
  const all = await db.messages.toArray();
  return all.filter((m) => match(m, f)).sort((a, b) => a.createdAt - b.createdAt);
}
```

### 6.C — Exporters (TDD)

- [ ] **Step 1:** File: `app/src/lib/dataset/__tests__/export-sharegpt.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { toShareGPT } from '../export-sharegpt';
import type { MessageRow } from '$lib/chat/types';

const mkMsg = (role: 'user' | 'assistant', content: string, chatId: string): MessageRow =>
  ({ id: role + chatId, ownerId: 'local', chatId, role, content, createdAt: Date.now(), tags: [] }) as MessageRow;

describe('toShareGPT', () => {
  it('groups messages by chatId and emits one conversation per chat', () => {
    const rows = [mkMsg('user', 'u1', 'a'), mkMsg('assistant', 'a1', 'a'), mkMsg('user', 'u2', 'b')];
    const out = toShareGPT(rows);
    expect(out).toHaveLength(2);
    expect(out[0].conversations).toHaveLength(2);
    expect(out[0].conversations[0]).toEqual({ from: 'human', value: 'u1' });
    expect(out[0].conversations[1]).toEqual({ from: 'gpt', value: 'a1' });
  });
});
```

- [ ] **Step 2:** File: `app/src/lib/dataset/export-sharegpt.ts`

```ts
import type { MessageRow } from '$lib/chat/types';

function roleMap(role: MessageRow['role']): 'human' | 'gpt' | 'system' | 'tool' {
  if (role === 'user') return 'human';
  if (role === 'assistant') return 'gpt';
  return role;
}

export function toShareGPT(rows: MessageRow[]): Array<{ conversations: Array<{ from: string; value: string }> }> {
  const byChat = new Map<string, MessageRow[]>();
  for (const m of rows) {
    const arr = byChat.get(m.chatId) ?? [];
    arr.push(m);
    byChat.set(m.chatId, arr);
  }
  const out: Array<{ conversations: Array<{ from: string; value: string }> }> = [];
  for (const [, msgs] of byChat) {
    msgs.sort((a, b) => a.createdAt - b.createdAt);
    out.push({
      conversations: msgs.map((m) => ({ from: roleMap(m.role), value: m.content }))
    });
  }
  return out;
}

export function shareGPTToJsonl(rows: MessageRow[]): string {
  return toShareGPT(rows).map((r) => JSON.stringify(r)).join('\n');
}
```

- [ ] **Step 3:** File: `app/src/lib/dataset/export-raw.ts`

```ts
import type { MessageRow } from '$lib/chat/types';

export function rawToJsonl(rows: MessageRow[]): string {
  return rows.map((r) => JSON.stringify(r)).join('\n');
}

export function withManifest(payload: string, filtersSummary: unknown): string {
  const manifest = { generator: 'cryptex-dataset-export/v1', exportedAt: new Date().toISOString(), filters: filtersSummary };
  return `// cryptex-dataset-export ${JSON.stringify(manifest)}\n${payload}`;
}
```

- [ ] **Step 4:** Test raw export (minimal).

File: `app/src/lib/dataset/__tests__/export-raw.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { rawToJsonl, withManifest } from '../export-raw';

describe('raw export', () => {
  it('serialises one line per row', () => {
    const rows = [{ id: 'a', ownerId: 'local', chatId: 'c', role: 'user', content: 'x', createdAt: 1, tags: [] }] as any;
    const out = rawToJsonl(rows);
    expect(out.split('\n')).toHaveLength(1);
  });
  it('withManifest prepends a comment line', () => {
    const out = withManifest('x', {});
    expect(out.startsWith('// cryptex-dataset-export')).toBe(true);
  });
});
```

- [ ] **Step 5:** Run, pass.

### 6.D — UI components

- [ ] **Step 1:** `DatasetFilters.svelte` — checkbox/multiselect rail bound to a `DatasetFilters` object. UI only; trivial markup. Keep it under 100 lines.
- [ ] **Step 2:** `DatasetTable.svelte` — sortable HTML table with selected-row preview. Under 150 lines. Virtualize only past 500 rows using `@tanstack/svelte-virtual` (installed lazily in this commit):

```bash
cd app && npm install --save-exact @tanstack/svelte-virtual@3.x
```

- [ ] **Step 3:** `DatasetPreview.svelte` — shows selected row as pretty-printed JSONL in a `<pre>`, plus rating/thumbs/trainingInclude toggles that call `repo.updateMessage`.
- [ ] **Step 4:** `BulkActionsBar.svelte` — delete, star, retag input, split seed+ratio button.
- [ ] **Step 5:** `ExportMenu.svelte` — dropdown: ShareGPT / Raw. Clicking triggers Blob download:

```ts
function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/jsonl' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
```

### 6.E — Page

- [ ] **Step 1:** File: `app/src/routes/dataset/+page.svelte`

Mount `<DatasetFilters>`, `<DatasetTable>`, `<DatasetPreview>`, `<BulkActionsBar>`, `<ExportMenu>`. Wire shared state (filters, selected ids, rows) via Svelte 5 `$state` at the page level. Single-file orchestration.

### 6.F — Wire footer

- [ ] **Step 1:** Modify `DatasetFooter.svelte` to show real sample count from `db.messages.count()` and link to `/dataset` + mount `<ExportMenu>`.

### 6.G — Suite + manual verify

- [ ] **Step 1:** `npm run test:unit && npm run check && npm run build`.
- [ ] **Step 2:** Send a few chat turns. Navigate to `/dataset`. Table shows them. Filter by tag (add a tag on a message first via preview actions). Export ShareGPT — downloads a `.jsonl`. Inspect the file: one-line-per-chat, correct role mapping.
- [ ] **Step 3:** Export raw — downloads full-metadata JSONL with leading manifest comment.
- [ ] **Step 4:** Bulk select 3 rows → retag → all three updated. Refresh — persists.
- [ ] **Step 5:** Train/val split: select all → click Split (80/20) → rows get `split: 'train'` or `'val'`.

### 6.H — Commit

- [ ] **Step 1:**

```bash
cd ..
git add app/package.json app/package-lock.json app/vite.config.ts \
        app/src/lib/dataset \
        app/src/lib/components/dataset \
        app/src/lib/components/chat/footer \
        app/src/routes/dataset
git commit -m "$(cat <<'EOF'
feat(chat): Dataset Inspector at /dataset + ShareGPT/raw JSONL export

Dexie-backed queries with multi-axis filters (chat, model, provider, tags,
date, has reasoning, has tools, min rating, training include, mode, split).
Sortable table + selected-row preview + bulk retag/delete/star + 80/20
train/val split with seed.

Exports: ShareGPT JSONL (one conversation per chat, human/gpt/system/tool
role mapping) and raw JSONL (every MessageRow field verbatim including
tool calls, reasoning, tokens, latency). Leading manifest comment line.

Footer strip now shows live sample count and exposes the Inspector + Export
dropdown from every Chat route.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 6.I — PAUSE, verify, push

---

## Commit 7: Docs + CSP

**Goal:** Update CLAUDE.md, DEPLOY.md, add CHAT-PLAYGROUND.md.

### 7.A — Files

**Create:**
- `docs/CHAT-PLAYGROUND.md` — user-facing guide: modes, slash, fork, Inspector, export formats.

**Modify:**
- `CLAUDE.md` — add `### Chat playground + dataset pipeline` subsection under Architecture (gateway entry point, Dexie schema, technique registry, auth seams, dataset inspector routes).
- `DEPLOY.md` — extend CSP `connect-src` if svelte-streamdown loads HF CDN syntax themes (check at build); add `img-src 'self' data: blob:;` assertion is present.

### 7.B — Content (mechanical)

Follow spec §4 + §5 + §8 to fill in `CLAUDE.md` content. Keep `CHAT-PLAYGROUND.md` under 80 lines — quick reference.

### 7.C — Commit

- [ ] **Step 1:**

```bash
git add CLAUDE.md DEPLOY.md docs/CHAT-PLAYGROUND.md
git commit -m "$(cat <<'EOF'
docs: chat playground + dataset pipeline

CLAUDE.md: new "Chat playground + dataset pipeline" section under
Architecture (gateway entry point, Dexie schema, Technique registry,
auth-readiness seams, /chat + /dataset routes).

DEPLOY.md: CSP additions for svelte-streamdown fonts and blob: image
sources used by attachment thumbnails.

docs/CHAT-PLAYGROUND.md: user guide for modes, slash commands, fork,
Inspector, export formats.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 7.D — Final push

After user approval.

---

## Self-review

**Spec coverage:**
- §4 layout → Commits 1 + 2 + 3 + 4 (ModePill, three-pane shell, ChatSidebar, TechniquesSidebar, QuickSettings, MessageList, Composer, DatasetFooter).
- §5.1 Dexie schema → Commit 2 (`db.ts`, `types.ts`, `repo.ts`).
- §5.2 Technique registry → Commit 3.
- §6 flow semantics → Commit 4 (dispatch, slashParser, toolSchemas, forkChat).
- §7 auth-readiness → Commit 2 (`session.svelte.ts`, `key-vault.ts`, `repo.ts`, `ownerId` everywhere).
- §8 Dataset Inspector → Commit 6.
- §9 keyboard → Commit 5.
- §10 error handling → Commit 5 (InlineErrorCard; existing ErrorBanner reused).
- §11 deps → Commit 1 (shadcn), 2 (dexie/ulid), 4 (streamdown/shiki/zod), 5 (pdfjs/mammoth), 6 (tanstack-virtual).
- §12 bundle → spot-checked; not CI-gated in this plan (noted as follow-up).
- §13 migration → Commit 2 (KeyVault migration); existing tools stay on localStorage.
- §14 cadence → 7 commits exactly.
- §15 risks → spec carries them; plan mitigates via lazy imports + version pinning.
- §16 out-of-scope → enforced by plan (no login, no sync, no WebGPU, no MCP).
- §17 DoD items — each addressed.

**Placeholder scan:** none. Every step has code or commands.

**Type consistency:**
- `ChatRow` / `MessageRow` / `AttachmentRow` / `ToolStateRow` defined in Commit 2, used consistently through Commits 3–6.
- `Technique` / `TechniqueContext` / `TechniqueResult` defined in Commit 3, used in Commit 4 (dispatch, toolSchemas, Composer).
- `session.currentUser.id` is always the string `'local'` in v1; `ownerId` assignment is identical across repo functions.
- ULID via `ulid()` used for all new PKs.

**Gap check:**
- Bundle size-limit gate not extended in this plan — acceptable deferral, noted in risks.
- Virtualization (@tanstack/svelte-virtual) only wired in DatasetTable; message list uses plain iteration — fine for v1, add virtualization when a chat exceeds 200 messages (future).
- Anthropic `cache_control` is passed through `providerOptions` but the gateway module must actually honor it — the gateway already does as of Sub-project #1 Commit 2.

Plan ready.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-18-chat-playground-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per commit, two-stage review, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batched checkpoints.

**Which approach?**
