# Notion Clone

A self-hosted team document collaboration and project management tool with full Notion feature parity. Built for small teams (1–20 people). Single-tenant, deployed via Docker Compose.

## Features

- **Block editor** — 15+ block types (paragraphs, headings, toggles, callouts, code, tables, embeds, KaTeX math, Mermaid diagrams, and more) with slash-command palette and drag-and-drop reordering
- **Databases** — 6 view types (Table, Board, List, Calendar, Gallery, Timeline), formulas, relations, rollups, and filtering
- **Real-time collaboration** — Conflict-free concurrent editing via Yjs CRDT and Hocuspocus WebSocket server
- **Permissions** — Workspace-level and page-level access control with role-based sharing
- **Comments & mentions** — Inline threaded comments and @-mention notifications
- **Version history** — Full audit trail with page restore capability
- **AI assistant** — Streaming AI suggestions powered by a self-hosted vLLM server (OpenAI-compatible)
- **Search** — Full-text search across all content via Meilisearch
- **Templates** — Reusable page and database templates
- **Import / Export** — Markdown, CSV, and JSON support
- **MCP server** — 14 tools wrapping the REST API for use with Claude Desktop and other AI clients
- **REST API** — Notion-compatible API (`/api/v1/pages`, `/api/v1/blocks`, `/api/v1/databases`) with API Key auth

## Tech Stack

| Layer       | Technology                                                             |
|-------------|------------------------------------------------------------------------|
| Frontend    | Next.js 15 (App Router), Tiptap v3, Yjs, Tailwind CSS v4, shadcn/ui  |
| Real-time   | Hocuspocus (Yjs WebSocket), @dnd-kit                                  |
| State       | Zustand, TanStack Query                                               |
| Backend     | Node.js + Hono, Hocuspocus, BullMQ                                    |
| Database    | PostgreSQL 16, Prisma ORM                                             |
| Cache       | Redis 7                                                               |
| Storage     | MinIO (S3-compatible)                                                 |
| Search      | Meilisearch v1.11                                                     |
| Auth        | Better Auth (email/password + JWT)                                    |
| AI          | vLLM (OpenAI-compatible API, streaming via SSE)                       |
| MCP         | @modelcontextprotocol/sdk                                             |
| Infra       | Docker Compose, Nginx reverse proxy, Let's Encrypt SSL                |

## Architecture

```
                          ┌─────────────────────────────────────┐
                          │              Nginx                  │
                          │  :80 (redirect)  :443 (SSL/TLS)    │
                          └───────┬──────────────┬─────────────┘
                                  │              │
                    /api/*        │              │  /ws (WebSocket)
                    ┌─────────────┘              └──────────────────┐
                    ▼                                               ▼
         ┌──────────────────┐                         ┌────────────────────┐
         │   Hono REST API   │                         │    Hocuspocus      │
         │   :3001           │                         │  (Yjs WebSocket)   │
         └──────────────────┘                         └────────────────────┘
                 │                                             │
         ┌───────┴────────────────────────────────────────────┘
         │
         ├── PostgreSQL 16  (primary data store)
         ├── Redis 7        (pub/sub, BullMQ jobs, Hocuspocus session state)
         ├── MinIO           (file uploads / attachments)
         └── Meilisearch    (full-text search index)

         Next.js :3000  ←── / (all other routes via Nginx)
```

## Quick Start (Development)

### Prerequisites

- Docker & Docker Compose v2
- Node.js >= 20
- pnpm >= 9

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/your-org/notion-clone.git
cd notion-clone

# 2. Configure environment
cp .env.example .env
# Edit .env — defaults work for local development

# 3. Start infrastructure services
docker compose up -d

# 4. Install dependencies
pnpm install

# 5. Run database migrations and seed
pnpm --filter @notion/api exec prisma migrate dev
pnpm --filter @notion/api exec prisma db seed

# 6. Start development servers (API + Web in parallel)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

- API:          http://localhost:3001
- MinIO console: http://localhost:9001
- Meilisearch:  http://localhost:7700

## Production Deployment

### Prerequisites

- A Linux server with Docker & Docker Compose v2
- A domain name pointed at the server's IP
- Ports 80 and 443 open

### Steps

```bash
# 1. Clone the repository on your server
git clone https://github.com/your-org/notion-clone.git
cd notion-clone

# 2. Configure production environment
cp .env.example .env
# Edit .env — set strong passwords for all *_PASSWORD/*_SECRET vars
# Set DOMAIN=your-domain.example.com
# Set CORS_ORIGIN=https://your-domain.example.com

# 3. Obtain SSL certificates (Let's Encrypt)
#    Run certbot once to get certificates before starting nginx:
docker run --rm -p 80:80 \
  -v "$(pwd)/certbot/conf:/etc/letsencrypt" \
  -v "$(pwd)/certbot/www:/var/www/certbot" \
  certbot/certbot certonly --standalone \
  -d your-domain.example.com \
  --email admin@your-domain.example.com \
  --agree-tos --non-interactive

# 4. Build and start all services
docker compose -f docker-compose.prod.yml up -d --build

# 5. Run database migrations in the running API container
docker compose -f docker-compose.prod.yml exec api \
  node -e "import('./dist/index.js')" || \
docker compose -f docker-compose.prod.yml exec api \
  npx prisma migrate deploy

# 6. Verify all services are healthy
docker compose -f docker-compose.prod.yml ps
```

### SSL Certificate Renewal

Add a cron job to renew certificates automatically:

```bash
# /etc/cron.d/certbot-renew
0 0 * * 0 root docker run --rm \
  -v /path/to/notion/certbot/conf:/etc/letsencrypt \
  -v /path/to/notion/certbot/www:/var/www/certbot \
  certbot/certbot renew --webroot -w /var/www/certbot --quiet && \
  docker compose -f /path/to/notion/docker-compose.prod.yml exec nginx nginx -s reload
```

### Backups

```bash
# Run a manual backup
./scripts/backup.sh

# Schedule daily backups at 2 AM
echo "0 2 * * * $(pwd)/scripts/backup.sh >> /var/log/notion-backup.log 2>&1" | crontab -
```

Backups are stored in `./backups/` as gzipped SQL dumps. The last 7 days are retained by default (configure with `BACKUP_KEEP_DAYS`).

### Updating

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

## MCP Server Setup

The MCP server exposes 14 tools for interacting with the Notion Clone API from AI clients such as Claude Desktop.

### Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "notion-clone": {
      "command": "node",
      "args": ["/absolute/path/to/notion-clone/apps/mcp/dist/index.js"],
      "env": {
        "NOTION_API_URL": "http://localhost:3001",
        "NOTION_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `get_page` | Retrieve a page and its blocks |
| `create_page` | Create a new page |
| `update_page` | Update page properties |
| `delete_page` | Move a page to trash |
| `get_block` | Retrieve a block by ID |
| `create_block` | Append blocks to a page |
| `update_block` | Update block content |
| `delete_block` | Delete a block |
| `get_database` | Retrieve database schema |
| `query_database` | Query database rows with filters/sorts |
| `create_database_item` | Create a database row |
| `update_database_item` | Update a database row |
| `search` | Full-text search across all content |
| `get_user` | Retrieve workspace member info |

## API Documentation

The REST API follows Notion's endpoint structure.

**Base URL:** `https://your-domain.example.com/api/v1`

### Authentication

```http
Authorization: Bearer <api-key>
```

Generate an API key from your workspace settings.

### Rate Limits

| Tier | Limit |
|------|-------|
| Default | 30 requests/minute per IP |
| Burst | 20 requests burst allowed |

### Pagination

All list endpoints use cursor-based pagination:

```http
GET /api/v1/pages?start_cursor=<cursor>&page_size=50
```

Response:
```json
{
  "results": [...],
  "next_cursor": "abc123",
  "has_more": true
}
```

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/pages/:id` | Get page |
| `POST` | `/api/v1/pages` | Create page |
| `PATCH` | `/api/v1/pages/:id` | Update page |
| `DELETE` | `/api/v1/pages/:id` | Delete page |
| `GET` | `/api/v1/blocks/:id/children` | List block children |
| `PATCH` | `/api/v1/blocks/:id/children` | Append blocks |
| `GET` | `/api/v1/databases/:id` | Get database |
| `POST` | `/api/v1/databases/:id/query` | Query database |
| `GET` | `/api/v1/search` | Search content |
| `POST` | `/api/v1/auth/login` | Login |
| `POST` | `/api/v1/auth/register` | Register |

## Development Commands

```bash
# Development
pnpm dev              # Start all apps in parallel
pnpm dev:web          # Next.js frontend only
pnpm dev:api          # Hono API + Hocuspocus only

# Infrastructure
docker compose up -d  # Start PostgreSQL, Redis, MinIO, Meilisearch
docker compose down   # Stop infrastructure

# Database
pnpm db:migrate       # Run pending migrations (dev)
pnpm db:generate      # Regenerate Prisma client after schema changes
pnpm db:studio        # Open Prisma Studio (visual DB browser)

# Quality
pnpm lint             # ESLint across all packages
pnpm typecheck        # TypeScript strict mode check
pnpm test             # Unit tests (Vitest)
pnpm test:e2e         # End-to-end tests (Playwright)

# Production
docker compose -f docker-compose.prod.yml up -d --build
./scripts/backup.sh   # Manual database backup
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make changes following the existing code style
4. Run `pnpm lint && pnpm typecheck && pnpm test`
5. Submit a pull request with a clear description

Please read [DESIGN.md](DESIGN.md) before making any UI changes — the design system and visual guidelines are defined there.

## License

MIT License — see [LICENSE](LICENSE) for details.
