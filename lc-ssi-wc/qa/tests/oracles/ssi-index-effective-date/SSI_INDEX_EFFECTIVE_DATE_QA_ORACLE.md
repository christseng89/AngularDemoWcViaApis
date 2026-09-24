# SSI Index Effective Date presentation — Independent QA oracle

**Status:** `PASS` — independent QA completed against the frozen Maker candidate.  
**Data policy:** Read-only verification only; no shared DB POST or data mutation.

## Frozen candidate identity

- Candidate patch SHA-256: `368A559A7E39C18D97C63D25ABA87106EB4D29CC7ECCF28DDE366D9CDB89C460`
- Canonical patch bytes: `6595`
- QA independently reconstructed all six base files, matched every declared base SHA, generated the canonical unified patch, and reproduced the exact patch byte count and SHA.
- QA reconstruction evidence: `qa/tests/oracles/ssi-index-effective-date/reconstruct-candidate.js`.

## Authorized delta

- Rename `Effective Period` to `Effective Date`.
- Display only the end/effective-to date (`route.validTo`) in the SSI Index cell.
- Make the column sort binding/order expression use the same effective-to/end-date field.

## No-change gates

| Gate | Required result | Status |
|---|---|---|
| Display | No valid-from value or arrow; exact valid-to value remains | `PASS` — template uses only `route.validTo`; live UI shows `Effective Date` and `2027-12-31` only |
| Sort | UI sort identity and repository ordering both use end/effective-to date | `PASS` — public `EFFECTIVE_PERIOD` identity retained; portal comparator and SQLite expression both use `validTo` |
| Business rules | Valid-from/valid-to validation, storage and lifecycle remain unchanged | `PASS` — only ordering expression changed; validity-window query and lifecycle code are outside the candidate delta |
| Prior accepted UI | SSI columns, single-value display and SUPPRESSION Draft Submit remain intact | `PASS` — focused contract suite includes both prior UI and suppression contracts |
| Other behavior | Buttons, predicates, handlers, row/keyboard, filters, count and pagination unchanged | `PASS` — template delta is limited to the heading and displayed date cell; live UI count/pagination and actions remain present |
| RMA/API/data | No RMA, API contract, DB, seed, fixture or runtime-data change | `PASS` — exact patch contains only the six declared UI/sort/test files; QA performed no POST or DB mutation |
| Regression | Focused tests, full relevant suites, typecheck, lint, format and build pass | `PASS` |

## Independent execution evidence

- Portal focused, no cache: `3 suites / 15 tests PASS`.
- SQLite repository focused, no cache: `1 suite / 12 tests PASS`.
- Portal full, no cache: `42 suites / 353 tests PASS`.
- SSI service full, no cache: `67 suites / 1017 tests PASS`.
- Portal and SSI service typecheck: `PASS`.
- Portal and SSI service build: `PASS` (Nx cache hit; full no-cache test/typecheck evidence is recorded above).
- ESLint: `0 errors`; Angular HTML was reported as ignored by the direct ESLint invocation, while Prettier checked the HTML.
- Prettier six candidate files: `PASS`.
- `git diff --check` six candidate files: `PASS` (line-ending warnings only).
- Live read-only UI at `http://localhost:4600/`: header is `EFFECTIVE DATE`; first page has 10 rows displaying only `2027-12-31`; pagination remains `Page 1 / 2 · 11 records`; no mutation action was invoked.

## Final verdict

`PASS` — the exact candidate implements the approved Effective Date presentation and sort alignment without changing the public sort identity, validity business rules, API contract, or runtime data.

This defect-level verdict does not waive the separate operating-model manifest SHA mismatch or repository-wide coverage governance gate.
