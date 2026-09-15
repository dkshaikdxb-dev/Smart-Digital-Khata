#!/usr/bin/env bash
# =========================================================================
# Smart Digital Khata — the DATA phase of a deploy.
#
# Called by scripts/deploy.sh once the containers are up; runnable on its own
# when only the data needs refreshing:
#
#   ./scripts/deploy-data.sh
#
# It exists as its own file for two reasons: the data phase is the part of a
# deploy that has repeatedly loaded the wrong things, so it should be readable
# in one screen, and it is the part that can be exercised by a test with a stub
# runner (backend/tests/deploy-data.test.js) instead of a real VPS.
#
# WHAT IT LOADS
#
#   always   schema migrations + the shipped PRODUCT data — the base catalogue
#            (1,615 SKUs), the catalogue translations, and the regional UI
#            strings (6,716 keys, and the ONLY source of UI text for bn/gu/mr).
#            All of it is part of bringing a database up to date with the repo
#            and all of it UPSERTs, so it is safe on every deploy. It loads
#            inside `npm run migrate` — see backend/src/utils/migrate.js.
#
#   always   the localized SHOP NAMES for any shop that has none. Also inside
#            `npm run migrate`. These are derived from the shop's own English
#            name rather than shipped in the repo, so the rule is stricter: only
#            shops MISSING a language are touched (an up-to-date database does
#            no work at all), and a name an owner has corrected by hand is never
#            overwritten. Without it the discovery directory, the storefront and
#            the product search all fall back to the raw English name in every
#            language — which is what they did, on every deploy, until the
#            manual backfill script stopped being something an operator had to
#            remember.
#
#   opt-in   the DEMO data — ten demo shops with owners, customers, products,
#            orders and transactions, plus the house promo cards. Loaded ONLY
#            when SEED_DEMO_DATA=true, because silently inserting fictional
#            shops and ledgers into a production database is very hard to undo.
#
#   always   a data state report (`npm run data:status`), so the deploy log says
#            what the database now holds.
#
# THE ONE VARIABLE THE OPERATOR SETS
#
#   SEED_DEMO_DATA=true     load the demo data on this and every later deploy
#   (unset / anything else) leave the database's demo data exactly as it is
#
# Set it in .env (read below) or in the environment:
#
#   SEED_DEMO_DATA=true ./scripts/deploy.sh
#
# It is read at deploy time, never written, and turning it off again simply
# stops future deploys from re-seeding — it removes nothing. The demo seeders
# keep their own FORCE_DEMO guard underneath, which this script satisfies
# explicitly (and only) on the opted-in branch.
# =========================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf "\033[1;32m==>\033[0m %s\n" "$*"; }

# How to run an npm script in the backend container. Overridable so the tests
# can hand it a stub, and so an operator on a non-Docker box can point it at a
# plain shell.
DC_EXEC="${DC_EXEC:-docker compose exec -T}"

# Where to look for the flag when it is not in the environment. deploy.sh does
# not source .env (values there are shaped for docker compose, not for bash), so
# read just this one key out of it.
ENV_FILE="${SKHATA_ENV_FILE:-$ROOT_DIR/.env}"

seed_demo_flag() {
  if [ -n "${SEED_DEMO_DATA:-}" ]; then
    printf '%s' "$SEED_DEMO_DATA"
    return
  fi
  if [ -f "$ENV_FILE" ]; then
    sed -n 's/^[[:space:]]*SEED_DEMO_DATA[[:space:]]*=[[:space:]]*//p' "$ENV_FILE" \
      | tail -n 1 | tr -d '"'"'"'\r' | tr -d ' '
    return
  fi
  printf ''
}

# --- always: schema + the shipped product data ---------------------------
log "Running migrations and loading product data (base catalogue, catalogue translations, regional UI strings)..."
$DC_EXEC backend npm run migrate

# --- optional: the platform admin user -----------------------------------
if [ "${SEED_ADMIN:-false}" = "true" ]; then
  log "Seeding admin user..."
  $DC_EXEC backend npm run seed || true
fi

# --- opt-in: the demo data -----------------------------------------------
if [ "$(seed_demo_flag)" = "true" ]; then
  log "DEMO DATA: LOADING (SEED_DEMO_DATA=true) — ten demo shops, their catalogues, house promos."
  # FORCE_DEMO is the seeders' own production guard. Setting it here, on this
  # branch only, is this script saying "yes, the operator asked for this".
  $DC_EXEC -e FORCE_DEMO=true backend npm run data:demo
else
  log "DEMO DATA: SKIPPED (SEED_DEMO_DATA is not set) — nothing demo-shaped was written."
  log "           To load the ten demo shops, set SEED_DEMO_DATA=true in .env and deploy again."
fi

# --- always: say what the database now holds -----------------------------
log "Data state after deploy:"
$DC_EXEC backend npm run data:status
