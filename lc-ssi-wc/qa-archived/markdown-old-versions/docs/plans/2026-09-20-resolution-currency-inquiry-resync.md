# Resolution Currency Inquiry + Manual Resync Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. That skill is unavailable here; execute directly with Red → Green → Refactor and independent review. The Product Owner authorized continuing on `performe_tune`; do not create another branch, push, or merge.

**Goal:** Make Resolution Page Definition currency options read a persistent Demo support table. SSI approval discovers new support without removing existing support; explicit Settings Resync is the only complete reconciliation authority.

**Architecture:** `resolution_currency_coverage` stores one row per business-domain/currency; `resolution_currency_sync_control` stores initialization state and the last successful manual Resync time. Bootstrap, normal SSI approval discovery and manual Resync use the same typed SSI/Applicability derivation. Approval INSERTs only new pairs; manual Resync reconciles the complete set to ACTIVE/INACTIVE. Reload and empty-table startup bootstrap use the same derivation in a single SQLite transaction. Normal Page Definition requests only read coverage, controlled Entity data and explicit defaults; Lookup/Resolve/Execute retain operational SSI eligibility.

**Tech Stack:** NestJS, TypeScript, Jest, SQLite, Angular, Nx. Exact base `2877075ca9f516b9baa4271c94dad6bb0b9156c7`; existing unrelated untracked plan and adjacent workspace files are preserved.

**Design review status:** REVISED DRAFT / DBA + QA RE-REVIEW PENDING. Product Owner approved the Payment ownership split and shared typed coverage discovery, but expressly withheld implementation authorization until the revised Execution Contract receives independent DBA and QA PASS. No production implementation starts before that gate. Reload is an explicit canonical Demo reset and must preserve deterministic seed identity.

---

## Understanding and decisions

- User-facing scope: Settings Resolution Currency Inquiry is Index-only and parameter-driven, with Business Domain, Currency, Status, Source, Last Resync At and an explicit Resync action. Reuse the existing generic index/table class and its governed column metadata rather than building a new Currency-specific Index class. No Add/Edit/Delete, detail/editor, or Maker/Checker UI in this Demo phase.
- Read semantics: Page Definition uses the table only; current SSI coverage is checked at Lookup/Resolve/Execute, not inferred by the dropdown.
- Write semantics: verified Treasury/Trade Finance and Payment predicates are consolidated into one typed rule shared by Bootstrap, approval discovery and Resync. Normal SSI approval only INSERTs never-seen pairs; it does not reactivate INACTIVE rows. SSI Suppress/Delete never directly removes or deactivates coverage. Manual Resync is the sole full reconciliation authority: INSERT newly discovered, KEEP still-derived, reactivate rediscovered INACTIVE, and mark pairs with no current effective SSI/Applicability source INACTIVE. V1 uses logical INACTIVE to preserve inquiry history.
- Safety: development/demo-only Resync, server-authoritative transaction, two consecutive unchanged runs have inserted=0 and status changes=0; Reload remains transactional. Derive the full coverage set successfully before any deactivation, and roll back all changes if any domain derivation fails. No direct production DB modification.
- Startup: after schema initialization, `BEGIN IMMEDIATE` and re-check coverage emptiness plus persisted sync-control state before accepting Resolution Definition traffic. If coverage is empty, run one complete derivation/bootstrap; a nonempty table (including all-INACTIVE rows) is not auto-reconciled. A successful zero-support result is recorded distinctly from a failed/uninitialized result; repeated restarts with empty coverage repeat the PO-requested check, while retaining the prior successful marker for diagnosis. Errors fail closed. The DB write lock/recheck, not merely a process-local lock, prevents duplicate concurrent bootstrap writes.
- Currency options/Definition SHA intentionally change. The Index and full Definition must share the same source. The old fixed-identity Gate is superseded, but functional/fail-closed behavior remains required.
- Non-goals: Settings general performance tuning, SSI/RMA/Nostro maintenance changes, other APIs, persistent cache, Angular routing changes, Push/Merge.
- Performance target: cold P95 ≤500 ms on fresh process with approved isolated fixture, AB/BA baseline/candidate pairing and independently reviewed DBA/QA evidence.

## Revised Execution Contract for DBA / QA review

### 1. Definition read ownership

| Definition field | Authoritative source | Forbidden shortcut |
| --- | --- | --- |
| Currency options | active rows in `resolution_currency_coverage` for the business domain | current SSI/Applicability query on Index or full Definition request |
| Booking Entity options | active, effective controlled `booking_branch_entity` / Entity reference records eligible for the Resolution context | current SSI candidate list or first SSI row |
| Default Booking Entity | explicit controlled configuration, only if it names an available Entity option | first Entity, first SSI, or sort-order-derived choice |
| Default Currency | explicit controlled configuration, only if it names an active coverage option; otherwise no default | first coverage row or SSI candidate-derived choice |
| Actual route executability | existing Lookup / Resolve / Execute SSI + Applicability policy | assuming a displayed option is executable |

Booking Entity presence in a Definition is not a promise of a currently eligible SSI. A selected combination with no eligible SSI must retain the existing structured fail-closed behavior. The existing `PaymentGovernedApplicabilityService.options()` compound read must not be called in the Definition path. Its runtime candidate/eligibility use remains intact. Entity option value is the active `EntityRecord.branchCode` (the existing `HK01`-style Booking Entity identifier), label is governed branchCode/branchName; require `status=ACTIVE` and `validFrom <= governed Definition as-of date <= validTo` (empty validTo means open-ended), reject blank/duplicate branchCode ambiguity, and sort by branchCode with stable ID tie-break. No SSI row controls which Entity appears. A new explicit Page Definition default policy is keyed by governed domain/message profile and may specify `defaultCurrency` and `defaultBookingEntity`; characterize current visible defaults first and configure equivalent Demo values where valid. If a configured value is absent from the active options, omit that default and report configuration invalidity; never choose first option or infer from SSI.

### 2. One typed coverage discovery rule, three callers

Define a typed `ResolutionCurrencyCoverageDiscovery` result of normalized `{ businessDomain, currency }` pairs, as-of date, source row identity and complete-success marker. It owns three domain-specific governed selectors behind one typed contract, invoked identically by Bootstrap, approval and Resync:

- Payment: reuse the existing `findPaymentCandidateBindings` eligibility SQL/predicates for every controlled Payment source message profile and business service at the same as-of date, with no Currency or Booking Entity filter, then DISTINCT the resulting currencies and map the governed `CENTRAL_PAYMENT` consumer to Resolution `PAYMENT`. Its existing `ANY` applicability wildcard is valid only within that same Payment-specific predicate; never map a bare `ANY` row by itself.
- Treasury and Trade Finance: select ACTIVE SSI plus ACTIVE Applicability effective on that date, whose typed consumer is exactly `TREASURY` or `TRADE_FINANCE`; require nonblank ISO currency, compatible route/applicability business function and a declared route message type matching a controlled Resolution definition/profile for that domain. Normalize declared message tokens through a validated typed adapter: existing MT347 fixture route tokens can be arrays, while ordinary route tokens can be comma-separated strings; do not rely on substring matches or reinterpret malformed shapes. Use controlled mapping/catalogue keys, not an `MT` prefix or absent fixture-only `messageType/sequence/settlementLeg` fields. Exclude QA-only/non-operational fixtures by the existing governed visibility policy.
- Unknown/missing/ambiguous consumer, business function, message profile or currency yields an explicit excluded/error diagnostic, never a guessed domain or an empty successful projection. The existing MT347 fixture-specific SQL and QA-visibility rules remain for their existing callers; do not broaden that query in place. Characterize baseline rows, excluded counts/reasons and intentional added pairs before implementation.

`resolution_currency_coverage`: unique key `(standards_release,business_domain,currency_code)`; constrained domain/status (`ACTIVE`/`INACTIVE`) and uppercase ISO currency; source/provenance and change timestamps; Index lookup by `(standards_release,business_domain,status,currency_code)`. `resolution_currency_sync_control`: one row per standards release holding initialized state, fixed discovery as-of identity and `last_manual_resync_at`. A successful no-change manual Resync advances only the control timestamp while returning `inserted=0` and `statusChanged=0`; it does not rewrite coverage rows. Approval/bootstrap/failure do not advance `last_manual_resync_at`.

- `Reload Test Data`: canonical reset, then full discovery/bootstrap with a pinned controlled as-of date on the same SQLite connection and transaction.
- Normal single SSI ACTIVE approval: after SSI and Applicability are saved, before the existing approval COMMIT, discover using the same rule scoped to the approved SSI and INSERT never-seen pairs only. Existing ACTIVE/INACTIVE rows are untouched; only Manual Resync can reactivate. Approval failure rolls back both SSI and coverage changes.
- Manual Resync: under one `BEGIN IMMEDIATE`, obtain the complete successful set for all three domains before reconciliation; INSERT new, KEEP present, reactivate rediscovered INACTIVE, and mark absent pairs INACTIVE. Never map a source-query error to an empty set. Suppress/Delete paths never directly write coverage.

After a *committed* approval discovery, Resync, or Reload that changes coverage, invalidate both cached Index and full Definitions. Rollback/failure must not invalidate or change their identity. Coverage source/Definition version and SHA may legitimately change; test Index/Definition consistency against the same committed snapshot.

### 3. Bootstrap, identity, and observation

- On process startup after schema readiness, use `BEGIN IMMEDIATE` and re-check coverage emptiness and the persisted sync-control state inside that transaction. Empty `resolution_currency_coverage` triggers one complete full discovery/bootstrap before the service accepts Definition requests. Nonempty data, including all-INACTIVE rows, triggers no automatic reconciliation. Concurrent processes serialize on the DB write lock/re-check.
- A successful zero-support bootstrap updates initialized state but remains a clear no-supported-currency/fail-closed Definition result; failure rolls back marker and coverage together. The PO-requested empty-table startup check may run again on a later restart when the source still has zero support; it is never run per request.
- The canonical Demo seed includes the new coverage/control tables, a fixed approved as-of date and deterministic timestamps, and the approved post-bootstrap rows. Within Reload's existing transaction and connection, shared discovery/bootstrap must be a no-op or reproduce precisely the preapproved post-bootstrap logical SHA before COMMIT. The expected SHA comes from an independently approved oracle, never the current DB's self-computed value. Reload resets prior coverage by design; ordinary Resync does not.
- `Last Resync At` in Inquiry means the control row's last successful *manual full Resync* time, not single-record approval or bootstrap. A successful no-change manual Resync advances that control timestamp while coverage rows remain unchanged; failure does not.
- Report process start → ready, DB initialization/bootstrap time, ready → first Index response, active-table read query plan, and writer-lock hold time/P95 for startup, Resync and SSI approval separately. The ≤500 ms cold Index Gate must not hide bootstrap cost by moving it outside the measured request; report both metrics and the same fixture/snapshot/configuration.

### 4. Required acceptance matrix

Payment Currency/Entity/default source independence and no-eligible fail-closed; Treasury/Trade ordinary approval discovery and controlled MT347 behaviour; shared derivation parity for Reload/approval/Resync; two-SSI-source suppression cases; INSERT-only approval; Resync INSERT/KEEP/INACTIVE/reactivation/idempotency/rollback; empty/nonempty/all-INACTIVE restart and concurrent bootstrap; exact Reload post-bootstrap snapshot; committed-only Index+Definition cache invalidation; parameter-driven Index-only Settings Inquiry and authorized manual Resync; API/BFF/UI tests; AB/BA cold/warm performance evidence; `npm run verify`; independent DBA, Checker and QA against one exact candidate. No Settings general tuning, RMA/Nostro maintenance changes, Push or Merge.

## Task 1 — shared derivation and reconciliation repository (TDD)

**Files:** `apps/ssi-service/src/app/resolution-currency.*`, `apps/ssi-service/src/app/sqlite-ssi.repository.ts`, focused specs.

1. Add Red tests for sorted Inquiry rows, new-pair insert, unchanged second run, reactivation, and full Resync inactivation only when a domain/currency has no remaining effective source. Include two SSI records supporting the same pair: suppressing one and then Resync must KEEP the pair; suppressing the final source does not directly change coverage, but a subsequent Resync marks it INACTIVE. Inject a derivation failure and prove no partial inactivation. Test empty-table process startup performs one Resync, nonempty/all-INACTIVE table performs zero Resyncs, concurrent initialization cannot duplicate writes, and failed startup never serves an apparently valid empty Definition.
2. Run affected Jest tests and preserve Red output under `tmp/performe-tune/`.
3. Add the smallest table/repository/service. Share one derivation contract (including effective SSI/Applicability predicates) across Bootstrap, approval discovery and Resync; reuse existing verified SQL logic rather than implementing three variants. Use the same SQLite connection for source derivation and writes inside each transaction.
4. Run focused tests, lint and typecheck. Do not modify operational eligibility queries.

## Task 2 — Definition source cut (TDD)

**Files:** `apps/ssi-service/src/app/page-parameters/{mapping-resolution-page-definition.source,payment-resolution-page-definition.source,resolution-page-aggregation.service}*`, `libs/contracts/src/page-parameters.ts`, focused specs.

1. Add Red tests that cold Index/Definition construction invokes zero SSI currency derivation calls, options match active table rows, and Index/Definition identities agree.
2. Replace only Currency option source; resolve Payment's currently coupled Booking Entity/default source without retaining the SSI candidate query in Definition construction. Update misleading `GOVERNED_APPLICABILITY` Currency metadata to a supported-currency source.
3. Explicitly invalidate cached definitions/index after committed approval discovery, Resync or Reload; do not invalidate on rollback. Preserve Lookup/Resolve/Execute paths and fail-closed tests.
4. Run affected tests, lint and typecheck.

## Task 3 — Reload, API and Settings Inquiry (TDD)

**Files:** `apps/ssi-service/src/app/{development-data-reload.service,runtime-settings.controller,app.module}*`, `apps/ssi-bff/src/main*`, `apps/ssi-portal/src/app/{runtime-settings.service,settings-page.component,governance-index-table.component}*`, governed Index metadata source, canonical demo seed and corresponding specs.

1. Add Red tests for Reload bootstrap, empty-table startup bootstrap, Inquiry, Resync counts/idempotency/status changes and development-mode authorization; test UI rendering and explicit Resync state. Add approval discovery tests proving INSERT-only behavior and unchanged suppression/delete path.
2. Update the controlled seed schema/table for Reload, call shared derivation/bootstrap inside its transaction, then wire service → BFF → Settings Index-only UI via the existing generic index/table class and governed columns. Hook INSERT-only discovery into the normal `approveWithApplicability()` transaction after approved SSI and applicability are saved and before COMMIT. Do not hook `approveSuppression()` to currency writes. No Add/Edit/Delete UI or new Currency-specific Index class.
3. Run tests, lint, typecheck and `npm run verify`.

## Task 4 — isolated acceptance and review

1. Build a fresh disposable DB from the approved controlled Demo seed; test restart with empty table (one startup Resync) and restart with populated table (zero derivation), then run Reload, Inquiry, normal SSI approval discovery, suppression of one of two supporting SSI records, full Resync, suppression of the last supporting record, full Resync, Resync twice without intervening changes, Index/Definition, no-eligible-SSI fail-closed and API integration tests.
2. Confirm Index cold path has zero calls to old SSI currency derivation (including Payment's candidate query), unchanged Lookup/Resolve operational checks, no requests to developer API ports 3100/3101 in browser QA.
3. Re-run AB/BA cold/warm performance gate with sample count, P50/P95/min/max, response identities, query plans and no 5xx.
4. Make only an authorized local exact candidate commit if all engineering gates pass; obtain independent DBA, Checker and QA reviews against that exact commit and DB logical snapshot. Do not Push or Merge.
