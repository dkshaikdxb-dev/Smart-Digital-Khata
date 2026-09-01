#!/usr/bin/env bash
# =========================================================================
# Postgres backup
#   ./scripts/backup.sh [out-dir]                          production stack
#   PROJECT=smart-digital-khata-dev ./scripts/backup.sh    dev stack
# Keeps the last 14 backups in the output directory.
# =========================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${1:-./backups}"
PROJECT="${PROJECT:-smart-digital-khata}"
mkdir -p "$OUT_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/skhata-$STAMP.sql.gz"

docker compose -p "$PROJECT" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-skhata}" "${POSTGRES_DB:-skhata}" \
  | gzip > "$FILE"

echo "Wrote $FILE"

# Keep last 14 backups
ls -1t "$OUT_DIR"/skhata-*.sql.gz | tail -n +15 | xargs -r rm --
