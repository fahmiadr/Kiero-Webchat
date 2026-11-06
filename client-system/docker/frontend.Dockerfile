# =============================================================================
# Widget Frontend — Production Dockerfile
#
# Multi-stage build: Vite IIFE bundle → Nginx CDN
# Handles npm workspace hoisting — all deps live in root node_modules.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build the IIFE Widget Bundle
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

# Default to production if not specified
ARG VITE_MODE=production

WORKDIR /app

# Copy workspace root + all workspace package.json for npm resolution
COPY package.json package-lock.json ./
COPY packages/widget-frontend/package.json packages/widget-frontend/
COPY packages/widget-backend/package.json packages/widget-backend/

# Install all deps including devDeps (needed for build tools)
# --ignore-scripts: skip husky prepare hook in Docker build
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --ignore-scripts

# Copy frontend source
COPY packages/widget-frontend ./packages/widget-frontend

# Build the IIFE bundle (Vite reads .env.{mode} from build context)
WORKDIR /app/packages/widget-frontend
RUN npx vite build -- --mode ${VITE_MODE}

# ---------------------------------------------------------------------------
# Stage 2: Nginx CDN Runtime
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine-slim AS runtime

LABEL maintainer="kiero-teknologi" \
    app.name="widget-frontend" \
    app.environment="production"

# Apply system security patches
RUN apk upgrade --no-cache

# Remove default nginx config and html
RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

# Copy custom nginx config for widget CDN
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built widget bundle from builder
COPY --from=builder /app/packages/widget-frontend/dist /usr/share/nginx/html

# Set proper ownership
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

CMD ["nginx", "-g", "daemon off;"]
