#!/usr/bin/env bash
# =========================================================================
# Postgres backup
#   ./scripts/backup.sh [out-dir]
# =========================================================================
set -euo pipefail

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/skhata-$STAMP.sql.gz"

docker compose exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-skhata}" "${POSTGRES_DB:-skhata}" \
  | gzip > "$FILE"

echo "Wrote $FILE"

# Keep last 14 backups
ls -1t "$OUT_DIR"/skhata-*.sql.gz | tail -n +15 | xargs -r rm --
