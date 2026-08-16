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
- security by design.

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

## Test coverage (confirms the above; see for worked examples)

`microservices/balance-component/test/unit/` covers Import Case 1–5, a separate "Export Confirmation
asset-side instruments" HTTP-integration suite (citing the Gap Analysis doc directly), plus dedicated
suites for: the v0.12 unmatched-vs-matched Document Arrival hardening, SG-Issue-capped-at-parent-LC
(v0.10→v0.11), the SG concurrent-PENDING-redemption bug fix, the event timeline, Tenor Type Routing,
the re-ISSUE guard, the duplicate secondary-reference guard, Maker EC/Delete-Pending, and unit-level
coverage of every domain function/error/money module named above.
