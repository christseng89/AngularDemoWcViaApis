# export-case-11 (B6 Close eligibility gate, Acceptance-balance path) — Verification (2026-08-22)

Adds the one negative-path angle on the A10/B6 Close eligibility gate that neither
`import-case-11` (2026-08-21, the SG-balance path) nor `export-case-8`/`export-case-9`
(2026-08-21, the positive paths) exercised: attempting **B6 Close while the Confirmation's own
Acceptance Liability is still outstanding** (Settlement/B5 never run). `domain/closeEligibility.ts`'s own
`acceptanceMovements` check is unconditional across both Import and Export roots (unlike the SG check,
which is `IPLC_LC`-only) — this case is the first to actually exercise that Export-side branch of it.

Registry grew from 21 to 22 cases. Per the established convention this is a NEW dated file — the decision
memo, test-case proposal, and the two 2026-08-21 verification reports are not edited to reflect it.

## 1. The addition

`backend/data/businessCases.js` — new `exportCase11(lc, ib)`, registered as the last entry in
`buildRegistry()`. Path: `B1 Confirm (Sellers Usance) → B3 Present Docs → B4 Accept (compound: Acceptance
Liability CREATE) → B6 Close attempted with the Acceptance Liability still at 10,000, never settled`.
`backend/test/businessCases.test.js` — `EXPECTED_IDS` extended, registry-size assertion 21 → 22, a title
assertion added for `export-case-11`; the `lcNumber` pattern regex (`^(IMP|EXP)-C\d+-\d+-\d+$`) already
admits two-digit case numbers from the 2026-08-21 pass, no change needed.
`backend/test/server.test.js` — `GET /api/business-cases` listing-length assertion 21 → 22.

## 2. Structural tests

```
cd lc-balance/backend && npm test
```

34/34 passing, 3 suites, coverage 97.5%/95.34%/97.22%/98.18% (`businessCases.js` itself at 100% across all
four metrics).

## 3. Live API execution

Backend orchestrator restarted to pick up the new registry entry; a warm-up call (`export-case-1`)
confirmed the orchestrator↔microservice connection was live before running the new case, avoiding the
transient `fetch failed` race noted in the 2026-08-22 tenorType-fix verification.

`export-case-11` run live end to end — every step matched expectation, including the exact rejection
message:

```
[ERROR(expected)] createMovement - B6 Close attempted while Acceptance Liability = 10,000 (not 0)
  movementType=INSUFFICIENT_AVAILABLE_BALANCE status=409
  msg=Cannot Close EPLC_CONFIRMATION EXP-C11-... — Acceptance Balance must be 0 (currently 10000) —
      settle the Acceptance first (A7/B5).
```

Both post-attempt snapshots confirmed the rejected Close never applied: CONF LIAB still Confirmed 90,000
(status ACTIVE, not CLOSED), Acceptance Liability still 10,000.

**Spot-check, two existing cases unaffected**: `export-case-9` (22/22 steps clean) and `import-case-11`
(7/7 steps clean, its own SG-balance negative path still fails exactly as designed) — confirms this
addition is purely additive.

## 4. Cleanup

Test data from this run (`EXP-C11-*` naturalKey pattern, 10 contract rows across this case's own root +
Examination + Acceptance contracts) removed afterward. 54 reference-data contracts remained before and
after, byte-for-byte unchanged.

## How to reproduce

```bash
cd lc-balance/backend && npm test
# requires all three dev processes running (npm run dev:all)
curl -X POST http://localhost:4300/api/business-cases/export-case-11/run
# Clean up afterward: DELETE balance_movements/balance_contracts WHERE lc_number LIKE 'EXP-C11-%'
```

---

*Point-in-time verification record, same convention as `REGRESSION-BASELINE.md` and the earlier
2026-08-21/2026-08-22 verification reports — not edited after the fact to reflect new work.*
