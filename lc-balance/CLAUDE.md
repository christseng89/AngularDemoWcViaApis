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

## Knowledge Engineering

You also act as a **Senior Code Analyst / Enterprise Knowledge Engineer / Obsidian Knowledge Base
Architect** for this microservice: capable of reverse-engineering business knowledge (not just
documenting source) out of code, APIs, tests, and configuration, and organizing it as a traceable, linked
knowledge base for BAs, architects, testers, and other AI agents — see "Balance Knowledge Base
(Obsidian)" below for the existing artifact and its conventions.

---

# Balance Knowledge Base (Obsidian)

`docs/obsidian-balance-kb-v3.2/` is **gitignored** (root `.gitignore`'s `obsidian-balance-kb*/` wildcard
rule — matches this directory and any other `-vN` suffix) — a locally generated artifact, not tracked in
git, so it may not exist in every checkout. It supersedes an earlier unversioned `docs/obsidian-balance-kb/`
vault (683 files, written in English); that directory and its own companion zip have since been deleted
from disk, not merely renamed — don't go looking for them. A companion `docs/obsidian-balance-kb-v3.2.zip`
snapshot sits alongside the current vault: the gitignore rule only matches directories, so the zip is a
plain untracked file, not excluded — an optional versioned-backup path (opaque to `git diff`/`grep`, not
browsable/`[[Wiki Link]]`-navigable on GitHub the way the unpacked vault is) that nobody has opted into
yet. An empty `vault-v2/` subfolder also sits inside the vault root — a naming leftover from the
regeneration process (the vault's own `Knowledge-Quality-Report.md` refers to itself as reviewing
"vault-v2" even though the note folder is named `-v3.2`); it holds no content, safe to ignore.

Where present, the vault (703 notes, written primarily in **Simplified Chinese** — a change from the
superseded vault's English) reverse-engineers this microservice's **business** knowledge — not just its
code — out of source, APIs, data models, tests, and this file itself: 206 business rules, 98 decision
tables, 220 test scenarios across 20 source domains, cross-linked with `[[Wiki Links]]` (4,112+ links, 0
broken, per the vault's own self-audit) rather than left as unrelated files. Start from
`00-Home/Balance-Knowledge-Home.md`; the vault root also carries the `01-Domain-Concepts/` …
`06-Maker-Checker/` … `12-Traceability/`, `90-Unclear-and-Conflicts/`, `99-Source-Map/` folder layout.
`00-Home/Knowledge-Quality-Report.md` self-scores the vault against a 9-dimension rubric (target ≥9.3,
≥9.5 for Code Traceability/Hallucination Control) — 6/9 dimensions pass; the 3 that don't (Tolerance Rule
Coverage 9.2, Test Traceability 9.0, Maintainability 8.6) each carry a disclosed reason and remediation
plan in that same report rather than being padded to pass — e.g. the Maintainability gap is mostly that
`07-API/`'s English `## Source Evidence`/`## Related Knowledge` section headers were never translated
when the rest of the vault switched to Simplified Chinese.

Every note carries an evidence status — **CONFIRMED** (directly supported by code/tests), **INFERRED**
(strongly implied but not explicit), **UNCLEAR**, or **CONFLICT** (sources disagree) — and cites its
source file(s)/test(s)/commit rather than embedding large code blocks; genuine open questions live in
`90-Unclear-and-Conflicts/Knowledge-Gaps.md` instead of being silently resolved. Treat CONFIRMED notes
the same way as this file's own "reviewer-confirmed" decision-log entries below (settled, don't
re-litigate without new information); treat INFERRED/UNCLEAR/CONFLICT notes as leads to verify against
source, not settled fact.

The vault is not necessarily current with every later decision logged below — it was generated against a
specific commit (each note's `last_verified_commit` frontmatter records which) and isn't regenerated
automatically as this file's decision log grows. When code and vault disagree, this file and the source
win; treat the vault as a map into the codebase, not a replacement for reading it. The generation spec
that produced it (extraction methodology, evidence-priority ordering, vault structure, regeneration
procedure for updating only impacted notes after a diff) is `Balance_Component_Obsidian.md`, in this same
directory — adapted from `lc-payment-wc/Payment_Component_Obsidian.md`'s equivalent spec for the Payment
Component.

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

## Live input-time Tight Available Balance check extended to B4 (HONOUR/ACCEPT) — the one remaining function checked only at Submit

Audited every A2–A9/B2–B5 function's live warning against its own server formula (business instruction
"統一在金額輸入時都檢查"); only B4 was missing one. `checksAgainstTightAvailable` now also matches
`HONOUR`/`ACCEPT` (both B4-only movementTypes, same `checkUtilizeSufficiency`-backed bucket `UTILIZE`
already uses). `tightAvailableBalanceForWarning` widens by the referenced B3 presentation's own
`ceilingAmount` for B4 — same false-positive fix as A35's own SG widening, since the persisted
`tightAvailableBalance` for `EPLC_CONFIRMATION` already nets Present Docs Earmark (including the B3
record B4 itself is resolving), while B4's actual server-side check never nets it at all
(`offBalanceExposure` is 0 for any non-IPLC_LC/EPLC_LC contract).

## Bug found live the same day, in B3 (not B4) — an amount exceeding BOTH Available and Tight Available showed no client-side warning at all

The Tight-tier warning's own `*ngIf` gated on `+model.amount <= +selectedContractSnapshot.availableBalance`,
written assuming every function it covers also has a genuine plain-Available tier to defer to (true for
UTILIZE/HONOUR/ACCEPT/AMEND_DECREASE-direction, which show the plain "exceeds Available Balance" warning
instead once the amount also exceeds Available — no double-message). B3/A8 have no plain-Available tier at
all (their own server check is Tight-only), so that guard silently suppressed their only warning whenever
the typed amount happened to exceed plain Available too — reproduced live: LC fully earmarked (Available
10000, Tight 0), B3 amount 20000, zero warning shown even though the server would reject it. New
`checksAgainstPlainAvailable` getter identifies the functions that genuinely have both tiers; the `<=
availableBalance` guard now only applies for them — B3/A8 always fall through to the Tight-tier check.

## BAL-142 — `createMovement()`'s own worst Cognitive Complexity finding (71 vs. 15 allowed) decomposed; sufficiency-check result types converted to discriminated unions

Reviewer-directed, following SonarQube-report2.md's own specific findings. `createMovement()`'s own
contract-resolution/creation preamble (re-ISSUE guard, Root-Issue-Released guard, Acceptance Tenor
consistency, SHGT ISSUE / EPLC_EXAMINATION CREATE creation-time sufficiency) extracted into
`resolveOrCreateContract()`; the latter two checks — structurally identical (resolve parent → confirmed/
pendingDecreaseTotal → gather siblings → earmark/exposure → check → throw) — collapsed into a
`newContractSufficiencyRegistry` keyed by `${instrumentType}:${movementType}`, same "table over
conditional chain" convention as BAL-141's own `movementTypeRegistry`. `captureSiblingSnapshots()` (its
own 21-complexity finding) split into `resolveAcceptanceSibling()`/`resolveSgSibling()`, with a nested
ternary replaced by an `ACCEPTANCE_TYPE_BY_ROOT` lookup table. Separately: `AcceptanceTenorCheckResult`/
`ShgtIssueSufficiencyResult`/`PresentDocsIssueSufficiencyResult`/`UtilizeSufficiencyResult`/
`AmendDecreaseCheckResult`/`RedeemCheckResult` (all of `domain/`'s sufficiency-check result types) and
the local `MovementSufficiencyOutcome` converted from `{ok: boolean; error?: string}` to a discriminated
union `{ok: true} | {ok: false; error: string}` — removes all 4 `.error!` non-null assertions in this
file with a compiler-enforced guarantee instead of a suppressed warning. Pure code motion — zero
condition/message changed, all 361 microservice + 34 backend + 996 Angular tests green with no spec
edits, and independently re-verified live against the running dev stack (A1 re-ISSUE guard, A8 SG Issue
both the InsufficientBalanceError and success paths, B3 Present Docs earmark rejection, SG sibling
snapshot rendering) — every error message byte-for-byte identical to before.

## UI/UX review P0 pass — `aria-live`/`aria-busy` on async state, `aria-describedby` on mandatory-field errors

Template-only, `transaction-builder/` directory: `index-picker.component.html`'s shared loading state
(`role="status" aria-live="polite" aria-busy="true"`) covers every paginated picker's loading text
app-wide (LC/IB/SG/Acceptance/payable-movement indexes) in one place; `maker-panel.component.html`'s
`.tb-result` banner and every `.tb-error`/balance-sufficiency-warning block got `role="alert"`/
`aria-live="polite"` so a screen-reader user is told about a Submit outcome or validation failure without
needing to re-scan the page; the three plain-`ngModel` mandatory Natural Key inputs (LC/IB/SG Number,
the ones outside the Formly array — see BAL-117-era `tb-input--invalid` doc comment above) got
`id`+`[attr.aria-describedby]` linking each to its own inline error message.
`checker-panel.component.html`/`transaction-builder.component.html` got the same `role="alert"` treatment
on their own search/action error blocks and `role="status"` on their own loading hints (Checker search,
Inquire Events index/events load). Reuses the existing `account-entries-dialog.component.html`
`role="dialog"`/`aria-modal`/`aria-label` pattern as-is — it's already the only modal in this sub-project,
nothing else to retrofit. Pure template attribute additions, zero `.ts` changes; all 996 Angular + 34
backend + 361 microservice tests still green with no spec edits.

## UI/UX review P1 pass — CSS-only loading spinner on every "Loading…"/"Searching…"/"Submitting…"/"Working…" state

`.tb-spinner`/`@keyframes tb-spin` (10px, `border` + `currentColor`, `prefers-reduced-motion` disables the
animation) added ONCE to the global `src/styles.scss` rather than duplicated per component — a genuine
cross-cutting design-system atom, and `maker-panel.component.scss`/`transaction-builder.component.scss`
were already sitting close to (one of them already past, pre-existing and unrelated to this change — see
below) the `anyComponentStyle` 12kb production-build budget, so a 4th/5th duplicate copy wasn't viable.
Dropped into every existing loading branch across `index-picker`/`maker-panel`/`checker-panel`/
`transaction-builder` (paginated-picker loading, Loading balance, Master Records/Events index loading,
Search/Submit/Release/Delete-Pending buttons) — no new loading state introduced, purely a visual affordance
on states that already existed. Template-only + one shared global CSS rule, zero `.ts` changes; all 996
Angular tests still green with no spec edits (this project's no-TestBed convention means Jest never renders
templates — verified for real via a live `ng build`, template-compiles clean).

**Found, NOT fixed (pre-existing, unrelated to this session):** a production `ng build`
(`defaultConfiguration: "production"` in `angular.json`) fails on `transaction-builder.component.scss`
exceeding the `anyComponentStyle` 12kb hard-error budget — confirmed via `git stash` that this already
exists on a clean `main` checkout, before any of today's edits. Does NOT affect the documented dev
workflow (`ng serve`'s own `defaultConfiguration` is `"development"`, which carries no budget block) or
either `npm test`/`tsc --noEmit` gate — only a real `npm run build` hits it, which isn't part of this
project's own standing "before calling a change complete" checklist. Flagged for a future pass (trim
~30+ bytes of real CSS from that file, or raise the budget) rather than opportunistically fixed here, since
it's unrelated to the spinner work and untouched CSS shouldn't be edited to chase an unrelated budget line.
**FIXED 2026-08-21** — same day, later pass ("Part B 也一起做吧,開始extract InquireEventsComponent"; see
"Part B — InquireEventsComponent/BalanceSnapshotBoxComponent extraction" below for the full write-up). The
overage amount had drifted with every unrelated edit to this file (P1 pass: 24 bytes; re-measured
2026-08-21 immediately before that day's own Inquire Events 60/40 split commit: 10 bytes; re-measured again
right after that commit landed: 25 bytes — record the CURRENT figure with its own measurement date
whenever this file is next touched, rather than trusting an old number as still accurate; no past
measurement here was wrong, the file simply kept moving) until the Part B extraction moved Inquire Events'
entire view layer, plus the `.tb-workspace--single`/`.tb-balance-box*`/`.tb-balance-row*` rules it (and the
former shared `#balanceSnapshotBox` `ng-template`) needed, out of this file into their own new components —
confirmed via a real `npm run build`: `transaction-builder.component.scss` is now **9.84 kB total** (only
1.84 kB over the 8 kB *warning* threshold, comfortably clear of the 12 kB *hard-error* one that used to
fail the build). `maker-panel.component.scss`'s own separate warning (11.92 kB, 3.92 kB over 8 kB) is
pre-existing and untouched by this pass — still just a warning, not a hard error, and out of scope here.

## UI/UX review P2 pass — function-chip/status/role icon set, icon toggle theme switcher

`TbIconComponent` (`src/app/tb-icon.component.ts`, deliberately not nested under `transaction-builder/`
since `AppComponent`'s theme toggle is a consumer too) — 13 hand-authored inline-SVG icons (16px, 1.5px
stroke, `currentColor`, no fill/shadow; user-confirmed "細線條風格" style via `AskUserQuestion`). Global
`.tb-icon` CSS in `src/styles.scss`, same anyComponentStyle-budget reasoning as `.tb-spinner` (P1) — never
duplicated per component. New `functionActionIcon()`/`statusBadgeIcon()` pure functions
(`balance-component.model.ts`) group the 14 A1–A9/B1–B5 chips into 4 action-type icons (issue/amend/
utilize/redeem, keyed by function `code`) and derive a status-badge icon from the CSS class
`statusBadgeClass()` already returns (ok/pending/cross/dash) — status no longer conveyed by color alone.
Maker/Checker/Look Up section headers each get a fixed role icon (pencil/flag/magnifier). Theme switcher
(`AppComponent`) replaced its plain-text `<select>` with an icon toggle button — one click steps
System → Light → Dark → System (`ThemeService.cycleMode()`, new); the icon reflects `theme.mode` itself
(a dedicated monitor icon for System), not `effectiveTheme`, since the two are genuinely different facts
and the icon alone can't otherwise distinguish "System resolved to dark" from "explicit Dark" — the
visible text label next to it carries the same distinction. All wiring verified live via `ng serve`
(chips on both Import/Export sides, Maker/Checker/Look Up headers, an Inquire Events status-badge table,
and all 3 theme states) in addition to `ng build`'s template compile check and the full Jest suite (1004
Angular tests green, no regressions).

## Checker's own independent search auto-resolves SG/IB Number when left blank — business-reported gap ("單獨執行 A9 Checker 輸入LC NUMBER 無法自動找到PENDING交易")

`searchCheckerLc()` (`checker-panel.component.ts`) no longer hard-errors "Type a SG/IB Number to search"
for SHGT/Acceptance-typed functions (A6–A9/B3–B5) when only the LC Number is typed — same gap first
reported 2026-08-15 for A8, now recurring for A9 standalone Checker use. New
`searchCheckerCandidatesByLcOnly()` browses every ACTIVE candidate of the function's own instrumentType
under that LC via `catalog()` (same exact-`lcNumber`-match convention the Maker's own IB/SG Index pickers
already use): zero candidates is a real error, exactly one auto-resolves and loads its Checker queue
directly (`checkerAutoPickedHint`, same "picked automatically" convention `app-index-picker`'s own
`autoPickedHint` already uses), more than one surfaces a pick-one list (`checkerSecondaryCandidates` +
`onSelectSecondaryCandidate()`) since which one is genuinely ambiguous. Live-verified against the dev DB
(S01/S02, both single-SG LCs) — SG Number auto-fills and the queue loads with zero manual typing.

## A6/A3S/B4/B5's compound Checker Release/Reject silently no-opped in a genuinely independent Checker session — business-reported ("B4 Submit 後跳出交易 再進入B4 SEARCH U04或U06 找出交易後點選RELEASE => 無法處理")

Root cause: `TransactionBuilderComponent.release()`/`reject()`'s own top-of-method guard required
`makerContext.submitResult` (the CURRENT session's own Maker state) — but `isCheckerCompoundOwnSubmission`
routes A6/B4 (`checkerRelease.settlesDocumentArrival`) into these two methods based purely on
`selectedCheckerMovement.referencedTransactionId` being set (true for EVERY A6/B4 movement regardless of
which session Submitted it), and A3S (`documentArrivalWithSg`)/B5 (`amountVsAvailableDerivation ===
'SETTLE'`) based purely on `businessEventId` being set (same story) — so a Checker who searches
independently (no Submit in THIS session, `submitResult` null) had the click silently swallowed before
ever calling the API: no network request, no error, nothing. Reproduced live exactly as reported (B4
Usance, LC U06) — clicking Release did nothing observable; confirmed via direct microservice calls that
the release chain itself has zero server-side defect (all 3 legs release cleanly with a proper
`checkerId`) — the bug is 100% client-side. Fixed by relaxing the guard to
`!selectedCheckerMovement && !makerContext.submitResult?.movementId` (either is sufficient) — mirrors the
same "prefer `selectedCheckerMovement`, fall back to `submitResult`" pattern `checkerActions.release()`/
`reject()` (`checker-actions.service.ts`) and `buildCheckerActionContext()` already use throughout;
`CheckerActionContext.selectedCheckerMovement`'s own doc comment already documented the intent ("always
real server data... for a genuinely separate Checker session") — the component's own guard just hadn't
been updated to match. Scoped to exactly A6/A3S/B4/B5 — every other function (A1–A5, A7–A9, B1–B3) uses
`checkerAct()`'s own plain-release fallback (`this.api.release(movementId, checkerId)` directly, keyed off
`selectedCheckerMovement` alone already), which was never affected. Verified: live end-to-end (B4 Usance,
LC U06 — Release now correctly releases all 3 linked legs, confirmed via the microservice's own
businessEventId query) plus 6 new unit tests covering the identical "Submit → exit → re-enter as Checker
→ Release/Reject this PENDING movement" scenario for all 4 affected functions (A6, A3S, B4 Sight+Usance,
B5) and confirming the true no-op case (nothing selected at all) still no-ops; full suite green (1017
Angular tests, 98.78% coverage, no regressions).

## Look Up Current Balance's own Event Timeline — Type column removed, Status column nowrap-protected, Secondary Ref. column added

User-confirmed (2026-08-21): the row-click Account Entries voucher already reconstructs full Dr/Cr
detail per event, so this table's own per-row movementType badge (Type column) was redundant —
overview/navigation only, not carrying full audit-trail responsibility itself. Removed from
`transaction-builder.component.html` (the only file that renders this table — `maker-panel.component.scss`
only ever carried a duplicate CSS copy, never the markup); `.tb-table--lookup-timeline`'s own
`.tb-type-tag` size override removed from both `.scss` duplicates, the shared base `.tb-type-tag` rule
left untouched (Account Entries/Function column still use it). New `.tb-table__status { white-space:
nowrap; }` (+ `white-space: nowrap` added to `.tb-status-badge` itself) protects the Status column the
same way `.tb-table__amount`/`__time` already were, so a longer status label added later can't get
squeezed. Found and corrected while doing this: the removal comment's own stale "7-column" count never
accounted for the Audit Trail column added later — actual count is 8 → 7, not 7 → 6; horizontal scroll on
`.tb-table-scroll` still applies at the 40%-split width even after the removal, live-confirmed (LC S02).

Same day, same table: added a Secondary Ref. column (user instruction, "Lookup 除了 REFERENCE 還要有
SECONDARY REF") — EPLC_EXAMINATION's own EB Number / SHGT's own SG Number (`"SG G01"`-prefixed), distinct
from the Reference column's own free-text `sourceTransactionRef`. Extracted `secondaryReferenceForEvent()`
as a module-level free function in `inquire-events.service.ts` (same convention `functionForEvent()`
already established) — both `InquireEventsService.secondaryReferenceFor()` and the new
`LookUpPanelService.secondaryReferenceFor()` delegate to it, so the two screens can never disagree on this
mapping either. Live-verified (LC S01 / SG G01 — SG Balance tab correctly shows "SG G01" on every row).

## Inquire Events — Event Details 60/40 split (Original Transaction Screen / Balance Tabs), Account Entries button moved to title row

User-requested layout pass, 2026-08-21. A/B are grid-placed via the existing `.tb-workspace` rule (reused
as-is, not duplicated under a new class) — real bug caught and fixed before shipping: without wrapping B's
tab-strip + `ngTemplateOutlet` output into one element, Grid auto-placement split them across two DOM
children, landing the Balance Tabs content on row 2 under column A instead of column B. B now wraps in its
own `.tb-balance-box` so it gets the same outer frame as A. Account Entries moved into a new
`.tb-balance-box__header` row (global `styles.scss`, not the component file — see this file's own
budget-drift note above).

## A10/B6 Close — write off the remaining Confirmed Balance and retire the LC/Confirmation

cs-tf-balance-knowhow rationale §3.9/§7.7's "cancellation before expiry" analog (same write-off entry as
a natural expiry, but Maker/Checker-triggered). One shared eligibility check
(`domain/closeEligibility.ts`: SG Balance = 0, Acceptance Balance = 0, no open Events anywhere in the
tree — including a RELEASED-but-not-yet-`presentDocsConsumedAt` B3 Present Docs presentation — not
already Closed) backs all three defense layers: the Step-1 picker's own server-computed hint-set (new
`GET /balance-contracts/close-eligible`, one aggregate call, not per-candidate like every other hint in
`document-arrival-hints.service.ts`), `createMovement()`'s own sufficiency check, and `release()`'s own
re-check before flipping `ContractStatus` to `CLOSED` (reserved in `types.ts` since the original design,
never previously set anywhere). The write-off amount must exactly equal the current Confirmed Balance,
re-verified at both Submit and Release — a balance change in between forces a re-submit rather than
silently over/under-writing it (movements stay immutable-once-created, same invariant every other
movementType relies on; Close does not get a special-cased exception). Amount is never typed — a new
`amountAutoFilledFrom` `FunctionStrategy` dimension carries it from Confirmed Balance and locks the
field, genuinely different from A9/B5's own `amountVsAvailableDerivation` (which still lets the Maker
type a value to compare against Available).

New `GET /balance-contracts?includeAnyStatus=` lets Look Up Current Balance keep resolving a CLOSED
contract by natural key (business-reported gap, "LOOKUP也應該看到此LC 項下所有的交易包括CLOSE EVENT") —
every transaction-creating caller stays ACTIVE-only by omitting the flag, so a Closed LC is still no
longer selectable for any other function. Inquire Events needed no equivalent fix — its own LC Master
Records Index already omits the `status` filter, and `selectLcFromIndex()` already skips the ACTIVE-only
`resolveContract()` round trip entirely.

Two bugs found live while building/testing this, both fixed:
- `movementTypeMatchesFunction()`'s `derivesMovementTypeFromTenor` branch (B4-only) returned true for
  ANY `EPLC_CONFIRMATION` movementType regardless of value, not just HONOUR/ACCEPT — pre-existing,
  harmless until CLOSE became the first other movementType ever recorded against that instrumentType;
  silently mislabeled every CLOSE event as "B4 · Honour/Acceptance" in Look Up/Inquire Events (both read
  `resolveFunctionForMovement()`, which iterates the registry and takes the first match — B4 is declared
  before B6). Now checks `movementType === 'HONOUR' || 'ACCEPT'` explicitly.
- The Event Details 60/40 split's own release()-time eligibility re-check counted the CLOSE movement
  being released as one of its own blocking "open events" (it's still PENDING at that exact instant) —
  self-rejecting every Release. `evaluateContractCloseEligibility()` now takes an `excludeMovementId`.

Also same session: LC Master Records Index status badge color-codes ACTIVE (green)/CLOSED (red) with an
icon (`contractStatusBadgeClass()`, reusing the existing `statusBadgeClass()`/`statusBadgeIcon()` token
system rather than the plain, status-blind `.tb-type-tag` it used before) — user-requested, "容易識別".
`functionActionIcon()` gained a 5th group, `cross` (A10/B6 only) — they used to fall into the `redeem`
fallback, whose icon is the identical checkmark shape as `ok`/"approved", which reads wrong for an
irreversible retirement action; `cross` (the existing rejected/cancelled X, already in `TbIconComponent`'s
shared set) needed no new SVG.

## Server-side "Amount must be > 0" backstop — `assertValidAmount()`, checked at both Submit and Release

Business-reported gap, "SUBMIT & RELEASE API 也要有交易金額控制檢查" — the 2026-08-19 "A1-A9, B1-B5 Amount
figure should > 0" rule only ever lived in `submit-rules.ts` on the Angular side; confirmed live via a
direct `POST /balance-movements` that `amount: "0"` and `amount: "-5000"` were both silently accepted for
a plain ISSUE. New `BalanceService.assertValidAmount()`, called from both `createMovement()` (before
`resolveOrCreateContract()`, so a rejected ISSUE/CREATE never leaves an orphaned contract row) and
`release()` (a defense-in-depth backstop for a bad amount that reached PENDING some other way — not
expected to ever actually fire for a movement `createMovement()` itself created). `AMEND` (B2's own
movementType) is exempted from the sign check — Direction there is carried by the amount's own sign, not
a distinct movementType, so only an exact zero is rejected. `CLOSE` only rejects negative — see the A10/B6
entry above.

## Part B — `InquireEventsComponent`/`BalanceSnapshotBoxComponent` extraction (fixes the `anyComponentStyle` overage above)

2026-08-21, same day as the A10/B6 Close pass above — first proposed as "next sprint" tech-debt (advisory
only, not implemented) alongside Part A (the byte-count doc fix above) in two separate rounds of the same
"給工程師的完整指示" instructions; actioned same day at explicit user request ("Part B 也一起做吧,開始
extract InquireEventsComponent") once a third round of that same message disputed (incorrectly — see
below) that either part, or the whole A10/B6 feature, existed in the checked-out repo at all. Re-verified
directly against `git log`/`git status`/`git show` and live file reads before touching anything further:
HEAD matched `origin/main` exactly (commit `c00be89`) with a clean working tree, and every file the user
said was missing (`CLAUDE.md`'s own byte-count paragraph, `balance-component.model.ts`'s `A10`/`B6`/
`CLOSE_GROUP_CODES`) was present and unchanged since being pushed — the discrepancy was a stale/mismatched
local read on the user's own side, not a lost commit; confirmed with the user before proceeding.

The whole Inquire Events section (side tabs, LC Master Records Index, Events timeline, Original Transaction
Screen, Balance Tabs) moved out of `transaction-builder.component.html`/`.scss` into a new standalone
`InquireEventsComponent` (own `anyComponentStyle` budget). `InquireEventsService` (all the actual
orchestration/state logic) stays exactly where it already was — parent-constructed/parent-owned, unchanged
`providers: [LookUpPanelService, InquireEventsService]` — and is passed down as a plain `@Input()
inquireEvents`, so `selectMode()`'s own `loadIndex()` call and every existing test covering that wiring
(`transaction-builder.component.inquire.spec.ts`) needed zero changes: only the VIEW layer moved. The
Account Entries dialog it can open stays parent-owned too (also opened from the Maker Result panel and the
Look Up panel's own Event Timeline) — the child bubbles the request up via a new `(openAccountEntries)`
output instead of managing dialog state itself.

The former shared `#balanceSnapshotBox` `ng-template` (declared once, invoked via `*ngTemplateOutlet` from
both the Look Up panel and Inquire Events since 2026-08-17) could not simply move with Inquire Events — an
`ng-template` reference variable is local to the template that declares it and cannot cross a component
boundary. Converted into a real standalone `BalanceSnapshotBoxComponent` (`@Input() title/status/snapshot/
impact`) instead, used by BOTH the Look Up panel (parent) and `InquireEventsComponent` (child) — the
"one canonical box" intent the 2026-08-17 extraction already stated, now enforced by the type system rather
than a template-local reference. Byte-for-byte identical rendering to the old template at both call sites,
confirmed via `ng build`'s strict-template check (which the old `ng-template`'s untyped context variables
had been silently exempt from — the new typed `@Input()`s surfaced two genuine `snapshot.redirectedImpact`
possibly-null template errors the old code had been masking; fixed with a non-null assertion inside the
`*ngIf="…redirectedImpact?.label === '…'"` guard that already ensures it, not a behavior change).

Every class this template needs (`.tb-table`, `.tb-tabs`, `.tb-balance-box*`, `.tb-status-badge*`, etc.) had
to be COPIED — not merely moved — into the new components' own stylesheets, per this project's own
established "disclosed, deliberate copy" convention (see `transaction-builder.component.scss`'s own comment
above `.tb-muted`, from the `AccountEntriesDialogComponent`/BAL-003 pilot): Angular's per-component view
encapsulation means a class rule declared in one component's stylesheet never matches markup rendered by a
DIFFERENT component's own template. Only classes truly exclusive to the moved markup (`.tb-workspace--single`,
`.tb-balance-box*`, `.tb-balance-row*`) were actually REMOVED from `transaction-builder.component.scss` —
everything else Inquire Events also needs (`.tb-tabs`, `.tb-table`, `.tb-hint`, `.tb-btn`, etc.) stayed in
the parent too, since the Look Up panel's own Event Timeline (still parent-owned) needs the identical rules.
While auditing which classes were genuinely still referenced, also found and removed three genuinely DEAD
rule blocks in `transaction-builder.component.scss` — `.tb-quick-pick*`, `.tb-result*`, `.tb-row-sub` — zero
usages anywhere in that file's own template even before this pass (leftover from the earlier Maker/Checker
panel extraction, which already carries its own copies in `maker-panel.component.scss`); confirmed via a
plain grep across every `.html` in this sub-project, not assumed.

Result, confirmed via a real `npm run build`: `transaction-builder.component.scss` dropped from 12.025 kB
(25 bytes over the 12 kB hard-error budget — see the P1 entry above) to **9.84 kB** (comfortably under,
only 1.84 kB over the softer 8 kB warning). Neither new component's own stylesheet comes close to either
threshold. Added two new spec files (`inquire-events.component.spec.ts`,
`balance-snapshot-box.component.spec.ts`, same direct-instantiation/no-TestBed convention as
`account-entries-dialog.component.spec.ts`) covering the new `@Output`/delegation-method surface; all
existing specs needed zero edits. Full suite re-run and green across all three sub-projects per this file's
own standing rule: Angular app 1049/1049 (29 suites, 98.73%/96.54%/96.95%/98.96% coverage), `backend/`
34/34, `microservices/balance-component/` 396/396.

## A9 (SG Redemption) locked to Full Redeem only — BA-confirmed, resolves the `TF_Balance_Component_Mapping` Rule #1 conflict

BA verdict (2026-08-21) on the SG-discharge conflict flagged between `analysis/TF_Balance_Component_Mapping-{en,zh}.xlsx`'s
own Rule #1 ("SG discharge is instrument-based, not amount-based") and the shipped `PARTIAL_REDEEM`
capability: **A9 must be Full Redeem only, Amount PROTECTED** (equal to the SG's own Available Balance,
not user-typed); **A3S is correct as-is, no change** — its own matched SG redemption leg is genuinely
tied to a real Document Arrival (`MIN(Bill Amount, SG Available Balance)`, linked via `businessEventId`),
not a standalone partial. Scope confirmed as A9-only, reference-client (Angular) only — the microservice's
own `PARTIAL_REDEEM` movementType and `domain/shgtRedeem.ts`'s `checkRedeemSufficiency()` are unchanged
and still accept a Partial Redeem from any other direct API caller (confirmed via code inspection —
`checkRedeemSufficiency()` checks only `amount <= availableBalance`, with no `businessEventId`/A3S-pairing
check at all); this is a known, disclosed trade-off, not closed in this pass.

Implemented as a UI-layer lock, not a new backend rule: `builder-fields.ts`'s own Amount field (new
`amountFromSgRedeem`, folded into `amountLocked`) is now `disabled`, sourced from the SG's Available
Balance — same fully-locked shape `amountFromClose`/`amountFromFullSettle` already use, just a different
source figure (Available, not Confirmed — A9 must still net an already-PENDING redemption on the same SG,
unlike A10/B6's write-off). `submit-rules.ts`'s own REDEEM branch is a defense-in-depth backstop:
`movementType` is now hardcoded `FULL_REDEEM` and a non-exact-match amount is a hard reject, not a silent
downgrade to `PARTIAL_REDEEM`. `function-strategy.ts`'s `amountVsAvailableDerivation: 'REDEEM'` flag is
kept on A9's registry entry unchanged — it now serves purely as an A9 identity marker (parent-eligibility
hints, historical `PARTIAL_REDEEM` redisplay), not a live derivation choice; `maker-panel.component.ts`'s
`afterResolved()`/`refreshSelectedContractSnapshot()` already set `model.amount = availableBalance` for
this case and needed no change. `Balance-Figures-Calculation-Logic.md`/`.docx` updated with the same
scope note. Full suite re-run and green: Angular app 1049/1049, `backend/` 34/34,
`microservices/balance-component/` 425/425.

## A9 lock basis clarified: Available Balance, not Confirmed Balance as `Balance-Component-Business-Rule-Decisions-2026-08-21.md`'s own Decision 1 literally says

That memo's own action-item table (item 1) reads `amountAutoFilledFrom: 'confirmedBalance'`, matching
A10/B6's mechanism verbatim — but user-confirmed via a concrete worked example (SG G01 issued 10,000 →
A3S already redeems 2,000 against it → A9 must then redeem exactly the remaining **8,000**): Confirmed
Balance would wrongly still read 10,000 whenever another movement on the same SG is still PENDING at
redemption time, double-counting capacity already reserved elsewhere. Available Balance (nets PENDING) is
therefore the correct basis and what was actually implemented (see the entry immediately above) — that
memo is a point-in-time record per its own convention and is not being edited to reflect this; treat
`amountAutoFilledFrom: 'availableBalance'` (the shipped behavior) as controlling over that memo's literal
`'confirmedBalance'` wording wherever the two disagree.

## Balance-Component-Test-Case-Proposal.md §4 — 7 new Business Case Registry entries added, live-verified

`import-case-8` (Sellers Usance → A10 Close), `import-case-9` (Buyer's Usance → A10 Close), `import-case-10`
(Sight, SG + Document Arrival both to their own terminus → standalone A9 → A10 Close), `import-case-11`
(A10 eligibility gate negative case, `expectError: true`), `export-case-8` (Sight → B6 Close),
`export-case-9` (Sellers Usance → B6 Close), `export-case-10` (standalone B2 Amendment, increase then a
decrease past Tight Available, `expectError: true`) — each extends an existing case's own path through to
Close rather than inventing a new scenario, since `domain/closeEligibility.ts`'s own preconditions (SG/
Acceptance Confirmed Balance = 0, no open Event anywhere in the tree) mean A10/B6 can never be a minimal
standalone case. `backend/data/businessCases.js`'s registry grew from 14 to 21 cases;
`businessCases.test.js`/`server.test.js` updated to match (`EXPECTED_IDS`, registry-size assertions, the
`lcNumber` pattern regex widened for two-digit case numbers). All 7 driven live against the real
microservice via `POST /balance-movements` (Submit) + `/release` (Approve) +
`import-case-10`'s own real `/maker-submit` — see `analysis/Balance-Component-New-Test-Cases-Verification-2026-08-21.md`
for the full trace-by-trace result (7/7 pass, both negative cases fail exactly as designed). Action items
2/3 from the Business Rule Decisions memo (backend `businessEventId` enforcement, `BUYERS_USANCE`
rejection/normalization) remain deliberately out of scope for this pass, by explicit user direction.

## LC Expiry Date / Acceptance Maturity Date Control — approved Design Decision Basis for A2–A10/B2–B6

Full review: `analysis/LC-Expiry-Acceptance-Maturity-Control-Review.md` — **approved and confirmed shippable, 5 rounds** (3-round CITF/architect review to 9.7/10 APPROVE WITH MINOR ENHANCEMENTS; round 4 was an independent citation audit against the cs-tf-balance-knowhow source files, 8.6/10, fixed one real mis-citation (`rationale-en.md` §14 "Implementation checklist", not `impl-spec-en.md`) and flagged a since-retracted second claim; round 5 — the round-4 reviewer re-checked the source files themselves and withdrew that second claim, confirming the I4/I12 quotes were verbatim-correct all along — final score 9.5/10, doc's own Appendix 4 has the full paper trail). Phase 0-3 (schema, A7/B5 Maturity Control + Early Settlement authorization, NEW EXPOSURE control, A2/B2 amendment subtype) are cleared to hand to engineering. **GAP-15 resolved 2026-08-23**: ④EXPIRY RESIDUAL RELEASE does NOT need a new `LC_EXPIRE`/`CNF_EXPIRE` movementType — an external system determines timing off `expiryDate` + its own business policy and drives the existing A10/B6 Maker/Checker API (two separate calls, same shape as any other caller), same path as a human operator; this service never needs to know the caller is a scheduler. Maker/Checker identity separation for that batch trigger is unaffected by this decision — `domain/statusTransition.ts` already documents same-person Maker/Checker as a bank policy concern this state machine doesn't enforce (business instruction, 2026-08-14), so no new exception was introduced. Balance Component's only obligation is keeping `expiryDate` populated (Phase 0, independent of this decision) and `GET /balance-contracts/close-eligible` accurate — no scheduler, no `ExpiryReleasePolicy` config schema. Full record: `Natural-Expiry-Scope-Decision-Request.md`. `LCExpiryAcceptanceMaturityControlReview_v5.docx` is the current pandoc-regenerated twin in `analysis/` — same pattern as `Balance-Figures-Calculation-Logic.{md,docx}`, edit the .md then regenerate. Unlike that pair's own convention, superseded `_vN.docx` snapshots are deliberately NOT kept once a new round lands — only the current version's docx twin stays in the working tree (confirmed business-side intent 2026-08-22); `_v3`/`_v4.docx` were removed for this reason, still recoverable from git history if an old round's exact docx is ever needed. Neither `expiryDate` nor a live, enforced `maturityDate` exists yet in `types.ts`/domain logic — this document is the target-state design, not an as-is gap list; its own Phase 0 must land before any of it is enforceable. **Superseded 2026-08-23**: this is no longer accurate — `analysis/A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md`'s own Phase 0, §0.1, §1, and the `AMEND_EXPIRY`/`documentPresentationDate` parts of §2/§3 are now implemented and verified (all 3 test suites green, OAS at v1.20.0, live-browser-tested end to end) — `expiryDate` is a real, enforced field. See that spec's own version-history table for exactly what has and hasn't landed; don't assume this paragraph's "not enforceable yet" framing still holds for the whole document.

A6/B4's own Calculated Maturity Date (this paragraph's "Source of Truth is a Calculated value" line below) — the open question raised in `Maturity-Date-Business-Day-Convention-Decision-Request.md` (2026-08-23) — the microservice has no holiday calendar, and GAP-15 already decided scheduling/calendar logic is out of its scope, so the spec's own "Base Date + Tenor + Business Day Convention" formula had no way to actually compute the Business Day Convention part — **was resolved 2026-08-23**: a separate external **Standing microservice** owns Business Day Convention/calendar logic, keeping GAP-15's own division of responsibility intact (Balance Component still never embeds a holiday calendar). Full business rules, data model, and OAS design live in `analysis/maturity_date/` (`Standing_Microservice_Maturity_Date_OAS_Design.md` v2.10.0 — 19 review rounds, 9.9/10 Approved Design Baseline; `standing-calendar-service.oas.yaml`). The shape: Balance Component computes `sourceDate` (Base Date + Tenor, per Tenor Basis/UCP 600 Art. 3 from/after rules) itself — that part stays Trade Finance's own responsibility, Standing never touches it — then calls Standing's `POST /business-days/adjust` with it; Standing returns `adjustedDate` (the calendar-adjusted Operational Payment Date) plus per-calendar assessment detail, and **always** echoes back `contractualDateChanged: false` — the Contractual Maturity Date itself never changes from this call, only which day the payment/processing actually happens on shifts.

**`microservices/standing-mock/` added same day** (own `README.md` has the full write-up) — a local, deliberately simplified stand-in for real Standing, implementing only `POST /business-days/adjust` against hand-authored `data/calendars.json` test data (weekend/public-holiday calendars for US/GB/TW/HK/SG/JP/CN/AE, plus a `USD_FEDWIRE` clearing calendar and an always-open `DEMOBANKXXX` institution calendar built specifically to reproduce the design doc's own canonical Dec-25 worked example, §3.11 — verified live to return the exact same `adjustedDate: 2026-12-28` result). Port `4400` (`4100`/`4200`/`4300` already taken).

**`microservices/balance-component/` wired up to it same day** (2026-08-23) — `src/clients/standingClient.ts` (`adjustBusinessDay()`, bounded retry on transient connection failures mirroring `backend/server.js`'s own `fetchWithRetry` — Standing's calc endpoint is read/computation-only, safe to retry unlike a mutating Balance Component call; `STANDING_SERVICE_URL` env var, default `http://localhost:4400`; failures throw the new `CalendarServiceError`, mapped 503, fail-closed — never a silent uncalculated fallback), `src/domain/maturityDateCalculation.ts` (pure `sourceDate = acceptanceDate + tenorDays` arithmetic, no I/O), and `BalanceService.calculateAcceptanceMaturityDate()` — the ONE genuinely async public method on this class. Deliberately NOT folded into `createMovement()` itself, which stays 100% synchronous (matching `node:sqlite`'s own synchronous DB layer) and completely unchanged for every existing caller/test: `routes/balanceMovements.ts`'s `POST /balance-movements` handler is now async and, ONLY when the request is an Acceptance CREATE (`IPLC_ACCEPTANCE`/`EPLC_ACCEPTANCE`, `movementType: 'CREATE'` — covers both A6 directly and B4's own Usance-branch compound-submission leg, since both create that same contract shape) carrying a new opt-in `maturityDateCalendars` array with no caller-supplied `maturityDate`, awaits the calculation FIRST and passes the result through as a plain `maturityDate` on the request — the exact same field `createContract()` already had, just now sometimes server-computed instead of only ever caller-supplied. A caller-supplied `maturityDate` always wins outright (manual override, Standing never called); a caller that omits `maturityDateCalendars` entirely (every existing test, every other movementType) is completely unaffected. Live-verified end-to-end against the real `standing-mock` server (not just mocked in tests): an Acceptance created today (2026-08-23) with `tenorDays: 90` and a `USD_FEDWIRE` calendar reference correctly computed `sourceDate = 2026-11-21` (a Saturday), Standing rolled it forward to `2026-11-23` (Monday), and that value persisted onto the new contract's own `maturityDate` field. Full microservice suite re-verified green: 472/472 (up from 443), coverage 99.02%/95.25%/99.56%/99.33%. Angular UI wiring (A6/B4 read-only display, `maturityDateOverrideReason` override field) is still a separate, not-yet-started piece of work. Scoped to exactly A6/B4 — A3/A3S/B3 are unrelated to this feature entirely (their own date field is `documentPresentationDate`, a different, already-implemented check against `expiryDate`, never Standing).

**UI-only reference-date fields added ahead of the above (2026-08-23, user-requested; widened + reordered same day)**, `builder-fields.ts`: `issueDate` now precedes `expiryDate` on A1/B1 (an LC is issued, then it has an expiry). `parentExpiryDateReference` (read-only) shows the parent LC/Confirmation's own Expiry Date on A6/B4-Usance, for context while Maturity Date entry is still gated above. `originalExpiryDateReference` (read-only) shows the picked LC/Confirmation's own current Expiry Date — originally A2/B2 Extend Expiry only, widened to A3/A3S/B3 (Document Presentation, to judge UCP 14(c) timing against UCP 6(d) expiry); shown BEFORE `expiryDate`/"New Expiry Date" on A2/B2 (also user-requested reorder — the existing value logically precedes the new one being typed). Populated via direct model assignment in `maker-panel.component.ts`: A2/B2/A3/A3S via `onSelectContract()` (flat Catalog), B3 via `onSelectParent()` (its own instrumentType, EPLC_EXAMINATION, is in HAS_PARENT) — never Formly `defaultValue` (goes stale on re-selection), never submitted, `buildSubmitRequest()` doesn't read either key.

Standing principle: LC Expiry Date governs new contingent exposure and the eventual release of residual unused contingent liability, but does not automatically extinguish valid existing obligations. Acceptance Maturity Date governs the due lifecycle of an established Acceptance — Source of Truth is a Calculated value (Base Date + Tenor + Business Day Convention), Maker override only when authorized — and settlement before maturity must be explicitly classified and authorized, never auto-rejected. **Per the GAP-15 resolution above**, residual release on expiry is NOT a second trigger with its own eligibility shape — it IS A10/B6 Close, invoked externally instead of by a human; `closeEligibility.ts`'s existing SG=0/Acceptance=0/no-open-events check is the only eligibility gate this needs, nothing new to build or keep separate from it.

## A6/B4 Calculated Maturity Date — Angular UI data-ownership model: capture once at A1/B1, amend at A2/B2, auto-inherit at A6/B4, protected display at A3/A3S/B3

Business instruction (2026-08-23): the Standing calendar config (`maturityDateCalendars`/`maturityDateCombinationRule`/`maturityDateConvention`) follows the same "father decides, child inherits" pattern this codebase already uses for Currency/TenorType — captured once on the parent LC/Confirmation at A1/B1, amendable at A2/B2 (new `AMEND_MATURITY_CALENDARS`/`UPDATE_MATURITY_CALENDARS` movementType, mutates the contract at Checker Release only, same convention as `AMEND_EXPIRY`), auto-read server-side by A6/B4 (`getMaturityDateCalendarsFromParent()`) with zero re-entry, and shown strictly **read-only** at A3/A3S/B3 (`maturityDateCalendarsReference`, a display-only summary string via `maturityDateCalendarsSummary()` — never an input field there) — this is what keeps multiple Partial-Shipping presentations against the same LC from ever supplying inconsistent calendar configs. Originally required only for `SELLERS_USANCE`/`BUYERS_USANCE`, never for `SIGHT` — **superseded same day, see the "widened to every tenor" entry below**. Deliberately a UI-only requirement, not a server-side `RequestValidationError`: a hard 400 at `createContract()` would also reject the large pre-existing corpus of Usance-tenor A1/B1 test fixtures that predate this field and have nothing to do with it, so the microservice keeps the field optional and permissive. Inquire Events reconstructs both fields via one ternary in `inquire-events.service.ts` (`movement.movementType === 'AMEND_MATURITY_CALENDARS' ? movement.maturityDateCalendars : contract.maturityDateCalendars` for `maturityDateProfile`) — same "movement carries the requested new value, contract carries the current value" pattern already established for `expiryDate`/`AMEND_EXPIRY`. Live-verified end-to-end (browser + curl): A1 Usance ISSUE with `USD_FEDWIRE` → A3 read-only reference → A6 auto-computed `maturityDate` with zero manual Maker input → A2 `AMEND_MATURITY_CALENDARS` overwrote the contract's own config after Release (not at Submit) → Inquire Events' A1/A2/A3 reconstructions all correctly reflect movement-vs-contract sourcing. Microservice 484/484, Angular 1149/1149, both ≥95%/coverage-floor.

## `MATURITY_DATE_CALENDAR_PROFILES` redesigned — cross-border settlement must check the domestic bank AND the counterparty paying/receiving bank, never just one side

Business instruction (2026-08-23): "跨境 Trade Finance 付款或收款，原則上至少應檢查兩個 Calendar：本國銀行 Calendar（確認本國銀行可以扣客戶帳戶或入帳給客戶）、國外付款行或收款行 Calendar（確認交易對手銀行可以付款或收款）" — a single-calendar check only verifies one side can process the payment, not that both legs of a cross-border settlement can actually happen on the same day. Standing's own `AdjustBusinessDayRequest.calendars[]` is `required`/`minItems: 1` with no default/auto-injection (confirmed against `standing-calendar-service.oas.yaml` and the design doc's own "Standing 計算的是 calendar-adjusted date...交易義務的成立、變更及到期判定，仍由 Trade Finance 負責" framing) — Standing is a stateless calendar-combination engine with no concept of "which side is ours"; assembling the correct `calendars[]` set is entirely this project's own responsibility, not something the calculation service does for it.

This demo's own bank is Taiwan-based, so every `MATURITY_DATE_CALENDAR_PROFILES` entry (`balance-component.model.ts`) except the bare `TW` one now fixes `{ calendarType: 'COUNTRY', code: 'TW', role: 'ISSUING_BANK' }` as the domestic leg alongside the picked counterparty country (`role: 'PAYING_BANK'`), `combinationRule: 'ALL_REQUIRED_OPEN'` — a date only counts as a true Business Day once BOTH sides are open, exactly matching the two-calendar principle. `role` is audit-only per the Standing OAS (`CalendarRole` enum: `PAYING_BANK`/`CURRENCY_CLEARING`/`CORRESPONDENT_BANK`/`ISSUING_BANK`/`CONFIRMING_BANK`/`OTHER` — "does not affect the calculation, but is echoed back for audit-trail attribution") — `ISSUING_BANK` is used uniformly for the TW leg even though this preset list is shared by both Import A1 and Export B1, a deliberate simplification since it never drives the actual date math. The bare `TW` profile stays single-calendar (the counterparty bank IS the domestic one — nothing further to check). `USD_FEDWIRE` keeps reproducing the Standing design doc's own canonical Dec-25 worked example, now with TW as its domestic leg instead of the synthetic always-open `DEMOBANKXXX` institution calendar (TW carries no December holiday in `standing-mock/data/calendars.json`, so `adjustedDate: 2026-12-28` is unchanged) — `DEMOBANKXXX` itself is untouched in the mock's own test data, just no longer referenced by this Angular preset list.

## Clearing Bank Calendar Profile — renamed from "Maturity Date Calendar Profile", widened to apply regardless of tenor (SIGHT included)

Business instruction (2026-08-23): "SIGHT也要有這欄位 因為也要跟收款行清算收錢與付錢" — a Sight LC still settles through a paying/collecting bank, so the calendar-profile capture is not a Usance-only concern. `maturityDateProfile` (A1/B1 input, doubles as A2/B2's `AMEND_MATURITY_CALENDARS` input) is now **unconditionally required** at A1/B1 regardless of `tenorType` — `builder-fields.ts`'s reactive `expressions` block (Usance-only required-ness) was removed entirely in favor of a static `required: true`; the client-side backstop in `submit-rules.ts`'s `validateSubmit()` was widened the same way (one unconditional check, dropped the `tenorType` branch). The read-only reference (`maturityDateCalendarsReference`, A3/A3S/B3) is likewise shown unconditionally now (`hide: !isDocumentPresentationFunction`, no more tenor gating) — same convention `originalExpiryDateReference` already uses. Server-side: `balanceService.ts`'s `AMEND_MATURITY_CALENDARS`-vs-`SIGHT` hard rejection (`RequestValidationError` at `createMovement()`) was removed outright — A2/B2 can now amend this config on a Sight-tenor contract too.

Every user-facing label was renamed from "Maturity Date Calendar Profile" to **"Clearing Bank Calendar Profile"** (A1/B1 field, A2/B2's "New..." variant, A3/A3S/B3's "...(reference only)" variant, the A2/B2 subChoice dropdown option "Update Maturity Date Calendars" → "Update Clearing Bank Calendars", and all associated validation-error text) — user-directed, since the field's scope is no longer Maturity-Date-specific. The blank placeholder option changed from `'— none (Sight) —'` to `'— select —'` (no longer a valid Sight default, since the field is now mandatory for every tenor). Internal identifiers (`maturityDateProfile` model key, `maturityDateCalendars`/`maturityDateCombinationRule`/`maturityDateConvention` wire fields, `AMEND_MATURITY_CALENDARS` movementType, DB columns) were deliberately left unrenamed — user asked for the label change only, and renaming the wire contract/DB schema/movementType enum would be a much larger, unrequested blast radius across both this project and the microservice.

**Scope note — what actually changes for Sight vs. Usance**: A6/B4's own Standing-backed Maturity Date *calculation* stays Usance-only and unaffected — `isMaturityDateFunction` in `builder-fields.ts` (gates A6/B4 unrelated to this field) and the `isAcceptanceCreate` gate in `routes/balanceMovements.ts` (only Acceptance CREATE ever calls Standing) were not touched, and Sight never reaches either path (A4/A7 settle a Sight presentation directly, no Acceptance is ever created). Today, Sight's own Clearing Bank Calendar Profile is captured onto the contract but drives no calculation at all — A4/A7 have no Standing integration yet, so this is purely forward data capture pending a future feature.

**Business rule for that future Sight-settlement integration (recorded now, not yet implemented)**: user clarified the real settlement architecture — 本國銀行完成付款交易 → 產生 Nostro 帳務 → 發送 SWIFT 付款指示 → Nostro Reconciliation 以 24×7 流程持續核對. Because Nostro reconciliation with the correspondent/paying bank runs as a continuous back-office process independent of the moment of booking, a Sight transaction's own pre-transaction business control should **only check whether the domestic (TW/ISSUING_BANK) operating bank is open** — it must NOT be blocked by the foreign paying/collecting bank's own holiday. This is the opposite of A6/B4's own Usance Maturity Date rule (`ALL_REQUIRED_OPEN` across both legs, since that genuinely needs both banks able to act on the due date) — when A4/A7 eventually calls Standing for Sight, it must evaluate only the ISSUING_BANK-role calendar, never `ALL_REQUIRED_OPEN` across the full profile.

Full suite re-verified green after this change: microservice 484/484 (99.06%/95.49%/99.57%/99.35%), Angular 1149/1149 (98.82%/96.82%/97%/99.09%), both typechecks clean. Live-verified end-to-end: A1 Sight submission with the `maturityDateProfile` field blank was correctly blocked (Submit disabled, zero network request); picking the `TW` (domestic-only) profile and resubmitting succeeded (`POST /balance-movements` → 201), the new Sight-tenor LC visible immediately in both the Checker queue and Look Up Current Balance.

## Business Case Registry grew from 23 to 25 — `import-case-13`/`export-case-12`, the Clearing Bank Calendar Profile feature's own first Business Case Runner coverage

Business-directed (2026-08-23): the Business Case Registry's own scenarios predate this session's newest features and exercised none of them (`documentPresentationDate` and the whole Clearing Bank Calendar Profile / live Standing calculation had zero coverage) — extended the registry rather than removing the Business Case Runner outright, matching this file's own established precedent (`Balance-Component-Test-Case-Proposal.md §4` grew the registry 14→21 the same way when it went stale before). `import-case-13` (LC Issue Buyer's Usance 90 days with a TW+JP profile → A2 amends it to TW+USD_FEDWIRE → Document Arrival with `documentPresentationDate` → A6 Acceptance CREATE with **no caller-supplied `maturityDate`**, inherited calendar config + live `POST /business-days/adjust` call to the real `standing-mock`) and `export-case-12` (the B-series analog: Confirm LC Sellers Usance 60 days with TW+GB → B2 amends to TW-domestic-only → Present Docs → B4 Accept, same no-caller-supplied-`maturityDate` shape on the linked Acceptance-Liability leg) — both live-verified end-to-end against the running dev stack (not just unit-tested): the resulting Acceptance/Acceptance-Liability contract's own `maturityDate` field came back correctly Standing-calculated (`2026-11-23` for the 90-day TW+USD_FEDWIRE case, `2026-10-22` for the 60-day TW-domestic-only case), zero unexpected step failures in either trace.

**Finding, not fixed (pre-existing, out of scope for this pass)**: `BalanceMovement.maturityDate` (`types.ts`) is a declared TypeScript field with no backing `balance_movements` DB column and no write site anywhere in `balanceService.ts` — genuinely dead on the wire. The live-calculated Maturity Date lands ONLY on the created Acceptance/Acceptance-Liability **contract's** own `maturityDate` column (confirmed via direct `GET /balance-contracts?...` query), never echoed on the `createMovement`/`release` response the Business Case Runner's own trace displays — traced live while debugging why the new cases' own trace showed no value, no actual regression found, so both cases' own `note` steps were corrected to point at the contract query / Inquire Events screen instead of the (non-existent) response field. Fixing the dead field itself (or extending it onto the movement row) was not attempted — unrelated to and out of scope for this business-case-refresh pass.

## Tenor Basis / Risk Containment Gate — replaces the unsafe "today as Base Date" A6/B4 auto-calc, full-stack (`Maturity-Date-Tenor-Basis-Decision-Review.md` v29→v33, business-confirmed subset only)

Implements exactly the "已核定" (business-confirmed) items from the decision-review doc — every "待業務確認"/"視範圍" item (`sightDate` definition, Mode A vs B, DP/DA routing, Import A6 accounting classification, Calendar Snapshot retention, the §4.4 Base Date Correction mechanism, and the whole `Maturity-Date-UI-Display-Override-Decision-Request.md` override/manual-edit question set) stays deliberately unimplemented pending real TF Business/Ops sign-off — see that doc's own v32/v33 note that "業務已核定" here means the user acting in a BA/business role during document drafting, not the still-blank formal sign-off record.

**Microservice**: `types.ts` gained `TenorBasis` (`AFTER_SIGHT`/`AFTER_BL_DATE`/`AFTER_INVOICE_DATE`/`AFTER_SHIPMENT_DATE`/`AFTER_ACCEPTANCE`/`FIXED_MATURITY_DATE`) and `MaturityDateStatus` (`PENDING_BASE_DATE`→`PENDING_APPROVAL`→`APPROVED`, only `APPROVED` may be referenced by Settlement/reports) plus 7 new `BalanceContract` columns (`tenorBasis`, `fixedMaturityDate`, `contractualMaturityDate`, `operationalPaymentDate`, `standingCalculationId`, `calendarSnapshotId`, `maturityDateStatus` — migration 20). `domain/tenorBasis.ts` (`validateTenorBasisTypeCombination()` — SIGHT must carry no tenorBasis, Usance requires one, `AFTER_SIGHT`+`SELLERS_USANCE` forbidden; `resolveExportSettlementRoute()` — B4's own HONOUR-vs-ACCEPT routing, DP/DA and unrecognized bases fail closed to `MANUAL_REVIEW_REQUIRED`, never silently default to ACCEPTANCE) — both soft-rolled-out in `balanceService.ts` (only fire when the caller actually supplies `tenorBasis`, so the large pre-existing Usance test/business-case corpus is unaffected). `routes/balanceMovements.ts`'s old "Base Date = today regardless of tenorBasis" auto-calc (confirmed-unsafe — silently wrong for every basis except a same-day coincidence) replaced with a fail-closed Risk Containment Gate: a caller-supplied `maturityDate` is rejected outright; `tenorBasis === 'FIXED_MATURITY_DATE'` is the only basis that actually computes (`fixedMaturityDate` as `sourceDate`, live `POST /business-days/adjust` to Standing); every other basis (including no `tenorBasis` at all) safely lands the new Acceptance at `maturityDateStatus: 'PENDING_BASE_DATE'` rather than a wrong date. `release()` flips `PENDING_APPROVAL`→`APPROVED` on a released Acceptance CREATE. New `assertAcceptanceSettlementAllowed()` (A7/`PARTIAL_SETTLE`/`FULL_SETTLE` and Export's own B5-到期結算 branch) requires both `confirmedBalance>0 && maturityDateStatus==='APPROVED'` AND the Acceptance's own CREATE's `referencedTransactionId` to resolve to a RELEASED source movement matching currency+root contract+a strict movementType whitelist — falls through to the pre-existing `outstandingCapped`/`availableBalance` check (never `confirmedBalance`, avoiding the 2026-08-15 double-settlement bug). Suite: 517/517, 98.86%/95.8%/99.58%/99.1%.

**Angular** (`src/app/transaction-builder/`): A1/B1 gained `tenorBasis` (select, `TENOR_BASIS_OPTIONS`) and `fixedMaturityDate` (date) fields, reactive to Tenor Type exactly like the existing `tenorDays` Sight/Usance pattern (`builder-fields.ts`) — disabled+blanked for Sight, required for Usance, `fixedMaturityDate` required only when `tenorBasis === 'FIXED_MATURITY_DATE'`; the label itself warns ("⚠ only Fixed Maturity Date is calculated today...") when a non-working basis is picked, since the other 5 bases have no Base Date source field anywhere yet and would leave the Acceptance at `PENDING_BASE_DATE` indefinitely — a disclosed, deliberate trade-off, not a bug. `submit-rules.ts` mirrors `validateTenorBasisTypeCombination()` client-side (same "UI-only requirement, microservice stays soft/permissive" convention `maturityDateProfile` already established). New read-only `maturityDateStatusReference`/`contractualMaturityDateReference`/`operationalPaymentDateReference` fields (`isAcceptanceContractSelected` gate in `builder-fields.ts`, values from the new shared `acceptanceMaturityReferenceFields()` in `balance-component.model.ts`) surface automatically wherever `selectedContract` resolves to an Acceptance — A7/B5's own live entry screen (Maker sees the picked Acceptance's Maturity Date status before attempting Settlement) and Inquire Events' reconstruction of any A6/B4-CREATE or A7/B5 event (`inquire-events.service.ts`'s `selectEvent()`), with zero new display surface built — reuses the existing `buildFields()`/`toReadOnlyFields()` mechanism rather than a bespoke panel. Suite: 1186/1186, 98.83%/96.99%/97.05%/99.1%.

Live-verified end-to-end via browser (not just unit tests): A1 Buyer's/Seller's Usance ISSUE with `tenorBasis: FIXED_MATURITY_DATE` + a `fixedMaturityDate` → A3 Document Arrival → A6 Acceptance CREATE with no caller-supplied `maturityDate` (live Standing call, no error) → Checker Release (`maturityDateStatus` flips to `APPROVED`) → A7's own live entry screen correctly showed `Approved` / the exact `fixedMaturityDate` / the Standing-adjusted `operationalPaymentDate` for the picked Acceptance → Inquire Events' reconstruction of the A1 event correctly showed the persisted `tenorBasis`/`fixedMaturityDate`. Also confirmed live that the earlier 429s seen while replaying all 25 Business Case Runner cases back-to-back were purely a rate-limiter artifact of the zero-delay test loop (BAL-118's own 120 req/60s cap on `/balance-movements`), not a regression — every case (including the two Clearing-Bank-Calendar-Profile cases) passes once paced, and `import-case-13`/`export-case-12`'s own Acceptance contracts show correctly Standing-calculated dates.

`backend/test/businessCases.test.js` (`EXPECTED_IDS`, registry-length assertion 23→25, two new title assertions) and `backend/test/server.test.js` (`GET /api/business-cases` length assertion 23→25) updated to match; full backend suite re-verified green (46/46). Per explicit user request, `microservices/balance-component/balance-component.sqlite` (+ WAL/SHM) was cleared and the microservice restarted with a fresh schema before and after this work, so the shipped dev DB carries none of this session's manual/live-verification test data — gitignored local runtime state, not a schema or data-model change.

## Natural-Expiry batch-trigger operational follow-ups (GAP-15's own operational layer) — business/BA confirmed, **not yet implemented**

Business/BA reviewed and confirmed (2026-08-24) the engineering requirements for the GAP-15 natural-expiry
batch trigger (grace-period calculation, technical-retry-vs-409 handling, `triggeredByExpiry` audit usage —
full spec in `Natural-Expiry-Batch-Trigger-Engineering-Requirements.md`, decision request in
`Natural-Expiry-Batch-Trigger-Operational-Decision-Request.md`). All of it is external-batch-system-side
configuration except one item that lands in this microservice: **Maker ≠ Checker is confirmed as a
system-wide requirement, not scoped to the natural-expiry batch trigger** — an earlier decision-request
draft had suggested scoping it narrower (batch-only); business explicitly withdrew that framing. Both
`release()` and `reject()` need the new backend check (`if (createdBy === releasedBy/rejectedBy) throw
...`) — business confirmed (2026-08-24) `reject()` is in scope too ("`reject()` 是 Checker 的事，所以套用
Maker≠Checker"): `release()` and `reject()` are both a Checker acting on a Maker-submitted movement, same
Checker role, same rule. Currently `createdBy`/`releasedBy` (and `reject()`'s own equivalent) are
unvalidated free strings, same-person Maker/Checker is possible and not rejected anywhere on either path.

**Nothing has been coded yet** — two things to check/do in the same pass whoever implements this:
1. `domain/statusTransition.ts`'s own doc comment ("Maker and Checker being the same person is NOT enforced
   here...a bank's own role/entitlement policy, out of scope for this service's own state machine") will be
   **factually wrong** once this lands — update it in the same change, don't leave it describing the old
   unenforced behavior.
2. Run `import_lc_test.sh`/`export_lc_test.sh` after implementing — existing fixtures may reuse the same
   account as both Maker and Checker on either the `release()` or `reject()` path, which would start failing
   once the check lands; business flagged this as a probable test-data update, not just a code change.

Also flagged as engineering technical debt in the same review (unrelated to the Maker≠Checker decision):
`balanceService.ts`'s own `triggeredByExpiry` doc comment cites a `ReleaseMovementRequest` type that does
not exist anywhere in `types.ts` — `release()` only ever took `(movementId, releasedBy: string)` — fix the
comment, no behavior change needed.

## Maturity Date / Operational Payment Date override — business confirmed **no override mechanism at all**, questions 2-5 of the UI-Override decision request closed

Business replied (2026-08-24) to `Maturity-Date-UI-Display-Override-Decision-Request.md`'s still-open
questions 2-5 (Operational Payment Date override: allowed?, permission model, reason-code requirement,
timing) with a single ruling that closes all four at once, **not** by picking (a)/(b)/(c) on each: neither
Contractual Maturity Date nor Operational Payment Date may ever be directly overwritten. The only path to a
different date is correcting the underlying source — Base Date (needs a reason + audit trail, Maker/Checker
approval) or `fixedMaturityDate` (same, since it's itself the contract-specified date, corrected via formal
Amendment/Contractual Date Correction per question 1's own already-settled rule, not a new mechanism) —
which triggers the full recompute chain: source correction → recompute Contractual Maturity Date → call
Standing → recompute Operational Payment Date → Maker Submit → Checker Approve → new date takes effect.
This supersedes question 2's own "(a) allow but controlled" suggested-default direction.

**Practical effect — nothing to build**: the `MaturityDateOverride` entity, `overrideOperationalPaymentDate`/
`effectiveOperationalPaymentDate` fields, and any reason-code enum design proposed in that decision request
are now moot — Operational Payment Date only ever needs `calculatedOperationalPaymentDate` (Standing's own
output, never overwritten), which becomes the downstream-referenced value directly once
`maturityDateStatus === 'APPROVED'`. Question 1 (Contractual Maturity Date can't be overwritten — correct
the Base Date instead) was already settled this way in an earlier round; this decision extends the identical
principle to Operational Payment Date and formally retires the whole "independent override" design the
document had been carrying since v2. Full record and the business reply's own table/flow diagram: see the
decision request document itself (now closed) and `Maturity-Date-A6-Review.md`'s forward-pointing note under
its round-16 "問題四" entry. Nothing implemented yet — Angular UI wiring for A6/B4 read-only display remains
a separate, not-yet-started item per the existing decision log entries above, now simplified since there is
no override UI to build alongside it.
