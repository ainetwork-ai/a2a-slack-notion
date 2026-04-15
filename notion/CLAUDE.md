# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Notion clone with full feature parity — a team/internal document collaboration and project management tool for small groups (1-20 people). Self-hosted via Docker Compose, single-tenant.

**Status:** Specification complete, implementation not started (greenfield).

**Authoritative spec:** `.omc/specs/deep-interview-notion-clone.md` (356 lines, 11-round deep interview, 19.5% ambiguity — PASSED). Always read this file before making architectural decisions.

## Core Architecture: "Everything is a Block"

- **Page** = root Block (`type="page"`) with infinite nesting
- **Database** = special Block (`type="database"`) with schema, views, templates
- Block tree stored in PostgreSQL with `parent_id` hierarchy and `children_order` array
- `properties: JSONB` holds type-specific attributes; `content: JSONB` holds rich text

## Real-time Collaboration

```
Client A <-> Hocuspocus (Yjs WebSocket) <-> Client B
                    |
              PostgreSQL (persistence)
                    |
                Redis (pub/sub)
```

Yjs CRDT for conflict-free concurrent editing. Hocuspocus syncs documents over WebSocket and snapshots to PostgreSQL periodically.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), Tiptap v3, Yjs, Tailwind CSS v4, shadcn/ui, @dnd-kit, zustand |
| Backend | Node.js + Hono (or Fastify), Hocuspocus, Bull/BullMQ, tRPC (optional) |
| Database | PostgreSQL 16, Redis, MinIO (S3-compatible files), Meilisearch |
| Auth | Better Auth or Lucia (email/password + JWT) |
| AI | Internal vLLM server (OpenAI-compatible API), streaming via SSE |
| MCP | @modelcontextprotocol/sdk — 14 tools wrapping REST API |
| ORM | Prisma |
| Infra | Docker Compose, Nginx reverse proxy |
| Rendering | KaTeX (math), Mermaid (diagrams) |

## API Design

REST API follows Notion's endpoint structure (`/api/v1/pages`, `/api/v1/blocks`, `/api/v1/databases`). Cursor-based pagination, API Key + OAuth 2.0 auth, rate limiting, webhooks.

## Feature Layers

1. **Core** — Block editor with 15+ block types, slash commands, drag-drop, sidebar, version history
2. **Data** — Databases with 6 views (table/board/list/calendar/gallery/timeline), formulas, relations, rollups
3. **Collaboration** — Real-time editing, comments, mentions, permissions (workspace + page level), notifications
4. **Extensions** — AI assistant (vLLM), templates, embeds, search, automation, web clipper
5. **Integration** — REST API, MCP server, webhooks, import/export

## Constraints and Non-Goals

- Small team only (1-20 people), no multi-tenancy or billing
- No mobile native app (responsive web only)
- No social login in v1 (email/password only)
- No image generation via AI
- No deadline — quality over speed

## Development Commands (to be configured)

```bash
# Development
npm run dev          # Next.js dev server
npm run dev:api      # Backend API server
docker-compose up -d # PostgreSQL, Redis, MinIO, Meilisearch

# Database
npx prisma migrate dev   # Run migrations
npx prisma generate      # Generate client
npx prisma studio        # DB browser

# Quality
npm run lint         # ESLint
npm run typecheck    # TypeScript strict
npm test             # Test suite
npm run test:e2e     # E2E tests

# Production
docker-compose -f docker-compose.prod.yml up -d  # Full stack deploy
```

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, border styles, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
Key rule: **no hard borders** — use rgba + box-shadow for soft edges (Notion style).
In QA mode, flag any code that doesn't match DESIGN.md.
