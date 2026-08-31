#!/usr/bin/env bash
#
# export_lc_test.sh
#
# Simulates the Export Confirmed LC S01 (Sight) and U01 (Sellers Usance,
# 120 days) event sequences directly against the Balance Component
# MICROSERVICE via curl — no Angular UI, no backend/ 中台 orchestrator
# involved. Endpoints, request fields, and response shapes follow
# analysis/balance-component-api.yaml (the OAS contract for this service)
# exactly; the event sequence itself was transcribed field-for-field from
# the live S01/U01 EPLC_CONFIRMATION records in this project's own dev DB
# (balance-component.sqlite) as of 2026-08-18, AFTER the same-day B3->B4
# redesign ("狀態是交易的狀態 而非BALANCE的狀態 所有交易要RELEASE過後 才能
# 根據流程走下一個交易" — see lc-balance-wc/CLAUDE.md's own "B3 (Present
# Docs) redesigned to genuinely RELEASE on its own" decision-log entry).
#
# NOTE ON "U02": the requested LC number was "U02", but the dev DB only
# has a Usance Export Confirmed LC record numbered "U01" (no "U02" exists
# for EPLC_CONFIRMATION) — this script reproduces U01's own real event
# sequence instead and is named/labelled accordingly throughout. Sight is
# genuinely "S01" — that part of the request matched the DB exactly.
#
# This is the Export-side sibling of the pre-existing import_lc_test.sh —
# same helper functions/style/conventions, mirroring Import LC's own
# A-series naming with this side's own B-series function codes:
#   B1 (Confirm LC)      -> EPLC_CONFIRMATION / ISSUE
#   B3 (Present Docs)     -> EPLC_EXAMINATION / CREATE (MEMO_ONLY earmark;
#                            now genuinely RELEASEs on its own, standalone,
#                            since the 2026-08-18 redesign — no more
#                            acknowledge()-only path)
#   B4 (Honour/Accept)    -> EPLC_CONFIRMATION / HONOUR (Sight) or ACCEPT
#                            (Usance) — a compound Maker Submit that also
#                            creates a linked leg on a NEW child contract,
#                            all three legs sharing one businessEventId:
#                              Sight:  HONOUR + EPLC_DUE_FROM_ISSUING_BANK/CREATE
#                              Usance: ACCEPT + EPLC_ACCEPTANCE/CREATE
#                                      + EPLC_ACCEPTANCE_REIMB_RECEIVABLE/CREATE
#                            references the Present Docs CREATE via
#                            referencedTransactionId; because B3 already
#                            RELEASEd itself, B4 no longer re-releases the
#                            source as one of its own legs — it releases
#                            only its own newly-created leg(s), then B3's
#                            own presentDocsConsumedAt/By is set as a side
#                            effect of releasing the linked HONOUR/ACCEPT.
#   B5 (Settlement)        -> EPLC_ACCEPTANCE / FULL_SETTLE, compound with
#                            EPLC_ACCEPTANCE_REIMB_RECEIVABLE / REIMBURSE
#                            (Usance only — a Sight Confirmation never
#                            creates an Acceptance at all).
#
# S01 (Sight):   Confirm LC 100,000 -> 4 Present Docs presentations (E01
#                12,345 / E02 22,345 / E03 32,345 / E04 32,965, summing to
#                exactly 100,000) -> B4 Honour against each, compound with
#                its own Due From Issuing Bank leg. Ends Confirmed/
#                Available Balance 0 (fully drawn).
# U01 (Sellers Usance, 120d): Confirm LC 10,000 -> 3 Present Docs
#                presentations (E01 1,234 / E02 2,234 / E03 6,532, summing
#                to exactly 10,000) -> B4 Accept against each (compound:
#                Acceptance Liability + Acceptance Reimbursement
#                Receivable) -> B5 Settlement (FULL_SETTLE + REIMBURSE)
#                against each Acceptance. Ends Confirmed/Available Balance
#                0 (fully drawn); every Acceptance ends fully settled (0).
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

echo "=============================================================="
echo " Export Confirmed LC S01 (Sight) / U01 (Sellers Usance) simulation"
echo " Target microservice : ${BASE_URL}"
echo " LC Number — Sight   : ${LC_SIGHT}"
echo " LC Number — Usance  : ${LC_USANCE}"
echo "=============================================================="

# =========================================================================
# S01 — Sight: Confirm LC 100,000 -> 4 Present Docs presentations (B3,
#   12,345 / 22,345 / 32,345 / 32,965) -> B4 Honour against each, compound
#   with its own Due From Issuing Bank leg (2-way shared businessEventId).
# =========================================================================

step "B1 Confirm LC 100,000 (Sight) — ${LC_SIGHT}"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_CONFIRMATION","naturalKey":{"lcNumber":"${LC_SIGHT}"},"movementType":"ISSUE","eventSeq":1,"amount":"100000","currency":"USD","tenorType":"SIGHT","createdBy":"${MAKER}"}
JSON
)"
CONF_MOVE_ISSUE="$(field '.movementId')"
CONF_ID="$(field '.balanceContractId')"
release "${CONF_MOVE_ISSUE}" "Confirm LC Issue"

do_get "/balance-contracts/${CONF_ID}/balance"
CONF_LOGICAL_ID="$(field '.logicalContractId')"

# ── E01: Present Docs 12,345 -> B4 Honour ────────────────────────────────
step "B3 Present Docs 12,345 (E01)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_EXAMINATION","naturalKey":{"lcNumber":"${LC_SIGHT}","ibNumber":"E01"},"parentLogicalContractId":"${CONF_LOGICAL_ID}","movementType":"CREATE","eventSeq":1,"amount":"12345","currency":"USD","createdBy":"${MAKER}"}
JSON
)"
EX_E01_MOVE="$(field '.movementId')"
release "${EX_E01_MOVE}" "Present Docs (E01) — B3 now genuinely RELEASEs on its own"

step "B4 Honour 12,345 (E01) — compound: HONOUR + Due From Issuing Bank CREATE"
BIZ_E01="${LC_SIGHT}-e01-honour"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_CONFIRMATION","balanceContractId":"${CONF_ID}","movementType":"HONOUR","eventSeq":2,"amount":"12345","currency":"USD","sourceTransactionRef":"E01","referencedTransactionId":"${EX_E01_MOVE}","businessEventId":"${BIZ_E01}","createdBy":"${MAKER}"}
JSON
)"
HONOUR_E01_MOVE="$(field '.movementId')"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_DUE_FROM_ISSUING_BANK","naturalKey":{"lcNumber":"${LC_SIGHT}","ibNumber":"E01"},"parentLogicalContractId":"${CONF_LOGICAL_ID}","movementType":"CREATE","eventSeq":1,"amount":"12345","currency":"USD","exposureNature":"CONTINGENT","businessEventId":"${BIZ_E01}","createdBy":"${MAKER}"}
JSON
)"
DFIB_E01_MOVE="$(field '.movementId')"
DFIB_E01_ID="$(field '.balanceContractId')"
release "${HONOUR_E01_MOVE}" "Honour (E01) — the Present Docs source (E01) is already RELEASED, so this is B4's only remaining release call for this leg"
release "${DFIB_E01_MOVE}" "Due From Issuing Bank CREATE (E01)"

# ── E02: Present Docs 22,345 -> B4 Honour ────────────────────────────────
step "B3 Present Docs 22,345 (E02)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_EXAMINATION","naturalKey":{"lcNumber":"${LC_SIGHT}","ibNumber":"E02"},"parentLogicalContractId":"${CONF_LOGICAL_ID}","movementType":"CREATE","eventSeq":2,"amount":"22345","currency":"USD","createdBy":"${MAKER}"}
JSON
)"
EX_E02_MOVE="$(field '.movementId')"
release "${EX_E02_MOVE}" "Present Docs (E02)"

step "B4 Honour 22,345 (E02) — compound: HONOUR + Due From Issuing Bank CREATE"
BIZ_E02="${LC_SIGHT}-e02-honour"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_CONFIRMATION","balanceContractId":"${CONF_ID}","movementType":"HONOUR","eventSeq":3,"amount":"22345","currency":"USD","sourceTransactionRef":"E02","referencedTransactionId":"${EX_E02_MOVE}","businessEventId":"${BIZ_E02}","createdBy":"${MAKER}"}
JSON
)"
HONOUR_E02_MOVE="$(field '.movementId')"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_DUE_FROM_ISSUING_BANK","naturalKey":{"lcNumber":"${LC_SIGHT}","ibNumber":"E02"},"parentLogicalContractId":"${CONF_LOGICAL_ID}","movementType":"CREATE","eventSeq":1,"amount":"22345","currency":"USD","exposureNature":"CONTINGENT","businessEventId":"${BIZ_E02}","createdBy":"${MAKER}"}
JSON
)"
DFIB_E02_MOVE="$(field '.movementId')"
DFIB_E02_ID="$(field '.balanceContractId')"
release "${HONOUR_E02_MOVE}" "Honour (E02)"
release "${DFIB_E02_MOVE}" "Due From Issuing Bank CREATE (E02)"

# ── E03: Present Docs 32,345 -> B4 Honour ────────────────────────────────
step "B3 Present Docs 32,345 (E03)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_EXAMINATION","naturalKey":{"lcNumber":"${LC_SIGHT}","ibNumber":"E03"},"parentLogicalContractId":"${CONF_LOGICAL_ID}","movementType":"CREATE","eventSeq":3,"amount":"32345","currency":"USD","createdBy":"${MAKER}"}
JSON
)"
EX_E03_MOVE="$(field '.movementId')"
release "${EX_E03_MOVE}" "Present Docs (E03)"

step "B4 Honour 32,345 (E03) — compound: HONOUR + Due From Issuing Bank CREATE"
BIZ_E03="${LC_SIGHT}-e03-honour"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_CONFIRMATION","balanceContractId":"${CONF_ID}","movementType":"HONOUR","eventSeq":4,"amount":"32345","currency":"USD","sourceTransactionRef":"E03","referencedTransactionId":"${EX_E03_MOVE}","businessEventId":"${BIZ_E03}","createdBy":"${MAKER}"}
JSON
)"
HONOUR_E03_MOVE="$(field '.movementId')"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_DUE_FROM_ISSUING_BANK","naturalKey":{"lcNumber":"${LC_SIGHT}","ibNumber":"E03"},"parentLogicalContractId":"${CONF_LOGICAL_ID}","movementType":"CREATE","eventSeq":1,"amount":"32345","currency":"USD","exposureNature":"CONTINGENT","businessEventId":"${BIZ_E03}","createdBy":"${MAKER}"}
JSON
)"
DFIB_E03_MOVE="$(field '.movementId')"
DFIB_E03_ID="$(field '.balanceContractId')"
release "${HONOUR_E03_MOVE}" "Honour (E03)"
release "${DFIB_E03_MOVE}" "Due From Issuing Bank CREATE (E03)"

# ── E04: Present Docs 32,965 -> B4 Honour (closes the LC out exactly) ───
step "B3 Present Docs 32,965 (E04)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_EXAMINATION","naturalKey":{"lcNumber":"${LC_SIGHT}","ibNumber":"E04"},"parentLogicalContractId":"${CONF_LOGICAL_ID}","movementType":"CREATE","eventSeq":4,"amount":"32965","currency":"USD","createdBy":"${MAKER}"}
JSON
)"
EX_E04_MOVE="$(field '.movementId')"
release "${EX_E04_MOVE}" "Present Docs (E04)"

step "B4 Honour 32,965 (E04) — compound: HONOUR + Due From Issuing Bank CREATE"
BIZ_E04="${LC_SIGHT}-e04-honour"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_CONFIRMATION","balanceContractId":"${CONF_ID}","movementType":"HONOUR","eventSeq":5,"amount":"32965","currency":"USD","sourceTransactionRef":"E04","referencedTransactionId":"${EX_E04_MOVE}","businessEventId":"${BIZ_E04}","createdBy":"${MAKER}"}
JSON
)"
HONOUR_E04_MOVE="$(field '.movementId')"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_DUE_FROM_ISSUING_BANK","naturalKey":{"lcNumber":"${LC_SIGHT}","ibNumber":"E04"},"parentLogicalContractId":"${CONF_LOGICAL_ID}","movementType":"CREATE","eventSeq":1,"amount":"32965","currency":"USD","exposureNature":"CONTINGENT","businessEventId":"${BIZ_E04}","createdBy":"${MAKER}"}
JSON
)"
DFIB_E04_MOVE="$(field '.movementId')"
DFIB_E04_ID="$(field '.balanceContractId')"
release "${HONOUR_E04_MOVE}" "Honour (E04)"
release "${DFIB_E04_MOVE}" "Due From Issuing Bank CREATE (E04)"

step "Confirmed LC Balance after all 4 presentations fully Honoured (expect Confirmed 0, Available 0 — 12345+22345+32345+32965 = 100000)"
do_get "/balance-contracts/${CONF_ID}/balance"

# =========================================================================
# U01 — Sellers Usance 120 days: Confirm LC 10,000 -> 3 Present Docs
#   presentations (B3, 1,234 / 2,234 / 6,532) -> B4 Accept against each
#   (compound: Acceptance Liability CREATE + Acceptance Reimbursement
#   Receivable CREATE, 3-way shared businessEventId with the ACCEPT
#   itself) -> B5 Settlement (FULL_SETTLE + REIMBURSE, 2-way shared
#   businessEventId) against each Acceptance.
# =========================================================================

step "B1 Confirm LC 10,000 (Sellers Usance, 120 days) — ${LC_USANCE}"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_CONFIRMATION","naturalKey":{"lcNumber":"${LC_USANCE}"},"movementType":"ISSUE","eventSeq":1,"amount":"10000","currency":"USD","tenorType":"SELLERS_USANCE","tenorDays":120,"createdBy":"${MAKER}"}
JSON
)"
CONF_U_MOVE_ISSUE="$(field '.movementId')"
CONF_U_ID="$(field '.balanceContractId')"
release "${CONF_U_MOVE_ISSUE}" "Confirm LC Issue"

do_get "/balance-contracts/${CONF_U_ID}/balance"
CONF_U_LOGICAL_ID="$(field '.logicalContractId')"

# ── E01: Present Docs 1,234 -> B4 Accept -> B5 Settlement ────────────────
step "B3 Present Docs 1,234 (E01)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_EXAMINATION","naturalKey":{"lcNumber":"${LC_USANCE}","ibNumber":"E01"},"parentLogicalContractId":"${CONF_U_LOGICAL_ID}","movementType":"CREATE","eventSeq":1,"amount":"1234","currency":"USD","createdBy":"${MAKER}"}
JSON
)"
EX_U_E01_MOVE="$(field '.movementId')"
release "${EX_U_E01_MOVE}" "Present Docs (E01) — B3 now genuinely RELEASEs on its own"

step "B4 Accept 1,234 (E01) — compound: ACCEPT + Acceptance Liability CREATE + Acceptance Reimbursement Receivable CREATE"
BIZ_U_E01="${LC_USANCE}-e01-accept"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_CONFIRMATION","balanceContractId":"${CONF_U_ID}","movementType":"ACCEPT","eventSeq":2,"amount":"1234","currency":"USD","sourceTransactionRef":"E01","referencedTransactionId":"${EX_U_E01_MOVE}","businessEventId":"${BIZ_U_E01}","createdBy":"${MAKER}"}
JSON
)"
ACCEPT_E01_MOVE="$(field '.movementId')"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_ACCEPTANCE","naturalKey":{"lcNumber":"${LC_USANCE}","ibNumber":"E01"},"parentLogicalContractId":"${CONF_U_LOGICAL_ID}","movementType":"CREATE","eventSeq":1,"amount":"1234","currency":"USD","tenorType":"SELLERS_USANCE","tenorDays":120,"exposureNature":"ACTUAL","businessEventId":"${BIZ_U_E01}","createdBy":"${MAKER}"}
JSON
)"
ACC_E01_MOVE="$(field '.movementId')"
ACC_E01_ID="$(field '.balanceContractId')"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_ACCEPTANCE_REIMB_RECEIVABLE","naturalKey":{"lcNumber":"${LC_USANCE}","ibNumber":"E01"},"parentLogicalContractId":"${CONF_U_LOGICAL_ID}","movementType":"CREATE","eventSeq":1,"amount":"1234","currency":"USD","exposureNature":"CONTINGENT","businessEventId":"${BIZ_U_E01}","createdBy":"${MAKER}"}
JSON
)"
REIMB_E01_MOVE="$(field '.movementId')"
REIMB_E01_ID="$(field '.balanceContractId')"
release "${ACCEPT_E01_MOVE}" "Accept (E01) — the Present Docs source (E01) is already RELEASED, so this is B4's first remaining release call for this leg"
release "${ACC_E01_MOVE}" "Acceptance Liability CREATE (E01)"
release "${REIMB_E01_MOVE}" "Acceptance Reimbursement Receivable CREATE (E01)"

step "B5 Settlement (E01) — compound: Acceptance FULL_SETTLE + Reimbursement Receivable REIMBURSE"
BIZ_U_E01_SETTLE="${LC_USANCE}-e01-settle"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_ACCEPTANCE","balanceContractId":"${ACC_E01_ID}","movementType":"FULL_SETTLE","eventSeq":2,"amount":"1234","currency":"USD","businessEventId":"${BIZ_U_E01_SETTLE}","createdBy":"${MAKER}"}
JSON
)"
SETTLE_E01_MOVE="$(field '.movementId')"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_ACCEPTANCE_REIMB_RECEIVABLE","balanceContractId":"${REIMB_E01_ID}","movementType":"REIMBURSE","eventSeq":2,"amount":"1234","currency":"USD","businessEventId":"${BIZ_U_E01_SETTLE}","createdBy":"${MAKER}"}
JSON
)"
REIMBURSE_E01_MOVE="$(field '.movementId')"
release "${SETTLE_E01_MOVE}" "Acceptance FULL_SETTLE (E01)"
release "${REIMBURSE_E01_MOVE}" "Reimbursement Receivable REIMBURSE (E01)"

# ── E02: Present Docs 2,234 -> B4 Accept -> B5 Settlement ────────────────
step "B3 Present Docs 2,234 (E02)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_EXAMINATION","naturalKey":{"lcNumber":"${LC_USANCE}","ibNumber":"E02"},"parentLogicalContractId":"${CONF_U_LOGICAL_ID}","movementType":"CREATE","eventSeq":2,"amount":"2234","currency":"USD","createdBy":"${MAKER}"}
JSON
)"
EX_U_E02_MOVE="$(field '.movementId')"
release "${EX_U_E02_MOVE}" "Present Docs (E02)"

step "B4 Accept 2,234 (E02) — compound: ACCEPT + Acceptance Liability CREATE + Acceptance Reimbursement Receivable CREATE"
BIZ_U_E02="${LC_USANCE}-e02-accept"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_CONFIRMATION","balanceContractId":"${CONF_U_ID}","movementType":"ACCEPT","eventSeq":3,"amount":"2234","currency":"USD","sourceTransactionRef":"E02","referencedTransactionId":"${EX_U_E02_MOVE}","businessEventId":"${BIZ_U_E02}","createdBy":"${MAKER}"}
JSON
)"
ACCEPT_E02_MOVE="$(field '.movementId')"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_ACCEPTANCE","naturalKey":{"lcNumber":"${LC_USANCE}","ibNumber":"E02"},"parentLogicalContractId":"${CONF_U_LOGICAL_ID}","movementType":"CREATE","eventSeq":1,"amount":"2234","currency":"USD","tenorType":"SELLERS_USANCE","tenorDays":120,"exposureNature":"ACTUAL","businessEventId":"${BIZ_U_E02}","createdBy":"${MAKER}"}
JSON
)"
ACC_E02_MOVE="$(field '.movementId')"
ACC_E02_ID="$(field '.balanceContractId')"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_ACCEPTANCE_REIMB_RECEIVABLE","naturalKey":{"lcNumber":"${LC_USANCE}","ibNumber":"E02"},"parentLogicalContractId":"${CONF_U_LOGICAL_ID}","movementType":"CREATE","eventSeq":1,"amount":"2234","currency":"USD","exposureNature":"CONTINGENT","businessEventId":"${BIZ_U_E02}","createdBy":"${MAKER}"}
JSON
)"
REIMB_E02_MOVE="$(field '.movementId')"
REIMB_E02_ID="$(field '.balanceContractId')"
release "${ACCEPT_E02_MOVE}" "Accept (E02)"
release "${ACC_E02_MOVE}" "Acceptance Liability CREATE (E02)"
release "${REIMB_E02_MOVE}" "Acceptance Reimbursement Receivable CREATE (E02)"

step "B5 Settlement (E02) — compound: Acceptance FULL_SETTLE + Reimbursement Receivable REIMBURSE"
BIZ_U_E02_SETTLE="${LC_USANCE}-e02-settle"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_ACCEPTANCE","balanceContractId":"${ACC_E02_ID}","movementType":"FULL_SETTLE","eventSeq":2,"amount":"2234","currency":"USD","businessEventId":"${BIZ_U_E02_SETTLE}","createdBy":"${MAKER}"}
JSON
)"
SETTLE_E02_MOVE="$(field '.movementId')"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_ACCEPTANCE_REIMB_RECEIVABLE","balanceContractId":"${REIMB_E02_ID}","movementType":"REIMBURSE","eventSeq":2,"amount":"2234","currency":"USD","businessEventId":"${BIZ_U_E02_SETTLE}","createdBy":"${MAKER}"}
JSON
)"
REIMBURSE_E02_MOVE="$(field '.movementId')"
release "${SETTLE_E02_MOVE}" "Acceptance FULL_SETTLE (E02)"
release "${REIMBURSE_E02_MOVE}" "Reimbursement Receivable REIMBURSE (E02)"

# ── E03: Present Docs 6,532 -> B4 Accept -> B5 Settlement (closes the LC out exactly) ──
step "B3 Present Docs 6,532 (E03)"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_EXAMINATION","naturalKey":{"lcNumber":"${LC_USANCE}","ibNumber":"E03"},"parentLogicalContractId":"${CONF_U_LOGICAL_ID}","movementType":"CREATE","eventSeq":3,"amount":"6532","currency":"USD","createdBy":"${MAKER}"}
JSON
)"
EX_U_E03_MOVE="$(field '.movementId')"
release "${EX_U_E03_MOVE}" "Present Docs (E03)"

step "B4 Accept 6,532 (E03) — compound: ACCEPT + Acceptance Liability CREATE + Acceptance Reimbursement Receivable CREATE"
BIZ_U_E03="${LC_USANCE}-e03-accept"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_CONFIRMATION","balanceContractId":"${CONF_U_ID}","movementType":"ACCEPT","eventSeq":4,"amount":"6532","currency":"USD","sourceTransactionRef":"E03","referencedTransactionId":"${EX_U_E03_MOVE}","businessEventId":"${BIZ_U_E03}","createdBy":"${MAKER}"}
JSON
)"
ACCEPT_E03_MOVE="$(field '.movementId')"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_ACCEPTANCE","naturalKey":{"lcNumber":"${LC_USANCE}","ibNumber":"E03"},"parentLogicalContractId":"${CONF_U_LOGICAL_ID}","movementType":"CREATE","eventSeq":1,"amount":"6532","currency":"USD","tenorType":"SELLERS_USANCE","tenorDays":120,"exposureNature":"ACTUAL","businessEventId":"${BIZ_U_E03}","createdBy":"${MAKER}"}
JSON
)"
ACC_E03_MOVE="$(field '.movementId')"
ACC_E03_ID="$(field '.balanceContractId')"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_ACCEPTANCE_REIMB_RECEIVABLE","naturalKey":{"lcNumber":"${LC_USANCE}","ibNumber":"E03"},"parentLogicalContractId":"${CONF_U_LOGICAL_ID}","movementType":"CREATE","eventSeq":1,"amount":"6532","currency":"USD","exposureNature":"CONTINGENT","businessEventId":"${BIZ_U_E03}","createdBy":"${MAKER}"}
JSON
)"
REIMB_E03_MOVE="$(field '.movementId')"
REIMB_E03_ID="$(field '.balanceContractId')"
release "${ACCEPT_E03_MOVE}" "Accept (E03)"
release "${ACC_E03_MOVE}" "Acceptance Liability CREATE (E03)"
release "${REIMB_E03_MOVE}" "Acceptance Reimbursement Receivable CREATE (E03)"

step "B5 Settlement (E03) — compound: Acceptance FULL_SETTLE + Reimbursement Receivable REIMBURSE"
BIZ_U_E03_SETTLE="${LC_USANCE}-e03-settle"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_ACCEPTANCE","balanceContractId":"${ACC_E03_ID}","movementType":"FULL_SETTLE","eventSeq":2,"amount":"6532","currency":"USD","businessEventId":"${BIZ_U_E03_SETTLE}","createdBy":"${MAKER}"}
JSON
)"
SETTLE_E03_MOVE="$(field '.movementId')"
do_post "/balance-movements" "$(cat <<JSON
{"instrumentType":"EPLC_ACCEPTANCE_REIMB_RECEIVABLE","balanceContractId":"${REIMB_E03_ID}","movementType":"REIMBURSE","eventSeq":2,"amount":"6532","currency":"USD","businessEventId":"${BIZ_U_E03_SETTLE}","createdBy":"${MAKER}"}
JSON
)"
REIMBURSE_E03_MOVE="$(field '.movementId')"
release "${SETTLE_E03_MOVE}" "Acceptance FULL_SETTLE (E03)"
release "${REIMBURSE_E03_MOVE}" "Reimbursement Receivable REIMBURSE (E03)"

step "Confirmed LC Balance after all 3 presentations fully Accepted (expect Confirmed 0, Available 0 — 1234+2234+6532 = 10000)"
do_get "/balance-contracts/${CONF_U_ID}/balance"
step "Acceptance E01 Balance after Settlement (expect 0)"
do_get "/balance-contracts/${ACC_E01_ID}/balance"
step "Acceptance E02 Balance after Settlement (expect 0)"
do_get "/balance-contracts/${ACC_E02_ID}/balance"
step "Acceptance E03 Balance after Settlement (expect 0)"
do_get "/balance-contracts/${ACC_E03_ID}/balance"

echo
echo "=============================================================="
echo " Done."
echo " S01-style Confirmed LC (Sight)  : ${LC_SIGHT}  (balanceContractId ${CONF_ID})"
echo "   Present Docs E01/E02/E03/E04  : 12345 / 22345 / 32345 / 32965"
echo "   Due From Issuing Bank E01     : ${DFIB_E01_ID}"
echo "   Due From Issuing Bank E02     : ${DFIB_E02_ID}"
echo "   Due From Issuing Bank E03     : ${DFIB_E03_ID}"
echo "   Due From Issuing Bank E04     : ${DFIB_E04_ID}"
echo " U01-style Confirmed LC (Usance) : ${LC_USANCE}  (balanceContractId ${CONF_U_ID})"
echo "   Present Docs E01/E02/E03      : 1234 / 2234 / 6532"
echo "   Acceptance E01                : ${ACC_E01_ID}"
echo "   Acceptance E02                : ${ACC_E02_ID}"
echo "   Acceptance E03                : ${ACC_E03_ID}"
echo "   Reimb. Receivable E01/E02/E03 : ${REIMB_E01_ID} / ${REIMB_E02_ID} / ${REIMB_E03_ID}"
echo "=============================================================="
