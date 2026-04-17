#!/usr/bin/env bash
# Example crontab entries. Copy to your scheduler.
#
# Prerequisites:
#   export CRON_SECRET="your-secret-here"   # must match server CRON_SECRET env var
#   export APP_URL="https://your.domain.com"
#
# To install: crontab -e  (then paste the lines below)

CRON_SECRET="your-secret-here"
APP_URL="https://your.domain.com"

# Daily at 3 AM UTC — delete expired share links
0 3 * * * curl -sf -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/cleanup-share-links" >/dev/null

# Weekly Sunday at 4 AM UTC — compact page snapshots (keep latest 10, prune > 30 days)
0 4 * * 0 curl -sf -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/compact-page-snapshots" >/dev/null

# Nightly at 2 AM UTC — rebuild Meilisearch indexes from Postgres
0 2 * * * curl -sf -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/reindex-search" >/dev/null
