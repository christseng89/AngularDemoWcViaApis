You are a professional **Trade Finance and Payment Solutions expert**, holding a **CITF (Certificate in International Trade and Finance)** qualification, with strong expertise in both **banking business processes and modern financial technology architecture**.

In addition to deep knowledge of **Trade Finance, Payments, Accounting, Settlement, Clearing, and FX processing**, you possess extensive technical expertise and relevant certifications or hands-on experience in areas including **HTML, Stylesheets (CSS), Web Components, Angular, Formly, JavaScript, TypeScript, Node.js, Microservices Architecture, REST APIs, OpenAPI/Swagger, Kubernetes, CKA, CKS, Oracle Database DBA Certification, Microsoft Azure Database Administrator Associate (DP-300), and PostgreSQL / EDB PostgreSQL Certification**.

You are capable of evaluating requirements from both **banking business and technical architecture perspectives**, translating complex Trade Finance and Payment requirements into robust, scalable, auditable, and implementation-ready solutions aligned with banking industry best practices.

# AI Role

Always act as a senior Trade Finance and Payment Solution Architect.

You are a professional Trade Finance and Payment expert with strong knowledge of:

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
3. Payment and settlement perspective
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

Always challenge requirements when they conflict with banking, accounting, payment, or architectural best practices.

---

# Confirmed Architecture Decisions (reviewer-confirmed — do not re-ask)

## Standing rule: keep tests + docs in sync with every code change, and all unit tests must pass before a change is done (user-confirmed 2026-08-16)

**Any code change under `lc-payment-wc/` (Angular app, `backend/`, or `microservices/payment-component/`)
must be accompanied by updates to whatever this repo's own conventions say tracks that code** — the
relevant Jest spec file(s) (new/changed behavior needs new/changed test cases, not just "still passes"),
and any Markdown/documentation/specification/other supporting artifact that describes it: this file's own
decision log below (dates/versions/business quotes, same format as existing entries — don't leave a
change undocumented here), the microservice's own `README.md` (the source of truth this file repeatedly
points to for server-side detail — e.g. the Balance/Charge Component bridge and Extended usage scenarios
sections), `docs/` (the bilingual EN/zh-TW user manuals — see the §6.6 staleness fix above for what
happens when these drift), the root `CLAUDE.md`'s `lc-payment-wc/` section if a described command/port/
file-layout fact changes, and `analysis/` only if it's the actual source-of-truth spec being revised (the
OAS YAML/FSD/calculation-validation `.docx` — rare, and per this file's own note the OAS `info.version`
already lags the implementation, so don't let a code change widen that gap further without at least
flagging it). This is the same standing-verification posture as this file's own "always `ng build` after
touching `.html`" rule above — not a one-off reminder, apply it to every change.

**Before calling any change complete, run every test surface the change could plausibly touch, and
confirm each exits clean at its own enforced coverage floor where one exists** (statements/branches/
functions/lines — none may be lowered to make a change easier):

```bash
cd lc-payment-wc/microservices/payment-component && npm test          # 90% floor, gated
cd lc-payment-wc/microservices/payment-component && npm run test:regression  # FSD-verified vectors — separate from, not superseded by, npm test
cd lc-payment-wc/backend && npm test                                  # legacy Import/Export LC mock API — passing required, no coverage floor currently enforced
cd lc-payment-wc && npm test                                          # 90% floor, gated (Angular app / Payment Component Simulator)
```

Also run `npx tsc -p tsconfig.app.json --noEmit` and, whenever the change touched an `.html` template,
`npx ng build --configuration development` — per this file's own existing rule, `tsc --noEmit` alone
cannot catch a template-scoping break. A change confined to one surface (e.g. a microservice-only fix)
still only strictly requires that surface's own suite, but running the others costs little and catches a
cross-cutting break (e.g. a microservice response-shape change the Angular API service silently assumed)
that a single suite would miss — default to running all of them unless there's a specific reason not to.
Never mix the two Jest configs (`lc-payment-wc`'s own vs. the microservice's) while doing this — see this
file's existing "Never let the two Jest configs cross" rule.

## Charge Component ↔ Payment Component boundary (margin / commission / charges, incl. LC Issue)

A separate **Charge Component** (a different service, not part of this repo's Payment Component
microservice) owns all margin/commission/charge calculation and posts its own entries on its own books:

```text
Charge Component (own books)
Dr  Suspense - Credit
    Cr  Margin
    Cr  Commission
    Cr  Charge 1
    Cr  Charge 2
```

The **Payment Component** (`microservices/payment-component/`) never calculates or posts individual
charge lines. It only collects the total from the customer and credits the same clearing account:

```text
Payment Component (this service)
Dr  Customer A/C
    Cr  Suspense - Credit
```

Combined effect across both components (e.g. for an LC Issue transaction):

```text
Dr  Customer A/C
    Cr  Margin
    Cr  Commission
    Cr  Charge 1
    Cr  Charge 2
```

`Suspense - Credit` is the clearing/bridge account between the two components — it must net to zero
once both sides have posted.

**This is already fully implemented, not a gap.** The caller submits `debitLegs: [{accountNo: 'Customer A/C', currency, amountTxCcy: totalCharge}]`, `creditLegs: []` (no real credit leg needed),
and `suspenseBridge.creditEntries: [{amount: totalCharge, currency, sourceComponent: 'CHARGE'}]`.
`expandSuspenseBridge`/`buildSuspenseBridgeLeg`
(`microservices/payment-component/src/domain/suspenseBridge.ts`) generates the offsetting
`Cr Suspense - Credit` leg(s) from `creditEntries` (always credit-direction, per that file's doc
comment), and V8 balances against the caller's own `Dr Customer A/C` leg with no further input.

**Standing design principle (reviewer-confirmed): the Payment Component must never duplicate charge
calculation or charge posting logic.** It is funding/settlement only; charge allocation and posting
belongs entirely to the Charge Component. The two are linked only through the `Suspense - Credit`
clearing account. This is already architecturally enforced, not just a convention to remember: the
§6.2 Charge Voucher / §6.3 Liability Voucher generation streams were removed from this service
entirely in v1.6.0 for exactly this reason (see `confirmPaymentInstruction.ts`'s top doc comment) —
`SuspenseEntry.sourceComponent` (`types.ts`) is pure provenance/audit metadata and never triggers any
Charge/Liability Account Entry generation here. Do not reintroduce per-charge-line posting logic into
this service.

**What is NOT wired up:** `lc-issue-angular/` (the separate LC Issue charge-calculation demo) still has
no integration with this Payment Component microservice — it only computes the charge amount via
`backend/server.js`, never posts any GL/Suspense entries.

**Verification gap that let a real template compile error ship (2026-08-09) — always `ng build`
after touching a `*ngIf` + template-reference-variable combination, `tsc --noEmit` is not enough.**
A template reference variable declared on an element with a structural directive (`*ngIf`, `*ngFor`,
etc.) is scoped to that directive's own embedded view; it is NOT visible to sibling elements outside
it, even elsewhere in the same component's template — `npx tsc -p tsconfig.app.json --noEmit` only
checks `.ts` files and does not compile templates at all, so it structurally cannot catch this class
of bug. A long-running `ng serve` dev server can also keep silently serving its last successful build
(appearing merely "stale" rather than broken) until restarted, at which point a real template break
surfaces all at once. **Whenever a change touches an `.html` template in this project — not just
`.ts` — run `npx ng build --configuration development` (or restart `ng serve` and watch it compile)
before calling the change verified, in addition to `tsc --noEmit` and the Jest suite.** All three
check different things; none of the other two substitutes for the others.

**Single Transaction Currency and Amount as Input Fields (implemented):**
`business-case-runner.component.ts`'s `transactionCurrencyOverride`/`transactionAmountOverride` (null
until the user edits the new header-summary `<select>`/`<input>`) take priority over the
selected case's own registry legs in both `transactionCurrency`/`baseTotalAmount` and `sideDefaults()`
— one override pair drives both sides' Leg #1 seed identically, matching the existing invariant that
every registry case already keeps debit/credit defaults symmetric. Reset to null on every
`selectCase()`, same as `suspenseDebitEntries`/`suspenseCreditEntries`.

## Suspense-bridge FX pair netting for an ordinary (unflagged) debitEntries bucket — v1.9.0 (business-requirement-confirmed 2026-08-13, Import LC Pay/Accept scenario)

Reviewer-reported bug: an Import LC Pay/Accept business case with Transaction Amount 0, a real
Customer Debit split USD 100,000 + EUR 100,
and matching `suspenseBridge.debitEntries` (Suspense Debit) of USD 100,000 + EUR 100 produced a
Settlement Vouchers table with a spurious "FX Debit Leg Pair" and "FX Debit Suspense Pair" for EUR —
converting EUR 100 to USD 108.31 twice over, even though the customer's own EUR payment already
exactly funds the EUR Suspense Debit entry and no cross-currency funding is actually happening.
Reviewer's stated rule: **"Same Currency + Same Amount → Direct Settlement → No FX Pair."**

Root cause: `domain/suspenseBridge.ts`'s `expandSuspenseBridge` (v1.8.0) unconditionally generated
TWO independent, gross-sized FX pairs per foreign-currency bucket whenever a same-currency real leg
coexisted with a Suspense entry — a "Suspense pair" (sized to the full Suspense amount) AND a
separate "Leg pair" (sized to the full real-leg amount) — never netting them against each other, even
when they were, in effect, the same money.

**Fix, scoped to a `debitEntries` bucket only (`side === 'DEBIT'`), NOT mirrored onto
`creditEntries`:** `expandSuspenseBridge` now nets the bucket's own gross Suspense amount against the
caller's matching-currency `debitLegs` (plain Decimal subtraction of two already-rounded,
already-on-the-wire figures, never a fresh rate re-conversion) and emits AT MOST ONE pair for the residual:
zero pair on an exact match, a Suspense-anchored pair when Suspense exceeds `debitLegs`, a
Leg-anchored pair when `debitLegs` exceed Suspense. This is proven (not just tested) to preserve
per-native-currency balance for any split, specifically because a `debitEntries` Suspense leg always
lands CREDIT (the module's default placement) while its matching `debitLegs` are DEBIT-direction —
opposite actual placement, i.e. genuinely "the same money" funding the bridge.

**Deliberately NOT applied to a `creditEntries` bucket.** There, the matching `creditLegs` are the
SAME actual direction the Suspense leg itself already lands on (both CREDIT) — e.g. a real Nostro
settlement leg is an independent exposure that merely happens to share a currency with a
Charge/Balance Component's Suspense-Credit bridge amount, not "the same money." Netting that
combination would silently break per-currency balance (proven algebraically, not just asserted) while
staying aggregate-V8-safe — exactly the kind of decorative-looking-but-load-bearing distinction this
file's `suspenseBridge.ts` v1.7.x history warns about. The existing "reviewer-confirmed EUR100+EUR100"
CREDIT-side worked example (two independent, unnetted pairs) is therefore **unchanged** and still
correct — do not re-litigate it into netting without new reviewer input specific to that side.

This generalization only changed what used to be v1.8.0's unconditional two-pair fallback for an
ordinary `debitEntries` bucket. See `suspenseBridge.ts`'s top doc comment and its
`expandSuspenseBridge` inline comment for
the full algebraic justification, and `test/unit/domain/suspenseBridge.test.ts`'s "v1.9.0 DEBIT side"
describe block / `confirmPaymentInstruction.test.ts`'s `REF-SB-NET-1`/`REF-SB-NET-2` tests for worked
examples (partial match nets to a residual pair; exact match nets to zero, clean Settlement Vouchers).

## Leg-allocator: switching A/C Type resets Account No. to that type's own default (business-requirement-confirmed 2026-08-13)

`leg-allocator.component.ts`'s `onAccountTypeChange` (fires from the Account Type `<select>` on any
Debit/Credit leg row) now also resets `row.accountNo` to a fixed per-type placeholder
(`DEFAULT_ACCOUNT_NO_BY_TYPE`: CUSTOMER→`CUST-ACC`, NOSTRO→`NOSTRO-ACC`, VOSTRO→`VOSTRO-ACC`,
SUSPENSE→`SUSPENSE-ACC`, INTERNAL→`INTERNAL-ACC` — matching `business-case-registry.ts`'s own leg()
default-naming convention) — unconditionally, even overwriting a manually-typed Account No., since a
prior type's leftover account number (e.g. still `CUST-ACC` after switching CUSTOMER → NOSTRO) reads
as if the leg genuinely posts to a customer account. Purely a same-page UI convenience to avoid that
confusion; the field stays freely editable afterward, same as any other row. Applies uniformly to
both `<app-leg-allocator side="DEBIT">` and `side="CREDIT">` (one shared component instance-per-side,
one shared map). Does NOT touch the separate RTGS checkbox (`row.rtgsIndicator`, bound directly via
`ngModel`/`onFieldChange`) — that's a distinct toggle from the A/C Type switch this covers.

## Leg-allocator: Account Ccy Equivalent must round to the ROW's own currency scale, not a hardcoded 2dp (reviewer-reported, fixed)

**Bug:** `leg-allocator.component.ts`'s module-level `money()` helper hardcoded `.toDecimalPlaces(2, ...)`
unconditionally — for a foreign-currency row (needing conversion via `accountCcyAmount`/Account Ccy
Equivalent) this ignored the row's OWN currency's actual minor units. Reported symptom: a JPY-side amount
showing fractional yen (e.g. `3,713,348.63` instead of a whole number) — JPY has 0 decimal places, so any
non-zero fractional part is wrong. The same hardcoded-2dp bug also affected `amountTxCcy` (always
transaction-currency-denominated) and, critically, the WIRE payload itself: `emit()`'s
`leg.amountAccountCcy = money(...).toFixed(2)` and `leg.amountTxCcy = r.amountTxCcy.toFixed(2)` — a
JPY-denominated leg would ship a `"...00"`-suffixed string on the wire that the microservice's own H-2
currency-scale validation (`knownMinorUnitsForCurrency`) would then reject as over-precise, even though
the underlying value was already a whole number.

**Fix:** `money(value, scale)` now takes an explicit `scale` parameter (mirrors the microservice's own
`money.ts`'s `formatMonetaryAmount(value, scale)` convention exactly — never an implicit/hardcoded 2dp).
A new `scaleFor(currency)` method reads `CurrencyService.decimals()` (the same "Get Currency API" map
already used for H-2 over-precision checks), falling back to 2 for a currency absent from the map (same
fallback `business-case-runner.component.ts`'s own `decimalsFor()` already uses). Every `money()` call
site now passes the CORRECT currency's scale: `this.scaleFor(this.transactionCurrency)` for anything
denominated in `amountTxCcy` (rows' seeded amounts, `onTotalChange`/`onPctInput`/`onAmountInput`/
`ensureRemainderRow`, and `onAccountAmountInput`'s reverse-derived `amountTxCcy`), `this.scaleFor(row.currency)`
for `accountCcyAmount`/the wire's `amountAccountCcy`. `emit()`'s `.toFixed(2)` calls were replaced the
same way — `amountTxCcy`/`amountAccountCcy` strings on the wire now match each field's own currency
scale exactly, closing the same gap for the actual POST body, not just the on-screen display.

## `transactionCurrency` — explicit wire field, independent of any leg's own currency, and of the leg-allocator's own displayed "Transaction Currency" (v1.10.0, business-requirement-confirmed 2026-08-11)

**Follow-on bug to the section above** — fixing the ROW-level scale bug wasn't sufficient for a
**Full pay in JPY** scenario: Transaction Currency USD, Amount 10000, and the customer pays 100% in
JPY (the sole Debit leg's own "Leg Currency" switched to JPY, Transaction Currency USD unchanged).
Reported symptom: `[400] REQUEST_VALIDATION_FAILED: debitLegs.0.amountTxCcy: amount "10000.00" has 2 decimal place(s) but currency JPY allows at most 0` — on BOTH debitLegs.0 AND creditLegs.0.

**Root cause, traced to the server, not the client:** the microservice's hard, pre-v1.10.0 rule
defined "the transaction currency" as `debitLegs[0].currency` — a leg's OWN settlement currency
field, reused as a proxy for the deal's transaction currency. That proxy silently breaks the moment
a side's legs are ALL in a currency other than the true transaction currency: there's no leg left in
USD to occupy `debitLegs[0]`, so the server read JPY as the transaction currency and validated a
genuinely-correct `"10000.00"` (USD, 2dp) against JPY's 0dp rule. **Partial** pay in JPY (the debit
side split into a USD leg + a JPY leg) never hit this — the leg-allocator's own `emit()` already
sorts a transaction-currency-matching leg to `debitLegs[0]` whenever one exists (unchanged by this
fix) — only the fully-foreign-currency case had no such leg to sort forward.

**Business requirement, confirmed directly by the reviewer, that shaped the fix:** switching a
Debit leg's own "Leg Currency" must **never** change the displayed/wire "Transaction Currency" —
they are independent concepts (a leg's own settlement currency vs. the deal's transaction currency).
An earlier attempt at this fix reactively propagated the live first-debit-leg's currency into both
`<app-leg-allocator>`'s own `[initialCurrency]` input (so their displayed "Transaction Currency" box
would track `debitLegs[0].currency`) — this DID stop the 400, but visibly flipped both sides'
Transaction Currency to JPY, which the reviewer explicitly rejected: "When change debit.leg\[0\]
Currency then Transaction Currency 應該不變" (must not change).

**Actual fix — `PaymentInstructionConfirmRequest.transactionCurrency` (v1.10.0, new optional wire
field, server + client):**

- Server (`microservices/payment-component/`): `types.ts` adds the field; `requestSchema.ts`'s H-2
  check and `confirmPaymentInstruction.ts`'s `transactionCurrency` derivation both switched from
  `debitLegs[0]!.currency` to `request.transactionCurrency ?? request.debitLegs[0]!.currency` —
  falls back to the old inference only for callers that omit the new field.
- Client: `business-case-request.ts`'s `buildConfirmRequest` takes a `transactionCurrency` param,
  always populated from `business-case-runner.component.ts`'s own `transactionCurrency` getter and
  sent explicitly on every Confirm/preview POST.
- **The `[initialCurrency]="transactionCurrency"` propagation from the earlier attempt was
  reverted** — `business-case-runner.component.html`'s two `<app-leg-allocator>` elements are back
  to `[initialCurrency]="debitDefaults.currency"`/`"creditDefaults.currency"` (static registry
  defaults, unaffected by a live leg edit) — the leg-allocator's own displayed "Transaction
  Currency" box and default new-row currency now correctly stay put when a row's own Leg Currency
  changes.
- `business-case-runner.component.ts`'s `transactionCurrency` getter no longer falls back to
  `this.debitLegs[0]?.currency` at all (the reactive coupling that caused the earlier attempt's
  regression) — it's purely `transactionCurrencyOverride ?? registry default ?? 'USD'`, fully
  decoupled from any leg's own currency, matching what's sent on the wire.

See the microservice README's "`transactionCurrency` — explicit, independent of any leg's own
currency (v1.10.0)" section for the server-side detail, and
`business-case-runner.component.spec.ts`'s "transactionCurrency (v1.10.0)" tests for the worked
Full-pay-in-JPY regression (verified live end-to-end in-browser: Transaction Currency stays USD in
both Debit/Credit Legs boxes, Debit leg posts JPY 1,490,826 via a proper FX Conversion Pair against
the USD transaction currency, Confirm succeeds with no error).

## `creditLegs` may be empty when `suspenseBridge` contributes its own credit-side leg (v1.10.1, business-requirement-confirmed 2026-08-11)

**Bug, surfaced while validating the fee-collection pattern documented above ("Charge Component ↔
Payment Component boundary"):** that pattern's own worked example (`creditLegs: []`, offsetting `Cr Suspense - Credit` generated entirely from `suspenseBridge.creditEntries`) no longer validated —
`requestSchema.ts` required `creditLegs.min(1)` **unconditionally**, so the documented "already fully
implemented" example actually 400'd. Fixed: `creditLegs` may now be empty specifically when
`suspenseBridge` (`debitEntries` OR `creditEntries`, either non-empty) will contribute its own
credit-side leg — both always generate a credit-direction leg regardless of which list they came
from (see the bridge section above), so a non-empty `suspenseBridge` genuinely guarantees at least
one credit-side leg even with zero caller-submitted ones. `debitLegs` keeps its unconditional
`min(1)` — the bridge never generates a debit-direction leg, so a real debit leg is always required.
See the microservice README's "`transactionCurrency`" section (the `creditLegs` field description)
and its new "Extended usage scenarios" subsection for worked request shapes.

## Extended usage scenarios — LC fee collection, IBL/EBL Takedown, IBL/EBL Repayment (documented 2026-08-11, NOT yet in the business-case registry)

Corrected wire-level request shapes for three trade-finance scenarios the reviewer proposed, full
detail in the microservice README's "Extended usage scenarios" subsection (right after the
Balance/Charge Component bridge section): **A. Fee collection** (LC Issue/Amendment — the
`creditLegs: []` fee-collection pattern above, worked example with the buyer-CA/seller-Nostro
alternative), **B. IBL/EBL Takedown** (disbursement — `Dr Legs (Suspense)` must be a REAL
`accountType: 'SUSPENSE'` leg, never `suspenseBridge`-generated, since bridge legs are always
credit-direction), **C. IBL/EBL Repayment** (mirrors Takedown; the Balance Component's own
`Dr Suspense / Cr IBL` booking is inferred by symmetry only, not independently confirmed elsewhere).
For B/C, an optional Trx Charges bridge entry requires adjusting the matching real leg's OWN amount
by the fee (README's "Common mistake to avoid" note) — getting this wrong is a 409
`LEGS_UNBALANCED`, not a 400. **None of the three are implemented as registry business cases yet** —
no citation, no default account numbers, no regression test — this is usage guidance only.

## `exchangeRate1` echoed back on Settlement Voucher entries; Debit/Credit FX Conversion Pair Rate shown in its own column, not appended to Site (v1.11.0, business-requirement-confirmed 2026-08-11)

Reviewer's stated requirement, refining an earlier attempt: for a Debit/Credit FX Conversion Pair
row with Site = "Other Ccy", the Exchange Rate must be **its own column**, and — critically — for
the **Settlement Vouchers** table specifically, that rate must be **part of the actual OAS Return**,
not a client-side-only value. ("Settlement Vouchers 是 Return response 的一部分" — confirmed
directly.) An earlier attempt appended `"(Rate: 1.083123)"` into the Site/Description text itself;
superseded by this section, since it neither used a separate column nor sourced the Settlement
Vouchers figure from the server.

**Root finding: `AccountEntry.exchangeRate1`/`exchangeRate2` already exist in both OAS sources**
(official `Payment_component.yaml` and the extracted `payment-instructions-post.yaml`) but neither
document what they mean, and the microservice never populated either field on any response entry —
even though the request side already accepts a rate per leg (`PaymentLegInput.drRate`/`drBuyRate`/
`crBuyRate`/`sellRate`, already sent by `leg-allocator.component.ts`'s `emit()`). A rate went in on
the request and silently never came back out.

**Fix — two independent, clearly-separated data sources, not one collapsed into the other:**

- **Server (real OAS data):** `microservices/payment-component/src/domain/accountEntries.ts`'s
  `buildSettlementEntries` now sets `exchangeRate1` from whichever of the leg's own rate fields
  matches its side (`drRate ?? drBuyRate` for DEBIT, `crBuyRate ?? sellRate` for CREDIT) — one code
  path covers both a caller's own foreign-currency legs AND the suspenseBridge-generated FX Exchange
  pair legs. `exchangeRate2` is deliberately left unset — neither OAS source documents a second
  rate's meaning, and a leg only ever carries one rate value on the wire. See the microservice
  README's own `exchangeRate1` section for full detail.
- **Client, Settlement Vouchers table (`response-viewer.component.html`):** both Posting View and
  Currency View gained a real "Exchange Rate" column reading `AccountEntry.exchangeRate1` straight
  from the response — genuine OAS-Return data, not computed in the browser.
- **Client, Debit/Credit FX Conversion Pair overlay (`leg-allocator.component.ts`'s `fxPairs`
  getter):** this table is explicitly a client-only preview and stays that way — it is NOT sent to
  or returned by the microservice (see its own doc comment). It also gained its own separate "Rate"
  column (`FxPairEntry.rate`, only set on the "Other Ccy" pair), but the value is still the
  leg-allocator row's own client-side `rate` — never conflated with, or presented as, the server's
  `exchangeRate1`. Keeping these as two distinct columns in two distinct tables (rather than one
  merged "Rate" concept) is deliberate: one is authoritative server data, the other is a same-page
  simulation preview, and the UI must not blur which is which.

See `microservices/payment-component/test/unit/domain/accountEntries.test.ts`'s "exchangeRate1
echo-back" describe block and `confirmPaymentInstruction.test.ts`'s `REF-SB-RATE-1` test for the
server-side worked examples (including the suspenseBridge-generated FX Exchange pair carrying the
caller's own `crossRate`), and `leg-allocator.component.spec.ts`'s `fxPairs`/`response-viewer .component.spec.ts`'s currencyGroups tests for the client-side column wiring.

**Follow-up layout refinement, same session (reviewer-confirmed 2026-08-11) — final column order
is Amount → Exchange Rate/Rate → Description/Site, not Amount → Description/Site → Exchange
Rate/Rate as first shipped.** Putting the new rate column immediately after Description/Site (its
markup-adjacent position) left it visually stranded — a wide Description/Site column with typically
short content ("Trx Ccy", short voucher codes) reads as a large empty gap before the rate value.
Reviewer's fix, applied to **all three** `response-viewer.component.html` tables (Settlement
Vouchers Posting View, Settlement Vouchers Currency View, both FX Conversion Pair tables): reorder
so Exchange Rate/Rate sits right after Amount (both short, numeric-ish values — tight against each
other), and Description/Site moves to the LAST column instead. This is a deliberate structural
choice, not cosmetic: Description/Site is the one column whose content length genuinely varies (a
short site label vs. a long real voucher-description code), so it's the right column to absorb the
table's leftover width — trailing slack after the rightmost column reads as normal margin, since
there's nothing after it to look "far" from, whereas the same slack sandwiched between two columns
someone is visually comparing reads as a gap. `response-viewer.component.scss`'s `.settlement-table`
column-width comments explain the full reasoning; every `.col-*` percentage was re-tuned to closely
fit typical content (GL Account/Currency included, per the same "distance between Currency and GL
Account" reviewer note) rather than an even/generous split.

**Same pass — Amount column now always shows the row's own currency's minor-unit decimal places
(reviewer: "金額應該使用幣別的 Decimal space,例如美金100.00"), never a bare wire-precision
passthrough.** Root cause: `money.ts`'s `formatMonetaryAmount(value, scale)` leaves a Decimal's
existing precision alone when `scale` is omitted, and `accountEntries.ts`'s `makeEntry` calls it with
no scale — so a whole-number USD amount round-tripped as `"10000"`, not `"10000.00"`, and
`FxPairEntry.amount` (a plain client-side JS `number`) drops trailing zeros on template interpolation
the same way. Fixed display-only, client-side, via a new `ResponseViewerComponent.formatAmount(amount, currency)` (`response-viewer.component.ts`) that rounds/pads to `currencyDecimals[currency] ?? 2`
(the same map `currencyGroups`'s own Balanced/Unbalanced precision already uses) — applied at every
Amount cell across all three tables. Deliberately does NOT touch the wire contract or
`AccountEntry.amount`/`FxPairEntry.amount` themselves — this is presentation only, same posture as
`fxPairSiteLabel`'s predecessor. See `response-viewer.component.spec.ts`'s `formatAmount` describe
block (whole-number padding, already-scaled passthrough, 0dp currency, unknown-currency fallback).

## Leg-allocator: Amount (Tx Ccy) "waterfall" rebalancing — decrease flows forward, increase draws backward (v1.12.0, business-requirement-confirmed 2026-08-11, both Debit and Credit Legs)

Reviewer's stated rule, given as both a detailed spec and its own one-line summary: **"下調時，
差額往後流；上調時，差額往前逐筆回補"** (on a decrease, the difference flows forward; on an
increase, the difference is backfilled leg-by-leg from earlier legs). Decreasing leg N's Amount (Tx
Ccy) pushes the freed difference into leg N+1 (the very next leg); increasing leg N's amount draws
the needed difference from leg N−1 first, then N−2, N−3, … as far back as needed. Applies
identically to both `<app-leg-allocator side="DEBIT">` and `side="CREDIT">` (same shared component,
independent per-side state, never cross-side).

**Validity check before implementing:** the rule is sound and total-preserving BY CONSTRUCTION —
money only ever moves between rows already in the array, so Σ Amount (Tx Ccy) and Total Allocated
never need separate re-verification. Three boundary cases the literal rule left unstated were
explicitly put to the reviewer; two were confirmed as first proposed, the third (rule 1) was
revised the same day per reviewer follow-up:

1. Decreasing the LAST leg (no N+1 to receive the difference) — **first attempt** rejected the
   edit outright (the recommended/safe option offered at the time). **Superseded same day**: the
   reviewer's follow-up ("最後一筆 - A. 調小金額增加新的一筆 B. 調大金額 往上一筆減少") asks for a
   NEW leg to be auto-created at the end of the array instead, sized to exactly the freed
   difference (empty Account No, transaction currency, same convention as a fresh remainder row —
   the user fills it in afterward). The edited row becomes leg N, the new row becomes leg N+1, so
   a further decrease on the still-last leg keeps working the same way, chaining another new leg
   each time. This is the ONLY branch of `applyAmountWaterfall` that grows `this.rows` — every
   other branch only moves money between rows that already exist. (Part B of the same follow-up —
   "調大金額 往上一筆減少" for the last leg — needed no change: increasing any non-first row,
   including the last one, already drew from N−1 backward.)
2. Increasing the FIRST leg (no N−1 to draw from) → **rejected**, the row snaps back to its
   current amount — confirmed as originally proposed, unchanged. Deliberately NOT symmetric with
   rule 1: the reviewer's spec only ever described drawing backward from EXISTING legs for an
   increase, never inventing one, and inserting a new leg BEFORE the first would also disturb
   every other leg's array position, unlike appending.
3. An increase needing more than every earlier leg combined can supply (even fully drained to 0) →
   **silently capped** to whatever was actually available, not rejected outright or allowed to
   overshoot — confirmed as originally proposed, unchanged.

**Scope refinement, NOT explicitly asked but necessary to avoid a regression:** the waterfall only
applies when the edited row is NOT the current remainder (`!row.isRemainder`) AND the side already
has more than one row. Editing the floating remainder row keeps the PRE-EXISTING, unrelated
behavior unchanged (fix it at the typed value, reflow the true leftover into a freshly-spawned
remainder — the well-established "split off another leg by typing into the auto-filled one"
workflow). Without this carve-out, that very common flow — which is very often a DECREASE on
whatever the grid currently shows as the trailing remainder — would hit boundary rule 1 above and
silently stop working. The new rule is specifically about fine-tuning legs that are ALREADY
explicit, not about the in-progress act of carving up a still-floating remainder. `onPctInput` (%
editing) is completely untouched either way — the reviewer's rule was Amount-only.

**Implementation:** `leg-allocator.component.ts`'s new `applyAmountWaterfall` (private), called from
both `onAmountInput` and `onAccountAmountInput` (the latter is just an alternate input surface for
the identical underlying `amountTxCcy` field — Account Ccy Equiv. edits on a foreign-currency row
waterfall the same way). Every row the cascade actually touches becomes
`driver:'amount'`/`isRemainder:false`, exactly as if the user had typed that row directly.

**Real UX bug found and fixed during browser verification, not just unit tests (still applies —
rule 2's rejection is the remaining case that leaves `row.amountTxCcy` unchanged):** when the
bound value doesn't structurally change, Angular's own change-detection dirty-check has no reason
to re-write the `<input>`'s raw DOM value, so the field visually kept showing whatever the user had
just typed, even though the edit never took effect. Reproduced with literal keystroke-by-keystroke
typing (not just a scripted single value-set), confirmed via `document.querySelector(...).value`
reading the live DOM, not just a screenshot. Fixed in `leg-allocator.component.html`: both the
Amount (Tx Ccy) and Account Ccy Equiv. inputs now force-resync their own raw DOM value
(`amtInput.value = toNum(row.amountTxCcy).toString()`) immediately after calling the handler — a
harmless no-op on a successful edit (the value already matches), but what actually snaps a rejected
edit back on screen. `npx ng build` was re-run after this template change per this file's own
"always `ng build` after touching `.html`" rule above.

See `leg-allocator.component.spec.ts`'s "amount waterfall (v1.12.0 …)" and "amountInputTitle" describe
blocks (17 tests: forward-flow, single- and multi-donor backward draw, the last-leg new-row-creation
case (including a chained second decrease opening yet another new row), the first-leg rejection, the
capped-increase case, the remainder bypass, `onAccountAmountInput` parity for both the ordinary
cascade AND the last-leg new-row case, zero-delta no-op, and every tooltip variant) — including a
rewrite of the pre-existing "TWO independently-fixed rows... remainder is Total - SUM..." regression
test, whose original construction (shrink an already-frozen LAST row to spawn a third) is no longer a
valid sequence now that a last-row decrease creates a genuinely NEW row rather than reusing an
existing one; the rewrite reaches the identical expected numbers via a valid sequence instead. Also
verified live end-to-end in-browser twice (Pay/Accept case, Debit Legs split into multiple rows): the
final new-leg-creation behavior (a decrease on the last, already-fixed leg visibly adds a new grid
row holding exactly the freed amount, with an empty Account No awaiting input), and a full Confirm
POST succeeding with the adjusted split.

**Follow-up usability fix, same session (reviewer: "金額修改輸入很難用" — the amount input is hard
to use):** both the Amount (Tx Ccy) and Account Ccy Equiv. inputs used to fire on
`(ngModelChange)`, i.e. on every keystroke — typing a multi-digit value like "5000" ran
`onAmountInput` four times with the INTERMEDIATE values 5, 50, 500, 5000, each one its own
decrease-then-increase-then-… cascade against neighboring rows. Slow, visually janky, and an
intermediate keystroke could hit a boundary case (e.g. transiently look like a last-leg decrease)
that the final typed value never would have. Switched both inputs to commit on `(blur)` /
`(keydown.enter)` instead (Enter just calls `.blur()` — same commit path) — exactly ONE
`onAmountInput`/`onAccountAmountInput` call for the value the user actually meant to type, while
still freely typing without any recalculation firing mid-edit. The existing forced DOM-resync
(`amtInput.value = toNum(row.amountTxCcy).toString()`) moved into the same `(blur)` handler,
immediately after the call — still needed for the same reason as before (a rejected edit leaves
the bound value unchanged, so Angular's own dirty-check won't otherwise rewrite the DOM). Verified
live in-browser: typing keystroke-by-keystroke into an Amount field no longer touches any other
row until blur, at which point exactly one correct cascade (or one correct rejection-with-reset)
fires. Three reviewer follow-up messages during this same fix were all confirmations of
ALREADY-implemented, already-tested behavior rather than new requirements (decrease → new leg IS
positionally the last leg; increase draws from the previous leg's Amount (Tx Ccy), with Account
Ccy Equiv. auto-recomputing since it's a pure derived display value, never separately stored) — no
further logic change resulted from them, confirmed via `AskUserQuestion` before touching code
again, per this project's standing rule of not re-litigating settled behavior without new
information.

**Real bug found and fixed, same session (reviewer-reported: "最後一筆減少金額 沒有增加一筆TRX等值的"
— decreasing the last leg did NOT open a new leg):** the original v1.12.0 implementation gated the
whole waterfall on `!row.isRemainder` — deliberately, to preserve the pre-existing "typing into the
auto-filled remainder row fixes it and reflows the leftover into a freshly-spawned remainder"
workflow (see the scope-refinement note earlier in this section). That gate was too broad: since
the remainder row is normally the LAST row, decreasing "the last leg" in the common case — while it
was STILL marked `isRemainder` (the user had never separately fixed it first) — silently bypassed
the waterfall entirely and fell back to the OLD `fixRow()` fallback-promotion behavior instead
(reassigning some OTHER existing row's `isRemainder` flag and recomputing IT via exact
subtraction), never creating a new row at all. This was the ORIGINAL reason for the carve-out
(avoiding rule 1's then-REJECTION on a remainder decrease) — but once rule 1 was revised to create
a new leg instead of rejecting (see above), the carve-out's justification disappeared and it became
a straightforward regression instead.

**Fix:** removed the `!row.isRemainder` condition from both `onAmountInput` and
`onAccountAmountInput` — the waterfall now applies whenever `rows.length > 1`, regardless of the
edited row's remainder status. The single-row (not-yet-split) case remains the only exemption
(unchanged `fixRow`/`ensureRemainderRow` "split off a new row" behavior). Introduced
`finishAmountEdit(row, wentThroughWaterfall)`: when the waterfall ran, it clears the edited row's
OWN `isRemainder` flag and calls `ensureRemainderRow()` directly (a no-op in practice, since the
waterfall already keeps Σ Amount exactly equal to `totalAmount`) — deliberately WITHOUT calling
`fixRow()`, since `fixRow`'s fallback-promotion is built for the old one-remainder-row model and
would otherwise reassign an unrelated row's `isRemainder` flag for no reason now that the waterfall
manages its own row creation. `amountInputTitle` updated to match: a remainder row in a genuine
multi-row split now gets the ordinary first/middle/last tooltip, not the old "Remainder" message
(still shown only for the true single-row case).

Three pre-existing tests relied on the old bypass (directly or via its interaction with
`onTotalChange`'s pct-vs-amount-driven distinction) and were updated: the `onTotalChange`
exact-subtraction regression test now constructs its "one remainder + one fixed foreign row" setup
via direct property assignment rather than via `onAccountAmountInput` (that path now correctly
opens a third row instead, which is a different, equally-valid scenario, just not what that test is
about); the old "remainder row bypasses the waterfall" test was rewritten to assert the FIX
(decreasing a still-remainder last row now opens a new row, and no other row gets silently
reassigned to remainder); and the corresponding `amountInputTitle` test now expects the ordinary
"Last leg" message instead of "Remainder". Verified live in-browser: splitting into two rows,
leaving the second one as the untouched auto-remainder, and decreasing ITS Amount (Tx Ccy) directly
now correctly opens a third row holding exactly the freed difference — matching the originally
reported gap.

## Leg-allocator: LAST row's displayed % gets the exact complement, not an independently-rounded value (v1.12.1, business-requirement-confirmed 2026-08-11)

Reviewer-reported: once a split is fully amount-driven (the normal end state after repeated use of
the Amount waterfall above — no row left marked `isRemainder`), each row's displayed `%` was only
ever independently rounded from its OWN amount (`amountTxCcy / totalAmount * 100`, 2dp). This can
fail to sum to exactly 100.00% even though the underlying AMOUNTS sum to `totalAmount` exactly — the
classic repeating-fraction gap: three equal thirds of a total each round to 33.33%, summing to
99.99%, not 100.00%. Reviewer's fix, stated precisely: **last row's % = 100% − Σ(every row before
it's own %)** — exactly mirroring how a dedicated remainder row already gets its own % as the exact
complement (`remainderRow.pct = 100 − Σfixed%`, pre-existing). Reviewer also reaffirmed the
project's standing principle directly: **"輸入金額後，比例僅供參考，不須再用比例算"** (once amount
is entered, % is reference-only — never used to drive further calculation) — i.e. this fix must
only ever touch the DISPLAY `.pct` field, never `.amountTxCcy` (the sole source of truth).

**Fix, in `ensureRemainderRow()`:** after collapsing to `fixed` rows (no leftover to show a
dedicated remainder row for), if the split is not over-allocated, the LAST row's `.pct` is set to
`100 − Σ(every other row's own .pct)` — a pure display correction, `.amountTxCcy` never touched.

**A necessary, deeper companion fix surfaced while implementing this precisely:** the decision of
"is there a real leftover" (whether to spawn/keep a dedicated remainder row at all) used to be
**%-based** (`remaining = 100 − Σfixed%`, spawn a remainder row whenever `remaining > 0.001`). That
threshold is exactly the same repeating-fraction drift this fix targets — for the three-equal-
thirds example, `remaining` reads as `0.01` (`100 − 99.99`), which is `> 0.001`, so the OLD code
would spawn a **phantom remainder row holding `0.00`** (since `totalAmount − Σfixed amounts` is
genuinely `0` — the amounts already balance exactly) even though nothing is actually missing.
Switched the routing decision to be **amount-based** instead (`amountRemaining = totalAmount − Σfixed amounts`, exact since every amount is already scale-rounded): spawn/keep a real remainder row
only when `amountRemaining > 0`; otherwise take the "fully allocated" branch and apply the %
correction above. This is the same amount-is-truth principle applied one level up, and required
because the reviewer's own %-is-reference-only principle above applies to ROUTING decisions too, not
just to the final displayed value. The over-allocated case is guarded the same way on both fronts:
`amountRemaining` negative → skip the % correction (so a genuine over-allocation still visibly shows
non-complementary percentages and the Total Allocated warning still fires) and skip spawning a
remainder row (unchanged from before — over-allocation was never eligible for a remainder row).

See `leg-allocator.component.spec.ts`'s "last-row % exact-complement (v1.12.1 …)" describe block:
the three-way 1/3 split reads Total Allocated as exactly 100% (not 99.99%) with no phantom 4th row;
a genuine over-allocation (two explicit 60% rows) is confirmed NOT masked (last row's % stays 60,
`isOverAllocated` still fires); and a genuine (non-drift) leftover still correctly spawns a real
remainder row, proving the amount-based routing change didn't regress the ordinary case. All 96
leg-allocator tests (300 project-wide) still pass with no other behavior changes. Verified live
in-browser: Total Amount 30000 split into three explicit 10000/10000/10000 legs displays
33.33% / 33.33% / 33.34% — "Total allocated: 100%", not 99.99%.

## Leg-allocator: a Total Amount (header) change absorbs entirely into the LAST row, distinct from the per-leg Amount waterfall (v1.12.2, business-requirement-confirmed 2026-08-11)

Reviewer's rule, worked through across several follow-up messages until unambiguous (the first
phrasing implied drawing/cascading symmetric with the per-leg waterfall, which turned out to be
mathematically inconsistent with a total INCREASE — see below): when the **Total Amount header
field itself** changes (not an individual leg edit) and the split is fully amount-driven (no
floating remainder row — the normal state after using the per-leg waterfall), the ENTIRE delta
lands on the LAST row specifically:

- **Increase**: adds directly to the last row. No cascading/drawing — growing the total is new
  money, it doesn't need to come from anywhere else. (An earlier proposed reading — "increase draws
  from the previous leg, same as the per-leg rule" — was walked through with a concrete worked
  example: 3 rows at 1000/1000/1000, Total Amount 3000→4000; drawing 1000 from a previous row to
  fund the last row's increase would leave the rows summing to 3000 while `totalAmount` says 4000 —
  a real mismatch. Reviewer confirmed the direct-add reading instead.)
- **Decrease**: subtracts from the last row; if it alone can't cover the full decrease without
  going negative, continues subtracting from the row before it, and so on — capped at 0 per row,
  same "never negative" precedent as the per-leg waterfall's own increase-draw cascade. Reviewer:
  "不是最後一筆，增加減少都調整至最後一筆幣別等值" / "如果不是最後一筆 減少最後一筆 不夠才往上減".

**Deliberately distinct from, and does not touch, the pre-existing per-leg Amount waterfall
(`applyAmountWaterfall`/v1.12.0-1) — reviewer explicitly re-confirmed both remain unchanged and
side-by-side**: decreasing a leg directly (via its own Amount input) still opens a NEW trailing leg
for the freed difference; increasing a leg directly still draws backward from the previous leg(s).
The Total-Amount-header case never creates a new row — it only ever adjusts rows that already
exist. Two genuinely different triggers (editing the header field vs. editing an individual leg),
two genuinely different mechanisms; conflating them was exactly the source of the mathematical
inconsistency above.

**Implementation:** `onTotalChange`'s existing per-row loop (pct-driven rows rescale via their own
%; amount-driven rows keep their exact typed amount, only their display % refreshes) is unchanged.
New `absorbTotalDeltaIntoLastRow()`, called only when no row is currently the floating remainder,
resolves the gap left by that loop by targeting the last row (and, on an insufficient decrease,
earlier rows via the same backward cascade shape as `applyAmountWaterfall`'s increase-draw, reusing
`markCascaded` for every row it touches). When a genuine remainder row still exists, this step is
skipped entirely — `ensureRemainderRow`'s pre-existing exact-subtraction handling of that row
already does the right thing, unchanged.

**Companion fix, same session — the per-leg waterfall's auto-created new leg (rule 1) now defaults
its Account No. to the account TYPE's own placeholder** (`DEFAULT_ACCOUNT_NO_BY_TYPE[defaultAccountType]`,
e.g. `CUST-ACC` for CUSTOMER — same convention `onAccountTypeChange` already uses), not blank —
reviewer: "增加新的 ACCOUNT NUMBER賦值 根據 AC TYPE DEFAULT AC NUMBER". A blank Account No. on an
auto-created row read as incomplete/broken rather than a placeholder awaiting input.

See `leg-allocator.component.spec.ts`'s "onTotalChange absorbs into the LAST row…" describe block
(5 tests: direct-add on increase, last-row-alone-sufficient decrease, multi-row backward-cascade
decrease, drain-everything-to-0 decrease, and confirming the genuine-remainder case is unaffected)
and the updated per-leg-waterfall new-row test (now asserts `CUST-ACC`, not blank). All 101
leg-allocator tests (305 project-wide) pass. Verified live in-browser: a 70/30 two-row amount-driven
split — Total Amount 10000→13000 added the full +3000 directly to the last row only (7000
untouched, 3000→6000); a further 13000→4000 decrease drained the last row (6000→0) then cascaded
the remaining 3000 into the first row (7000→4000); separately, directly editing the (now-last) row's
own Amount from 9000→2000 correctly opened a new row holding exactly 7000 with Account No. `CUST-ACC`
— both mechanisms verified working side-by-side without interfering with each other.

## Leg-allocator: the per-leg Amount waterfall (`applyAmountWaterfall`) now targets the LAST row directly on every non-last-row edit, superseding v1.12.0's "adjacent neighbor" model (v1.12.3, reviewer-confirmed 2026-08-11)

Reviewer supplied the complete 4-rule replacement spec in one message, confirmed unambiguous after a
follow-up A/B check ("A B 都對"):

1. **Non-last row, increase**: decreases the **LAST** row by the same amount (capped at what it has)
   — not the row positionally next to it. Reviewer: "不是最後一筆增加金額 就減少至最後一筆幣別等值".
2. **Non-last row, decrease**: increases the **LAST** row by the exact freed amount (always fully
   absorbed — no cap needed on an increase). Reviewer: "不是最後一筆減少金額加增加至最後一筆幣別等值".
3. **Last row, decrease**: unchanged from v1.12.0 — opens a brand-new trailing row holding the freed
   difference (Account No. defaults per `DEFAULT_ACCOUNT_NO_BY_TYPE`, per the v1.12.2 companion fix).
   Reviewer: "最後一筆減少金額 增加一筆新的Trx幣別等值".
4. **Last row, increase**: unchanged from v1.12.0 — draws backward from the row(s) before it,
   cascading further back if one row alone can't cover it, capped at 0 per row. Reviewer: "最後一筆增加
   金額 減少上一筆幣別等值 不夠繼續往上減少".

This **replaces** the old "increase draws from N−1, decrease flows to N+1" adjacent-neighbor model
entirely for non-last rows (rules 1–2) — every non-last row, regardless of position (first, middle,
whatever), now offsets directly against the last row, never the row physically next to it. Rules 3–4
(the last row's own behavior) are untouched. A consequence, not a separate decision: the old
"increasing the FIRST row is REJECTED — no previous row to draw from" boundary case **no longer
exists** — under this model the first row is just another non-last row, so increasing it now succeeds
via rule 1 (decreases the last row) instead of being blocked. Confirmed with the reviewer directly
("UX設計 比較合理 對嗎?") — always-last-row targeting is a simpler mental model than
position-dependent adjacency, and removes a boundary case (first-row rejection) that had no
intuitive justification once amount-editing was meant to be freely usable on any row.

**Implementation:** `applyAmountWaterfall(index, requestedAmount)` branches on `index === lastIndex`
first; the non-last branch (rules 1–2) always reads/writes `rows[rows.length - 1]` directly rather than
`rows[index ± 1]`. Every row the method touches (the last row itself, any donor row during rule 4's
backward cascade, or a newly-created row under rule 3) goes through the same `markCascaded` helper as
before — unchanged. `amountInputTitle`'s tooltip and the template's `<p class="allocator-hint">` copy
were both rewritten to describe "always the last leg, never the leg next to it" instead of the old
adjacent-neighbor phrasing.

See `leg-allocator.component.spec.ts`'s "amount waterfall" describe block: rewrote the 5
non-last-row-facing tests to assert the last row is the target (not the adjacent row), added 2 new
tests specifically covering rule 1's cap-at-the-last-row's-own-balance behavior (never cascades further
back into other rows even when they hold more), rewrote the former "FIRST row REJECTED" test into "FIRST
row increase now SUCCEEDS via rule 1", and rewrote both `amountInputTitle` tests (the old
"First leg"/"Decreasing pushes" substrings no longer exist) to expect the new "LAST leg" phrasing. Rules
3–4 (last-row behavior) and the Total-Amount-header mechanism (`absorbTotalDeltaIntoLastRow`, v1.12.2)
are unaffected and their existing tests needed no changes. All 103 leg-allocator tests (307
project-wide) pass; `tsc --noEmit` and `ng build --configuration development` are both clean. Verified
live in-browser end-to-end on a 4-row USD split (2000/1000/2000/3000, last row initially 5000 before the
rule-3 step below): increasing row0 (non-last, first) by +2000 decreased the last row by 2000 with the
middle row untouched (rule 1); decreasing row1 (non-last, middle) by −2000 increased the last row by
2000 with row0 untouched (rule 2); decreasing the last row 5000→2000 opened a new 4th row holding
exactly 3000 (rule 3); increasing that new last row 3000→8000 cascaded backward through all three
earlier rows in order, draining two of them to 0 and leaving the first at 2000 (rule 4) — Total
Allocated stayed exactly 100% throughout, no errors.

## Business-case-runner: a stale Confirm error now clears itself once the form is corrected; leg-allocator's ordinary row-split path also defaults the new row's Account No. (two small reviewer-reported fixes, 2026-08-11)

**Fix 1 — stale `confirmError` never self-cleared.** A failed Confirm click (e.g. `⚠ [400] REQUEST_VALIDATION_FAILED: debitLegs.1.accountNo: String must contain at least 1 character(s)`) set
`confirmError`, but nothing cleared it afterward except clicking Confirm again or switching business
case — so correcting the underlying field (typing in the missing Account No.) left the old error
banner on screen indefinitely even after the form was valid again. Reviewer: "當交易修正成功 把上次的
ERROR 清除". Fixed by resetting `confirmError = null` at the top of `runPreview()`, alongside the
pre-existing `previewError`/`previewIncomplete` resets — `runPreview` already re-runs on every
debounced edit (any Formly field, leg-allocator row, Suspense entry, or header override, via the same
merged `form.valueChanges` / `legsChanged$` pipeline in `selectCase`), so this clears the stale banner
the moment the next recompute cycle fires, whether or not that recompute itself succeeds (a preview
that still fails shows its own fresh `previewError` instead, never both stacked).

**Fix 2 — the ORDINARY row-split path (`ensureRemainderRow`'s own new-row branch, not rule 3's
last-row-decrease case from v1.12.2) still defaulted a newly-spawned remainder row's Account No. to
`''`.** This is the far more common of the two "a new row gets created" paths — it's how the very
first split happens (fixing any row via % or Amount leaves a leftover) — so a blank Account No. was
the common case, not the rare one. Reviewer: "第一筆輸入不同幣別金額後 DEFAULT ACCOUNT NUMBER沒有作用
仍然是空值". Fixed by applying the same `DEFAULT_ACCOUNT_NO_BY_TYPE[this.defaultAccountType]`
placeholder v1.12.2 already used for rule 3's new row.

See `business-case-runner.component.spec.ts`'s two new tests in the "runPreview" describe block (stale
confirmError clears on both a successful and a still-failing re-preview) and
`leg-allocator.component.spec.ts`'s new test in the "remainder rounding" describe block (a plain % split
now asserts the spawned row's `accountNo` is `'CUST-ACC'`, not `''`). All 310 project-wide tests pass;
`tsc --noEmit` and `ng build --configuration development` are both clean. Verified live in-browser:
cleared a debit leg's Account No., clicked Confirm, got the exact reported 400/accountNo error banner;
retyping the Account No. and waiting for the debounced re-preview made the banner disappear with no
further clicks. Separately, typing a smaller Amount into a sole 10000 row (a plain split, not a
last-row decrease) spawned a second row with Account No. `CUST-ACC`, not blank.

## Leg-allocator: Account Ccy Equiv. edits now round-trip exactly (`Row.accountCcyOverride`), fixing a JPY 20000 → 19999 precision-loss bug (reviewer-reported, 2026-08-11)

Reviewer's report was a concrete worked example — CUSTOMER / CUST-ACC / 1.34% / 134.15 / JPY / rate
149.0825 / **Account Ccy Equiv. 20000** / FX Exchange USD — typing JPY 20000 into Account Ccy Equiv.
read back as **19999** after commit. Root cause, confirmed by the reviewer's own follow-up explanation
(banking calculations are B-Tree: whichever field was actually typed is authoritative and is never
re-derived from its own rounded counterpart — "C = A / B 後又用 A = B * C 就不符合銀行業務計算方式";
concrete proof: "A = 1 B = 3。1 / 3 = .33, .33 * 3 = .99。.99 NOT = 1"): `amountTxCcy` is always
rounded to the **transaction** currency's own scale (2dp for USD — by design, since it's what the
wire/%-split math/V8 balance check all operate on), so `20000 ÷ 149.0825` rounds to `134.15` (the
exact quotient is `134.15389…`). `accountCcyAmount()` (the display) and `emit()`'s `amountAccountCcy`
(the wire) both used to **re-derive** the account-ccy figure as `amountTxCcy × rate` every time —
`134.15 × 149.0825 = 19999.42`, which rounds to JPY's 0dp scale as `19999`, not the `20000` actually
typed. Exactly the A=1/B=3/.33×3=.99 pattern: re-deriving the source field from its own already-rounded
derivative loses information, every time the two currencies' minor-unit scales don't line up evenly.

**Fix — store the exact typed figure instead of re-deriving it.** New `Row.accountCcyOverride: Decimal | null`, set by `onAccountAmountInput` to the raw typed account-ccy amount whenever the edit wasn't
capped by the waterfall (a capped edit's real `amountTxCcy` is smaller than what the raw figure would
imply, so the derivation is correct there instead — see the field's own doc comment). New private
`accountCcyAmountDecimal()` prefers the override when present; both `accountCcyAmount()` (display) and
`emit()`'s `amountAccountCcy` (wire) now call it, so what's shown is exactly what's sent. `amountTxCcy`
itself is completely unchanged — still rounds to the transaction currency's own scale, still what the
waterfall/%-split/wire `amountTxCcy` field all use — this fix touches ONLY the account-ccy side of the
pair, leaving the transaction-ccy-side B-Tree math (rows, totals, waterfall) untouched.

**The override is cleared wherever it would otherwise go stale** — `onAmountInput` (the OTHER input
surface for the identical `amountTxCcy` field; that edit is now authoritative instead),
`onPctInput`, `onRowCurrencyChange`, `onCurrencyChange` (the row's own currency, or the shared
transaction currency, changed — the old figure no longer means anything), and `markCascaded` (every
row the waterfall itself touches — a donor/receiver in rule 1/2/4, or `absorbTotalDeltaIntoLastRow` —
moved for a reason unrelated to a fresh account-ccy retype).

See `leg-allocator.component.spec.ts`'s new "accountCcyOverride round-trip fix" describe block (9
tests: reproduces the raw-math bug in isolation; confirms the fix round-trips 20000 exactly via both
`accountCcyAmount()` and the wire's `amountAccountCcy`; confirms the override is dropped — falling
back to the lossy derivation — after a subsequent `onAmountInput`, `onPctInput`, currency change
(row-level and transaction-level), and a capped waterfall edit; confirms a row touched only as the
waterfall's LAST-row counterparty also loses its own stale override). All 319 project-wide tests pass
(9 new, zero regressions in the other 310); `tsc --noEmit` and `ng build --configuration development`
are both clean. Verified live in-browser end-to-end, reproducing the reviewer's exact scenario: set a
Debit leg's currency to JPY (auto-fetched rate ≈149.082569), overrode the rate to the reviewer's exact
149.0825, typed Account Ccy Equiv. 20000 and committed (blur) — the field held at exactly **20000**
(previously snapped to 19999), Amount (Tx Ccy) correctly showed the rounded USD-equivalent 134.15, and
`ng.getComponent` confirmed `row.accountCcyOverride === '20000'` driving `accountCcyAmount()`.

## Leg-allocator: `%` editing now has its own waterfall — the same 4-rule model as the Amount waterfall, applied to `row.pct` instead of `row.amountTxCcy` (business-requirement-confirmed 2026-08-12, "同 Amount調整規則")

Reviewer's stated requirement, given across several messages and confirmed rule-by-rule: the `%`
column should rebalance the same way the Amount (Tx Ccy) column already does (`applyAmountWaterfall`,
v1.12.0–v1.12.3 above), not the older "fix this row, reflow the leftover into the remainder" model it
had used until now. Four rules, directly mirroring the Amount waterfall's own four:

1. **Non-last row, % increase or decrease → always targets the LAST row**, never the adjacent row —
   reviewer: "非最後一筆%調升調降 都調到最後一筆". An increase decreases the last row's % by the same
   amount (capped at whatever the last row currently has); a decrease increases the last row's % by
   the exact freed amount (always fully absorbed).
2. **Last row, % decrease → auto-creates a new trailing row** holding exactly the freed % difference,
   Account No. defaulting to the account TYPE's own placeholder (`DEFAULT_ACCOUNT_NO_BY_TYPE [defaultAccountType]`) — reviewer: "最後一筆調降 % 新增一筆 Account Number 根據 Account Type
   Default Account Number", same convention as the Amount waterfall's own rule 3.
3. **Last row, % increase → draws from the row immediately before it**, cascading further back if one
   row alone can't cover it — reviewer: "最後一筆調升% 減少上一筆%比例 不足再繼續往上調降", same shape
   as the Amount waterfall's rule 4.
4. **No row's % is ever pushed below 0** — reviewer: "調降後不得小於0% i.e. 單筆%不能為負數" — and the
   **total across all rows never exceeds 100%** — reviewer: "總比例不得超過100%". Both are structural
   invariants of the 4-rule model (% only ever moves BETWEEN existing rows, or into a freshly-created
   one under rule 2), not separately validated.

**`%` is whole-percentage-point only (1% granularity); a split needing finer precision must switch to
Amount instead — reviewer: "輸入比例保留 但以整數輸入％為主" / "如果不是整數調整% 用戶須改用金額調整模
式".** Every typed `%` is rounded to the nearest integer (`Decimal.ROUND_HALF_UP`, 0dp) before the
waterfall runs. This is deliberately narrower than the Amount waterfall, which has no such rounding —
by design: **the derived `%` shown when a row is Amount-driven (via `onAmountInput`/
`onAccountAmountInput`/the Amount waterfall's own `markCascaded`) is UNCHANGED and still non-integer
(2dp)** — reviewer explicitly reconfirmed this is a separate, unaffected concern: "調整金額時 准許非整
數％ 原業務需求不變" (adjusting Amount still permits non-integer %, unchanged). The integer rule applies
only to a DIRECTLY TYPED `%` value (`onPctInput`), never to a `%` merely displayed as Amount's derived
read-only figure. The native `<input step="1">` spinner's up/down arrows move exactly ±1%; typing an
arbitrary integer directly (not just via the spinner) is still fully supported — the same delta-based
4-rule logic applies regardless of how large the typed jump is.

**A structural property worth noting, not present on the Amount side: `%`'s rule-3 backward cascade
(the mirror of the Amount waterfall's rule 4) can never actually be under-supplied through the normal
`onPctInput` entry point.** The donor pool for a last-row increase is exactly "every row except the
last," and Σ% = 100 always holds by construction — so the donor pool's own total is always exactly
`100 − (last row's current %)`, which is always ≥ any valid requested delta (since a typed `%` is
clamped to `[0, 100]` first). The Amount waterfall's equivalent rule CAN be capped short (Amount has no
natural per-field ceiling, so a caller can request more than the whole total), but `%`'s rule 3
structurally cannot be. Rule 1 (non-last-row increase, targeting only the last row specifically, not
the full donor pool) CAN still be capped short when a untouched middle row holds a large %, exactly
like the Amount waterfall's own rule 1 — see the test file's worked example (row0=5%, row1=90%
untouched middle, row2=5% last: increasing row0 to 50% is capped at 10%, not the full 50%, since the
LAST row alone only had 5% to give).

**A consequence, not a separate decision: constructing a genuinely over-allocated split (`totalPct` >
100%) is no longer reachable through `onPctInput` alone**, since the waterfall itself conserves Σ% =
100 by construction on every call — exactly matching the reviewer's own "總比例不得超過100%" rule.
Three pre-existing tests that used to build an over-allocated fixture via two independent `onPctInput`
calls were updated to construct that state via direct field assignment instead (bypassing the
waterfall on purpose), isolating the `isOverAllocated`/`validChange` WARNING logic — which still fires
correctly — from the waterfall's own conservation behavior, which is what now prevents that state from
arising through ordinary use.

**Implementation:** `leg-allocator.component.ts`'s new `applyPctWaterfall` (private) mirrors
`applyAmountWaterfall`'s structure exactly, branching on `index === lastIndex` first; a `markPctCascaded`
helper (the `%` mirror of `markCascaded`) fixes every row the cascade touches (`driver:'pct'`,
`isRemainder:false`, `amountTxCcy` recomputed from the new `%`). `onPctInput` rounds the typed value to
an integer, routes through the waterfall whenever `rows.length > 1` (same `wentThroughWaterfall` gating
as `onAmountInput`), and delegates to a new `finishPctEdit` (the `%` mirror of `finishAmountEdit`) —
deliberately NOT `fixRow()` once the waterfall has run, for the identical reason `finishAmountEdit`
doesn't: `fixRow`'s fallback-promotion is built for the old one-remainder-row model and would otherwise
reassign an unrelated row's `isRemainder` flag even though the waterfall already balanced everything
exactly. The single-row (not-yet-split) case is the sole exemption, unchanged — still `fixRow`/
`ensureRemainderRow`'s original "typing a smaller % splits off a new remainder row" behavior, now with
integer rounding applied first. A new `pctInputTitle` tooltip mirrors `amountInputTitle`'s three-way
phrasing (single-row/last-leg/non-last-leg), noting the whole-percentage-point rule. The `%` input
itself moved from live `(ngModelChange)` firing to `(blur)`/`(keydown.enter)` commit with a forced DOM
resync afterward — the identical per-keystroke-cascade problem the Amount input's own v1.12.0 usability
fix addressed, now relevant to `%` too since it cascades against other rows on every call.

See `leg-allocator.component.spec.ts`'s "% waterfall" and "pctInputTitle" describe blocks (18 tests:
non-last-row inc/dec targeting the last row, multi-row backward cascade, the maximum-valid-%
full-cascade case proving the no-under-supply structural guarantee, the rule-1 cap against an untouched
middle row, the already-zero no-op case, last-row decrease new-row creation (and its chaining), first-row
increase success, fractional-input integer rounding, zero-delta no-op, the single-row bypass, and every
tooltip variant). Three pre-existing tests were updated for this session's change (not regressions in
the new logic itself, but consequences of `%` now conserving its own total): the 'amount waterfall'
describe block's own `buildRows` fixture helper switched from `onPctInput`-based construction to direct
field assignment (since `%` editing itself can now waterfall mid-fixture-setup); two `onTotalChange`
tests that used a fractional `onPctInput(row, 99.56)` call purely as a fixture-construction shorthand
switched to the equivalent integer `99`; and the three over-allocation tests noted above. All 336
project-wide tests pass (18 new, zero regressions); `tsc --noEmit` and `ng build --configuration development` are both clean.

## Leg-allocator: a row is auto-deleted the instant it settles at 0% AND 0 amount (business-requirement-confirmed 2026-08-12, applies to both the % and Amount waterfalls)

Reviewer: "如果單筆比例為0%＆金額=0 就直接刪除該筆" (if a single row's % is 0% and its amount is 0,
delete it directly). Scope and timing both confirmed explicitly: applies to **both** waterfalls (%
and Amount — a row can be drained to exactly zero by either), and rows are removed **immediately as
each one settles**, not deferred to a post-edit sweep.

A dangling empty leg conveyed no information on the wire even before this change —
`emit()`'s own `pct.greaterThan(0)` filter already excluded any 0%-row from what's actually POSTed to
the microservice — so this is a **UI-only grid-cleanliness fix**, not a wire-contract change.

**Where a row can settle at 0%/0 and gets pruned:**

- A donor row fully drained by rule 4's backward cascade (last-row increase, both waterfalls).
- The LAST row itself, when a non-last row's increase (rule 1) caps it down to exactly 0 (its own
  cap coincides with fully draining it) — the row before it becomes the new LAST row for any
  subsequent edit.
- The edited row itself, when a direct decrease (rule 2, non-last row) settles it at exactly 0 —
  its full value hands off to the LAST row, and the now-empty edited row disappears.

**Deliberately exempt: the single-row (not-yet-split) `fixRow`/`ensureRemainderRow` bypass path.**
Typing 0 (or a negative value, clamped to 0) into the SOLE row still shows that row at 0, with a
freshly-spawned 100% remainder alongside — it is NOT pruned in favor of that remainder. Reason: this
bypass is a genuinely different, pre-existing mechanism (unrelated to either waterfall), and
auto-pruning here would make ordinary input-clamping (e.g. "typing -500 shows 0") unobservable on
the row the user actually edited, silently swapping in a fresh object with reset defaults instead.
Both `onPctInput`/`onAmountInput`/`onAccountAmountInput` guard the edited-row prune check on
`wentThroughWaterfall` specifically for this reason.

**Never prunes below 1 row** — same guard `removeRow()` already uses; a side must always show at
least one row even if every other row drains to 0.

**Implementation:** new private `pruneZeroRow(row)` (checks `row.pct.isZero() && row.amountTxCcy .isZero()`, `this.rows.length > 1`, splices `row` out of `this.rows` **in place** — deliberately not
a reassigned `[...]` copy, since it's called from inside `applyAmountWaterfall`'s/
`applyPctWaterfall`'s own rule-4 loops, which capture `const rows = this.rows` once at the top of the
method; an in-place splice keeps that local reference correctly synced for the loop's remaining
iterations, whereas reassignment would leave the loop iterating a stale pre-prune copy). Called from
four sites: rule 4's donor loop and rule 1's capped-`last` branch in both waterfalls, plus the edited
row itself at the end of all three top-level input handlers (guarded on `wentThroughWaterfall`).

See `leg-allocator.component.spec.ts`'s "auto-delete a row once it settles at 0% AND 0 amount"
describe blocks (mirrored under both the "% waterfall" and "amount waterfall" sections, 5 tests
each): donor-drained-by-cascade removal, last-row-capped-to-zero removal (new LAST row becomes the
row before it), edited-row-decreased-to-zero removal, the never-below-1-row guard, and the
single-row-bypass exemption. All 345 project-wide tests pass; `tsc --noEmit` and `ng build --configuration development` are both clean.

## User Manual: §6.6 corrected (was describing the pre-v1.4.0 client-side Suspense bridge, now stale), plus new §6.6.1/§6.6.2 usage-guidance subsections (2026-08-12)

While adding user-manual documentation for the Amount/% waterfall's auto-delete-on-zero rule
above, a **separate, pre-existing staleness bug** was found and fixed in `docs/LC-Payment-WC-User- Manual-{en,cn}.docx`'s §6.6 ("Suspense Debit / Suspense Credit — the Charge Component bridge"): it
still described the **pre-v1.4.0** behavior — "these are ordinary PaymentLegInput entries sent
through the normal debitLegs/creditLegs arrays — no backend changes were needed for this feature"
— and cited `business-case-runner.component.ts`'s own `suspenseBridgeLeg()`/`fxExchangePairLegs()`/
`suspenseBridgeLegs()` as the live implementation. Per that same file's own doc comment (confirmed
by direct code inspection, not assumed), those functions were ported 1:1 to the microservice
(`domain/suspenseBridge.ts`) back in v1.4.0 — the client's remaining job since then is just building
the wire-level `suspenseBridge` request field (`buildSuspenseBridgeEntries()`/`buildSuspenseBridge()`
in `business-case-runner.component.ts`, sent via `business-case-request.ts`), and the actual
leg/FX-pair expansion happens server-side. §6.6's three bullets (intro paragraph, the FX-pair
citation, and the "no backend changes" claim) were corrected to describe the current v1.4.0+ split
accurately, in both languages.

**Also added, both languages:** a plain-language semantics sentence in §6.6's intro (Suspense Debit
= bank collects MORE from the customer, adds to the Debit side's total; Suspense Credit = bank pays
the customer LESS, reduces the Credit side's total — verified against `business-case-runner .component.ts`'s own `total = side === 'DEBIT' ? total.plus(trxEquivalent) : total.minus (trxEquivalent)` line, not assumed); and two new subsections citing the microservice README's
"Extended usage scenarios" section verbatim in structure — **§6.6.1 LC Issue/LC Amendment customer
fee collection** (the `creditLegs: []` + `suspenseBridge.creditEntries` pattern) and **§6.6.2
IBL/EBL Takedown & Repayment** (real `accountType: 'SUSPENSE'` legs, never `suspenseBridge`-
generated for the debit-direction Takedown/credit-direction Repayment leg, plus the Trx-Charges
common-mistake note). Both new subsections explicitly flag themselves as **usage guidance only, not
yet `business-case-registry.ts` cases** — confirmed by grepping the registry for `ibl`/`ebl`/LC
Issue/Amendment cases and finding none — matching this file's own existing "Extended usage
scenarios" section's caveat above, not a new claim.

## Leg-allocator: a row funding a multi-entry Suspense currency bucket now snaps to the SAME per-entry-rounded conversion the seed uses, closing a reviewer-reported 1-cent gap (v1.13.1, business-requirement-confirmed 2026-08-12)

**Bug, reviewer-reported with a concrete worked example:** Transaction Currency USD, Total Amount
10000, Suspense Debit = 10 USD + 20 EUR + 50 EUR (all "Charge"). Splitting the Debit Legs into an
EUR row (typed Account Ccy Equiv. 70 — the combined EUR Suspense total) and a USD remainder row
produced EUR row Amount (Tx Ccy) **75.82** and USD row **10009.99**, not the expected **10010.00**
(= 10000 + the 10 USD charge, since the EUR row already claims to fund the full 70 EUR).

**Root cause: two independently-implemented FX conversions of the SAME 70 EUR of Suspense charges,
at different rounding granularity.** `business-case-runner.component.ts`'s `suspenseAdjustment()`
(the side's seeded "Total Amount (protected)", feeding `<app-leg-allocator [initialTotalAmount]>`)
converts and rounds **PER SUSPENSE ENTRY** — round(20×rate) + round(50×rate) = 21.66 + 54.15 =
**75.81** — deliberately mirroring the microservice's own `buildSuspenseBridgeLeg` (see that
method's own v1.7.4 doc comment: this is why the seed total is 10085.81, not 10085.82). The
leg-allocator's EUR row, driven by the user's own single Account Ccy Equiv. input (70), instead
converted the **combined** amount in ONE shot — 70 ÷ 0.923295 = 75.8155… → **75.82**. Summing
already-rounded per-entry conversions vs. rounding one combined conversion legitimately land a
minor unit apart — a classic "round-per-line vs. round-once" financial rounding artifact, not a
bug in either formula individually. `absorbTotalDeltaIntoLastRow()`/`ensureRemainderRow()` then
blindly forced the LAST row to absorb whatever gap remained between the seeded total (10085.81,
per-entry-rounded) and Σ(other rows) (which included the EUR row's own combined-rounded 75.82),
silently transferring that stray cent onto the USD row (10009.99) with no way to know it was a
rounding artifact rather than genuine leftover money.

**Direction of the fix, deliberately NOT the seed formula.** `suspenseAdjustment()`'s per-entry
rounding stays exactly as-is — this is the SAME direction v1.7.3 tried and v1.7.4 reverted (see
that section above): rounding the seed bucket-first-then-once instead would disagree with the
server's own per-entry `buildSuspenseBridgeLeg`, and in the traced v1.7.3 regression this produced
a real 409 `LEGS_UNBALANCED` (a genuine aggregate-V8 mismatch), not just a display glitch. Fixing
the OTHER side — making the leg-allocator ROW conversion agree with the per-entry-rounded figure —
is what actually unifies the two without touching a decision already proven load-bearing for V8.

**Implementation:**

- `business-case-runner.component.ts`: `suspenseAdjustment()` now delegates its per-entry
  conversion/rounding to a new private `suspenseCurrencyBuckets(entries, trxCurrency)`, which
  groups the SAME per-entry-rounded trx-equivalents by currency instead of collapsing them
  straight into one total (Decimal addition is exact/order-independent, so `suspenseAdjustment`'s
  own external total is unchanged — verified by the pre-existing v1.7.4 tests, unmodified). Two new
  getters, `debitSuspenseCurrencyTotals` / `creditSuspenseCurrencyTotals`, expose this as
  `Record<currency, { rawTotal, trxEquivalent }>` (plain strings, same posture as every other
  cross-component value here).
- `business-case-runner.component.html`: both `<app-leg-allocator>` elements gained
  `[suspenseCurrencyTotals]="debitSuspenseCurrencyTotals"` / `"creditSuspenseCurrencyTotals"`.
- `leg-allocator.component.ts`: new `@Input() suspenseCurrencyTotals` (defaults to `{}` — inert for
  any caller that doesn't wire it). `onAccountAmountInput` now checks whether the typed account-ccy
  figure exactly equals `suspenseCurrencyTotals[row.currency].rawTotal`; if so, uses that bucket's
  own `trxEquivalent` for `amountTxCcy` instead of the row's own `amount ÷ rate` combined division.
  A typed figure that does NOT match any bucket's `rawTotal` is completely unaffected — ordinary
  combined conversion, exactly as before. `row.accountCcyOverride` is still set to the raw typed
  figure either way, so the Account Ccy Equiv. display still round-trips exactly (70, not some
  derived value) — only the derived `amountTxCcy` changes.

See `business-case-runner.component.spec.ts`'s "debitSuspenseCurrencyTotals / creditSuspenseCurrencyTotals"
describe block (per-currency breakdown, agreement with `suspenseAdjustment()`'s own total, an
empty-currency omission case, the CREDIT-side mirror, and a full END-TO-END test with a real
`<app-leg-allocator>` reproducing the exact reported scenario: EUR row lands at 75.81, USD
remainder row lands at exactly 10010.00, `debitLegs` wire shape included) and
`leg-allocator.component.spec.ts`'s "suspenseCurrencyTotals granularity snap" describe block (the
snap itself, the same end-to-end 10085.81/75.81/10010.00 case standalone, and two fallback cases —
a non-matching typed amount, and no `suspenseCurrencyTotals` wired at all). All 354 project-wide
tests pass; `tsc --noEmit` and `ng build --configuration development` are both clean.

---

# Confirmed Requirement — OAS structured Reference / Event model (reviewer-confirmed 2026-08-09; do not re-ask)

Full record: `docs/RDD-oas-reference-event-model.md`. Planned, NOT yet implemented.

Business fact clarified: the idempotency key is **an LC's Event**, not a running sequence number.
`sequence` = **Event Time**, tied to TF events (LC Issue = 00, Amendment = 01, Document Arrival = 02, …).
Instructions are mutable while **PENDING** (an update = delete-old + create-new), and become immutable
only after **RELEASE (4-eyes / maker-checker)**. This service's Confirm endpoint posts the already-
RELEASED (finalized) instruction — the PENDING drafting loop and the 4-eyes release live **upstream**,
out of this service's scope (consistent with FSD §6.1's "既有的已確認結果" wording).

Confirmed decisions:

- **D-1** Add a structured `transactionReference` / `event` block to the OAS (NOT flat extra string fields).
- **D-2** Idempotency key = `(originModule, bankContractRef, eventSeq)`. Primary ref = the **bank-internal
  contract number** (行内合约号), NOT the customer LC number (customer LC numbers are not globally unique).
- **D-3** `edition` (was tentatively `amendmentSeq`) is an **EDITION field, reference-only** — it never
  participates in the idempotency key; changing `edition` alone is the SAME instruction (replay).
- **D-4** Customer LC number → `customerRef` (typed: LC | IB | COLLECTION | GUARANTEE | …), carried for
  audit + **SWIFT field 21 (related reference)**; not in the key.
- **D-5** `event.type` is an enum incl. `REVERSAL` (gives post-release corrections a legal event to book).
- **D-6** Implementation = **additive / backward-compatible**: keep `mainRef`/`sequence` as legacy aliases
  derived from the new block (`mainRef ≙ bankContractRef`, `sequence ≙ eventSeq`) so the 15 existing
  consumers and current tests do not break.
- **D-7** Data migration is ALLOWED (this is a new microservice, no production-history baggage): old
  records may be migrated to populate the new structured fields (`mainRef→bankContractRef`,
  `sequence→eventSeq`, LC→`customerRef.value`). Data-layer migration coexists with the D-6 contract-layer
  aliases.
- **D-8** `eventSeq` / `edition` are **string + pattern `^\d{2,3}$`** (codes, not integers) to preserve
  zero-padding; the legacy int `sequence` is retained only as the D-6 alias.
