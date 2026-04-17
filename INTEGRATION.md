# Slack × Notion — Integration Log

Live working document. Not a polished spec — a running tally of decisions made.

## Goal

Make the existing Slack **Canvas** transparently upgrade to the full **Notion** spec, with seamless panel ↔ full-page transitions that preserve Y.js doc identity, cursor, selection, scroll, and undo history.

## Locked Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Single Postgres (Neon)** | Slack's Neon instance is the single source of truth. Notion's docker-compose postgres → dev-only. |
| 2 | **Drizzle is the only ORM** | Slack's existing 9 migrations + 34 tables. Notion (greenfield on API side) ports Prisma → Drizzle. |
| 3 | **Slack is the primary app** | Auth/channels/presence/workspace infra already working. Notion web code migrates into `slack/`. |
| 4 | **Single Next.js binary** | No iframes, no cross-origin, no subdomain hops. Required for true seamless transitions. |
| 5 | **canvas.id ↔ page.id bridge** | `canvases.pageId` FK → `blocks.id` (where type='page'). During cutover, canvases keep both markdown content and page_id for dual-read. |
| 6 | **`@notion/*` package namespace retained** | Internal packages `@notion/shared`, `@notion/api`, `@notion/web`, `@notion/mcp` keep names; top-level workspace is `slack-a2a-monorepo`. |
| 7 | **Pipeline generalization deferred** | `canvases.pipelineStatus` stays as dedicated column until Database blocks ship (P5), then generalized to Notion Status property. |

## Phase tracker

### P0 — Foundations
- [x] **P0-a** Port Prisma schema to Drizzle — 11 new tables in `slack/src/lib/db/schema.ts`, migration `slack/drizzle/0010_notion_core.sql`. `canvases.page_id` bridge added.
- [x] **P0-b** Root pnpm-workspace — `/pnpm-workspace.yaml` + `/package.json` cover slack + notion/apps/* + notion/packages/*. Inner `notion/pnpm-workspace.yaml` disabled.
- [x] **P0-c** Env unification — documented. Real cleanup happens as part of P0-d.
- [x] **P0-d** **Agent A done.** notion/apps/api 24 files migrated Prisma→Drizzle. New tables flagged: `notionNotifications`, `notionWebhooks`, `notionApiKeys` (incompatible with slack equivs) — needs 0011 migration.

### P1 — Single-app shell
- [x] **P1-a** **Agent B done.** 37+ files absorbed. editor/(11), database/(19), sidebar/(2), providers/(1), lib(2). UI stubs for Badge/Popover/Button to avoid API clash. `notion-workspace-store` kept separate from slack's workspace-store. Deferred merges: template-gallery re-wire, Badge variants consolidation.
- [x] **P1-b** `/pages/[id]` full-page route + `NotionPage` component with `mode: 'panel' | 'full'`.

### P2 — Seamless transitions
- [~] **P2-a** Pool infrastructure (`doc-pool.ts`, `editor-pool.ts`) scaffolded with placeholder types. Real Yjs/Tiptap instances wire up after deps install (Agent C adds them).
- [x] **P2-b** View Transitions API — `seamlessNavigate`, `bodyTransitionName`, globals.css animations, reduced-motion fallback.

### Aux (parallel)
- [x] **Agent C** — 23 deps added to `slack/package.json` (Tiptap v3 suite, Yjs, Hocuspocus client+server, katex, lowlight, mermaid, tsx). `slack/src/lib/notion/hocuspocus-server.ts` with iron-session cookie auth (`slack-a2a-session`), snapshots to `pageSnapshots` + `blocks.content.yjsSnapshot` mirror. Runner at `slack/scripts/hocuspocus.mjs`. `pnpm install` required before runtime.
- [x] **Agent D** — 7 files ported to `slack/src/lib/notion/shared/`. `BlockType`/`PermissionLevel` re-exported from drizzle schema (canonical). `pino` + `pino-pretty` added to package.json. All `@notion/shared` imports rewritten to `@/lib/notion/shared` in the 2 files where they slipped through (badge, notion-database-store).

### Second wave (E/F/G)
- [x] **Agent E** — `notion/apps/mcp/` 14 MCP tools (pages × 5, blocks × 4, databases × 2, comments × 2, search × 1). Calls slack API via HTTP. 6 endpoints still missing in slack (database.query, database.addView especially).
- [x] **Agent F** — Aux page API surface: `/api/pages/:id/{permissions,snapshots,share-links}`, `/api/favorites`, `/api/recent-pages`, `/api/comments`. Helper extracted to `slack/src/lib/notion/page-access.ts` (used in 5 routes).
- [⟳] **Agent G** — Meilisearch integration. In progress.

### My parallel work
- [x] `slack/src/lib/notion/use-collaboration.ts` — React hook for Hocuspocus client + pooled Y.Doc. Dynamic `import()` for yjs/@hocuspocus/provider so no build-time resolution needed.
- [x] `slack/src/components/notion/NotionCanvasEditor.tsx` — wrapper that routes between legacy markdown editor (canvas.pageId null) and NotionPage (block tree exists).
- [x] Schema patch — added `pino`, `pino-pretty`, `@tiptap/core`, `@tiptap/suggestion`, `recharts` to package.json.

### Side scaffolds (landed already, not yet wired)
- `slack/scripts/migrate-canvas-to-blocks.ts` — converts existing `canvases.content` markdown into block tree. Idempotent. Dry-run flag supported.
- `slack/src/app/api/pages/route.ts` + `[id]/route.ts` — page CRUD (create, get-with-children, update-properties, soft/hard delete).
- `slack/src/app/api/blocks/[id]/route.ts` — block CRUD (get, patch properties/content/childrenOrder, delete-with-parent-reorder).
- `slack/src/app/api/pages/[id]/blocks/route.ts` — append block to page with optional `afterBlockId` positioning.

### P3 — Slack Canvas swap
- [ ] Replace `CanvasEditor.tsx` textarea/preview with `<NotionEditor pageId={canvas.pageId} mode="panel"/>`. Keep `PipelineStepper` chrome slot. Markdown → block-tree migrator script.

### P4 — Realtime
- [ ] Hocuspocus server (from `notion/apps/api/src/hocuspocus.ts`) with slack-session auth. Tiptap Collaboration extension wired client-side.

### P5 — Databases & views
- [ ] 6 view types, database block, pipeline generalization.

### P6 — MCP
- [ ] Expand `notion/apps/mcp` to 14 tools, register with slack MCP registry so `a2a/builder` agents can drive Notion pages.

### P7 — Search
- [ ] Meilisearch unified index: messages + pages + blocks + users.

## DB schema additions (P0-a)

New tables in `slack/drizzle/0010_notion_core.sql`:

- `blocks` — core tree, type text union, indexed on (page_id, parent_id), (workspace_id, type), (parent_id)
- `database_views` — 6 view types, filters/sorts/groupBy as JSONB
- `database_templates`
- `block_comments` — renamed from notion's `comments` to avoid future ambiguity with slack message comments
- `favorites`, `recent_pages`
- `page_permissions` — PermissionLevel text union
- `page_snapshots` — text-encoded Y.js snapshot
- `share_links`
- `page_templates`, `automations`

Skipped (reuse slack equivalents):
- notion `webhooks` → slack already has `webhooks` + `outgoing_webhooks`
- notion `notifications` → slack already has `notifications`
- notion `api_keys` → defer, slack auth model differs

## Pending risks

1. **Prisma→Drizzle code rewrite** is 50 files in `notion/apps/api`. Mechanical but tedious. Can be partly codemod'd.
2. **Tiptap + editor pool** must not leak Editor instances on unmount. React strict-mode double-invoke is the trap.
3. **Hocuspocus + Slack session cookie** needs careful CSRF/origin checks. WebSocket upgrade path differs from HTTP.
4. **Migration of existing `canvases.content` markdown** → block tree: unit test every heuristic (h1-h6, lists, fenced code, blockquote, hr, tables).
5. **Next.js 16 parallel+intercepted routes** are still maturing — verify turbopack compatibility before committing.

## Running commands

```bash
# From repo root, after `pnpm install`:
pnpm dev              # starts slack-a2a Next.js on :3000
pnpm dev:all          # starts everything in parallel (slack + notion-api + notion-web)
pnpm db:generate      # drizzle-kit generate against slack/src/lib/db/schema.ts
pnpm db:migrate       # apply to Neon (pushes pending migrations incl. 0010)
```
