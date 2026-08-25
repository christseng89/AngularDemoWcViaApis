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
`import-case-10`'s own real `/maker-submit` — see `analysis/Balance-Component-A10-B6-Close-Verification-
Summary-zh-2026-08-25.md` §1 (this Chinese-language file merges what was originally 4 separate
2026-08-21/22 dated verification reports, per user instruction 2026-08-25) for the full trace-by-trace
result (7/7 pass, both negative cases fail exactly as designed). Action items
2/3 from the Business Rule Decisions memo (backend `businessEventId` enforcement, `BUYERS_USANCE`
rejection/normalization) remain deliberately out of scope for this pass, by explicit user direction.

## `CurrencyMismatchError` — currency consistency enforced server-side, narrower than the reverted OAS-GAP-16 design

Found during a post-revert OAS-vs-code audit (2026-08-24, after `lc-balance/` was reverted to this file's
own `LC-Balance-Component-Completed`/block-1 state — see `TODO.md`'s own revert record): the OAS's
CURRENCY DERIVATION description had been carried since v1.0.0 claiming the server derives/validates
`currency`, but `balanceService.ts` had zero such logic and `requestSchema.ts` kept `currency`
unconditionally required — a caller could submit a movement with a `currency` that disagreed with its own
contract's stored value and the server would silently record it on that movement, no rejection, no
inconsistency detected anywhere. This is the same failure shape the OAS's own CURRENCY DERIVATION note
already named (documented in detail, unreachable in practice) — a currency-optional/auto-derive version of
this had in fact already been implemented once (`ca8472e`, OAS-GAP-16) but was reverted along with ~60
unrelated commits in the 2026-08-24 revert.

**User-confirmed scope, narrower than `ca8472e`**: `currency` stays a REQUIRED request field (unlike
`ca8472e`'s "omit it and the server derives it" design) — only the missing consistency check is added.
`resolveOrCreateContract()` gains two guards: (1) when the request resolves to an EXISTING contract
(`balanceContractId` or `naturalKey` match), a supplied `currency` that disagrees with `contract.currency`
throws the new `CurrencyMismatchError` (409 `CURRENCY_MISMATCH`); (2) when creating a new CHILD contract
under a `parentLogicalContractId`, a supplied `currency` that disagrees with the parent's own currency
throws the same error. A genuinely root new Logical Contract (no existing resolution, no parent) is
unaffected — nothing to validate against, `currency` becomes that contract's own authoritative value same
as before. `errors.ts` gains `CurrencyMismatchError` (409, `CURRENCY_MISMATCH` — already present in the
OAS's `Error.code` enum, so no enum change needed there); `app.ts`'s existing generic `instanceof ApiError`
handler picks it up automatically, no route-level wiring needed.

OAS re-grounded to match this narrower scope rather than restoring the old aspirational text: the
top-level description renamed CURRENCY DERIVATION → **CURRENCY CONSISTENCY**, `currency` added back to
`BalanceMovementCreateRequest.required` (was absent, matching the old "omit it" design), the field's own
`nullable: true` removed, and every "derives/omits" phrasing across the file (top-level description,
`BalanceMovementCreateRequest.currency`/`parentLogicalContractId` descriptions, `BalanceContract.currency`,
`BalanceMovement.currency`) reworded to "validates a caller-supplied value" — plus an explicit dated note
recording that the broader optional/derive design was proposed once and reverted, so a future reader
doesn't rediscover the same history by re-reading `ca8472e`.

4 new unit tests in `balanceService.test.ts` (existing-contract mismatch/match, new-child-contract
mismatch/match against the parent). Full suite re-run and green: microservice 429/429 (99.23%/96.68%/
100%/99.49% coverage), Angular 1064/1064, `backend/` 34/34 — no client-side change needed since the
reference Angular app already always supplies a currency matching its own contract.

## B3/A6/A7/A8/A9/B4/B5's independent Checker candidate search listed already-earmarked (RELEASED) candidates alongside genuinely actionable ones

Business-reported gap 2026-08-24 ("B3、A3、A3S 單獨使用 checker 已經earmarked 的交易 不應該再被選出" —
live-reproduced with S01/EB01/EB02 before fixing): `checker-panel.component.ts`'s
`searchCheckerCandidatesByLcOnly()` — the "LC typed, SG/IB Number left blank" ambiguous-pick path any
function with a `checkerSecondaryField` reaches (A6/A7/A8/A9/B3/B4/B5; A3/A3S never reach it, their own
natural key is LC Number alone) — only ever checked `catalog()`'s own `status: 'ACTIVE'` (a CONTRACT-level
field), never whether the candidate had anything genuinely PENDING for this Checker. A B3 presentation
already Checker-Released (RELEASED, i.e. already earmarked) still surfaced in the "pick one" list exactly
like a still-PENDING one — selecting it led into an empty Checker Queue, a dead end, live-confirmed with
S01's own EB01/EB02 (both RELEASED) both listed.

Fixed by extracting `loadCheckerQueue()`'s own inline EARMARKING/EARMARKED filter logic into a shared
`isCheckerActionable(movement, selectedFunction)` predicate (nullable `selectedFunction`, matching the
original inline guards exactly) — `searchCheckerCandidatesByLcOnly()` now fetches each candidate's own
movements and keeps only those with at least one actionable item, via the SAME predicate `loadCheckerQueue()`
itself uses, so the candidate list and the queue it leads into can never disagree about what counts as
actionable. A `listMovements()` failure for one candidate is treated as "not actionable" rather than
failing the whole search (`catchError(() => of(null))`). 4 new tests (candidate excluded, every candidate
excluded gets the same "no actionable record" message as zero candidates — not a misleading pick-one list,
a `listMovements()` failure isolated to one candidate). Full suite green: Angular 1067/1067, `ng build
--configuration production` clean (only the two pre-existing SCSS budget warnings, unrelated). Live-verified
in-browser: S01 B3 search now correctly reports "No IB Number record with an actionable PENDING item found
under this LC." instead of listing EB01/EB02.

## `MakerCheckerConflictError` — genuine 4-eyes Maker/Checker separation now enforced, business-confirmed 2026-08-24

Supersedes `domain/statusTransition.ts`'s own original 2026-08-14 posture ("Maker and Checker being the
same person is NOT enforced here — a bank's own role/entitlement policy, out of scope for this service's
own state machine"). User-confirmed reversal: the same user who created a movement (`createdBy`) can no
longer also Release, Reject, or acknowledge (A3/A3S's own Checker step) it.

Checked out via a new exported `assertMakerCheckerSeparation(createdBy, actingUser, action)` in
`domain/statusTransition.ts` — `applyStatusTransition()` calls it for RELEASE/REJECT only (CANCEL/EDIT
untouched: CANCEL is a Maker's own Error Correction on their OWN still-PENDING entry, where
`createdBy === actingUser` is the expected, correct case, not a conflict); `acknowledgeArrival()` in
`service/balanceService.ts` calls the same exported function directly, since it deliberately bypasses
`applyStatusTransition()` entirely (never touches `status`). New `MakerCheckerConflictError` (409
`MAKER_CHECKER_CONFLICT`), picked up automatically by `app.ts`'s existing generic `instanceof ApiError`
handler. Checked BEFORE the legal-transition check, so a same-user attempt on an already-RELEASED movement
still reports the conflict, not a misleading illegal-transition error.

Confirmed non-breaking against `backend/data/businessCases.js`'s own orchestrated Business Case Registry
before shipping — `MAKER`/`CHECKER` constants (`'maker1'`/`'checker1'`) are distinct everywhere `createdBy`/
`releasedBy` are set, so this genuinely never fires for any registered case. OAS bumped to v1.17.0, `Error.code`
enum and description both updated (see the CURRENCY CONSISTENCY entry above for that same release's other
change). 6 new tests (2 in `statusTransition.test.ts` for `applyStatusTransition()` itself, 2 for the
standalone `assertMakerCheckerSeparation()` export, 3 HTTP-integration in `app.test.ts` covering release/
reject/acknowledge each independently) — full suite green: microservice 437/437, Angular 1067/1067,
`backend/` 34/34, no client-side change needed (the reference Angular app already always uses distinct
maker1/checker1 actors).

## Business Case Runner (23-case registry) inventoried against the current feature set — found in good shape, not stale

Business-reported concern 2026-08-24 ("Business Case Runner 這功能早就不符合現在的設計") — a case-by-case
audit (tenorType declaration, A4 Sight maker-submit gate, CLOSE, Partial Redeem, other drift vs. the
chronological OAS changelog) found **0 of 23 cases genuinely stale** (would be rejected or behave
differently against the current microservice), 21 current, and only 2 (`import-case-4`, `import-case-6`)
with a real but already-disclosed-as-correct drift: both exercise SHGT `PARTIAL_REDEEM`, which the
microservice API still fully supports but the Angular A9 screen no longer lets a human trigger (locked
Full-Redeem-only, 2026-08-21). `import_lc_test.sh` (the standalone curl script transcribing the SAME S01
live-data sequence directly against the microservice) has the identical status. Annotated all three call
sites (both `businessCases.js` functions' own top comments, `import_lc_test.sh`'s own file header) so this
reads as disclosed API-vs-UI scope, not a bug — `export_lc_test.sh` confirmed clean (0 `PARTIAL_REDEEM`
occurrences, Export has no SHGT at all). Recommendation given and accepted: do NOT remove or redesign the
registry — continue the 2026-08-21 test-case-proposal-driven incremental-addition convention if/when new
scenarios are needed, since a from-scratch rewrite would trade away a working, well-maintained integration
test surface (`backend/test/businessCases.test.js`/`server.test.js`, 34 tests, 100% coverage) for no
demonstrated benefit. Also synced `businessCases.js`'s own top-of-file doc comment off the 2026-08-14
"Maker=Checker out of scope" posture the entry above superseded — `createdBy`/`releasedBy` were already
genuinely distinct throughout (`MAKER`='maker1'/`CHECKER`='checker1'), the comment just hadn't caught up.

## Maker-side "existing contract" picker (A7/A9/B5) — index pickers reordered ahead of the free-text search fallback

Business-reported UX gap 2026-08-24 ("順序應該是 index LC NUMBER, index 2ndary reference, THEN the related
transaction LC Number and 2ndary reference") — `maker-panel.component.html`'s shared `usesTwoFieldSearch`
block (every non-creating function whose instrumentType needs an ibNumber/sgNumber natural-key field: A7
IPLC_ACCEPTANCE, A9 SHGT, B5 EPLC_ACCEPTANCE) rendered the free-text "Search Existing Contract — LC Number
+ IB/SG Number" fallback BEFORE the "2ndary Index"/"EB Index" picker below it — contradicting that very
picker's own 2026-08-14 doc comment ("Step 1 / LC Index... Step 2... pick the specific IB/SG Number here
instead of typing it... the free-text fields above remain as a manual fallback") and this project's own
established "index pickers first, free text is the fallback" convention every other picker on this screen
already follows. Live-reproduced with A9/U01/G01 before fixing (browser extension available at the time).
Fixed by moving BOTH the shared 2ndary Index block AND B5's own separate `usesSettleableBalanceIndex`-gated
"EB Index" variant to render before the free-text label/grid/button/hints — pure DOM-order change, neither
block's own `*ngIf` condition touched. A2/A3/A3S/A4/A10/B2/B6 (IPLC_LC/EPLC_CONFIRMATION, no secondary
natural-key field) and A6/A8/B3/B4 (creating, or the `settlesDocumentArrival` payable-movement picker
already correctly ordered inside the `hasParent` block) confirmed unaffected — different template branches
entirely. Angular 1067/1067, `ng build --configuration production` clean.

## A7 (Acceptance Settlement) — LC Index now gated on outstanding Acceptance Balance, not just Usance tenor

Business-reported UX gap 2026-08-25 ("A07 交易選擇是 LC number 有Acceptance balance 再顯示2ndary ref"). A7's
own Parent LC ("LC Index", Step 1) picker used `catalogTenorFilter: 'USANCE'` as its ONLY eligibility
signal (`resolveParentEligibilityRule()`'s `unconditional` branch) — every Usance LC was offered
regardless of whether it actually had an outstanding IPLC_ACCEPTANCE to settle; only after picking one did
Step 2 (IB Index) reveal "0 candidates" via its own already-correct 0-balance filter. Live-reproduced via
`GET .../balance-contracts/close-eligible`-adjacent inspection of the running dev DB (U01 has a child SG
still outstanding but its own Acceptance CREATE is still PENDING — 0 eligible; U02's own Acceptance is
RELEASED with Confirmed Balance 2,000, i.e. genuinely settleable — both cases the old unconditional LC
Index would have shown identically). Fixed the same way A3S/A9's own SG-balance gate already works: added
`requiresEligibleParentAcceptance: true` to A7's own registry entry (`balance-component.model.ts`), a new
`parentAcceptanceEligible` hint-set + `loadParentAcceptanceEligibility()` on `DocumentArrivalHintsService`
(generalized the former SG-only `loadSgBalanceEligibility()` into `loadChildBalanceEligibility()`,
parameterized by `childInstrumentType` — `'SHGT'` for A3S/A9, `'IPLC_ACCEPTANCE'` for A7), and a new
`resolveParentEligibilityRule()` branch checked BEFORE the generic `catalogTenorFilter === 'USANCE'`
unconditional fallback. B5 (also `catalogTenorFilter: 'USANCE'` on its own Parent picker) deliberately left
unaffected — not part of this report, and its own Step 2 already uses the separate
`usesSettleableBalanceIndex` flow. One pre-existing test (`filteredParentCatalog: catalogTenorFilter
USANCE (A7)...`) had used A7 to demonstrate the generic unconditional branch — reassigned to B5 (still
demonstrates the same generic fallback, unaffected by this change) rather than deleted, plus a new A7-
specific hintSet test alongside it. Angular 1072/1072, `tsc --noEmit` clean, `ng build --configuration
production` clean.

## `maker-panel.component.scss` — 473 lines of dead CSS removed, clears the 8kB `anyComponentStyle` warning

TODO.md-tracked known gap, root-caused and fixed 2026-08-24. The file's own top comment already disclosed
the cause: it was copied WHOLE from `transaction-builder.component.scss` during a past extraction ("a
hand-picked subset risked silently missing a rule under time pressure — copied whole instead") — but that
copy included every shared design-system atom, not just the ones `maker-panel.component.html` actually
renders. Every top-level selector in the file was grep-checked against this component's own template (view
encapsulation guarantees zero matches = provably dead, not merely "maybe unused elsewhere") — confirmed
dead: the page shell (`.tb-page`/`.tb-header`/`.tb-title`/`.tb-subtitle`), the function-chip picker
(`.tb-function-picker`/`.tb-function-chip*`/`.tb-function-help`), the workspace grid
(`.tb-workspace`/`.tb-main`/`.tb-side`), Look Up's own tabs/Event Timeline table
(`.tb-tabs*`/`.tb-subheading`/`.tb-table*`/`.tb-type-tag`/`.tb-status-badge*`), and a handful of one-off
variants (`.tb-select--inline`, `.tb-grid-lookup`, `.tb-btn--success`/`--tiny` as nested modifiers of the
still-live `.tb-btn`, `.tb-pagination`, `.tb-checker-actions`) — all of them live in
`transaction-builder.component.html`/`checker-panel.component.html` instead, never this component's own.
`.tb-muted` (zero matches, not flagged by the initial audit) found and removed too during the actual
edit-time re-verification. Same grep-verified technique this project already used for
`.tb-quick-pick*`/`.tb-result*`/`.tb-row-sub`'s own past dead-code find in `transaction-builder.component.
scss`'s own history — each removed selector confirmed zero matches before deletion, not guessed. File
dropped from 997 to 511 lines; two now-dangling "see `.tb-function-chip` above" comment references (the
class itself removed) reworded to point at the sibling file instead. Confirmed via `ng build --configuration
production`: the `maker-panel.component.scss` budget warning is gone entirely (only the pre-existing,
unrelated `transaction-builder.component.scss` warning remains). Angular 1067/1067 green.

## A9 Full-Redeem-only now enforced server-side too — TODO.md-tracked gap closed (was UI-only)

Business-directed 2026-08-24 ("A9 Full-Redeem-only 目前只在 Angular UI 層鎖定 API MAKER & CHECKER也要") —
this is action item 2 from `Balance-Component-Business-Rule-Decisions-2026-08-21.md` (backend
`businessEventId` enforcement), previously recorded as deliberately out of scope for an earlier pass; user
now explicitly requested it. The BA-confirmed rule ("SG discharge is instrument-based, not amount-based")
was only ever enforced client-side — `submit-rules.ts` hardcodes `movementType: 'FULL_REDEEM'` and locks
Amount to the SG's own Available Balance — while the microservice's own `PARTIAL_REDEEM` and
`domain/shgtRedeem.ts`'s `checkRedeemSufficiency()` were completely unchanged, so any caller bypassing the
Angular client (curl, a future second UI, an integration test) could still Partial Redeem a standalone SG.

Fixed in `buildMovementTypeRegistry()`'s own `outstandingCapped` sufficiency check (Maker/Submit) and
mirrored in `release()` (Checker/Release, pure defense-in-depth — `businessEventId` is immutable once set,
so this can't actually fire for a movement `createMovement()` itself created, only for one that reached
PENDING some other way, same posture `assertValidAmount()`'s own doc comment already established): a SHGT
`PARTIAL_REDEEM` request with no `businessEventId` is rejected (`409 INSUFFICIENT_AVAILABLE_BALANCE`
Maker-side / `IllegalStateTransitionError` Checker-side). The distinguishing signal is deliberately
`businessEventId`, not the `PARTIAL_REDEEM`/`FULL_REDEEM` movementType string — A3S's own matched SG
redemption leg (`SG Redemption Amount = MIN(Bill Amount, SG Outstanding)`) always carries a
`businessEventId` linking it to its paired Document Arrival, but that match can legitimately equal the
SG's full outstanding balance too, so movementType alone can't tell A3S apart from a genuine standalone A9
call. A standalone `FULL_REDEEM` (no `businessEventId`) is unaffected either way — A9's own real flow.

5 new tests: 3 HTTP-integration in `app.test.ts` (Maker rejects a standalone Partial Redeem, Maker still
accepts a standalone Full Redeem, Maker still accepts a matched/businessEventId-carrying Partial Redeem)
plus 1 covering the Checker-side re-check (direct `BalanceService` instantiation + a raw SQL `UPDATE` to
strip `business_event_id`, simulating a movement that reached PENDING outside `createMovement()`'s own
guarded path — same "bypass the Maker-side gate directly" technique this codebase already uses to test
other defense-in-depth backstops). 3 pre-existing tests in `app.test.ts`'s own "SG redemption commitment
control" describe block (testing `checkRedeemSufficiency()`'s own logic via a standalone Partial Redeem,
now correctly rejected before that logic even runs) updated to carry a `businessEventId`, preserving their
original intent (the commitment-control math itself, which still applies identically to an A3S-shaped
matched call) without being blocked by the new guard. OAS bumped to v1.18.0. Full suite green: microservice
442/442, Angular 1067/1067, `backend/` 34/34 (`businessCases.js`'s own A3S-shaped Partial Redeem steps
already carry `businessEventId`, confirmed unaffected). TODO.md's own item now closed; action item 3 from
the same memo (`BUYERS_USANCE` rejection/normalization) remains the only one still out of scope.

## RESOLVED (BA-confirmed 2026-08-25, external BA review withdrew its own F2) — Acceptance/DPU's `(memo)`-suffixed Folio 3/5 pair is correct; real on-balance booking is deliberately out of this component's scope

Standing rule: treat this as settled, do not re-litigate without new information from the user — same
convention as every other "reviewer-confirmed"/"business-confirmed" entry in this log.

This one flip-flopped twice in one day before landing here, so the final, authoritative reasoning is
recorded in full to prevent re-litigating it: the external BA review originally flagged Folio 3/5's
`(memo)`-suffixed Acceptance/DPU pair as contradicting `TF_Balance_Component_Mapping-{en,zh}.xlsx`'s own
`Balance_Taxonomy` sheet, which does classify `ACCEPTANCE_DPU_OUTSTANDING` as `ON_BALANCE_LIABILITY`
("THE accounting liability — not a contingent", §3.7) — that classification is real and was correctly
found in the workbook (an EBL/IBL-scope explanation for it was tried first and did not hold: EBL/IBL are
separate rows — `IMPORT_USANCE_FINANCING`/`DUE_TO_REFINANCING_BANK`/`TRUST_RECEIPT_LOAN`). The resolution
is neither "F2 is wrong" nor "EBL/IBL explains it" — it's that the workbook's `ACCEPTANCE_DPU_OUTSTANDING`/
`RECOGNISE_ONBS` step describes a DIFFERENT component's job in the SAME transaction chain, not this one:
`analysis/contingent-liability-ledger.html`'s own Folio 3 "Classification note" states the memo pair
"never constitutes an accounting record", and this microservice's own domain model already performs the
IFRS 9 contingent→actual reclassification correctly at Accept (`exposureNature: 'ACTUAL'`, not
`CONTINGENT`) — the real on-balance liability posting and its matching receivable are, by design, this
component's caller's job via the passthrough `accountEntries` field (never `contingentAccountEntry`,
which `deriveContingentAccountEntry()` returns `null` for on every ON_BALANCE_ASSET instrumentType), the
same boundary already drawn for EBL/IBL's own booking. See
`docs/obsidian-balance-kb-v3.2/04-Exposure-Accounting/ifrs-9-contingent-to-actual-reclassification-boundary.md`,
`.../exposurenature-actual-tagging-for-acceptance-dpu.md`, and
`.../on-balance-sheet-asset-instruments-are-out-of-balance-component-s-cont.md` for the knowledge-base
notes the BA review's own withdrawal cites. No code change needed. `TODO.md`'s own F2 entry closed
accordingly (Buyer's Usance renumbered up to F2 in both files, matching the review's own post-withdrawal
renumbering).

## `BUYERS_USANCE`/`EPLC_CONFIRMATION` (action item 3) — CLOSED, no code change; Export never actually produces this input

Superseded same day: the BA review revision below first re-characterized this as a pure engineering task
(`Balance-Component-Business-Rule-Decisions-2026-08-21.md`'s Decision 2 already settled the business
question), then the user closed it outright — Export/Confirmation contracts never carry
`tenorType: 'BUYERS_USANCE'` in practice, so the input this guard would protect against cannot occur. No
`tenorRouting.ts`/`balanceService.ts`/`maker-panel.component.ts` change was made.

Recorded for if this ever changes: today `maker-panel.component.ts:733`
(`this.model.movementType = this.selectedContract.tenorType === 'SIGHT' ? 'HONOUR' : 'ACCEPT'`) would route
a `BUYERS_USANCE` Confirmation to `ACCEPT`, which is wrong per Decision 2 — the correct fix, if this input
ever becomes real, is normalizing it to `HONOUR` alongside `SIGHT` (not rejecting it).

Both `analysis/TF-Balance-Component-BA-Review-{en,zh}.docx` are now in sync (15 findings, 3 High) — the
review previously had a stray un-suffixed English duplicate with the older, unsynced content; that file no
longer exists, the `-en.docx` is the current one.

## F1 — AUTO EXPIRY + AUTO CLOSE background sweep, Expiry Extension Amendment, A11/B7 Reopen (closes TODO.md's own F1)

New `movementType`s `EXPIRE` (own eligibility, `domain/expiryEligibility.ts` — deliberately NOT
SG/Acceptance-balance-gated like CLOSE) and `AMEND_EXPIRY_DATE` (A2/B2's third subChoice option, doubles as
the EXPIRED→ACTIVE Extension entry point). Two independently-flagged background sweeps
(`AUTO_EXPIRY_ENABLED`/`AUTO_CLOSE_ENABLED`, `server.ts`'s own `setInterval`, never the `BalanceService`
constructor) drive Maker/Checker via `BATCH_MAKER`/`BATCH_CHECKER` system actors through the existing,
unmodified `createMovement()`/`release()` path — genuine 4-eyes preserved, `statusTransition.ts` untouched.
A11 (`IPLC_LC`)/B7 (`EPLC_CONFIRMATION`) Reopen — a new, separately-entitled named function (not folded
into A2/B2) — reopens a CLOSED contract, reversing every not-yet-reversed EXPIRE/CLOSE in its history (not
just the last one — a contract reaching CLOSED via EXPIRE→AUTO CLOSE has TWO to reverse, since AUTO CLOSE's
own write-off amount is already 0 by then). `REVERSAL` movementType (dynamic direction, resolved via
`reversalOfMovementId`) backs Expiry Extension Amendment's own restoration.

**REOPEN redesigned same day, after live UAT** ("Checker要看交易出的帳 再決定 APPROVE 或 REJECT" — the
original design's zero-amount REOPEN + a separately-generated, Release-time-only `REVERSAL` leg meant the
Checker approved an empty movement with no visible entries, and Inquire Events showed two rows for one
event). REOPEN now carries its own real, positive restoration amount directly — computed at Submit
(`domain/reopenRestoration.ts`: sum the contract's own trailing run of RELEASED EXPIRE/CLOSE, walking
backward until the first non-match) and never caller-typed (Angular hides Amount entirely for A11/B7); a
real `contingentAccountEntry` is generated at the same Submit call, so the Checker reviews the actual
restoration before approving. `MOVEMENT_DIRECTION.REOPEN` is `1` (not `0`); REOPEN no longer produces any
`REVERSAL` — that movementType now backs Expiry Extension Amendment only.

Deliberately not done (`TODO.md` §3, F1 §11.4): sweep round-splitting (AUTO CLOSE may re-close a contract
in the SAME cycle a human/Maker just Reopened, if SG/Acceptance are already 0 — reproduced live); consent-
gating on Extension/Reopen; mandatory `reasonCode` on CLOSE. Business Case Registry gained Import Case
13-15 and Export Case #12 exercising the full mechanism (§9.7 chain reversal, the negative eligibility
gate, and the AUTO EXPIRY→AUTO CLOSE→Reopen path), 23→27 cases.

## F1 follow-up — AUTO EXPIRY/AUTO CLOSE now skip a recently-Reopened contract for one sweep interval

Live-reported the same day: a REOPEN reactivating to `EXPIRED` (original `expiryDate` already past) got
immediately re-closed by the very next AUTO CLOSE tick, with zero window to follow up. New
`isRecentlyReopened()` (`service/balanceService.ts`) — both sweeps skip a contract whose own most recent
RELEASED movement is `REOPEN`, for one full `EXPIRY_SWEEP_INTERVAL`; time-bounded, not permanent (a
REOPEN-to-`ACTIVE` contract still auto-expires on schedule once its own still-future `expiryDate` for-real
arrives). Narrows, but does not close, the broader §8.5 round-splitting gap — a genuine `EXPIRE`-then-
same-cycle-`AUTO CLOSE` sequence (no REOPEN involved) is unaffected, still deliberately deferred.

## F1 — AMEND_EXPIRY_DATE no longer generates a contingentAccountEntry; Extension Amendment double-restoration bug fixed

Two related, same-day, user-reported fixes. (1) `AMEND_EXPIRY_DATE` never has a real balance/GL effect —
`deriveContingentAccountEntry()` now returns `null` for it explicitly (was a spurious zero-amount pair, an
artifact of the generic derivation logic, not a deliberate choice), same treatment as `EPLC_EXAMINATION`.
(2) Real bug, traced to the REOPEN redesign above: a contract reaching `EXPIRED` via A11/B7 Reopen (§9.2
Option A) restores its balance directly (no `REVERSAL` left behind) — but Extension Amendment's own
Checker-Release restoration still assumed the old "REOPEN always leaves a REVERSAL" invariant, so it found
that same already-restored `EXPIRE` and reversed it AGAIN, silently doubling the balance (live-reproduced:
10,000 → 20,000, "S01 EXTEND後 無法做後續作業"). Fixed: Extension only reverses when the contract's own
MOST RECENT movement (excluding itself) is a RELEASED `EXPIRE` — anything else (a prior REOPEN, most
commonly) means nothing is left to restore. Sound by construction: `EXPIRE` can't chain with itself, `CLOSE`
can't precede `EXPIRED`, so Extension's own relevant trailing run is always 0 or 1 movement, never a
multi-item chain the way REOPEN's own §9.7 case can be.
