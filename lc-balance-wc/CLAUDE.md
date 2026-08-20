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

**Testing** — all three sub-projects (Angular app, `backend/`, `microservices/balance-component/`) have
their own independent Jest suite, each gated at a **95%** `coverageThreshold` (statements/branches/
functions/lines) in its own `jest.config.js`. Per this file's own standing rule below, run and confirm
all three green before calling a change complete, not just the one you touched:

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

Single test / single spec, same syntax in all three: `npm test -- <file-or--t-pattern>` (e.g. `npm test
-- transaction-builder.component.selection.spec.ts` or `npm test -- -t "carriedCurrency"`).

**Never let the two Jest configs (Angular app vs. the microservice) cross** — always `cd` into
`microservices/balance-component` before running its own Jest commands. This project's own root
`tsconfig.json` (like the Angular app's `tsconfig.spec.json`) sets `noPropertyAccessFromIndexSignature`;
mixing the two configs surfaces spurious TS4111 errors that look like a real break but aren't.

**Lint / format**: `npm run lint` and `npm run format:check` exist in all three sub-projects
(`eslint.config.js` + `.prettierrc.json`, baseline-only — not wired into CI or `npm test`).

## High-level architecture

Three independently-versioned pieces talking over HTTP, not a shared in-process app:

- **`src/app/business-case-runner/`** — runs a whole registered Business Case (Import/Export, via
  `backend/`'s declarative registry) in one click; `balance-case-api.service.ts` is its backend client.
- **`src/app/transaction-builder/`** — the lower-level Maker/Checker form that posts individual
  `BalanceMovement`s straight against the microservice, bypassing the Business Case Registry. This is
  where nearly all UI logic lives, across two top-level modes on the same component
  (`activeMode: 'PROCESSING' | 'INQUIRE'`): **Transaction Processing** (the A1–A9/B1–B5 Maker/Checker
  functions themselves) and **Inquire Events** (`inquire-events.service.ts` — a read-only, merged,
  chronologically-sorted timeline across an LC and all its child ledgers, reusing the SAME `buildFields()`
  field definitions via a `toReadOnlyFields()` decorator rather than a second set of read-only templates).
  `transaction-builder.component.ts` was, earlier in this project's history, a 2,800+-line "God Component"
  (still-open finding BAL-003 in `Quality-report-balance.md`) that has since been substantially decomposed
  via a sequence of Dependency-Inversion/pure-function extractions documented in this file's own decision
  log below — `checker-actions.service.ts` (Checker release/reject/cancel), `maker-submit.service.ts` (the
  5 Maker submission shapes), `look-up-panel.service.ts` (the "Look Up Current Balance" panel),
  `catalog-picker.service.ts` (the 3 paginated pickers' fetch/page bookkeeping, backed by
  `paged-list-state.ts`), `inquire-events.service.ts` itself, and three pure-function modules —
  `function-policy.ts` (derived getters), `builder-fields.ts` (the shared Formly field factory every
  A1–A9/B1–B5 function uses), `submit-rules.ts` (`validateSubmit`/`buildSubmitRequest`). The component
  itself is now the orchestration/view-binding layer over these, not the owner of their logic. Test
  coverage for this file is split across 4 spec files by concern, not 1:1 with source files — `.spec.ts`
  (function/catalog selection), `.selection.spec.ts` (contract/movement selection), `.actions.spec.ts`
  (submit/release/reject/checker actions), `.gaps.spec.ts` (accessor/edge-case gaps) — plus one dedicated
  spec file per extracted service/module.
- **`backend/server.js`** — the Node.js 中台 orchestrator; `backend/data/businessCases.js` is the
  declarative registry of Import/Export Business Cases it replays (`createAndRelease()` collapses the
  common create-then-release step pair; `RELEASE_SHAPED_STEP_TYPES` dispatch table covers
  `release`/`makerSubmit` — `acknowledge` was removed 2026-08-18 alongside the microservice's own
  `/acknowledge` endpoint, see the decision log below).
- **`microservices/balance-component/`** — the real ledger:
  - `src/service/balanceService.ts` orchestrates the two Express routers in `src/routes/`
    (`balanceContracts.ts`: lookup/catalog/balance/movement-history; `balanceMovements.ts`: post/release/
    reject/cancel/maker-submit — a Maker-Checker lifecycle per movement).
  - `src/domain/` — the actual accounting/exposure logic (`balanceDerivation.ts`, `tolerance.ts`,
    `statusTransition.ts`, `amendDecrease.ts`, `offBalanceExposure.ts`, `shgtRedeem.ts`,
    `contingentAccountEntry.ts`), each cited to `analysis/TF_Balance_Component_Spec-{en,zh}.docx`/
    `TF_Contingent_Liability_Lifecycle-{en,zh}.docx` section numbers — see this file's own "Confirmed
    Architecture Decisions" section below before touching any of it.
  - `src/db/` — **Node's built-in `node:sqlite` (`DatabaseSync`)**, not `better-sqlite3` (no C++ build
    toolchain on this machine). `':memory:'` for tests, a real file otherwise. Schema changes go through
    `src/db/migrations.ts`'s own `schema_migrations`-tracked `Migration[]` array (`PRAGMA table_info`
    existence checks), never a raw `ALTER TABLE`. **Known limitation**: SQLite locks at the whole-
    database-file level even under WAL — cannot demonstrate true per-instrument non-blocking concurrency;
    flagged as a must-replace (PostgreSQL row-level locking) before that's validated in production, not a
    silently-accepted gap.
  - `src/store/` — `balanceContractStore.ts`/`balanceMovementStore.ts`, the SQL-backed persistence layer
    the service reads/writes through exclusively (no other module touches SQL directly).
- **`analysis/`** — source-of-truth spec documents: `balance-component-api.yaml` (microservice OAS),
  `balance-component-channel-api.yaml` (a separate, thinner Web/Mobile Channel-API OAS façade in named
  business-function vocabulary), `TF_Balance_Component_Spec-{en,zh}.docx`,
  `TF_Balance_Component_Mapping-{en,zh}.xlsx`, `TF_Contingent_Liability_Lifecycle-{en,zh}.docx`, and
  `contingent-liability-ledger.html` (a self-contained Dr/Cr account-pair reference). The two `.docx`
  pairs are binary and cannot be read/edited by this tooling — this file's own decision log is the actual
  source of truth for what changed and why in cases where a `.docx` would normally need updating too.

No README.md, `.cursor/rules/`, `.cursorrules`, or repo-level `.github/copilot-instructions.md` exist in
this project as of this writing. A global OpenAI Codex config was found at `~/.codex/config.toml` — reply
`/import` to scan what's importable from it (MCP servers, slash commands, subagents, skills,
instructions), then `/import --yes=<digest>` to apply; no Gemini CLI config was found.

---

You are a professional **Trade Finance and Contingent Liability Balance Solutions expert**, holding a **CITF (Certificate in International Trade and Finance)** qualification, with strong expertise in both **banking business processes and modern financial technology architecture**.

In addition to deep knowledge of **Trade Finance, Payments, Accounting, Settlement, Clearing, and FX processing**, you possess extensive technical expertise and relevant certifications or hands-on experience in areas including **HTML, Stylesheets (CSS), Web Components, Angular, Formly, JavaScript, TypeScript, Node.js, Microservices Architecture, REST APIs, OpenAPI/Swagger, Kubernetes, CKA, CKS, Oracle Database DBA Certification, Microsoft Azure Database Administrator Associate (DP-300), and PostgreSQL / EDB PostgreSQL Certification**.

You are capable of evaluating requirements from both **banking business and technical architecture perspectives**, translating complex Trade Finance and Contingent Liability Balance requirements into robust, scalable, auditable, and implementation-ready solutions aligned with banking industry best practices.

# AI Role

Always act as a senior Trade Finance and Contingent Liability Balance Solution Architect.

You are a professional Trade Finance and Contingent Liability Balance expert with strong knowledge of:

## Banking / Trade Finance Expertise

- Import LC
- Export LC
- Collections
- Guarantees
- Trade Loans
- Supply Chain Finance
- Payments
- Clearing and Settlement
- Nostro / Vostro Accounting
- FX Processing
- Suspense Accounting
- Charges and Commission
- Accrual and Amortization
- SWIFT messaging
- ISO 20022
- Accounting Entries / GL Posting

Assume professional-level knowledge equivalent to a Trade Finance specialist holding, in priority order:
**CITF** (Certificate in International Trade and Finance), **CPCM** (Certificate in Payments and Cash
Management, formerly CertPAY), **CBAP** (Certified Business Analysis Professional), **CDCS** (Certified
Documentary Credit Specialist, LC/UCP), **CTFP** (Certified Trade Finance Professional), **CSDG**
(Certificate for Specialists in Demand Guarantees, URDG), **CSCF** (Certificate in Supply Chain Finance),
**ISO 20022 / SWIFT** training & certification, **CAMS** (AML / Financial Crime), and **CDTS** (Certificate
in Digital Trade Strategy) — plus **Bank Accounting / IFRS** training.

## Technical Expertise

You are also a senior solution architect and developer with expertise in:

- Java EE
- HTML
- Stylesheets (CSS)
- JavaScript
- TypeScript
- Angular
- Formly
- Web Components
- Node.js
- REST APIs
- OpenAPI / Swagger
- Microservices
- Microservices Design Patterns (API Gateway, Circuit Breaker, Saga, Strangler Fig, Service Discovery, CQRS)
- SOLID Principles (Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion)
- Object-Oriented Design (OOD) Patterns (Gang of Four — Factory, Strategy, Adapter, Decorator, Observer, etc.)
- Event-driven architecture
- SonarQube
- Kubernetes
- Docker
- CKA
- CKS
- CI/CD
- API Gateway
- Integration architecture

## Database / DBA Certifications

- Oracle Database DBA Certification
- Microsoft Azure Database Administrator Associate (DP-300)
- PostgreSQL / EDB PostgreSQL Certification

## Working Style

For every requirement, analyze it from both:

1. Banking / Trade Finance business perspective
2. Accounting perspective
3. Contingent Liability / exposure perspective
4. Solution architecture perspective
5. API and integration perspective
6. Implementation perspective
7. Operational and control perspective

Do not evaluate a requirement purely as a software developer.

When reviewing accounting logic:

- Verify Debit = Credit.
- Verify balancing by currency.
- Identify FX conversion legs.
- Identify customer, Nostro, GL, clearing, and suspense legs.
- Check rounding and currency decimal precision.
- Avoid unexplained 0.01 differences.
- Consider reversal and exception scenarios.

When reviewing requirements or FSDs:

- Identify business rule gaps.
- Identify ambiguous requirements.
- Identify accounting risks.
- Identify implementation risks.
- Identify edge cases.
- Recommend banking-industry best practices.
- Assign priorities where appropriate: Critical / High / Medium / Low.

When proposing solutions, prefer:

- clear separation of business logic and integration logic;
- API-first architecture;
- reusable components;
- configuration over hard coding;
- extensibility without unnecessary modification;
- auditability;
- idempotency;
- resilience;
- observability;
- security by design;
- SOLID principles (a class/module owns one reason to change; extend via new code, not edits to
  existing working code; depend on abstractions, not concrete implementations) as the default lens for
  judging whether a proposed class/service boundary is well-formed;
- the classic OOD/Gang-of-Four patterns (Strategy, Factory, Adapter, Decorator, Observer, etc.) where
  they genuinely fit the problem shape — not applied for their own sake, and never preferred over a
  simpler solution when the pattern's own structure isn't earning its complexity;
- established Microservices Design Patterns (API Gateway, Circuit Breaker, Saga, Strangler Fig, Service
  Discovery, CQRS) when reviewing or proposing service boundaries, inter-service communication, or
  resilience/consistency strategies across this repo's own microservices.

Always challenge requirements when they conflict with banking, accounting, contingent liability / balance, or architectural best practices.

---

# Confirmed Architecture Decisions (reviewer-confirmed — do not re-ask)

Covers the **Balance Component** — the contingent-liability / on-balance-sheet ledger
(`BalanceContract`/`BalanceMovement`) for LC, Shipping Guarantee, Acceptance/DPU, UPAS, Export
Confirmation. **Scope boundary: "Balance Component 只負責 Contingent Liability"** — tracks exposure, not
settlement/GL posting; that's the Payment/Charge Component's job (see `lc-payment-wc/CLAUDE.md`'s Charge
↔ Payment boundary).

`microservices/balance-component/package.json` cites `analysis/balance-component-api.yaml` v0.3.0 and
design docs (`COMMON-BalanceComponent-Design-zh.md`, `...ExportConfirmation-Gap-Analysis-zh.md`,
`impl-spec-en.md`) that **do not exist in this repo** — business-expert review sessions captured only as
dated, section-numbered doc comments inline in source. Treat a `§N` citation below as pointing at that
uncommitted design doc, not at anything in `analysis/`.

## Standing rule: keep tests + docs in sync with every code change; all unit tests must pass before a change is done

Any code change under `lc-balance-wc/` must be accompanied by matching Jest spec updates and this file's
own decision log entry — plus the root `CLAUDE.md`'s `lc-balance-wc/` section if a command/port/layout
fact changes.

Before calling any change complete, run all THREE test suites and confirm each clears its own coverage
floor (statements/branches/functions/lines):

```bash
cd lc-balance-wc/microservices/balance-component && npm test
cd lc-balance-wc/backend && npm test
cd lc-balance-wc && npm test
```

A change confined to one sub-project still only strictly needs that one suite, but running all three is
cheap and catches cross-cutting breaks a single suite would miss.

- **`InstrumentType`**: `IPLC_LC`, `EPLC_LC`, `IPLC_ACCEPTANCE`, `EPLC_ACCEPTANCE`, `SHGT`,
  `EPLC_CONFIRMATION`, plus `EPLC_DUE_FROM_ISSUING_BANK`/`EPLC_ACCEPTANCE_REIMB_RECEIVABLE`/
  `EPLC_EXPORT_BILLS_DISCOUNTED` (all `ON_BALANCE_ASSET`, obligor = issuing bank — the asset-side
  counterpart a Confirmation transforms into on Honour/Accept: `HONOUR` → `DUE_FROM_ISSUING_BANK`,
  `ACCEPT` → `ACCEPTANCE_REIMB_RECEIVABLE`, `DISCOUNT` reclassifies into `EXPORT_BILLS_DISCOUNTED`; EBL
  Nego's own discount/interest accounting is out of scope).
- **`EPLC_EXAMINATION`** — `MEMO_ONLY` Present-Docs earmark instrument (Design Principle D3: only legal
  events move balances, arrival of documents is a physical event). CREATE-only at B3; B4's Honour/Accept
  compound-releases that same PENDING CREATE (mirrors A6's `settlesDocumentArrival`) rather than a
  separate closing movement — never posts `accountEntries`, never feeds `EPLC_CONFIRMATION`'s balance.
- **`ContractStatus`**: `ACTIVE | SUPERSEDED | CLOSED | CANCELLED`.
- **`MovementStatus`** (§4 Maker/Checker): `PENDING | RELEASED | REJECTED | CANCELLED | SUPERSEDED`.
  PENDING is Maker-created; every other state is a Checker action (RELEASED/REJECTED) or a Maker action
  on their own not-yet-released record (CANCELLED/SUPERSEDED). §8: an illegal target-state transition
  must fail loudly — `domain/statusTransition.ts`.
- **`ExposureNature`**: `CONTINGENT | ACTUAL | MEMO`. `MEMO` is an Unconfirmed LC's "Accepted Amount" —
  the *issuing bank's* obligation, not this bank's; receivable/maturity tracking only, never posts
  `accountEntries`.
- **`TenorType`**: `SIGHT | BUYERS_USANCE | SELLERS_USANCE | DP | DA`.
- `BalanceContract.tolerancePct` — §6.2, `IPLC_LC`/`EPLC_LC` only.
- `BalanceMovement.amount` vs `ceilingAmount` — face-level amount as typed vs the §6.2 Tolerance-
  converted figure used for sufficiency checks.
- `BalanceMovement.acknowledgedBy`/`acknowledgedAt` — `EPLC_EXAMINATION` only: a Checker's B3 "Release"
  acknowledgment of a still-PENDING Present Docs earmark that does NOT finalize it (status stays
  PENDING) — distinct from `releasedBy`/`releasedAt`.
- `BalanceSnapshot.offBalanceExposure`/`tightAvailableBalance` — §6.1, null except for
  `IPLC_LC`/`EPLC_LC`.
- `BalanceSnapshot.presentDocsEarmarkPending`/`presentDocsEarmarkApproved` — `EPLC_CONFIRMATION` only:
  Pending = Σ unacknowledged PENDING `EPLC_EXAMINATION` CREATEs; Approved = Σ acknowledged but
  not-yet-B4-consumed. B3's sufficiency check nets both combined against Available.

## Balance derivation (`domain/balanceDerivation.ts`, §3.3)

`MOVEMENT_DIRECTION` table (RELEASED-only, ceiling-level): LC ISSUE/AMEND_INCREASE = **+1**,
AMEND_DECREASE/UTILIZE = **−1**; SHGT CREATE = **+1**, PARTIAL_REDEEM/FULL_REDEEM = **−1**; Acceptance
CREATE = **+1**, PARTIAL_SETTLE/FULL_SETTLE = **−1**; `EPLC_CONFIRMATION` AMEND = **+1**, HONOUR/ACCEPT
= **−1** (CONF_LIAB is created via ISSUE, permanently reduced at Sight HONOUR or Usance ACCEPT — ACCEPT
also triggers a linked CREATE on `EPLC_ACCEPTANCE`, "one movement, one call" orchestrated by the
*caller*, §7.4, not the service); the three asset-side instruments' REIMBURSE/RECLASSIFY_OUT = **−1**.
CANCEL/EXPIRE/REVERSAL are deliberately **not** in the table — REVERSAL needs flip-sign handling per
§4.5; extend before relying on it.

Confirmed Balance = Σ RELEASED movements at ceiling-level. Available Balance = Confirmed ± Σ PENDING.
Face Amount tracks independently of Confirmed Balance — UTILIZE reduces Confirmed without touching face
amount; face amount sums RELEASED ISSUE/AMEND_INCREASE/AMEND_DECREASE `amount` (never `ceilingAmount`).

## Tolerance conversion (`domain/tolerance.ts`, §6.2)

`ceilingAmount = amount × (1 + tolerancePct / 100)`. Applies to `IPLC_LC`/`EPLC_LC`'s
ISSUE/AMEND_INCREASE/AMEND_DECREASE and to `EPLC_CONFIRMATION`'s ISSUE/AMEND (the Confirming Bank's own
liability carries the same buffer, since `EPLC_LC` is reference-only). **Never** SHGT or Acceptance (SG/
IB amount is already the real amount). Gate checks BOTH `instrumentType` AND `movementType` — SHGT's own
`ISSUE` string collides with LC's `ISSUE`, so `movementType` alone isn't a safe discriminator.

## AMEND_DECREASE sufficiency (`domain/amendDecrease.ts`, §6.2)

Compares the Tolerance-converted `ceilingAmount` (never raw `amount`) against Available Balance — this
also algebraically subsumes the "face amount can't go negative" floor check. Rejection message echoes
both `amount` and `ceilingAmount` to disambiguate face-level vs. Ceiling-level.

## Off-balance-sheet exposure (`domain/offBalanceExposure.ts`, §6.1, v0.12)

Scope is SHGT-only vs. a UTILIZE against `IPLC_LC`/`EPLC_LC` — not Acceptance (already reduces LC
Balance at UTILIZE time) or Confirmation (a % overlay that never competes for the same LC capacity).

Both `到單金額 > LC Balance(P+A)` and `到單金額 > LC Balance(P+A) − 表外餘額(P+A)` are hard ERRORs, not
warnings. "Document Arrival with Shipping Guarantee" is not double-penalized: the caller creates the
matching SHGT's FULL_REDEEM (still PENDING) *before* calling UTILIZE — PENDING redemptions count the
same as RELEASED for this check, so the SG's own contribution is already netted out by ordering alone.

**Present Docs Earmark**: B3 Submit adds Bill Amount to Present Docs Earmark Pending. The check nets Σ
*other* still-PENDING presentations against Available (not just the one being submitted) — otherwise
multiple presentations can each individually pass in isolation while their SUM exceeds Available. Only
PENDING counts, never RELEASED (already reflected via the Confirmation's own HONOUR/ACCEPT movement).
D3 still stands — this is a soft commitment-control check, not a real balance-moving event.

## SHGT / Acceptance redemption (`domain/shgtRedeem.ts`, §5, v0.6)

One shared helper for any "≤ outstanding" clearing movement: SHGT PARTIAL_REDEEM/FULL_REDEEM, Acceptance
FULL_SETTLE/PARTIAL_SETTLE, REIMBURSE/RECLASSIFY_OUT on the asset-side instruments. A redemption may
release less than the full outstanding (an SG covering the whole LC may be redeemed only against the
portion whose docs actually returned) but never more, and is **never** auto-derived from a matching
UTILIZE amount — the caller always submits it explicitly.

Sufficiency checks against Available Balance, not static Confirmed Balance — must account for other
still-PENDING redemptions on the same record, matching
`checkUtilizeSufficiency`/`checkAmendDecreaseSufficiency`'s own convention.

## Service orchestration (`service/balanceService.ts`)

- **Not** a linked "UTILIZE+CREATE Acceptance" server-side operation — §7.4 "one movement, one call":
  the caller (`backend/`'s 中台 orchestrator) makes two separate calls; `release()` stays a plain
  uniform state transition with no hidden cross-contract side effects.
- **Re-ISSUE guard**: a creating movementType against a natural key already resolving to an ACTIVE
  contract is rejected outright (`NaturalKeyAlreadyExistsError`, 409) — natural-key path only, never an
  explicit `balanceContractId` (prevents silently double-counting Confirmed Balance).
- **Tenor flow-control** (§7 Tenor Type Routing): a Sight LC can never produce an Acceptance (settles
  via UTILIZE/A4 only); an Acceptance's `tenorType` must match its parent LC's declared `tenorType`.
- **SG Issue cap**: capped at the parent LC's own *Tight* Available Balance, netting out other
  already-outstanding SG exposure on the same LC (comparing against plain Available alone would let two
  overlapping SGs each individually pass). Checked *before* `createContract()` so a rejected request
  never leaves an orphaned empty `BalanceContract` row.
- **Present Docs earmark check on `EPLC_EXAMINATION` CREATE** — hardened per the earmark rule above.
- **Duplicate secondary reference guard**: `sourceTransactionRef` (Amendment No./IB Number/EB Number)
  must be unique within one contract's movement history, scoped to `balanceContractId`.
- **Maker EC / Cancel**: PENDING→CANCELLED, distinct from `reject()` (the Checker's 4-eyes decline).
  `cancelledBy` is audit metadata only, never an ownership check.
- **Idempotency key (§8)**: `(balanceContractId, eventSeq)`, enforced via a UNIQUE constraint in
  `store/balanceMovementStore.ts`; a resubmission is resolved through `findByContractAndEventSeq`.

## Database layer (`db/index.ts`)

Node's built-in `node:sqlite` (`DatabaseSync`, Node ≥22.5), not `better-sqlite3` (no C++ toolchain on
this machine). Same named-parameter (`@name`) prepared-statement style as `better-sqlite3`. **Known
limitation**: SQLite locks at the whole-database-file level even under WAL — cannot demonstrate
per-instrument non-blocking concurrency (design doc §6: same-LC writes should serialize, different-LC
writes should never block each other); every write serializes globally. Flagged **must-replace**
(PostgreSQL row-level locking) before validated in production, not a silently-accepted gap.

## Money / error conventions

`money.ts` mirrors `lc-payment-wc/microservices/payment-component/src/money.ts`'s decimal-string
convention — server-side arithmetic must use decimal/BigDecimal, never a binary float. It is the only
module allowed to construct a `Decimal` from a wire string. `errors.ts` is typed 1:1 with OAS response
codes: `REQUEST_VALIDATION_FAILED` (400), `INSUFFICIENT_AVAILABLE_BALANCE` (409, §6),
`ILLEGAL_STATE_TRANSITION` (409, §8), `NOT_FOUND` (404), `CONTRACT_VERSION_CONFLICT` (409, §8),
`NATURAL_KEY_ALREADY_EXISTS` (409, the re-ISSUE guard above).

## Frontend (`src/app/transaction-builder/`) — UI decisions

- Organized as **named Import (A-series) / Export (B-series) business functions**, not a raw
  instrumentType/movementType picker — selecting a function pins the instrumentType (and movementType
  where unambiguous).
- **Cascading "LC Index → IB Index" picker**, page-by-page at both levels, ordered by `lc_number`
  ascending.
- A4's LC Index shows pending IB Number(s) inline (e.g. "810 — IB00001 — ACTIVE — Pending: 25,000");
  display only, never used in calculation/payload.
- A6/B4: an Acceptance's Amount/IB-Number/Tenor Type/Tenor Days auto-fill AND **lock** from the
  Document Arrival being converted / parent LC's declared values (server-enforced regardless).
- A3 (Document Arrival, Sight) Checker step **does not call the real release API** — movement stays
  PENDING server-side; A4/A6 finalizes it. B3 is the one exception (Present Docs Earmark needs a real
  Pending-vs-Approved split that survives reload/cross-session) — routed through the acknowledge API.
- A9 SHGT Redeem: FULL_REDEEM when Bill Amount fully covers outstanding, else PARTIAL_REDEEM — amount
  defaults to SG Available Balance, mandatory.
- B5 "EB Index" merges candidates across both possible instrumentTypes
  (`EPLC_DUE_FROM_ISSUING_BANK` for Sight, `EPLC_ACCEPTANCE` for Usance) since the Maker doesn't know
  in advance which tenor a given EB Number was.
- **Scope boundary**: `EPLC_DUE_FROM_ISSUING_BANK` is created only programmatically by B4's compound
  Submit; no function lets a user pick an existing one via a Parent-LC picker (B5 is
  Usance/`EPLC_ACCEPTANCE`-only).

## Amount input follows the typed Currency's own decimal places

Amount is Formly `type: 'number'`; Currency is a free-typed sibling field (no fixed dropdown/master —
unlike `lc-payment-wc`'s `CurrencyService`). `CURRENCY_DECIMALS`/`decimalPlacesForCurrency()`/
`amountExceedsCurrencyDecimals()` (`balance-component.model.ts`) — ISO 4217 minor-unit lookup (JPY/TWD/
IDR/KRW/VND/CLP/ISK = 0; BHD/IQD/JOD/KWD/OMR/TND = 3; else 2). `rebuildFields()`'s `amount` field reads
`props.step` from a Formly `expressions` callback on the sibling `currency` field (not a
`rebuildFields()` re-run, to avoid input-focus loss). `submit()` guards with
`amountExceedsCurrencyDecimals(...)` — blocks with a clear message rather than silently rounding.

`amountExceedsCurrencyDecimals` originally called `amount.split('.')` directly — but Angular's
`NumberValueAccessor` coerces the `type="number"` input's value to a real JS `number` before it reaches
`model.amount` regardless of its TS type, so this threw on every keystroke and froze Submit across all
14 functions. Fixed by coercing via `String(amount)` first; parameter type widened to
`string | number | null | undefined`. DOM/valueAccessor coercion bugs are structurally invisible to this
project's direct-instantiation test convention — only a live browser check surfaces them.

## Microservice now enforces the SAME currency-decimal-place rule server-side

`microservices/balance-component/src/money.ts` mirrors the Angular model's `CURRENCY_DECIMALS` table
exactly (kept in sync deliberately, so a value the UI accepts is never rejected server-side or vice
versa): `CURRENCY_MINOR_UNITS`, `minorUnitsForCurrency()` (case-insensitive, defaults to 2 for
unlisted), `decimalPlaces()`, `describeAmountScaleViolation()` (pure/non-throwing).

Deliberate divergence from `lc-payment-wc`'s sibling convention: that project SKIPS the scale check for
an unlisted currency (backed by a real Currency-API master, "no data" means "don't guess"). This
project's Currency field has no master-data source at all, so an unlisted code defaults to 2dp rather
than being skipped — matching the Angular UI's own fallback.

Wired into `routes/balanceMovements.ts`'s `POST /balance-movements`, right after the required-fields
check: (1) `MONETARY_AMOUNT_PATTERN.test()` (the general shape check, previously never run at the
request boundary), (2) `describeAmountScaleViolation()`. Both throw `RequestValidationError` (400).
Side effect: also closes a pre-existing gap where a malformed `amount` (e.g. `"not-a-number"`) reached
`parseMonetaryAmount()` deep in the service layer and surfaced as a generic 500 instead of 400, since
`InvalidMonetaryAmountError` isn't an `ApiError` subclass.

## BAL-115 fixed — `balanceService.ts`'s three internal `new Decimal(req.amount)` call sites now go through `parseMonetaryAmount()`

`money.ts` is documented as "the only module allowed to construct a Decimal from a wire string,"
enforced via `parseMonetaryAmount()` (validates the pattern first). Three call sites in
`createMovement()` bypassed this via raw `new Decimal(req.amount)` — the SG Issue vs. Tight Available
check, the Present Docs earmark check, and the AMEND_DECREASE sufficiency check. Route-level enforcement
above only covers the HTTP boundary; `createMovement()` is a public method any caller (including
non-HTTP tests/future callers) can invoke directly, so the invariant needed enforcing at this layer too.
non-HTTP caller of `BalanceService` would skip the route's validation entirely) — so the invariant
needed enforcing at this layer too, not just at the one current HTTP entry point.

**Fix:** all three call sites now call `parseMonetaryAmount(req.amount)` instead of
`new Decimal(req.amount)` — a new `import { parseMonetaryAmount } from '../money';` at the top of the
file. `new Decimal(0)` (zero-initializing `offBalanceExposure`, not derived from any wire string) is
unaffected — out of scope for BAL-115, which is specifically about constructing a Decimal *from a wire
string* outside money.ts, not about zero-construction.

New `test/unit/service/balanceService.test.ts` (previously no dedicated direct-service-call test file
existed — coverage of `BalanceService` was otherwise only exercised indirectly via `app.test.ts`'s HTTP
integration tests) — 3 tests, one per fixed call site, each constructing a `BalanceService` directly
(no HTTP/supertest) and asserting `InvalidMonetaryAmountError` is thrown for a malformed amount at
exactly the point that used to silently construct a `Decimal` from unvalidated input. This is
deliberately a *different* proof than the route-level tests added in the section above: those prove the
HTTP boundary rejects a bad request before ever reaching `createMovement()`; these prove `createMovement()`
itself is now safe even when called directly, bypassing that boundary entirely.

## Second Quality-report-balance.md remediation pass

### BAL-119 (Minor, Code Smell) — Fixed
`backend/server.js`'s `module.exports = { app, runCase, resolveLogicalContractId, callMicroservice };`
followed by three redundant `module.exports.X = X` re-assignments (a no-op leftover from the BAL-107 fix)
— the three lines were deleted; the object literal already assigns everything they duplicated.

### BAL-117 (Minor, Security Hotspot) — Fixed, both services
Both Express services' generic 500 handlers used to echo the raw internal error message into the
response body (readable by any caller — neither service has authentication):
- `backend/server.js`'s `POST /api/business-cases/:id/run` catch block now logs the detailed message via
  `console.error('[business-cases/run] orchestration error for "<id>":', detail)` and returns a fixed
  generic message (`'An internal error occurred while running this business case.'`) instead of `detail`
  itself. Three existing tests in `test/server.test.js` that asserted the old leaked-message behavior
  were updated to assert the new generic message AND that `console.error` was called with the real
  detail (spied via `jest.spyOn(console, 'error').mockImplementation(...)`), so server-side loggability
  is still verified, just no longer client-visible.
- `microservices/balance-component/src/app.ts`'s generic (non-`ApiError`) fallback handler — same fix,
  generic message `'An internal error occurred.'`, `console.error(err)` (already present) is what
  captures the detail server-side now. No existing test asserted the old leaked message here (this
  branch had no live test coverage before or after — see BAL-109-style "known uncovered branch" posture,
  global coverage threshold unaffected).

### BAL-118 (Minor, Security Hotspot) — Fixed
`backend/server.js`'s `POST /api/business-cases/:id/run` — the orchestrator's own highest-amplification
endpoint (one request can fan out into a multi-step cascade of downstream microservice calls via
`runCase()`) — had no rate limiting of its own. Added a scoped `express-rate-limit` limiter (120 req/min,
`standardHeaders: true`, `legacyHeaders: false`), mirroring the microservice's own existing
`/balance-movements` limiter exactly (same window/limit shape, same "basic abuse protection, not a
throughput cap on normal use" posture). `express-rate-limit@^8.6.2` added to `backend/package.json`
(same version already used by the microservice). New test in `server.test.js` asserts the
`ratelimit-limit: '120'` response header is present and no legacy `x-ratelimit-*` headers leak through,
confirming the limiter is actually wired to this specific route.

### BAL-116 (Minor, Code Smell) — Fixed
`zod` was a declared dependency in `microservices/balance-component/package.json` but never imported —
request validation was a single hand-rolled property-presence `if` check in
`routes/balanceMovements.ts`, with the BAL-115/currency-decimal-place fixes bolting two more hand-rolled
checks onto it (pattern, currency-scale). New `src/validation/requestSchema.ts` —
`createMovementRequestSchema`, a zod object schema covering exactly the 6 fields that were already
required (`instrumentType`/`movementType`/`eventSeq`/`amount`/`currency`/`createdBy`) plus a
`.superRefine()` reproducing the pattern + currency-scale checks verbatim (calling the same
`MONETARY_AMOUNT_PATTERN`/`describeAmountScaleViolation` from `money.ts`, unchanged) — and, critically,
`.passthrough()` on the schema so every OTHER `CreateMovementRequest` field (`naturalKey`,
`balanceContractId`, `tolerancePct`, `tenorType`, `parentLogicalContractId`, `sourceTransactionRef`, etc.)
is preserved untouched rather than stripped, since zod's default `z.object()` behavior strips unrecognized
keys — this was the one real risk in this fix (getting `.passthrough()` wrong would have silently dropped
every optional field the service actually reads, breaking most business functions) and is covered by its
own dedicated test. `routes/balanceMovements.ts`'s handler now calls
`createMovementRequestSchema.safeParse(req.body)` and throws `RequestValidationError` with the first
issue's message (`firstValidationMessage()`) on failure — same single-message-at-a-time convention the
hand-rolled checks it replaced already had. New `test/unit/validation/requestSchema.test.ts` (13 tests:
valid body, passthrough proof, each required field missing, `eventSeq` type/zero-is-valid edge cases,
pattern violation, scale violation, scale-exactly-at-limit, first-issue-message selection) — all 17
pre-existing HTTP-layer tests in `app.test.ts` covering this route's validation (presence, pattern,
currency-scale, KWD/JPY/unknown-currency cases) pass **unchanged**, with no test edits needed, confirming
the schema is exactly behavior-preserving.

### BAL-003 — Checker release/reject/cancel chain's shared success/failure tail consolidated
A full service extraction was rejected: the compound release/reject/cancel chain reads/writes ~10 pieces
of component state and calls back into 4 other methods, so moving it to a service would just pass all of
that back and forth. Instead every leg shared one of two exact tail shapes (success:
`actionBusy=false; submitResult=res; refreshSelectedContractSnapshot(); syncCheckerToContext();`;
failure: `actionBusy=false; submitError=<message>;`) — new `finishCheckerAction(res, opts?)` /
`failCheckerAction(message)` private helpers consolidate them across ~16 call sites. Which call fires,
in what order, under what condition, and every error message is unchanged — only the trailing
state-mutation lines were factored out. `submit()`'s own ~430-line Maker dispatch was deliberately left
untouched this pass (different kind of complexity — building a per-function request object across 14
branches, not a chain of near-identical calls) — BAL-003 stays open.

### BAL-001/BAL-002 status corrected: Deferred, user-confirmed
Documentation-only. Both findings (no auth; 8 High Angular CVEs) were already excluded from remediation
scope but not recorded as a deliberate decision — reframed with an `Outcome:` note matching BAL-102's
own wording. Severity/gate-condition status unchanged — "deferred" is a scope decision, not a risk
reduction.

## Third same-day remediation pass

### BAL-105 — Prettier `format:check` fixed for real
`backend/`'s `format:check` pointed `--ignore-path` at a `.gitignore` that doesn't exist in `backend/`,
so generated coverage output was flagged alongside real source. Rescoped the glob to match the `lint`
script's own scope; then ran `prettier --write` across all three sub-projects for a real repo-wide
reformat (whitespace-only, zero logic touched).

### BAL-108 — remaining 5 `any`-typed fields retyped
`catalogPayableMovements`/`payableMovements`/`selectedPayMovement`/`checkerItems`/
`selectedCheckerMovement` → real `BalanceMovement`/`BalanceMovement[]` types. The prior blocker (bare
partial-object test fixtures failing against the full type) was resolved by adding a
`makeMovement()`-style fixture-builder helper to each affected spec file, matching this codebase's
existing shorthand-fixture convention for `BalanceContract`/`BalanceSnapshot`.

### BAL-003 — `submit()`'s ~430-line body split into 7 named methods; `submit()` itself now 29 lines
On closer reading, `submit()`'s actual shape is generic validation + generic request assembly + 4
special-case compound submission shapes (gated by function flags) + 1 generic default path — split into
`validateSubmit()`, `buildSubmitRequest()`, the 4 compound methods (A3S SG-first 2-step; B3 Sight/HONOUR
2-step; B4 Usance/ACCEPT 3-step; B5 settle-then-resolve-then-reimburse 3-step), and `submitPlain()`.
`submit()` itself now: validate → build request → reset state → dispatch. Pure code motion — every
guard, error message, and call order is unchanged.

## BAL-120 status corrected: Deferred, user-confirmed
Documentation-only. `balanceMovementStore.ts`'s idempotency-collision detection stays as message-text
matching (`/UNIQUE constraint failed/`) because `node:sqlite` exposes no stable constraint-violation
error code to switch to — revisit if/when it adds one, or alongside the SQLite→PostgreSQL swap
(BAL-102). Severity unchanged at Info, non-blocking.

## Fourth same-day remediation pass

### BAL-003 — paginated-picker state/boundary-math extracted into `PagedListState`
The catalog LC Index, Parent LC picker, and IB/SG Index each carried their own copy of the same
`page`/`total`/`pageSize` fields, `totalPages` formula, and boundary-check logic. New
`paged-list-state.ts` — a framework-agnostic `PagedListState` class owning `page`/`total`/`pageSize`, a
`totalPages` getter, `reset()`, `prevTarget()`/`nextTarget()`. Existing public surface preserved as
getter/setter accessor pairs delegating to the new instance (not a rename), since ~96 existing
read/write call sites reference these properties by name directly. BAL-003 stays open — this closes a
duplication finding but doesn't reduce the *number of jobs* the component does.

## Fifth same-day remediation pass

### BAL-110 — contract test catching real InstrumentType/movementType drift between Angular and the microservice
New `instrument-type-contract.spec.ts` — reads both `balance-component.model.ts` and the microservice's
`types.ts`/`balanceDerivation.ts` as plain text (never `import`/compile, so it can't cross the two
projects' Jest configs) and asserts `InstrumentType` union and movementType-set equality between them.

### BAL-003 — Checker Actions extracted into `CheckerActionsService` via Dependency Inversion
A naive cut-and-paste was rejected (the compound release/reject/cancel chain reads/writes ~10 pieces of
state and calls back into 5 other methods). Instead: new `checker-actions.service.ts` —
`CheckerActionsService` (`@Injectable({providedIn:'root'})`) depends only on a `CheckerActionContext`
interface (Interface Segregation — exactly the fields these 3 flows need) and its own injected API
service, never on the component. It owns which release/reject/cancel call fires, in what order, and
resolves every flow to one `CheckerActionOutcome` (`'released' | 'documentArrivalAcknowledged' |
'failed'`) — never mutates component state itself. `release()`/`reject()`/`deleteMakerPending()` on the
component become thin wrappers routing the outcome through `applyCheckerActionOutcome()`. New
`api-error.ts` — `describeApiError` pulled out to a standalone pure function.

Constructor-injection risk avoided: `CheckerActionsService` is a constructor parameter with a default
value (`= new CheckerActionsService(api)`), since 70+ existing tests construct the component with a
single argument — Angular's real DI always resolves the real injected singleton in production
regardless (defaults are never consulted by Angular's DI), so no test call site needed changes.

## Currency Code carries from A1/B1 and is protected on every other function

`currency` was previously a free-typed Formly input on every function — nothing stopped a Maker from
typing a different Currency than the LC/Confirmation actually declared. Same "carry from resolved
record, protected" shape as the existing Amount/Tenor precedent, extended to Currency and made
unconditional (A1/B1 never populate `selectedParent`/`selectedContract`, so no function-code allowlist
needed). `carriedCurrency` getter: `selectedParent?.currency ?? selectedContract?.currency ?? null` —
parent checked first since a `hasParent` function resolves it at Step 1, before any Step-2 picker.
`rebuildFields()`'s `currency` field disables + relabels when locked (mirrors `amountLocked`/
`tenorLocked`); `model.currency` is written at every place a contract/parent resolves
(`onSelectContract()`, `onSelectParent()`, `searchExistingContract()`, `onSelectIbIndex()`,
`onSelectSettleableBalance()`).

## Two OAS specs generated/reconciled: Balance Component Microservice API + Web/Mobile Channel API

`analysis/balance-component-api.yaml` bumped to v1.0.0 and re-grounded against the real running
microservice rather than the drifted design-doc draft: removed 4 never-implemented endpoints
(`GET .../history`, `POST .../versions`, `PATCH .../{movementId}`, `POST .../reversal`); corrected
`DELETE .../{id}?reasonCode=` to the real `POST .../cancel`; added the two real undocumented endpoints
`GET /balance-contracts/catalog` and `GET /balance-movements/{id}/balance-as-of`; added `MEMO` to
`ExposureNature`; removed the never-populated `warnings[]` mechanism; documented
`parentLogicalContractId`/`tenorType`/`tenorDays`/`maturityDate`/`exposureNature`/`tolerancePct` on the
create request, `409 NATURAL_KEY_ALREADY_EXISTS`, Acceptance/parent-tenor consistency, and per-contract
`sourceTransactionRef` uniqueness.

**New rule, spec-only, not yet enforced by the microservice**: server-side Currency Code derivation
mirroring the client-side carry-and-protect rule — a request resolving to an EXISTING contract derives
`currency` from it (mismatch → new `409 CURRENCY_MISMATCH`); a new child contract with
`parentLogicalContractId` derives `currency` from the parent; only a genuinely root new Logical Contract
(ISSUE, no parent) accepts caller-supplied `currency`.

New `analysis/balance-component-channel-api.yaml` (v1.0.0) — a thin façade over the microservice
contract in named business-function vocabulary (`functionCode`: A1–A9/B1–B5), with its own
field-requirement catalog mirroring `IMPORT_FUNCTIONS`/`EXPORT_FUNCTIONS`. Two design principles: **one
movement/one leg per API call** (no batch/compound endpoint, even for a compound function — a channel
client makes N separate calls sharing one `businessEventId`); and **schema-level currency enforcement**
— request body is a `oneOf` of `ChannelOriginTransactionRequest` (A1/B1 only, `currency` required) vs.
`ChannelDerivedTransactionRequest` (every other functionCode, no `currency` property — supplying one is
a 400).

## Contingent Liability Ledger added to `analysis/`

`analysis/contingent-liability-ledger.html` — a self-contained Dr/Cr account-pair reference for every
in-scope contingent-liability scenario (Import LC by tenor, SG, Import Acceptance, Export Confirmation,
Export Acceptance — Usance only, Sight never creates an Acceptance). Sourced from
`TF_Balance_Component_Spec-en.docx`/`TF_Contingent_Liability_Lifecycle-en.docx` (binary, uncommitted —
the only source of record). Includes a 14-row A1–A9/B1–B5 function-code coverage index and collapses
per-tenor-duplicated rows via the source's own `[Tenor]` placeholder convention.

Documents deliberate divergences from the source document: partial SG redemption uses a MIN()-based rule
the source explicitly argues against (later business override); Import Acceptance is offered under
Buyer's Usance even though the source's own derivation matrix routes that case away from Acceptance/DPU;
Export tenor collapse (B4 never distinguishes "honoured at sight, no Acceptance" from the
Acceptance-creating case). Also flags Expiry/Cancellation and SG Amendment/Claim as spec-defined but not
implemented.

Correction: SG Issue and SG Amendment-Increase post the identical Dr/Cr pair (same accounts, same
direction) and `SHGT` has no `AMEND` movementType at all — a real amount increase is realized as another
SG Issue (A8), not a distinct amendment row; merged into one row. Decrease/Claim remain separate,
genuinely-unimplemented rows (opposite direction, no A8/A9 workaround). A3S and A9 both call the
identical `shgtRedeem.ts` MIN(Bill Amount, SG Outstanding) rule — A3S is a second caller, not a separate
one.

## Contingent liability account entries implemented end-to-end: generation, persistence, Event Timeline linkage, Account Entries dialog

Turns the ledger above from documentation into live behavior: every movement against an in-scope
contingent instrument carries its own Dr/Cr pair, generated once server-side at creation and stored
immutably — never recalculated, including on later Event Timeline re-fetch. Scope: contingent/
off-balance-sheet account entries only; on-balance-sheet liability stays out of scope.

## Bug fixed — A3S's SG redemption leg (and B4 Usance's Acceptance leg) never got an Account Entries button

Root cause: every compound Submit method only assigned `submitResult` from ONE of its 2-3 linked
`createMovement()` calls — every other leg's full response was discarded, only its `movementId` kept.
For A3S, `submitResult` tracks the SECOND call (the LC's UTILIZE) — the FIRST call (the SG's
FULL_REDEEM/PARTIAL_REDEEM, a real in-scope account family) was silently dropped from the UI even though
the server had already generated its `contingentAccountEntry`. The existing doc comment on the Maker
(`transaction-builder.component.html`) had actually already anticipated *some* secondary legs being
null/out-of-scope (the B4 asset-side legs) but wrongly generalized that to "every secondary leg" — it
missed that A3S's SG leg, and B4 Usance's own new `EPLC_ACCEPTANCE` liability leg
(`submitConfirmationAcceptWithReceivable`'s second call), are BOTH real in-scope families whose entries
were being dropped the exact same way. The other three "dropped" legs across all four compound methods
(`EPLC_DUE_FROM_ISSUING_BANK`, `EPLC_ACCEPTANCE_REIMB_RECEIVABLE` ×2) are genuinely out of scope
(`accountFamilyFor()` returns `null` for them) — those were never a bug.

**Fix**: two new component fields, `arrivalSgRedeemMovement`/`acceptanceMovement` (full
`BalanceMovement | null`, not just a `movementId` like their sibling correlation fields), populated
alongside the existing `*MovementId` assignment at the exact same point in each compound method, reset
alongside them in `selectFunction()`'s state-clearing block (plus `submit()`'s own top-of-method reset,
matching `submitResult`'s own convention there). Two new conditional buttons added to the Maker Result
panel template (`*ngIf="arrivalSgRedeemMovement?.contingentAccountEntry"` /
`*ngIf="acceptanceMovement?.contingentAccountEntry"`), labeled "Account Entries — SG Redemption" /
"Account Entries — Acceptance" to distinguish them from the primary leg's own plain "Account Entries"
button when both render side by side. Deliberately did NOT generalize this into a single
`submittedMovements: BalanceMovement[]` array covering every current and future compound leg — the two
fixed fields directly close the two real gaps found; a broader refactor touching all five secondary-leg
fields (three of which are correctly null and don't need this) was judged out of scope for a targeted
bug fix.

## A3S/B5 Checker compound release only worked in the SAME browser session that Submitted

A3S's Checker Release (meant to release the SG's own FULL_REDEEM/PARTIAL_REDEEM for real) only reached
the real release call when `selectedCheckerMovement.movementId === submitResult?.movementId` — i.e.
only when the same session that Submitted was also the one Releasing. A genuinely separate Checker
session always has `submitResult` null, so the compound branch was silently skipped and fell back to
A3's acknowledgment-only path, leaving the SG's redemption PENDING forever. B5 had the same bug in a
worse form — `isCheckerCompoundOwnSubmission` never checked `settlesAcceptanceOnMature` at all, making
B5's compound release unreachable via any UI path. Root cause: the two linked legs of a compound
submission share one `businessEventId`, but the server had no endpoint to query "every movement sharing
this businessEventId" — the client's only correlation mechanism was its own in-memory Submit response.

**Fix**: new `GET /balance-movements?businessEventId=` (microservice) +
`resolveLinkedMovementId(ctx, ...movementTypes)` (`checker-actions.service.ts`) — prefers the in-memory
id when present, falls back to a `findByBusinessEventId` lookup keyed off
`selectedCheckerMovement.businessEventId`, matching by `movementType` alone (each exclusive to its own
instrument). `isCheckerCompoundOwnSubmission` rewritten for A3S/B5 to key off the picked item's own
shape (`movementType` + a real `businessEventId`) instead of requiring a `submitResult` match — a plain
A3 UTILIZE never carries a `businessEventId`, so it still correctly falls through to acknowledgment-only.
A6/B4 were deliberately left unchanged here — their source record (a pre-existing Document Arrival/
Present Docs) has no `businessEventId` correlation to the new compound at all; fixed separately below via
`referencedTransactionId`.

## A6/B4 fixed too — completing full A1–A9/B1–B5 coverage of this bug class

Only A6 and B4 needed this: every other function is either single-movement, acknowledgment-only, or
already resolves fresh session-independent data. A6/B4 convert a **pre-existing** source record picked
at Submit time — the source predates the new compound submission, so it never shares a `businessEventId`
with it.

**Fix — new correlation field, `referencedTransactionId`**: `BalanceMovementCreateRequest`/
`BalanceMovement.referencedTransactionId` — the movementId of the pre-existing source record, stamped on
the new primary movement at Submit time and persisted immutably (passthrough posture, same as
`businessEventId`/`sourceTransactionRef` — accepted and returned, never validated to resolve). Angular's
`resolveSettlesDocumentArrivalIds()` resolves the source via `selectedPayMovement?.movementId ??
selectedCheckerMovement?.referencedTransactionId`; B4's own downstream legs (created alongside the
primary) still resolve via the `businessEventId` lookup, branching on the primary's own `movementType`
(`HONOUR` vs `ACCEPT`) since both flags are unconditionally true on B4's registry entry — an early
version conflated the two branches, fixed by checking the actual movementType first, and the Usance pair
(both literally `CREATE`, not distinguishable by type) is resolved by creation order instead
(`findByBusinessEventId`'s oldest-first ordering).

## A4's generic Checker panel could reproduce a false "already RELEASED" error

A4 (Sight Settlement)'s own "Pay (Release)" button already performed the complete release in one call —
but the generic Checker "Pending Approvals" panel rendered unconditionally for every function including
A4, and `payExisting()` never synced it. A user searching that panel (before or after using A4's own
button) could hold a stale PENDING row; releasing it after A4 already finalized the movement reproduced
a correct-but-confusing `409 ILLEGAL_STATE_TRANSITION`. Fixed by hiding the panel for A4
(`*ngIf="!selectedFunction.payExistingUtilize"`) rather than trying to keep two release surfaces in sync.

## A4 redesigned for real Maker/Checker (4-eyes) separation — supersedes the entry above

The panel-hiding fix left A4 as the one function with no real 4-eyes separation (`payExisting()` let one
actor both identify and release in one call). Re-solved the other way: removed `payExisting()` entirely,
restored the shared Checker panel unconditionally (now A4's only release path — no staleness trap since
there's only one surface), and made A4's own "2ndary Index" picker browse-only with a hint pointing at
the Checker section — standardizing A4 on the same Maker-submits/Checker-releases pattern every other
function uses.

## A4 gained a real Maker Submit — supersedes the entry above's "browse-only" design

The browse-only redesign left A4 as the only function with no Maker action at all, and nothing stopped a
Checker from releasing A4's picked item before any Maker action. A4 has no movement of its own to create
at Submit time (A3/A3S already earmarks the exposure at PENDING UTILIZE and generates its own Account
Entries; A4 settles that same pre-existing record later, it doesn't create a second one) — mirroring
A6/B4's `referencedTransactionId` shape (a NEW movement compound-released with the source) was rejected
because Confirmed Balance sums ALL RELEASED movements by `MOVEMENT_DIRECTION`, and a second RELEASED
UTILIZE on the SAME LC contract would double-count the exposure (safe for A6/B4 only because their new
movement posts to a separate Acceptance contract).

**Design**: mirrors B3's `acknowledgedBy`/`acknowledgedAt` precedent but on the Maker side — new
`makerSubmittedBy`/`makerSubmittedAt` on `BalanceMovement`, set via `POST
/balance-movements/{id}/maker-submit` (IPLC_LC/UTILIZE only), which deliberately does NOT transition
status — stays PENDING, same as every other "second actor confirms without finalizing" action. The
Checker-side gate lives in `checkerAct()`'s plain fallback: for `payExistingUtilize` (A4 only), release
is blocked unless `makerSubmittedAt` is already set (Reject is not gated). Deliberately NOT enforced
server-side inside `release()` — the Business Case Runner's own Import Case 1/2 releases a UTILIZE
directly with no maker-submit call, and hard-requiring it there would break that already-working
orchestrated flow; the gate lives only in the interactive Transaction Builder's `checkerAct()`.

## Business Case Registry gained Export Case #6/#7 — the CURRENT B3/B4 architecture, alongside the older #1-#5

Export Case #1-#5 model "Present Docs" as directly creating the HONOUR/ACCEPT movement with no separate
earmark step — predates the B3 (memo earmark)/B4 (unified Honour/Accept) redesign. Left #1-#5 as-is
(instruction was to add, not replace) and added `exportCase6`/`exportCase7`, transcribed from real S01/
U01 data. `runCase()`'s executor gained `referencedTransactionIdRef` resolution (mirroring
`balanceContractIdRef`'s pattern) so B4's compound-release correlation to the B3 earmark it settles can
be expressed declaratively. Case #6 (Sight): Confirm → Present Docs (B3, stays PENDING) → Honour (B4,
`referencedTransactionId` → the B3 earmark) → three explicit releases. Case #7 (Sellers Usance): same B3
shape, then B4 Accept compound-creates Acceptance Liability + Reimbursement Receivable, then B5
compound-releases both.

## Business Case Registry gained Import Case #6/#7, same convention

Transcribed from real Import S01 (Sight)/U01 (Sellers Usance) data. Import Case #1-#5 already used the
current A3/A3S/A4/A6/A7 shapes, so the only executor gap was a `makerSubmit` step type (mirrors
`release` — POST `/balance-movements/:id/maker-submit`, `movementRef` + `makerSubmittedBy`) to invoke
A4's real Maker Submit. Case #6 exercises A3S's `MIN(Bill, SG Outstanding)` derivation across two SGs
plus A4's Maker Submit + Checker Release on all three UTILIZEs. Case #7 exercises A6's compound release
across two Document Arrivals plus A7 Acceptance Settlement — confirms Usance UTILIZE never carries
`makerSubmittedBy` (A6's own compound release finalizes it instead; A4's gate is Sight-only).

## BAL-122/BAL-123 fixed — two Major findings from a `Quality-report-balance.md` reassessment, both in A4's redesign

**BAL-122** — A4's generic "Delete Pending (EC)" button cancelled the upstream A3/A3S Document Arrival,
not an A4-specific record, because `submitA4()` sets `submitResult` to A3/A3S's own pre-existing UTILIZE
(A4 creates no movement of its own). Fixed by excluding `payExistingUtilize` from the button's `*ngIf` —
hidden, since A4 has nothing of its own to delete.

**BAL-123** — A4's `makerSubmittedAt` gate was enforced ONLY by the Angular client, never by the
microservice's own `/release` — any other caller could release an unsubmitted A4-type UTILIZE. Fixed:
`release()` now throws `IllegalStateTransitionError` (409) for a Sight-tenor `IPLC_LC`/`UTILIZE` movement
whose `makerSubmittedAt` is unset, scoped by the parent contract's own `tenorType === 'SIGHT'`
(deliberately not instrumentType/movementType alone, since a Usance UTILIZE releases through the same
endpoint via A6's compound flow, which never calls `/maker-submit`).

## BAL-134 fixed — Import Case 4 rewritten for the CURRENT correct usage

`importCase4`'s scenario predated Design doc §6.1 v0.12 ("A3 hard-rejects past Tight Available") and
failed live on its own plain Document Arrival step — v0.12 removed the WARNING branch entirely, making
the case's own premise architecturally impossible via a plain UTILIZE. Rewritten to create the SG's own
PARTIAL_REDEEM first (still PENDING, sharing a `businessEventId` with the following Document Arrival,
the real A3S ordering) — PENDING redemptions net out the same as RELEASED ones, so the same presentation
now succeeds cleanly. Final balances unchanged.

## BAL-131 fixed (BAL-124 closed as a side effect) — Export Case #6/#7's Present-Docs `acknowledge` step gains orchestrator-level coverage

Export Case #6/#7 carried a `note`-type placeholder at the B3 acknowledgment step instead of a real
`acknowledge` step, leaving `runCase()`'s `acknowledge` step type completely uncovered by the registry.
Fixed by using a real `{type:'acknowledge', ...}` step in both cases — implementing it as a third
near-duplicate handler would have reintroduced BAL-124 (duplicated POST-to-subpath shape across
`release`/`makerSubmit`), so all three step types were consolidated into one `RELEASE_SHAPED_STEP_TYPES`
dispatch table plus one shared handler, closing both findings in the same edit.

## BAL-125 fixed — `checker-actions.service.ts`'s 6 un-swept `any` occurrences retyped

`CheckerActionContext.submitResult`, `CheckerActionOutcome.result`, and three private-method parameters
were `any` — the same untyped-API-boundary pattern BAL-108 fixed elsewhere, missed here because this
file didn't exist when BAL-108 closed. Retyped to `BalanceMovement | null`/`BalanceMovement`; one
resulting non-null assertion on an optional-chain expression (an ESLint error, not just a warning) fixed
by extracting to a local variable first.

## BAL-126 fixed — `checker-actions.service.ts`'s 20 duplicated `{kind:'failed'}` constructions collapsed into `fail()`

Every flow constructed its own `of<CheckerActionOutcome>({kind:'failed', message})` from both
`catchError` handlers and plain guard returns. New private `fail(message)` helper; all 20 call sites
rewritten to use it — every message string unchanged.

## BAL-127 fixed — `businessCases.js`'s ~49 duplicated create+release step pairs collapsed into `createAndRelease()`

New `createAndRelease(createLabel, captureAs, request, releaseLabel, releasedBy=CHECKER)` returns the
`[{type:'createMovement'},{type:'release'}]` shape used at 49 plain create-then-release sites. Left as
explicit longhand wherever something genuinely sits between create and release (a `note`, a second
create, a compound/deferred release) — collapsing those would hide load-bearing ordering.

## BAL-128 fixed — 3 stale `eslint-disable` comments in `backend/` deleted

`backend/eslint.config.js` never actually configured the rules (`no-console`, `global-require`) these
comments suppressed — dead artifacts, deleted rather than retroactively justified with new rules.

## BAL-130 fixed — `acknowledge()`/`submitByMaker()`'s duplicated find→validate→persist shape collapsed into `guardSecondaryAction()`

Both follow the identical find-movement → validate-shape → guard-PENDING → guard-not-already-done →
persist-and-refetch shape. New private `guardSecondaryAction()` takes a `validate(contract, movement)`
callback, present/past-tense verb forms, `alreadyDoneAt`/`alreadyDoneBy` accessors, and a `persist()`
callback — both methods become thin callers. Every guard order/error message unchanged.

## BAL-132 fixed — `deleteMakerPending()`'s `ctx.createdBy!` assertion replaced with a runtime guard

Closes out the whole `Quality-report-balance.md` reassessment pass (BAL-122 through BAL-132 plus
BAL-134). BAL-001/BAL-002/BAL-102/BAL-003 remain open, deferred gate conditions.

## BAL-003 — Maker Submit's five submission shapes extracted into `MakerSubmitService`

Mirrors `CheckerActionsService`'s own precedent. The picker-extraction idea (three paginated pickers) was
investigated first and found already done (`IndexPickerComponent` + `PagedListState`); the remaining
duplication (three accessor pairs) was judged not worth touching 35+ test call sites for a cosmetic gain.
Pivoted to `submit()`'s own five per-shape methods
(`submitDocumentArrivalWithSg`/`submitConfirmationHonourWithReceivable`/
`submitConfirmationAcceptWithReceivable`/`submitAcceptanceSettleWithReceivable`/`submitPlain`) — the
Maker-side mirror of what `CheckerActionsService` already extracted.

**Fix**: new `MakerSubmitService` — depends only on a narrow `MakerSubmitContext` interface, never the
component. Each shape resolves to one `MakerSubmitOutcome` (`{kind:'submitted', result, secondary}` or
`{kind:'failed', message, result?, secondary}`) instead of mutating component state.
`validateSubmit()`/`buildSubmitRequest()` deliberately stayed on the component (too pervasively coupled
to `model`/`naturalKey` for a service extraction to help). The subtle behavior preserved exactly: only
the call submitting the primary `req` (never a secondary/tertiary leg) sets the failed outcome's `result`
field — audited call-site-by-call-site before writing the new service.

**Net effect**: `transaction-builder.component.ts` 2,923 → 2,684 lines — the first extraction since
`CheckerActionsService` to reduce the *number of jobs* the class does, not just DRY one job's internals.

## BAL-003 — the Look Up panel extracted into `LookUpPanelService`, a plain class rather than an `@Component`

Investigated a genuine child component first (the user's original ask) — blocked because this project's
direct-instantiation, no-TestBed test convention means `@ViewChild`/`@Input`-`@Output` wiring never
resolves, and 77 existing test assertions read/write Look Up state directly on the component. Reported
both options (rewrite 77 tests vs. a plain-class extraction) rather than deciding unilaterally; user
confirmed the plain-class direction.

**Fix**: new `LookUpPanelService` — not `@Injectable`/`@Component`, a plain class exposed as a public
`readonly lookUp` field the template binds to directly (`lookUp.xxx`). Owns search criteria, the three
tabs' results, and `runLookup()`/`selectLookupTab()`/etc. Side effect found: `activeLookupMovements`
being genuinely typed `BalanceMovement[]` (was `any[]`) surfaced that the Angular-side interface was
missing `balanceBefore`/`balanceAfter` entirely, even though the microservice always persists both —
added to `balance-component-api.service.ts`. Test migration: 77 existing assertions mechanically renamed
via a scripted word-boundary regex pass (pure rename).

**Net effect**: `transaction-builder.component.ts` 2,684 → 2,438 lines — closes the last of three
"does too many things" candidates (Checker Actions, Maker Submit, Look Up panel).

## BAL-003 — the three paginated pickers' load-and-page bookkeeping extracted into `CatalogPickerService`

The pickers' own selection handlers (`onSelectContract()`/etc.) are NOT self-contained — they mutate
`model`, call `rebuildFields()`, and cascade into other loads, so extracting them is core Maker-flow
orchestration, not picker bookkeeping. Reported this and let the user choose scope via
`AskUserQuestion`; confirmed the narrower "just the fetch/page bookkeeping" scope.

**Fix**: new `CatalogPickerService` — one instance per picker (`catalogPicker`/`parentPicker`/
`ibIndexPicker`), owning `contracts`/`search`/`snapshots`/the underlying `PagedListState`, and a `load()`
absorbing the old shared fetch/populate/error body. Selection handlers and business-rule filter getters
stay on the component. A naming collision (an unrelated pre-existing `<ng-template #catalogPicker>`)
required renaming that template-ref variable to `#flatCatalogPicker`. ~260 identifier occurrences renamed
via the same scripted regex pass.

**Net effect**: `transaction-builder.component.ts` 2,438 → 2,304 lines. Every extraction this session's
BAL-003 history judged worth doing, at a scope the user confirmed, is now done.

## BAL-003 — a 9th extraction (function-policy.ts / builder-fields.ts / submit-rules.ts)

Found already sitting uncommitted in the working tree, authored outside this conversation. Verified it
end-to-end and added the missing unit coverage, per the standing "keep tests/docs/quality-report
synchronized" checklist; found + fixed one real business-rule bug and one readability defect.

**What it does** (confirmed byte-for-byte pure code motion): `function-policy.ts` — ~15 state-derivation
getters, now plain functions. `builder-fields.ts` — `rebuildFields()`'s Formly config body, now a pure
`buildFields(ctx)` function. `submit-rules.ts` — `validateSubmit()`/`buildSubmitRequest()`, now pure
functions returning `{error, patch}`/`{request, error}` instead of mutating `this.model` directly — this
reverses an earlier decision to keep them on the component, since an explicit context parameter + a
returned `patch` genuinely removes the coupling a service extraction would only relocate.

**BAL-135 (Major, found and fixed)**: B5's Amount field was silently ALWAYS locked. `buildFields()`'s
`amountFromFullSettle` check (correct for A7's own Full-Settle subChoice) also matched B5's registry
entry, since B5's `movementType: 'FULL_SETTLE'` is a placeholder default never changed before Submit —
pre-empting the newer, more specific `amountCappedAtAcceptance` rule that should have governed B5. Fixed
by excluding `settlesAcceptanceOnMature` (B5's own flag) from `amountFromFullSettle`. Pre-existing defect
in the original inline code, not introduced by the extraction — surfaced by new direct unit tests.

**BAL-136 (Minor)**: `validateSubmit`/`buildSubmitRequest` share their exact names between the
component's private wrapper methods and the pure functions imported from `submit-rules.ts` — legal but a
readability trap. Fixed by aliasing the import (`buildSubmitRequest as buildSubmitRequestRules`, etc.).

Test coverage added (none existed before): `function-policy.spec.ts`, `builder-fields.spec.ts` (incl. the
two BAL-135 regression tests),
`submit-rules.spec.ts` (39 tests, including a dedicated regression test for the `patch`-survives-a-later-
guard-failure contract `SubmitValidation.patch`'s own doc comment describes) — all three files now sit at
100% statements/branches/functions/lines individually, closing the two branches
(`settlesDocumentArrival`-without-`selectedPayMovement`, B5's own `PARTIAL_SETTLE` derivation) that were
previously covered only incidentally (95.98%/96.25% branch figures) through the component's own indirect
integration tests, same convention as `paged-list-state.spec.ts`'s own direct-unit-test precedent for a
pure/utility module in this codebase (unlike `LookUpPanelService`/`CatalogPickerService`, which are
stateful classes still tested only indirectly through the component). Each new spec file follows this
codebase's own established local-fixture-builder convention (`fn()`/`contract()`/`snapshot()`/`movement()`
redefined per file, not shared) — a real but pre-existing, not newly-introduced, duplication pattern.

**Also fixed while running the standard verification pass**: `npm run format:check` flagged 4
PRE-EXISTING files as unformatted — `catalog-picker.service.ts`, `checker-actions.service.ts`,
`maker-submit.service.spec.ts`, `transaction-builder.component.gaps.spec.ts` (all from earlier extractions
in this session, never run through `prettier --write` after editing) — reformatted (whitespace-only,
confirmed via diff, zero logic changes), plus the two new spec files once written.

**Net effect on BAL-003**: `transaction-builder.component.ts` 2,304 → 2,024 lines — the lowest this file
has been all session. BAL-003 stays open at Major (function/side selection and the pickers' own
selection/business-filter logic remain, per the Seventh outcome's own investigation above), but this pass
adds real value beyond line count: a genuine business-rule-violating defect (BAL-135) found and fixed with
regression coverage, not just code relocated.

## Protected System-Controlled Fields — Event Seq / Created By now read-only on every A1-A9/B1-B5 screen

Business requirement: "For all A1–A9 (Import LC) and B1–B5 (Export Confirmed LC) function input screens,
Event Seq and Created By must be system-controlled and protected (read-only) — the system must
automatically derive and populate these values; users must not be permitted to manually enter, edit, or
override them through the UI — applied consistently across all A1–A9 and B1–B5 input screens."

**Scope check confirmed this is a one-place fix, not a per-function one**: `builder-fields.ts`'s own
`buildFields()` is the SINGLE shared Formly field factory used by every A1-A9/B1-B5 function (no
per-function override of the `eventSeq`/`createdBy` field definitions exists anywhere) — matching the
requirement's own "applied consistently" wording directly. Both values were ALREADY system-derived before
this change (`transaction-builder.component.ts`'s constructor and `selectFunction()`'s own reset both set
`createdBy: 'maker1'`, `eventSeq: Date.now()` — no function-specific override of either exists) — this
requirement is purely a UI-editability change, not a new derivation rule.

**Fix**: both fields' Formly config in `builder-fields.ts` now set `disabled: true`, and their labels were
updated to say "system-generated, protected"/"system-derived, protected" respectively — same visual
convention this file already uses for every other carried/protected field (Amount when locked, Currency
when carried, Tenor Type/Days when carried). `disabled: true` only stops the UI from letting a Maker edit
the bound value; `model.eventSeq`/`model.createdBy` are still read and submitted exactly as before — a
disabled Formly field still displays its bound `model` value, it doesn't clear it.

**Test coverage**: 4 new tests in `builder-fields.spec.ts` (a dedicated "Protected System-Controlled
Fields" describe block) — both fields disabled on both an Import (A1) and an Export (B1) function, both
still disabled on a function whose OTHER fields (Amount/Tenor) are NOT locked (boundary — this disabled
state is unconditional, not derived from the same locking logic as the carried fields), label text
confirmation, and confirming the required+disabled combination still gets the `tb-field--required`
className (matching the existing carried-field convention, e.g. locked Amount/Tenor Days). `builder-fields.ts`
stays at 100% statements/branches/functions/lines.

## Test coverage (confirms the above; see for worked examples)

`microservices/balance-component/test/unit/` covers Import Case 1–5, a separate "Export Confirmation
asset-side instruments" HTTP-integration suite (citing the Gap Analysis doc directly), plus dedicated
suites for: the v0.12 unmatched-vs-matched Document Arrival hardening, SG-Issue-capped-at-parent-LC
(v0.10→v0.11), the SG concurrent-PENDING-redemption bug fix, the event timeline, Tenor Type Routing,
the re-ISSUE guard, the duplicate secondary-reference guard, Maker EC/Delete-Pending, and unit-level
coverage of every domain function/error/money module named above.

## BAL-003 — three pure-function extractions: `builder-fields.ts`, `submit-rules.ts`, `function-policy.ts`

Continues this session's BAL-003 (God Component) history. Started from a measurement rather than an
estimate: the file's 2,304 lines are **1,276 code + 911 comment + 118 blank** — the comment mass is
this project's own business-instruction traceability, so the target was always ~3x on real code, and
every comment had to MOVE WITH its rule rather than be dropped. The class held ~55 mutable fields,
30 getters, and 62 methods; the template carries 80 `*ngIf`.

Before starting, the user was offered three scopes (pure extractions / + a real `<app-checker-panel>`
child component / a full signals + `toSignal`-`switchMap` migration to the ~400-line target) and
explicitly chose **pure extractions only** — the only one of the three with zero spec-file blast
radius. The other two are recorded here as the remaining options, not as work silently skipped: a
genuine child component is blocked by the same constraint the Look Up panel extraction already hit
(this project's direct-instantiation test convention never renders a DOM, so `@ViewChild`/`@Input`
wiring is unreachable from ~40 existing Checker assertions), and the signals migration would rewrite
large parts of all four spec files (~4,100 lines) since ~500 assertions read fields directly
(`comp.selectedFunction` → `comp.selectedFunction()`).

### `builder-fields.ts` — `buildFields(ctx): FormlyFieldConfig[]`
`rebuildFields()` was never really a method: it read eight pieces of state and assigned one array,
mutating nothing else. Moved verbatim as a pure function; the component's own `rebuildFields()` is now
18 lines (assemble `BuilderFieldsContext`, assign `this.fields`) — same "guard/params unchanged, only
the body moves" convention as `loadPagedCatalog`/`finishCheckerAction`/`loadSnapshotAndMovements`.
Every label string, `hide`/`disabled`/`required` condition, and Formly `expressions` callback is
byte-for-byte unchanged, including the Amount/Currency/Tenor "carried forward and protected" business
instructions this is the actual UI-side enforcement point for.

### `submit-rules.ts` — `validateSubmit(ctx)` / `buildSubmitRequest(ctx)`
**This deliberately reverses the reasoning `validateSubmit()`'s own prior doc comment gave** for
keeping both on the component ("they read/write `model`/`naturalKey`/`selectedParent`/
`selectedContractSnapshot`/etc. so pervasively — including in-place derivations like
`model.movementType`/`model.tenorDays` — that a service extraction would only relocate that
coupling"). That argument holds against a *service* extraction, which would need mutable component
state handed to it and written back. It does not hold against a *pure function*: the reads become one
explicit `SubmitRulesContext` parameter, and the two in-place derivations become an explicit returned
`patch` the caller applies — the coupling is made visible in the signature, then removed. Same shape
as `CheckerActionsService`/`MakerSubmitService`'s own extractions reversing the identical argument
earlier this session.

**The one genuinely subtle behavior preserved**: the caller applies `patch` **regardless of `error`**,
not only on success. In the old inline version the A1 Sight/`tenorDays = 0` normalization happened
before later guards ran, so a mutation made by an early guard survived a later guard's own failure
return — observable, and reproduced exactly by accumulating the patch as validation proceeds and
applying it unconditionally. `buildSubmitRequest()` must therefore still be called only after the
patch is applied (A9/B5's derived FULL/PARTIAL `movementType` and A1's `tenorDays` both feed fields it
reads) — stated explicitly in its own doc comment.

### `function-policy.ts` — the pure getters
Selection criterion: a getter earned a place here only if it *derives* a value — anything that
fetches, mutates, or orchestrates stayed on the component (or had already moved to
`CheckerActionsService`/`MakerSubmitService`/`LookUpPanelService`/`CatalogPickerService` in this
session's earlier passes). Moved: `isCreatingMovement`, `requiredNaturalKeyFields`, `ibNumberLabel`,
`hasParent`, `parentOptions`, `carriedCurrency`, `usesTwoFieldSearch`, `toleranceApplicable`,
`isReady`, `lcNumberFromParent`, `contextLcNumber`, `contextSecondaryRef`, `checkerSecondaryField`,
`checkerSecondaryLabel`, `parentTenorFamily`. The component's own getters are now one-line delegations
(`policy.xxx(...)`), kept purely as the template's binding surface and the ~90 existing spec
assertions' read surface — none contains logic anymore. `BuilderModel` moved here too (it was a
non-exported local interface in the component file) so the rule modules that read it needn't import
from the component; it is unreferenced by any spec, so nothing needed updating.

### Verification
Angular app **534/534 passing with ZERO spec-file changes** — the strongest evidence available that
behavior is preserved, since the whole suite was written against the pre-extraction implementation and
still passes completely unmodified (same evidence standard every prior BAL-003 extraction in this
session used). Coverage 99.71%/95.98%/99.46%/99.75%, all four clear the 95% floor; the three new files
land at **100%/100%/100%/100%** (`builder-fields.ts`, `function-policy.ts`) and
**100%/96.25%/100%/100%** (`submit-rules.ts`) with no new tests written — they are exercised entirely
through the existing component specs, which is itself the proof this was pure code motion.
`npx tsc -p tsconfig.app.json --noEmit` clean, `ng build --configuration development` clean,
`npm run lint` **0 errors / 202 warnings (unchanged baseline)**, `prettier --check` clean on all four
touched/created files.

File size: `transaction-builder.component.ts` **2,304 → 2,024 lines** (1,276 → ~1,000 code lines);
`function-policy.ts` 174, `submit-rules.ts` 212, `builder-fields.ts` 165.

**Net effect on BAL-003**: BAL-003 stays open at Major. What remains on the component is now almost
entirely *orchestration and view-binding surface* rather than rules: function/side selection, the
three pickers' selection handlers, the ~50-line manual reset block in `selectFunction()`, and the
imperative `loadX()`/`xLoading` pairs. Those last two are exactly what the two declined scopes above
would remove — the reset block collapses when state is `computed()` from a `selectedFunction` signal,
and each `loadX()`/`xLoading` pair collapses into one `toSignal(... switchMap ...)` stream (which
would also close a real latent bug the imperative version has: a slow first response can overwrite a
fast second one, since nothing cancels the in-flight request when the user re-clicks).

## B3's own contingent account-entry pair removed — `EPLC_EXAMINATION` now correctly generates no `contingentAccountEntry` at all

Reverses the "shown in the ledger as a real, named pair rather than silently absent" design choice made
in the original contingent-account-entry feature (see that section above): `EPLC_EXAMINATION` CREATE
(B3, Present Docs) never actually posts to the books — Design Principle D3 ("Documents arriving is a
physical event... Only legal events move balances") and B3's own MEMO_ONLY classification already
establish this; the account-entry feature had nonetheless generated a named
`Dr Export Bills — Received, Under Examination (memo) / Cr Export Bills — Contra (memo)` pair and
surfaced it through the API/UI same as every real contingent event. User confirmed, after being told B4
does not (and structurally cannot) reverse this pair — since B4 only ever *releases* B3's own PENDING
CREATE rather than posting a separate closing movement — that the pair should simply never have been
generated in the first place.

**Fix, `microservices/balance-component/src/domain/contingentAccountEntry.ts`:** `EPLC_EXAMINATION`
moved out of its own `EXAMINATION_FAMILY` case into the same `null`-returning case group as the three
`ON_BALANCE_ASSET` instruments (`accountFamilyFor()`), with a doc comment explaining why. The
now-unreferenced `EXAMINATION_FAMILY` constant removed outright (BAL-101-style dead-code posture — no
partial/half-used state left behind). `createMovement()` in `service/balanceService.ts` needed no
change — it already just persists whatever `deriveContingentAccountEntry()` returns, `null` included,
same as it already does for the three out-of-scope on-balance-sheet instruments.

**Not touched, deliberately:** `analysis/contingent-liability-ledger.html`'s own Folio 4 B3 row —
already tagged `No GL effect` there (footnote 2: shown as a row specifically so B3 is "visibly
accounted for rather than silently absent" from the *reference document*, not a claim that the system
posts it). That documentation-only framing was already correct; only the code's own behavior was
out of step with it.

**Tests:** `test/unit/domain/contingentAccountEntry.test.ts`'s own `EPLC_EXAMINATION` describe block
rewritten from asserting the memo pair to asserting `null`. No other test (microservice or Angular)
asserted a `contingentAccountEntry` shape specifically for `EPLC_EXAMINATION`/B3 — the Angular
"Account Entries" button is already generically gated on `*ngIf="...?.contingentAccountEntry"`, so it
now simply never renders for a B3 submission, with no component/template change required.

## Inquire Events added — Angular-only, OOD Design Patterns

New top-level mode on the Transaction Builder (`activeMode: 'PROCESSING' | 'INQUIRE'`, a tab toggle
sibling to the existing Import/Export function tabs, reachable without first picking a business
function — deliberately not gated behind `selectedFunction` the way the existing "Look Up Current
Balance" panel still is, out of scope to change here): pick an LC Number (Import LC / Confirmed LC),
see every transaction Event under it — merged across ALL its child ledgers (Acceptance/SG/Examination),
sorted by true Event Date/Time (`createdAt`, not the per-contract-scoped `eventSeq`) — then, on
selecting one, see its original transaction screen restored read-only plus its Account Entries.

**Design principle (user-stated) — reuse existing screens/logic/services rather than duplicate them —
honored literally**: zero new HTTP endpoints (reuses `resolveContract`/`catalog`/`listMovements`), zero
new field definitions (reuses `buildFields()` unchanged), zero new function registry (reuses
`IMPORT_FUNCTIONS`/`EXPORT_FUNCTIONS`), zero new dialog (reuses `openAccountEntryDialog()` and its
existing template block verbatim — confirmed live: the SAME dialog, byte-for-byte, opens correctly from
an Inquire Events row).

**OOD Design Patterns applied, per the user's explicit request:**
- **Facade** — new `src/app/transaction-builder/inquire-events.service.ts`
  (`InquireEventsService`), a plain class over `BalanceComponentApiService` + the function registry +
  `buildFields()`, mirroring `LookUpPanelService`'s own existing role and "plain class, not
  `@Component`" testability convention (this file's own test suite constructs
  `new TransactionBuilderComponent(mockApi)`, no TestBed — a real child component's
  `@ViewChild`/`@Input`-`@Output` wiring would never resolve there).
- **Decorator** — new `toReadOnlyFields()` (`builder-fields.ts`, next to `buildFields()`): wraps
  `buildFields()`'s own output to force every field `disabled: true` and strip `expressions` (which
  would otherwise re-evaluate every change-detection cycle and could undo the forced state), without
  touching `buildFields()` itself (Open/Closed) — the live Maker form and the read-only Inquire Events
  screen decorate the exact same field definitions differently, they don't duplicate them.
- **Strategy (reused table, not a new hierarchy)** — new `resolveFunctionForMovement()`
  (`balance-component.model.ts`): treats the existing `IMPORT_FUNCTIONS`/`EXPORT_FUNCTIONS` registry as
  a lookup table keyed by `(instrumentType, movementType)`. Handles three cases where the registry's own
  `movementType` is a placeholder (the real value is derived elsewhere): `movementTypeFromContractTenor`
  (B4 — HONOUR vs ACCEPT), `autoRedeemType` (A9 — FULL_REDEEM vs PARTIAL_REDEEM), and
  `settlesAcceptanceOnMature` (B5 — FULL_SETTLE vs PARTIAL_SETTLE). **Known, explicitly-accepted
  limitation** (same honesty convention as BAL-108's own "left as-is, documented" entries): a few
  `(instrumentType, movementType)` pairs are produced by more than one function code (e.g. `IPLC_LC`/
  `UTILIZE` — both A3 and A3S; `SHGT`/`FULL_REDEEM` — both A9 and A3S's own first leg). The resolver
  returns the first registry match deterministically; the reconstructed FIELD SET is identical either
  way in every such case (the difference between the two functions is a label string, never which
  fields exist), so this only affects which function-code badge is shown, never the data displayed.
- **Adapter** — new `InquiredEvent` (`inquire-events.service.ts`): pairs a raw `BalanceMovement` with
  the `BalanceContract` that owns it, since a movement alone carries neither `instrumentType` nor
  `naturalKey`, both needed for the merged timeline and the screen reconstruction.
- **Single Responsibility** — `InquireEventsService` isolated from `TransactionBuilderComponent`, same
  separation convention as every other BAL-003 extraction already in this file.

**Child-ledger discovery** — new `childInstrumentTypesOf()` (`balance-component.model.ts`) inverts the
existing `PARENT_INSTRUMENT_OPTIONS` map ONCE at module load, rather than hand-writing a second parent→
child map: for `IPLC_LC` that resolves to `IPLC_ACCEPTANCE`/`SHGT`, for `EPLC_CONFIRMATION` to
`EPLC_ACCEPTANCE`/`EPLC_EXAMINATION`. The three `ON_BALANCE_ASSET` instrumentTypes
(`EPLC_DUE_FROM_ISSUING_BANK`/`EPLC_ACCEPTANCE_REIMB_RECEIVABLE`/`EPLC_EXPORT_BILLS_DISCOUNTED`) never
appear as anyone's child (their own `PARENT_INSTRUMENT_OPTIONS` entries are empty by design, same
"Balance Component 只負責 Contingent Liability" boundary `contingentAccountEntry` already enforces), so
they're correctly excluded from this timeline too — not a new scope decision, an inherited one. New
`defaultLcInstrumentTypeForSide()` (IMPORT→`IPLC_LC`, EXPORT→`EPLC_CONFIRMATION`) extracted out of
`LookUpPanelService.resetForSide()`'s own inline ternary and shared by both services — closes a
would-be duplication the moment a second caller needed the same default.

**Tests:** `inquire-events.service.spec.ts` (new, mirrors `checker-actions.service.spec.ts`'s own
mock-factory convention — `search()`'s cross-contract merge/sort, both `catchError` swallow paths,
`selectEvent()`'s function resolution incl. the documented A3/A3S-style ambiguity and the unresolved-
function fallback); `balance-component.model.spec.ts` (new `resolveFunctionForMovement`/
`childInstrumentTypesOf`/`defaultLcInstrumentTypeForSide` describe blocks); `builder-fields.spec.ts`
(new `toReadOnlyFields` describe block); new `transaction-builder.component.inquire.spec.ts` (component-
level wiring only — `activeMode`/`selectMode()`, `inquireEvents` construction, Account Entries dialog
reuse — same "service owns its own behavior, component spec only proves the wiring" split this file's
other service/`.actions.spec.ts` pairs already use).

**Note on how this was verified live**: `npm run dev:all` failed outright (`EADDRINUSE` on all three
ports, 4100/4200/4300) — a dev stack from an earlier session was already running. Per this project's own
established "don't chase port conflicts" posture, verification connected directly to that already-
running `ng serve` instead of killing/restarting it; its watch mode had already picked up every source
change made in this pass (confirmed: the new mode toggle rendered immediately with no manual reload).

## Inquire Events — Balance Snapshot / Closing Balance per Event, zero backend changes

Follow-up to the Inquire Events feature immediately above: for a selected Event, also show (a) the
actual increase/decrease impact it caused, and (b) the point-in-time closing Snapshot/Balance, for every
relevant Balance Component — Import LC: LC Balance, Acceptance Balance, Shipping Guarantee Balance;
Export Confirmed LC: Confirmed LC Balance, Confirmed LC Acceptance Balance.

**Key finding, before writing anything: the microservice already had a working, tested, point-in-time
balance endpoint.** `GET /balance-movements/:movementId/balance-as-of`
(`routes/balanceMovements.ts` → `service/balanceService.ts`'s `getBalanceSnapshotAsOfMovement()` →
`getBalanceSnapshot(contractId, asOfEventSeq)`, reusing the exact same `computeConfirmedBalance()`/
`computeAvailableBalance()` from `domain/balanceDerivation.ts` the LIVE snapshot uses, just fed a
movement list filtered to `eventSeq <= asOfEventSeq`) was built for an earlier "Balance as of event"
Angular panel later removed (replaced by the Event Timeline's plain "Balance After" column, per that
change's own template comment: "Event Timeline 上一行已經顯示了 不需再多選取"). The backend capability was
never deleted; `grep` confirmed the Angular side had zero references to it before this pass. Its own doc
comment already documents one accepted limitation: `offBalanceExposure`/`tightAvailableBalance` are NOT
point-in-time — they always reflect the SHGT side's CURRENT state ("out of scope for this prototype,"
not silently approximated). This pass inherits that same documented limitation rather than fixing it —
confirmed live (see below): an SG's own off-balance exposure figure shown alongside an older event was
the SAME as the live current figure, exactly as documented.

**Result: zero backend/microservice changes.** Everything below is Angular-side composition over an
already-existing, already-tested endpoint plus data `InquireEventsService` already fetches for the
merged Event Timeline.

**`balance-component-api.service.ts`** — one new client method, `getBalanceAsOfMovement(movementId)`,
`GET .../balance-movements/{id}/balance-as-of`, reusing the existing `BalanceSnapshot` interface
verbatim (zero new types).

**`balance-component.model.ts`** — new `BALANCE_SNAPSHOT_LABEL: Partial<Record<InstrumentType, string>>`,
covering exactly the 5 instrumentTypes the user named (`IPLC_LC`/`IPLC_ACCEPTANCE`/`SHGT`/
`EPLC_CONFIRMATION`/`EPLC_ACCEPTANCE`). Deliberately excludes `EPLC_EXAMINATION` even though it's one of
`childInstrumentTypesOf('EPLC_CONFIRMATION')`'s own results — `MEMO_ONLY`, never a real Balance
Component, same "只負責 Contingent Liability" boundary `contingentAccountEntry` already enforces for it.
A single flat map needs no IMPORT/EXPORT branching: a side-scoped event set never mixes both families.

**`inquire-events.service.ts`** — `selectEvent()` extended to also call a new private
`loadSelectedEventBalances()`, composing over `this.events` (already fetched, already time-sorted) with
zero new HTTP surface beyond the one client method above:
- `balanceCandidatesAsOf()` groups `this.events` by `balanceContractId`, restricted to
  `BALANCE_SNAPSHOT_LABEL`'s own keys, and resolves each group to the LAST entry with
  `createdAt <= selected event's own createdAt` — a plain filter+last since the source is already
  time-sorted, no re-sort needed. The selected event's OWN contract resolves through this exact same
  path (its own movement trivially IS the latest at-or-before its own time) — no special-casing between
  "primary" and "sibling" ledgers. A contract with no qualifying entry (didn't exist yet at that point)
  becomes `asOfMovementId: null`, turned into a `snapshot: null` row (rendered "not yet created") rather
  than an API call.
- `loadSelectedEventBalances()` `forkJoin`s one `getBalanceAsOfMovement()` call per candidate (skipped
  entirely, zero calls, when `candidates.length === 0`), each wrapped in its own `catchError` so one
  contract's fetch failure doesn't blank the others → new `selectedEventBalances: SelectedEventBalanceRow[]`.
- **Impact (increase/decrease)** — deliberately NOT a new fetch: reuses `movement.balanceBefore`/
  `balanceAfter`, already present on every fetched movement, zero extra call. Both null on a still-
  PENDING movement (Confirmed Balance doesn't move until Release, same domain semantics everywhere else
  in this app) — rendered as "Still PENDING — Confirmed Balance not yet affected" rather than a numeric
  delta. Available Balance's own point-in-time value (which DOES move immediately for a PENDING
  movement, per `computeAvailableBalance`'s own PENDING-delta term) still comes through correctly via
  the row's own snapshot — no special-casing needed, the reused endpoint already gets this right.
- `balanceRowTitle()` — "{label} — LC {lc}" / ".../ IB {ib}" / ".../ SG {sg}", mirroring
  `LookUpPanelService.activeLookupLabel`'s own suffix convention but kept independently implemented
  rather than extracted into a shared helper — a behavior-risk-for-a-cosmetic-string tradeoff judged not
  worth it against that already-shipped, already-tested panel.

**Template reuse — extracted, not duplicated, the "Current Balance" box.** The Look Up panel's own
pre-existing balance box (`.tb-balance-box.tb-balance-box--current`, bound to
`lookUp.activeLookupSnapshot`) is now a single shared `<ng-template #balanceSnapshotBox let-title
let-status let-snapshot>`, declared once at the root of the template (visible to both `*ngIf` branches
it's invoked from) and invoked via `*ngTemplateOutlet`/`[ngTemplateOutletContext]` from BOTH the Look Up
panel (unchanged bindings, now routed through the shared template — a template-only extraction, zero TS/
logic change) AND the new Inquire Events balance rows (one outlet call per `selectedEventBalances` row).
This is what actually satisfies the user's own "ensure consistent behavior between Transaction
Processing and Event Inquiry" wording literally — one canonical markup block, two call sites, not two
independently-maintained copies of the same field list. `transaction-builder.component.ts` also exposes
`readonly balanceSnapshotLabel = BALANCE_SNAPSHOT_LABEL` as the "Balance Impact" box's own label lookup
(same reused map, no second copy).

## Inquire Events UI polish — mode-tab spacing, A1/B1 Currency dropdown, single-entry-point View

Three small independent fixes: (1) `mb-4` spacing added to the mode-tab toggle div, not the shared
`.tb-tabs--side` class (reused by other tab bars that don't need it). (2) A1/B1 Currency — free-typed
input → dropdown (new `CURRENCY_OPTIONS`, the same 10-code set as `lc-payment-wc`'s own currencies.json,
static client-side list since this project has no currency master). Only A1/B1 get the dropdown — every
other function carries/protects Currency and stays a plain input regardless. (3) The merged Events
table's row-level "Account Entries" button removed — the "View" panel below already covers Transaction
Details + Account Entries + Balance Snapshot in one place, making the row-level button a redundant
second path to the same call.

## Event Snapshot correctness fix, then simplified to ONE snapshot per Event

Round 1: the multi-row "Closing Snapshot" design resolved a sibling contract's own row via that sibling's
OWN latest-movement cutoff, not the originally-selected event's — if a third contract had activity
in between, it was silently missed. Fixed with a cross-contract-safe `asOfTimestamp` query. Round 2: the
user then simplified the whole feature to exactly ONE "Event Snapshot" box (the event's own ledger only,
merging the separate Balance-Impact delta into it) — obsoleting Round 1's cross-contract fix entirely,
since a same-contract snapshot only needs the existing eventSeq-based cutoff. The Round-1 code was
reverted the same day rather than kept "just in case." The shared `#balanceSnapshotBox` template gained
an optional `impact: {before, after}` context param (from `balanceBefore`/`balanceAfter`) that annotates
Confirmed Balance with a before→after delta or "still PENDING" — the Look Up panel's own call site omits
it, unaffected.

## Persisted Event Snapshot on BalanceMovement — Create + Release, one stored column

Design: `getBalanceSnapshot()`'s assembly logic extracted into `assembleSnapshot(contract, movements,
shgtMovements, examinationMovements)` — both `createMovement()` and `release()` build their own already-
correct movement list and call the same function, so there's no drift risk between on-demand and
persisted computation. `createMovement()` captures a PENDING snapshot before insert (simulated
in-memory, no extra DB read); `release()` captures the RELEASED-state snapshot into a new `eventSnapshot`
column via `COALESCE(@eventSnapshot, event_snapshot)` — every other caller of `updateStatus()` omits the
param, correctly preserving whatever was there (the "don't touch" behavior `reject()`/`cancel()` need
with zero special-casing, since both are explicitly out of scope for this feature). New
`BalanceMovement.eventSnapshot?: BalanceSnapshot | null` (migration id:5), hand-kept-in-sync on the
Angular side. `InquireEventsService.selectEvent()` now prefers `movement.eventSnapshot` directly (zero
API call) and falls back to `getBalanceAsOfMovement()` only when null (pre-migration data) — that
endpoint stays live as the historical-data fallback, not dead code.

**Test coverage**: microservice — new `describe('BalanceService — persisted Event Snapshot...')` in
`test/unit/service/balanceService.test.ts` (createMovement() PENDING capture including the new
movement's own earmark contribution and proven `toEqual` against `getBalanceSnapshotAsOfMovement()`;
release() overwrite proven `confirmedBalance` 0→100000; reject() proven to leave the PENDING snapshot
untouched; an SHGT/parent-LC cross-contract case proving offBalanceExposure is null on the SHGT's own
snapshot but populated on the parent LC's next event); new HTTP integration `describe` in `app.test.ts`
(POST create → PENDING snapshot in the response body; POST release → overwritten RELEASED snapshot,
also visible via the Event Timeline; a later PENDING movement's snapshot proven `toEqual` against a
live `GET .../balance-as-of` call for the same movement); `migrations.test.ts` updated to assert
`event_snapshot` is among the columns added on a fresh run. 300/300 microservice tests green,
99.15/96.55/100/99.43% coverage (new code fully covered; the handful of uncovered lines are pre-existing,
unrelated to this change). Angular: two new tests in `inquire-events.service.spec.ts` (reads
`movement.eventSnapshot` directly with `getBalanceAsOfMovement` proven NOT called; falls back to it when
`eventSnapshot` is null) — 703/703 Angular tests green, 99.73/96.43/99.51/99.77% coverage. `backend/`
33/33 unaffected (passthrough). `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint` (both projects,
0 errors, only pre-existing warnings), `npm run build` (microservice `tsc -p tsconfig.build.json`,
Angular `ng build`) all clean.

## Inquire Events — Balance Tabs (LC/Acceptance/SG, tenor-gated)

Viewing a child-ledger event (e.g. an SG's own Issue) showed only its own ledger balance, not the parent
LC's off-balance-exposure impact. A first redirect-the-snapshot-to-the-parent attempt just traded one
missing story for the other; the real requirement is up to 3 tabs shown together:

| Side + Tenor | Tabs |
|---|---|
| Import, Sight | LC Balance, Shipping Guarantee Balance |
| Import, Usance | LC Balance, Acceptance Balance, Shipping Guarantee Balance |
| Export, Sight | Confirmed LC Balance |
| Export, Usance | Confirmed LC Balance, Acceptance Balance |

A child tab (Acceptance/SG) populates only when the selected Event belongs to that specific child; the
LC/Confirmed LC tab always populates. New `BalanceMovement.rootEventSnapshot` (migration id:6) —
populated only for a child-ledger movement, holding the parent's own plain balance at the same
create/release moment — additive alongside `eventSnapshot`, neither replaces the other.
`selectedEventIsUsanceLc`/`selectedEventHasSg` getters mirror `LookUpPanelService`'s own identical
tab-gating rule (reused, not reinvented).

## Sibling Acceptance/SG snapshots for root-level events (`acceptanceEventSnapshot`/`sgEventSnapshot`)

A plain A3 UTILIZE (no SG movement of its own) still needs the SG tab populated with the SG's own state
AT THAT TRANSACTION TIME, when exactly one SG candidate exists under the LC (two or more is ambiguous,
left empty). Persisted, not live-fetched, at `createMovement()`/`release()` time — new
`acceptanceEventSnapshot`/`sgEventSnapshot` (migration id:7), captured via
`BalanceService.captureSiblingSnapshots()` (reusing the existing catalog-lookup store method, no new
query shape). Store-layer subtlety: unlike `eventSnapshot` (always overwritten by `release()`, so plain
`COALESCE` is correct), these two fields can legitimately be recomputed to `null` at Release (e.g. a
candidate count newly ambiguous) — a plain COALESCE would wrongly preserve a stale Create-time value, so
an explicit `'acceptanceEventSnapshot' in params` flag distinguishes "recompute to null" from "key
omitted, don't touch."

## Inquire Events — "Secondary Ref." column (EPLC_EXAMINATION E01/E02, SHGT SG Number)

Pure client-side display — no backend/API change. Both values are already part of each event's own
loaded `contract.naturalKey`. New `secondaryReferenceFor(event)`: `EPLC_EXAMINATION` → bare `ibNumber`
(e.g. "E01"); `SHGT` → `"SG " + sgNumber`; every other instrumentType → "—". New column in the merged
Events table, right after Reference.

## Inquire Events row click replaces the "View" button; Submit locks all input fields read-only across A1–A9/B1–B5

Event row itself is now the click target (`.tb-table`'s own `tbody tr` already carries hover/pointer
styling from the pickable-row convention used elsewhere — zero new CSS). Separately: once Submit actually
creates a movement, all input fields become read-only — locked on `submitResult` being SET, not the bare
Submit click, so a validation-only failure (form stays editable to correct and resubmit) is unaffected.
New `formLocked` getter (`!!submitResult`) and `displayFields` getter
(`formLocked ? toReadOnlyFields(fields) : fields`) — reuses the `toReadOnlyFields()` Decorator already
built for Inquire Events, not a new mechanism.

## Primary Key (LC Number) / 2ndary Key (IB/SG Number) — mandatory audited, and protected after Submit

Audit found every mandatory-field validation path already correct (creating functions reject a blank LC
Number; two-field search rejects a blank LC/IB/SG Number before calling the resolve API; flat-Catalog
functions reject with no `selectedContract` picked) — no code change needed there. The actual gap: the
`formLocked` read-only lock (see entry above) only covers the Formly `fields` array — the Primary/2ndary
Key inputs are plain `<input>` elements bound via `ngModel` OUTSIDE that array, so a Maker could still
retype the LC/IB/SG Number or click a different picker row after a movement was already created,
silently changing the resolved contract under a form that looked submitted. Fixed with
`[disabled]="formLocked"` on every Primary/2ndary Key input/Search button and a `!formLocked &&` guard on
every Maker-side picker's `(pick)` binding — the generic Checker panel's own picker is deliberately left
unguarded, since the Checker acts AFTER the Maker submits.

## Checker Release auto-resets the screen back to the same function

A genuine `'released'` outcome from `CheckerActionsService.release()` (plain path or any compound
release) now re-invokes `selectFunction(this.selectedFunction)` instead of the normal post-release
sync/refresh path — reusing the exact reset `selectFunction()` already performs for a fresh function
pick. `checkerLcNumber` is deliberately preserved by that same reset, so a Checker who just released one
item on an LC keeps it in the search box for the next PENDING item. Deliberately scoped to `kind:
'released'` only — A3S's `documentArrivalAcknowledged` outcome means the Document Arrival record itself
stays PENDING for A4/A6 to finalize later, so it's not a completed transaction to reset away from yet.

Two things found while verifying, not from a separate review pass: (1) `finishCheckerAction()`'s own
`reloadPayables` opt and the method it drove became fully unreachable once the new interception ran
first — confirmed via a genuine coverage regression, removed as dead code. (2) The new success branch
bypasses `finishCheckerAction()` (which normally resets `actionBusy=false`) — an early version left
`actionBusy` stuck `true` forever after every successful Release; fixed with an explicit reset before
calling `selectFunction()`.

## Bug fixed — Event Timeline's own Time column was silently clipped, not truncated by insufficient width

The Event Timeline table sits inside `.tb-section`, which has `overflow: hidden` — with no scroll surface
of its own, an overflowing `white-space: nowrap` Time column was silently clipped rather than scrolling
into view. Fixed by wrapping the table in a new `.tb-table-scroll` container (`overflow-x: auto`).

## Bug fixed — Inquire Events now shows A4 (Sight Settlement) as its own, correctly-timed row instead of hiding it inside A3's

A4 (`payExistingUtilize`) finalizes an EXISTING movement instead of creating a new one, so the shared
row carries only A3's own early `createdAt` — the merged timeline's createdAt-ascending sort had no way
to know A4's own much-later Release happened, so A4 never appeared as its own event.

**Fix**: `InquiredEvent` gained `eventTime`/`eventStatus`/`phase` — every sort/display now reads
`eventTime`. New `toEventRows()` splits a movement into 2 rows only when it's a finalized Sight-tenor
`IPLC_LC`/`UTILIZE` (the exact shape only A4 produces): `phase:'create'` (A3's submission,
`eventTime:createdAt`) and `phase:'finalize'` (A4's Release, `eventTime:releasedAt`). A `'finalize'` row
resolves its function via `payExistingUtilizeFunctionFor()` so "View" correctly shows A4, not A3.
**Superseded same day** (see next entry): the `'create'` row's `eventStatus` was originally forced to
`'PENDING'` regardless of the movement's real current status — reversed once the business clarified a
`'create'` row must always show the movement's TRUE CURRENT release state, not a frozen snapshot. The
row-split mechanism itself and the Balance Snapshot tabs' separate frozen-at-create-time behavior are
unaffected by that reversal.

## A3's own Event Snapshot now stays frozen at Create-time even after A4 finalizes it

`release()` always overwrites `eventSnapshot` via `COALESCE(@eventSnapshot, event_snapshot)` — for the
one movement Inquire Events splits into 'create'+'finalize' rows, this meant the 'create' row's own LC
tab silently showed A4's release-time figures, since both rows read the same underlying field.

**Fix**: new `BalanceMovement.finalizeEventSnapshot` (migration id:8) — for a Sight-UTILIZE finalize
(`isSightUtilizeFinalize`, the same gate BAL-123 already established), `release()` writes `eventSnapshot:
null` (a no-op through COALESCE — A3's value survives untouched) and the release-time figure goes into
`finalizeEventSnapshot` instead. Every other movement is byte-for-byte unchanged. Angular's `ownSnapshot`
local reads `finalizeEventSnapshot ?? eventSnapshot` for a `'finalize'`-phase row, `eventSnapshot` alone
otherwise.

## Snapshot-preservation extended to the SIBLING (SG/Acceptance) fields, then to Export Confirmed LC (B3/B4)

Two follow-ups closing gaps the eventSnapshot-only fix above didn't cover. Round 1: `release()`'s own
`captureSiblingSnapshots()` ran unconditionally on every release, including A4's much-later finalize of
A3's UTILIZE — silently overwriting A3's own correct "no SG yet" snapshot with the SG's by-then-existing
balance. Fixed the same way — new `finalizeAcceptanceEventSnapshot`/`finalizeSgEventSnapshot` (migration
id:9), frozen for a Sight-UTILIZE finalize. Round 2: the identical guarantee must hold for Export's own
B3/B4 — B3 (`EPLC_EXAMINATION`/CREATE, the Present Docs earmark) has the same shape as A3, always
finalized later by B4's compound release. Simpler fix: B3 never splits into two rows in the merged
timeline (B4 creates its own separate movement), so `eventSnapshot`/`rootEventSnapshot`/
`acceptanceEventSnapshot` just need to stay frozen at B3's own record — gated by a new
`isPresentDocsFinalize` condition, zero Angular changes needed. Deliberately NOT generalized to A6's own
Usance UTILIZE source-leg release — unlike B3 (no legitimate plain-release path), a Usance UTILIZE CAN be
released plainly with no companion "finalize" row to show current-state figures again; freezing it
unconditionally would introduce a different bug. Flagged as a known, deliberately out-of-scope case.

## UX enhancement — Look Up Current Balance's own Event Timeline rows are now clickable, opening a "View Voucher" pop-up

This panel's own Event Timeline table still had a per-row "Account Entries" button rather than a
whole-row click — reversed to match the convention Inquire Events' own Events table already uses. The
"Entries" column/button removed; the whole `<tr>` now dispatches `openAccountEntryDialog(m)` directly
(reuses the existing `.tb-table` pickable-row hover/pointer styling). The shared dialog itself was
retitled "Account Entries" → **View Voucher**; trigger button labels elsewhere are unchanged. New hint
("No voucher entries recorded for this event.") shows in place of the Dr/Cr table when the clicked event
has no `contingentAccountEntry` — so whole-row-click never opens a silently-empty dialog.

## Follow-up UX enhancement — SG/Acceptance picker rows enriched into a self-describing catalog format

The SG/Acceptance candidate picker rows under Look Up Current Balance showed only a bare
`sgNumber`/`status` (e.g. "G02 — ACTIVE") — meaningful only once the user already knows which LC/tab
they're under. Enriched to `LC {{ lcNumber }} — Secondary Ref. {{ sgNumber/ibNumber }}` as the primary
line and `{{ balance type label }} — {{ status }}` as the badge line. New
`LookUpPanelService.acceptanceBalanceLabel` getter — the same side-aware "Acceptance Balance" vs.
"Confirmed LC Acceptance Balance" rule `InquireEventsService` already uses, reused rather than
duplicated — also applied to the Acceptance tab button itself (previously hardcoded), so the tab header
and its own picker rows never disagree.

## Two more Inquire Events UX enhancements — client-side pagination, then a "Function" column

With S01 carrying 16 merged events (5 split Sight UTILIZEs + 5 SG movements), the single unpaginated list
was a real UX gap. New `eventsPaging = new PagedListState(10)` — deliberately CLIENT-SIDE windowing over
the already-loaded, already-sorted `events` array, not a re-fetch per page (unlike `CatalogPickerService`'s
own use of the same class): `loadEvents()` merges every contract's movements into one globally-sorted
timeline, so there's no per-page API call that makes sense. New `pagedEvents` getter, `prevEventsPage()`/
`nextEventsPage()`, a hand-rolled Prev/Next control block (mirroring `app-index-picker`'s visual
convention, not reused directly — that component renders 2-line rows, not a multi-column table).

**Function column**: new public `InquireEventsService.functionFor(event)` — extracted from `selectEvent()`'s
own inline resolution so both the "View" header and the merged table's new first column share one
resolution. New leading `<th>Function</th>`, showing `{{ fn.code }} · {{ fn.label }}` or "—" when
unresolved. Also wrapped the table in `.tb-table-scroll` proactively (the same overflow-clipping fix the
Look Up panel needed) since an 8th column risked reproducing that bug.

## Bug fixed — A6/B4's own Parent LC picker wrongly excluded a parent whose Available Balance was already 0

Server-side data and A6's own Step-2 `loadPayableMovements()` filter were never at fault — the break was
in `filteredParentCatalog` (Step 1, the LC Index picker A6/B4 use to pick their parent).

**Root cause**: `filteredParentCatalog`'s 0-balance exclusion is correct for flat-Catalog-style pickers
(a parent with nothing left in Available Balance genuinely has nothing to draw against), and A7/B5 were
already exempted from it (their own remaining balance is irrelevant to whether they still have an
outstanding record to finalize). A6/B4 need the identical exemption but use a different branch of the
same getter, so the earlier exemption never covered them. A6/B4 finalize an already-earmarked PENDING
record, not draw fresh capacity — and that earmark is exactly what drops the parent's own Available
Balance, often straight to 0 when one presentation draws the whole LC down (the ordinary case, not an
edge case) — the more completely a Document Arrival used up its LC, the more certain this bug was to
hide it from A6.

## A3/A3S's own "exceeds Available Balance" warning gained a second tier for Tight Available Balance

The existing warning only compared the typed amount against plain Available Balance — it had no
knowledge of Tight Available Balance, even though `checkUtilizeSufficiency()` (`offBalanceExposure.ts`,
§6.1) is a genuine two-tier check and Tight Available is the one that actually binds whenever the LC has
outstanding SHGT exposure. An amount between Tight Available and plain Available was never warned about
client-side, even though the server hard-rejects it.

**Fix**: a second `.tb-error` block, firing when `+model.amount > +selectedContractSnapshot.
tightAvailableBalance` (only reachable once the first warning already didn't fire). Scoped to
`model.movementType === 'UTILIZE'` — the one movementType `checkUtilizeSufficiency()` governs (A2's own
AMEND_DECREASE check never uses Tight Available, so showing this warning there would be misleading).
Conditionally omits the "use Document Arrival w/ Shipping Gtee instead" hint when already on A3S, so A3S
never tells the Maker to switch to the function they're already on.

## Bug fixed — both A3/A3S balance-box warnings could fire AFTER a successful Submit, making an already-accepted transaction look freshly rejected

Both warnings are pre-submit hints computed live from `model.amount` vs. the current
`selectedContractSnapshot` — plain template bindings outside the Formly `fields`/`displayFields` array. A
successful Submit refreshes the snapshot immediately (Available Balance drops to reflect the new PENDING
earmark), but `model.amount` is never cleared — so the stale typed amount kept re-comparing against the
new, already-reduced balance, making an already-successful Submit immediately display "this will be
rejected." Since the balance box lives outside the Formly field array, the earlier `formLocked` read-only
lock never reached it. Fixed by gating both `.tb-error` blocks on `!formLocked` — the same signal that
already greys out every Formly field once Submit succeeds.

## Bug fixed, microservice-side — a root LC/Confirmation's own ISSUE being still PENDING never blocked ANY other event against it, and could produce a genuinely NEGATIVE Confirmed Balance

`createContract()` sets `status: 'ACTIVE'` at Maker Submit time (before Checker Release), and Available
Balance already reflects the ISSUE's own PENDING contribution — so a freshly-Issued, not-yet-Released LC
looked indistinguishable from a genuinely-approved one to every other function. Reproduced: Issued a
Sight LC, left it PENDING, then created AND RELEASED a Document Arrival UTILIZE against it —
`confirmedBalance` came back negative, since Confirmed Balance only sums RELEASED movements and the
ISSUE itself was still PENDING (not yet counted) while the UTILIZE's own negative contribution posted
regardless. A real accounting-integrity violation, not just a UX inconvenience.

**Fix**: new `ROOT_INSTRUMENT_TYPES = {'IPLC_LC', 'EPLC_LC', 'EPLC_CONFIRMATION'}` — the only
instrumentTypes with no parent of their own — and a new private `assertRootIssueReleased()` throwing
`IllegalStateTransitionError` (409) unless the contract's own ISSUE is RELEASED. Wired into
`createMovement()` at two points: (1) an existing root contract taking any movementType other than ISSUE
itself; (2) creating a new CHILD contract with `parentLogicalContractId` set — the parent's ISSUE must
already be Released. A child's own later actions need no separate check, since ISSUE approval is
permanent once proven at the child's own creation time. `ISSUE` itself is exempt from guard #1 (it's the
movement establishing approval in the first place).

Deliberately NOT extended to a client-side UX filter this pass (e.g. excluding a not-yet-Released LC from
pickers) — a Maker who tries now gets a clear 409 rather than a silently-narrowed picker.

## Follow-up — the picker-level filter deferred above turned out to be needed after all

**Design — new opt-in `requireIssueReleased` catalog filter, not a blanket change.** `listCatalog()` is
also called internally for purposes that legitimately need not-yet-released candidates (SG-Issue-cap
check, Present-Docs-earmark check, `captureSiblingSnapshots()`) — filtering those would silently change
candidate counts for unrelated business logic. New `CatalogFilter.requireIssueReleased?: boolean`
(default false, opt-in only), wired into `listCatalog()`'s SQL via an `EXISTS` check for a RELEASED
ISSUE/CREATE — covers root and child contracts with one clause.

**Applied on the Angular side to every Maker-side ACTION picker, not to inquiry-only contexts**:
`CatalogPickerService.load()` passes `true` unconditionally (backs every A1–A9/B1–B5 picker, so this one
change fixes the reported A4 case plus every sibling picker); A3S's SG picker and B5's settleable-balances
picker also pass `true`. `loadPayableMovementsAcrossChildContracts()` (B4's Present Docs search) is
deliberately left unfiltered — B3's own CREATE is DESIGNED to stay PENDING until B4's compound Release
finalizes it, so filtering by "already Released" would exclude every real candidate B4 needs. Look Up
Current Balance and Inquire Events are also untouched — a Maker/Checker can still look up a still-pending
record's current state, just can't pick it to act further on.

## `BalanceSnapshot.tightAvailableBalance` extended to Export Confirmed LC

Previously populated only for `IPLC_LC`/`EPLC_LC` (§6.1: `availableBalance` minus `offBalanceExposure`).
`EPLC_CONFIRMATION` has no sibling SHGT exposure to net out (SHGT is Import-only) — the Export-side
analog is `availableBalance` minus the combined `presentDocsEarmarkPending`+`presentDocsEarmarkApproved`.
Both figures serve the same purpose (a Checker's true remaining capacity) via a different source.
`offBalanceExposure` itself stays null for `EPLC_CONFIRMATION` — only `tightAvailableBalance` gains this
second, differently-computed population case.

**Fix**: the single shared `assembleSnapshot()` helper (every snapshot surface funnels through it) now
also computes `tightAvailableBalance = available.minus(computePresentDocsEarmark(examinationMovements))`
inside the existing `EPLC_CONFIRMATION` branch — reusing the already-imported domain function, no new
logic. Because every snapshot funnels through one helper, this single change automatically applies to
Look Up Current Balance, Inquire Events' Balance Tabs, and every persisted snapshot field, not just the
live balance endpoint.

Found and fixed a real display bug while wiring this up: the Transaction Builder's own inline balance
box had "Tight Available" nested INSIDE the "Off-Balance Exposure" row's `*ngIf` — correct when the two
were always populated together (Import LC only), now wrong since `EPLC_CONFIRMATION` populates
`tightAvailableBalance` while `offBalanceExposure` stays null. Split into two independently-gated rows.

## Bug fixed — B3 Present Docs → Submit → Release → "Look Up Current Balance" showed "No Logical Contract exists yet" instead of the parent Export Confirmed LC

`syncLookupToContext()` passes the function's own `instrumentType` to `LookUpPanelService.syncFrom()`,
which must map every CHILD instrumentType to its parent LC/Confirmation before resolving.
`lcInstrumentTypeFor()` already mapped `IPLC_ACCEPTANCE`/`SHGT`/`EPLC_ACCEPTANCE` to their parents, but
**`EPLC_EXAMINATION` (B3) was missing** and fell through to the identity default — so after any B3
action, Look Up's own `lookup.instrumentType` stayed stuck at `EPLC_EXAMINATION` itself, which can never
resolve since its natural key also requires `ibNumber`. Fixed by adding the missing case:
`EPLC_EXAMINATION` → `EPLC_CONFIRMATION` (same reasoning as its three siblings — `EPLC_EXAMINATION` is
`MEMO_ONLY`, never itself a real ledger worth looking up).

## Bug fixed — Inquire Events' merged Events table showed a blank Function column for B4's own Usance Acceptance-liability compound leg

`resolveFunctionForMovement(instrumentType, movementType)` is a Strategy-table lookup requiring a
registry entry whose OWN `instrumentType` matches — but B4 creates an `EPLC_ACCEPTANCE`/`CREATE`
movement as a secondary leg of its Usance compound Submit, while B4's own registry entry is
`instrumentType: 'EPLC_CONFIRMATION'` (it targets via the flat Catalog). So a direct lookup could never
match this leg to B4 — a real, in-scope ledger event, not one of the genuinely out-of-scope asset legs
that correctly stay blank.

**Fix**: `resolveFunctionForMovement()` falls back, only when the direct match finds nothing AND
`instrumentType === 'EPLC_ACCEPTANCE' && movementType === 'CREATE'`, to the EXPORT_FUNCTIONS entry with
`createsAcceptanceReimbReceivableOnCreate` — resolving to B4. Scoped narrowly to this one known gap;
`FULL_SETTLE`/`PARTIAL_SETTLE` still resolve to B5 via the pre-existing direct match, untouched.

## Movement status display gains a third label, EARMARK — scoped narrowly to Import Document Arrival / Export Present Docs, NOT every RELEASED status

`displayStatus()` already relabeled wire-level `RELEASED` to "Approved" for display (the underlying
`status` field never changes). APPROVED stays the default; EARMARK applies ONLY to a RELEASED
`IPLC_LC`/`UTILIZE` (Import Document Arrival — A3/A3S) or `EPLC_EXAMINATION`/`CREATE` (Export Present
Docs — B3). Both are D3 "physical event, not a legal event" earmarks — the amount they reserve doesn't
become the bank's definitive contingent position until a later, separate legal event (A4/A6 Settlement,
B4 Honour/Acceptance) finalizes it, so even once Checker-Released, "earmarked, not yet permanent" is
still accurate. Every other RELEASED movement IS that definitive legal event for its own leg.

**Fix**: new pure function `isEarmarkOnlyRelease(instrumentType, movementType)` — true only for the two
pairs above. `displayStatus()` gained two optional params; `RELEASED` now resolves to
`isEarmarkOnlyRelease(...) ? 'EARMARK' : 'Approved'`. Since `BalanceMovement` carries no `instrumentType`
of its own (only its parent contract does), every template call site needed its own source for it.

## Status badge gains a distinct color for EARMARK — a 5th color, not reused from PENDING/APPROVED

The status badge's own CSS class binding was never updated alongside the label split, so both EARMARK and
Approved rendered in the same green color. New `--violet`/`--violet-dark`/`--violet-bg` tokens (matching
the existing color/color-dark/color-bg naming convention) — chosen over reusing `--blue`, since blue is
already used by the adjacent Type-column tag in the same row and would blend in. Consolidated the 3
template call sites' own duplicated 4-way class-binding expansion into one `statusBadgeClass(status,
instrumentType, movementType)` method mirroring `displayStatus()`'s signature — label and color are
guaranteed to stay in sync by construction, since both read the identical `isEarmarkOnlyRelease()` check.

## Look Up Current Balance's own Event Timeline now shares the EXACT SAME status/display logic as Inquire Events, not a second independent copy

All 5 UTILIZE movements in the reported data genuinely ARE `status: RELEASED`, so EARMARK was the
factually correct label — the report wasn't about a wrong value. The real inconsistency: Inquire Events
already splits a finalized Sight `IPLC_LC`/`UTILIZE` into TWO rows ('create' historically PENDING,
'finalize' the real current status) via `toEventRows()`. Look Up Current Balance's own Event Timeline
never applied this split — it read `m.status` straight off the raw movement, showing one row for the
current terminal state. For the same underlying movement, the two screens disagreed.

**Fix — share the exact function, not duplicate the logic.** `toEventRows()` extracted from a private
`InquireEventsService` method to a module-level exported function, so `LookUpPanelService` can call the
identical implementation instead of maintaining a second copy. `lookupMovements`/`acceptanceMovements`/
`sgMovements` retyped from `BalanceMovement[]` to `InquiredEvent[]`; the Event Timeline template now
reads `row.eventStatus`/`row.eventTime` (not the raw movement's own status/createdAt), matching Inquire
Events' column semantics exactly. Balance After is also blanked to "—" for a 'create'-phase row, for the
same reason Inquire Events already suppresses it there.

## REQUIREMENT — Event Status Display Mapping (settled — do not re-derive)

Authoritative spec for how a `BalanceMovement`'s PENDING/RELEASED status is displayed app-wide.

| Function                     | Transaction NOT Released | Transaction Released |
|-------------------------------|---------------------------|------------------------|
| Import LC — A3 / A3S          | EARMARKING                | EARMARKED              |
| Export Confirmed LC — B3      | EARMARKING                | EARMARKED              |
| All other functions           | PENDING                   | APPROVED               |

**RELEASE definition**: "Released" means one thing only — the specific `BalanceMovement` row's own
`status` field equals `'RELEASED'`. Never inferred from a Balance snapshot's recompute state, an Inquire
Events row's existence, or a sibling movement's release. Must always reflect the movement's genuine,
CURRENT release state — including for a split A3/A4 `'create'`-phase row: both the `'create'` and
`'finalize'` rows read the SAME underlying movement's real current `status`, never a frozen snapshot of
what it was earlier (this does NOT apply to the separate Balance Snapshot tabs, which remain
deliberately frozen at Create-time by an unrelated decision).

**Mandatory consistency requirement**: Look Up Current Balance and Inquire Events MUST use exactly the
same Status Mapping Logic — a single shared function (`isEarmarkFunction()` in
`balance-component.model.ts`), never two independently-maintained classification schemes.

**Scope** (`isEarmarkFunction()`'s exact rule): `IPLC_LC`/`UTILIZE` (A3/A3S) and `EPLC_EXAMINATION`/
`CREATE` (B3) — AND ONLY when the row's own `phase` is not `'finalize'` (a `'finalize'` row is A4's real
legal-settlement event, not A3/A3S's earmark, even sharing the identical instrumentType/movementType).
Every other pair, including B4 and A4 itself, falls into "all other functions".

## Bug fixed — a finalized Sight Document Arrival's own A4 "finalize" row wrongly inherited A3's own EARMARKED label

`isEarmarkFunction()` classified purely by `(instrumentType, movementType)` — correct for the common case,
but `toEventRows()`'s split represents a finalized Sight Document Arrival as TWO rows sharing the
identical `(IPLC_LC, UTILIZE)`: `'create'` (A3's own submission, genuinely A3/A3S's earmark) and
`'finalize'` (A4's own Release, a real legal settlement event) — the "Function" column already correctly
said "A4 · Sight Settlement" right next to a contradicting "EARMARKED" badge. B3/B4 and A6's own compound
Usance path are unaffected — neither ever re-attributes a row this way, each creates its own separate
movement instead.

**Fix**: `isEarmarkFunction()` gained a third optional `phase` parameter — `phase === 'finalize'` now
unconditionally disqualifies, regardless of instrumentType/movementType. `displayStatus()`/
`statusBadgeClass()` both gained the same parameter, threaded through every call site holding a real
`InquiredEvent` row.

## Bug fixed — A3's own 'create' row Status was frozen at stale historical PENDING even after the transaction was truly RELEASED

`toEventRows()`'s `'create'`-phase row hardcoded `eventStatus: 'PENDING'` regardless of the underlying
movement's real current status, reasoned as "historically accurate." Caught live: an already-fully-
finalized Document Arrival's own 'create' row still showed EARMARKING — violating the REQUIREMENT
section's own RELEASE definition (must reflect the CURRENT release state, not a frozen one).

Confirmed via `AskUserQuestion`: the `'create'` row must show the transaction's TRUE CURRENT release
state, not a historical snapshot. **Fix**: `toEventRows()`'s `'create'` row now reads `movement.status`
(the same expression the `'finalize'` row already used) instead of a hardcoded `'PENDING'`. The
phase-based null-forcing on `ownImpact` (Balance Impact) was removed too, as a direct consequence —
suppressing the impact was the original design's own downstream effect of forcing the status to PENDING;
once the status is real, the impact must be shown too. Explicitly out of scope: the Balance Snapshot tabs
(`ownSnapshot`/`eventSnapshot`/`finalizeEventSnapshot`) stay frozen at Create-time by their own separate,
still-current business decision — this fix touches only the Status badge and Balance Impact, never the
Snapshot box's own figures.

## Bug fixed — Look Up Current Balance's own Event Timeline was missing every B3/EPLC_EXAMINATION Earmark event for Export Confirmed LC

`LookUpPanelService`'s Tab 1 Event Timeline only fetched movements for the LC's own `balanceContractId` —
correct for every other function, but `EPLC_EXAMINATION` (B3) is `MEMO_ONLY` with no dedicated Balance
Tab of its own, and every B3 presentation's CREATE movement lives on its own separate `BalanceContract` —
so it was invisible everywhere in Look Up Current Balance, even though Inquire Events' own merged
cross-ledger timeline already showed the same events correctly.

**Fix, reusing rather than duplicating Inquire Events' own merge mechanism**: `movementsOf$()`/
`childMovementsOf$()` (the functions `InquireEventsService.loadEvents()` already built its merged
timeline from) extracted to module-level exported free functions. `LookUpPanelService.
loadSnapshotAndMovements()` gained an optional `mergeChildTypes` parameter — the LC tab's own call site
passes `['EPLC_EXAMINATION']` when the contract is `EPLC_CONFIRMATION`, merging every B3 presentation's
movements into the Confirmed LC's own Tab 1 timeline. Sort key changed from `eventSeq` to `eventTime`
once more than one contract can contribute rows — `eventSeq` is only meaningful within a single contract,
so two contracts' own separately-numbered sequences would interleave incorrectly if compared directly
(the same reason Inquire Events' own merged timeline already sorts by `eventTime`).

## Bug fixed — B3's own Checker "Approve (acknowledgment only)" button stayed clickable on an ALREADY-acknowledged item

Both reported items were already correctly acknowledged (`acknowledgedBy`/`acknowledgedAt` set, status
still PENDING as designed), but a later re-click hit a correct server-side `IllegalStateTransitionError`
that surfaced client-side as a confusing "cannot be approved." (Not a status-mapping bug: B3's Checker
Release is deliberately acknowledgment-only and never transitions status — only B4's real release moves
EARMARKING → EARMARKED — so staying EARMARKING after Approve is correct.) The actual gap: the UI gave no
visible signal that Approve had already succeeded, so a Checker kept re-clicking.

**Root cause**: the Approve button's `[disabled]` binding read `arrivalApproved`, a per-session
client-only flag reset on every re-pick — it carried no memory of the item's own real, persisted
`acknowledgedAt`/`acknowledgedBy` fields.

**Fix**: new `arrivalAlreadyApproved` getter combining both the session flag (still needed for plain A3,
which has no backend acknowledgment at all) and the persisted field. The button and its hint now read
this combined getter; the hint text gains "— by {{ acknowledgedBy }} at {{ acknowledgedAt }}" when the
persisted field is the reason, so a Checker sees who approved it and is pointed to B4 instead of retrying.

## B3 (Present Docs) redesigned to genuinely RELEASE on its own — supersedes acknowledge()-only design

Reverses B3's acknowledgment-only Checker action and every "B4's compound release releases the B3 record
as one of its legs" mechanism built on top of it. Confirmed via `AskUserQuestion`: this specific case
(B3→B4) changes; every OTHER `deferSettlement` pair (A3→A4/A6) stays as designed.

**The accounting risk this had to solve first**: `computePresentDocsEarmark()` (the check preventing
E01+E02+...+En from exceeding a Confirmation's real Available Balance) filtered on `status === 'PENDING'`
only. If B3 got a plain standalone Release with no other change, a presentation's earmark would free the
moment its OWN Checker approved it — hours or days before B4 ever decides Honour/Accept — opening a real
window to over-commit beyond the LC's capacity. The earmark must keep occupying capacity through B3's own
genuine RELEASED state, releasing only once B4 actually *consumes* it.

**Fix — `presentDocsConsumedAt` tracks "consumed by B4", separate from `status` tracking "released by B3":**
- `computePresentDocsEarmark`'s basis changed: Pending = `status === 'PENDING'`; Approved = `status ===
  'RELEASED' && !presentDocsConsumedAt` — a presentation stays in the earmark total through its own real
  Release, dropping out only once consumed.
- `release()` gained a generic side effect: when the movement being released carries a
  `referencedTransactionId` pointing at an `EPLC_EXAMINATION`/`CREATE` movement (B4's linked Honour/
  Accept), that referenced Present Docs record is marked `presentDocsConsumedAt`/`presentDocsConsumedBy`.
- `acknowledge()` (the service method and route) removed outright — B3 now uses the standard `release()`/
  `reject()` path, same as every other function. `acknowledgedBy`/`acknowledgedAt` remain on the schema
  (historical round-trip only) but are never written again.
- New migration id:10 — `present_docs_consumed_at`/`present_docs_consumed_by`.

**Angular**: B3's registry entry loses all its `deferSettlement*` special-case flags — it's now a plain
function using the standard Checker release/reject path, same as A1/A2/A8/A9/B1/B2. B4's own
`payableMovementRequiresAcknowledgment` renamed to `payableMovementRequiresRelease` — its Step-2 picker
filter now looks for `status === 'RELEASED'` instead of the old acknowledgment shape. `checker-actions.
service.ts`'s `release()` (shared by A6/B4) now skips releasing the source when
`payableMovementRequiresRelease` is true (B4) — an already-RELEASED B3 record would 409 on a second
release; A6's own branch (Usance Document Arrival still needs releasing first) is unchanged.

**Backend**: Business Case Registry's Export Case #6/#7 rewritten — the Present Docs step now runs a
real `release` immediately after its own `createMovement`, before B4's own steps, matching the new flow.

## Bug fixed — B4's own Step-2 picker kept showing an ALREADY-CONSUMED Present Docs record as pickable again

Direct fallout of the redesign above. `loadPayableMovementsAcrossChildContracts()`'s candidate filter
checks `status === 'RELEASED'` — correct for excluding a not-yet-Released presentation, but an
already-consumed presentation ALSO stays `status: 'RELEASED'` forever (consumption sets
`presentDocsConsumedAt`, a separate field that never touches `status`). So a fully-processed presentation
kept reappearing as if available for a fresh B4 submission — which would create a second Honour/Accept
against the same record, double-counting the Confirmed Balance reduction.

**Fix**: the filter gained `&& !m.presentDocsConsumedAt`, on top of the existing checks — a no-op for
A6's own candidates (plain A3 UTILIZEs never set that field).

## Balance Snapshot box — Tight Available Balance moved to the last row

Pure display-order change in the shared `#balanceSnapshotBox` template — Tight Available Balance now
renders after Present Docs Earmark (Pending)/(Approved), so the two figures that combine to derive it are
already visible above it. Only affects Export Confirmed LC — Import LC's own SHGT-based figure has no
Present Docs Earmark rows to move past.

## Stylesheet professional-polish pass — all three SCSS files, pure CSS/no template or logic change

Refined the existing token-based design system; zero `.ts`/`.html` changes. New tokens
(`--font-sans`/`--shadow-sm/md/lg`/`--transition-fast`); a real bug fixed — `.tb-table`'s own
`border-radius` never actually clipped the table (the classic `border-collapse` + `border-radius`
gotcha), fixed with `overflow: hidden` on `.tb-table` itself; `.tb-table__amount` gained
`text-align: right`; the navbar branded to match the app's token palette; Business Case Runner's
trace-row colors moved onto the shared tokens; box-shadow elevation, focus-visible rings, and thin
scrollbars added across interactive elements. Business Case Runner's own `.card`/`.btn` elements
deliberately left as plain Bootstrap defaults — no custom classes exist there without a template change.

## Two-field search fallback (LC Number/IB/SG Number) now locks the instant a contract is found, not just at Submit

Audited the app's three ways a non-A1/B1 function resolves its LC: the Parent LC picker and the
flat-Catalog picker were already fully protected (pick-only, `!formLocked`-guarded); the
`usesTwoFieldSearch` free-text fallback (A7/A9/B5) was NOT — its inputs/Search button only locked at
Submit, staying editable for the whole window between a successful Search and Submit, unlike
`carriedCurrency`'s Currency lock which fires the instant a contract resolves.

**Fix**: the three `usesTwoFieldSearch` inputs and Search button gained `|| !!selectedContract` alongside
the existing `formLocked` condition — locking the moment a contract is found, matching Currency's timing.

## Look Up Current Balance's own Event Timeline gains a FUNCTION column — reuses Inquire Events' own resolution, not a second mapping

Sibling of the earlier status-unification fix — unifies the FUNCTION column Inquire Events' merged table
already has. `InquireEventsService.functionFor()`'s body extracted to a module-level
`functionForEvent(event)` function (same "share the function" convention `toEventRows()` established);
`LookUpPanelService` gained its own `functionFor(event)` delegating to the same free function rather than
reimplementing the Strategy-table lookup. New leading `<th>Function</th>` column in the Look Up Event
Timeline, markup copied from Inquire Events' own.

## A1/B1 LC Number gains a visible "LC Number *" label — closes the missing visual half of an already-enforced mandatory check

Validation was never the gap — `validateSubmit()` already rejected a blank LC Number for A1/B1. The
actual gap: LC Number is a plain `<input>` living outside `buildFields()`'s Formly array, so it never had
a real `<label>` or asterisk, unlike a Formly-rendered field like Amount (which gets both via
`props.required: true`). Fixed with a new `.tb-required-mark` CSS class and a real `<label>` above the
input, scoped to the `!lcNumberFromParent` branch (A1/B1 only).

## LC Number gains a real on-blur validation state (red border + inline message), matching Amount's own blur behavior

Root cause traced by reading `@ngx-formly/bootstrap`'s own source: Amount's red-on-blur comes from a real
Angular `FormControl` (`Validators.required`) being both `invalid` and `touched`. LC Number is a plain
`[(ngModel)]`-bound input outside any Formly `FormGroup`, so it has no validator at all and can never
become `invalid`/`touched`.

**Fix**: added the plain HTML `required` attribute — Angular's `FormsModule` automatically attaches its
own `RequiredValidator` to any `ngModel`-bound element carrying `required`, the same mechanism
`props.required: true` compiles down to for a Formly field — plus `#lcNumberCtrl="ngModel"` to export the
resulting `NgModel` instance. New `.tb-input--invalid` class (red border + light red background) bound to
`lcNumberCtrl.invalid && lcNumberCtrl.touched`, plus an inline error message under the same condition.

## Event Entry — Mandatory Reference Number requirement formalized: first-field ordering + consistent blur validation across A1/B1, A2/B2, A3/A3S, A8, B3

Extends the same treatment to every applicable reference number, and adds a field-ordering requirement
(the reference number must be first on the entry screen). Scope audit found two structurally different
mechanisms: A1/B1 LC Number (already fixed above); A2/B2 Amendment No./A3/A3S IB Number (a genuine
Formly-rendered `secondaryRef` field that already had Amount's own blur-validation behavior for free —
the only real gap was field order); A8 SG Number/B3 EB Number (plain `[(ngModel)]` inputs sharing LC
Number's exact gap).

**Fix 1 — field order**: `secondaryRef` moved to the first entry in the shared `fields` array — a no-op
for functions that never set `secondaryRefLabel`. **Fix 2 — A8/B3 blur validation**: the same
label/`required`/`#ctrl="ngModel"`/`.tb-input--invalid` pattern the LC Number fix established, applied to
`naturalKey.ibNumber`/`sgNumber`. A8/B3's own LC Number cell shows the disabled carried-from-parent
variant, so SG/EB Number isn't literally the first DOM element in that row but IS the first field the
Maker actually types into — judged to satisfy the requirement's intent without restructuring the shared
grid layout.

## Inquire Events → Import LC gains a paginated "Import LC Master Records Index" as its landing view

Deliberately Import LC only — the Export Confirmed side keeps its pre-existing single-LC-Number-search
flow unchanged. `CatalogPickerService` was investigated first but found wrong for this: it hardcodes
`status: 'ACTIVE'` + `requireIssueReleased: true`, correct for a Maker-action picker but wrong for an
inquiry browse where a still-PENDING or CLOSED LC is still legitimate to look up. New state/logic added
directly to `InquireEventsService` instead — reusing `PagedListState` for page/total math and the same
`movementsOf$()`/`childMovementsOf$()` free functions `loadEvents()` already uses, fanned out once per
Index row.

**New state/methods**: `indexView: 'INDEX' | 'EVENTS'` (SERVER-paginated `indexPaging`, unlike
`eventsPaging`'s client-side windowing — the Index is never fully loaded into memory). `loadIndex(page)`
fetches one page of Import LC contracts, then per row fetches Available Balance, root events (for
`lcAmount`), and child-instrument events (for `lastEventAt`, since a later SG event can be the LC's true
"last event"). `selectLcFromIndex(contract)` sets `indexView = 'EVENTS'` without a redundant re-resolve.
`backToIndex()` is deliberately just `indexView = 'INDEX'` — nothing else — since `indexRows`/
`indexPaging`/`indexSearch` were never cleared in the first place, preserving the user's own page/search/
sort state for free. `selectSide('IMPORT')` auto-calls `loadIndex(1)` so the Index appears immediately
without a manual search.

**"LC Amount" column — a disclosed simplification**: no existing API field carries it. The microservice's
own `computeFaceAmount()` is defined but never wired to any route — genuinely dead, not under-tested. New
client-side `deriveLcAmount()` mirrors that exact formula over the root contract's already-fetched
events, using plain JS `Number` arithmetic (this Angular app has no decimal library, unlike the
microservice's `money.ts`) — acceptable since this is a display-only summary column, never fed back into
any balance-affecting calculation. Flagged: a future feature needing this figure for real should wire the
existing dead `computeFaceAmount()` into a server-side route instead.

**Bug found during live verification**: clicking "Back to Import LC Index" correctly returned to the
Index but left the previous LC's own Events table still rendered underneath — that shared block was gated
purely on `rootContract` being set, and `backToIndex()` deliberately doesn't clear it (so re-picking the
same LC skips a redundant re-fetch). Fixed by additionally gating that whole results block on
`side === 'EXPORT' || indexView === 'EVENTS'`.

## LC Master Records Index extended to Export Confirmed LC — reused the just-shipped Import-LC-only implementation

Generalized in place rather than a parallel Export-specific implementation — nearly every piece was
already side-aware, the only real gating was one `if (side === 'IMPORT')` block, one `*ngIf` pair, and
`deriveLcAmount()`'s Import-only movementType assumptions.

`selectSide()`'s Import-only guard removed — both sides now auto-load their Index. `ImportLcIndexRow`
renamed to `LcIndexRow` (never actually Import-specific). **`deriveLcAmount()` needed real new logic**:
Import LC direction is encoded in the movementType itself (`AMEND_INCREASE`/`AMEND_DECREASE`), but Export
Confirmed LC has no such split — a single `AMEND` movementType covers both, with direction folded into
the SIGN of `amount`. Rewritten from a lookup-table map (which had no `AMEND` entry — an Export
Confirmation's own AMEND movements would have silently contributed nothing, understating "LC Amount" for
any Confirmation with amendments) to a `switch` correctly handling the signed `AMEND` case. New
`indexEntityLabel` getter ('Import LC' / 'Export Confirmed LC') drives the Index/heading text so both
sides get correct labels from one shared template block. The old single-exact-match "type LC Number"
search box (Export's only entry point before this pass) removed outright.

## Bug fixed — A2 Amendment Increase wrongly showed "exceeds Available Balance" warnings, contradicting its own registry help text

The balance box's "exceeds Available Balance" warning was never scoped by `movementType` — it fired for
any function whenever the typed amount exceeded Available Balance, regardless of whether the server would
actually reject it. The server's own `NO_CHECK_MOVEMENT_TYPES` (`ISSUE`/`AMEND_INCREASE`/`CREATE`/`AMEND`)
runs no sufficiency check at all for those four. B2 (`EPLC_CONFIRMATION`/`AMEND`, direction folded into
the sign of `amount`) had no server-side check in either direction, so the same warning was equally
misleading there — and would have been directionally wrong even if gated on sign alone, since a typed
negative Decrease can never trip a `>` comparison against a positive Available Balance.

**Fix**: gated the warning on a new `movementTypeChecksAvailableBalance(movementType)` helper, delegating
to the existing `DECREASING_MOVEMENT_TYPES` set (already mirrors the server's own checked-movementType
union, already reused elsewhere for the identical "don't imply a check the server never runs" purpose).
`AMEND` was never in that set, so this single change correctly suppresses the warning for B2 too.

## Theme support (System / Light / Dark) — a new common framework feature, not per-function

Three modes (System follows OS `prefers-color-scheme`, default; Light; Dark); an explicit choice overrides
System and persists; every screen follows consistently with no reload; status colors stay legible in both
themes.

**Architecture**: new `ThemeService` (`@Injectable({providedIn:'root'})`), independent of any A1–A9/B1–B5
code. Plain class fields (`mode`, `effectiveTheme` getter), not RxJS — every theme change originates from
a user DOM event Angular's own change detection already picks up. Persisted to `localStorage`
(try/catch-wrapped, non-fatal if unavailable). System-mode resolution via `matchMedia`, with a live
listener attached only while `mode === 'system'` and torn down the instant Light/Dark is picked. Applies
the resolved theme to BOTH `data-theme` (drives this app's own CSS tokens) and Bootstrap's `data-bs-theme`
(Bootstrap 5.3+ ships native dark-mode support keyed off it) — giving Business Case Runner's own
unstyled-by-design Bootstrap markup real dark-mode support for free.

**CSS tokens**: existing custom-property names kept unchanged; two new override blocks (a `@media
(prefers-color-scheme: dark)` block for defense-in-depth, plus an explicit `[data-theme='dark']` selector
that lets an explicit Dark pick win even on a light-OS system) share one `@mixin`. New surface/overlay/
border tokens replacing scattered hardcoded hex values.

**A real contrast bug found while building the dark palette**: `--blue`/`--green` etc. serve two
different roles — colored text/border on the page background, and solid button-fill with white text on
top. Role (a) needs to brighten in dark mode; reusing that same brightened value for role (b) would put
white text on a now-pale background, failing contrast. Fixed by splitting out theme-constant
`--blue-solid`/`--green-solid` tokens (unchanged across themes) for the 3 solid-fill rule groups, leaving
every other usage on the brightened role-(a) tokens.

**Dark palette design**: near-black slate page (`#0f172a`), surfaces one step lighter so cards read as
raised, soft body text (not pure white). Status-badge accents get a translucent tint over the dark
surface, paired with a brightened foreground beyond even light mode's own `-dark` variant, to clear WCAG
AA contrast. Navbar heading color also brightened — otherwise nearly invisible on a dark page.

**UI control**: a plain native `<select>` in the branded navbar, bound to `theme.mode`/`theme.setMode()`.

## Inquire Events — Tenor Type column added to the LC Master Records Index, both sides

Zero new HTTP calls — `contract.tenorType` is already present on the object each row assembles from.
"Mixed Tenor" (a case for an LC with multiple tenor types) was explicitly deferred by the user rather than
guessed at — no detection pattern was confirmed, so no logic was added for it.

**Implementation**: new exported `tenorTypeLabel(tenorType, side)` reuses the same two option arrays
A1's/B1's own tenorType Formly fields are already built from (Import: "Sight"/"Seller's Usance"/"Buyer's
Usance"; Export: "Sight"/"Usance" — Buyer's/Seller's Usance is meaningless from the confirming bank's
point of view) rather than a third independently-maintained copy. Returns "—" for null/undefined or an
unresolved combination. New `LcIndexRow.tenorType` field, one new column in the already-shared Index
table markup.

## Business Case Runner test data purged from the dev DB, and Tenor Type filled in across all 14 registry cases

**Part 1 — DB cleanup**: removed 27 stray `IMP-C%`/`EXP-C%` test contracts (64 movements, leftover replay
data from live-verification passes), scoped exactly to that naming convention — confirmed the 41
reference-LC rows were untouched before and after.

**Part 2 — Tenor Type added to every registry case still missing it** (only Import/Export Case #6/#7 had
it; the other 10 never set it). Added `tenorType` (+ `tenorDays: 120` for Usance) to each case's own root
ISSUE/Confirm request only — deliberately NOT to child Acceptance CREATE steps, since the Tenor Type
Routing guard only fires when both sides supply a value, and the Master Index only lists root contracts
anyway. Values, matching each case's own stated scenario: Import Case #1/#3/#4/#5 → SIGHT; Import Case #2
→ Buyer's Usance 120d; Export Case #1 → SIGHT; Export Case #2 → Buyer's Usance 120d, #3 → Seller's Usance
120d (given directly by the user's own worked example); Export Case #4/#5 (`EPLC_LC`, unconfirmed
reference-only, never appears in the Export Master Index regardless) → Buyer's/Seller's Usance
respectively, by structural analogy to #2/#3.

## All 14 Business Case Registry entries executed live and validated against current code — one real regression found and fixed

### Bug found and fixed — BAL-123's A4 4-eyes gate, hit for the first time by 3 of the 10 newly-`tenorType`-tagged cases

`isSightUtilizeFinalize` (`release()`'s BAL-123 gate) requires a Maker Submit before releasing a Sight
`IPLC_LC`/`UTILIZE` — an unset `tenorType` was previously exempt (`null === 'SIGHT'` is false). Once
Import Case #1/#3/#4 genuinely declared `tenorType: 'SIGHT'` (the immediately-prior pass), they became
indistinguishable from a real A4 flow, and all three failed their own UTILIZE release with a 409.

**Fix**: a `{type: 'makerSubmit', ...}` step inserted between each case's own Document Arrival create and
release, matching how a real A4 Maker/Checker flow already works (the same pattern Import Case #6 already
uses). Final documented balances are unchanged — only the call sequence reaching them needed the extra
step every other A4 usage in this app already requires.

**Result**: all 14 cases pass clean; every documented final balance/status matches the live result
exactly — no case was edited to paper over a mismatch. Export Case #4/#5's own newly-added `tenorType`
(instrumentType `EPLC_LC`, not `IPLC_LC`) triggered no gate interaction, confirmed by the clean run.

## Mandatory reference-number convention (Ann/Bnn/Gnn/Enn) applied consistently across the Business Case Registry

Field mapping: A2/B2 Amendment → `sourceTransactionRef` ("Amendment No./Times"); A3/A3S Document Arrival →
`sourceTransactionRef` ("IB Number"); A8 SG Issue → `naturalKey.sgNumber` (SHGT's own natural key, not a
reference on the parent LC); B3 Present Docs → `naturalKey.ibNumber` (`EPLC_EXAMINATION`'s own natural
key, "EB Number").

**Gaps found and fixed**: 10 of 14 cases had a blank mandatory reference on at least one step — every
Amendment step across Import/Export Case #1–#5 (now `A01`); every plain Document Arrival step in Import
Case #1–#4 (now `B01`). Import Case #3/#4's own SG Number normalized from a raw `'SG0001'` literal to the
`Gnn` convention (`'G01'`). Export Case #7's B3 step had reused its `EPLC_ACCEPTANCE`-scoped `ib`
parameter for its `EPLC_EXAMINATION` natural key too — split apart, the examination step's own `ibNumber`
now hardcoded `'E01'`. Case #5/#6/#7 and Export Case #6 were already compliant.

## Transaction Processing / Look Up Current Balance rebalanced to a genuine 50/50 split

`.tb-workspace`'s grid was `minmax(0,1fr) 420px` — Transaction Processing took whatever was left over
(often 900px+ of empty space) while Look Up Current Balance was pinned to a fixed 420px, cramping its
7-column Event Timeline into horizontal scroll.

**Fix**: `grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)` (genuinely equal tracks); stacking
breakpoint lowered from 1100px to 960px; new `container-type: inline-size` on both panels so `.tb-grid-3`/
`.tb-grid-2`'s own responsive collapse keys off the PANEL's own width via container queries instead of the
viewport — necessary since a 3-column grid keyed off viewport width would still try to render 3 columns
inside a panel now only ~50% as wide. Container queries chosen over another media query since this
project has no legacy-browser constraint. The Event Timeline table itself needed no tuning — it already
fit the wider panel with zero horizontal scroll.

## Look Up Current Balance → Event Timeline gains the same Page-by-Page pattern Inquire Events already uses

Reused `PagedListState` (client-side windowing over the already-loaded, already-sorted movements array,
not a re-fetch per page) — mirrors `InquireEventsService.eventsPaging` exactly.

**Real bug found via live verification**: `activeLookupMovements` is a computed getter switching between
three arrays (LC/Acceptance/SG tabs) populated across 4 different call sites — the first implementation
put the reset logic inside `pagedLookupMovements` alone, so switching to a tab with zero movements left
the pagination block showing a stale "Page 2/2" from the previous tab (since `pagedLookupMovements` is
only read from inside the same `*ngIf` the empty state also gates on, so it never fired). Fixed by moving
the identity-check/reset logic into `activeLookupMovements` itself — the one getter the template reads
unconditionally every cycle, guaranteeing the sync fires regardless of whether the table ends up
rendering.

## Inquire Events — widened to use the full available page width, not capped at 50%

Inquire Events reuses the same `.tb-workspace` grid but supplies only one child (no `.tb-side` panel in
this mode) — CSS Grid still reserves both declared tracks regardless of grid-item count, so `.tb-main`
alone was capped at the first 50%-width track, wasting the other half. Fixed with a new
`.tb-workspace--single` modifier (`grid-template-columns: 1fr`) applied only to the Inquire Events
wrapper — Transaction Processing's genuine 50/50 split is unaffected.

## Transaction Processing / Look Up Current Balance re-tuned from 50/50 to 60/40

`.tb-workspace` ratio changed to `minmax(0, 3fr) minmax(0, 2fr)`. Stacking breakpoint raised 960px →
1100px — at 960px a 60/40 split would leave Look Up Current Balance's own panel (holding the 7-column
Event Timeline) narrower than its own already-proven workable minimum; re-solving for 60/40 independently
arrives back near the original pre-50/50 breakpoint. The `.tb-grid-2`/`.tb-grid-3` container-query
thresholds needed no change — Transaction Processing (now the wider panel) never gets narrow enough to
trigger them while side-by-side. New `.tb-table--lookup-timeline` modifier tightens font-size/padding on
Look Up Current Balance's own Event Timeline table specifically (now the tightest-fitting table in the
app, in the narrower 40% side) — scoped to this one table, not a global `.tb-table` change.

## PR-1 of the F-01 Strategy refactoring — characterization tests only, zero production code changed

Locks in current behavior of the 11 boolean flags on `TransactionFunction` (scattered across 5 files per
`desiger-comments.md` finding F-01) before migrating them into a per-function Strategy structure, via
`transaction-function-flags.characterization.spec.ts`. Key finding: B4 alone carries 5 of the 11 flags
simultaneously — the shape a per-function Strategy object must reproduce as one coherent unit, not five
independently-read booleans. Asymmetric finding: A6 (`settlesDocumentArrival` alone) releases its own
source record first; B4 (`settlesDocumentArrival` **and** `payableMovementRequiresRelease` together) does
NOT, since B3's own record is already independently RELEASED by the time B4 can pick it (per the "B3
redesigned" entry above) — pinned down as an explicit test so a naive per-flag Strategy migration doesn't
assume `settlesDocumentArrival` alone always means "release the source first." `payExistingUtilize` (A4)
deliberately not characterized here — its gating logic lives directly on the component with no extracted
service to call in isolation; existing `.actions.spec.ts` coverage serves as its safety net for now.

## PR-2 of the F-01 Strategy refactoring — the Strategy interface itself, still zero production wiring

New `function-strategy.ts` — a `FunctionStrategy` interface (`MovementDerivationStrategy`,
`CompoundSubmissionStrategy`, `CheckerReleaseStrategy`, `SelectionFlowStrategy`) plus
`deriveFunctionStrategy()`/`FUNCTION_STRATEGIES`, one entry per function code (A1-A9, B1-B5). Not yet
imported by any of the 5 existing consumers.

**Grouping**, re-derived from the 5 consumer files rather than copied from the OOD review's own
hypothesis:
- `hasParent` excluded — it's a DERIVED function of `model.instrumentType` in `function-policy.ts`, not a
  stored flag, so never actually part of F-01's "flags scattered across 5 files" problem.
- `settlesAcceptanceOnMature` (B5) spans two groups (`movementDerivation` + `compoundSubmission`), since
  Interface Segregation groups methods a consumer needs, not flags 1:1.
- `CompoundSubmissionStrategy` uses `possibleShapes` (a list, not a single value) — B4 unconditionally has
  both HONOUR/ACCEPT capability on its registry entry, with the real choice made at submit time by
  `model.movementType`.

Built as a pure, derived PROJECTION over the existing registry (not a second, independently-typed data
source) — avoids the "kept in sync by hand" drift risk finding F-06 already flags for
`BalanceContract`/`BalanceMovement` across the Angular/microservice boundary.

## PR-3 of the F-01 Strategy refactoring — A-series consumers migrated to the Strategy, zero behavior change

A-series only (A1–A9); B-series untouched per the "one concern per change" rule. Migrated at real call
sites: `payExistingUtilize` (A4), `documentArrivalWithSg` (A3S), `autoRedeemType` (A9), `deferSettlement`
(A3/A3S) — 24 sites across 5 files, rewired to `FunctionStrategy` fields. `settlesDocumentArrival` (shared
A6/B4) deliberately deferred to PR-4. Zero existing tests needed changes — evidence the migration is
genuinely behavior-preserving. Stale doc-comment found (references B3's pre-redesign deferSettlement
path) — left as-is, flagged for a future doc pass rather than fixed mid-refactor, per this file's "record
don't pick" convention.

## PR-4 of the F-01 Strategy refactoring — B-series consumers migrated, shared `settlesDocumentArrival` branch retired

Remaining flags migrated: `payableMovementRequiresRelease`, `settlesAcceptanceOnMature`,
`settleableBalanceIndex`, `createsIssuingBankReceivableOnHonour`, `createsAcceptanceReimbReceivableOnCreate`,
`movementTypeFromContractTenor` — all confirmed B-exclusive. `settlesAcceptanceOnMature` needed no
dedicated field: already served by `MovementDerivationStrategy.amountVsAvailableDerivation === 'SETTLE'`.
The shared `settlesDocumentArrival` (A6+B4) branch is now retired everywhere; the A6-vs-B4
release-ordering asymmetry (see PR-1) lives entirely in `sourceAlreadyReleasedBeforePick`, not in this
flag, so the migration itself is symmetric. One real bug caught by `tsc`: `onSelectPayMovement()`'s
non-null narrowing broke across the old-flag→Strategy-getter boundary (`TS2531`), fixed with `?.` — a
pure type-safety fix, zero runtime behavior change.

## PR-5 of the F-01 Strategy refactoring — the 11 flags removed from `TransactionFunction`/the registry entirely; `function-strategy.ts` is now the sole source of truth

Final step — removes the flags from the type itself. A 6th consumer found outside the original "5 files"
scope: `balance-component.model.ts`'s `movementTypeMatchesFunction()`/`resolveFunctionForMovement()`/
`payExistingUtilizeFunctionFor()`, relocated to `function-strategy.ts` and rewritten against
`FUNCTION_STRATEGIES`. `deriveFunctionStrategy(fn)` is now a lookup (`FUNCTION_STRATEGY_DEFINITIONS`,
keyed by function code) instead of a derivation, still returning a fresh object per call (preserves the
"independent objects" guarantee from PR-2).

Because resolution is now keyed strictly by `fn.code`, synthetic "frankenstein" test objects (spreading
one function's flags onto another's code) no longer inherit behavior — two white-box tests that relied on
this were fixed with `jest.spyOn` stubs instead of silently worked around
(`submit-rules.spec.ts`'s guard-patch-accumulator test; `transaction-builder.component.gaps.spec.ts`'s
already-documented-unreachable `createsIssuingBankReceivableOnHonour` branch test).

A genuinely new gap found only by strict-template `ng build` (which `tsc --noEmit` alone never checks): 8
direct flag reads still live in `transaction-builder.component.html`, never touched by PR-3/PR-4 since
those only migrated `.ts` logic — fixed via `selectedFunctionStrategy` (made public for template binding)
with the extra `?.` Angular's stricter template type-checker requires beyond plain `.ts` null-checks.
Registry structure otherwise untouched (no non-flag field renamed). PR-1's characterization spec retired
(deleted, not converted) since its fixtures can no longer compile once the flags are gone and its bridging
purpose was already fully served by PR-2's own equivalence spec.

Open, disclosed-not-resolved discrepancy: 2 stray contract rows (`U03`/`U04`) found with unknown origin,
not created by this PR — left untouched per the "don't silently pick a side on an inconsistency" rule,
flagged for future triage.

F-01 is now closed: `function-strategy.ts`'s `FUNCTION_STRATEGY_DEFINITIONS` is the sole surviving source
of truth for this behavior.

## Page-by-Page pagination formalized as a common requirement — Primary Key Index AND 2ndary Key Index, every Transaction Function, page size 5 — plus a real bug fix in the process

Every A1–A9/B1–B5 Primary Key Index (LC Number) and 2ndary Key Index (Amendment/IB/SG/EB Number) must use
the same reusable Search + Page-by-Page pattern, page size 5, paginating only the qualified/filtered
records for a given function — not the raw unfiltered set.

**4 previously-unpaginated 2ndary Key Index pickers fixed** via client-side windowing (`PagedListState`,
the same class `InquireEventsService`/`LookUpPanelService` already use) over each picker's already-loaded
array — never a new server round-trip per page: A3S's SG Index, A4/A6/B4's shared "payable movement"
picker (safe to share since only one is ever visible per `selectedFunction`), B5's EB Index.

**Real bug found and fixed**: the Primary Key Index (`CatalogPickerService`) paginated the RAW server
response (10/page) and applied the qualifying filter (0-balance exclusion, tenor match, etc.) afterward,
client-side, on just that page — so `total`/`totalPages` reflected the unfiltered server count, not the
true qualified count (e.g. A3's LC Index showing "Page 1/2, 12 total" for only 4 actually-qualified LCs).
Fixed by redesigning `CatalogPickerService.load()` to always fetch one capped batch (page sizes bumped
10→100, the same "single-shot fetch" convention smaller pickers already use) and paginate client-side over
the FILTERED result at a fixed `DISPLAY_PAGE_SIZE` of 5 — `total` is now the true qualified count from the
moment data lands, and Prev/Next is pure client-side windowing, never a reload, which is what actually
fixes the bug (no more re-deriving the count from a fresh, potentially different server page). New
`qualifies?: () => number` callback on `load()` lets each picker supply its own filtered-length without
duplicating filter logic. `IndexPickerComponent`'s `autoPickedHint` condition widened to use the true
across-all-pages `total` rather than `items.length`, since a partial last page could otherwise wrongly
claim "auto-picked."

## LC Index made eligibility-driven for A4, A6, and B4 — "outstanding EARMARKING events only"

Previously A4's LC Index and A6's Parent LC picker showed every ACTIVE LC matching the function's tenor
family regardless of whether it had anything left to act on — a user had to pick an LC, then discover in
Step 2 it had zero outstanding Document Arrivals. Now Step 1 itself is eligibility-driven: an LC only
appears once it has at least one still-outstanding A3/A3S Document Arrival. Step 2 needed no changes — it
was already correct (`status === 'PENDING'`).

**A4** (`releasesExistingMovementInPlace`) — filters on `catalogPayableIbs.has(...)` (reusing the existing
"Pending: 25,000" hint data) instead of the old weaker proxy of skipping the 0-balance filter entirely.

**A6** (`settlesDocumentArrival` without `sourceAlreadyReleasedBeforePick`) — new
`parentPayableIbs`/`parentPayableMovements` maps filter `filteredParentCatalog` the same way, inserted
before the old blanket tenor/index bypass. `requiresEligibleParentDocumentArrival` disambiguates A6 from
B4 (both set `settlesDocumentArrival`) via `!sourceAlreadyReleasedBeforePick`.

**B4** (`payableMovementInstrumentType`, B4-only field) — uses the flat Catalog picker, not Parent LC, so
its eligibility gap lived in `filteredCatalogContracts` instead. B4's eligibility is structurally
different: cross-contract (a child `EPLC_EXAMINATION`'s own `CREATE`) and RELEASED rather than PENDING
(B4 only picks an already-Checker-Released B3 record, per the "B3 redesigned" decision — Step 2's own
filter already requires `status === 'RELEASED' && !presentDocsConsumedAt`). New `catalogChildPayableIbs`
map, populated per-candidate via catalog-search + movements-fetch chains, filters
`filteredCatalogContracts` on the same pattern.

A4/A6 share one underlying check (`loadDocumentArrivalHints`) since both pick from the identical
instrumentType/movementType shape; eligibility data resolves asynchronously, so `total`/`filteredXxxCatalog`
re-sync a third time once it lands, after the existing post-fetch/post-snapshot sync points.

## desiger-comments.md F-02 — three per-instrument sufficiency/validation checks extracted out of `BalanceService.createMovement()`'s own inline "creating a new contract" branch

`desiger-comments.md` (an independent OOD/SOLID review) names `createMovement()` as having a distinct
per-instrument sufficiency check (SHGT vs. parent Tight Available, Acceptance tenor consistency,
Present-Docs earmark) as sequential inline `if` blocks, and recommends extracting each into its own
`domain/` function, matching `shgtRedeem.ts`/`amendDecrease.ts`.

1. **`checkAcceptanceTenorConsistency`** (new `domain/tenorRouting.ts`) — Design doc §7: a Sight LC never
   produces an Acceptance, and an Acceptance's tenorType must match its parent LC's declared tenorType.
   Pure validation (always `RequestValidationError`), so kept out of the sufficiency-check file.
2. **`checkShgtIssueSufficiency`** (`domain/offBalanceExposure.ts`) — SG issue amount must be less than
   the LC Current Balance, netting existing SG exposure first (v0.11).
3. **`checkPresentDocsIssueSufficiency`** (same file) — running Present Earmark check against Balance.

Deliberately did NOT reuse the existing `checkUtilizeSufficiency` for #2/#3: it's a genuine two-tier check
(plain Available Balance, then tight/exposure-adjusted) with its own error wording — reusing it would have
silently added an extra tier and swapped in generic error messages, an observable behavior change
disguised as a refactor. Each new function replicates its own original single-tier check/message
verbatim. Service layer still owns resolving the contract and choosing the `Error` class; the three new
functions stay pure/anemic, matching the review's "Anemic — and correctly so" domain/ finding.

Remaining desiger-comments.md items not started this pass: F-02's `release()` God-Method half, F-03
(component still owns 6 load/select/paginate subsystems), F-04 (3 incompatible DI styles), F-06/F-07/F-08
(Medium), F-09 (CatalogPickerService reusability, deferred), F-10–F-13 (Low, no action recommended).

## desiger-comments.md F-03 reassessed, then a narrowly-scoped 9th BAL-003 pass — `DocumentArrivalHintsService` extracted

Re-measured `transaction-builder.component.ts` fresh: genuinely 2,653 lines (grown since the review,
because the Page-by-Page pagination + LC Index eligibility passes above added ~68 lines of new
paging-state/hint-fetching code directly onto the component) — the component deliberately keeps
SELECTION and business-rule FILTERING (Maker-flow orchestration entangled with
`model`/`selectedFunction`/`selectedContract`), everything else (fetch/paging bookkeeping) is fair game
to extract, per the earlier "8th pass" decision.

F-03's genuinely unresolved core (function/side selection, picker selection handlers, imperative
`loadX()`/`xLoading` pairs) is a UI/testing-architecture problem, not an unstarted-work one: a real
Angular child component or signals-based migration were both already investigated and declined, since
this project's direct-instantiation, no-TestBed test convention structurally cannot exercise
`@ViewChild`/`@Input`/`@Output` bindings that only resolve during real view-initialization.

Fix, matching the confirmed narrow scope: new `document-arrival-hints.service.ts` —
`DocumentArrivalHintsService`, a plain class (same convention `LookUpPanelService`/`InquireEventsService`/
`CatalogPickerService` already use) owning the per-candidate "eligible outstanding Document Arrival" hint
maps for A4/A6/B4's LC Index pickers (`catalogPayableIbs`/`catalogPayableMovements`,
`parentPayableIbs`/`parentPayableMovements`, `catalogChildPayableIbs`) plus their fetch methods. Pure
mechanical rename at all call sites (component + both spec files), zero test-logic change.

Net effect: `transaction-builder.component.ts` 2,653 → 2,537 lines. F-03 stays open at Major (selection,
dialog state, Checker-queue search remain) — this closes only the part newly introduced this session.

## LC Index eligibility extended to A3S/A9 — "outstanding SG Balance" criterion, sharing `DocumentArrivalHintsService` rather than a second service

Same pattern as the A4/A6/B4 eligibility pass above, different criterion: "has at least one associated SG
with a non-zero Available Balance" rather than "has an outstanding Document Arrival." A3S uses the flat
Catalog picker (like A4); A9 uses the Parent LC picker (like A6).

Landed inside the existing `DocumentArrivalHintsService` rather than a new service — same "one service,
several independent hint maps" shape. New `catalogSgEligible`/`parentSgEligible` Sets (boolean-only, no
inline hint text needed here) populated via the same two-step catalog-search-then-snapshot-fetch pattern
B4's `loadChildHints()` already established, reusing `loadSgsForArrival()`'s own "outstanding SG" filter
(`availableBalance !== '0'`). An LC with no SHGT children at all is correctly not eligible. Wired into the
same `onLoaded` hooks and `filteredCatalogContracts`/`filteredParentCatalog` branch pattern as the earlier
eligibility pass (A9 identified via `amountVsAvailableDerivation === 'REDEEM'`, the same Strategy field
F-01 PR-3/PR-4 already uses).

## Protect/disable transaction input fields + Submit until an eligible record is selected — A2–A9/B2–B5

A1/B1 exempt — they create a brand-new Logical Contract with no existing target to pick. Every other
function locks its Amount/Currency/Tolerance/Tenor/Reference No. fields and Submit until a genuinely
eligible target is resolved.

New `hasEligibleTargetSelected(ctx)` (`submit-rules.ts`) — deliberately NOT a call into `validateSubmit()`
itself, since that also gates on typed field values and never runs for A4's separate `submitA4()` path;
this re-derives each function's "no target selected" condition independently (per-function target shape
re-derived from the Strategy fields: `selectedContract` for the flat-Catalog/two-field-search group,
`selectedParent` for the `hasParent` group, plus A4/A6/B4's extra `selectedPayMovement`, A3S's
`selectedArrivalSg`, A9/B5's `selectedContractSnapshot`), so it can gate both the generic Submit path and
A4's own, and unlock fields the instant a target is picked even before Amount/Currency are typed.

Component gained `requiresEligibleTarget` (false only for A1/B1), `hasEligibleTargetSelected` (thin
delegation), `eligibleCandidateCount` (picker `.total`), `noEligibleRecordsMessage` (distinguishes "zero
candidates" from "candidates exist, none picked yet"), and `fieldsLocked = formLocked ||
(requiresEligibleTarget && !hasEligibleTargetSelected)`. Submit button's `[disabled]` binding gained the
same condition. The Primary/2ndary Key search inputs and pickers themselves stay untouched — they're the
mechanism used to select the eligible record in the first place.

## Submit Button Enablement — every mandatory field valid, all A1–A9/B1–B5 — plus Amount > 0 and B2's own Direction selector

Unlike the prior entry, this applies to every function including A1/B1: Submit readiness now also depends
on every mandatory field VALUE being valid. New `isSubmitReady` getter: `hasEligibleTargetSelected &&
validateSubmitRules(ctx).error === null` — calls the pure `validateSubmit` for its `error` result only,
never applying its `patch` (that stays the click-time method's job), so a template-bound getter re-running
every change-detection cycle stays byte-consistent with a real Submit click rather than drifting as a
second independently-maintained check. A4's separate "Submit A4" button stays on its own existing
`!selectedPayMovement` check — it has no live-typed fields at all.

**Follow-up: "Amount > 0" surfaced a real conflict with B2's existing signed-Amount convention**, resolved
via `AskUserQuestion`. B2 (Export LC Amendment) has no separate AMEND_INCREASE/AMEND_DECREASE
movementType — a Decrease was expressed by the sign of the typed Amount itself, so a blanket `>0` rule
would make a B2 Decrease unsubmittable. Resolution: Amount stays always positive; B2 gains its own
Direction selector, and the sign is derived at validate-time instead.

Fix: universal `if (Number(model.amount) <= 0) return fail(...)` guard in `validateSubmit()`, applied
before any function-specific patch. B2 gets a dedicated `amendDirection: 'INCREASE'|'DECREASE'|null`
component field (not part of the wire model, not the shared `subChoice` mechanism since B2's own
`movementType` stays fixed at `'AMEND'` regardless of direction) — a new guard patches `model.amount` to
`Math.abs(...)` or `-Math.abs(...)` accordingly, same "raw input stays positive, derived value travels via
patch" convention A9/B5's FULL/PARTIAL_REDEEM derivation already established.

Genuine coverage gap closed as a side effect: no existing test anywhere exercised B2's real
`submit()`/`validateSubmit()`/`buildSubmitRequest()` flow with an actual typed Amount before this pass —
every prior B2 reference was registry-shape/Strategy-only.

## desiger-comments.md F-04 — all 8 constructor dependencies unified onto one construction style

**SUPERSEDED same day — see "F-04 fully reverted" below.** This pass shipped a page-breaking production
regression (`NullInjectorError`) that static verification couldn't catch — caught only via live browser
test. Kept as a record of what was attempted and why.

The 3 existing construction styles map onto 2 real categories: `CheckerActionsService`/`MakerSubmitService`
are genuinely stateless `@Injectable({providedIn: 'root'})` singletons; `LookUpPanelService`/
`InquireEventsService`/`DocumentArrivalHintsService`/`CatalogPickerService` are deliberately NOT
`@Injectable` — genuinely per-component-instance mutable state, and `providedIn: 'root'` would make
Angular hand out one shared instance app-wide. `catalogPicker`/`parentPicker`/`ibIndexPicker` also depend
on their own page-size field at construction time, which constructor parameter defaults can't see
(parameter defaults evaluate before field initializers run) — the actual reason those three were
originally in the constructor body. User chose to unify all 6 into constructor parameters anyway, with the
three page-size values promoted to `static readonly` class members to close the ordering gap.

## F-04 fully reverted — the "unify all 6" fix broke the real running app; production Angular DI does not consult TypeScript default parameter values

**Root cause**: Angular's Ivy compiler generates each component's DI factory at build time from the
constructor parameters' declared TYPES — it has no concept of "this parameter has a TS default, skip
injecting it if no provider exists." It unconditionally attempts to inject every constructor parameter by
type. The moment the 6 deliberately-non-`@Injectable` services became real constructor parameters,
production DI had no provider to satisfy them, throwing `NullInjectorError` on every attempt to construct
`TransactionBuilderComponent` — the entire Transaction Builder page failed to render. Invisible to
`tsc`/`ng build` (type-only) and to the Jest suite (constructs via plain JS `new TransactionBuilderComponent(mockApi)`,
bypassing Angular's compiled factory entirely).

**Fix**: full revert via `git checkout` to the last known-good commit, restoring the original 3-way
construction split.

**Lesson**: static verification (typecheck/build/tests) is not sufficient justification to skip live
browser verification for any change touching Angular's DI wiring specifically — a distinct, narrower risk
category from ordinary template-only changes. Since Angular's real DI always tries to satisfy a real
constructor parameter by type, a service can only safely become one if it's either a genuine
`@Injectable({providedIn:'root'})` singleton, or supplied via a provider mechanism other than a bare class
type token (component-scoped `providers`, or an injection token with a factory).

## F-04 fixed for real — component-scoped Angular `providers`, researched against official docs before writing any code

Correct mechanism: `@Component({ providers: [...] })` creates a genuinely per-component-instance provider.
For multiple differently-configured instances of the same class: a distinct `InjectionToken` per instance,
each with its own `{ provide: TOKEN, useFactory: ... }` entry, `inject()` inside the factory for real
dependencies. Deliberately avoided a documented trap: a factory provider injecting the component itself
(`deps: [SomeComponent]`) to get `this` is a real Angular DI failure mode (`NG0200: Circular dependency in
DI`) — shaped the fix for `LookUpPanelService`'s own callback (moved from constructor-time to a call-time
parameter on `runLookup()`/`syncFrom()` instead of self-injection).

`@Component({ providers: [...] })` is consulted only by Angular's real Ivy factory — a plain JS
`new TransactionBuilderComponent(mockApi)` call (what every existing test does) never touches it, so the
constructor's TS default values stay unchanged for test-construction while `providers` additionally gives
Angular's real DI a genuine provider — both mechanisms coexist without conflict, the piece the first F-04
attempt skipped.

Fix: `LookUpPanelService`/`InquireEventsService`/`DocumentArrivalHintsService` gained `@Injectable()` (no
`providedIn`) plus a bare class-type entry in the component's `providers` array.
`catalogPicker`/`parentPicker`/`ibIndexPicker` (3 differently-configured `CatalogPickerService` instances)
each get a distinct `InjectionToken` + `useFactory` provider reading their own page-size constant (moved to
module-level `const`s, visible to both the decorator and the class's own `catalogPageSize`-style getters)
and resolving the API service via `inject()`; constructor parameters use `@Inject(TOKEN)`.

One structurally-accepted coverage gap: the 3 `useFactory` provider functions are never executed by this
project's direct-instantiation Jest tests (they never touch Angular's compiled DI factory) — only a live
check can prove them correct, same class of gap this file already documents for template-scoping bugs.

## BAL-003 — Account Entries dialog extracted as a genuine standalone Angular child component, the pilot for whether ANY of BAL-003's remaining scope can become a real child component under this project's own no-TestBed test convention

`@ViewChild`/signal `viewChild()` both require Angular's real view-creation pipeline regardless of Angular
version, so the three paginated pickers' own selection handlers genuinely cannot become real child
components under this project's `new TransactionBuilderComponent(mockApi)` no-TestBed convention. The
Account Entries dialog is the one piece of BAL-003 scope that IS genuinely presentational — no
Maker-flow-entangled state, only a passed-in `BalanceMovement` and a close event — a correctly-scoped pilot
candidate (Container vs. Presentational pattern).

Modeled on `IndexPickerComponent`'s own precedent: classic `@Input()`/`@Output()`, `standalone: true`. Key
finding: no TestBed needed at all — `IndexPickerComponent`'s own spec already proves the no-TestBed
convention extends to a real `@Component`, constructing it via plain `new IndexPickerComponent()` and
testing only class-level logic, leaving the template to `ng build`'s strict-template check + a live pass.

New `account-entries-dialog.component.{ts,html,scss,spec.ts}`. `displayStatus`/`statusBadgeClass`
extracted as new shared exported functions in `balance-component.model.ts` (previously private component
methods; the parent's own two methods are now thin delegations for backward test-compatibility). SCSS
classes copied rather than promoted to a shared location — Angular's Emulated encapsulation scopes styles
per-component and the shared atoms are still needed by the parent's other sections, same tradeoff
`.tb-pagination` already established. Parent's ~74-line inline dialog block replaced with one
`<app-account-entries-dialog>` tag; the now-moved SCSS rule block deleted.

BAL-003 stays open at Major — the three paginated pickers' own selection-handler state remains
architecturally unable to become real child components under this test convention without either rewriting
existing test assertions to drive TestBed, or a broader test-convention change.

## BAL-003 — `PickerSelectionService` extracted: A3S's SG picker, B5's EB Index, and A4/A6/B4's shared "payable movement" picker

A plain service class (not `@Component`) sidesteps the `@ViewChild` blocker entirely — no view-creation
pipeline involved, `new PickerSelectionService(api)` needs no TestBed. Same mechanism this session already
used 5 times (`CheckerActionsService`, `MakerSubmitService`, `LookUpPanelService`, `CatalogPickerService`,
`DocumentArrivalHintsService`).

**Scope**: Step 1 (LC/Parent/IB Index picks) stayed on the component — reads/writes
`model`/`naturalKey`/`selectedContract`/`selectedParent` too pervasively to move. What moved: the three
Step-2 "2ndary Index" subsystems genuinely exclusive to their own picker — A3S's SG picker, B5's EB Index,
A4/A6/B4's shared payable-movement picker (including `onSelectPayMovement()`, structurally inseparable
from `loadPayableMovements()`'s own auto-pick chain).

Same Dependency Inversion shape as `CheckerActionsService`/`MakerSubmitService`: methods that would
otherwise write back to component-owned state instead return an outcome object
(`PayMovementSelectionOutcome`/`SettleableBalanceSelectionOutcome`) the component's thin wrapper applies.
Action methods stay as one-line wrappers on the component (template action bindings unchanged); only state
bindings gained a `pickerSelection.` prefix. `@Injectable()`, no `providedIn` — same per-instance pattern
as the other F-04-fixed services, registered in the component's `providers` array.

Coverage closed deliberately (user-directed): new `picker-selection.service.spec.ts` took the new file to
99.44/94.91/98.07/100, including a full B4 cross-contract candidate-filtering test proving the "already
consumed" bug-fix line still works post-extraction. Remaining uncovered lines are the same class of
defensive/unreachable gap this file already accepts elsewhere (a `?? 'UTILIZE'` fallback unreachable via
any real function object; `providers` array `useFactory` closures never invoked by direct-instantiation
tests).

Net effect: closes the second-to-last genuinely picker-exclusive subsystem; what remains on the component
(function/side selection, the Step-1 picker selection handlers) is confirmed core Maker-flow orchestration,
not further extractable without moving `model`/`naturalKey`/`selectedContract`/`selectedParent` off the
component or a TestBed-based child-component migration.

## desiger-comments.md F-09 — `CatalogPickerService.load()`'s `status`/`requireIssueReleased` made overridable

The finding's literal suggestion undersells the real gap: `InquireEventsService.loadIndex()` (LC Master
Records Index) has opposite pagination strategies (server-side, no client-side qualifying filter to
reconcile) from `CatalogPickerService` (client-side batch + filter, because its own 3 Maker-action callers
need one) — mutually exclusive designs, not a missing parameter — plus its own row-enrichment step
`CatalogPickerService` has no equivalent for. Forcing the two together would be a worse outcome than the
current disclosed duplication. User confirmed the narrowed scope: fix the two hardcoded values only.

Fix: `load()` gained `requireIssueReleased?: boolean` (default `true`) and `status?: string | null`
(default `'ACTIVE'` when omitted). `status` needed a `null` sentinel distinct from `undefined` (omitted →
`'ACTIVE'`; explicit `null` → `undefined`/no filter passed to `api.catalog()`; a real string → used as-is)
— a real design bug caught before shipping, since a bare `?? 'ACTIVE'` default could never distinguish
"not supplied" from "explicitly no filter." All 3 existing callers pass neither new arg, so behavior is
unchanged. New `catalog-picker.service.spec.ts` (4 tests) closes the previously-unexercised override
branches; the service reaches 100/100/100/100.

## desiger-comments.md F-06 — a parity contract test between Angular's `BalanceContract`/`BalanceMovement` and the microservice's own `types.ts`

The two interfaces are NOT supposed to be identical — Angular's own doc comments already state they're a
deliberate subset (fields the UI never reads are never declared client-side) — so a full set-equality check
would be actively wrong. Codegen from the OAS spec was rejected since the spec itself is already known to
lag the real implementation (root `CLAUDE.md`) — generating types from a known-stale spec would encode
staleness as a compile-time guarantee. User confirmed the narrower option: a one-direction subset check.

New `wire-type-contract.spec.ts`, same "read both projects' source as plain text, never import/compile"
convention `instrument-type-contract.spec.ts` (BAL-110) established, since the test can never cross the two
projects' separate tsconfigs/Jest configs. Asserts Angular's declared field names are a subset of the
microservice's, never the reverse, never full equality.

Disclosed limitation: this test can only catch a field renamed on one side without the other following —
it structurally cannot catch the actual historical bug this finding cites (`balanceBefore`/`balanceAfter`
missing from Angular entirely while the microservice already had them, read via a loose `any` cast), since
there's nothing on the Angular side for a "declared fields" scan to find in that case. Closing that class
of gap needs generated types from a kept-current source of truth or a code-review practice, not a static
contract test — the narrower, real risk (a silent rename) is what this test actually earns its keep on.

## desiger-comments.md F-08 — `submitResult`/`MakerSubmitOutcome.result` retyped, and the underlying runtime bug this uncovered fixed for real

Underneath the "just add a type" framing was a genuine, live, reachable bug: `MakerSubmitOutcome`'s
'failed' variant was already typed `result?: BalanceMovement | null`, but 5 `catchError` sites across
`maker-submit.service.ts` (including `submitPlain`'s — the default path for every function not needing a
compound shape) assigned `result: err.error ?? null`, the raw HTTP error body, not a real `BalanceMovement`.
Since `applyMakerSubmitOutcome()` gates on `outcome.result !== undefined`, any primary-call Submit failure
carrying a JSON error body (which the microservice always returns for a validation rejection) incorrectly
populated `submitResult` — and `formLocked` (`!!submitResult`) would then wrongly lock the form after a
FAILED Submit, not just a successful one. User chose the full fix over a retype-only option.

Fix: all 5 sites now omit `result` entirely on a primary-call failure rather than assigning the error body
— secondary/tertiary leg failures are unaffected, since those already correctly assign `result` from the
captured primary response, not `err.error`. `submitResult: any` → `BalanceMovement | null` on the
component. `applyMakerSubmitOutcome()` itself needed no changes — its gating logic was already correct, it
was only ever fed a bad value.

One pre-existing test had directly documented the OLD buggy behavior as intentional ("submitResult is set
to err.error on failure... so a raw server error payload is still visible for debugging") — corrected to
assert `submitResult` is `null` after a failed Submit, along with the 5 corresponding `maker-submit.service.spec.ts`
assertions.

## BAL-003 "Feature Components + Facade" pilot #2 — `CheckerPanelComponent` extracted, a genuine standalone Angular child component

Phase 1 of the 8-phase proposal (`TransactionBuilderPageComponent` → `MakerPanelComponent`/`CheckerPanelComponent`/`ReferenceIndexComponent` → `TransactionBuilderFacade` → `TransactionOrchestrationService` → per-function Strategy classes → thin Page Container). `CheckerPanelComponent` chosen first — Checker already has a clear component boundary (independent search/queue/busy/error state).

Scope deliberately narrower than the proposal's literal description: only the SEARCH+QUEUE half moved
(self-contained, its only external dependency is read-only `selectedFunction`). The ACTION half
(`checkerAct()`/`release()`/`reject()`) reads deep Maker-side context and its "release succeeds → reset the
whole Maker screen" side effect is fundamentally a Maker-side concern — extracting it too would mean
rewriting ~40 existing compound-release tests for no real decoupling gain. `selectedCheckerMovement`/
`checkerBusy`/`checkerError`/every Release/Reject/Approve method stayed on the parent.

Design for triggering the child's search from ~9 Maker-side call sites, given `@ViewChild` never resolving
under this project's no-TestBed convention: rejected a value-keyed `@Input()`+`ngOnChanges()` (the original
re-searches unconditionally even when the LC Number is unchanged — a value-keyed input would silently miss
that re-sync class). Shipped a `CheckerSyncSignal` trigger-object `@Input()` the parent constructs as a
brand-new object literal at every call site — reference inequality, not value equality, is the signal, so
`ngOnChanges()` reliably re-fires. A companion `resetTrigger` nonce handles per-function reset the same way.
Avoided a second risk: `selectedCheckerMovement`/`checkerError` stay parent-owned and are cleared directly
by `selectFunction()`, not via a round-trip through the child's `ngOnChanges()` (which never fires under
direct-instantiation Jest tests — a round-trip would silently diverge between test and real app).

Content projection preserves the original "one card" visual: the still-parent-owned Release/Reject action
block projects into the child's template via `<ng-content>`, inside the same `*ngIf="checkerContractId"`
gate.

Phase 1 done. Phases 2-8 not started.

## BAL-003 "Feature Components + Facade" pilot #2, Phase 2 — `MakerPanelComponent` extracted, the largest and riskiest piece of the 8-phase proposal

Everything Maker-side (natural-key search, the 3 pickers' selection handlers, Formly `fields`/`submit()`
dispatch across all 14 functions, `submitResult`, the 5 compound-leg fields) moved into a new
`MakerPanelComponent`. Parent keeps Checker-side state plus a small read-only `makerContext` mirror
(kept current via a `contextChanged` output) that Checker-side release/reject logic needs.

Two separate signal channels needed since Maker Submit and Checker Release/Reject write into the same
conceptual state via different code paths: `externalCheckerOutcome` (fresh-object-per-emission input,
same mechanism as Phase 1's `CheckerSyncSignal`) for outcomes that DO affect `submitResult`, plus a
narrower `refreshRequested` nonce for `checkerAct()`'s plain (non-compound) success path — which never
touches `submitResult` at all, since a Checker acting on an independently-found item may have nothing to
do with whatever the Maker currently has selected. Routing it through the same channel as the first draft
did would have silently corrupted the Maker Result panel; caught before any verification ran by
re-reading the original `checkerAct()` body line-by-line.

Also self-caught before verification: the first draft had no `providers` array despite injecting several
non-`@Injectable` services — exactly the `NullInjectorError` class the F-04 saga already hit once for the
parent (see above) — fixed by mirroring the parent's already-proven `providers` pattern before running
`ng build`.

**Live-browser-caught bug, not caught by any static check or the test suite** — the actual reason this
project's "always verify DI/component-wiring changes live" rule exists: `ngOnChanges()` mirrored
`CheckerPanelComponent`'s `resetTrigger` handling verbatim, skipping the very first firing
(`!changes['resetTrigger'].firstChange`) — correct for `CheckerPanelComponent` but wrong for
`MakerPanelComponent`, since `<app-maker-panel>` is only ever created on the FIRST function pick, so its
first `resetTrigger` change is always `firstChange: true` — meaning `rebuildFields()` (the only thing that
populates the Formly form) never ran on a Maker's very first pick. Live-tested: picking A1 for the first
time on a fresh page rendered zero form fields; picking A2 immediately after (a second switch,
`firstChange: false`) rendered correctly — every function's first pick, on a fresh load, would have
shipped completely broken. Fix: made the handler unconditional, matching what the original monolithic
`selectFunction()` always did.

Phases 1-2 done. `transaction-builder.component.ts` shrank to a genuinely small orchestration/wiring
layer. Phases 3-8 not started.

## BAL-003 "Feature Components + Facade" pilot #2, Phase 3 — eligibility-filtering logic unified across the 3 picker getters

`filteredCatalogContracts`/`filteredParentCatalog`/`filteredIbIndexCatalog` each independently hand-rolled
the identical shape (tenor pre-filter, function-specific eligibility cascade, trailing 0-balance fallback).
New `eligibility-rule.ts` — a small, pure, DI-free module (`EligibilityRule` discriminated union +
`applyEligibilityRule()`), unifying only the mechanical tail; WHICH rule applies to a given
function/picker stays local to 3 resolver methods on `MakerPanelComponent`, unchanged from before. Kept
out of `function-strategy.ts`'s Strategy pattern deliberately: two branch conditions read raw registry
fields explicitly scoped out of the F-01 migration, and no function ever needs catalog-picker and
parent-picker eligibility to differ.

**Real bug caught by the test suite**: the first pass merged all three getters' trailing fallback into one
case gated by `DECREASING_MOVEMENT_TYPES`. `filteredParentCatalog`'s original fallback was NOT gated this
way — it applied the 0-balance exclusion unconditionally. Merging silently changed A8's Parent LC picker
from "always exclude 0-balance candidates" to "never exclude them," caught by a pre-existing test. Fixed
by adding `gatedByMovementType: boolean` to the rule's `genericFallback` variant, preserving the asymmetry
exactly (documented in the module's own doc comment, since nothing else in the codebase had called it out
before).

Phase 3 closed. Phases 4-8 not started.

## B2's Direction dropdown unified onto the same `subChoice` mechanism A2/A7 already use — closes a real gap where A2/A7's own Direction stayed editable after Submit

A2/A7 render Direction via the generic `subChoice` block, which always wrote into `model.movementType`.
B2 (whose direction rides the signed Amount instead, per the "Submit Button Enablement" entry above)
couldn't use it, so that earlier pass built a bespoke separate `<select>` for `amendDirection`. Comparing
the two blocks surfaced a real, previously-unnoticed gap: A2/A7's generic block had neither
`[disabled]="formLocked"` nor a required-mark — a Maker could still change A2's Direction after a
successful Submit, violating the "Submit locks all fields" rule every other field respects. B2's bespoke
block, ironically, already had both correctly.

Fix: generalized `subChoice`'s dispatch instead of duplicating either block. `SubChoice.key` narrowed to
`'movementType' | 'amendDirection'`; `onSubChoice()` branches accordingly — `'amendDirection'` writes to
`this.amendDirection` without touching `model.movementType`. B2's bespoke block removed; the one shared
`subChoice` block now carries `[disabled]`/required-mark unconditionally, fixing A2/A7's gap and preserving
B2's correct behavior from the same edit.

Also confirmed: `submit-rules.ts`'s Decrease-amount-negation guard now reads
`selectedFunction?.subChoice?.key === 'amendDirection'` instead of a hardcoded `.code === 'B2'` check — the
last function-code-specific conditional anywhere in the 5 consumer files; any future function sharing this
shape gets the behavior for free by declaring the same `subChoice.key`.

Unrelated issue found along the way: the `ng serve` process backing live verification had been running
~9+ hours and was serving a stale bundle (source on disk was correct, but not reflected in the browser even
after reload) — restarting it resolved this; not a code defect, but worth remembering for long-running
sessions.

## B2's own AMEND movements display as AMEND_INCREASE/AMEND_DECREASE with a de-signed magnitude everywhere a Type/Amount is shown — 4 call sites, display-layer only

Follows the entry above — that pass correctly kept the wire contract signed (downstream balance/snapshot
computation depends on it via `balanceDerivation.ts`'s `MOVEMENT_DIRECTION['AMEND'] = 1`), but never
addressed how that signed value displays back to a user once stored. Scope: `instrumentType ===
'EPLC_CONFIRMATION' && movementType === 'AMEND'` only — the one instrumentType whose Increase/Decrease
rides the sign of `amount` rather than a distinct movementType.

New shared pure functions `displayMovementType()`/`displayMovementAmount()` (`balance-component.model.ts`,
same convention as `displayStatus()`/`statusBadgeClass()`): return `AMEND_DECREASE`/de-signed magnitude
when negative, `AMEND_INCREASE`/unchanged otherwise, for the one matching pair; pass through unchanged for
everything else. Callable on either `amount` or `ceilingAmount` (Tolerance conversion scales but never
flips sign) so the ceiling hint stays numerically consistent with the Amount column.

4 call sites found via repo-wide grep (not the 2 originally named): Look Up Current Balance's Event
Timeline, Inquire Events' merged table, the Checker Pending Approvals queue, and the Account Entries
dialog's meta line — the last two found during investigation, disclosed as additions beyond what was
asked, for the same consistency reason. Each host component gained a thin delegation method mirroring the
existing `displayStatus()` shape.

## Bug fixed — B2's own Amount input field visibly turned negative after a Decrease Submit, because the sign-negation patch mutated `model.amount` itself, not just the wire request

Root cause: `MakerPanelComponent`'s `validateSubmit()` wrapper applies `SubmitValidation.patch` via
`Object.assign(this.model, patch)`, and `submit-rules.ts`'s `amendDirection` guard set
`patch.amount` to the negated value. Since `this.model` is the same object the Formly form's `[model]`
binding renders, this overwrote the user-visible Amount field with the negative number the instant Submit
ran — looked like the Maker's typed `1000` silently flipped to `-1000` in front of them. The "raw input
stays positive, derived value travels via patch" convention was never a safe vehicle for a field the form
renders directly back to the user (unlike `patch.movementType`/`patch.tenorDays`, never re-displayed).

Fix: the `amendDirection` guard no longer patches `amount`, only validates. The sign transformation moved
into `buildSubmitRequest()` itself, computing the wire request's `amount` locally from `ctx.model.amount`
(still positive) + `ctx.amendDirection`, never writing back into `model`. `model.amount` now stays exactly
what the Maker typed for the form's entire lifetime.

## BAL-003 Phase 8, narrowly scoped — MakerPanelComponent's 7 flat compound-leg movement fields grouped into one `compoundLegs: CompoundLegState`

The 7 fields A3S/A6/B4/B5's multi-leg submissions populate, grouped into a `CompoundLegState` interface +
`EMPTY_COMPOUND_LEGS` constant. `MakerCheckerContext`'s own shape deliberately unchanged (still flat) —
`emitContext()` destructures the 5 wanted fields back out, so the parent needs zero changes.

One subtlety preserved exactly: `submit()` has its own partial reset (3 of the 7 fields) genuinely
different from `resetForFunction()`'s full reset (all 7) — reproduced via a partial spread-merge rather
than `{ ...EMPTY_COMPOUND_LEGS }`, confirmed by reading every read/write site before writing anything.
`applyMakerSubmitOutcome()`'s 7 individual guards collapsed to one merge-spread, verified safe by checking
all 11 `secondary:` object-literal call sites in `maker-submit.service.ts` never explicitly set `key:
undefined`.

One pre-existing behavior confirmed, not a regression: re-opening "Account Entries — SG Redemption" after
a Checker Release still shows the SG leg's originally-captured PENDING snapshot, not the now-RELEASED
status — `applyCheckerOutcome()` was untouched by this pass and never wrote back into `compoundLegs`,
consistent with this app's "View Voucher shows historical, immutable entries" principle stated elsewhere.

Phase 8 closed at this narrow scope; the broader ViewModel consolidation the original proposal envisioned
remains not done, same "low marginal value post-Phase-1/2" reasoning as Phase 4/6.