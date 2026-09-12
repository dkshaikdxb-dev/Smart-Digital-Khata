#!/usr/bin/env bash
# =========================================================================
# Smart Digital Khata — one-command deploy
#   ./scripts/deploy.sh
#
# Safe to run on a fresh VPS or an existing one. Idempotent.
# =========================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf "\033[1;32m==>\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m!!\033[0m  %s\n" "$*"; }
err() { printf "\033[1;31mxx\033[0m  %s\n" "$*" >&2; }

# --- preflight -----------------------------------------------------------
if [ ! -f .env ]; then
  err ".env missing. Copy .env.example to .env and fill in the values."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  err "docker not found. Run scripts/bootstrap-vps.sh first."
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  err "docker compose plugin not found."
  exit 1
fi

# --- pull latest code ---------------------------------------------------
if [ -d .git ]; then
  log "Pulling latest code..."
  git fetch --all --prune
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  git pull --ff-only origin "$BRANCH" || warn "git pull skipped (local changes or detached HEAD)"
fi

# --- build & start ------------------------------------------------------
log "Building images..."
$DC build

log "Starting containers..."
$DC up -d

log "Waiting for Postgres to be healthy..."
for _ in $(seq 1 30); do
  if $DC ps postgres | grep -q "healthy"; then break; fi
  sleep 2
done

log "Running migrations..."
$DC exec -T backend npm run migrate

if [ "${SEED_ADMIN:-false}" = "true" ]; then
  log "Seeding admin user..."
  $DC exec -T backend npm run seed || true
fi

# --- post-deploy smoke check ------------------------------------------------
# Migrations running and containers starting is NOT the same as the app serving
# traffic: a bad env var, a failed module load or a crash-loop all leave the
# steps above green while the shop is down. So ask the API, on the host, whether
# it is actually alive before calling this a deployment. `set -e` is relaxed
# around the probe so we can report the failure ourselves with the logs that
# explain it, rather than dying on a bare non-zero curl.
log "Smoke-checking the API..."
API_PORT="${BACKEND_HOST_PORT:-4000}"
HEALTH_URL="http://127.0.0.1:${API_PORT}/api/health"
smoke_ok=false
for attempt in $(seq 1 20); do
  set +e
  code=$(curl -fsS -o /tmp/skhata_health.json -w '%{http_code}' --max-time 5 "$HEALTH_URL" 2>/dev/null)
  rc=$?
  set -e
  if [ "$rc" -eq 0 ] && [ "$code" = "200" ] && grep -q '"status":"ok"' /tmp/skhata_health.json; then
    smoke_ok=true
    log "API healthy after ${attempt} attempt(s): $(cat /tmp/skhata_health.json)"
    break
  fi
  sleep 3
done

if [ "$smoke_ok" != "true" ]; then
  log "DEPLOY FAILED: the API did not answer ${HEALTH_URL} with status ok."
  log "Container state:"
  $DC ps || true
  log "Last 80 lines from backend:"
  $DC logs --tail=80 backend || true
  exit 1
fi

log "Deployment complete."
$DC ps
echo
log "Last 20 lines from backend:"
$DC logs --tail=20 backend || true
