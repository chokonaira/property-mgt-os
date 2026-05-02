# Multi-stage Dockerfile for the NestJS api in a pnpm workspace.
# Build context is the repo root, not apps/api/, so we can install
# the workspace once and let the resolver pick the right deps.

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# ------------------------------------------------------------------
# Dependencies — copy only the manifests so this layer caches well.
# ------------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --prod=false

# ------------------------------------------------------------------
# Builder — produce dist/ for shared + api, generate Prisma client.
# ------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN pnpm --filter @buena/shared build
RUN pnpm --filter @buena/api exec prisma generate --schema=../../prisma/schema.prisma
RUN pnpm --filter @buena/api build

# ------------------------------------------------------------------
# Runtime — slim layer with just node + the built artifact.
# ------------------------------------------------------------------
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/prisma ./prisma
EXPOSE 3001
CMD ["node", "apps/api/dist/apps/api/src/main.js"]
