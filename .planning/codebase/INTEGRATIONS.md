# External Integrations

**Analysis Date:** 2026-04-18

## APIs & External Services

**OpenRouter (AI Models):**
- Service: OpenRouter API — LLM provider for AI-powered text rewriting
  - Features: AI Translation, PromptCraft, Anti-Classifier, Decoder "translate to English"
  - Auth: User BYOK (Bring Your Own Key) stored in browser `localStorage` only
  - Client: Direct fetch from browser (no server-side relay)
  - Config: `js/data/openrouterModels.js` contains model catalog
  - Key variable: `openrouter-api-key` (localStorage key)
  - How it works: User pastes OpenRouter key into Advanced Settings tab; all requests originate from browser

## Data Storage

**Databases:**
- None (static site, no backend database)
- `localStorage` — user preferences, API keys, history (client-side only)
- Optional: GitHub Pages (deploy target) or Dokploy-managed container (no persistent volume by default)

**File Storage:**
- nginx serves static files (SvelteKit `app/build/` or legacy `dist/`)
- Optional: Nginx caching headers (7-day/1-year tiers per `nginx.conf`)
- No external file storage service integrated

**Caching:**
- HTTP Cache (nginx) — 7 days for assets, 1 year for immutable chunks
- See `nginx.conf` for cache control directives

## Authentication & Identity

**Auth Provider:**
- None (public static site, no user accounts)
- OpenRouter BYOK = user brings their own credentials
- localStorage for session-local state only

## Monitoring & Observability

**Error Tracking:**
- None integrated (could add Sentry, but not currently)

**Logs:**
- nginx access/error logs (if deployed on server with logging enabled)
- Console logs in browser (dev tools)
- Python CLI stdout/stderr

**Health Check:**
- Docker HEALTHCHECK: `wget -q --spider http://localhost/health` (returns 200 if nginx is up)

## CI/CD & Deployment

**Hosting:**

1. **GitHub Pages** (recommended for forks)
   - Trigger: push to `main` or `master`
   - Workflow: `.github/workflows/deploy.yml`
   - Tests: `npm run test:all` + app tests before deploy
   - Output: `app/build/` → GitHub Pages (automatic)
   - No custom domain setup needed for `username.github.io/cryptex`

2. **Dokploy on VPS** (recommended for self-hosting)
   - Platform: Dokploy (open-source PaaS)
   - Orchestration: Docker Compose + Traefik
   - Build: Dockerfile (Node 20 builder → nginx runtime)
   - Routing: Traefik v3 (automatic HTTPS, Let's Encrypt)
   - Network: `dokploy-network` (multi-homed routing)
   - Cert renewal: Let's Encrypt via Traefik (HTTP-01 challenge)
   - Env vars: `DOMAIN`, `BASE_PATH`, `PUBLIC_ADSENSE_CLIENT`, `TZ`

3. **Plain Docker (standalone)**
   - Command: `docker build -t cryptex . && docker run -p 80:80 cryptex`
   - Requires: manual Traefik/nginx reverse proxy + cert management
   - See `DEPLOY.md` for full instructions

**CI Pipeline:**
```yaml
.github/workflows/deploy.yml:
  1. Checkout repo
  2. Setup Node 20 (cache npm)
  3. npm ci (root)
  4. npm run test:all (legacy tests)
  5. cd app && npm ci
  6. npm run test:unit (Vitest)
  7. npm run check (type-check)
  8. npm run build (Vite → app/build/)
  9. Verify build artifacts exist
  10. Upload to GitHub Pages artifact
```

## Environment Configuration

**Required env vars (Dokploy/Docker):**
- `DOMAIN` — fully qualified domain for HTTPS (e.g., `cryptex.example.com`)
- `TZ` — timezone (optional, defaults to UTC)

**Optional env vars:**
- `BASE_PATH` — subpath if serving at `/cryptex/` instead of `/` (empty = root)
- `PUBLIC_ADSENSE_CLIENT` — Google AdSense publisher ID (omit = no ads)

**Build-time variables (Dockerfile):**
- `BASE_PATH` — passed to Node builder via `--build-arg`
- `PUBLIC_ADSENSE_CLIENT` — passed to Node builder via `--build-arg`
- `NODE_ENV=production` — implicit in Dockerfile

**Secrets location:**
- `.env` file (gitignored) — not used in production; only for local dev
- OpenRouter API key — stored in browser localStorage only (never sent to server)
- GitHub Pages: no env vars needed (static deploy)

## Webhooks & Callbacks

**Incoming:**
- GitHub webhooks → GitHub Pages (automatic on push)
- Dokploy → GitHub (pull commits, auto-deploy on push)

**Outgoing:**
- None (no server-side webhooks)

## Google Services (Optional)

**AdSense:**
- Conditional script injection (if `PUBLIC_ADSENSE_CLIENT` is set)
- No data collection if not configured
- Publisher ID injected at build time

## Docker Image Metadata

**OCI Labels:**
- `org.opencontainers.image.title` = "Cryptex"
- `org.opencontainers.image.description` = "AI red-teamer's text lab — 162 transforms, steganography, BYOK AI rewrites."
- `org.opencontainers.image.url` = GitHub repo
- `org.opencontainers.image.licenses` = MIT

## Network Requirements

**Dokploy Deployment:**
- DNS A record → VPS public IP (required BEFORE first deploy)
- HTTP port 80 → Traefik (redirect to HTTPS)
- HTTPS port 443 → Traefik (Let's Encrypt termination)
- Traefik label configuration: all routing rules in `docker-compose.yml` (not Dokploy UI)
- Network routing: containers on `dokploy-network` (multi-homed)

**GitHub Pages:**
- No configuration needed (managed by GitHub)
- Optional: custom domain via DNS CNAME (documented on GitHub)

---

*Integration audit: 2026-04-18*
