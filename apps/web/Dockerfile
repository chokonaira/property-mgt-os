# Multi-stage Dockerfile for the Next.js web in a pnpm workspace.
# Build context is the repo root.

# Debian-based Node image. Matches the api Dockerfile so both
# images share the same libc / openssl version — keeps Prisma engine
# resolution consistent across services and avoids the Alpine + libssl
# parse error that breaks `prisma migrate` on first boot.
FROM node:20-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@9.12.0 --activate

# ------------------------------------------------------------------
# Dependencies
# ------------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --prod=false

# ------------------------------------------------------------------
# Builder — compile shared, then build the Next.js app.
# Standalone output not enabled; copy node_modules into runtime.
# ------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN pnpm --filter @buena/shared build
RUN pnpm --filter @buena/web build

# ------------------------------------------------------------------
# Runtime
# ------------------------------------------------------------------
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web ./apps/web
COPY --from=builder /app/packages/shared ./packages/shared
EXPOSE 3000
CMD ["pnpm", "--filter", "@buena/web", "start"]
