#!/usr/bin/env bash
# =========================================================================
# Run database migrations (additive-only, safe to re-run — applied
# migrations are recorded in the _migrations table and skipped), then load the
# shipped product data: the base catalogue, the catalogue translations and the
# regional UI strings. All of it UPSERTs, so this is safe to re-run too. It
# loads NO demo data — that is scripts/deploy-data.sh with SEED_DEMO_DATA=true.
#   ./scripts/migrate.sh                     production stack
#   PROJECT=smart-digital-khata-dev ./scripts/migrate.sh   dev stack
# =========================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT="${PROJECT:-smart-digital-khata}"
docker compose -p "$PROJECT" exec -T backend npm run migrate
