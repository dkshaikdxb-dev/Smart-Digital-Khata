#!/usr/bin/env bash
# =========================================================================
# Run database migrations (additive-only, safe to re-run — applied
# migrations are recorded in the _migrations table and skipped).
#   ./scripts/migrate.sh                     production stack
#   PROJECT=smart-digital-khata-dev ./scripts/migrate.sh   dev stack
# =========================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT="${PROJECT:-smart-digital-khata}"
docker compose -p "$PROJECT" exec -T backend npm run migrate
