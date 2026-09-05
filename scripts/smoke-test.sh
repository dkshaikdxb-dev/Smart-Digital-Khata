#!/usr/bin/env bash
# =============================================================================
# Smart Digital Khata — end-to-end server smoke test
# =============================================================================
# Exercises the key server-side functionality against a running backend and
# prints PASS/FAIL per check with a final summary. Exits non-zero if any check
# fails, so it is safe to wire into CI or a post-deploy gate.
#
# Usage:
#   ./scripts/smoke-test.sh                       # against http://localhost:4000
#   BASE_URL=https://khata.example.com ./scripts/smoke-test.sh
#   ./scripts/smoke-test.sh https://khata.example.com
#
# Requirements: bash, curl, python3 (all present on the dev box and the VPS).
# The script is idempotent — every run uses unique emails/phones derived from a
# timestamp, so it never collides with a previous run or with real data.
#
# NOTE: it only touches data it creates (one throwaway shop + its customers and
# orders). It does NOT need Razorpay or WhatsApp credentials — those paths are
# not exercised here (they require external services); see SAMPLE_DATA_AND_TESTING.md.
# =============================================================================

set -u

BASE_URL="${BASE_URL:-${1:-http://localhost:4000}}"
BASE_URL="${BASE_URL%/}"   # strip trailing slash

PASS=0
FAIL=0

# ---- tiny helpers -----------------------------------------------------------

# pyget "<python-expr>" — read JSON on stdin as `d`, print the expression.
# Prints an empty line and returns non-zero if the JSON is unparseable.
pyget() {
  python3 -c 'import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(2)
try:
    sys.stdout.write(str(eval(sys.argv[1])))
except Exception:
    sys.exit(3)
' "$1"
}

# http METHOD PATH [JSON_BODY] [TOKEN]
# Populates globals BODY (response body) and CODE (HTTP status).
http() {
  local method="$1" path="$2" data="${3:-}" token="${4:-}"
  local args out
  args=(-s -w $'\n%{http_code}' -X "$method" "$BASE_URL$path"
        -H 'Content-Type: application/json' -H 'Accept: application/json')
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$data" ] && args+=(--data "$data")
  out="$(curl "${args[@]}")"
  CODE="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
}

pass() { PASS=$((PASS + 1)); printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() {
  FAIL=$((FAIL + 1))
  printf '  \033[31mFAIL\033[0m  %s\n' "$1"
  [ -n "${2:-}" ] && printf '        %s\n' "$2"
}

# check "name" <expected> <actual>
check() {
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "expected [$2] got [$3]"; fi
}

section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ---- unique identifiers for this run ---------------------------------------
TS="$(date +%s)"
SUF="${TS: -9}"
OWNER_EMAIL="owner_${TS}@smoke.local"
OWNER_PHONE="9${SUF}"      # 10 digits
PASSWORD="SmokeTest1234"
CUST_PHONE="8${SUF}"       # credit-limit customer
IDEM_PHONE="7${SUF}"       # idempotency customer
CONSUMER_PHONE="6${SUF}"   # consumer (places orders)
UUID() { python3 -c 'import uuid; print(uuid.uuid4())'; }

echo "Smart Digital Khata smoke test"
echo "Target: $BASE_URL"
echo "Run id: $TS"

# =============================================================================
section "1. Health"
# =============================================================================
http GET /api/health
STATUS="$(printf '%s' "$BODY" | pyget "d['status']" 2>/dev/null)"
check "GET /api/health returns 200" "200" "$CODE"
check "health status == ok" "ok" "$STATUS"

# =============================================================================
section "2. Auth — register shop, login by email and phone"
# =============================================================================
REG_BODY="$(python3 -c 'import json,sys; print(json.dumps({
  "name":"Smoke Owner","email":sys.argv[1],"phone":sys.argv[2],
  "password":sys.argv[3],"shopName":"Smoke Kirana"}))' "$OWNER_EMAIL" "$OWNER_PHONE" "$PASSWORD")"
http POST /api/auth/register "$REG_BODY"
check "register shop returns 201" "201" "$CODE"
OWNER_TOKEN="$(printf '%s' "$BODY" | pyget "d['token']" 2>/dev/null)"
SHOP_ID="$(printf '%s' "$BODY" | pyget "d['shop']['id']" 2>/dev/null)"
[ -n "$OWNER_TOKEN" ] && pass "register returned a JWT" || fail "register returned a JWT" "no token"
[ -n "$SHOP_ID" ] && pass "register returned a shop id" || fail "register returned a shop id" "no shop id"

LOGIN_EMAIL_BODY="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$OWNER_EMAIL" "$PASSWORD")"
http POST /api/auth/login "$LOGIN_EMAIL_BODY"
check "login by email returns 200" "200" "$CODE"
[ -n "$(printf '%s' "$BODY" | pyget "d['token']" 2>/dev/null)" ] && pass "login by email returned a JWT" || fail "login by email returned a JWT"

LOGIN_PHONE_BODY="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$OWNER_PHONE" "$PASSWORD")"
http POST /api/auth/login "$LOGIN_PHONE_BODY"
check "login by phone returns 200" "200" "$CODE"
[ -n "$(printf '%s' "$BODY" | pyget "d['token']" 2>/dev/null)" ] && pass "login by phone returned a JWT" || fail "login by phone returned a JWT"

# =============================================================================
section "3. Customers, khata purchase, idempotent replay, credit-limit block"
# =============================================================================
# Credit-limit customer: limit ₹500 = 50000 paise.
CUST_BODY="$(python3 -c 'import json,sys; print(json.dumps({"name":"Ramesh","phone":sys.argv[1],"credit_limit":50000}))' "$CUST_PHONE")"
http POST /api/customers "$CUST_BODY" "$OWNER_TOKEN"
check "add customer returns 201" "201" "$CODE"
CUST_ID="$(printf '%s' "$BODY" | pyget "d['customer']['id']" 2>/dev/null)"
[ -n "$CUST_ID" ] && pass "customer created with an id" || fail "customer created with an id"

# Idempotency customer: no credit limit (0 = unlimited).
IDEM_CUST_BODY="$(python3 -c 'import json,sys; print(json.dumps({"name":"Sita","phone":sys.argv[1],"credit_limit":0}))' "$IDEM_PHONE")"
http POST /api/customers "$IDEM_CUST_BODY" "$OWNER_TOKEN"
IDEM_ID="$(printf '%s' "$BODY" | pyget "d['customer']['id']" 2>/dev/null)"

# --- Idempotent khata purchase: same client_request_id => exactly one debit ---
CRID="$(UUID)"
TXN_BODY="$(python3 -c 'import json,sys; print(json.dumps({
  "customer_id":sys.argv[1],"type":"purchase","amount":10000,
  "client_request_id":sys.argv[2]}))' "$IDEM_ID" "$CRID")"
http POST /api/transactions "$TXN_BODY" "$OWNER_TOKEN"
check "khata purchase returns 201" "201" "$CODE"
BAL1="$(printf '%s' "$BODY" | pyget "int(d['customer']['balance'])" 2>/dev/null)"
TXID1="$(printf '%s' "$BODY" | pyget "d['transaction']['id']" 2>/dev/null)"
check "balance after ₹100 purchase == 10000 paise" "10000" "$BAL1"

# Replay the SAME client_request_id — must NOT double-debit.
http POST /api/transactions "$TXN_BODY" "$OWNER_TOKEN"
BAL2="$(printf '%s' "$BODY" | pyget "int(d['customer']['balance'])" 2>/dev/null)"
TXID2="$(printf '%s' "$BODY" | pyget "d['transaction']['id']" 2>/dev/null)"
check "idempotent replay keeps balance == 10000 (one debit)" "10000" "$BAL2"
check "idempotent replay returns the same transaction id" "$TXID1" "$TXID2"

# --- Credit-limit block ------------------------------------------------------
# First purchase ₹300 (30000) — allowed (under the ₹500 limit).
P1="$(python3 -c 'import json,sys; print(json.dumps({"customer_id":sys.argv[1],"type":"purchase","amount":30000}))' "$CUST_ID")"
http POST /api/transactions "$P1" "$OWNER_TOKEN"
check "first ₹300 purchase under limit returns 201" "201" "$CODE"
# Second purchase ₹300 — would reach ₹600 > ₹500 limit — must be blocked (422).
http POST /api/transactions "$P1" "$OWNER_TOKEN"
check "over-limit purchase blocked with 422" "422" "$CODE"

# =============================================================================
section "4. Products — a normal item and a sold_by_weight (loose) item"
# =============================================================================
# Normal product: ₹25/unit = 2500 paise.
NP_BODY='{"name":"Parle-G Biscuit","price":2500,"unit":"packet"}'
http POST /api/products "$NP_BODY" "$OWNER_TOKEN"
check "add normal product returns 201" "201" "$CODE"
NP_ID="$(printf '%s' "$BODY" | pyget "d['product']['id']" 2>/dev/null)"
NP_WEIGHED="$(printf '%s' "$BODY" | pyget "str(d['product']['sold_by_weight']).lower()" 2>/dev/null)"
check "normal product sold_by_weight == false" "false" "$NP_WEIGHED"

# Weighed product: ₹60/kg = 6000 paise per KG, sold_by_weight true (unit forced to kg).
WP_BODY='{"name":"Loose Sugar","price":6000,"sold_by_weight":true,"unit":"packet"}'
http POST /api/products "$WP_BODY" "$OWNER_TOKEN"
check "add weighed product returns 201" "201" "$CODE"
WP_ID="$(printf '%s' "$BODY" | pyget "d['product']['id']" 2>/dev/null)"
WP_WEIGHED="$(printf '%s' "$BODY" | pyget "str(d['product']['sold_by_weight']).lower()" 2>/dev/null)"
WP_UNIT="$(printf '%s' "$BODY" | pyget "d['product']['unit']" 2>/dev/null)"
check "weighed product sold_by_weight == true" "true" "$WP_WEIGHED"
check "weighed product unit forced to kg" "kg" "$WP_UNIT"

# =============================================================================
section "5. Catalogue — localized search (?lang=hi returns product_local)"
# =============================================================================
# Add a custom base-catalog item so the search has something to find. It joins
# the shared base (is_global). No i18n row exists for it, so product_local falls
# back to English — but the localized code path must still populate the field.
CAT_WORD="Smoketestrice${TS}"
CUSTOM_BODY="$(python3 -c 'import json,sys; print(json.dumps({"product":sys.argv[1],"price":5000}))' "$CAT_WORD")"
http POST /api/catalog/custom "$CUSTOM_BODY" "$OWNER_TOKEN"
check "add custom catalog item returns 201" "201" "$CODE"

http GET "/api/catalog?lang=hi&search=${CAT_WORD}" "" "$OWNER_TOKEN"
check "localized catalog search returns 200" "200" "$CODE"
CAT_COUNT="$(printf '%s' "$BODY" | pyget "len(d['items'])" 2>/dev/null)"
HAS_LOCAL="$(printf '%s' "$BODY" | pyget "'product_local' in d['items'][0] and bool(d['items'][0]['product_local'])" 2>/dev/null)"
[ "${CAT_COUNT:-0}" -ge 1 ] 2>/dev/null && pass "search found the catalog item" || fail "search found the catalog item" "count=$CAT_COUNT"
check "?lang=hi item carries a product_local field" "True" "$HAS_LOCAL"

# =============================================================================
section "6. Consumer orders — cash (no khata), credit (khata debit), weighed"
# =============================================================================
# Enable pickup is on by default; log in the consumer via OTP (dev_code is
# returned when NODE_ENV != production).
OTP_BODY="$(python3 -c 'import json,sys; print(json.dumps({"phone":sys.argv[1]}))' "$CONSUMER_PHONE")"
http POST /api/customer-auth/request-otp "$OTP_BODY"
check "request-otp returns 200" "200" "$CODE"
DEV_CODE="$(printf '%s' "$BODY" | pyget "d.get('dev_code','')" 2>/dev/null)"
if [ -z "$DEV_CODE" ]; then
  fail "OTP dev_code available (needs NODE_ENV!=production)" "no dev_code in response — cannot exercise consumer order flow"
else
  pass "OTP dev_code returned for test login"
  VERIFY_BODY="$(python3 -c 'import json,sys; print(json.dumps({"phone":sys.argv[1],"code":sys.argv[2]}))' "$CONSUMER_PHONE" "$DEV_CODE")"
  http POST /api/customer-auth/verify-otp "$VERIFY_BODY"
  check "verify-otp returns 200" "200" "$CODE"
  CONSUMER_TOKEN="$(printf '%s' "$BODY" | pyget "d['token']" 2>/dev/null)"

  # --- CASH order: 2 x normal (₹25) = ₹50, pickup. No khata debit. -----------
  CASH_ORDER="$(python3 -c 'import json,sys; print(json.dumps({
    "shop_id":sys.argv[1],"items":[{"product_id":sys.argv[2],"quantity":2}],
    "fulfillment_type":"pickup","payment_mode":"cash"}))' "$SHOP_ID" "$NP_ID")"
  http POST /api/my/orders "$CASH_ORDER" "$CONSUMER_TOKEN"
  check "place CASH order returns 201" "201" "$CODE"
  CASH_ORDER_ID="$(printf '%s' "$BODY" | pyget "d['order']['id']" 2>/dev/null)"
  CASH_PS="$(printf '%s' "$BODY" | pyget "d['order']['payment_status']" 2>/dev/null)"
  CASH_TOTAL="$(printf '%s' "$BODY" | pyget "int(d['order']['total'])" 2>/dev/null)"
  check "cash order total == 5000 paise" "5000" "$CASH_TOTAL"
  check "cash order payment_status == pending" "pending" "$CASH_PS"

  # Cash must NOT debit the khata: the consumer's balance at this shop stays 0.
  http GET "/api/my/khata/${SHOP_ID}" "" "$CONSUMER_TOKEN"
  BAL_AFTER_CASH="$(printf '%s' "$BODY" | pyget "int(d['balance'])" 2>/dev/null)"
  check "khata balance after CASH order == 0 (no debit)" "0" "$BAL_AFTER_CASH"

  # --- CREDIT order: 1 x normal (₹25) = ₹25, pickup. Debits the khata. -------
  CREDIT_ORDER="$(python3 -c 'import json,sys; print(json.dumps({
    "shop_id":sys.argv[1],"items":[{"product_id":sys.argv[2],"quantity":1}],
    "fulfillment_type":"pickup","payment_mode":"credit"}))' "$SHOP_ID" "$NP_ID")"
  http POST /api/my/orders "$CREDIT_ORDER" "$CONSUMER_TOKEN"
  check "place CREDIT order returns 201" "201" "$CODE"
  CREDIT_TOTAL="$(printf '%s' "$BODY" | pyget "int(d['order']['total'])" 2>/dev/null)"
  http GET "/api/my/khata/${SHOP_ID}" "" "$CONSUMER_TOKEN"
  BAL_AFTER_CREDIT="$(printf '%s' "$BODY" | pyget "int(d['balance'])" 2>/dev/null)"
  check "khata balance after CREDIT order == 2500 (debited)" "2500" "$BAL_AFTER_CREDIT"

  # --- WEIGHED order: 250 g of a ₹60/kg item = 1500 paise, server-recomputed.
  # A forged client price/line_total is sent and must be IGNORED (schema strips
  # it; the server recomputes from weight_grams and the trusted product price).
  WEIGH_ORDER="$(python3 -c 'import json,sys; print(json.dumps({
    "shop_id":sys.argv[1],
    "items":[{"product_id":sys.argv[2],"weight_grams":250,"unit_price":1,"line_total":1}],
    "fulfillment_type":"pickup","payment_mode":"cash"}))' "$SHOP_ID" "$WP_ID")"
  http POST /api/my/orders "$WEIGH_ORDER" "$CONSUMER_TOKEN"
  check "place WEIGHED order returns 201" "201" "$CODE"
  WEIGH_LINE="$(printf '%s' "$BODY" | pyget "int(d['order']['items'][0]['line_total'])" 2>/dev/null)"
  WEIGH_TOTAL="$(printf '%s' "$BODY" | pyget "int(d['order']['total'])" 2>/dev/null)"
  check "weighed line: 250g x ₹60/kg == 1500 paise (server-recomputed)" "1500" "$WEIGH_LINE"
  check "weighed order total == 1500 paise (forged client price ignored)" "1500" "$WEIGH_TOTAL"

  # =========================================================================
  section "7. Owner completes the CASH order → payment_status becomes paid"
  # =========================================================================
  http PATCH "/api/orders/${CASH_ORDER_ID}/status" '{"status":"completed"}' "$OWNER_TOKEN"
  check "mark cash order completed returns 200" "200" "$CODE"
  http GET "/api/orders/${CASH_ORDER_ID}" "" "$OWNER_TOKEN"
  DONE_STATUS="$(printf '%s' "$BODY" | pyget "d['order']['status']" 2>/dev/null)"
  DONE_PS="$(printf '%s' "$BODY" | pyget "d['order']['payment_status']" 2>/dev/null)"
  check "completed order status == completed" "completed" "$DONE_STATUS"
  check "completed cash order payment_status == paid" "paid" "$DONE_PS"
fi

# =============================================================================
section "Summary"
# =============================================================================
TOTAL=$((PASS + FAIL))
printf '  %d checks · \033[32m%d passed\033[0m · \033[31m%d failed\033[0m\n' "$TOTAL" "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '\n\033[31mSMOKE TEST FAILED\033[0m\n'
  exit 1
fi
printf '\n\033[32mSMOKE TEST PASSED\033[0m\n'
exit 0
