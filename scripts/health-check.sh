#!/usr/bin/env bash
# =========================================================================
# Health check — verifies every service is actually working.
#   ./scripts/health-check.sh          check the production stack
#   PROJECT=smart-digital-khata-dev BACKEND_HOST_PORT=14000 \
#     ./scripts/health-check.sh        check the dev stack
# Exit code 0 = all healthy, 1 = something failed (cron/CI friendly).
# =========================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT="${PROJECT:-smart-digital-khata}"
PORT="${BACKEND_HOST_PORT:-4000}"
DC=(docker compose -p "$PROJECT")
FAIL=0

ok()   { printf "  \033[1;32mOK\033[0m   %s\n" "$*"; }
bad()  { printf "  \033[1;31mFAIL\033[0m %s\n" "$*"; FAIL=1; }

echo "Checking stack '$PROJECT'..."

# 1. Containers up
for svc in postgres redis backend admin nginx; do
  state=$("${DC[@]}" ps --format '{{.State}}' "$svc" 2>/dev/null || true)
  case "$state" in
    running*) ok "container $svc running" ;;
    *)        bad "container $svc not running (state: ${state:-missing})" ;;
  esac
done

# 2. Postgres accepting connections
if "${DC[@]}" exec -T postgres pg_isready -q 2>/dev/null; then
  ok "postgres accepting connections"
else
  bad "postgres not ready"
fi

# 3. Redis responding
if [ "$("${DC[@]}" exec -T redis redis-cli ping 2>/dev/null)" = "PONG" ]; then
  ok "redis responding"
else
  bad "redis not responding"
fi

# 4. API health endpoint
if wget -qO- "http://127.0.0.1:${PORT}/api/health" 2>/dev/null | grep -q '"status":"ok"'; then
  ok "API /api/health returns ok (port $PORT)"
else
  bad "API health endpoint not answering on port $PORT"
fi

# 5. Migrations applied
COUNT=$("${DC[@]}" exec -T postgres psql -U "${POSTGRES_USER:-skhata}" -d "${POSTGRES_DB:-skhata}" -tAc \
  "SELECT COUNT(*) FROM _migrations" 2>/dev/null || echo 0)
if [ "${COUNT:-0}" -ge 2 ]; then
  ok "migrations applied ($COUNT)"
else
  bad "migrations table missing or empty — run ./scripts/migrate.sh"
fi

# 6. Disk space
USED=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "${USED:-0}" -lt 90 ]; then
  ok "disk usage ${USED}%"
else
  bad "disk usage ${USED}% — clean up (docker system prune, old backups)"
fi

echo
if [ $FAIL -eq 0 ]; then
  echo "All checks passed."
else
  echo "One or more checks FAILED — see docs/TROUBLESHOOTING.md"
fi
exit $FAIL
