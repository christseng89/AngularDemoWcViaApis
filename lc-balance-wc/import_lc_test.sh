#!/usr/bin/env bash
#
# import_lc_test.sh
#
# Simulates the Import LC S01 (Sight) and U01 (Sellers Usance, 120 days)
# event sequences directly against the Balance Component MICROSERVICE via
# curl — no Angular UI, no backend/ 中台 orchestrator involved. Endpoints,
# request fields, and response shapes follow analysis/balance-component-api.yaml
# (the OAS contract for this service) exactly; the event sequence itself
# mirrors backend/data/businessCases.js's own importCase6()/importCase7()
# functions, which were transcribed field-for-field from the user's own
# live S01/U01 runs this script reproduces (see lc-balance-wc/CLAUDE.md,
# "Business Case Registry gained Import Case #6/#7").
#
# S01 (Sight):   LC Issue 100,000 -> SG1 10,000 + SG2 20,000 -> Document
#                Arrival w/ SG 12,000 (B01, matches SG1 exactly -> FULL_REDEEM)
#                -> Document Arrival w/ SG 12,000 (B02, partially matches
#                SG2 -> PARTIAL_REDEEM) -> plain Document Arrival 30,000
#                (B03, no SG) -> A4 real Maker Submit + Checker Release
#                (Sight Settlement) on all three.
# U01 (Sellers Usance, 120d): LC Issue 100,000 -> plain Document Arrival
#                20,000 (B01) -> SG1 20,000 -> Document Arrival w/ SG 25,000
#                (B02, matches SG1 exactly -> FULL_REDEEM) -> A6 Acceptance
#                (compound: releases the source Document Arrival, then the
#                Acceptance itself) for both B01/B02 -> A7 Acceptance
#                Settlement (FULL_SETTLE) for both.
#
# Requires: curl, jq.
#
# Talks directly to the microservice — default http://localhost:4100, no
# "/api" or "/balance-component" prefix (that rewrite only exists in
# proxy.conf.json, in front of the Angular dev server; this script bypasses
# it entirely). Start the microservice first:
#   cd microservices/balance-component && npm run dev
# Override the target with BALANCE_SERVICE_URL=http://host:port if needed.
#
# LC Numbers default to fresh, timestamped values (S01-SIM-<ts>/
# U01-SIM-<ts>), NOT the literal "S01"/"U01" — this service hard-rejects
# re-Issuing an already-ACTIVE natural key (409 NATURAL_KEY_ALREADY_EXISTS,
# Design doc's own re-ISSUE guard), and this project's own live dev DB
# already has real S01/U01 records from manual testing. Using distinct,
# re-runnable SIM-suffixed keys means this script never collides with (or
# pollutes) that real data. Pass LC_SIGHT/LC_USANCE explicitly if you
# really do want to target specific natural keys (e.g. a throwaway/reset
# dev DB).
#
set -uo pipefail

BASE_URL="${BALANCE_SERVICE_URL:-http://localhost:4100}"
MAKER="maker1"
CHECKER="checker1"
TS="$(date +%s)"
LC_SIGHT="${LC_SIGHT:-S01-SIM-${TS}}"
LC_USANCE="${LC_USANCE:-U01-SIM-${TS}}"

# ── prerequisites ───────────────────────────────────────────────────────
for cmd in curl jq; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing required command: $cmd" >&2; exit 1; }
done

# ── output/HTTP helpers ─────────────────────────────────────────────────
# LAST_RESPONSE is set as a plain global (not via command substitution) so
# `exit` on an API error actually terminates the script instead of just the
# subshell a `$(...)` capture would otherwise create.
LAST_RESPONSE=""

do_post() {
  local path="$1" body="$2"
  echo ">> POST ${path}" >&2
  echo "   body: ${body}" >&2
  LAST_RESPONSE="$(curl -sS -X POST "${BASE_URL}${path}" -H 'Content-Type: application/json' -d "${body}")"
  echo "${LAST_RESPONSE}" | jq . >&2
  if echo "${LAST_RESPONSE}" | jq -e 'type == "object" and has("code")' >/dev/null 2>&1; then
    echo "!! POST ${path} returned an error — aborting." >&2
    exit 1
  fi
}

do_get() {
  local path="$1"
  echo ">> GET ${path}" >&2
  LAST_RESPONSE="$(curl -sS "${BASE_URL}${path}")"
  echo "${LAST_RESPONSE}" | jq . >&2
  if echo "${LAST_RESPONSE}" | jq -e 'type == "object" and has("code")' >/dev/null 2>&1; then
    echo "!! GET ${path} returned an error — aborting." >&2
    exit 1
  fi
}

field() { # field <jq filter> — reads out of $LAST_RESPONSE
  jq -r "$1" <<<"${LAST_RESPONSE}"
}

STEP_NO=0
step() {
  STEP_NO=$((STEP_NO + 1))
  echo
  echo "── Step ${STEP_NO}: $1 ────────────────────────────────────────────" >&2
}

release() { # release <movementId> <label>
  step "Checker releases ${2}"
  do_post "/balance-movements/$1/release" "{\"releasedBy\":\"${CHECKER}\"}"
}

maker_submit() { # maker_submit <movementId> <label>
  step "A4 real Maker Submit — ${2}"
  do_post "/balance-movements/$1/maker-submit" "{\"makerSubmittedBy\":\"${MAKER}\"}"
}

echo "=============================================================="
echo " Import LC S01 (Sight) / U01 (Sellers Usance) simulation"
echo " Target microservice : ${BASE_URL}"
echo " LC Number — Sight   : ${LC_SIGHT}"
echo " LC Number — Usance  : ${LC_USANCE}"
echo "=============================================================="

# =========================================================================
# S01 — Sight: LC Issue 100,000 -> SG1 10,000 + SG2 20,000 ->
#   Document Arrival w/ SG 12,000 (B01, full SG1 redeem) ->
#   Document Arrival w/ SG 12,000 (B02, partial SG2 redeem) ->
#   plain Document Arrival 30,000 (B03) -> A4 Maker Submit + Release x3
# =========================================================================

step "LC Issue 100,000 (Sight) — ${LC_SIGHT}"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_LC","naturalKey":{"lcNumber":"${LC_SIGHT}"},"movementType":"ISSUE","eventSeq":1,"amount":"100000","currency":"USD","tenorType":"SIGHT","createdBy":"${MAKER}"}
JSON
)"
LC_MOVE_ISSUE="$(field '.movementId')"
LC_ID="$(field '.balanceContractId')"
release "${LC_MOVE_ISSUE}" "LC Issue"

do_get "/balance-contracts/${LC_ID}/balance"
LC_LOGICAL_ID="$(field '.logicalContractId')"

step "Shipping Guarantee 10,000 (G01)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"SHGT","naturalKey":{"lcNumber":"${LC_SIGHT}","sgNumber":"G01"},"parentLogicalContractId":"${LC_LOGICAL_ID}","movementType":"ISSUE","eventSeq":1,"amount":"10000","currency":"USD","createdBy":"${MAKER}"}
JSON
)"
SG1_MOVE_ISSUE="$(field '.movementId')"
SG1_ID="$(field '.balanceContractId')"
release "${SG1_MOVE_ISSUE}" "SG1 Issue"

step "Shipping Guarantee 20,000 (G02)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"SHGT","naturalKey":{"lcNumber":"${LC_SIGHT}","sgNumber":"G02"},"parentLogicalContractId":"${LC_LOGICAL_ID}","movementType":"ISSUE","eventSeq":1,"amount":"20000","currency":"USD","createdBy":"${MAKER}"}
JSON
)"
SG2_MOVE_ISSUE="$(field '.movementId')"
SG2_ID="$(field '.balanceContractId')"
release "${SG2_MOVE_ISSUE}" "SG2 Issue"

step "Document Arrival w/ SG 12,000 (B01 — A3S, matches SG1 exactly)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_LC","balanceContractId":"${LC_ID}","movementType":"UTILIZE","eventSeq":2,"amount":"12000","currency":"USD","sourceTransactionRef":"B01","businessEventId":"${LC_SIGHT}-b01","createdBy":"${MAKER}"}
JSON
)"
UTIL_B01="$(field '.movementId')"

step "SG1 Redemption = MIN(Bill 12,000, SG Outstanding 10,000) -> FULL_REDEEM 10,000"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"SHGT","balanceContractId":"${SG1_ID}","movementType":"FULL_REDEEM","eventSeq":2,"amount":"10000","currency":"USD","sourceTransactionRef":"B01","businessEventId":"${LC_SIGHT}-b01","createdBy":"${MAKER}"}
JSON
)"
SG1_MOVE_REDEEM="$(field '.movementId')"
release "${SG1_MOVE_REDEEM}" "SG1 Redemption"

step "Document Arrival w/ SG 12,000 (B02 — A3S, partially matches SG2)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_LC","balanceContractId":"${LC_ID}","movementType":"UTILIZE","eventSeq":3,"amount":"12000","currency":"USD","sourceTransactionRef":"B02","businessEventId":"${LC_SIGHT}-b02","createdBy":"${MAKER}"}
JSON
)"
UTIL_B02="$(field '.movementId')"

step "SG2 Redemption = MIN(Bill 12,000, SG Outstanding 20,000) -> PARTIAL_REDEEM 12,000"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"SHGT","balanceContractId":"${SG2_ID}","movementType":"PARTIAL_REDEEM","eventSeq":2,"amount":"12000","currency":"USD","sourceTransactionRef":"B02","businessEventId":"${LC_SIGHT}-b02","createdBy":"${MAKER}"}
JSON
)"
SG2_MOVE_REDEEM="$(field '.movementId')"
release "${SG2_MOVE_REDEEM}" "SG2 partial Redemption"

step "Document Arrival 30,000 (B03 — plain A3, no Shipping Guarantee)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_LC","balanceContractId":"${LC_ID}","movementType":"UTILIZE","eventSeq":4,"amount":"30000","currency":"USD","sourceTransactionRef":"B03","createdBy":"${MAKER}"}
JSON
)"
UTIL_B03="$(field '.movementId')"

step "LC Balance before any A4 Sight Settlement (expect Confirmed 100,000, Available 46,000)"
do_get "/balance-contracts/${LC_ID}/balance"

maker_submit "${UTIL_B01}" "B01"
release "${UTIL_B01}" "B01 (Sight Settlement finalizes)"
maker_submit "${UTIL_B02}" "B02"
release "${UTIL_B02}" "B02 (Sight Settlement finalizes)"
maker_submit "${UTIL_B03}" "B03"
release "${UTIL_B03}" "B03 (Sight Settlement finalizes)"

step "LC Balance after all three A4 Settlements (expect Confirmed 46,000, Available 46,000)"
do_get "/balance-contracts/${LC_ID}/balance"
step "SG1 Balance (expect 0, fully redeemed)"
do_get "/balance-contracts/${SG1_ID}/balance"
step "SG2 Balance (expect 8,000 still outstanding)"
do_get "/balance-contracts/${SG2_ID}/balance"

# =========================================================================
# U01 — Sellers Usance 120 days: LC Issue 100,000 -> plain Document Arrival
#   20,000 (B01) -> SG1 20,000 -> Document Arrival w/ SG 25,000 (B02, full
#   SG1 redeem) -> A6 Acceptance (compound release) for B01/B02 -> A7
#   Acceptance Settlement (FULL_SETTLE) for both
# =========================================================================

step "LC Issue 100,000 (Sellers Usance, 120 days) — ${LC_USANCE}"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_LC","naturalKey":{"lcNumber":"${LC_USANCE}"},"movementType":"ISSUE","eventSeq":1,"amount":"100000","currency":"USD","tenorType":"SELLERS_USANCE","tenorDays":120,"createdBy":"${MAKER}"}
JSON
)"
LC_U_MOVE_ISSUE="$(field '.movementId')"
LC_U_ID="$(field '.balanceContractId')"
release "${LC_U_MOVE_ISSUE}" "LC Issue"

do_get "/balance-contracts/${LC_U_ID}/balance"
LC_U_LOGICAL_ID="$(field '.logicalContractId')"

step "Document Arrival 20,000 (B01 — plain A3, no Shipping Guarantee)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_LC","balanceContractId":"${LC_U_ID}","movementType":"UTILIZE","eventSeq":2,"amount":"20000","currency":"USD","sourceTransactionRef":"B01","createdBy":"${MAKER}"}
JSON
)"
UTIL_U_B01="$(field '.movementId')"

step "Shipping Guarantee 20,000 (G01)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"SHGT","naturalKey":{"lcNumber":"${LC_USANCE}","sgNumber":"G01"},"parentLogicalContractId":"${LC_U_LOGICAL_ID}","movementType":"ISSUE","eventSeq":1,"amount":"20000","currency":"USD","createdBy":"${MAKER}"}
JSON
)"
SG_U_MOVE_ISSUE="$(field '.movementId')"
SG_U_ID="$(field '.balanceContractId')"
release "${SG_U_MOVE_ISSUE}" "SG1 Issue"

step "Document Arrival w/ SG 25,000 (B02 — A3S, matches SG1 exactly)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_LC","balanceContractId":"${LC_U_ID}","movementType":"UTILIZE","eventSeq":3,"amount":"25000","currency":"USD","sourceTransactionRef":"B02","businessEventId":"${LC_USANCE}-b02","createdBy":"${MAKER}"}
JSON
)"
UTIL_U_B02="$(field '.movementId')"

step "SG1 Redemption = MIN(Bill 25,000, SG Outstanding 20,000) -> FULL_REDEEM 20,000"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"SHGT","balanceContractId":"${SG_U_ID}","movementType":"FULL_REDEEM","eventSeq":2,"amount":"20000","currency":"USD","sourceTransactionRef":"B02","businessEventId":"${LC_USANCE}-b02","createdBy":"${MAKER}"}
JSON
)"
SG_U_MOVE_REDEEM="$(field '.movementId')"
release "${SG_U_MOVE_REDEEM}" "SG1 Redemption"

step "LC Balance before Acceptance (expect Confirmed 100,000, Available 55,000)"
do_get "/balance-contracts/${LC_U_ID}/balance"

step "Create Acceptance 20,000 for B01 (A6 — references the Document Arrival)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_ACCEPTANCE","naturalKey":{"lcNumber":"${LC_USANCE}","ibNumber":"B01"},"parentLogicalContractId":"${LC_U_LOGICAL_ID}","movementType":"CREATE","eventSeq":1,"amount":"20000","currency":"USD","tenorType":"SELLERS_USANCE","tenorDays":120,"exposureNature":"ACTUAL","referencedTransactionId":"${UTIL_U_B01}","createdBy":"${MAKER}"}
JSON
)"
ACC_B01_MOVE="$(field '.movementId')"
ACC_B01_ID="$(field '.balanceContractId')"
release "${UTIL_U_B01}" "B01's own Document Arrival (resolved via referencedTransactionId, released first)"
release "${ACC_B01_MOVE}" "Acceptance CREATE — B01"

step "Create Acceptance 25,000 for B02 (A6 — references the Document Arrival)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_ACCEPTANCE","naturalKey":{"lcNumber":"${LC_USANCE}","ibNumber":"B02"},"parentLogicalContractId":"${LC_U_LOGICAL_ID}","movementType":"CREATE","eventSeq":1,"amount":"25000","currency":"USD","tenorType":"SELLERS_USANCE","tenorDays":120,"exposureNature":"ACTUAL","referencedTransactionId":"${UTIL_U_B02}","createdBy":"${MAKER}"}
JSON
)"
ACC_B02_MOVE="$(field '.movementId')"
ACC_B02_ID="$(field '.balanceContractId')"
release "${UTIL_U_B02}" "B02's own Document Arrival (resolved via referencedTransactionId, released first)"
release "${ACC_B02_MOVE}" "Acceptance CREATE — B02"

step "LC Balance after both Acceptances (expect Confirmed 55,000, Available 55,000)"
do_get "/balance-contracts/${LC_U_ID}/balance"
step "Acceptance B01 Balance (expect 20,000)"
do_get "/balance-contracts/${ACC_B01_ID}/balance"
step "Acceptance B02 Balance (expect 25,000)"
do_get "/balance-contracts/${ACC_B02_ID}/balance"

step "Acceptance Settlement (A7) — FULL_SETTLE 20,000 (B01)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_ACCEPTANCE","balanceContractId":"${ACC_B01_ID}","movementType":"FULL_SETTLE","eventSeq":2,"amount":"20000","currency":"USD","createdBy":"${MAKER}"}
JSON
)"
SETTLE_B01_MOVE="$(field '.movementId')"
release "${SETTLE_B01_MOVE}" "Settlement — B01"

step "Acceptance Settlement (A7) — FULL_SETTLE 25,000 (B02)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_ACCEPTANCE","balanceContractId":"${ACC_B02_ID}","movementType":"FULL_SETTLE","eventSeq":2,"amount":"25000","currency":"USD","createdBy":"${MAKER}"}
JSON
)"
SETTLE_B02_MOVE="$(field '.movementId')"
release "${SETTLE_B02_MOVE}" "Settlement — B02"

step "Acceptance B01 Balance after Settlement (expect 0)"
do_get "/balance-contracts/${ACC_B01_ID}/balance"
step "Acceptance B02 Balance after Settlement (expect 0)"
do_get "/balance-contracts/${ACC_B02_ID}/balance"

echo
echo "=============================================================="
echo " Done."
echo " S01-style LC (Sight)  : ${LC_SIGHT}  (balanceContractId ${LC_ID})"
echo "   SG1 (G01)           : ${SG1_ID}"
echo "   SG2 (G02)           : ${SG2_ID}"
echo " U01-style LC (Usance) : ${LC_USANCE}  (balanceContractId ${LC_U_ID})"
echo "   SG1 (G01)           : ${SG_U_ID}"
echo "   Acceptance B01      : ${ACC_B01_ID}"
echo "   Acceptance B02      : ${ACC_B02_ID}"
echo "=============================================================="
