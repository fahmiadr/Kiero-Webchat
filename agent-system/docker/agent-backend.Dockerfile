# =============================================================================
# Agent Backend — Production Dockerfile
#
# Optimized 2-stage build: build (deps + prisma) → runtime
# Non-root user, dumb-init for PID 1 signal handling.
# Handles npm workspace hoisting — all deps live in root node_modules.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build — install deps + generate Prisma client, then prune
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Native build tools for modules like better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy workspace manifests for npm resolution
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/

# Full install (Prisma CLI is a devDependency) → generate → prune
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci

# Copy Prisma schema and config for generation
COPY apps/backend/prisma ./apps/backend/prisma
COPY apps/backend/prisma.config.js ./apps/backend/
COPY apps/backend/src/config ./apps/backend/src/config

# Generate Prisma client (dummy env vars satisfy config validation at build time)
WORKDIR /app/apps/backend
RUN NODE_ENV=production \
    PORT=3003 \
    LOG_LEVEL=info \
    DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    REDIS_URL="redis://localhost:6379" \
    JWT_SECRET="build-only" \
    WEBHOOK_SECRET="build-only" \
    ENCRYPTION_KEY="build-only" \
    FRONTEND_URL="http://localhost" \
    npx prisma generate

# Prune devDependencies after Prisma generation (keeps generated client intact)
WORKDIR /app
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------
# Stage 2: Production Runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

LABEL maintainer="kiero-teknologi" \
      app.name="agent-backend" \
      app.environment="production"

# dumb-init + non-root user in single layer
RUN apk add --no-cache dumb-init && \
    apk upgrade --no-cache && \
    addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 -G nodejs

WORKDIR /app

# Copy pruned production node_modules (includes generated Prisma client)
COPY --from=build --chown=appuser:nodejs /app/node_modules ./node_modules

# Copy application source selectively
COPY --chown=appuser:nodejs apps/backend/src ./apps/backend/src
COPY --chown=appuser:nodejs apps/backend/prisma ./apps/backend/prisma
COPY --chown=appuser:nodejs apps/backend/prisma.config.js ./apps/backend/
COPY --chown=appuser:nodejs apps/backend/package.json ./apps/backend/

# Copy workspace root package.json for module resolution
COPY --chown=appuser:nodejs package.json ./

# Create required directories with correct ownership
RUN mkdir -p /app/apps/uploads/audio /app/apps/uploads/document \
             /app/apps/uploads/image /app/apps/uploads/video \
             /app/apps/backend/logs && \
    chown -R appuser:nodejs /app/apps/uploads /app/apps/backend/logs

USER appuser

ENV NODE_ENV=production

WORKDIR /app/apps/backend

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
