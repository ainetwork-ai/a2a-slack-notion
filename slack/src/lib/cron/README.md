# Cron Routes

HTTP-triggered maintenance endpoints under `/api/cron/*`. Call them from any scheduler (Fly.io cron, GitHub Actions schedule, a VM crontab, etc.).

## Endpoints

| Route | Method | Purpose |
|---|---|---|
| `/api/cron/cleanup-share-links` | GET\|POST | Delete expired share links (`expiresAt < NOW()`) |
| `/api/cron/compact-page-snapshots` | GET\|POST | Prune old Y.js page snapshots (keep latest 10, max 30 days) |
| `/api/cron/reindex-search` | GET\|POST | Rebuild Meilisearch indexes from Postgres |

## Authentication

Every endpoint requires the `CRON_SECRET` environment variable to be set on the server.

Pass the secret via **either**:

```
Authorization: Bearer <CRON_SECRET>
```

or as a query parameter:

```
GET /api/cron/cleanup-share-links?secret=<CRON_SECRET>
```

A missing or wrong secret returns `401 Unauthorized`. An unconfigured `CRON_SECRET` returns `500`.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CRON_SECRET` | *(required)* | Shared secret protecting all cron endpoints |
| `SNAPSHOT_TTL_DAYS` | `30` | Days to retain page snapshots in `compact-page-snapshots` |

## Compaction Logic (`compact-page-snapshots`)

For each page in `page_snapshots`:
1. Keep the **10 most recent** snapshots.
2. Delete any snapshot older than `SNAPSHOT_TTL_DAYS` days.

Both rules apply simultaneously — a snapshot is deleted if it falls outside the keep window **or** is older than the TTL, whichever is more aggressive.

## Reindex Query Param

`/api/cron/reindex-search?index=<value>` — accepted values: `messages`, `pages`, `blocks`, `users`, `all` (default).

## Scheduler Setup

### crontab (VM / bare metal)

See `scripts/cron-setup-example.sh` for a ready-to-copy snippet.

### GitHub Actions

```yaml
on:
  schedule:
    - cron: '0 3 * * *'   # daily 3 AM UTC

jobs:
  cron:
    runs-on: ubuntu-latest
    steps:
      - name: Cleanup share links
        run: |
          curl -sf -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            ${{ vars.APP_URL }}/api/cron/cleanup-share-links
      - name: Compact page snapshots
        run: |
          curl -sf -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            ${{ vars.APP_URL }}/api/cron/compact-page-snapshots
```

### Fly.io

```toml
# fly.toml
[[statics]]
# ...

[processes]
  app = "node server.js"

[[services.http_checks]]
  # use Fly Machines cron instead:

# machines/cron.json (deploy a separate cron Machine)
# CMD: curl -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/cleanup-share-links
```

Or use Fly's built-in cron via a dedicated Machine with a `CMD` like:

```sh
while true; do
  curl -sf -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/cleanup-share-links
  sleep 86400
done
```

## Security Notes

- Use a random, high-entropy value for `CRON_SECRET` (e.g. `openssl rand -hex 32`).
- Rotate the secret by updating the env var and your scheduler config simultaneously.
- Prefer the `Authorization: Bearer` header over `?secret=` — query params appear in server logs.
- These routes do not require a user session; they operate directly on the database.
