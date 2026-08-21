# Balance Component — New Test Case Verification (2026-08-21)

Records live-execution verification of the 7 new Business Case Registry entries proposed in
`Balance-Component-Test-Case-Proposal.md` §4 (import-case-8/9/10/11, export-case-8/9/10), closing that
proposal's own §1.1/§1.2 coverage gaps for A10 (Import LC Close) and B6 (Export Confirmed LC Close), plus
a standalone B2 (Export Amendment) case. Per `REGRESSION-BASELINE.md`'s own "point-in-time, not living
documentation" convention, this is a NEW dated file, not an edit to that one — it supersedes nothing
there; the original 14 cases were re-spot-checked (not re-verified in full) as part of this pass and
remain covered by `REGRESSION-BASELINE.md` itself.

**Verified via**: all 7 new cases run live against the real running microservice/backend
(`POST /api/business-cases/:id/run`), driving every step through the real `POST /balance-movements`
(Submit) + `POST /balance-movements/:id/release` (Approve) + `POST /balance-movements/:id/maker-submit`
API — no mocking, same convention as `REGRESSION-BASELINE.md` §3.

## 1. Unit / structural test suites

| Sub-project | Tests | Coverage (Stmts / Branch / Funcs / Lines) | Floor |
|---|---|---|---|
| Backend (`businessCases.test.js`, `server.test.js`, `runCase.test.js`) | 34/34 passing, 3 suites | 97.47% / 95.34% / 97.14% / 98.16% | 95% |

`businessCases.test.js` was extended (not just re-run) to cover the 7 new cases: `EXPECTED_IDS` now lists
all 21 case ids in order, the registry-size assertion moved from 14 to 21, the per-case title assertions
were extended, and the `lcNumber` pattern regex (`^(IMP|EXP)-C\d-\d+-\d+$`) was widened to
`^(IMP|EXP)-C\d+-\d+-\d+$` to admit the two-digit case numbers (`C10`/`C11`). `server.test.js`'s own
`GET /api/business-cases` listing-length assertion moved from 14 to 21. All other structural checks
(step-type validity, `*Ref` resolution ordering, `Ann`/`Bnn`/`Gnn`/`Enn` reference-number convention,
cross-call determinism) ran unmodified against the new cases and passed with no special-casing needed.

## 2. Live API execution — the 7 new cases

| Case | Scenario | Result |
|---|---|---|
| import-case-8 | A1 Issue (Sellers Usance) → A3 (plain) + A3S (SG-matched) Document Arrivals → A6 Acceptance ×2 → A7 Settlement ×2 → **A10 Close** | PASS — Close wrote off the remaining 55,000 Confirmed Balance; final snapshot Confirmed 0, status CLOSED |
| import-case-9 | A1 Issue (Buyer's Usance) → A3 Document Arrival → A6 Acceptance → A7 Settlement → **A10 Close** (no SG ever issued — trivially eligible) | PASS — wrote off 71,000; final Confirmed 0, CLOSED |
| import-case-10 | A1 Issue (Sight) → A8 SG Issue → A3 (unmatched) Document Arrival → real A4 Maker-Submit + Release → standalone **A9** `FULL_REDEEM` → **A10 Close** | PASS — SG redeemed to 0 independently of the Document Arrival (per Design doc §6.1, "not auto-linked"); Close wrote off 60,000; final Confirmed 0, CLOSED |
| import-case-11 | A1 Issue → A8 SG Issue (never redeemed) → **A10 Close attempted while SG Balance = 30,000** | PASS (negative) — `409 INSUFFICIENT_AVAILABLE_BALANCE` returned exactly as designed; LC snapshot afterward confirmed still Confirmed 100,000 / ACTIVE, SG still 30,000 — the rejected Close never applied |
| export-case-8 | B1 Confirm (Sight) → B3 Present Docs → B4 Honour (compound, Due From Issuing Bank) → **B6 Close** | PASS — wrote off the remaining 90,000 CONF LIAB; final Confirmed 0, CLOSED |
| export-case-9 | B1 Confirm (Sellers Usance) → B3 Present Docs → B4 Accept (compound, Acceptance + Reimb Receivable) → B5 Settlement (compound) → **B6 Close** | PASS — Acceptance/Reimb Receivable both settled to 0 first; Close wrote off 90,000; final Confirmed 0, CLOSED |
| export-case-10 | B1 Confirm → **B2** Amendment increase (+20,000) → **B2** Amendment decrease (−130,000) against Tight Available 120,000 | PASS — increase applied cleanly (120,000); decrease correctly rejected `409 INSUFFICIENT_AVAILABLE_BALANCE` (`checkAmendDecreaseSufficiency`); post-check snapshot confirmed still 120,000, unchanged |

**7/7 new cases pass; both intentionally-designed negative cases (import-case-11, export-case-10) fail
exactly as designed and only as designed** — zero unexpected step outcomes across all 7 traces (every
`createMovement`/`release`/`makerSubmit`/`snapshot` step's own `ok` flag matched its `expectError`
expectation).

## 3. Spot-check — original 14 cases unaffected

`import-case-1` (9/9 steps clean) and `export-case-7` (19/19 steps clean) re-run live after the backend
orchestrator process was restarted to pick up the registry change — both pass with zero `ok:false` steps,
confirming the new cases were purely additive (no existing case's step list, natural keys, or behavior was
touched).

## 4. Scope note — action items still outstanding

Per `Balance-Component-Business-Rule-Decisions-2026-08-21.md`'s own action-item table, items 2 (backend
`businessEventId`-pairing enforcement for `SHGT` `PARTIAL_REDEEM`) and 3 (`EPLC_CONFIRMATION` rejecting/
normalizing `BUYERS_USANCE`) remain **not implemented** — this verification pass covers only the test-case
matrix itself (item 6), by explicit user direction. `export-case-2`/`export-case-4`'s own `BUYERS_USANCE`
correction (action item 4) is likewise untouched.

## How to reproduce

```bash
# Backend structural tests
cd lc-balance/backend && npm test

# Live API run (requires all three dev processes — npm run dev:all)
curl -X POST http://localhost:4300/api/business-cases/import-case-8/run
curl -X POST http://localhost:4300/api/business-cases/import-case-9/run
curl -X POST http://localhost:4300/api/business-cases/import-case-10/run
curl -X POST http://localhost:4300/api/business-cases/import-case-11/run
curl -X POST http://localhost:4300/api/business-cases/export-case-8/run
curl -X POST http://localhost:4300/api/business-cases/export-case-9/run
curl -X POST http://localhost:4300/api/business-cases/export-case-10/run
# Clean up afterward: DELETE balance_movements/balance_contracts WHERE lc_number LIKE 'IMP-C%' OR 'EXP-C%'
```

---

*Point-in-time verification record, same convention as `REGRESSION-BASELINE.md` — not edited after the
fact to reflect new work; a future change gets its own new dated file.*
