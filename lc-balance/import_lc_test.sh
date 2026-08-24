#!/usr/bin/env bash
#
# import_lc_test.sh
#
# Simulates the Import LC S01 (Sight) and U02 (Sellers Usance, 120 days)
# event sequences directly against the Balance Component MICROSERVICE via
# curl — no Angular UI, no backend/ 中台 orchestrator involved. Endpoints,
# request fields, and response shapes follow analysis/balance-component-api.yaml
# (the OAS contract for this service) exactly; the event sequence itself
# was transcribed field-for-field from the live S01/U02 IPLC_LC records in
# this project's own dev DB (balance-component.sqlite) as of 2026-08-18.
#
# S01's own real sequence is genuinely messy, transcribed as-is rather than
# cleaned up — it is real ad-hoc live-testing history, not a designed
# textbook case: Document Arrivals B01/B02 were submitted BEFORE either
# Shipping Guarantee existed (so they're plain A3, not A3S); Shipping
# Guarantee G01 was later redeemed in full via a STANDALONE A9 (Shipping
# Guarantee Redemption — no linked LC UTILIZE at all, A9 never touches the
# parent LC) that happens to reuse the SAME "B03" reference text as a
# LATER, unrelated A3S Document Arrival that pairs with G02 instead — two
# different events, same human-typed reference, not a script bug. Kept
# faithfully rather than "fixed" so this script reproduces what the real
# DB actually contains.
#
# S01 (Sight):   LC Issue 100,000 -> Document Arrival 12,000 (B01, plain,
#                no SG yet) -> SG1 (G01) 22,000 -> Document Arrival 32,000
#                (B02, plain) -> SG2 (G02) 34,000 -> standalone A9: SG1
#                FULL_REDEEM 22,000 (labelled B03, no linked LC UTILIZE)
#                -> Document Arrival w/ SG 22,000 (also labelled B03 — a
#                SEPARATE event, A3S, matches SG2 partially -> SG2
#                PARTIAL_REDEEM 22,000) -> Document Arrival w/ SG 12,000
#                (B04, A3S, matches SG2's remaining 12,000 exactly ->
#                SG2 FULL_REDEEM 12,000) -> Document Arrival 22,000 (B05,
#                plain) -> A4 real Maker Submit + Checker Release on all
#                five Document Arrivals (B01-B05). Ends Confirmed/
#                Available Balance 0 (fully drawn); both SGs end fully
#                redeemed (0 outstanding).
# U02 (Sellers Usance, 120d): LC Issue 10,000 -> Document Arrival 10,000
#                (B01, plain — U02 has no Shipping Guarantee at all) -> A6
#                Acceptance (compound: releases the source Document
#                Arrival, then the Acceptance itself). Ends Confirmed/
#                Available Balance 0 (fully drawn); the Acceptance is
#                deliberately left OPEN at 10,000 outstanding — the real
#                DB never had a matching A7 Settlement submitted against
#                it, so this script doesn't invent one either.
#
# Note (2026-08-24, post-Business-Case-Runner-inventory): S02's own SG2 PARTIAL_REDEEM step above is
# still fully valid at the microservice/API level (this script talks to the API directly, as noted below),
# but A9 (Shipping Guarantee Redemption) was locked to Full-Redeem-only in the Angular Transaction Builder
# on 2026-08-21 — a human clicking through the CURRENT interactive UI can no longer reach a Partial Redeem
# the way this step does. Kept as-is: a correct demonstration of the API's own broader contract, not a bug.
# Same status as import-case-4/import-case-6 in backend/data/businessCases.js, which transcribe the same
# underlying live data.
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
# U02-SIM-<ts>), NOT the literal "S01"/"U02" — this service hard-rejects
# re-Issuing an already-ACTIVE natural key (409 NATURAL_KEY_ALREADY_EXISTS,
# Design doc's own re-ISSUE guard), and this project's own live dev DB
# already has real S01/U02 records from manual testing. Using distinct,
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
LC_USANCE="${LC_USANCE:-U02-SIM-${TS}}"

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
echo " Import LC S01 (Sight) / U02 (Sellers Usance) simulation"
echo " Target microservice : ${BASE_URL}"
echo " LC Number — Sight   : ${LC_SIGHT}"
echo " LC Number — Usance  : ${LC_USANCE}"
echo "=============================================================="

# =========================================================================
# S01 — Sight: LC Issue 100,000 -> Document Arrival 12,000 (B01, plain) ->
#   SG1 22,000 -> Document Arrival 32,000 (B02, plain) -> SG2 34,000 ->
#   standalone A9 (SG1 FULL_REDEEM 22,000, no linked UTILIZE) ->
#   Document Arrival w/ SG 22,000 (B03, A3S, SG2 partial redeem) ->
#   Document Arrival w/ SG 12,000 (B04, A3S, SG2 full redeem) ->
#   Document Arrival 22,000 (B05, plain) -> A4 Maker Submit + Release x5
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

step "Document Arrival 12,000 (B01 — plain A3, no Shipping Guarantee exists yet)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_LC","balanceContractId":"${LC_ID}","movementType":"UTILIZE","eventSeq":2,"amount":"12000","currency":"USD","sourceTransactionRef":"B01","createdBy":"${MAKER}"}
JSON
)"
UTIL_B01="$(field '.movementId')"

step "Shipping Guarantee 22,000 (G01)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"SHGT","naturalKey":{"lcNumber":"${LC_SIGHT}","sgNumber":"G01"},"parentLogicalContractId":"${LC_LOGICAL_ID}","movementType":"ISSUE","eventSeq":1,"amount":"22000","currency":"USD","createdBy":"${MAKER}"}
JSON
)"
SG1_MOVE_ISSUE="$(field '.movementId')"
SG1_ID="$(field '.balanceContractId')"
release "${SG1_MOVE_ISSUE}" "SG1 Issue"

step "Document Arrival 32,000 (B02 — plain A3, no Shipping Guarantee referenced)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_LC","balanceContractId":"${LC_ID}","movementType":"UTILIZE","eventSeq":3,"amount":"32000","currency":"USD","sourceTransactionRef":"B02","createdBy":"${MAKER}"}
JSON
)"
UTIL_B02="$(field '.movementId')"

step "Shipping Guarantee 34,000 (G02)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"SHGT","naturalKey":{"lcNumber":"${LC_SIGHT}","sgNumber":"G02"},"parentLogicalContractId":"${LC_LOGICAL_ID}","movementType":"ISSUE","eventSeq":1,"amount":"34000","currency":"USD","createdBy":"${MAKER}"}
JSON
)"
SG2_MOVE_ISSUE="$(field '.movementId')"
SG2_ID="$(field '.balanceContractId')"
release "${SG2_MOVE_ISSUE}" "SG2 Issue"

step "Standalone A9 — SG1 FULL_REDEEM 22,000 (labelled B03; no linked LC UTILIZE — A9 never touches the parent LC)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"SHGT","balanceContractId":"${SG1_ID}","movementType":"FULL_REDEEM","eventSeq":2,"amount":"22000","currency":"USD","sourceTransactionRef":"B03","createdBy":"${MAKER}"}
JSON
)"
SG1_MOVE_REDEEM="$(field '.movementId')"
release "${SG1_MOVE_REDEEM}" "SG1 Redemption (standalone A9)"

step "Document Arrival w/ SG 22,000 (B03 — a SEPARATE A3S event, matches SG2 partially)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_LC","balanceContractId":"${LC_ID}","movementType":"UTILIZE","eventSeq":4,"amount":"22000","currency":"USD","sourceTransactionRef":"B03","businessEventId":"${LC_SIGHT}-b03","createdBy":"${MAKER}"}
JSON
)"
UTIL_B03="$(field '.movementId')"

step "SG2 Redemption = MIN(Bill 22,000, SG Outstanding 34,000) -> PARTIAL_REDEEM 22,000"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"SHGT","balanceContractId":"${SG2_ID}","movementType":"PARTIAL_REDEEM","eventSeq":2,"amount":"22000","currency":"USD","sourceTransactionRef":"B03","businessEventId":"${LC_SIGHT}-b03","createdBy":"${MAKER}"}
JSON
)"
SG2_MOVE_REDEEM1="$(field '.movementId')"
release "${SG2_MOVE_REDEEM1}" "SG2 partial Redemption"

step "Document Arrival w/ SG 12,000 (B04 — A3S, matches SG2's remaining outstanding exactly)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_LC","balanceContractId":"${LC_ID}","movementType":"UTILIZE","eventSeq":5,"amount":"12000","currency":"USD","sourceTransactionRef":"B04","businessEventId":"${LC_SIGHT}-b04","createdBy":"${MAKER}"}
JSON
)"
UTIL_B04="$(field '.movementId')"

step "SG2 Redemption = MIN(Bill 12,000, SG Outstanding 12,000) -> FULL_REDEEM 12,000"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"SHGT","balanceContractId":"${SG2_ID}","movementType":"FULL_REDEEM","eventSeq":3,"amount":"12000","currency":"USD","sourceTransactionRef":"B04","businessEventId":"${LC_SIGHT}-b04","createdBy":"${MAKER}"}
JSON
)"
SG2_MOVE_REDEEM2="$(field '.movementId')"
release "${SG2_MOVE_REDEEM2}" "SG2 full Redemption"

step "Document Arrival 22,000 (B05 — plain A3, no Shipping Guarantee)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_LC","balanceContractId":"${LC_ID}","movementType":"UTILIZE","eventSeq":6,"amount":"22000","currency":"USD","sourceTransactionRef":"B05","createdBy":"${MAKER}"}
JSON
)"
UTIL_B05="$(field '.movementId')"

step "LC Balance before any A4 Sight Settlement (expect Confirmed 100,000, Available 0)"
do_get "/balance-contracts/${LC_ID}/balance"

maker_submit "${UTIL_B01}" "B01"
release "${UTIL_B01}" "B01 (Sight Settlement finalizes)"
maker_submit "${UTIL_B02}" "B02"
release "${UTIL_B02}" "B02 (Sight Settlement finalizes)"
maker_submit "${UTIL_B03}" "B03"
release "${UTIL_B03}" "B03 (Sight Settlement finalizes)"
maker_submit "${UTIL_B04}" "B04"
release "${UTIL_B04}" "B04 (Sight Settlement finalizes)"
maker_submit "${UTIL_B05}" "B05"
release "${UTIL_B05}" "B05 (Sight Settlement finalizes)"

step "LC Balance after all five A4 Settlements (expect Confirmed 0, Available 0 — fully drawn)"
do_get "/balance-contracts/${LC_ID}/balance"
step "SG1 Balance (expect 0, fully redeemed via standalone A9)"
do_get "/balance-contracts/${SG1_ID}/balance"
step "SG2 Balance (expect 0, fully redeemed across two A3S presentations)"
do_get "/balance-contracts/${SG2_ID}/balance"

# =========================================================================
# U02 — Sellers Usance 120 days: LC Issue 10,000 -> plain Document Arrival
#   10,000 (B01, no Shipping Guarantee) -> A6 Acceptance (compound release:
#   the source Document Arrival, then the Acceptance itself). Deliberately
#   left OPEN (never Settled) — matches the real U02 record exactly.
# =========================================================================

step "LC Issue 10,000 (Sellers Usance, 120 days) — ${LC_USANCE}"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_LC","naturalKey":{"lcNumber":"${LC_USANCE}"},"movementType":"ISSUE","eventSeq":1,"amount":"10000","currency":"USD","tenorType":"SELLERS_USANCE","tenorDays":120,"createdBy":"${MAKER}"}
JSON
)"
LC_U_MOVE_ISSUE="$(field '.movementId')"
LC_U_ID="$(field '.balanceContractId')"
release "${LC_U_MOVE_ISSUE}" "LC Issue"

do_get "/balance-contracts/${LC_U_ID}/balance"
LC_U_LOGICAL_ID="$(field '.logicalContractId')"

step "Document Arrival 10,000 (B01 — plain A3, no Shipping Guarantee — U02 has none)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_LC","balanceContractId":"${LC_U_ID}","movementType":"UTILIZE","eventSeq":2,"amount":"10000","currency":"USD","sourceTransactionRef":"B01","createdBy":"${MAKER}"}
JSON
)"
UTIL_U_B01="$(field '.movementId')"

step "LC Balance before Acceptance (expect Confirmed 10,000, Available 0)"
do_get "/balance-contracts/${LC_U_ID}/balance"

step "Create Acceptance 10,000 for B01 (A6 — references the Document Arrival)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"IPLC_ACCEPTANCE","naturalKey":{"lcNumber":"${LC_USANCE}","ibNumber":"B01"},"parentLogicalContractId":"${LC_U_LOGICAL_ID}","movementType":"CREATE","eventSeq":1,"amount":"10000","currency":"USD","tenorType":"SELLERS_USANCE","tenorDays":120,"exposureNature":"ACTUAL","referencedTransactionId":"${UTIL_U_B01}","createdBy":"${MAKER}"}
JSON
)"
ACC_B01_MOVE="$(field '.movementId')"
ACC_B01_ID="$(field '.balanceContractId')"
release "${UTIL_U_B01}" "B01's own Document Arrival (resolved via referencedTransactionId, released first)"
release "${ACC_B01_MOVE}" "Acceptance CREATE — B01"

step "LC Balance after Acceptance (expect Confirmed 0, Available 0 — fully drawn)"
do_get "/balance-contracts/${LC_U_ID}/balance"
step "Acceptance B01 Balance (expect 10,000 — deliberately left OPEN, no A7 Settlement in the real data)"
do_get "/balance-contracts/${ACC_B01_ID}/balance"

echo
echo "=============================================================="
echo " Done."
echo " S01-style LC (Sight)  : ${LC_SIGHT}  (balanceContractId ${LC_ID})"
echo "   SG1 (G01)           : ${SG1_ID}"
echo "   SG2 (G02)           : ${SG2_ID}"
echo " U02-style LC (Usance) : ${LC_USANCE}  (balanceContractId ${LC_U_ID})"
echo "   Acceptance B01      : ${ACC_B01_ID}  (open, 10,000 outstanding)"
echo "=============================================================="
