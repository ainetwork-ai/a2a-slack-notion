#!/usr/bin/env bash
# =============================================================================
# backup.sh — PostgreSQL backup script for Notion Clone
#
# Usage:
#   ./scripts/backup.sh
#
# Cron example (daily at 2 AM):
#   0 2 * * * /path/to/notion/scripts/backup.sh >> /var/log/notion-backup.log 2>&1
#
# Environment variables (loaded from .env if present):
#   BACKUP_DIR        — directory to store backups (default: ./backups)
#   BACKUP_KEEP_DAYS  — number of daily backups to retain (default: 7)
#   POSTGRES_PASSWORD — required; PostgreSQL password
#   COMPOSE_PROJECT   — Docker Compose project name (default: notion)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Load .env if present
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${PROJECT_ROOT}/.env"
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-${PROJECT_ROOT}/backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-notion}"
POSTGRES_CONTAINER="${COMPOSE_PROJECT}-postgres-1"
POSTGRES_USER="${POSTGRES_USER:-notion}"
POSTGRES_DB="${POSTGRES_DB:-notion}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/notion_${TIMESTAMP}.sql.gz"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

die() {
  log "ERROR: $*" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
command -v docker >/dev/null 2>&1 || die "docker is not installed or not in PATH"

if ! docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
  die "Container '${POSTGRES_CONTAINER}' is not running. Start with: docker compose up -d"
fi

mkdir -p "${BACKUP_DIR}" || die "Cannot create backup directory: ${BACKUP_DIR}"

# ---------------------------------------------------------------------------
# Perform backup
# ---------------------------------------------------------------------------
log "Starting backup of database '${POSTGRES_DB}' from container '${POSTGRES_CONTAINER}'"
log "Output: ${BACKUP_FILE}"

docker exec "${POSTGRES_CONTAINER}" \
  pg_dump \
    --username="${POSTGRES_USER}" \
    --dbname="${POSTGRES_DB}" \
    --format=plain \
    --no-password \
  | gzip -9 > "${BACKUP_FILE}"

BACKUP_SIZE="$(du -sh "${BACKUP_FILE}" | cut -f1)"
log "Backup complete. Size: ${BACKUP_SIZE}"

# ---------------------------------------------------------------------------
# Rotate old backups (keep last N days)
# ---------------------------------------------------------------------------
log "Rotating backups older than ${BACKUP_KEEP_DAYS} days..."

DELETED=0
while IFS= read -r old_file; do
  rm -f "${old_file}"
  log "  Deleted: $(basename "${old_file}")"
  ((DELETED++)) || true
done < <(find "${BACKUP_DIR}" -name "notion_*.sql.gz" -type f -mtime "+${BACKUP_KEEP_DAYS}")

if [[ "${DELETED}" -eq 0 ]]; then
  log "No old backups to delete."
else
  log "Deleted ${DELETED} backup(s)."
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
TOTAL_BACKUPS="$(find "${BACKUP_DIR}" -name "notion_*.sql.gz" -type f | wc -l | tr -d ' ')"
log "Total backups retained: ${TOTAL_BACKUPS}"
log "Backup directory: ${BACKUP_DIR}"
log "Done."
