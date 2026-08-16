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

This log covers the **Balance Component** — the contingent-liability / on-balance-sheet ledger
(`BalanceContract`/`BalanceMovement`) for LC, Shipping Guarantee, Acceptance/DPU, UPAS, and Export
Confirmation. **Scope boundary, business-confirmed 2026-08-16: "Balance Component 只負責 Contingent
Liability"** — it tracks exposure, not settlement/GL posting; that's the separate Payment/Charge
Component's job (see `lc-payment-wc/CLAUDE.md`'s own Charge Component ↔ Payment Component boundary
section for the analogous split on that side of the codebase).

Everything below is dated **2026-08-14 through 2026-08-16** — a single dense multi-day review sprint
(the project's only commit so far, "Init lc-balance-wc … v0.1.0"), not accumulated long-running
history. `microservices/balance-component/package.json` states it implements
`analysis/balance-component-api.yaml` **v0.3.0** and a design doc it calls
`analysis/COMMON-BalanceComponent-Design-zh.md` **v0.5** — but that file, and a second one the code
cites as `COMMON-BalanceComponent-ExportConfirmation-Gap-Analysis-zh.md` (plus an `impl-spec-en.md`),
**do not exist anywhere in this repo**. They were business-expert review sessions (grounded in the
`cs-tf-balance-knowhow` skill's domain know-how) captured only as dated, section-numbered doc comments
inline in the source — the same "reviewer session, never a committed file" situation the root
`CLAUDE.md` already flags for `lc-payment-wc/`'s reverted RDD note. Treat a `§N` citation below as
pointing at that uncommitted design doc, not at anything currently readable in `analysis/`. This file
previously (through the initial commit) was an accidental byte-for-byte copy of `lc-payment-wc/CLAUDE.md`
— all Payment Component content, nothing about Balance Component; the decision log below was corrected
2026-08-16, but the persona/role framing at the top of this file (identity lines, "AI Role" heading)
was left over from the copy until a follow-up pass the same day retitled it from Trade Finance and
**Payment** Solution Architect to Trade Finance and **Contingent Liability Balance** Solution Architect.

## Standing rule: keep tests + docs in sync with every code change, and all unit tests must pass before a change is done (user-confirmed 2026-08-16)

**Any code change under `lc-balance-wc/` (Angular app, `backend/`, or `microservices/balance-component/`)
must be accompanied by updates to whatever this repo's own conventions say tracks that code** — the
relevant Jest spec file(s) (new/changed behavior needs new/changed test cases, not just "still passes"),
and any Markdown/documentation/specification/other supporting artifact that describes it: this file's own
decision log above (dates/versions/business quotes, same format as existing entries — don't leave a
change undocumented here), the root `CLAUDE.md`'s `lc-balance-wc/` section if a described command/port/
file-layout fact changes, and anything under `analysis/` if it's the actual source of truth being revised
(rare — most of this project's real "spec" is the inline dated doc comments in the source itself, per the
framing paragraph above). Treat this the same as `lc-payment-wc/CLAUDE.md`'s own "always `ng build` after
touching `.html`" rule — a standing verification requirement, not a one-off reminder.

**Before calling any change complete, run all THREE test suites and confirm every one exits clean at its
own 90% coverage floor** (all four metrics — statements/branches/functions/lines; none may be lowered to
make a change easier, per this session's own precedent of closing real gaps rather than weakening gates):

```bash
cd lc-balance-wc/microservices/balance-component && npm test
cd lc-balance-wc/backend && npm test
cd lc-balance-wc && npm test
```

A change confined to one of the three (e.g. a microservice-only fix) still only strictly requires that
one suite to re-run, but running all three costs seconds and catches a cross-cutting break (e.g. a
microservice response-shape change the Angular API service or backend orchestrator silently assumed)
that a single suite would miss — default to running all three unless there's a specific reason not to.



- **`InstrumentType`**: `IPLC_LC`, `EPLC_LC`, `IPLC_ACCEPTANCE`, `EPLC_ACCEPTANCE`, `SHGT`,
  `EPLC_CONFIRMATION` — plus, added **2026-08-15** per Export Confirmation Gap Analysis §4.1 and
  grounded in `cs-tf-balance-knowhow`'s frozen event catalogue: `EPLC_DUE_FROM_ISSUING_BANK`,
  `EPLC_ACCEPTANCE_REIMB_RECEIVABLE`, `EPLC_EXPORT_BILLS_DISCOUNTED` (all `ON_BALANCE_ASSET`, obligor =
  issuing bank — the asset-side counterpart a Confirmation contingent transforms into once
  honoured/accepted: `CNF_HONOUR_SIGHT`/`CNF_HONOUR_BU` → `DUE_FROM_ISSUING_BANK`, `CNF_ACCEPT` →
  `ACCEPTANCE_REIMB_RECEIVABLE_ISSUING_BANK`, `CNF_DISCOUNT` reclassifies the latter into
  `EXPORT_BILLS_DISCOUNTED`; EBL Nego's own discount/interest accounting stays out of Balance Component
  scope per the same gap analysis §1 — not this component's concern).
- **`EPLC_EXAMINATION`** (2026-08-15) — a `MEMO_ONLY` Present-Docs earmark instrument, added after a
  `cs-tf-balance-knowhow` expert review found a proposed "Confirm LC Balance control" lifecycle table's
  own "Confirmation Pending 100K" at Present Docs violated **Design Principle D3** ("Documents arriving
  is a physical event... Only legal events move balances") — confirmed against the uncommitted
  `impl-spec-en.md`'s own event matrix (`EX_DOC_RCV` only ever touches
  `EXPORT_BILLS_UNDER_EXAMINATION`/`_CONTRA`, never `CONFIRMATION_OUTSTANDING`). CREATE-only at B3
  (Present Docs); B4's Honour/Accept compound releases that same PENDING CREATE (mirroring A6's own
  `settlesDocumentArrival` pattern) rather than a separate closing movement — never posts
  `accountEntries`, never feeds `EPLC_CONFIRMATION`'s own balance.
- **`ContractStatus`**: `ACTIVE | SUPERSEDED | CLOSED | CANCELLED`.
- **`MovementStatus`** (§4 Maker/Checker): `PENDING | RELEASED | REJECTED | CANCELLED | SUPERSEDED`.
  PENDING is created by a Maker (`createdBy`); every other state is a Checker action
  (RELEASED/REJECTED, `releasedBy`) or a Maker action on their own not-yet-released record
  (CANCELLED/SUPERSEDED). §8: a transition into an illegal target state from the movement's CURRENT
  status must fail loudly — see `domain/statusTransition.ts`.
- **`ExposureNature`**: `CONTINGENT | ACTUAL | MEMO`. `MEMO` (business-confirmed 2026-08-14, Export LC
  design) is an Unconfirmed LC's own "Accepted Amount" tracking — the *issuing bank's* obligation, not
  this bank's — carried for receivable/maturity tracking only, never posts `accountEntries`, never a
  real liability of this bank.
- **`TenorType`**: `SIGHT | BUYERS_USANCE | SELLERS_USANCE | DP | DA`.
- `BalanceContract.tolerancePct` — §6.2, `IPLC_LC`/`EPLC_LC` only.
- `BalanceMovement.amount` vs `ceilingAmount` — face-level amount as typed vs the §6.2 Tolerance-
  converted figure actually consumed for sufficiency checks.
- `BalanceMovement.acknowledgedBy`/`acknowledgedAt` — `EPLC_EXAMINATION` only (2026-08-15): a
  Checker's B3 "Release" acknowledgment of a still-PENDING Present Docs earmark **without** finalizing
  it (status stays PENDING) — distinct from `releasedBy`/`releasedAt`.
- `BalanceSnapshot.offBalanceExposure`/`tightAvailableBalance` — §6.1, null except for
  `IPLC_LC`/`EPLC_LC`.
- `BalanceSnapshot.presentDocsEarmarkPending`/`presentDocsEarmarkApproved` — `EPLC_CONFIRMATION` only
  (2026-08-15): Pending = Σ unacknowledged PENDING `EPLC_EXAMINATION` CREATEs; Approved = Σ
  Checker-acknowledged but not-yet-B4-consumed. B3's sufficiency check nets BOTH combined against
  Available.

## Balance derivation (`domain/balanceDerivation.ts`, §3.3)

`MOVEMENT_DIRECTION` table (RELEASED-only, ceiling-level): LC ISSUE/AMEND_INCREASE = **+1**,
AMEND_DECREASE/UTILIZE = **−1**; SHGT CREATE = **+1**, PARTIAL_REDEEM/FULL_REDEEM = **−1** (v0.6, split
out of a single `REDEEM` — see `shgtRedeem.ts` below); Acceptance CREATE = **+1**,
PARTIAL_SETTLE/FULL_SETTLE = **−1**; `EPLC_CONFIRMATION` AMEND = **+1**, HONOUR/ACCEPT = **−1**
(business-confirmed 2026-08-14: CONF_LIAB is created via ISSUE and permanently reduced at Sight
HONOUR or Usance ACCEPT — ACCEPT also triggers a linked CREATE on `EPLC_ACCEPTANCE`, "one movement, one
call" orchestrated by the *caller*, §7.4, not by this service); the three 2026-08-15 asset-side
instruments' REIMBURSE/RECLASSIFY_OUT = **−1** (Gap Analysis §4.1). CANCEL/EXPIRE/REVERSAL are
deliberately **not** in the table yet — REVERSAL needs special flip-sign handling per §4.5; extend the
table before relying on it for those movement types.

Confirmed Balance = Σ RELEASED movements at ceiling-level. Available Balance = Confirmed ± Σ PENDING
(same direction convention). Face Amount is tracked independently of Confirmed Balance — UTILIZE
reduces Confirmed without touching face amount; face amount instead sums RELEASED
ISSUE/AMEND_INCREASE/AMEND_DECREASE `amount` (never `ceilingAmount`).

## Tolerance conversion (`domain/tolerance.ts`, §6.2)

`ceilingAmount = amount × (1 + tolerancePct / 100)`. Applies to `IPLC_LC`/`EPLC_LC`'s
ISSUE/AMEND_INCREASE/AMEND_DECREASE **and** to `EPLC_CONFIRMATION`'s ISSUE/AMEND (business-confirmed
2026-08-14, worked example: "Confirm LC 100,000 w/ Tolerance 10% → CONF LIAB 110,000" — the Confirming
Bank's own liability carries the same buffer, since `EPLC_LC` itself is reference-only). **Never**
applies to SHGT or Acceptance (business-confirmed 2026-08-14: "Tolerance 只有開證與修證適用...SG或IB
就是SG AMOUNT或BILLS AMOUNT"). The gate checks BOTH `instrumentType` AND `movementType` — SHGT's own
`ISSUE` string collides with LC's `ISSUE`, so `movementType` alone is not a safe discriminator.

## AMEND_DECREASE sufficiency (`domain/amendDecrease.ts`, §6.2)

AMEND_DECREASE sufficiency compares the Tolerance-converted `ceilingAmount` (never the raw `amount`)
against Available Balance — proven algebraically to also subsume the "face amount can't go negative"
floor check (utilized amounts are never negative). The rejection error message deliberately echoes
BOTH the raw `amount` and the derived `ceilingAmount` side by side — added after a reviewer flagged
that a bare comparison figure left it ambiguous whether it was face-level or Ceiling-level.

## Off-balance-sheet exposure (`domain/offBalanceExposure.ts`, §6.1, hardened v0.12)

Scope is deliberately SHGT-only versus a UTILIZE against `IPLC_LC`/`EPLC_LC` — not Acceptance (already
reduces LC Balance at UTILIZE time) or Confirmation (a % overlay that never competes for the same LC
capacity).

**v0.12, business-confirmed 2026-08-14**, off a live test case (Document Arrival 50,000 vs
confirmedBalance 100,000 / offBalanceExposure 60,000 / tightAvailableBalance 40,000 — expected to
REJECT): tightened from a non-blocking WARNING to a hard ERROR for both `到單金額 > LC Balance(P+A)`
and `到單金額 > LC Balance(P+A) − 表外餘額(P+A)`.

The "Document Arrival with Shipping Guarantee" function is not double-penalized: the caller creates
the matching SHGT's FULL_REDEEM (still PENDING) *before* calling UTILIZE —
`computeOffBalanceExposure` counts PENDING redemptions the same as RELEASED ones, so the SG's own
contribution is already netted out; ordering alone does the work, no special-casing needed.

**Present Docs Earmark** (business instruction 2026-08-15: *"Present Docs 須有一個 Present Docs
Earmark (Pending/Approved) 來控制 — B3 Submit ⇒ Bill Amount 加至 Present Docs Earmark Pending"*).
Root gap: B3's original single-presentation-vs-Available check (Gap Analysis §6.7) let three
presentations E01 (50K)/E02 (70K)/E03 (100K) each individually pass against the SAME still-100K
Available (each checked in isolation, since `EPLC_EXAMINATION` is `MEMO_ONLY` and none had moved the
real balance yet) — their SUM (220K) was never checked. Fix nets Σ *other* still-PENDING presentations
into the check ("B3+" adds to the earmark; "B4−", i.e. the actual Honour/Accept release, drops it via
the PENDING-only filter — no separate bookkeeping needed). Only PENDING counts, never RELEASED (would
double-subtract, since a released presentation's contribution is already reflected via the
Confirmation's own HONOUR/ACCEPT movement). D3 still stands — this is a soft commitment-control check,
not a real balance-moving event, same species as the SHGT check above. This 2026-08-15 fix explicitly
**reverses** that same day's own earlier, narrower design (which had explicitly said it would *not*
net out other still-PENDING presentations) once the SUM-never-checked gap was found live.

## SHGT / Acceptance redemption (`domain/shgtRedeem.ts`, §5, v0.6)

One shared helper for any "≤ outstanding" clearing movement: SHGT PARTIAL_REDEEM/FULL_REDEEM,
Acceptance FULL_SETTLE/PARTIAL_SETTLE, and (2026-08-15, Gap Analysis §4.2) REIMBURSE/RECLASSIFY_OUT on
the new asset-side instruments. A redemption may release less than the full outstanding
(business-confirmed 2026-08-14, Import LC Case 4: an SG covering the whole LC may be redeemed only
against the portion whose original docs actually returned) but never more. **Never** auto-derived from
a matching UTILIZE amount even when they happen to coincide — the caller always submits it explicitly.

**Bug fixed 2026-08-15**, found live (LC S001 / SG G01 ended with `pendingEarmarkTotal −12000` /
`availableBalance −5000`: a 7,000 FULL_REDEEM left PENDING, then a 5,000 PARTIAL_REDEEM against the
SAME SG was wrongly accepted on top, totalling 12,000 redeemed against a 7,000 outstanding). Root
cause: the sufficiency check compared against static Confirmed Balance (the same commitment-control
mistake AMEND_DECREASE/UTILIZE checks avoid by using Available) — it ignored other still-PENDING
redemptions on the same record. Fixed to check against Available Balance, matching
`checkUtilizeSufficiency`/`checkAmendDecreaseSufficiency`'s own convention.

## Service orchestration (`service/balanceService.ts`)

- **Not** a linked "UTILIZE+CREATE Acceptance"/"ACCEPT+CREATE Acceptance" server-side operation —
  §7.4's "one movement, one call": the caller (the `backend/` Node.js 中台 orchestrator) makes two
  separate calls, keeping `release()` a plain uniform state transition with no hidden cross-contract
  side effects.
- **Re-ISSUE guard** (business-reported gap 2026-08-14, *"Issue LC Number 後不能再 Issue 同一筆 LC
  Number"*): a creating movementType against a natural key that already resolves to an ACTIVE contract
  is rejected outright (`NaturalKeyAlreadyExistsError`, 409) — applies only to the natural-key path,
  never to an explicit `balanceContractId`. Added after a gap where re-Issuing silently double-counted
  Confirmed Balance instead of being rejected.
- **Tenor flow-control** (business instruction 2026-08-14, *"不然流程控制無法處理 這也是BALANCE
  COMPONENT範圍之一"*, §7 Tenor Type Routing): a Sight LC can never produce an Acceptance (must settle
  via UTILIZE/A4, never A5); an Acceptance's `tenorType` must match its parent LC's own declared
  `tenorType`.
- **SG Issue cap** (business instruction 2026-08-14, an explicit override of the design doc's earlier
  §5/§11 LMTS-Available-Limit-based decision — v0.10 changelog records the reversal): SG Issue amount
  is capped at the parent LC's own *Tight* Available Balance, netting out other already-outstanding SG
  exposure on the same LC (**v0.11 business-confirmed fix** — v0.10 had compared against plain
  Available Balance only, letting two overlapping SGs, e.g. 90K+90K against a 100K-available LC, each
  individually pass). Checked *before* `createContract()` so a rejected request never leaves an
  orphaned empty `BalanceContract` row — found live in an earlier attempt that did exactly that.
- **Present Docs earmark check on `EPLC_EXAMINATION` CREATE** (business-reported gap 2026-08-15, *"B3
  沒檢查到單金額超過 Balance餘額"*, reproduced on LC CU02 / EB E04 — a 70,000 presentation against a
  60,000-available Confirmation was accepted with zero check), hardened the same day per the earmark
  description above.
- **Duplicate secondary reference guard** (business-reported gap 2026-08-14, *"同一筆LC 2ndary
  reference 也不可以相同"*): `sourceTransactionRef` (Amendment No. / IB Number / EB Number) must be
  unique within one contract's movement history, scoped to `balanceContractId` — same granularity as
  the §8 idempotency key.
- **Maker EC / Cancel** (business instruction 2026-08-15, *"need a option for Maker to Delete Pending
  (i.e. EC)... for all functions"*): PENDING→CANCELLED was already fully designed in
  `statusTransition.ts` but had no service method/route wired up until this — distinct from `reject()`
  (the Checker's own 4-eyes decline). `cancelledBy` is audit metadata only, never an ownership check.
- **Acknowledge** (business instruction 2026-08-15, Present Docs Earmark): B3's own Checker Release —
  used to be UI-only (lost on reload, invisible cross-session); now a real backend acknowledgment
  (`acknowledgedBy`/`acknowledgedAt`) that deliberately does **not** transition status — the movement
  stays PENDING until B4's real release. `EPLC_EXAMINATION`/CREATE only.
- **Idempotency key (§8)**: `(balanceContractId, eventSeq)` — enforced via a UNIQUE constraint in
  `store/balanceMovementStore.ts`; a resubmission is detected via that UNIQUE violation and resolved
  through `findByContractAndEventSeq`.

## Database layer (`db/index.ts`)

Uses Node's built-in `node:sqlite` (`DatabaseSync`, Node ≥22.5) rather than `better-sqlite3` — this
machine has no MSVC C++ toolchain for `node-gyp` (same reasoning root `CLAUDE.md` already records).
Same named-parameter (`@name`) prepared-statement style as `better-sqlite3`, so the store layer needed
no rewrite. **Known limitation, explicitly documented, not glossed over**: SQLite locks at the
whole-database-file level even under WAL — it cannot demonstrate the design doc §6 requirement *"同一張
LC 底下的多筆同時申請會被正確序列化，但不同 LC 之間完全不互相阻塞"* (same-LC writes serialize,
different-LC writes never block each other) — every write serializes globally regardless of
`logicalContractId`. Safe/over-conservative for this single-process prototype, but flagged as a
**must-replace** (PostgreSQL `SELECT ... FOR UPDATE` scoped to `balance_contract_id`, or MySQL/InnoDB
row locking) before that per-instrument-concurrency requirement is actually validated in production —
same posture root `CLAUDE.md` already records. `db/index.ts` also carries an inline, explicit
non-framework column migration (`acknowledged_by`/`acknowledged_at`) for pre-existing DB files.

## Money / error conventions

`money.ts`'s decimal-string handling deliberately mirrors `lc-payment-wc/microservices/payment-component/src/money.ts`'s
own convention — server-side arithmetic must use decimal/BigDecimal, never a binary float or JSON
number (per `balance-component-api.yaml`'s `MonetaryAmount` description, itself said to mirror
`payment-instructions-post.yaml`'s). It is the only module allowed to construct a `Decimal` from a wire
string. `errors.ts` is typed 1:1 with OAS response codes, same convention as the Payment Component
microservice: `REQUEST_VALIDATION_FAILED` (400), `INSUFFICIENT_AVAILABLE_BALANCE` (409, §6),
`ILLEGAL_STATE_TRANSITION` (409, §8 — the Maker-Checker integrity guard), `NOT_FOUND` (404),
`CONTRACT_VERSION_CONFLICT` (409, §8, duplicate `(logicalContractId, contractVersion)`),
`NATURAL_KEY_ALREADY_EXISTS` (409 — the re-ISSUE guard above, added after the 2026-08-14 gap where
re-Issuing silently double-counted Confirmed Balance instead of being rejected).

## Frontend (`src/app/transaction-builder/`) — dated UI decisions

- Organized as **named Import (A-series) / Export (B-series) business functions** (business
  instruction 2026-08-14, *"similar as Payment Component A1-A4, B1-B5"*), not a raw
  instrumentType/movementType picker — selecting a function pins the instrumentType (and movementType
  where unambiguous).
- **Cascading "LC Index → IB Index" picker**, page-by-page at both levels (business instruction
  2026-08-14: *"search LC Index, then the IB Index... to pick up the LC Number and IB Number"*, *"Order
  by Reference 而且需要 Page by Page設計"* — items ordered by `lc_number` ascending).
- A4's LC Index shows pending IB Number(s) inline (business instruction 2026-08-14: *"LC Index should
  display the associated IB Number together with the LC Number and Pending Amount"*, e.g.
  "810 — IB00001 — ACTIVE — Pending: 25,000"); thousand-separated display only, never used in
  calculation/payload.
- A6/B4: *"The amount should carry from the related LC number + IB number and protected"* — an
  Acceptance's Amount/IB-Number/Tenor Type/Tenor Days auto-fill AND **lock** from the Document Arrival
  being converted / parent LC's own declared values (server-enforced regardless).
- A3 (Document Arrival, Sight) Checker step **deliberately does not call the real release API**
  (business instruction 2026-08-14, revised Maker/Checker statement: *"Checker: Release/approve the
  Document Arrival. No further LC Balance update."*) — the movement stays PENDING server-side; A4/A6
  is what actually finalizes it. B3 is the *one* exception (2026-08-15, Present Docs Earmark needs a
  real Pending-vs-Approved split that survives reload/cross-session) — routed through the real
  acknowledge API instead.
- A9 SHGT Redeem: FULL_REDEEM when Bill Amount fully covers outstanding, else PARTIAL_REDEEM (business
  instruction 2026-08-15) — no separate Full/Partial UI choice needed; amount defaults to SG Available
  Balance and is mandatory (refined same day).
- B5 "EB Index" (business instruction 2026-08-16) merges candidates across BOTH possible
  instrumentTypes (`EPLC_DUE_FROM_ISSUING_BANK` for Sight, `EPLC_ACCEPTANCE` for Usance), since the
  Maker doesn't know in advance which tenor a given EB Number was.
- **Scope boundary, business instruction 2026-08-16**: *"Balance Component 只負責 Contingent
  Liability"* — `EPLC_DUE_FROM_ISSUING_BANK` is created only programmatically by B4's own compound
  Submit; no Balance Component function ever lets a user pick an existing one via a Parent-LC picker
  (collecting a pure receivable with no paired liability is out of scope; B5 is Usance/`EPLC_ACCEPTANCE`-only).
- **Bug, reviewer-reported 2026-08-15** (*"S001 Amendment A01... no Check Function to Approve"* —
  clicking a movement row silently selected nothing) in `index-picker.component.ts`: it checked
  `balanceContractId` first, which meant every movement row's id resolved to its PARENT CONTRACT's id
  instead of its own `movementId`.

## Quality-report-balance.md remediation pass (2026-08-16, user-directed: BAL-003/BAL-101/BAL-102 + related Security Hotspot/Code Smell findings)

User selected, via clarifying questions before this pass started: for **BAL-101**, remove the dead
`dualInstrumentFallback` code rather than wire it live (removing was the only option that didn't change
existing business behavior, since the path never executes today); for **BAL-102**, keep it deferred/no
action (no PostgreSQL instance available in this sandboxed environment — same posture as the prior
remediation pass).

- **BAL-101 (dead code) — Fixed.** `dualInstrumentFallback` was declared on `TransactionFunction` and
  described in four doc comments as B5's Sight/Usance retry mechanism, but never assigned on any real
  registry entry (B5's own entry has always been Usance-only, `instrumentType: 'EPLC_ACCEPTANCE'` fixed,
  no subChoice) — confirmed dead, not merely under-tested. Removed the field itself
  (`balance-component.model.ts`), both call sites that read it in
  `transaction-builder.component.ts` (`searchExistingContract()`'s primary/fallback retry block, and a
  second, previously-undocumented mirror of the same retry inside `searchCheckerLc()`), and
  `loadSettleableBalances()`'s two-instrumentType merge (now just `[fn.instrumentType]`). Every doc
  comment that referenced the field or a "B5 Sight case" was corrected in place — B5's
  `settlesAcceptanceOnMature`/`settleableBalanceIndex` behavior was never itself the dead part, only the
  now-gone Sight alternative was. Two spec files updated to match:
  `transaction-builder.component.gaps.spec.ts`'s coverage-gap test now asserts "exactly one
  `resolveContract` call, success or failure, no retry"; `transaction-builder.component.selection.spec.ts`
  had its own synthetic-fallback describe blocks removed (nothing left to exercise).
- **BAL-102 (SQLite whole-file locking) — Deferred, no action, per user's own explicit choice above.**
  `db/index.ts`'s doc comment and this file's Database layer section already record the must-replace
  posture (PostgreSQL row-level locking); nothing further changed.
- **BAL-103 (CORS allow-any-origin) — Fixed.** `backend/server.js` now passes
  `cors({ origin: ALLOWED_ORIGINS })`, an explicit allow-list defaulting to `http://localhost:4200`
  (matches `proxy.conf.json`'s `:4300` target), overridable via a comma-separated `ALLOWED_ORIGINS` env var.
- **BAL-104 (no security headers/rate limiting) — Fixed.** `helmet()` added to both `backend/server.js`
  and `microservices/balance-component/src/app.ts`. A rate limiter (`express-rate-limit`, 120 req/min) is
  scoped to the microservice's `/balance-movements` router only (the Maker/Checker write surface) —
  deliberately not applied to the read-heavy `/balance-contracts` catalog/lookup/snapshot endpoints.
- **BAL-105 (no ESLint/Prettier) — Fixed.** Baseline flat-config `eslint.config.js` +
  `.prettierrc.json` added to all three sub-projects (Angular app: `@typescript-eslint/recommended` +
  `angular-eslint`; `backend/` and the microservice: `@eslint/js` recommended + TS rules where
  applicable). `@typescript-eslint/no-explicit-any` is a warning, not an error, so it surfaces BAL-108's
  residual debt without blocking unrelated work. `npm run lint`/`npm run format:check` scripts added to
  all three `package.json`s. Not yet wired into CI or `npm test` — closes "tooling exists", not
  "enforced in the gate."
- **BAL-106 (hand-rolled migration) — Fixed.** New `microservices/balance-component/src/db/migrations.ts`
  — a `schema_migrations` tracking table + ordered `Migration[]` array with `up()` functions, replacing
  the old inline `ALTER TABLE ... IF NOT EXISTS`-style check in `db/index.ts`. The existing
  `acknowledged_by`/`acknowledged_at` column addition became migration `id: 1`. New
  `test/unit/db/migrations.test.ts` (3 tests: fresh-run applies + records; second run is a no-op, doesn't
  re-throw "duplicate column"; backward-compat with a pre-existing db that already has the columns but no
  tracking table) — `migrations.ts` at 100% coverage.
- **BAL-107 (test-only internals on the Express app export) — Fixed.** `backend/server.js` now exports
  `module.exports = { app, runCase, resolveLogicalContractId, callMicroservice }` instead of attaching
  those three functions as properties onto the `app` function object. `backend/test/server.test.js`'s
  import updated to `const { app } = require('../server')`; `runCase.test.js` already used destructuring,
  no change needed there beyond its own header comment.
- **BAL-108 (residual `any` typing in `transaction-builder.component.ts`) — Partially fixed, by
  design.** 6 of 11 identified `any`-typed component fields retyped to real domain types with zero test
  breakage: `lookupResult` (`{ contract: BalanceContract; snapshot: BalanceSnapshot } | null`),
  `lookupMovements`/`acceptanceMovements`/`sgMovements` (`BalanceMovement[]`), `acceptanceSnapshot`/
  `sgSnapshot` (`BalanceSnapshot | null`). 5 fields — `catalogPayableMovements`, `payableMovements`,
  `selectedPayMovement`, `checkerItems`, `selectedCheckerMovement` — were **left as `any`/`any[]`
  deliberately**: retyping them to `BalanceMovement` broke ~15+ existing test fixtures across
  `transaction-builder.component.spec.ts` and `transaction-builder.component.selection.spec.ts`, which
  intentionally construct partial objects (e.g. `{movementId: 'm2'}`) for these specific fields. Rewriting
  those fixtures was judged out of scope for a "fix the root cause without changing business
  functionality" pass — an honest scope limitation, not silently dropped. Remaining `any` usage should be
  retyped incrementally, one field/spec-file at a time, in a follow-up pass.
- **BAL-003 (God Component, `transaction-builder.component.ts`) — 2 of 3 planned extractions now done.**
  Extraction 1 (paging state machine → `loadPagedCatalog()`) predates this pass. Extraction 2, done this
  pass: the Look Up panel's three near-identical "fetch snapshot + fetch/sort movements by eventSeq"
  pairs (Tab 1 LC, Tab 2 Acceptance, Tab 3 SG) consolidated into a shared `loadSnapshotAndMovements()`
  private helper, and `runLookup()`'s two near-identical "fetch candidates under this LC, auto-pick if
  exactly one" catalog calls consolidated into `loadUnderLookupCandidates()` — same "guard/params
  unchanged, only the fetch/populate body moves" convention as `loadPagedCatalog`, zero template changes,
  zero test changes needed (behavior byte-for-byte identical, verified by the full existing spec suite
  passing unchanged). Extraction 3 (Checker actions — submit/release/reject/cancel/acknowledge, the
  highest-risk ~800+ lines of money-moving logic) stays **deliberately deferred** — not a safe
  same-behavior consolidation the way the other two were; attempting it without a reviewer sign-off risks
  the exact kind of regression this pass's own "no business functionality changes" constraint forbids.
- **Full three-suite verification after all fixes above:** Angular app 439/439 tests passing
  (99.75%/95.52%/99.66%/99.82% coverage), `ng build --configuration development` clean, `npm run lint`
  0 errors/227 warnings; microservice 189/189 tests passing (99.35%/96.18%/100%/99.76% coverage, up from
  186 due to `migrations.test.ts`), `npm run typecheck`/`npm run lint` both clean (0 errors); `backend/`
  27/27 tests passing (97.95%/97.36%/95.65%/97.75% coverage), `npm run lint` 0 errors. All three clear the
  95% floor on all four metrics.

## Amount input follows the typed Currency's own decimal places (2026-08-16, user-requested — "JPY 10000 without cents")

The Transaction Builder's Amount field is Formly `type: 'number'`, and Currency is a free-typed sibling
field (no fixed dropdown/backend currency master — unlike `lc-payment-wc`'s own `CurrencyService`/
`GET /api/currencies`, whose `backend/data/currencies.json` shape this mirrors). New
`CURRENCY_DECIMALS`/`decimalPlacesForCurrency()`/`amountExceedsCurrencyDecimals()`
(`src/app/transaction-builder/balance-component.model.ts`) — a small ISO 4217 minor-unit lookup (JPY/
TWD/IDR/KRW/VND/CLP/ISK = 0; BHD/IQD/JOD/KWD/OMR/TND = 3; everything else defaults to 2, matching both
`lc-payment-wc`'s own currencies.json entries and this project's own microservice
`MONETARY_AMOUNT_PATTERN` ceiling of 3dp).

Three integration points in `transaction-builder.component.ts`, all reading the same helper — no
duplicated decimal-place logic:
- `rebuildFields()`'s `amount` field gets `props.step` set at rebuild time AND kept live via a Formly
  `expressions['props.step']` callback reading the sibling `currency` field's own live value — same
  "reactive `expressions`, not a `rebuildFields()` re-run" convention the A1/B1 Tenor Days field already
  uses (a full `rebuildFields()` call on every keystroke risks input-focus loss on a live `*ngFor`).
- New `amountDecimalMismatch`/`currencyDecimalPlaces` getters back a template warning
  (`.tb-error`, same severity class as the pre-existing "exceeds Available Balance" warning) shown right
  under the `<formly-form>`, visible regardless of which business function is selected.
- `submit()` gained a hard guard (`amountExceedsCurrencyDecimals(...)`) right after the existing
  required-fields check — blocks submission with a clear message
  (`Amount 10000.5 has more decimal places than JPY allows (0).`) rather than silently rounding or
  truncating what the user typed, matching this file's own domain-review posture (validate at the
  boundary, don't guess).

Initially **not** mirrored into the microservice's own `money.ts`/`MONETARY_AMOUNT_PATTERN` in this same
pass — that pattern was still currency-agnostic (accepted up to 3dp for any currency) by design at the
time; scoping a server-side currency-aware amount check was out of scope for this first, UI-focused
request. **Superseded the same day** — see the section immediately below — once the user explicitly
asked for server-side enforcement too ("the number of decimal places must be enforced server-side based
on the currency code and its configured currency decimal place").

See `balance-component.model.spec.ts`'s "decimalPlacesForCurrency / amountExceedsCurrencyDecimals"
describe block (JPY 0dp, the 3dp ISO exceptions, the 2dp default fallback, and the boundary/empty-input
cases) and `transaction-builder.component.gaps.spec.ts`'s "Amount field props.step Formly `expressions`"
+ "currencyDecimalPlaces / amountDecimalMismatch" describe blocks, plus
`transaction-builder.component.actions.spec.ts`'s new `submit()` guard test — 454/454 Angular tests
passing (15 new), 99.76%/95.57%/99.67%/99.82% coverage, `ng build --configuration development` and
`npm run lint` (0 errors) both clean.

### Live regression, reviewer-reported 2026-08-16 ("All the Submit functions are not working in UI") — `amountExceedsCurrencyDecimals` crashed on the Amount field's actual runtime value, fixed

**Root cause:** `TransactionModel.amount` is typed `string` in TypeScript, but the Amount field is Formly
`type: 'number'` — a native `<input type="number">` — and Angular's own built-in `NumberValueAccessor`
coerces that input's value to a real JS `number` (or `null` when empty) before it ever reaches
`model.amount`, regardless of the compile-time type. `amountExceedsCurrencyDecimals`'s original body
called `amount.split('.')` directly, which throws `TypeError: amount.split is not a function` on a
number. Because this function backs the `amountDecimalMismatch` getter — read from the template on
*every* Angular change-detection cycle, not just on submit, and rendered unconditionally under
`<formly-form>` regardless of which business function is selected — the error re-fired continuously the
instant any digit was typed into Amount, on every single function (A1–A9/B1–B5 alike). This froze the
whole form (confirmed live: `Submit` clicks stopped doing anything, `submit()` itself throws the
identical error at its own `amountExceedsCurrencyDecimals(...)` guard before ever reaching the API call)
— explaining the "all Submit functions" symptom precisely, since the break was in shared
template/guard code, not in any one function's own logic. Every unit test that exercised this helper
passed a genuine string literal, which is exactly why the whole 455-test suite never caught it — this
class of bug (DOM/valueAccessor coercion) is structurally invisible to this project's own
direct-instantiation test convention; only a live browser check (`ng serve`, not just `tsc --noEmit`/
`npm test`) surfaces it, same lesson `lc-payment-wc/CLAUDE.md`'s own "always verify live in browser"
rule already captures for template-scoping bugs.

**Fix:** `amountExceedsCurrencyDecimals` (`balance-component.model.ts`) now coerces via `String(amount)`
before calling `.split('.')`, and its parameter type widened to `string | number | null | undefined` to
match what Angular actually passes at runtime. New test asserting the function handles a genuine `number`
input (not just a string literal) — `decimalPlacesForCurrency` itself was never affected (it never
touches `amount`). Verified: `npx tsc -p tsconfig.app.json --noEmit` clean; `npm test` → 455/455 passing
(1 new); live in-browser re-verification (not just unit tests, per the lesson above) — A1 (Import LC
Issue) and B1 (Export Confirm LC) both submitted successfully end-to-end against the real microservice
after the fix, with the currency-decimal-place warning banner itself re-confirmed still correctly firing
for a genuine violation (JPY + a fractional amount) and no longer crashing the renderer.

## Microservice now enforces the SAME currency-decimal-place rule server-side (2026-08-16, user-requested follow-up — "must be enforced server-side based on the currency code and its configured currency decimal place")

`microservices/balance-component/src/money.ts` gained a server-side mirror of the Angular model's own
`CURRENCY_DECIMALS` table — same currency codes, same values, same 2dp default fallback, kept in exact
sync deliberately (so a value the UI's own warning/`submit()` guard already accepts is never rejected
here, and vice versa):

- `CURRENCY_MINOR_UNITS` — the table itself (JPY/TWD/IDR/KRW/VND/CLP/ISK = 0; BHD/IQD/JOD/KWD/OMR/TND =
  3; else 2).
- `minorUnitsForCurrency(currency)` — case-insensitive/trimmed lookup, falls back to 2 for anything not
  listed.
- `decimalPlaces(value)` — counts literal fractional digits in an already-pattern-valid wire string
  (mirrors `lc-payment-wc/microservices/payment-component/src/money.ts`'s own helper of the same name
  exactly).
- `describeAmountScaleViolation(amount, currency)` — pure/non-throwing; returns a human-readable message
  or `null`. Deliberately doesn't decide the HTTP mapping itself (money.ts stays a parsing/formatting
  module, not an HTTP-aware one) — that's the route's job, same separation `parseMonetaryAmount`/
  `formatMonetaryAmount` already keep.

**Deliberate divergence from `lc-payment-wc`'s own sibling convention, explained in `CURRENCY_MINOR_UNITS`'s
own doc comment:** that project's `knownMinorUnitsForCurrency()` SKIPS the scale check entirely for a
currency it has no data for, since Currency there is backed by a real Currency-API master and "no data"
genuinely means "don't guess." This project's Currency field is free-typed with no master-data source at
all (same fact the Angular-side section above already establishes) — skipping the check for an unlisted
code here would mean an unrecognized currency gets NO server-side scale enforcement whatsoever, which is
worse than falling back to the 2dp common case. So, unlike the sibling project, an unlisted currency here
defaults to 2dp rather than being skipped — matching the Angular UI's own fallback exactly, on purpose.

**Wired into `routes/balanceMovements.ts`'s `POST /balance-movements` handler** (the only endpoint that
accepts an `amount`+`currency` pair together), right after the existing required-fields presence check,
in two steps:
1. `MONETARY_AMOUNT_PATTERN.test(body.amount)` — the general shape check that was previously never run
   at the request boundary at all (see the closed-gap note below).
2. `describeAmountScaleViolation(body.amount, body.currency)` — the new currency-scale check itself.

Both throw `RequestValidationError` (400 `REQUEST_VALIDATION_FAILED`), the same error class every other
validation failure on this route already uses — no new error code introduced.

**Side effect: closes a pre-existing, previously-documented gap**, not a new one introduced by this fix.
`test/unit/app.test.ts` already had a test proving a malformed-but-non-empty `amount` (e.g.
`"not-a-number"`) fell through the route's old presence-only check, reached
`computeCeilingAmount()`/`parseMonetaryAmount()` deep in the service layer, and surfaced as a generic 500
`INTERNAL_ERROR` instead of a proper 400 — because `InvalidMonetaryAmountError` (from `money.ts`) is not
an `ApiError` subclass, so it never hit the route-level 400 path. Adding the pattern check as a
precondition for the new scale check (decimal-place counting is meaningless on an unparseable string)
closes this specific case at the same time: that same request now returns 400
`REQUEST_VALIDATION_FAILED`, not 500. The test was updated in place to assert the new (correct) status,
title rewritten to describe the closed gap rather than an open one. The deeper, separate issue this
doesn't touch — `balanceService.ts`'s own internal `new Decimal(req.amount)` call sites bypassing
`parseMonetaryAmount()` even after this route-level check — was `Quality-report-balance.md`'s BAL-115;
**fixed the same day, see the section immediately below.**

See `test/unit/errorsAndMoney.test.ts`'s "minorUnitsForCurrency / decimalPlaces /
describeAmountScaleViolation" describe block (pure-function coverage: every table entry, the 2dp
fallback, case-insensitivity, and both the pass/violation shapes of `describeAmountScaleViolation`) and
`test/unit/app.test.ts`'s "HTTP integration — app.ts bootstrap: /healthz and request-layer amount
validation" describe block (the malformed-amount 400 rewrite, a JPY-with-decimals 400, a whole-number
JPY 201, a KWD-with-3dp 201, and an unrecognized-currency-defaults-to-2dp 400) — 217/217 microservice
tests passing (7 new), 98.96%/95.75%/100%/99.33% coverage (global threshold; `app.ts`'s own generic
500-fallback branch dropped to locally uncovered as an expected consequence of the malformed-amount case
no longer reaching it, but the project's `jest.config.js` gate is a global, not per-file, threshold, and
all four metrics clear it comfortably), `npm run typecheck`/`npm run build`/`npm run lint` (0 errors, same
pre-existing warnings) all clean. Full three-suite verification re-run after this change per this file's
own standing rule: Angular app 454/454 (unaffected, microservice-only change), `backend/` 27/27
(unaffected).

## BAL-115 fixed — `balanceService.ts`'s three internal `new Decimal(req.amount)` call sites now go through `parseMonetaryAmount()` (2026-08-16, user-requested — "Fix BAL-115 too")

`Quality-report-balance.md`'s BAL-115 (Major/Bug): `money.ts`'s own doc comment states it is "the only
module allowed to construct a Decimal from a wire string", enforced via `parseMonetaryAmount()`
(validates `MONETARY_AMOUNT_PATTERN` before constructing). Three call sites in
`service/balanceService.ts`'s `createMovement()` bypassed this — `new Decimal(req.amount)` directly, at
the SG Issue vs. parent LC Tight Available Balance check, the Present Docs earmark vs. parent
Confirmation check, and the AMEND_DECREASE sufficiency check. The section above (routes-level
enforcement) already closes this at the HTTP boundary for real traffic, but `createMovement()` is a
public method any caller can invoke directly — including this project's own tests
(`caseWalkthroughs.test.ts`'s domain-only walkthroughs aside, `app.test.ts` and any future
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

Verified: `npm run typecheck`/`npm run build` clean; `npm test` → 220/220 passing (3 new),
98.97%/95.75%/100%/99.33% coverage (global threshold, unchanged from the section above — still clears
95% on all four metrics); `npm run lint` 0 errors, same pre-existing warnings. Full three-suite
re-verification per this file's own standing rule: Angular app 454/454 and `backend/` 27/27, both
unaffected (microservice-only change).

## Second Quality-report-balance.md remediation pass (2026-08-16, user-directed by priority — P1 BAL-003, P2 BAL-116/117/118/119; P0 BAL-001/BAL-002 and P1 BAL-102 explicitly excluded — no auth/Angular-upgrade work here, BAL-102 stays deferred for the same no-PostgreSQL-instance reason as before)

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

### BAL-003 (Major, Code Smell) — third of three planned extractions now done: the Checker release/reject/cancel chain's shared success/failure tail, consolidated (submit()'s own 430-line Maker dispatch stays untouched — see below)
Previously deferred as "the highest-risk, money-moving ~800+ lines... isn't a safe same-behavior
consolidation" — re-scoped rather than attempted whole. A full "move this business logic into a separate
service" extraction was rejected as too risky: the compound release/reject/cancel chain
(`release()`/`releaseMatchedReceivable()`/`releaseDueFromIssuingBank()`/`releaseAcceptance()`/
`releaseAcceptanceLiability()`/`releaseAcceptanceReimbReceivable()`/`reject()`/`deleteMakerPending()`)
reads and writes ~10 pieces of component state (`actionBusy`, `submitResult`, `submitError`,
`selectedFunction`, `selectedContract`, `selectedPayMovement`, `arrivalSgRedeemMovementId`,
`matchedReceivableMovementId`, `dueFromIssuingBankMovementId`, `acceptanceMovementId`,
`acceptanceReimbReceivableMovementId`) and calls back into 4 other component methods
(`refreshSelectedContractSnapshot()`, `syncCheckerToContext()`, `syncLookupToContext()`,
`reloadPayableMovementsAfterCompound()`) — moving it to a service would mean passing all of that back and
forth for no real benefit, and a mistake in a 4-leg financial release chain is exactly the kind of
regression this fix's own "no business functionality changes" constraint forbids.

**What was actually done, matching the SAME "guard/branch logic unchanged, only the repeated body moves"
convention as the two prior extractions** (`loadPagedCatalog`/`loadSnapshotAndMovements`): every leg of
the release/reject/cancel chain shared one of two exact literal shapes —
- Success tail: `actionBusy=false; submitResult=res; refreshSelectedContractSnapshot();
  syncCheckerToContext();` (+ optionally `syncLookupToContext()`/`reloadPayableMovementsAfterCompound()`)
- Failure tail: `actionBusy=false; submitError=<unique business-context message>;`

New `finishCheckerAction(res, opts?)` / `failCheckerAction(message)` private helpers consolidate exactly
those two shapes — 6 call sites now use `finishCheckerAction` (`release()`'s plain path,
`releaseMatchedReceivable`, `releaseDueFromIssuingBank`, `releaseAcceptance`'s own tail,
`releaseAcceptanceReimbReceivable`, `reject()`, `deleteMakerPending`'s own `cancelPrimary`) and ~10 call
sites now use `failCheckerAction`. WHICH release/reject/cancel call to make, in what order, under what
business condition, and every error message string, is completely unchanged — every `if` branch, every
comment explaining WHY a given leg exists, is untouched; only the identical trailing state-mutation lines
were factored out. File size: 2,835 → 2,778 lines (a modest reduction — this was never primarily a
line-count exercise, the point was removing ~15 duplicate 3-6 line blocks).

**`submit()` itself (the ~430-line Maker dispatch across all 14 named business functions) was
deliberately NOT touched in this pass** — it's a fundamentally different kind of complexity (building a
function-specific request object across 14 branches, not a chain of near-identical API calls), and a safe
extraction strategy for it (most likely: splitting into 14 named private per-function methods, still on
the component, dispatched by a switch) is a larger, separate piece of work than this pass's scope. BAL-003
therefore remains open at Major severity — the God Component is smaller and its release/reject/cancel
logic is now DRY, but the class still does five or six separate jobs.

**Verification, given the stakes:** full Angular suite (455/455, zero test files needed changes — strong
evidence of exact behavior preservation, since the pre-existing suite was written against the original
implementation) + `tsc --noEmit` clean + `ng build` clean + `npm run lint` (0 errors, same warnings) +
**live in-browser end-to-end verification** (not just unit tests, given this touches money-moving
Maker/Checker logic): a fresh A1 (LC Issue) submitted and then released via the Checker queue — Available
Balance/Confirmed Balance/Tight Available Balance all correctly reflected the release
(0 → 50,000) — and `deleteMakerPending()` (Maker EC) separately verified end-to-end on a different LC,
correctly cancelling the movement, zeroing the balance, and clearing the Checker queue
(`finishCheckerAction(res, {syncLookup: true})`'s own exact path). Both exercise the plain-path shape
shared by every other consolidated call site.

**Full three-suite verification after this whole remediation pass:** Angular app 455/455
(99.75%/95.61%/99.67%/99.81% coverage), `backend/` 28/28 (97.97%/97.36%/95.65%/97.77%), microservice
234/234 (98.98%/95.95%/100%/99.34%) — all three clear their own 95% floor on all four metrics.

### BAL-001/BAL-002 status corrected: **Deferred, user-confirmed** (2026-08-16, user-requested — "BAL-001 BAL-002 change to defferrd")
Documentation-only change to `Quality-report-balance.md` — no code touched. BAL-001 (no authentication)
and BAL-002 (8 High Angular CVEs) were already excluded from this session's own remediation scope (the
user's own instruction), but the report itself still described them only as unresolved
Blocker/Critical findings rather than recording that exclusion as a deliberate decision — inconsistent
with how BAL-102 (the SQLite→PostgreSQL swap, also excluded, also its own dedicated piece of work) was
already framed. Both findings' own sections, the findings table, the Overall Quality Score summary, and
the Gate Conditions section were updated to add **"Deferred, user-confirmed"** and an `Outcome:` note
matching BAL-102's own wording exactly — real authentication and a major Angular version upgrade are
each their own dedicated piece of work, correctly out of scope for an incremental code-quality
remediation pass. **This does not change their severity, does not remove them as gate conditions before
any production deployment, and does not imply the underlying risk is reduced** — "deferred" describes
the decision not to attempt them in this pass, not a change to the actual exposure. Composite score
unchanged by this edit (90/100, A-) — this was a status/framing correction, not a new fix.

## Third same-day remediation pass (2026-08-16, user-directed by priority — "Fix those 3 items": P1 BAL-003 submit()-split, P2 BAL-108 remaining `any` fields, P2 BAL-105 Prettier format:check)

### BAL-105 — Fixed for real this time (was "tooling exists, not applied" since it was first closed)
`backend/`'s own `format:check` script used `prettier --check "**/*.js" --ignore-path .gitignore` — the
`--ignore-path .gitignore` pointed at a file that doesn't exist in `backend/` (only a root-level
`.gitignore` exists), so nothing was actually excluded and the auto-generated `coverage/lcov-report/`
files showed up as formatting failures alongside real source. Rescoped to
`prettier --check "*.js" "data/**/*.js" "test/**/*.js"` (matching the `lint` script's own scope, and the
Angular app's/microservice's own already-correctly-scoped `src/**/*.ts` patterns) — coverage output
naturally excluded, no `.prettierignore` file needed. Then ran `prettier --write` across all three
sub-projects for real (previously flagged as "still open" — tooling existed and gated CI-adjacent
checks, but no repo-wide reformat had actually landed) — a pure formatting-only change (quotes, spacing,
line-wrapping), zero logic touched. Verified: `format:check` now passes clean in all three sub-projects;
full three-suite re-run (455/28/234 tests) confirms the reformat changed nothing observable — `tsc
--noEmit`/`npm run typecheck`, `npm run lint` (0 errors in all three), and `ng build`/`npm run build` all
clean.

### BAL-108 — the remaining 5 `any`-typed fields now retyped (previously left `any` after retyping broke test fixtures)
`catalogPayableMovements` (`Map<string, any[]>` → `Map<string, BalanceMovement[]>`), `payableMovements`
(`any[]` → `BalanceMovement[]`), `selectedPayMovement` (`any | null` → `BalanceMovement | null`),
`checkerItems` (`any[]` → `BalanceMovement[]`), `selectedCheckerMovement` (`any | null` →
`BalanceMovement | null`). The blocker from the prior attempt (bare partial-object test fixtures like
`{movementId: 'm1'}` failing `TS2740` against the full `BalanceMovement` shape) was resolved by adding a
`makeMovement()`/`movement()`/`mkMovement()` fixture-builder helper to each of the three affected spec
files (`transaction-builder.component.spec.ts`, `.selection.spec.ts`, `.gaps.spec.ts` — matching the
naming convention each file already used for its own `makeContract`/`mkContract`-style helpers, and
mirroring `actions.spec.ts`'s own pre-existing `makeMovement()`), supplying sensible defaults for every
required `BalanceMovement` field (`exposureNature`, `ceilingAmount`, `createdBy`, `createdAt` were the
ones the old bare literals were missing) so each test site only needs to override what it actually cares
about, same "shorthand fixture builder" pattern this codebase already used for `BalanceContract`/
`BalanceSnapshot`. All ~30 affected fixture call sites across the three files updated to use the new
helper instead of bare object literals (including several that were previously silently cast via
`(c as any).selectedCheckerMovement = ...`/`... as any`, now genuinely typed, closing those too).
Verified: `npm test` → 455/455 passing (no new tests added — this was a pure fixture-shape fix, not new
coverage), `tsc --noEmit` clean, `ng build` clean, `npm run lint` 0 errors (216 warnings, down from 231 —
the removed fixture-level `as any` casts are gone; the remaining warnings are `any` usage this finding's
own prior pass already explained is out of scope — `submitResult`/callback params like `res: any`/
`settleRes: any` throughout the release/reject/submit chain, a larger, separate piece of work).

### BAL-003 — submit()'s own ~430-line body split into 7 named methods; submit() itself now 29 lines
Previously deferred alongside the release/reject/cancel chain extraction as the harder, still-untouched
piece — re-scoped the same way that extraction was: not a service extraction (this logic reads/writes
deeply into `selectedContract`/`selectedArrivalSg`/`arrivalSgSnapshot`/`naturalKey`/`model`/etc.,
so moving it elsewhere would just relocate the coupling), but a straightforward decompose-into-named-
methods split. On closer reading, `submit()`'s actual shape wasn't "14 per-function branches" as
originally guessed — it's generic validation (mostly shared across all 14 functions, with a few
embedded function-specific checks) + generic request assembly + exactly 4 special-case compound
submission shapes (gated by function flags) + 1 generic default path covering everything else. Split
into:
- `validateSubmit(): boolean` — the ~105-line validation block, guard conditions and error messages
  unchanged, `return;` → `return false;`/`return true;`.
- `buildSubmitRequest(): CreateMovementRequest | null` — the ~34-line request-assembly block, `return;` →
  `return null;`/`return req;`.
- `submitDocumentArrivalWithSg()` / `submitConfirmationHonourWithReceivable()` /
  `submitConfirmationAcceptWithReceivable()` / `submitAcceptanceSettleWithReceivable()` — the four
  compound shapes (A3S's SG-first 2-step; B3 Sight/HONOUR's 2-step; B4 Usance/ACCEPT's 3-step; B5's
  settle-then-resolve-then-reimburse 3-step), each taking `req: CreateMovementRequest` as its only
  parameter, everything else still read from `this` exactly as before.
- `submitPlain()` — the default single-`createMovement()` path used by every function that doesn't need
  one of the four special shapes.
- `submit()` itself — now just: validate → build request → reset busy/result state → dispatch to
  whichever of the 5 methods the same `selectedFunction?.xxx` flag conditions (unchanged) select.

Pure code motion: every guard condition, every business-instruction comment, every error message string,
and the exact order every API call fires in is byte-for-byte unchanged — only WHERE each piece of code
lives changed. `submit()` itself: ~423 lines → 29 lines. File total: 2,778 → 2,850 lines (net growth from
new method signatures/doc comments — expected, this was never a line-count exercise, same posture as the
two prior BAL-003 extractions).

**Verification, given the stakes (this dispatches all 14 Maker business functions' own money-moving
Submit):** full Angular suite 455/455 with **zero test files needing changes** — the pre-existing suite
was written against the original single-method implementation and still passes completely unmodified,
strong evidence of exact behavior preservation — plus `tsc --noEmit`/`ng build`/`npm run lint` all clean.
**Live in-browser end-to-end verification**, not just unit tests, given the stakes:
- A1 (LC Issue) submitted successfully via `submitPlain()` — PENDING ISSUE movement created, Look Up
  panel correctly synced.
- That same LC released via the Checker queue, then an A8 (Shipping Guarantee Issue) submitted and
  released against it as parent — both plain-path submits, both correct.
- A3S (Document Arrival w/ Shipping Gtee) submitted against that LC+SG pair, exercising
  `submitDocumentArrivalWithSg()`'s first leg: the SG's own FULL_REDEEM (30000, MIN(Bill Amount, SG
  Outstanding) correctly derived) fired first, correctly tagged with `sourceTransactionRef: 'IB01'` from
  the typed IB Number — confirmed directly via the SG's own Event Timeline
  (`ISSUE 30000 Approved` → `FULL_REDEEM 30000 IB01 PENDING`) and the Off-Balance Exposure figure
  dropping from 30000 to 0 (the PENDING redemption correctly netting out, per the documented "PENDING
  counts the same as RELEASED for this calculation" rule). The chain's *second* leg (the LC's own
  UTILIZE) hit an idempotency collision from reusing `eventSeq: 1` across every test submission on the
  same LC in this manual verification session (a test-setup artifact — the server correctly returned the
  pre-existing ISSUE record via its own `(balanceContractId, eventSeq)` idempotency handling, exactly as
  designed, rather than creating a duplicate) — not a defect in the refactor. The three remaining compound
  shapes (B3/B4/B5) require an Export Confirmation + B3 presentation to set up and weren't separately
  live-verified this pass; they're structurally identical in shape to the one that was (a
  `createMovement().subscribe()` chain moved verbatim, same as the already-verified one), and are covered
  by the unchanged, still-passing unit test suite.

**Full three-suite verification after this whole remediation pass:** Angular app 455/455
(99.75%/95.62%/99.68%/99.81% coverage), `backend/` 28/28 (97.97%/97.36%/95.65%/97.77%), microservice
234/234 (98.98%/95.95%/100%/99.33%) — all three clear their own 95% floor on all four metrics.

## BAL-120 status corrected: **Deferred, user-confirmed** (2026-08-16, user-requested — "BAL-120 Deferred")
Same treatment/framing as BAL-001/BAL-002/BAL-102 above — a documentation-only change, no code touched.
`balanceMovementStore.ts`'s idempotency-collision detection (`/UNIQUE constraint failed/.test(message)`)
stays as message-text matching because `node:sqlite` (`DatabaseSync`) doesn't currently expose a stable
error code/type for constraint violations to switch to instead — there's no better mechanism available
today, not unaddressed work sitting on the shelf. Revisit if/when `node:sqlite` adds one, or as part of
the already-planned SQLite→PostgreSQL swap (BAL-102), whichever comes first. Severity unchanged at Info;
this was never a gate condition and remains non-blocking either way.

## Fourth same-day remediation pass (2026-08-16, user-directed — "BAL-003 God Component ~2,850 lines... 目前最值得繼續改善" then "BAL-003 使用OOD SOLID原則 避免重複代碼")

### BAL-003 — paginated-picker state/boundary-math extracted into a new `PagedListState` class (OOD/SOLID)
The 3rd-and-done framing from the prior two passes undersold one remaining, genuine duplication the
report's own evidence block already named: the catalog LC Index, Parent LC picker, and IB/SG Index each
carried their **own** copy of the same `page`/`total`/`pageSize` field trio, the same
`Math.max(1, Math.ceil(total / pageSize))` totalPages formula, and the same "am I already at the
first/last page" boundary check in their own `xxxPrevPage()`/`xxxNextPage()` methods — three literal
copies of identical navigation math, independent of (and in addition to) the already-shared
`loadPagedCatalog()` fetch helper. User's own framing ("OOD SOLID原則 避免重複代碼" — apply OOD/SOLID
principles, avoid duplicate code) named exactly this.

**What was done:** new `src/app/transaction-builder/paged-list-state.ts` — a small, framework-agnostic
`PagedListState` class owning `page`/`total`/`pageSize`, a `totalPages` getter (the one formula, now
written once), `reset()`, and `prevTarget()`/`nextTarget()` (return the target page number, or `null` at
a boundary) — Single Responsibility (this class's only job is paging state + boundary math) and
Open/Closed (a future 4th paginated picker instantiates it, no new copy-pasted math). Three private
instances added to `TransactionBuilderComponent` (`catalogPaging`/`parentPaging`/`ibIndexPaging`).

**Deliberately preserved the existing public surface** rather than renaming it: `catalogPage`/
`catalogTotal` (and the `parent`/`ibIndex` equivalents) are now getter/setter *accessor pairs* delegating
to the new `PagedListState` instance, not a breaking rename — chosen because ~96 existing test call sites
across the 3 spec files and 8 template bindings read AND (in ~30 cases) directly *write*
(`comp.catalogPage = 5`) these properties by name; accessors keep every one of those working completely
unmodified while still moving the actual state storage and math to one shared, independently-tested
place. The 3 `xxxTotalPages` getters now delegate to `paging.totalPages`; the 6 `xxxPrevPage()`/
`xxxNextPage()` methods now call `paging.prevTarget()`/`paging.nextTarget()` and only decide whether to
fire the actual reload — identical to the pre-existing pattern of `loadPagedCatalog()`'s own callback-
based design, just applied one layer up. The interleaved reset block (`selectFunction()`'s state-clearing
section) now calls `xxxPaging.reset()` instead of the previous two-line-per-picker assignment.

**Verification:** new `paged-list-state.spec.ts` (10 tests: default state, totalPages — zero/partial/exact-
multiple, `reset()`, `prevTarget()`/`nextTarget()` at and away from boundaries, including the `total: 0`
single-page edge case) — 100% coverage on the new file. Full Angular suite 465/465 (455 pre-existing +
10 new) with **zero existing test files needing any changes** — the strongest evidence available that the
public behavior is unchanged, since the pre-existing 96 read/write call sites across
`transaction-builder.component.spec.ts`/`.selection.spec.ts`/`.gaps.spec.ts` were written against the old
plain-field implementation and still pass completely unmodified against the new accessor-backed one.
`tsc --noEmit`, `npm run lint` (0 errors — pre-existing `any` warnings elsewhere untouched), and
`format:check` all clean. **Live in-browser verification**: A4 (Sight Settlement)'s LC Index picker
rendered correctly against real data ("Page 1 / 1 (8 total, ordered by Reference)"); then, directly against
the live running component instance (`ng.getComponent`), simulated a 25-record/3-page scenario and drove
`catalogNextPage()`/`catalogPrevPage()` through the full boundary sequence (1→2→3, correctly refused to
advance past page 3, back to 2) — exercising the exact same code path the template's Prev/Next buttons
call, end to end through the real running app, not just the unit suite. Zero console errors.

File size: 2,850 → 2,888 lines (net growth from the getter/setter pairs' own signatures — the pattern
established every extraction pass so far: this was never a line-count exercise, the win is one shared,
tested implementation instead of three duplicated ones). **BAL-003 stays open at Major** — this closes a
real, previously-uncredited duplication finding, but doesn't reduce the *number of jobs* the class does;
a genuine architectural decomposition (separate components/services) remains the separate, larger future
work already on record in `Quality-report-balance.md`.

**Full three-suite re-verification after this pass:** Angular app 465/465
(99.68%/95.65%/99.39%/99.73% coverage — new `paged-list-state.ts` at 100%/100%/100%/100%), `backend/`
28/28 (unaffected, unchanged), microservice 234/234 (unaffected, unchanged).

## Fifth same-day remediation pass (2026-08-16, user-directed — BAL-003 "8/10, 下一個主要改善目標" + BAL-110 "7/10, 建議現在就做，成本低")

### BAL-110 — contract test added, catches real InstrumentType/movementType drift between the Angular model and the microservice
New `src/app/transaction-builder/instrument-type-contract.spec.ts` — reads both
`balance-component.model.ts` (Angular) and the microservice's `types.ts`/`domain/balanceDerivation.ts`
as **plain text** (`fs.readFileSync`, never `import`/compile) specifically so it can never cross the two
projects' separate tsconfigs/Jest configs (see this file's own "never let the two Jest configs cross"
caveat above). Regex-extracts (1) `InstrumentType`'s own quoted union literals from both sides and
asserts set equality, (2) the flattened set of movementType values in Angular's
`MOVEMENT_TYPES_BY_INSTRUMENT` against the bare keys of the microservice's `MOVEMENT_DIRECTION` (the
microservice has no per-instrument table of its own — `MOVEMENT_DIRECTION`'s keys are the true "server
knows a legal movementType" set). Both currently match exactly (10 instrument types, 14 movementTypes).
**Verified the test isn't a tautology**: manually injected a fake `'FAKE_DRIFTED_TYPE'` into the
microservice's `types.ts`, confirmed the test fails with a clear diff, then restored the file (confirmed
clean via `git diff` — zero net change). 2 new tests, both green; full suite 467/467 (465 + 2), same
coverage floor cleared; `tsc --noEmit`/`npm run lint`/`format:check` all clean.

### BAL-003 — Checker Actions extracted into `CheckerActionsService` via genuine Dependency Inversion
This directly reverses the "not worth it" decision recorded in the 2nd same-day pass's `finishCheckerAction`
doc comment — re-examined at the user's explicit direction and found the reasoning still held for a
*naive* move (the compound release()/reject()/deleteMakerPending() chain — 10 methods, ~230 lines —
reads/writes `submitResult`/`submitError`/`actionBusy` plus 5 movementId fields, and calls back into 5
other component methods), so this was NOT done as a plain cut-and-paste. Instead:
- New `checker-actions.service.ts` — `CheckerActionsService` (`@Injectable({ providedIn: 'root' })`)
  depends only on a new `CheckerActionContext` interface (Interface Segregation — exactly the 9 read-only
  fields these 3 flows need) and its own injected `BalanceComponentApiService`, never on
  `TransactionBuilderComponent`. It owns exactly the API-orchestration decisions (which release/reject/
  cancel call, in what order, under what business condition) and resolves every flow to one
  `CheckerActionOutcome` (`'released' | 'documentArrivalAcknowledged' | 'failed'`) — it never mutates
  component state itself (Single Responsibility: decide *what happened*, not *what the UI does about
  it*). Every guard condition, branch order, and error-message string is unchanged from the 10 methods it
  replaces — pure code motion re-expressed as RxJS `switchMap`/`catchError` chains instead of nested
  `.subscribe()` callbacks.
- New `api-error.ts` — the existing `describeApiError` HTTP-error formatter (`err?.error?.message ??
  String(err)`, BAL-005) pulled out to a standalone pure function so the new service can use the exact
  same formatting without depending on the component; the component's own `describeApiError` method now
  delegates to it (all ~30 existing call sites unchanged).
- `TransactionBuilderComponent.release()`/`reject()`/`deleteMakerPending()` are now thin wrappers (same
  guard + same `actionBusy`/`submitError` reset as before — including the subtle asymmetry that `reject()`
  alone never resets `submitError`, preserved exactly) that build a `CheckerActionContext` and subscribe,
  routing the outcome through a new `applyCheckerActionOutcome()` — the one place outcomes turn into
  `actionBusy`/`submitResult`/`submitError`/`arrivalApproved` writes and the `refreshSelectedContractSnapshot()`/
  `syncCheckerToContext()`/`syncLookupToContext()`/`reloadPayableMovementsAfterCompound()`/
  `loadSgsForArrival()` callbacks — mirroring `finishCheckerAction`/`failCheckerAction`/the old
  `releaseArrivalDocument()` exactly. The 6 private leg methods (`releaseMatchedReceivable`,
  `releaseDueFromIssuingBank`, `releaseAcceptance`, `releaseAcceptanceLiability`,
  `releaseAcceptanceReimbReceivable`, `releaseArrivalDocument`) are gone from the component entirely.
- **Constructor-injection risk avoided**: `CheckerActionsService` is added as a constructor parameter
  with a **default value** — `checkerActions: CheckerActionsService = new CheckerActionsService(api)` —
  specifically because 70+ existing test call sites across all 4 spec files construct the component via
  `new TransactionBuilderComponent(mockApi)` with exactly one argument. Angular's own DI container always
  resolves every constructor parameter when it builds this component for real (default values are never
  consulted by Angular's DI), so production gets the real injected singleton; every test call site needed
  zero changes.

**Verification:** full Angular suite 467/467 (467 unchanged — 0 new tests needed since every branch is
already covered by the existing `release()`/`reject()`/`deleteMakerPending()` describe blocks in
`transaction-builder.component.actions.spec.ts`, ~280+185+... lines/tests, all passing completely
unmodified against the new service-backed implementation); coverage still clears the 95% floor on all
four metrics (branches dipped slightly, 95.65% → 95.53%, from two pre-existing `pendingItemLabel ??
'Document Arrival'` fallback branches that were already only partially exercised before the extraction —
moved verbatim, not a new gap); `tsc --noEmit`, `npm run lint` (0 errors), `format:check` all clean.
**Live in-browser verification**, given the stakes (this is the actual money-moving Maker/Checker release
chain): drove the real running component instance through all 3 entry points against the live
microservice — a fresh A1 submit → `release()` (PENDING → RELEASED, plain path), a second fresh submit →
`deleteMakerPending()` (PENDING → CANCELLED, default `cancelPrimary()` path), a third fresh submit →
`reject()` (PENDING → REJECTED) — all three correct, `submitError` null, `actionBusy` false after each,
zero console errors. The 4 compound branches (A3S/A6/B4/B5) were not separately live-driven this pass
(same scope-limitation disclosure as the `submit()` split pass) — they're structurally unchanged code
motion from methods already live-verified in an earlier pass, and are fully covered by the unchanged unit
suite.

**Full three-suite re-verification after this pass:** Angular app 467/467
(99.68%/95.53%/99.41%/99.73% coverage — new `checker-actions.service.ts` at 100%/94.11%/100%/100%,
`api-error.ts` at 100%/100%/100%/100%), `backend/` 28/28 (unaffected, unchanged), microservice 234/234
(unaffected, unchanged).

## Currency Code now carries from A1/B1 and is protected on every other function (2026-08-16, user-requested — "A1 Currency Code = Input; A2-A9 = Carry from A1 + Protected" / "B1 = Input; B2-B5 = Carry from B1 + Protected")

Previously `currency` was a plain free-typed Formly input on every single function, A1-A9 and B1-B5 alike —
nothing stopped a Maker from typing a different Currency than the LC/Confirmation actually declared at
Issue/Confirm when amending, drawing, or settling against it. Same "carry from whichever existing record is
resolved, protected" shape as the pre-existing Amount/Tenor Type/Tenor Days precedent
(`rebuildFields()`'s `amountLocked`/`tenorLocked`), extended to Currency and made unconditional across
every function rather than gated to specific ones — A1/B1 structurally never populate
`selectedParent`/`selectedContract` at all (they create a brand-new record with no existing target to
pick), so no function-code allowlist was needed.

**What was added:**
- `TransactionBuilderComponent.carriedCurrency` — a new getter: `this.selectedParent?.currency ??
  this.selectedContract?.currency ?? null`. `selectedParent` is checked first because, for a `hasParent`
  function (A6/A7/A8/A9/B3/B5), it resolves at Step 1 (the Parent LC picker) before any Step-2 child
  picker/search does — so the field locks in as soon as the LC/Confirmation itself is picked, not only
  once a specific child record is found. For every non-`hasParent` function (A2/A3/A3S/A4/B2/B4),
  `selectedParent` stays null and it falls through to `selectedContract` (the flat Catalog picker's own
  resolved record).
- `rebuildFields()`'s `currency` field now reads `currencyLocked = !!this.carriedCurrency`, disabling the
  input and relabeling it `"Currency (carried from the existing record, protected)"` whenever true —
  mirrors the exact same `amountLocked`/`tenorLocked` shape already used for Amount/Tenor.
- The actual `model.currency = this.carriedCurrency` write (Formly's `disabled` alone doesn't populate a
  value) was added at every place a contract/parent gets resolved: `onSelectContract()`,
  `onSelectParent()`, both success branches of `searchExistingContract()` (the free-text LC+IB/SG manual
  search fallback that A7/A9/B5 — and, in principle, any hasParent function — can use instead of clicking
  through the picker), `onSelectIbIndex()`, and `onSelectSettleableBalance()` (the latter two are
  Step-2 child pickers; the write there is a defensive re-assertion since Step 1 already carries it in
  the normal flow, kept for correctness regardless of how Step 2 is reached).
- No changes needed to `selectFunction()`'s own reset block — `model.currency` already resets to
  `'USD'` and `selectedContract`/`selectedParent` already reset to `null` there, which is sufficient for
  `carriedCurrency` to naturally re-evaluate to `null` (unlocked) the moment a function switch happens.

**Verification:** 8 new tests in `transaction-builder.component.selection.spec.ts` (new describe block
`carriedCurrency / Currency carry-and-protect`) — A1/B1 stay plain unlocked Input; A2 (flat-Catalog,
non-hasParent) and B2 (Export side) carry+lock on `onSelectContract()`; A6 and B5 (Parent-LC-picker,
hasParent) carry+lock on `onSelectParent()`; `selectedParent` takes precedence when both happen to be
set; switching back to A1 clears the lock. Full suite 475/475 (467 + 8 new, zero existing tests changed),
coverage still clears the 95% floor on all four metrics; `tsc --noEmit`/`npm run lint`/`format:check` all
clean. **Live in-browser verification**: created a real EUR LC via A1, then confirmed A1/A8's Currency
field is a plain unlocked Input *before* any pick; picked that LC under A2 (flat Catalog) — `model.currency`
became `'EUR'`, the field disabled, relabeled — and again under A8 (Parent LC picker) with the same
result. One genuine finding during this pass, not a product bug: driving the component via direct method
calls from an injected script (rather than real user clicks, which run inside Angular's own zone) left
the DOM one change-detection tick stale after each direct call — `comp.model.currency`/`comp.fields`
already showed the correct locked state, but the rendered `<input>` still showed the old value/disabled
attribute until a manual `ng.applyChanges(comp)` tick, after which the DOM correctly showed
`Currency (carried from the existing record, protected) *` = `EUR`, disabled. A real user click already
runs inside Angular's zone and triggers change detection automatically, so this artifact is specific to
this verification method, not a defect in the shipped behavior.

## Test coverage (confirms the above; see for worked examples)

`microservices/balance-component/test/unit/` covers Import Case 1–5, a separate "Export Confirmation
asset-side instruments" HTTP-integration suite (citing the Gap Analysis doc directly), plus dedicated
suites for: the v0.12 unmatched-vs-matched Document Arrival hardening, SG-Issue-capped-at-parent-LC
(v0.10→v0.11), the SG concurrent-PENDING-redemption bug fix, the event timeline, Tenor Type Routing,
the re-ISSUE guard, the duplicate secondary-reference guard, Maker EC/Delete-Pending, and unit-level
coverage of every domain function/error/money module named above.
