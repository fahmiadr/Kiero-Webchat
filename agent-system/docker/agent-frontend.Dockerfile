# =============================================================================
# Agent Frontend — Production Dockerfile
#
# Multi-stage build: Vite SPA → Nginx with COOP/COEP headers (FFmpeg.wasm)
# Handles npm workspace hoisting — all deps live in root node_modules.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build the Vite SPA
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

# Default to production if not specified
ARG VITE_MODE=production

WORKDIR /app

# Copy workspace root + all workspace package.json for npm resolution
COPY package.json package-lock.json ./
COPY apps/frontend/package.json apps/frontend/
COPY apps/backend/package.json apps/backend/

# Install all deps including devDeps (needed for build tools)
# --ignore-scripts to skip husky prepare hook
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --ignore-scripts

# Copy frontend source
COPY apps/frontend ./apps/frontend

# Build the SPA using the specified mode (Vite reads .env.{mode} from build context)
WORKDIR /app/apps/frontend
RUN npx vite build -- --mode ${VITE_MODE}

# ---------------------------------------------------------------------------
# Stage 2: Nginx Runtime
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine-slim AS runtime

LABEL maintainer="kiero-teknologi" \
    app.name="agent-frontend" \
    app.environment="production"

# Apply system security patches
RUN apk upgrade --no-cache

# Remove default nginx config
RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

# Copy custom nginx config
COPY docker/nginx-agent.conf /etc/nginx/conf.d/default.conf

# Copy built SPA from builder
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

# Set proper ownership
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

CMD ["nginx", "-g", "daemon off;"]
