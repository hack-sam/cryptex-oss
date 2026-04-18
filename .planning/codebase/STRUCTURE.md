# Codebase Structure

**Analysis Date:** 2026-04-18

## Directory Layout

```
cryptex/
├── app/                        # NEW: SvelteKit app (primary)
│   ├── src/
│   │   ├── routes/             # File-based routing (SvelteKit)
│   │   ├── lib/                # Shared components, stores, utilities
│   │   ├── app.html            # Root layout
│   │   └── app.css             # Global styles (Tailwind)
│   ├── svelte.config.js        # SvelteKit + adapter config
│   ├── tsconfig.json           # TypeScript config
│   ├── vite.config.ts          # Vite build config
│   ├── package.json            # SvelteKit deps (Svelte, Tailwind, Vitest, etc.)
│   ├── package-lock.json
│   └── build/                  # (Generated) Static output
│
├── src/                        # CANONICAL: Transformers + shared code
│   ├── transformers/           # 162 transforms (single source of truth)
│   │   ├── BaseTransformer.js  # Base class for all transforms
│   │   ├── loader-node.js      # Node.js runtime loader (CLI uses this)
│   │   ├── index.js            # (Generated) ES module index
│   │   ├── ancient/            # e.g., hieroglyphics.js, roman-numerals.js
│   │   ├── case/               # e.g., uppercase.js, lowercase.js
│   │   ├── cipher/             # e.g., caesar.js, vigenere.js
│   │   ├── encoding/           # e.g., base64.js, url-encode.js
│   │   ├── fantasy/            # e.g., zalgo.js, upside-down.js
│   │   ├── format/             # e.g., json-minify.js
│   │   ├── special/            # e.g., invisibles.js
│   │   ├── technical/          # e.g., binary.js, hex.js
│   │   ├── unicode/            # e.g., lookalikes.js
│   │   └── visual/             # e.g., braille.js, morse.js
│   └── emojiWordMap.js         # Emoji keyword mapping
│
├── js/                         # LEGACY: Vue 2 app (retiring Phase 4)
│   ├── app.js                  # Vue 2 main instance
│   ├── tools/                  # Tab extensions (Tool.js base class)
│   ├── core/                   # Shared Vue logic (decoder.js, steganography.js)
│   ├── utils/                  # Helper functions
│   ├── config/                 # Constants, config
│   └── data/                   # Data files (auto-emoji data generated)
│
├── css/                        # LEGACY: Stylesheets for Vue 2
│   └── *.css                   # Copied to dist/ at build time
│
├── templates/                  # LEGACY: Vue 2 HTML templates
│   ├── index.html.template     # Injected into dist/index.html
│   └── *.html                  # Tab/tool templates (use v-if, v-for, etc.)
│
├── build/                      # LEGACY: Six-step build pipeline scripts
│   ├── inject-tool-scripts.js  # Auto-discover js/tools/* → generate registry
│   ├── inject-tool-templates.js # Inject templates/*.html into dist/
│   ├── build-index.js          # Generate src/transformers/index.js
│   ├── build-transforms.js     # Bundle transformers → dist/js/bundles/
│   ├── build-emoji-data.js     # Generate dist/js/data/emojiData.js
│   └── copy-static.js          # Copy css/, js/, favicon
│
├── scripts/                    # Utility scripts
│   ├── cli_bridge.js           # Node.js subprocess entry (CLI ← Python)
│   ├── promote-dist.js         # Copy app/build/ → dist/ (Phase-0 compat)
│   └── [other scripts]
│
├── cryptex_cli/                # Python CLI tool (uv-managed)
│   ├── cli.py                  # Entry point (installed as `cryptex` command)
│   ├── bridge.py               # Subprocess bridge (calls cli_bridge.js)
│   ├── agent.py                # AI planning/execution
│   └── [supporting modules]
│
├── python_tests/               # Python tests (pytest)
│   └── *.py                    # CLI tests
│
├── tests/                      # JavaScript tests (Node.js)
│   ├── test_universal.js       # Universal transform tests
│   ├── test_steganography_options.js
│   ├── test_lexeme_analysis.js
│   └── test_lexeme_ui_surface.js
│
├── docs/                       # Documentation
│   ├── TOOL_ARCHITECTURE.md    # Vue 2 tool extension guide
│   └── [other docs]
│
├── .github/workflows/          # GitHub Actions
│   └── deploy.yml              # CI/CD: test → build → GitHub Pages
│
├── dist/                       # (Generated, gitignored) Build output
│   ├── index.html              # Entry point (promoted from app/build/)
│   ├── [routes]/index.html     # Pre-rendered pages
│   ├── js/bundles/             # (Legacy) transforms-bundle.js
│   ├── js/data/                # (Legacy) emojiData.js
│   └── [static assets]
│
├── .planning/codebase/         # (Generated) Analysis documents
│   ├── STACK.md
│   ├── INTEGRATIONS.md
│   ├── ARCHITECTURE.md
│   └── STRUCTURE.md
│
├── node_modules/               # Root npm deps (test runners, serve)
├── app/node_modules/           # SvelteKit deps
│
├── Dockerfile                  # Multi-stage: Node builder → nginx runtime
├── docker-compose.yml          # Dokploy-ready compose (Traefik labels)
├── nginx.conf                  # Production nginx config
├── .dockerignore
├── .gitignore
├── .npmrc
├── .env.example                # Environment template (not gitignored)
├── package.json                # Root npm (legacy + test deps)
├── package-lock.json
├── pyproject.toml              # Python project (cryptex-cli)
├── CLAUDE.md                   # Project instructions (this repo's guidelines)
├── CONTRIBUTING.md
├── DEPLOY.md                   # Deployment guide (Dokploy, GitHub Pages, Docker)
├── README.md
└── LICENSE (MIT)
```

## Directory Purposes

**`app/` (NEW SvelteKit):**
- Purpose: Modern replacement UI (Svelte 5 + SvelteKit 2)
- Contains: Routes, components, stores, TypeScript types
- Adapter: `@sveltejs/adapter-static` (pre-renders to static HTML)
- Output: `app/build/` (gitignored, committed by deploy)
- Key files: `svelte.config.js`, `tsconfig.json`, `package.json`

**`src/transformers/` (CANONICAL):**
- Purpose: Single source of truth for all 162 text transformations
- Contains: BaseTransformer class + 10 category subdirs
- Used by: new app (alias), legacy app (bundle), Python CLI (loader)
- Auto-discovery: category dirs + `*.js` files auto-loaded
- Generated: `src/transformers/index.js` (gitignored, rebuilt by `build:index`)

**`js/` (LEGACY Vue 2):**
- Purpose: Original Vue 2 app (being retired Phase 4)
- Contains: Vue instance, Tool extensions, decoder, steganography logic
- Still in production: Yes (coexists with new app)
- Will be removed: Phase 4

**`css/`, `templates/`, `build/` (LEGACY):**
- Purpose: Vue 2 build pipeline and styling
- Status: Retiring with Phase 4

**`cryptex_cli/` (Python CLI):**
- Purpose: Command-line interface (Python 3.12+)
- Entry point: `cryptex_cli/cli.py` (installed as `cryptex` command via `uv`)
- Bridge: `cli_bridge.js` → `loader-node.js`
- Tests: `python_tests/`

**`tests/` (JavaScript Tests):**
- Purpose: Node.js-based tests for legacy transforms
- Commands: `npm run test:all` (runs all four)
- Individual: `npm run test:universal`, `test:steg`, `test:lexeme`, `test:lexeme-ui`
- Still relevant: Yes (backwards compat)

**`.github/workflows/` (CI/CD):**
- Purpose: GitHub Actions automation
- Trigger: push to `main` or `master`
- Tests: npm + Python tests
- Deploy: GitHub Pages (via upload artifact)

**`dist/` (Build Output, Gitignored):**
- Purpose: Deploy target (served by nginx in Docker, or by GitHub Pages)
- Generated by: `npm run build` (which is `build:app` + `promote-dist.js`)
- Contents: HTML, JS, CSS, assets
- Phase-0: promoted from `app/build/` for backward compatibility

**`.planning/codebase/` (Analysis):**
- Purpose: Generated documentation (this mappper's output)
- Contents: STACK.md, INTEGRATIONS.md, ARCHITECTURE.md, STRUCTURE.md
- Consumed by: `/gsd-plan-phase`, `/gsd-execute-phase`

## Key File Locations

**Entry Points:**
- Browser (new): `app/src/routes/+page.svelte`, `app/src/routes/+layout.svelte`
- Browser (legacy): `dist/index.html` (injected from `index.template.html`)
- CLI: `cryptex_cli/cli.py` (entry point via `uv run cryptex-cli`)

**Configuration:**
- TypeScript: `app/tsconfig.json`
- SvelteKit: `app/svelte.config.js`
- Root npm: `package.json` (legacy + test deps)
- App npm: `app/package.json` (SvelteKit + Svelte + Tailwind)
- Python: `pyproject.toml`
- Docker: `Dockerfile`, `docker-compose.yml`
- Nginx: `nginx.conf`

**Core Logic:**
- Transformers: `src/transformers/<category>/<name>.js` (162 files)
- Transform base: `src/transformers/BaseTransformer.js`
- Transform loader (CLI): `src/transformers/loader-node.js`
- Transformer registry (new app): `app/src/lib/transformers.ts` (import all transforms)
- Bridge (CLI): `scripts/cli_bridge.js`
- Steganography: `app/src/lib/stego.ts` (new), `js/core/steganography.js` (legacy)
- Decoder: `js/core/decoder.js` (universal detection)

**Testing:**
- JavaScript tests: `tests/test_*.js`
- Vitest config (new app): `app/package.json` scripts
- Python tests: `python_tests/`

## Naming Conventions

**Files:**
- Transformer files: kebab-case (e.g., `upside-down.js`, `caesar.js`)
- Vue tools: PascalCase + `Tool` suffix (e.g., `EncodeToolq.js`)
- Routes: lowercase, hyphens (e.g., `/anticlassifier`, `/gibberish`)
- Components: PascalCase (e.g., `TransformCard.svelte`)

**Directories:**
- Transformer categories: lowercase, no hyphens (e.g., `ancient`, `technical`)
- Routes: lowercase, hyphens (e.g., `src/routes/guide/getting-started/`)
- Stores: plural (e.g., `lib/stores/`)
- Components: plural (e.g., `lib/components/`)

## Where to Add New Code

**New Transformer:**
1. Create file: `src/transformers/<category>/<name>.js`
2. Export: `export default new BaseTransformer({ name, func, reverse?, priority, ... })`
3. Pick priority using guide in `BaseTransformer.js` (1–310 range)
4. Build: `npm run build`
5. Test: add case to `tests/test_universal.js`
6. Both apps: auto-import via `src/transformers/index.js` (new) and `dist/js/bundles/` (legacy)

**New SvelteKit Route:**
1. Create directory: `app/src/routes/myroute/`
2. Create file: `app/src/routes/myroute/+page.svelte`
3. Import transforms: `import * as $transformers from '$transformers'` (alias)
4. Build: `npm run build:app` (Vite handles routing)
5. Output: pre-rendered at `app/build/myroute/index.html`

**New Component (SvelteKit):**
1. Create file: `app/src/lib/components/MyComponent.svelte`
2. Import in routes/components: `import MyComponent from '$lib/components/MyComponent.svelte'`
3. Use: `<MyComponent {...props} />`

**Utilities/Helpers (Shared):**
1. Shared across app: `app/src/lib/utils/`
2. Shared across CLI: `cryptex_cli/` module
3. No separate utilities dir for legacy (spread across `js/utils/`, `js/core/`)

## Special Directories

**`node_modules/`, `app/node_modules/`, `.venv/`:**
- Generated: Yes
- Committed: No (gitignored)

**`dist/`:**
- Generated: Yes (by `npm run build`)
- Committed: No (gitignored)
- Promotion: `app/build/` → `dist/` by `promote-dist.js`
- Deploy target: Yes (GitHub Pages or Docker)

**`app/build/`, `app/.svelte-kit/`:**
- Generated: Yes
- Committed: No (gitignored)
- Vite output: `app/build/` (static HTML/JS/CSS)
- SvelteKit temp: `app/.svelte-kit/` (metadata, routes)

**`src/transformers/index.js`:**
- Generated: Yes (by `build:index`)
- Committed: No (gitignored)
- Purpose: ES module export of all transformers (used by browser bundle)
- Updated: run `npm run build:index` after adding/removing transformers

**`.planning/codebase/`:**
- Generated: Yes (by `/gsd-map-codebase`)
- Committed: Yes (checked in for team reference)
- Consumed by: `/gsd-plan-phase`, `/gsd-execute-phase`

---

*Structure analysis: 2026-04-18*
