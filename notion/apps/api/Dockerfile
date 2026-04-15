# =============================================================================
# Stage 1: Builder
# =============================================================================
FROM node:20-alpine AS builder

# Install build tools needed for native modules
RUN apk add --no-cache python3 make g++ curl

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests and lockfile first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install all dependencies (including devDeps for prisma generate)
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/
COPY tsconfig.json ./

# Generate Prisma client
WORKDIR /app/apps/api
RUN pnpm exec prisma generate

# Build shared package first
WORKDIR /app/packages/shared
RUN pnpm exec tsc --noEmit || true

# Build API (transpile with tsx for ESM output)
WORKDIR /app/apps/api
RUN mkdir -p dist && \
    pnpm exec tsx --version && \
    npx esbuild src/index.ts \
      --bundle \
      --platform=node \
      --target=node20 \
      --format=esm \
      --outfile=dist/index.js \
      --external:@prisma/client \
      --external:prisma \
      --external:pg-native \
      --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"

# =============================================================================
# Stage 2: Runner (slim production image)
# =============================================================================
FROM node:20-alpine AS runner

RUN apk add --no-cache curl dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S notionapi -u 1001 -G nodejs

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files for production install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built output and prisma schema/client
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/node_modules/.prisma ./apps/api/node_modules/.prisma
COPY --from=builder /app/apps/api/node_modules/@prisma ./apps/api/node_modules/@prisma
COPY --from=builder /app/packages/shared ./packages/shared

# Set ownership
RUN chown -R notionapi:nodejs /app

USER notionapi

WORKDIR /app/apps/api

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Use dumb-init to handle PID 1 signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
