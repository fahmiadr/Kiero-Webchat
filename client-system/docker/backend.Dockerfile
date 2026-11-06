# =============================================================================
# Widget Backend — Production Dockerfile
#
# Multi-stage build with non-root user, dumb-init for signal handling.
# Handles npm workspace hoisting — all deps live in root node_modules.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Install production dependencies
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

# Copy workspace root + all workspace package.json for npm resolution
COPY package.json package-lock.json ./
COPY packages/widget-backend/package.json packages/widget-backend/
COPY packages/widget-frontend/package.json packages/widget-frontend/

# Install all workspace production deps (hoisted to root node_modules)
# --ignore-scripts: skip husky prepare hook (husky is devDep, not available)
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --ignore-scripts

# ---------------------------------------------------------------------------
# Stage 2: Production Runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

LABEL maintainer="kiero-teknologi" \
      app.name="widget-backend" \
      app.environment="production"

# dumb-init + non-root user in single layer
RUN apk add --no-cache dumb-init && \
    apk upgrade --no-cache && \
    addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 -G nodejs

WORKDIR /app

# Copy hoisted root node_modules (npm workspaces hoists deps here)
COPY --from=deps --chown=appuser:nodejs /app/node_modules ./node_modules

# Copy application source selectively
COPY --chown=appuser:nodejs packages/widget-backend/src ./packages/widget-backend/src
COPY --chown=appuser:nodejs packages/widget-backend/package.json ./packages/widget-backend/

# Copy workspace root package.json (required for module resolution)
COPY --chown=appuser:nodejs package.json ./

# Create logs directory with correct ownership
RUN mkdir -p /app/packages/widget-backend/logs && \
    chown -R appuser:nodejs /app/packages/widget-backend/logs

USER appuser

ENV NODE_ENV=production

WORKDIR /app/packages/widget-backend

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
