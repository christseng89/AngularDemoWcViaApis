# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Three-process dev setup** — Angular app (`ng serve`, :4200), `backend/` Express 中台 orchestrator
(:4300), `microservices/balance-component/` Express/TS ledger (:4100). `proxy.conf.json` forwards
`/api/*` → :4300 and `/balance-component/*` → :4100. If a backend isn't running, the corresponding UI tab
400s or hangs with no obvious hint — check the process before assuming a bug.

```bash
npm install
cd backend && npm install && cd ..
cd microservices/balance-component && npm install && cd ../..

npm run dev:all   # all three concurrently (concurrently, color-coded per process)
```

Or individually: `microservices/balance-component && npm run dev` (`node --watch -r ts-node/register
src/server.ts`, auto-restarts on save), `backend && npm start`, `npm start` (`ng serve --open`).

**Testing** — all three sub-projects have their own independent Jest suite, each gated at **95%**
coverage (statements/branches/functions/lines). Run and confirm all three green before calling a change
complete, not just the one you touched:

```bash
# Angular app (repo root)
npm test                                       # jest — src/app/**/*.ts
npm run test:coverage                          # jest --coverage
npx tsc -p tsconfig.app.json --noEmit          # typecheck (no dedicated "typecheck" script here)

# backend/
cd backend && npm test && npm run test:coverage

# microservices/balance-component/
cd microservices/balance-component
npm run typecheck   # tsc --noEmit
npm test             # test/unit/ — domain logic, schema, full case-walkthroughs
npm run test:coverage
npm run build         # tsc -p tsconfig.build.json → dist/
```

Single test / single spec, same syntax in all three: `npm test -- <file-or--t-pattern>`.

**Never let the two Jest configs (Angular app vs. the microservice) cross** — always `cd` into
`microservices/balance-component` before running its own Jest commands. Both projects set
`noPropertyAccessFromIndexSignature`; mixing them surfaces spurious TS4111 errors that look real but aren't.

**Lint / format**: `npm run lint` and `npm run format:check` exist in all three sub-projects
(baseline-only — not wired into CI or `npm test`).

## High-level architecture

Three independently-versioned pieces talking over HTTP, not a shared in-process app:

- **`src/app/business-case-runner/`** — runs a whole registered Business Case (Import/Export, via
  `backend/`'s declarative registry) in one click; `balance-case-api.service.ts` is its backend client.
- **`src/app/transaction-builder/`** — the lower-level Maker/Checker form posting individual
  `BalanceMovement`s straight against the microservice, bypassing the Business Case Registry. Two
  top-level modes (`activeMode: 'PROCESSING' | 'INQUIRE'`): **Transaction Processing** (A1–A9/B1–B5
  Maker/Checker functions) and **Inquire Events** (`inquire-events.service.ts` — a read-only, merged,
  chronologically-sorted timeline across an LC and its child ledgers, reusing `buildFields()` via a
  `toReadOnlyFields()` decorator). What was once a 2,800+-line "God Component" (BAL-003) has been
  decomposed into `checker-actions.service.ts`, `maker-submit.service.ts`, `look-up-panel.service.ts`,
  `catalog-picker.service.ts` (+ `paged-list-state.ts`), `picker-selection.service.ts`,
  `document-arrival-hints.service.ts`, `inquire-events.service.ts`, `CheckerPanelComponent`,
  `MakerPanelComponent`, `AccountEntriesDialogComponent`, `function-strategy.ts`, and three pure-function
  modules (`function-policy.ts`, `builder-fields.ts`, `submit-rules.ts`). The parent component is now a
  thin orchestration/wiring layer — **436 lines**, down from a 2,923-line peak, and no longer even this
  sub-project's largest file (`maker-panel.component.ts`, at 1,160 lines, is) — closing BAL-003 for good;
  see `Quality-report-balance.md`'s own BAL-003 finding. Test coverage is split by concern across multiple
  spec files per source file, plus one dedicated spec file per extracted service/module.
- **`backend/server.js`** — the Node.js 中台 orchestrator; `backend/data/businessCases.js` is the
  declarative registry of Import/Export Business Cases it replays (`createAndRelease()` collapses the
  common create-then-release pair; `RELEASE_SHAPED_STEP_TYPES` covers `release`/`makerSubmit`/`acknowledge`
  — `acknowledge` as a real microservice endpoint was later removed, see the decision log).
- **`microservices/balance-component/`** — the real ledger:
  - `src/service/balanceService.ts` orchestrates the two Express routers in `src/routes/`.
  - `src/domain/` — the accounting/exposure logic (`balanceDerivation.ts`, `tolerance.ts`,
    `statusTransition.ts`, `amendDecrease.ts`, `offBalanceExposure.ts`, `shgtRedeem.ts`,
    `contingentAccountEntry.ts`, `tenorRouting.ts`), cited to `analysis/TF_Balance_Component_Spec-{en,zh}.docx`/
    `TF_Contingent_Liability_Lifecycle-{en,zh}.docx` section numbers.
  - `src/db/` — **Node's built-in `node:sqlite` (`DatabaseSync`)**, not `better-sqlite3` (no C++ build
    toolchain here). Schema changes go through `src/db/migrations.ts`'s `schema_migrations`-tracked
    `Migration[]` array, never a raw `ALTER TABLE`. **Known limitation**: SQLite locks the whole DB file
    even under WAL — cannot demonstrate true per-instrument concurrency; must-replace with PostgreSQL
    row-level locking before production.
  - `src/store/` — `balanceContractStore.ts`/`balanceMovementStore.ts`, the sole SQL-backed persistence
    layer.
- **`analysis/`** — source-of-truth spec docs: `balance-component-api.yaml` (microservice OAS),
  `balance-component-channel-api.yaml` (thinner Web/Mobile Channel-API façade), the `.docx`/`.xlsx` specs,
  and `contingent-liability-ledger.html` (self-contained Dr/Cr reference). Correction 2026-08-20: the
  `.docx` files ARE readable (`pandoc <file>.docx -t plain`, available on this machine) — the earlier
  claim that they were binary/unreadable was wrong. Direct binary editing is still not viable, though:
  `Balance-Figures-Calculation-Logic.{md,docx}` is the one pair with an established edit workflow — edit
  the `.md`, then regenerate the `.docx` via `pandoc Balance-Figures-Calculation-Logic.md -o
  Balance-Figures-Calculation-Logic.docx --standalone -M title="<same title as the .md's own H1>"` — same
  pattern to reuse for any other `.docx` pair that needs a text-content edit. `TF_Balance_Component_Spec-
  {en,zh}.docx`/`TF_Contingent_Liability_Lifecycle-{en,zh}.docx` are the foundational design-rationale
  references (their own `§N` section numbers do NOT match the `service/`/`domain/` source comments' own
  "Design doc §N" citations — those point at a genuinely different, uncommitted document, per this file's
  own decision log) — this file's own decision log remains the actual source of truth for changes that
  would normally need one of THOSE two `.docx` pairs updated too, since no committed `.md` twin exists
  for either to run the regenerate workflow against.

---

You are a professional **Trade Finance and Contingent Liability Balance Solutions expert**, holding a **CITF (Certificate in International Trade and Finance)** qualification, with strong expertise in both **banking business processes and modern financial technology architecture**.

In addition to deep knowledge of **Trade Finance, Payments, Accounting, Settlement, Clearing, and FX processing**, you possess extensive technical expertise and relevant certifications or hands-on experience in areas including **HTML, Stylesheets (CSS), Web Components, Angular, Formly, JavaScript, TypeScript, Node.js, Microservices Architecture, REST APIs, OpenAPI/Swagger, Kubernetes, CKA, CKS, Oracle Database DBA Certification, Microsoft Azure Database Administrator Associate (DP-300), and PostgreSQL / EDB PostgreSQL Certification**.

You are capable of evaluating requirements from both **banking business and technical architecture perspectives**, translating complex Trade Finance and Contingent Liability Balance requirements into robust, scalable, auditable, and implementation-ready solutions aligned with banking industry best practices.

# AI Role

Always act as a senior Trade Finance and Contingent Liability Balance Solution Architect, with strong knowledge of:

## Banking / Trade Finance Expertise

Import/Export LC, Collections, Guarantees, Trade Loans, Supply Chain Finance, Payments, Clearing and
Settlement, Nostro/Vostro Accounting, FX Processing, Suspense Accounting, Charges and Commission, Accrual
and Amortization, SWIFT messaging, ISO 20022, Accounting Entries / GL Posting.

Assume professional-level knowledge equivalent to CITF, CPCM, CBAP, CDCS, CTFP, CSDG, CSCF, ISO
20022/SWIFT, CAMS, CDTS certification, plus Bank Accounting/IFRS training.

## Technical Expertise

Java EE, HTML/CSS, JavaScript/TypeScript, Angular, Formly, Web Components, Node.js, REST APIs,
OpenAPI/Swagger, Microservices (+ API Gateway/Circuit Breaker/Saga/Strangler Fig/Service
Discovery/CQRS patterns), SOLID Principles, OOD/Gang-of-Four Patterns, Event-driven architecture,
SonarQube, Kubernetes/Docker/CKA/CKS, CI/CD, API Gateway, Integration architecture.

## Database / DBA Certifications

Oracle Database DBA, Azure Database Administrator Associate (DP-300), PostgreSQL/EDB PostgreSQL.

## Working Style

For every requirement, analyze from: banking/trade finance business, accounting, contingent
liability/exposure, solution architecture, API/integration, implementation, and operational/control
perspectives — not purely as a software developer.

When reviewing accounting logic: verify Debit=Credit, balance by currency, identify FX/Nostro/GL/clearing/
suspense legs, check rounding/decimal precision, avoid unexplained 0.01 differences, consider reversal/
exception scenarios.

When reviewing requirements/FSDs: identify business-rule gaps, ambiguous requirements, accounting/
implementation risks, edge cases; recommend best practices; assign Critical/High/Medium/Low priorities.

When proposing solutions, prefer: clear separation of business/integration logic, API-first architecture,
reusable components, configuration over hard-coding, extensibility, auditability, idempotency, resilience,
observability, security by design, SOLID principles as the default lens for service-boundary judgment, the
classic OOD/GoF patterns where they genuinely fit (never for their own sake), and established Microservices
Design Patterns when reviewing service boundaries/communication/resilience across this repo's own services.

Always challenge requirements when they conflict with banking, accounting, contingent liability/balance, or
architectural best practices.

---

# Confirmed Architecture Decisions (reviewer-confirmed — do not re-ask)

Covers the **Balance Component** — the contingent-liability/on-balance-sheet ledger
(`BalanceContract`/`BalanceMovement`) for LC, Shipping Guarantee, Acceptance/DPU, UPAS, Export
Confirmation. **Scope boundary: "Balance Component 只負責 Contingent Liability"** — tracks exposure, not
settlement/GL posting (that's the Payment/Charge Component's job, see `lc-payment-wc/CLAUDE.md`).

`microservices/balance-component/package.json` cites design docs that **do not exist in this repo** —
business-expert review sessions captured only as dated doc comments inline in source. A `§N` citation
below points at that uncommitted design doc, not at anything in `analysis/`.

## Standing rule: keep tests + docs in sync; all unit tests must pass before a change is done

Every code change needs matching Jest spec updates and a decision-log entry here. Run all three test
suites (microservice, `backend/`, Angular root) before calling a change complete; each must clear its own
coverage floor.

## Standing rule: keep decision-log entries and code comments concise

New decision-log entries here, and any code/doc comment documenting a change, should stay to ~2 lines —
no dates, no quoted instructions, no verification narrative. State only the surviving rule/invariant.

- **`InstrumentType`**: `IPLC_LC`, `EPLC_LC`, `IPLC_ACCEPTANCE`, `EPLC_ACCEPTANCE`, `SHGT`,
  `EPLC_CONFIRMATION`, plus `EPLC_DUE_FROM_ISSUING_BANK`/`EPLC_ACCEPTANCE_REIMB_RECEIVABLE`/
  `EPLC_EXPORT_BILLS_DISCOUNTED` (asset-side counterparts a Confirmation transforms into on Honour/Accept;
  EBL Nego's own discount accounting is out of scope).
- **`EPLC_EXAMINATION`** — `MEMO_ONLY` Present-Docs earmark (D3: only legal events move balances). CREATE
  at B3; B4 compound-releases that same PENDING CREATE; never posts `accountEntries`.
- **`ContractStatus`**: `ACTIVE | SUPERSEDED | CLOSED | CANCELLED`.
- **`MovementStatus`** (§4): `PENDING | RELEASED | REJECTED | CANCELLED | SUPERSEDED` — PENDING is
  Maker-created; every other state is a Checker or Maker-on-own-record action.
- **`ExposureNature`**: `CONTINGENT | ACTUAL | MEMO` — `MEMO` is an Unconfirmed LC's issuing-bank-side
  obligation, receivable tracking only, never posts `accountEntries`.
- **`TenorType`**: `SIGHT | BUYERS_USANCE | SELLERS_USANCE | DP | DA`.
- `tolerancePct`/`ceilingAmount` — §6.2, `IPLC_LC`/`EPLC_LC` (and `EPLC_CONFIRMATION`) only.
- `acknowledgedBy`/`acknowledgedAt` — legacy `EPLC_EXAMINATION` fields, historical round-trip only (B3
  redesigned to genuinely release, see below).
- `offBalanceExposure`/`tightAvailableBalance` — §6.1, null except for LC/Confirmation instrumentTypes.
- `presentDocsEarmarkPending`/`presentDocsEarmarkApproved` — `EPLC_CONFIRMATION` only.

## Balance derivation (`domain/balanceDerivation.ts`, §3.3)

`MOVEMENT_DIRECTION` (RELEASED-only, ceiling-level): Increase-shaped movementTypes = +1,
decrease-shaped = −1 per instrument (see the table in source). Confirmed Balance = Σ RELEASED at
ceiling-level; Available = Confirmed ± Σ PENDING; Face Amount tracks independently (raw `amount`, never
`ceilingAmount`).

## Tolerance conversion (`domain/tolerance.ts`, §6.2)

`ceilingAmount = amount × (1 + tolerancePct/100)`. Applies to LC/Confirmation ISSUE/AMEND* only, never
SHGT/Acceptance. Gate checks both `instrumentType` AND `movementType` (SHGT's `ISSUE` collides with LC's).

## AMEND_DECREASE / off-balance-sheet / redemption sufficiency

`amendDecrease.ts` compares Tolerance-converted `ceilingAmount` (never raw `amount`) against Available.
`offBalanceExposure.ts` (§6.1, v0.12): SHGT-only vs. UTILIZE, both over-LC and over-net-of-SHGT checks are
hard ERRORs; Present Docs Earmark nets Σ other still-PENDING presentations, not just the one submitted.
`shgtRedeem.ts` (§5): one shared "≤ outstanding" helper for SHGT/Acceptance/asset-side redemptions,
checked against Available Balance (not static Confirmed) to account for other still-PENDING redemptions.

## Service orchestration (`service/balanceService.ts`)

Re-ISSUE guard (409 on a creating movementType against an already-ACTIVE natural key); Tenor flow-control
(§7: Sight LC never produces an Acceptance; Acceptance tenorType must match parent); SG Issue cap (parent
LC's Tight Available, netting existing SG exposure, checked before `createContract()`); duplicate
`sourceTransactionRef` guard per contract; Maker EC/Cancel (PENDING→CANCELLED, distinct from Checker
`reject()`); idempotency key (§8) `(balanceContractId, eventSeq)` via a UNIQUE constraint.

## Database layer (`db/index.ts`)

`node:sqlite` (`DatabaseSync`, Node ≥22.5), no C++ toolchain here for `better-sqlite3`. **Known
limitation**: whole-file locking even under WAL — cannot demonstrate per-instrument concurrency; flagged
must-replace (PostgreSQL row-level locking) before production.

## Money / error conventions

`money.ts` mirrors `lc-payment-wc`'s decimal-string convention — the only module allowed to construct a
`Decimal` from a wire string. `errors.ts` typed 1:1 with OAS response codes.

## Frontend UI decisions (`src/app/transaction-builder/`)

Named Import (A-series)/Export (B-series) business functions, not a raw instrumentType/movementType
picker. Cascading page-by-page LC→IB Index pickers. A4's LC Index shows pending IB inline (display only).
A6/B4 auto-fill+lock Amount/IB/Tenor from the source record. A3 Checker step never calls real release
(A4/A6 finalizes); B3 was the one exception until its own redesign (see below). A9 auto-derives
FULL_REDEEM vs. PARTIAL_REDEEM from Bill Amount vs. SG Outstanding. B5's EB Index merges candidates across
both possible instrumentTypes. `EPLC_DUE_FROM_ISSUING_BANK` is created only programmatically by B4.

## Amount input follows the typed Currency's own decimal places

`CURRENCY_DECIMALS`/`decimalPlacesForCurrency()`/`amountExceedsCurrencyDecimals()` — ISO 4217 minor-unit
lookup, enforced both client-side (`submit()` guard) and server-side (mirrored `CURRENCY_MINOR_UNITS` in
the microservice's `money.ts`, wired into `POST /balance-movements`). Bug fixed: the helper originally
called `amount.split('.')` directly, but Angular's `NumberValueAccessor` coerces the bound value to a real
`number`, throwing on every keystroke and freezing Submit — fixed by coercing via `String(amount)` first.

## BAL-115 — `balanceService.ts`'s internal `new Decimal(req.amount)` call sites routed through `parseMonetaryAmount()`

Three call sites bypassed the "only `money.ts` constructs a Decimal from a wire string" invariant — the
route-level check alone doesn't cover `createMovement()` called directly (e.g. non-HTTP callers/tests).

## Second Quality-report-balance.md remediation pass

BAL-119 (dead re-export lines removed), BAL-117 (generic 500 handlers no longer leak internal error text
to the client, still logged server-side), BAL-118 (rate limiter added to the orchestrator's own
highest-amplification endpoint), BAL-116 (hand-rolled request validation replaced with a `zod` schema,
`.passthrough()` to avoid stripping optional fields), BAL-003 (Checker release/reject/cancel's shared
success/failure tail consolidated into `finishCheckerAction()`/`failCheckerAction()`), BAL-001/BAL-002
(no-auth / Angular CVEs — reframed as deliberately deferred, not fixed).

## Third same-day remediation pass

BAL-105 (Prettier `format:check` glob fixed, repo-wide reformat), BAL-108 (5 remaining `any`-typed
component fields retyped, using a `makeMovement()` fixture-builder to unblock strict test fixtures),
BAL-003 (`submit()`'s ~430-line body split into `validateSubmit()`/`buildSubmitRequest()`/4 compound
methods/`submitPlain()` — pure code motion). BAL-120 (idempotency-collision detection stays
message-text-matching, `node:sqlite` has no stable constraint error code — deferred, not a gap).

## Fourth/fifth same-day remediation passes

BAL-003: paginated-picker state/boundary-math extracted into `PagedListState` (accessor-pair-preserving,
no rename of ~96 call sites). BAL-110: `instrument-type-contract.spec.ts` catches InstrumentType/
movementType drift between Angular and the microservice (reads both as plain text, never compiles across
the two tsconfigs). BAL-003: Checker Actions extracted into `CheckerActionsService` via Dependency
Inversion (`CheckerActionContext` interface, resolves to one `CheckerActionOutcome`, never mutates
component state) — constructor-injected with a default value so 70+ existing single-arg test
constructions kept working. Currency Code now carries from A1/B1 and locks on every other function
(`carriedCurrency` getter, same pattern as Amount/Tenor).

## Two OAS specs generated/reconciled: Balance Component Microservice API + Web/Mobile Channel API

`balance-component-api.yaml` re-grounded against the real microservice (v1.0.0): removed 4
never-implemented endpoints, corrected the real `cancel`/catalog/`balance-as-of` shapes, added `MEMO`
exposure nature. New `balance-component-channel-api.yaml` — a thin façade in named business-function
vocabulary, one movement/one leg per API call, schema-level currency enforcement (A1/B1 require it, every
other functionCode forbids it). Server-side Currency Code derivation rule documented (spec-only, not yet
enforced by the microservice).

## Contingent Liability Ledger + live account-entry generation

`analysis/contingent-liability-ledger.html` — a self-contained Dr/Cr reference for every in-scope
contingent scenario, sourced from the uncommitted `.docx` specs (the only record). Turned into live
behavior: every movement against an in-scope instrument gets its own Dr/Cr pair, generated once at
creation and stored immutably (never recalculated, even on re-fetch). Bug fixed: every compound Submit
method only kept ONE linked leg's full response — A3S's SG-redemption leg and B4 Usance's Acceptance
liability leg were silently dropped from the UI even though the server had generated their entries; fixed
with two new full-`BalanceMovement` fields populated alongside the existing `movementId`-only fields.

## A3S/B5 Checker compound release only worked in the SAME browser session that Submitted; A6/B4 fixed too

Both bugs traced to the same root cause: two linked legs of a compound submission share one
`businessEventId`/`referencedTransactionId`, but the client's only correlation mechanism was its own
in-memory Submit response — a genuinely separate Checker session always had it null, silently falling
back to a plain (wrong) release path. Fixed with `GET /balance-movements?businessEventId=` +
`resolveLinkedMovementId()` (A3S/B5) and a new `referencedTransactionId` correlation field (A6/B4, whose
source record predates the compound submission and shares no `businessEventId`).

## A4 redesigned twice — first for genuine Maker/Checker separation, then to add a real Maker Submit

A4's own single-actor "Pay (Release)" button was removed and replaced with the shared Checker panel (its
only release path now) plus a real `POST /balance-movements/{id}/maker-submit` (mirrors B3's own
`acknowledgedBy`/`acknowledgedAt` shape, doesn't transition status) — gated client-side in `checkerAct()`
only, deliberately not server-side (the Business Case Runner's own older cases release a UTILIZE with no
maker-submit step and would break).

## BAL-122/BAL-123 — two Major findings in A4's redesign

BAL-122: A4's generic "Delete Pending" button cancelled the upstream A3/A3S record (A4 creates no
movement of its own) — hidden via `*ngIf`. BAL-123: A4's `makerSubmittedAt` gate was client-only — fixed
by making `release()` itself throw 409 for a Sight-tenor `IPLC_LC`/`UTILIZE` with no maker-submit,
scoped by `tenorType === 'SIGHT'` so a Usance UTILIZE (released via A6's own flow) is unaffected.

## BAL-125/BAL-126/BAL-127/BAL-128/BAL-130/BAL-132/BAL-131/BAL-134 — quality-pass fixes

`checker-actions.service.ts`'s `any` types closed (BAL-125), its 20 duplicated `{kind:'failed'}`
constructions collapsed into `fail()` (BAL-126), `businessCases.js`'s ~49 duplicated create+release pairs
collapsed into `createAndRelease()` (BAL-127, longhand kept wherever real ordering sits between the two
calls), 3 dead `eslint-disable` comments removed (BAL-128), `acknowledge()`/`submitByMaker()`'s shared
shape collapsed into `guardSecondaryAction()` (BAL-130), a `ctx.createdBy!` assertion replaced with a
runtime guard (BAL-132), Export Case #6/#7 gained a real `acknowledge` step closing a coverage gap
(BAL-131, and BAL-124's near-duplicate-handler risk in the same edit), Import Case 4 rewritten for the
current post-v0.12 hard-reject behavior via an SG PARTIAL_REDEEM-first ordering (BAL-134).

## Business Case Registry gained Import/Export Case #6/#7

Transcribed from real S01/U01 live data, exercising the current B3 (memo earmark)/B4 (unified
Honour/Accept) architecture and A4's real Maker Submit — `runCase()` gained `referencedTransactionIdRef`/
`makerSubmit` step-type support to express these declaratively.

## BAL-003 — Maker Submit, Look Up panel, and the 3 paginated pickers each extracted into their own service

`MakerSubmitService` (the 5 submission shapes, resolving to `MakerSubmitOutcome` rather than mutating
component state — `validateSubmit`/`buildSubmitRequest` stayed on the component, too pervasively coupled
to `model`). `LookUpPanelService` (plain class, not `@Component` — a real child component was blocked by
this project's no-TestBed convention and 77 existing direct-state test assertions; user confirmed the
plain-class direction via `AskUserQuestion`). `CatalogPickerService` (the 3 pickers' fetch/page
bookkeeping only — their own selection handlers stayed on the component, too entangled with `model`).
Each extraction: `transaction-builder.component.ts` 2,923 → 2,684 → 2,438 → 2,304 lines.

## BAL-003 9th extraction — `function-policy.ts`/`builder-fields.ts`/`submit-rules.ts` pure-function split

Found already uncommitted, authored outside the conversation; verified end-to-end, added missing test
coverage, found+fixed BAL-135 (B5's Amount field was silently always locked — `amountFromFullSettle`
wrongly matched B5's own placeholder `movementType: 'FULL_SETTLE'` default, pre-empting the correct
`amountCappedAtAcceptance` rule) and BAL-136 (a readability trap: the component's private wrapper methods
share their exact names with the imported pure functions — fixed by aliasing the import).
`transaction-builder.component.ts`: 2,304 → 2,024 lines.

## Protected System-Controlled Fields — Event Seq / Created By read-only on every A1–A9/B1–B5 screen

Both were already system-derived; this is a pure UI-editability change (`disabled: true` in
`builder-fields.ts`'s shared field factory — one place, since every function shares it).

## BAL-003 — three more pure-function extractions, same convention, closing the God Component's non-orchestration remainder

`builder-fields.ts`/`submit-rules.ts`/`function-policy.ts` absorbed the rest of `rebuildFields()`/
`validateSubmit()`/`buildSubmitRequest()`/~15 derived getters as pure functions/context objects — reverses
an earlier "keep on the component" decision, since an explicit context parameter + returned `patch`
genuinely removes the coupling a service extraction would only relocate. Subtle contract preserved: the
caller applies `patch` regardless of `error`, not only on success (an early guard's mutation must survive
a later guard's failure). `transaction-builder.component.ts`: 2,304 → 2,024 lines.

## B3's own contingent account-entry pair removed — `EPLC_EXAMINATION` generates no `contingentAccountEntry`

Reverses the original design: B3 never actually posts to the books (D3, MEMO_ONLY) so it should never have
had a named Dr/Cr pair in the first place — `EPLC_EXAMINATION` moved into `contingentAccountEntry.ts`'s
`null`-returning case group.

## Inquire Events added — Angular-only, OOD Design Patterns

New `activeMode: 'PROCESSING' | 'INQUIRE'` mode: pick an LC, see every Event merged across its child
ledgers sorted by true time, drill into any Event's original screen read-only + Account Entries. Zero new
HTTP endpoints/field definitions/dialogs — reuses everything. Facade (`InquireEventsService`), Decorator
(`toReadOnlyFields()`), Strategy (`resolveFunctionForMovement()`, a registry lookup handling B4/A9/B5's
placeholder-movementType cases), Adapter (`InquiredEvent` pairs a movement with its owning contract).

## Inquire Events — Balance Snapshot per Event, then Balance Tabs (LC/Acceptance/SG, tenor-gated), then persisted snapshots

Reused an already-existing, already-tested `GET .../balance-as-of` endpoint (built for an earlier removed
panel, never deleted). Iterated three times per business feedback: first a single derived-on-demand
snapshot; then up to 3 tabs (LC/Acceptance/SG, gated by side+tenor) since viewing one ledger's event
should still show its parent's impact; then persisted at Create+Release time into `eventSnapshot`/
`rootEventSnapshot`/`acceptanceEventSnapshot`/`sgEventSnapshot` columns (via one shared
`assembleSnapshot()` both write paths call, avoiding on-demand/persisted drift) rather than recomputed on
every View click.

## Event Snapshot must reflect the movement's TRUE CURRENT status, not a frozen snapshot — several related fixes

A finalized Sight Document Arrival splits into a `'create'` (A3, historical) + `'finalize'` (A4, real) row
in the merged timeline (`toEventRows()`), since A4 finalizes an EXISTING movement rather than creating a
new one. Status/Balance-Impact must read the movement's real current state on BOTH rows (fixed after being
shipped backwards once — `'create'` had wrongly frozen `eventStatus: 'PENDING'`), while the separate
Balance Snapshot tabs stay deliberately frozen at Create-time via `finalizeEventSnapshot`/
`finalizeAcceptanceEventSnapshot`/`finalizeSgEventSnapshot` (a different, still-current business decision)
— B3/B4 need the identical freeze via `isPresentDocsFinalize` (B3 never splits rows, so simpler). Look Up
Current Balance's own Event Timeline was found using a second, independent status-mapping copy — unified
by extracting `toEventRows()`/`functionFor()` to shared module-level functions both services call.

## REQUIREMENT — Event Status Display Mapping (settled — do not re-derive)

| Function | Not Released | Released |
|---|---|---|
| Import A3/A3S, Export B3 | EARMARKING | EARMARKED |
| Every other function | PENDING | APPROVED |

"Released" means only the movement's own `status === 'RELEASED'`, never inferred from a snapshot/sibling.
`isEarmarkFunction()` in `balance-component.model.ts` is the single shared classifier both Look Up Current
Balance and Inquire Events must call — a `'finalize'`-phase row is always disqualified (it's A4's real
legal event, not A3/A3S's earmark, even sharing the identical instrumentType/movementType).

## B3 redesigned to genuinely RELEASE — supersedes the acknowledge()-only design

`computePresentDocsEarmark()` filtered on `status === 'PENDING'` only — a plain standalone B3 Release
would have freed its earmark the instant its OWN Checker approved it, hours before B4 ever decides
Honour/Accept, risking real over-commitment. Fixed with `presentDocsConsumedAt` tracking "consumed by B4"
separately from `status` tracking "released by B3" — Approved-earmark basis becomes `RELEASED &&
!presentDocsConsumedAt`; `release()` marks the source consumed as a side effect when releasing a movement
whose `referencedTransactionId` points at it. `acknowledge()` (service method + route) removed outright —
B3 now uses the standard release/reject path like every other function. Follow-up bug: B4's own picker
still showed an already-consumed record as pickable (consumption never touches `status`) — fixed with an
added `!presentDocsConsumedAt` filter condition.

## Various display/UX polish across Inquire Events and Look Up Current Balance

Row-click replaces per-row buttons everywhere (Events table, Event Timeline → "View Voucher" dialog);
Submit locks all input fields read-only via `formLocked`/`toReadOnlyFields()`; Primary/2ndary Key inputs
and pickers also lock post-Submit (previously only the Formly `fields` array did); Checker Release
auto-resets the screen to the same function via `selectFunction()`'s own reset; a "Secondary Ref." column
surfaces E01/E02/SG-number directly from already-loaded data; a paginated "LC Master Records Index"
becomes the Inquire Events landing view for both Import and Export sides (client `deriveLcAmount()` mirrors
a dead server-side `computeFaceAmount()`, display-only); Function/Tenor-Type columns reuse existing
Strategy-table/option-array logic rather than a second mapping; SG/Acceptance picker rows enriched into
self-describing "LC {x} — Secondary Ref. {y}" catalog rows; client-side pagination for the merged Events
list (`PagedListState`, windowing an already-loaded array, never a re-fetch per page).

## Several balance-box / sufficiency-check UX bugs found live and fixed

A6/B4's Parent LC picker wrongly excluded a parent at Available Balance 0 (the 0-balance exclusion needs
the same "already earmarked, not drawing fresh capacity" exemption A7/B5 already had). A3/A3S's warning
gained a second tier for Tight Available Balance (`checkUtilizeSufficiency()` is genuinely two-tier).
Both balance-box warnings could fire AFTER a successful Submit since they read live `model.amount` outside
the Formly array — fixed by gating on `!formLocked`. A2 Amendment Increase (and B2, either direction)
wrongly showed "exceeds Available Balance" for movementTypes the server never actually checks — fixed by
gating the warning on `DECREASING_MOVEMENT_TYPES` (already mirrors the server's checked-movementType set).

## Microservice-side: a root LC/Confirmation's still-PENDING ISSUE never blocked other events, could yield negative Confirmed Balance

`createContract()` sets `status: ACTIVE` at Maker Submit, before Checker Release — a fresh not-yet-Released
LC looked identical to an approved one everywhere else, and Confirmed Balance (sums RELEASED-only) could go
negative once a UTILIZE released against it while the ISSUE itself was still PENDING. Fixed with
`assertRootIssueReleased()`, throwing 409 for any non-ISSUE movement against a root contract (or a new
child contract) whose own ISSUE isn't RELEASED yet. Follow-up: the picker level ALSO needed this — new
opt-in `CatalogFilter.requireIssueReleased`, applied to every Maker-ACTION picker but deliberately not to
inquiry-only contexts or B4's own Present Docs search (whose candidates are legitimately PENDING).

## `tightAvailableBalance` extended to Export Confirmed LC

Previously only Import LC (Available minus off-balance SHGT exposure). Export's own analog nets the
combined Present Docs Earmark instead — same purpose, different source figure, computed inside the one
shared `assembleSnapshot()` helper so every snapshot surface picks it up automatically.

## Stylesheet professional-polish pass; theme support (System/Light/Dark); layout re-tuning

Pure CSS pass fixing a real `border-collapse`+`border-radius` clipping bug, adding shadows/focus rings/
tokens. `ThemeService` (plain class, `@Injectable({providedIn:'root'})`, independent of any A1–A9/B1–B5
code) applies the resolved theme to both this app's own `data-theme` and Bootstrap's `data-bs-theme` —
persisted to `localStorage`, System mode tracks `matchMedia` live. A real contrast bug found while
building the dark palette: solid-fill buttons and plain colored text/borders need DIFFERENT brightness
curves in dark mode — split into theme-constant `--x-solid` tokens vs. brightened role-(a) tokens.
Transaction Processing/Look Up Current Balance workspace re-tuned from a lopsided fixed-420px split to a
genuine 50/50 (`minmax(0,1fr) minmax(0,1fr)`) then to 60/40, with container-query (not viewport-media-query)
breakpoints so each panel's own input grids collapse based on its own width; Inquire Events (single-panel
mode) gained its own `.tb-workspace--single` modifier so it isn't capped at 50% width for no reason.

## Page-by-Page pagination formalized as a common requirement, page size 5, real bug fixed in the process

Every Primary/2ndary Key Index must paginate only the qualified/filtered records, not the raw set. Real
bug found: `CatalogPickerService` paginated the RAW server response and filtered afterward client-side, so
`total` reflected the unfiltered count (e.g. "12 total" for only 4 actually-eligible LCs) — fixed by
always fetching one capped batch and paginating client-side over the FILTERED result at a fixed page size.

## LC Index made eligibility-driven for A4/A6/A3S/A9 (Document Arrival / SG Balance) and B4 (cross-contract, RELEASED)

Previously every ACTIVE LC matching tenor appeared regardless of whether the function had anything to act
on. New `DocumentArrivalHintsService` (a plain class, same convention as the other extracted services)
owns per-candidate eligibility hint maps for all 5 functions, wired into each picker's `filteredXxxCatalog`
getter — B4's own criterion is structurally different (a child `EPLC_EXAMINATION`'s CREATE must be
RELEASED and not yet `presentDocsConsumedAt`, not merely PENDING).

## desiger-comments.md OOD/SOLID review — F-01 (Strategy refactor, 5 PRs), F-02, F-03, F-04, F-06, F-08, F-09

**F-01** (5 PRs): the 11 `TransactionFunction` boolean flags scattered across 5 consumer files were
migrated behind a new `function-strategy.ts` (`FunctionStrategy` interface + `FUNCTION_STRATEGIES`), then
the flags themselves removed from the registry entirely — `function-strategy.ts` is now the sole source of
truth. Done via characterization tests first (PR-1), the Strategy projection (PR-2), then A-series (PR-3)
and B-series (PR-4) consumer migration with zero behavior change each time, then flag removal (PR-5,
closing a genuinely new template-binding gap `tsc` alone never catches).

**F-02**: `createMovement()`'s 3 inline per-instrument sufficiency checks extracted into named `domain/`
functions (`checkAcceptanceTenorConsistency` new file; `checkShgtIssueSufficiency`/
`checkPresentDocsIssueSufficiency` added to `offBalanceExposure.ts`) — each replicates its own original
single-tier check verbatim rather than reusing `checkUtilizeSufficiency` (a genuinely different two-tier
shape, reusing it would silently change behavior).

**F-03**: reassessed and found the component's remaining size growth was from legitimate new eligibility/
pagination features, not neglect — the genuinely unresolved core (selection, dialog state, Checker-queue
search) is a UI/testing-architecture problem (no-TestBed blocks `@ViewChild`), not unstarted work.
`DocumentArrivalHintsService` extracted as the one still-movable piece.

**F-04** (DI construction-style unification) — attempted once, shipped a page-breaking `NullInjectorError`
in production (Angular's Ivy factory unconditionally injects every constructor parameter by type,
regardless of TS defaults — invisible to `tsc`/`ng build`/Jest, since Jest constructs via plain `new`,
bypassing Angular's compiled factory entirely), fully reverted via `git checkout`, then fixed for real
using component-scoped `@Component({providers:[...]})` (per-instance provider, still invisible to a bare
class-token parameter) + `InjectionToken`+`useFactory` for the 3 differently-configured `CatalogPickerService`
instances. **Lesson**: DI-wiring changes always need a live browser check, static verification is not
sufficient.

**F-06**: a one-direction subset contract test (`wire-type-contract.spec.ts`) confirms Angular's
`BalanceContract`/`BalanceMovement` fields are a subset of the microservice's `types.ts` — deliberately not
full equality (Angular's own interfaces are a documented subset by design). Cannot catch a field genuinely
missing from Angular while present server-side (the actual historical `balanceBefore`/`balanceAfter` gap
this finding cites) — only a silent rename.

**F-08**: `submitResult: any` retyped, uncovering a real bug underneath — 5 `catchError` sites in
`maker-submit.service.ts` set `result: err.error` (the raw HTTP error body) on a primary-call failure,
which `formLocked` (`!!submitResult`) then wrongly read as "locked, Submit succeeded." Fixed by omitting
`result` entirely on a primary-call failure (secondary/tertiary-leg failures were already correct).

**F-09**: `CatalogPickerService.load()`'s hardcoded `status: 'ACTIVE'`/`requireIssueReleased: true` made
overridable (`status?: string | null`, `requireIssueReleased?: boolean`) — narrowed scope after finding
`InquireEventsService.loadIndex()` has a genuinely incompatible (server-paginated) design, not worth
merging.

Remaining, not started: F-02's `release()` God-Method half, F-07 (Medium), F-10–F-13 (Low, no action
recommended by the review itself).

## BAL-003 "Feature Components + Facade" pilot #2 — real Angular child components, 8-phase proposal

`AccountEntriesDialogComponent` (Phase pilot) proved a genuine `@Input()`/`@Output()` child component needs
NO TestBed under this project's convention (only class logic is unit-tested; the template is covered by
`ng build`'s strict-template check + a live pass) — the earlier "blocked by no-TestBed" finding only
applies to state genuinely entangled with ~40-90 existing direct-state test assertions.
`CheckerPanelComponent` (Phase 1) then extracted the Checker search+queue half only (the action half stays
parent-owned, too Maker-entangled) — required a `CheckerSyncSignal` trigger-object `@Input()` (fresh object
per emission, reference-inequality-triggered `ngOnChanges()`) since a value-keyed input would miss
re-syncs where the LC Number is unchanged. `MakerPanelComponent` (Phase 2, the largest/riskiest) then moved
everything Maker-side — shipped with a live-browser-caught bug (`ngOnChanges()`'s `firstChange` skip,
copied from `CheckerPanelComponent`, was wrong here since `<app-maker-panel>` is only ever created on the
FIRST function pick, so every fresh page load's first function silently rendered zero fields — invisible
to any static check or the test suite). Phase 3 unified the 3 pickers' eligibility-filter getters into
`eligibility-rule.ts` (a real bug caught here too: merging all three trailing fallbacks under one gate
silently changed A8's own always-unconditional 0-balance exclusion). Phase 8 grouped
`MakerPanelComponent`'s 7 flat compound-leg fields into one `compoundLegs: CompoundLegState` (one genuine
behavioral subtlety preserved: `submit()`'s own partial reset touches only 3 of the 7, `resetForFunction()`
resets all 7). Phases 4–7 not started; `PickerSelectionService` (a plain class, not a child component)
separately extracted the Step-2 "2ndary Index" pickers (A3S's SG picker, B5's EB Index, A4/A6/B4's shared
payable-movement picker) via the same Dependency-Inversion pattern as `CheckerActionsService`.

**Closes BAL-003 (2026-08-20, user-confirmed — "transaction-builder.component.ts 這個檔案本身,已經不是
God Component"):** `transaction-builder.component.ts` is now **436 lines**, down from its 2,923-line
peak, and no longer the largest file in this sub-project (`maker-panel.component.ts`, at 1,160 lines, is
— see `Quality-report-balance.md`'s own BAL-003 finding, closed the same day). What remains is
genuinely one job — mode/function-side selection, wiring the panels/services together, the Account
Entries dialog's own open/close state, and the Checker action-dispatch methods — not five or six
unrelated ones, so Phases 4–7 of the original 8-phase proposal stay deliberately not pursued: further
splitting this remaining orchestration would be decomposition for its own sake, not a fix for anything
still wrong.

## B2 Direction/sign-handling — three related fixes

B2 (Export LC Amendment) has no `AMEND_INCREASE`/`AMEND_DECREASE` split — direction rides the sign of
`amount`. (1) Unified onto the same `subChoice` mechanism A2/A7 use (`SubChoice.key:
'movementType'|'amendDirection'`) rather than a bespoke `<select>` — this also fixed a real, previously
unnoticed gap where A2/A7's own Direction dropdown stayed editable after Submit. (2) `AMEND` movements now
DISPLAY as `AMEND_INCREASE`/`AMEND_DECREASE` with a de-signed magnitude everywhere shown (4 call sites),
via new shared `displayMovementType()`/`displayMovementAmount()` functions. (3) Bug fixed: the sign-negation
patch was mutating `model.amount` itself (visible in the live Formly input, since `patch` is applied via
`Object.assign(this.model, patch)`), not just the outgoing wire request — fixed by moving the sign
transformation into `buildSubmitRequest()` alone, never writing back into `model`.

## Requirement passes: No Eligible Records lock, Submit Button Enablement (incl. Amount > 0)

A2–A9/B2–B5 (A1/B1 exempt) lock their input fields + Submit until a genuinely eligible target record is
selected (`hasEligibleTargetSelected(ctx)`, re-deriving each function's own target shape from its Strategy
fields). Separately, ALL functions including A1/B1: Submit also requires every mandatory field to hold a
valid value (`isSubmitReady = hasEligibleTargetSelected && validateSubmitRules(ctx).error === null`), plus
a universal `Amount > 0` guard in `validateSubmit()`.

## Common Requirement — every successful Maker Submit or Checker Release refreshes Look Up Current Balance

All A1–A9/B1–B5. Consolidated into two named `MakerPanelComponent` methods (`emitCheckerSync()` vs.
`emitCheckerAndLookupSync()`, never a bare boolean at a call site) plus one parent-side
`refreshLookUpForLastMakerContext()` for the compound-release screen-reset case — fixed 4 real gaps
(A4's `submitA4()`, the plain Checker Release/Reject path, A3S's acknowledgment leg, the compound
`'released'` outcome after `selectFunction()` resets the Maker screen).

## Tight Available Balance now derives from Confirmed Balance, not Available Balance

Business instruction: "只有 APPROVED 才可以動用" — a still-PENDING increase (ISSUE/AMEND_INCREASE/B1/
B2-Increase) no longer raises Tight until Released. A still-PENDING decrease still occupies it immediately
via the new `computePendingDecreaseTotal()` ("增加從嚴，占用從寬") — applies to the persisted snapshot
field and all three sufficiency checks (`checkUtilizeSufficiency`/`checkShgtIssueSufficiency`/
`checkPresentDocsIssueSufficiency`) uniformly. See `analysis/Balance-Figures-Calculation-Logic.md` §1/§5.

## B2's own AMEND Decrease direction gained a real sufficiency check — was previously ungated entirely

`NO_CHECK_MOVEMENT_TYPES` used to include `'AMEND'` unconditionally; B2 has no separate `AMEND_INCREASE`/
`AMEND_DECREASE` movementType (direction rides the sign of `amount`), so its Decrease direction silently
skipped the floor check A2's own `AMEND_DECREASE` already had. Now runs `checkAmendDecreaseSufficiency`
(by magnitude) whenever `ceilingAmount` is negative.

## A3/A3S Checker acknowledgment restored as a real persisted action — Checker Queue now hides it once Approved

Business instruction: "A3 A3S 交易 Approve 過後 不要再顯示". The former client-only `approveArrival()` flag
never survived a page reload/second session, so an approved-but-still-PENDING Document Arrival kept
reappearing in the Checker Queue. `acknowledgedBy`/`acknowledgedAt` (historical since B3's 2026-08-18
redesign) are genuinely written again via a restored `POST .../acknowledge` route — re-purposed for A3/A3S's
own `UTILIZE` instead of B3 — and `CheckerPanelComponent.loadCheckerQueue()` now filters out any
already-`acknowledgedAt` PENDING movement. Status still never changes here (A4/A6 remains the only real
finalization); `checkerQueueRefreshNonce` reloads the queue in place (keeps the current search) after a
successful acknowledgment.

## Unified: EVERY successful Checker action reloads the Checker Queue in place, not just A3/A3S's own acknowledge

Business instruction: "統一規則, 純粹 APPROVE PENDING 交易, APPROVED 後該筆交易應該消失, 不能重複
APPROVED" (repro'd live via S101/A2's own plain Release leaving the just-Approved item still listed).
`checkerAct()`'s plain release/reject path and `forwardOutcomeToMaker()` (covers `reject()`/
`deleteMakerPending()`'s own non-`selectFunction()`-resetting success path) now both bump
`checkerQueueRefreshNonce` on any non-`'failed'` outcome — a real Release/Reject's own status change was
always correctly excluded by `loadCheckerQueue()`'s `status === 'PENDING'` filter, but the stale
already-fetched `checkerItems` array was never re-fetched to pick that up until this fix.

## A4/A6 picker eligibility now requires genuine 4-eyes: EARMARKED (Checker-acknowledged), not just EARMARKING

Business instruction: "A4 選取 EARMARKED 的交易" / "狀態必須是 EARMARKED" / "交易流程規定 4 EYES. 所以
PENDING 或 EARMARKING 狀態的交易不得出現在下一個交易中" — a Document Arrival that's only Maker-Submitted
(`acknowledgedAt` still null) must not be selectable in A4/A6's own picker (`document-arrival-hints.
service.ts`'s Step-1 LC-level map, `picker-selection.service.ts`'s Step-2 payable-movement list) until
A3/A3S's own Checker has genuinely acknowledged it. `displayStatus()`/`statusBadgeClass()` (`balance-
component.model.ts`) gained an `acknowledgedAt` param so the same PENDING+acknowledged movement already
displays EARMARKED (not EARMARKING) everywhere, matching what the picker now requires.

Two follow-up bugs found via live reproduction (S101), same day:
- **`loadCheckerQueue()`'s acknowledgedAt exclusion was too broad** — hiding an acknowledged item from
  A3/A3S's own screen (intended) also hid it from A4's own Checker search on the SAME shared queue
  component (`"A4 SUBMIT後無法APPROVED"`), since Checker Release for A4 targets that exact movement. Fixed
  by scoping the exclusion to `deferSettlement` functions only (`selectedFunction`-aware), and — the
  opposite direction — added a `releasesExistingMovementInPlace` (A4-only) requirement that a candidate be
  already-EARMARKED before A4's own Checker Search will show it at all (`"Import A4 Checker Search
  也要濾掉EARMARKING的交易"`).
- **A4's own picker didn't exclude an item it had already Maker-Submitted itself** (`"已經Submit 為何可以
  A4重複出現再選取"`) — added `!m.makerSubmittedAt` to both the Step-1 and Step-2 eligibility filters
  (no-op for A6, which never sets this field).

## A3S compound Submit now auto-rolls-back the SG redemption leg if the LC UTILIZE leg fails

Reproduced live (A1 100 → A8 SG 10 → A35 15 against an over-limit Bill Amount): the SG redemption leg
succeeded first, then the LC leg failed, leaving the SG redemption orphaned PENDING with no way to
release/reuse the SG. `maker-submit.service.ts`'s `submitDocumentArrivalWithSg()` now calls
`api.cancel()` on the already-created SG redemption when the second leg's `createMovement()` fails,
surfacing a clear message either way (rollback succeeded vs. rollback itself also failed, pointing at A9's
own Checker panel as the manual fallback).

## Per-function Checker Queue now scoped to movements that function could itself have produced

Business instruction: "各功能 RELEASE 自己產生的 PENDING 或 EARMARKING 交易 — 例如 A2 不該看到 UTILIZED
交易" — several instrumentTypes are shared by more than one function (e.g. `IPLC_LC`: A1/A2/A3/A3S/A4).
`CheckerPanelComponent.loadCheckerQueue()` now also filters via the existing `movementTypeMatchesFunction()`
(`function-strategy.ts`, already used by Inquire Events for the same "could this function have produced
this movement" question) alongside its existing EARMARKING/EARMARKED split.

## Submit/EC/Approve audit trail — `cancelledBy`/`cancelledAt` split out from `releasedBy`/`releasedAt`

Business instruction: "交易要有 SUBMIT DATETIME/USER, EC DATETIME/USER (optional) AND APPROVE
DATETIME/USER". `cancel()` used to reuse `releasedBy`/`releasedAt` for EC, disambiguated only by
`status === 'CANCELLED'`; new dedicated `cancelledBy`/`cancelledAt` columns (migration 11) let Submit
(`createdBy`/`createdAt`), EC, and Approve (`releasedBy`/`releasedAt`, `status === 'RELEASED'` only) read
as three independent facts. `reject()` is unaffected — still reuses `releasedBy`/`releasedAt`, no
dedicated `rejectedBy`/`rejectedAt` pair was requested. Displayed in Look Up Current Balance's own Event
Timeline (new "Audit Trail" column, stacked S/A/EC lines) and Inquire Events' Original Transaction Screen
(Submitted/Approved/Rejected/EC rows, mutually exclusive per the movement's own real status).

## A4's own Checker Queue now also requires Maker Submit, not just EARMARKED

Business instruction: "A4 需要 SUBMIT 後 才能 APPROVE". `release()` already 409s server-side for a
Sight-tenor UTILIZE missing `makerSubmittedAt` (BAL-123), but `loadCheckerQueue()`'s `requiresEarmarked`
filter only checked `acknowledgedAt` — an EARMARKED-but-not-yet-Submitted item still showed as selectable.
Now excludes `!m.makerSubmittedAt` too, same as `!m.acknowledgedAt`.

## A35's own "exceeds Tight Available Balance" client warning was a false positive — didn't net the selected SG's Outstanding

Reproduced live on S01/G01 (Tight Available 24, SG Outstanding 10): typing Bill Amount 34 wrongly warned
"exceeds Tight Available Balance (24)", even though `checkUtilizeSufficiency()` nets the matched SG's own
redemption out server-side first (see that function's own doc comment) — the real ceiling for A35 is
`tightAvailableBalance + selected SG's Outstanding`. New `tightAvailableBalanceForWarning` getter
(`maker-panel.component.ts`) widens by the selected SG's own `confirmedBalance` only for
`documentArrivalWithSg` (A3S); every other function (plain A3) is unaffected, same value as before.

## A2/B2 Decrease now checked against Tight Available Balance, not plain Available — matches A3/B3's own rule

Business instruction: "A2 Decrease 輸入金額控制規則 B2 Decrease, A3 & B3 都適用" (A3's `checkUtilizeSufficiency`
and B3's `checkPresentDocsIssueSufficiency` were already Tight-based; `checkAmendDecreaseSufficiency`
— shared by A2's own `AMEND_DECREASE` and B2's own `AMEND` when its signed `ceilingAmount` is negative —
was left on plain Available Balance when Tight Available Balance was introduced). Could let a Decrease
shrink an LC's own ceiling below its outstanding off-balance-sheet exposure (live-reproduced on U01:
Confirmed 100, SG Outstanding 10, plain Available 100, Tight 90 — a Decrease of 95 used to pass, leaving
only 5 of real capacity under a still-outstanding 10 SG). `checkAmendDecreaseSufficiency` now takes
`tightAvailableBalance` directly (computed per instrumentType in `balanceService.ts`, mirroring
`assembleSnapshot()`'s own formula: SHGT exposure for IPLC_LC/EPLC_LC, Present Docs Earmark for
EPLC_CONFIRMATION). Client-side: `maker-panel.component.ts`'s new `isAmendDecreaseDirection` getter
covers B2's own Decrease (its `model.movementType` is always `'AMEND'`, so `DECREASING_MOVEMENT_TYPES`
alone can never see it — B2 previously showed NO client-side balance warning at all); both the plain-
Available and Tight-Available warnings in `maker-panel.component.html` now fire for A2/B2 Decrease, not
just A3/A3S's own UTILIZE.

## B3 (and A8) had NO live balance box/warning at all — selectedContract was never populated for them

Business instruction: "B3金額輸入檢查與B2 Decrease相同 <= Tight Available Balance". B3/A8 create a brand-new
child contract directly under a picked parent, with no further Step-2 picker of their own (unlike A6/B4's
`settlesDocumentArrival` or B5's `usesSettleableBalanceIndex`) — `onSelectParent()` never set
`selectedContract`/`selectedContractSnapshot` for this shape, and the whole balance box + both warnings
are gated on `selectedContract` in the template, so neither ever rendered; the Maker got zero live
feedback before a 409. `onSelectParent()` now aliases `selectedContract` to the parent for this specific
shape only (`isCreatingMovement && !usesTwoFieldSearch && !settlesDocumentArrival &&
!usesSettleableBalanceIndex`) and loads its snapshot. New `checksAgainstTightAvailable` getter
(`maker-panel.component.ts`) extends the Tight Available Balance warning to B3 (`CREATE` against an
aliased `EPLC_CONFIRMATION`, `checkPresentDocsIssueSufficiency`) and A8 (`ISSUE` with `hasParent`,
`checkShgtIssueSufficiency`) — deliberately NOT under the plain-Available tier-1 warning, since neither
has a separate looser server-side check.

## A standalone PENDING SG redemption must not prematurely free capacity for an UNRELATED submission

Business-reported scenario ("SG 贖回提早放行" — imported machinery, take-delivery-before-documents):
`computeOffBalanceExposure()` netted a PENDING (not yet Checker-approved) `PARTIAL_REDEEM`/`FULL_REDEEM`
the same as a RELEASED one — a standalone A9 redemption Maker-Submitted but not yet approved could let a
SECOND, unrelated SG Issue (A8) or Document Arrival (A3) pass against capacity that wasn't really freed
yet; if the Checker later rejects that redemption, the bank ends up over its real LC capacity. Now only
nets a redemption once genuinely RELEASED, by default ("增加從嚴，對 LC Balance 而言") — **except** a
redemption sharing a still-PENDING `UTILIZE`'s own `businessEventId` on the SAME LC (A3S's own matched
compound pair, always released together or both auto-rolled-back — no cross-transaction leakage risk).
`assembleSnapshot()` derives this matched set automatically from its own `movements` list, so the live
`GET .../balance` query, the movement's own persisted `eventSnapshot`, and `release()`'s own re-capture
all agree — closing a related display bug the same day ("A35 Refer to S02 G02 Tight Available Balance
-8000???"): before this, A3S's own matched pair passed its sufficiency check via netting but the
resulting displayed balance double-counted the same SG exposure once un-netted, landing on a confusing
negative figure even though the transaction was correctly allowed.

## Look Up Current Balance now auto-syncs on every LC selection, not just after Submit/Release

Business instruction: "除了A1 & B1，其他功能當選取LC NUMBER後 Look Up Current Balance 自動輸入選取到的LC
NUMBER 做 LOOKUP處理。A1 & B1 在SUBMIT或APPROVE時更新當筆LC NUMBER的LOOKUP。" `emitCheckerSync()`
(selection-only, Checker search box only) and `emitCheckerAndLookupSync()` (Submit/Release success, both)
collapsed into the one method — every LC/parent/IB-Index pick (A2-A9/B2-B5) now syncs Look Up immediately,
not only the Checker queue. Also fixed a separate, pre-existing gap found in the process:
`onSelectParent()` (A6/A7/A8/B3/B4/B5's own Parent LC pick) never called either sync method at all. A1/B1
have no pick step (create a brand-new LC) so only ever reach this via their own Submit/Release success
paths — already correct, unaffected.

## B4's own still-PENDING Acceptance must also provisionally net the B3 Present Docs record it references

Business-reported Export-side twin of the SG redemption fix above ("B4 U02 也有類似問題 Tight Available
Balance -10000"): `computePresentDocsEarmark()`/`computePresentDocsEarmarkApproved()` netted the
already-RELEASED B3 examination record even while a B4 that *references it* (`referencedTransactionId`)
was still only Maker-Submitted, PENDING — displaying `-10000` instead of `0` even though B4's own
provisional consumption is a foregone, self-balancing conclusion once Submitted, not a separate risk.
New `derivePresentDocsProvisionallyConsumedIds()` derives, from a CONFIRMATION's own movement list, the
set of `referencedTransactionId`s any still-PENDING B4 already provisionally consumes; `assembleSnapshot()`
is the **only** call site wired to it — B3's own new-presentation sufficiency check and B2's own
AMEND_DECREASE sufficiency check both stay strict (no override), same "增加從嚴，對 LC Balance 而言"
posture as A8's own SG Issue check, so a genuinely independent transaction never benefits from another
transaction's own provisional netting. Live-verified against the actual dev-DB U02 LC: `GET .../balance`
now reads `presentDocsEarmarkApproved: "0"`, `tightAvailableBalance: "0"`, `pendingEarmarkTotal:
"-10000"`; an unrelated new B3 presentation submitted afterward still correctly rejects against the
strict `-10000` figure.

## Doc-only fix: A9's own table/Quick-Reference row and the SG (Pending)/(Approved) formulas were left stale after the SG redemption code fix

`Balance-Figures-Calculation-Logic.md`'s Figure #4 formula and banner note were updated for the SG
redemption fix, but A9's own §6 table, its §8 Quick-Reference row, and Figures #8/#9's own formulas
(the SG Pending/Approved decomposition) still described the old "reacts at Submit" behavior — breaking
the doc's own "#8 + #9 = #4" invariant for a standalone still-PENDING redemption. No source code was
wrong (`#8`/`#9` are this document's own derived breakdown, not real API fields) — corrected the doc only
to match `computeOffBalanceExposure()`'s actual (already-correct) behavior: a standalone A9 redemption now
reacts only at genuine Release; A3S's own matched-`businessEventId` pair remains the one Submit-time
exception, called out explicitly wherever A9's behavior is described.

## Doc-only fix: A3S's own Tight Available Balance row claimed "increases" — actually a net decrease

`Balance-Figures-Calculation-Logic.md`'s A3S table said Tight Available Balance "increases" at Submit,
describing only the Off-Balance Exposure release side while ignoring the LC's own simultaneous UTILIZE
consuming Pending Decrease Total in the same Submit. Live-verified against `app.test.ts`'s own S02/G02
numbers: Tight actually moves 2,000 → 0 (net **−2,000**), matching the business-confirmed "Pending
Earmark Total = +8,000 (SG) − 2,000 (LC)" figure — combined effect is always downward or flat (redemption
leg is MIN-capped at the SG's own Available Balance, never exceeds the UTILIZE's own ceilingAmount), never
a pure increase. No source code was wrong — the sufficiency-check/display code already nets correctly
(confirmed by the passing test suite); only this row's prose was stale.

## BAL-141 — `balanceService.ts`'s 4 movementType classification Sets collapsed into one Strategy/Type-Object registry

`createMovement()`'s NO_CHECK/UTILIZE_SHAPED/OUTSTANDING_CAPPED Sets + if/else-if chain, and `release()`'s
4 scattered `isSightUtilizeFinalize` ternaries, replaced by `movementTypeRegistry`
(`buildMovementTypeRegistry()`) and `resolveSnapshotWriteTarget()`/`captureSnapshotBundle()` — pure
internal refactor, zero behavior change (all 3 suites green, no spec edits needed). Reviewer-noted
follow-up: `resolveSnapshotWriteTarget()` now takes the already-computed `isSightUtilizeFinalize` as a
param instead of re-deriving it, since `release()`'s own Maker-Submit gate check needs the same boolean.

## `balance-component-api.yaml` bumped to v1.15.0 — schema descriptions never caught up to v1.13.0's own changelog, and this session's two netting fixes were undocumented

Two kinds of drift, no code changed: (1) v1.13.0's own changelog entry said `tightAvailableBalance`
became confirmedBalance-based and AMEND_DECREASE's own check became Tight-based, but the actual
`tightAvailableBalance`/`ceilingAmount` schema field descriptions and the `POST /balance-movements`
endpoint prose still described the old availableBalance-based formula — fixed to match. (2) This
session's SG redemption (`offBalanceExposure`, matched-`businessEventId` exception) and B4 Present Docs
(`presentDocsEarmarkApproved`, provisionally-referenced exception) fixes were never reflected in the
spec at all — added as a new v1.15.0 changelog entry plus corrected the two affected field descriptions,
mirroring `Balance-Figures-Calculation-Logic.md`'s own wording. Checked `BalanceMovement.warnings`/
`MovementWarning` (kept in `types.ts`/DB schema but deliberately excluded from this OAS since v1.0.0) —
`checkUtilizeSufficiency()` never actually returns a `warning` in current code, only `ok`/`error`, so the
field genuinely never populates a live response; the OAS omission is still correct, just vestigial
dead code left behind in the TypeScript side, not a spec bug.
</content>
