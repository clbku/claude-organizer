# Single image for the whole pnpm workspace. Each compose service runs a
# different command against it:
#   - migrate / api -> tsx (TS source + workspace deps)
#   - mcp           -> node on its tsup bundle (dist/server.mjs)
#   - web           -> node on the Nuxt/Nitro build output (.output)
# Debian (glibc), not alpine (musl): onnxruntime-node — the embedding runtime for
# semantic search (CO-241) — ships glibc-only prebuilt bindings and won't load on
# musl. Slim keeps the image lean while staying glibc.
FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
# git: the auto-implement runner (CO-26) opens an isolated `git worktree` per run.
RUN apt-get update && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile

# Inbox enrichment spawns the Claude CLI headless (`claude -p`); bundle it into
# the image. Its native binary wants glibc — satisfied natively by the Debian
# base (the old alpine base needed gcompat shims).
RUN npm i -g @anthropic-ai/claude-code

# Browser-facing API URL is baked into the SPA at build time (ssr: false), so it
# must be set here, not at runtime. Default works for a browser on the host.
ARG NUXT_PUBLIC_API_URL=http://127.0.0.1:4400
ENV NUXT_PUBLIC_API_URL=$NUXT_PUBLIC_API_URL

RUN pnpm --filter @claude-organizer/mcp build \
  && pnpm --filter @claude-organizer/web build
