# import-case-12 (A10 Close eligibility gate, Acceptance-balance path) — Verification (2026-08-22)

Mirrors `export-case-11`'s own Acceptance-balance negative path (2026-08-22) on the Import side — completes
the A10/B6 Close eligibility matrix symmetrically across both sides:

| Gate condition | Import (A10) | Export (B6) |
|---|---|---|
| SG Confirmed Balance != 0 | `import-case-11` (2026-08-22) | n/a — SG is Import-only |
| Acceptance Confirmed Balance != 0 | `import-case-12` (this file) | `export-case-11` (2026-08-22) |

Registry grew from 22 to 23 cases. Per the established convention this is a NEW dated file — the decision
memo, test-case proposal, and the four prior 2026-08-21/2026-08-22 verification reports are not edited to
reflect it.

## 1. The addition

`backend/data/businessCases.js` — new `importCase12(lc, ib)`, registered right after `importCase11` in
`buildRegistry()`. Path: `A1 Issue (Sellers Usance) → A3 Document Arrival → A6 Acceptance (Liability
50,000, never settled) → A10 Close attempted while the Acceptance Liability is still outstanding`.
`backend/test/businessCases.test.js` — `EXPECTED_IDS` extended, registry-size assertion 22 → 23, a title
assertion added for `import-case-12`. `backend/test/server.test.js` — listing-length assertion 22 → 23.

## 2. Structural tests

```
cd lc-balance/backend && npm test
```

34/34 passing, 3 suites, coverage 97.52%/95.34%/97.29%/98.19% (`businessCases.js` itself at 100% across
all four metrics).

## 3. Live API execution

Backend orchestrator restarted to pick up the new registry entry; a warm-up call (`export-case-1`)
confirmed the orchestrator↔microservice connection was live first, same convention as the
`export-case-11` verification pass.

`import-case-12` run live end to end — every snapshot matched its own pre-written comment exactly, with
nothing needing correction:

| Step | Expected (comment) | Actual |
|---|---|---|
| LC Balance after Accept | 50,000 | `confirmed: 50000` |
| Acceptance Liability before Close | 50,000 | `confirmed: 50000` |
| A10 Close attempt | 409 eligibility error | `409 INSUFFICIENT_AVAILABLE_BALANCE` |
| LC Balance after rejected Close | still 50,000, ACTIVE | `confirmed: 50000` |
| Acceptance Liability after rejected Close | still 50,000 | `confirmed: 50000` |

Exact rejection message:

```
Cannot Close IPLC_LC IMP-C12-... — Acceptance Balance must be 0 (currently 50000) —
settle the Acceptance first (A7/B5).
```

**Spot-check, two existing cases unaffected**: `export-case-11` (12/12 steps clean, its own negative path
still fails exactly as designed) and `import-case-7` (24/24 steps clean) — confirms this addition is
purely additive.

## 4. Cleanup

Test data from this run (`IMP-C12-*` naturalKey pattern, contract rows for the root LC + Acceptance)
removed afterward, alongside the rest of that batch. 54 reference-data contracts remained untouched
throughout (verified via the same IMP-C%/EXP-C% cleanup query used for every prior pass).

## How to reproduce

```bash
cd lc-balance/backend && npm test
# requires all three dev processes running (npm run dev:all)
curl -X POST http://localhost:4300/api/business-cases/import-case-12/run
# Clean up afterward: DELETE balance_movements/balance_contracts WHERE lc_number LIKE 'IMP-C12-%'
```

---

*Point-in-time verification record, same convention as `REGRESSION-BASELINE.md` and the prior
2026-08-21/2026-08-22 verification reports — not edited after the fact to reflect new work. This closes
the A10/B6 Close-eligibility test-case work for this round — the matrix is now symmetric across both
sides.*
