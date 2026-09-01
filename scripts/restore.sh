#!/usr/bin/env bash
# =========================================================================
# Restore the database from a backup created by scripts/backup.sh.
#   ./scripts/restore.sh /var/backups/skhata/skhata-20260901-020000.sql.gz
#
# ⚠️  REPLACES the current database contents. A safety backup of the
# current state is taken automatically before restoring.
# =========================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FILE="${1:-}"
PROJECT="${PROJECT:-smart-digital-khata}"
DB_USER="${POSTGRES_USER:-skhata}"
DB_NAME="${POSTGRES_DB:-skhata}"

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  echo "Available backups:"
  ls -1t /var/backups/skhata/*.sql.gz 2>/dev/null | head -14 || echo "  (none found in /var/backups/skhata)"
  exit 1
fi

echo "This will REPLACE database '$DB_NAME' in stack '$PROJECT' with: $FILE"
read -r -p "Type 'restore' to continue: " CONFIRM
if [ "$CONFIRM" != "restore" ]; then
  echo "Aborted."
  exit 1
fi

DC=(docker compose -p "$PROJECT")

echo "Taking safety backup of current state..."
SAFETY="/tmp/pre-restore-$(date +%Y%m%d-%H%M%S).sql.gz"
"${DC[@]}" exec -T postgres pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$SAFETY"
echo "  saved: $SAFETY"

echo "Dropping and recreating schema..."
"${DC[@]}" exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -c \
  "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

echo "Restoring..."
gunzip -c "$FILE" | "${DC[@]}" exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -q

echo "Restarting backend..."
"${DC[@]}" restart backend

echo "Restore complete. Verify with: ./scripts/health-check.sh"
