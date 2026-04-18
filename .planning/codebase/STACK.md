# Technology Stack

**Analysis Date:** 2026-04-18

## Languages

**Primary:**
- JavaScript (ES6/ES2020) — legacy Vue 2 app and transformers
- TypeScript 5.6.3 — new SvelteKit app (`app/`)
- Python 3.12+ — CLI tool (`cryptex_cli/`)
- SQL — optional (not currently used; framework ready)

**Markup/Styling:**
- HTML5 + SVG
- CSS3 (TailwindCSS 3.4.14 in new app)
- Svelte 5.1.9 — reactive components (new app only)

## Runtime

**Environment:**
- Node.js 20 (pinned in `.github/workflows/deploy.yml`, Dockerfile uses `node:20-alpine`)
- Python 3.12+ (via `uv` for cryptex_cli)

**Package Managers:**
- npm 10+ — root and `app/` dependencies (lockfiles: `package-lock.json`, `app/package-lock.json`)
- uv 0.5+ — Python package manager for cryptex_cli

## Frameworks

**Core:**
- SvelteKit 2.8.0 — new static site (SSG, `@sveltejs/adapter-static`)
- Svelte 5.1.9 — component framework (new app)
- Vue 2.6 — legacy app (being retired Phase 4)

**UI Component Library (new app):**
- bits-ui 1.0.0-next.65 — headless component primitives
- shadcn-svelte (implicitly via bits-ui) — Tailwind-based UI components
- lucide-svelte 0.454.0 — icon library

**Styling & Layout:**
- TailwindCSS 3.4.14 — utility-first CSS framework
- autoprefixer 10.4.20 — vendor prefixes
- tailwind-merge 2.5.4 — merge/resolve conflicting Tailwind classes
- tailwind-variants 0.3.0 — variant composition for Tailwind
- tailwindcss-animate 1.0.7 — animation utilities
- @tailwindcss/typography 0.5.19 — prose/markdown styling

**Markdown Processing:**
- mdsvex 0.12.7 — Markdown/MDX for Svelte routes (`.svx`, `.md` → components)

**Build & Dev:**
- Vite 5.4.10 — module bundler & dev server (SvelteKit uses this)
- @sveltejs/vite-plugin-svelte 4.0.0 — Svelte/Vite integration
- @sveltejs/adapter-static 3.0.6 — SvelteKit static export (no Node backend)
- @sveltejs/kit 2.8.0 — meta-framework (routing, file structure)

**Testing:**
- Vitest 2.1.4 — unit test runner for new app (fast, Vite-native)
- Node.js test runner — legacy transformer tests (`tests/test_universal.js` and others)
- pytest 8.3.5+ — Python tests for cryptex_cli (`python_tests/`)

**Type Checking:**
- TypeScript 5.6.3 — static type checking
- svelte-check 4.0.5 — Svelte component type validation

**Development Utilities:**
- serve 14.2.6 — dev HTTP server for local testing
- clsx 2.1.1 — conditional className utility
- tailwind-merge 2.5.4 — Tailwind class merging
- mode-watcher 0.4.1 — dark/light theme switching
- gpt-tokenizer 2.9.0 — token counting for OpenRouter models
- tslib 2.8.0 — TypeScript helpers

## Configuration Files

**TypeScript:**
- `app/tsconfig.json` — strict mode, bundler module resolution

**Build/Dev:**
- `app/svelte.config.js` — Vite preprocessing, static adapter config, path aliases (`$transformers`, `$legacy`)
- `app/vite.config.ts` (implicit via SvelteKit) — Vite configuration
- `Dockerfile` — two-stage build: Node builder → nginx runtime
- `docker-compose.yml` — Dokploy-ready compose with Traefik labels for HTTPS/Let's Encrypt

**Environment:**
- `.env.example` — template for build/deploy variables (not gitignored; actual `.env` is)
- `.npmrc` — npm registry configuration
- `nginx.conf` — production HTTP server config (CSP, cache tiers, SPA routing)

## Key Dependencies

**Critical (Core Functionality):**
- `@sveltejs/kit` — routing, SSG, file-based structure
- `svelte` — reactive UI rendering
- `vite` — build tool (bundles transformers + app)
- `gpt-tokenizer` — token counting for AI features (OpenRouter models)

**Infrastructure:**
- `bits-ui` — accessible headless components
- `tailwindcss` — production CSS generation
- `autoprefixer` — browser compatibility

**Development:**
- `vitest` — unit test runner
- `typescript` — static type safety
- `svelte-check` — Svelte-specific type validation

## Platform Requirements

**Development:**
- Node.js 20+ (npm)
- Python 3.12+ (uv)
- Git
- No database required (static site + optional local storage)
- OpenRouter account (optional, for AI features — BYOK only)

**Production:**
- Docker (any version with compose support)
- Dokploy + Traefik (recommended) OR standalone Docker or GitHub Pages
- nginx 1.27-alpine (runs the static bundle)
- Let's Encrypt via Traefik (automatic for Dokploy, manual elsewhere)

## Build Pipeline (New SvelteKit)

```
npm run build:app
  → cd app && npm ci && npm run build
    → Vite compiles app/ + imports transformers via alias
    → Static output at app/build/
  → node scripts/promote-dist.js
    → Copies app/build/ → dist/ (Phase-0 compatibility shim)
```

## Build Pipeline (Legacy Vue — Being Retired)

```
npm run build:legacy
  → build:tools   (auto-discover js/tools/ → index.template.html)
  → build:copy    (css/, js/, favicon → dist/)
  → build:index   (generate src/transformers/index.js)
  → build:transforms (bundle transformers → dist/js/bundles/)
  → build:emoji   (generate emoji data → dist/js/data/)
  → build:templates (inject templates/*.html → dist/index.html)
```

## Key Transformers (Single Source of Truth)

- **162 transformer files** in `src/transformers/<category>/<name>.js`
- Categories: ancient, case, cipher, encoding, fantasy, format, special, technical, unicode, visual
- Used by: new SvelteKit app (via alias), legacy Vue app, Python CLI (via `loader-node.js` + `cli_bridge.js`)

---

*Stack analysis: 2026-04-18*
