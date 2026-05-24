# Cryptex — static SvelteKit build served by nginx on port 80.
#
# Multi-stage:
#   1. node:20-alpine builder  → compiles app/ into app/build/ (static output)
#   2. nginx:1.27-alpine       → serves the static bundle with strict CSP +
#                                SPA routing + 7d/1y cache tiers.
#
# The Python CLI (cryptex_cli/) is NOT part of this image — run it locally with
# `uv`. The web image is the deploy target for Dokploy / Coolify / plain Docker.
#
# Build-time args (override in docker-compose / Dokploy "Build Variables"):
#   BASE_PATH  — subpath for the app (e.g. "/cryptex"). Empty for root.

# ---------- Stage 1: build the SvelteKit app ----------
FROM node:20-alpine AS builder
WORKDIR /build

# Build arguments (must be declared before first use)
ARG BASE_PATH=""

# Expose them as environment variables so Vite's build step inlines them
# into the static output. (PUBLIC_* and VITE_* are read at BUILD time by
# SvelteKit / Vite — runtime container env has no effect on the served
# bundle, so they MUST be passed as build args, not just runtime env.)
ENV BASE_PATH=${BASE_PATH}

# Visible build-arg diagnostic — prints to the build log.
RUN sh -c '  status() { if [ -n "$1" ]; then echo "set, length=$(printf %s "$1" | wc -c | tr -d " ")"; else echo "MISSING"; fi; } ;   echo "[cryptex-build] BASE_PATH=$(status "$BASE_PATH")" ; '
# The SvelteKit build reads transformers from ../src/transformers via a Vite
# alias, so we bring both trees into the build context.
COPY src/transformers ./src/transformers
COPY app/package*.json ./app/

# Install only production + dev deps needed for the build.
RUN cd app && npm ci --no-audit --no-fund --prefer-offline

COPY app ./app
COPY scripts ./scripts
COPY nginx.conf ./nginx.conf

# Produce the static output at /build/app/build/. The build script also runs
# scripts/compute-csp-hashes.cjs as a post-step (see app/package.json), which
# walks `app/build/` and writes `app/build/csp-script-hashes.txt`. We then
# substitute that into `nginx.conf`'s `__CSP_SCRIPT_HASHES__` placeholder so
# the stage-2 image ships a CSP without `'unsafe-inline'`.
RUN cd app && npm run build

# Substitute computed sha256-base64 inline-script hashes into nginx.conf.
# Fail fast if the placeholder isn't found (template drift) or the hash
# file is empty (build-pipeline regression). Either case means the CSP
# would degrade to malformed and silently disable script-src checking.
RUN set -e ; \
    HASH_FILE=/build/app/build/csp-script-hashes.txt ; \
    [ -s "$HASH_FILE" ] || { echo "[cryptex-build] FATAL: $HASH_FILE missing or empty" >&2 ; exit 1 ; } ; \
    grep -q __CSP_SCRIPT_HASHES__ /build/nginx.conf || { echo "[cryptex-build] FATAL: nginx.conf is missing __CSP_SCRIPT_HASHES__ placeholder" >&2 ; exit 1 ; } ; \
    HASHES="$(tr -d '\n\r' < $HASH_FILE)" ; \
    awk -v hashes="$HASHES" '{ gsub(/__CSP_SCRIPT_HASHES__/, hashes); print }' /build/nginx.conf > /build/nginx.conf.new ; \
    mv /build/nginx.conf.new /build/nginx.conf ; \
    SHA_COUNT="$(grep -oE "'sha256-[A-Za-z0-9+/=]+'" /build/nginx.conf | sort -u | wc -l)" ; \
    if [ "$SHA_COUNT" -lt 1 ]; then echo "[cryptex-build] FATAL: substituted nginx.conf has no sha256 hashes" >&2 ; exit 1 ; fi ; \
    echo "[cryptex-build] CSP hashes substituted: $SHA_COUNT unique sha256 token(s) in nginx.conf" ; \
    rm "$HASH_FILE"

# Strip source-map and other non-runtime bits to shrink the image.
RUN find /build/app/build -name '*.map' -type f -delete

# ---------- Stage 2: nginx runtime ----------
FROM nginx:1.27-alpine

# Security hardening + tiny footprint
RUN apk update && apk upgrade --no-cache && \
    rm -rf /var/cache/apk/* && \
    # Remove the default site so only ours is served
    rm -f /etc/nginx/conf.d/default.conf

COPY --from=builder /build/app/build /usr/share/nginx/html
# nginx.conf comes from the builder stage where `__CSP_SCRIPT_HASHES__`
# was substituted with build-time-computed sha256-base64 hashes. Pulling
# from the local repo here would re-introduce the placeholder.
COPY --from=builder /build/nginx.conf /etc/nginx/nginx.conf

# OCI image metadata — shows up in Dokploy / registry UIs / GHCR
LABEL org.opencontainers.image.title="Cryptex OSS" \
      org.opencontainers.image.description="Open-source LLM red-teaming toolkit — 159 transforms, 25 tool surfaces, BYOK AI gateway. Static site, runs in your browser." \
      org.opencontainers.image.url="https://github.com/m4xx101/cryptex-oss" \
      org.opencontainers.image.source="https://github.com/m4xx101/cryptex-oss" \
      org.opencontainers.image.documentation="https://github.com/m4xx101/cryptex-oss/blob/main/README.md" \
      org.opencontainers.image.vendor="m4xx101" \
      org.opencontainers.image.licenses="MIT"

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
