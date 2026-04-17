#!/usr/bin/env bash
set -e
echo "Starting dev stack..."
docker compose -f docker-compose.dev.yml up -d
echo "Waiting for Meilisearch..."
until curl -sf http://localhost:7700/health >/dev/null; do sleep 1; done
echo "Starting Hocuspocus..."
pnpm --filter slack-a2a hocuspocus &
HP_PID=$!
echo "Starting slack Next.js..."
cd slack && pnpm dev
kill $HP_PID 2>/dev/null || true
