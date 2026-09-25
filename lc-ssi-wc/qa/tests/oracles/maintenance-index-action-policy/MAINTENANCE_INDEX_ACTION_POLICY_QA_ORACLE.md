# Maintenance Index Action Policy — Independent QA Oracle

**Status:** `LOCKED / WAITING_FOR_MAKER_CANDIDATE`  
**Scope:** RMA, Entity, Nostro, and SSI maintenance indexes.  
**Separation:** QA owns this oracle and independent evidence only. Maker owns all product code and Maker tests.  
**Mutation policy:** No shared Development DB write, seed/fixture/data mutation, or QA edit to Maker files.

## Authority

The Product Owner matrix in `memory/ssi/ssi-maintenance-workflow-memory.md` lines 74–89 is authoritative. Verified LF SHA-256:

`341AC79E6032639926BC20656A9A0E2D7B804F7EBD90CEA2FFA068DDD3DEB45F`

The tab is the maximum presentation gate. Server lifecycle, authorization, maker/checker, concurrency, and eligibility checks remain authoritative.

## Primary denominator: exactly 40 resource/scenario cases

Execute every scenario for `RMA`, `ENTITY`, `NOSTRO`, and `SSI`: **10 scenarios × 4 resources = 40 cases**. A mixed-row table scenario passes only if every row assertion passes.

| Suffix | Tab        | Row/input state                                                           | Expected action headers    | Expected row result                        |
| ------ | ---------- | ------------------------------------------------------------------------- | -------------------------- | ------------------------------------------ |
| `01`   | ACTIVE     | ACTIVE, no open revision                                                  | Revise, Suppress           | Revise and Suppress only                   |
| `02`   | ACTIVE     | ACTIVE, open `WIP`                                                        | Revise, Suppress           | Two blank action cells; no mutation button |
| `03`   | ACTIVE     | ACTIVE, open `DRAFT`                                                      | Revise, Suppress           | Two blank action cells; no mutation button |
| `04`   | ACTIVE     | ACTIVE, open `PENDING_APPROVAL`                                           | Revise, Suppress           | Two blank action cells; no mutation button |
| `05`   | ACTIVE     | ACTIVE, open `APPROVED` legacy                                            | Revise, Suppress           | Two blank action cells; no mutation button |
| `06`   | DRAFT      | DRAFT, `ADD`                                                              | Submit, Edit, Revoke Draft | All three buttons                          |
| `07`   | DRAFT      | DRAFT, `REVISION`                                                         | Submit, Edit, Revoke Draft | All three buttons                          |
| `08`   | DRAFT      | DRAFT, `SUPPRESSION`                                                      | Submit, Edit, Revoke Draft | Submit and Revoke Draft; blank Edit cell   |
| `09`   | SUPPRESSED | SUPPRESSED                                                                | None                       | No action `th` or `td`                     |
| `10`   | ALL        | Mixed unlocked ACTIVE, ordinary DRAFT, SUPPRESSION DRAFT, SUPPRESSED rows | None                       | No action `th` or `td` for any row         |

Case IDs are `<RESOURCE>-<SUFFIX>`, for example `SSI-08`. Unknown, missing, or duplicate IDs fail reconciliation.

```text
Expected = 40
Executed = 40
Passed   = 40
Failed   = 0
Missing  = 0
Duplicate= 0
Unknown  = 0
```

## Additional gates — excluded from the 40-case denominator

1. **Shared typed policy / OOD:** one pure typed `MaintenanceIndexActionPolicy` is consumed by both shared CRUD and SSI specialized hosts. Resource adapters may normalize fields but may not duplicate action decisions.
2. **INFO retention:** `Request Type` and `Revision Status` labels/bindings remain visible in every applicable index/tab.
3. **Row view/keyboard:** row click, `Enter`, and `Space` open the same View Record in every tab; Space prevents page scrolling.
4. **Button propagation:** every mutation button calls `stopPropagation()`; activation invokes only the existing handler and does not open View Record.
5. **Dynamic columns/colspan:** ACTIVE has 2 action columns, DRAFT 3, SUPPRESSED/ALL 0. Empty/loading/error colspan equals visible info plus policy action columns.
6. **Sort reset:** if a tab switch removes the selected action-sort column, reset to that resource's existing configured default sort/direction. Preserve a still-visible sort. Introduce no new business ordering.
7. **Handler/API/server non-regression:** existing handlers and endpoint/method/payload bindings remain unchanged; no lifecycle, permissions, four-eyes, conflict, version, or concurrency change.
8. **UI non-regression:** global Add/Export/Import/Dry-run and Checker Approve/Reject remain unchanged; search, filter, count, pagination, row identity, and informational sorting remain unchanged.
9. **Accessibility:** blank cells preserve table structure; removed action columns are absent visually and from accessibility; buttons retain accessible names and keyboard activation.

## Exact candidate evidence format

Maker handoff must include:

1. Base commit and exact ordered changed-file list.
2. LF/UTF-8-no-BOM SHA-256 per changed file.
3. Deterministic patch/bundle recipe, byte count, and SHA-256.
4. Red evidence naming failing case IDs.
5. Green evidence listing all 40 case IDs and separate additional-gate counts.
6. Focused/full portal tests, typecheck, lint, format, build, and `git diff --check` results.
7. Explicit no API/server/DB/seed/fixture/data change declaration.

QA recomputes the identity before testing. SHA mismatch means `NOT_EXECUTED`.

QA result rows use:

`Case ID | resource | tab/status/changeType/openRevision | expected headers/actions | actual | PASS/FAIL`

## No-DB-write evidence

Before QA commands, inventory repository/shared-runtime `*.db`, `*.sqlite`, and `*.sqlite3`: absolute path, size, last-write timestamp, and SHA-256 where readable. Record candidate changed files and prove no service/repository/migration/seed/fixture/data scope unless separately authorized.

After tests/UI inspection, recompute the identical inventory and require:

```text
Unexpected DB additions              = 0
DB path/size/timestamp/hash changes  = 0
Shared DB POST/PUT/PATCH/DELETE      = 0
```

Persistence tests must use mocks or isolated temporary databases owned by the test harness. Read-only UI checks must not click mutation buttons.

## Verdict

- `PASS`: exact identity matches, 40/40 primary cases and all additional gates pass, with no unexpected scope or write.
- `FAIL`: any gate fails, policy decisions are duplicated, or an unexpected mutation/scope is observed.
- `NOT_EXECUTED`: identity is missing/mismatched, required environment unavailable, or no-write boundary cannot be proven.

This oracle authorizes verification only; it does not pre-approve a future candidate.
