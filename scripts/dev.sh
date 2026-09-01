#!/usr/bin/env bash
# =========================================================================
# Development environment — isolated from production
#   ./scripts/dev.sh            start (hot reload, follows logs)
#   ./scripts/dev.sh up -d      start detached
#   ./scripts/dev.sh down       stop (keeps data)
#   ./scripts/dev.sh down -v    stop + wipe dev database
#   ./scripts/dev.sh <any docker compose args...>
#
# Runs under project name "smart-digital-khata-dev" with its own
# containers, network, and volumes, and offset host ports
# (nginx 8080/8443, backend 14000, admin 13000, pg 15432, redis 16379)
# so a production stack on the same machine is never touched.
# =========================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — dev defaults are fine to start."
fi

DC=(docker compose -p smart-digital-khata-dev -f docker-compose.yml -f docker-compose.dev.yml)

if [ $# -eq 0 ]; then
  "${DC[@]}" up --build
else
  "${DC[@]}" "$@"
fi
