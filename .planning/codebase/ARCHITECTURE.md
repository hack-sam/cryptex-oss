# Architecture

**Analysis Date:** 2026-04-18

## Pattern Overview

**Overall:** Dual-stack progressive migration from Vue 2 → SvelteKit, unified transformer core.

**Key Characteristics:**
- Single source of truth for transforms (`src/transformers/`) — shared by legacy Vue, new SvelteKit, and Python CLI
- Static site (no backend API)
- Phase-0 architecture: legacy Vue + new SvelteKit coexist; legacy scheduled for Phase 4 removal
- Three entry points: browser (Vue or SvelteKit), browser (new SvelteKit), Node CLI via Python subprocess

## Layers

**Transformer Core (Isomorphic):**
- Purpose: Universal text transformation engine shared across all platforms
- Location: `src/transformers/`
- Contains: 162 category-organized transformer files (`.js`) + BaseTransformer class
- Depends on: nothing (pure functions)
- Used by: legacy Vue app (`dist/js/bundles/transforms-bundle.js`), new SvelteKit (`app/` via alias), Python CLI (via `loader-node.js`)

**Legacy Vue 2 App (Retiring):**
- Purpose: Original browser UI (tabs for transforms, tools, settings)
- Location: `js/`, `css/`, `templates/`, `build/`
- Contains: Vue 2 component tree, Tool base class, custom six-step build pipeline
- Build output: `dist/index.html` + bundle
- Status: **In production, scheduled for Phase 4 removal**

**New SvelteKit App (Ascending):**
- Purpose: Replacement browser UI (SPA-like routes, modern DX)
- Location: `app/`
- Contains: Svelte 5 components, file-based routing, TailwindCSS styling
- Build output: `app/build/` (static HTML/JS/CSS)
- Promoted to: `dist/` by `scripts/promote-dist.js` (Phase-0 compatibility)
- Status: **Primary focus, becoming the canonical UI**

**Python CLI (cryptex-cli):**
- Purpose: Command-line interface for transforms
- Location: `cryptex_cli/`
- Bridge: `scripts/cli_bridge.js` (spawned subprocess) → `src/transformers/loader-node.js`
- Platform: Python 3.12+ via `uv`
- Status: **Operational, mirrors browser transform API**

**Utilities & Infrastructure:**
- Shared emoji data: `src/emojiWordMap.js` (used by both Vue and SvelteKit)
- Legacy Vue tools: `js/tools/` (Tool base + specific tools extending it)
- Steganography: `app/src/lib/stego.ts` (new SvelteKit) + legacy `js/core/steganography.js`
- Decoder: `js/core/decoder.js` (universal format detection)

## Data Flow

**Browser (New SvelteKit):**

1. User enters text in route (`/transforms`, `/decode`, etc.)
2. Route component imports from `$transformers` alias → `src/transformers/` 
3. Transform registry built at compile time (`app/src/lib/transformers.ts`)
4. `func(text, options)` or `reverse(text, options)` called
5. Result displayed in UI
6. Optional: OpenRouter API called directly from browser for AI features (BYOK key from localStorage)

**CLI (Python → Node Bridge):**

1. `uv run cryptex-cli encode --transform base64 --text "Hello"`
2. `cryptex_cli/cli.py` spawns Node subprocess: `node scripts/cli_bridge.js`
3. JSON payload sent to stdin: `{ command: 'run', transform: 'base64', action: 'encode', text: '...' }`
4. `cli_bridge.js` calls `loader-node.js` → loads transformer from `src/transformers/`
5. Result JSON on stdout
6. Python unpacks and prints/returns to user

**Steganography (Emoji + Invisible Text):**

1. Encoder detects carrier (emoji or invisible text)
2. `stego.ts` (new) or `steganography.js` (legacy) encodes message
3. Decoder detects & extracts (via `decoder.js` + optional `universalDecode()`)

**Universal Decoder:**

1. User provides ciphertext (no format hint)
2. `decoder.js` tries each transformer's `detector()` in priority order
3. Highest-match transform's `reverse()` applied
4. If multiple formats detected, user chooses

**State Management (New SvelteKit):**

1. Stores: `app/src/lib/stores/` (reactive Svelte stores)
2. OpenRouter key: browser `localStorage['openrouter-api-key']`
3. History: Svelte store (session-scoped, not persisted by default)
4. Theme: `mode-watcher` (dark/light, persisted to localStorage)

## Key Abstractions

**BaseTransformer:**
- Purpose: Standardized interface for all 162 transforms
- Location: `src/transformers/BaseTransformer.js`
- Constructor params: `name`, `func` (required), `reverse` (optional), `priority`, `configurableOptions`, `detector`, `canDecode`
- Pattern: All transformers instantiate: `export default new BaseTransformer({ ... })`
- Priority range: 1–310 (higher = tried first by decoder)
  - 300: unique charsets (Binary, Morse, Braille)
  - 85: Unicode lookalikes (default)
  - 60: ciphers
  - 1: invisible text (lowest priority, hardest to detect)

**Tool (Legacy Vue):**
- Purpose: Extensible tab/pane in Vue 2 app
- Location: `js/tools/Tool.js` (base class)
- Pattern: Each `*Tool.js` extends Tool, provides `getVueData()`, `getVueMethods()`, etc.
- Registration: auto-discovered by `build/inject-tool-scripts.js`
- Template rule: Dynamic HTML (`v-if`, `v-for`, `{{ }}`) must live in `templates/*.html`, NOT in `getTabContentHTML()` (Vue 2 `v-html` does not compile)

**Route (New SvelteKit):**
- Purpose: Structured page with transform access
- Location: `app/src/routes/<name>/+page.svelte`
- Import pattern: Direct import from `$transformers` alias (compiled at build time)
- Type-safe: TypeScript support for transform configs

## Entry Points

**Web (Legacy Vue, still running):**
- Location: `dist/index.html` (injected from `index.template.html`)
- Trigger: User opens in browser
- Responsibilities: render tabs, manage state, call transforms, inject tools

**Web (New SvelteKit, primary):**
- Location: `app/src/routes/+page.svelte`, `+layout.svelte`
- Trigger: User navigates to any route (file-based routing)
- Responsibilities: render Svelte components, call transforms, manage stores, OpenRouter integration

**CLI:**
- Location: `cryptex_cli/cli.py` (main entry point)
- Trigger: `uv run cryptex-cli <command> [args]`
- Commands: `list`, `inspect`, `encode`, `decode`, `auto-decode`
- Responsibilities: parse args, call bridge, format output

**Node CLI Bridge:**
- Location: `scripts/cli_bridge.js`
- Trigger: spawned by Python as subprocess
- Responsibilities: load transforms, execute commands, JSON in/out

## Error Handling

**Strategy:** Try/catch + graceful fallback.

**Patterns:**

- **Transform errors**: Caught in `cli_bridge.js` → JSON `{ ok: false, error: "message" }` → Python prints
- **Browser errors**: Caught in route components, displayed in UI toast/error zone
- **Decode errors**: If no transform matches, show "Unable to auto-detect format"
- **OpenRouter errors**: Network error → show message, suggest re-check API key in localStorage

## Cross-Cutting Concerns

**Logging:**
- Browser: `console.log()` (dev tools)
- CLI: stdout/stderr (Python CLI relays bridge output)
- Nginx: access/error logs (if deployed)

**Validation:**
- Transformer inputs: no strict validation (some transforms require specific input)
- CLI args: Python `argparse` validates command and flags
- Configurableptions: type checking in bridge + browser UI

**Authentication:**
- None (public static site)
- OpenRouter: BYOK stored in localStorage (no backend validation)

## Transformer Auto-Discovery

**Browser build time (SvelteKit):**

1. Vite alias `$transformers` → `src/transformers/`
2. `app/src/lib/transformers.ts` or similar imports all transformers
3. Registry built at compile time
4. No runtime filesystem access needed

**CLI runtime (Python → Node):**

1. `cli_bridge.js` calls `loader-node.js`
2. `loader-node.js` dynamically discovers all `src/transformers/<category>/*.js`
3. Loads each via VM context (ES6 → CommonJS transpilation)
4. Returns `{ base64: Transformer, caesar: Transformer, ... }`
5. Bridge queries registry, executes requested transform

## Build Artifact Structure

**SvelteKit output (`app/build/`):**
```
app/build/
├── index.html              # Entry point
├── [route]/index.html      # Pre-rendered routes
├── _app/
│   ├── immutable/          # Hash-stamped JS/CSS
│   └── chunks/             # Reusable code chunks
└── [assets]                # Images, fonts, favicon
```

**Promoted to `dist/` (Phase-0):**
- `scripts/promote-dist.js` copies `app/build/ → dist/`
- GitHub Pages deploys from `dist/` (legacy workflow expectation)

**Legacy Vue output (`dist/`):**
- `index.html` (injected templates)
- `js/bundles/transforms-bundle.js`
- `js/data/emojiData.js`
- Static assets (`css/`, `js/`, favicon)

## Two-Transformer-Load Pattern

**Why two loaders?**

- `src/transformers/index.js` — generated by `build:index`, imports all transforms as ES modules (browser bundle)
- `src/transformers/loader-node.js` — hardcoded Node.js loader (VM context), no dependency on generated file

**Reason:** CLI must work with source transformers immediately after clone (no build step needed for CLI).

---

*Architecture analysis: 2026-04-18*
