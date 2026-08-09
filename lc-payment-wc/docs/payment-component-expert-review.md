# Payment Component — Trade Finance & Payment Solution Architect Review

**Reviewer perspective:** Trade Finance / Payments practitioner (CITF / CPCM / CDCS-style)
combined with solution-architecture review.
**Scope reviewed:** `microservices/payment-component/src/**` (the real accounting engine),
plus `CLAUDE.md`, `README.md`, and the Angular Simulator's documented behaviour.
**Date:** 2026-08-09

---

## 1. Overall assessment

This is an unusually disciplined codebase for a payment/accounting engine. The things that
most often go wrong in trade-finance settlement systems are, here, done correctly and on
purpose: all monetary arithmetic goes through `decimal.js` (never IEEE-754), and it is
funnelled through a single choke point (`money.ts`) that enforces the OAS decimal-string
patterns; the Charge Component vs Payment Component boundary is cleanly separated through a
`Suspense - Credit` clearing account so charge posting is never duplicated; idempotency is
designed in from the start; and the FX-pair construction reuses already-on-the-wire amounts
rather than re-multiplying by a rate a second time (the v1.7.x history shows the team already
found and killed the classic "combine-then-reconvert" rounding-drift bug). Test coverage and
the documented-deviation discipline are strong.

The findings below are therefore not "this is broken" — most are **control gaps and
production-hardening items** that a bank's independent model-validation / audit function
would raise before this engine posts to a live general ledger. They are prioritised
Critical → Low.

---

> **Note — an earlier "C-1 (by-currency balance never validated)" was withdrawn.** On review
> with the team, per-currency balance *is* hard-enforced: every cross-currency conversion must
> flow through the **FX Exchange (汇兑头寸) account** as a self-balancing pair, so each currency's
> Dr = Cr holds by construction and any genuine discrepancy still surfaces on the aggregate V8
> check. The Simulator's **CURRENCY VIEW** displays this per-currency balance. This is a
> standard, correct multi-currency GL control — not a gap. See §6.

## 2. Critical

### C-2. Idempotent replay ignores the request *payload* — a corrected re-submission is silently swallowed
**Files:** `store/paymentInstructionStore.ts`, `domain/confirmPaymentInstruction.ts:73-78`

The natural key is `(originModule, mainRef, sequence)`. On a second POST with the same key the
service returns the **original** instruction (`created:false`, HTTP 200) and never looks at the
new body. That is correct for a *true* replay, but it means a caller who re-sends the same
sequence with **different leg amounts** (e.g. an operator correcting a fat-fingered amount, or
two genuinely different transactions colliding on the key) gets the stale result back with no
error — the correction is lost, and the caller believes it succeeded.

**Recommendation:** on a natural-key hit, hash/compare the canonical request payload. Same
payload → idempotent replay (current behaviour). Different payload → reject with `409
IDEMPOTENCY_KEY_CONFLICT`. This is the standard idempotency contract (cf. Stripe `Idempotency-Key`
semantics) and matches the FSD's own "unique constraint" note.

---

## 3. High

### H-1. Check-then-act idempotency is not atomic (double-post race)
**File:** `store/paymentInstructionStore.ts:38-41`, `confirmPaymentInstruction.ts:73-78, 157`

`find()` then later `save()` is a classic check-then-act. Single-threaded Node hides it *within
one instance*, but the production note already concedes this must become a shared store — at
which point two concurrent identical Confirms can both miss `find()` and both `save()`,
double-booking the GL/SWIFT output. The fix belongs with C-2: the persistent store must do an
**atomic upsert against a UNIQUE(origin_module, main_ref, sequence) constraint**, and the
generation of GL/SWIFT side-effects must key off "did I win the insert", not "did find() miss".

### H-2. Submitted leg amounts are not validated against the currency's minor units
**Files:** `validation/requestSchema.ts:22-24, 40`, `money.ts:113-115`

`MonetaryAmount` is validated only against `^-?\d{1,18}(\.\d{1,3})?$`. The service enforces
currency scale on amounts it *computes* (`minorUnitsForCurrency`), but never on amounts the
caller *submits*. So `JPY 100.50` (2 dp on a 0-dp currency) or `EUR 1.234` (3 dp) is accepted,
flows into the balance sums, and will either break by-currency balance or be rejected by the
downstream GL. Currency decimal precision is on your own review checklist.

**Recommendation:** in `paymentLegInputSchema`, cross-validate each amount's decimal places
against `minorUnitsForCurrency(leg.currency)` and reject as 400 on over-precision.

### H-3. MT103/pacs.008: settlement amount (32A) = instructed amount (33B) is wrong for cross-currency
**File:** `domain/swiftMessages.ts:59-71`

`buildAdviceMessage` sets `settlementAmount` and `instructedAmount` to the *same* leg field. The
code documents this as source-traced (both from `CPYT_CR_AMT_CRCCY`), and it is fine for a
**single-currency** payment. But in a genuine cross-currency MT103/pacs.008, **33B (instructed
amount) and 32A (interbank settled amount) are in different currencies and differ by the FX
conversion** — emitting them equal is a message-correctness defect that a correspondent /
sanctions-screening / gpi flow will flag. Also note `uetr` is declared on the type but **never
populated**, yet a UETR is mandatory for CBPR+ pacs.008 and gpi MT103; `serviceTypeId` /
`isGpiMember` are likewise never set.

**Recommendation:** treat 32A vs 33B as distinct (settlement ccy/amount vs instructed ccy/amount),
and generate a UETR per outbound message. Even if full SWIFT enrichment is out of demo scope,
these should be flagged as known gaps rather than shipped as "equal".

---

## 4. Medium

### M-1. Signed amounts + aggregate-only balance allow "balancing" by cancellation
**File:** `money.ts:15` (`-?` in the pattern), `balanceValidation.ts`

`MonetaryAmount` permits negatives. In double-entry GL, direction is expressed by the Dr/Cr
*side*, never by a negative amount. Because V8 only checks the signed aggregate, a negative leg
on the debit side can offset another debit leg and still "balance". Recommend rejecting negative
submitted leg amounts (post-expansion FX legs are system-generated and self-balancing, so the
constraint can be applied to caller input).

### M-2. Exchange rate accepts zero; no positive/sanity bound — silent loss of a charge
**Files:** `money.ts:16, 41-46`, `suspenseBridge.ts:133-137`

`EXCHANGE_RATE_PATTERN` accepts `"0"`. A zero `crossRate` makes `trxEquivalent = 0`, and
`buildSuspenseBridgeLeg` then **returns `null` (drops the leg)** — a real charge disappears with
no error. There is also no upper/lower sanity bound (a mis-keyed rate of 10000 would post
silently). Recommend `rate > 0` validation and an optional plausibility band per currency pair.

### M-3. `chargeComponentBridge` diff pair: sign of `diffNative` and `diffTrx` can diverge
**File:** `suspenseBridge.ts:337-355`

The branch **gates on `diffNative`'s sign** (`greaterThan(0)` / `lessThan(0)`) but sizes the
transaction-currency leg with the **independently-computed `diffTrx`**. Across multiple
partly-offsetting legs it is possible (through independent rounding) for `diffNative > 0` while
`diffTrx <= 0`. `buildFxPair` would then emit a pair carrying a **negative or zero `amountTxCcy`**.
It stays aggregate-balanced (self-cancelling), so V8 won't catch it — but a negative-amount FX
leg on the voucher is nonsensical and would confuse reconciliation. Recommend gating on, or
asserting agreement between, both `diffNative` and `diffTrx` signs (and skip when either is zero).

### M-4. `sumLegsInCurrency` falls back to `amountTxCcy` as if it were native currency
**File:** `suspenseBridge.ts:216-220`

When a foreign-currency leg omits `amountAccountCcy`, the code uses `amountTxCcy`
(transaction-currency-denominated) as the native-currency figure to size the FX pair — mixing
two currencies. It is documented as a fallback, but for a raw API caller it silently produces a
wrong FX-pair magnitude. Recommend requiring `amountAccountCcy` whenever `leg.currency !=
transactionCurrency`, rather than falling back.

### M-5. No value-date / business-day validation
**Files:** `types.ts` (`valueDate?`), `swiftMessages.ts` (passthrough)

`valueDate` is optional and never validated — not checked for back-value beyond tolerance, not
checked against a currency/RTGS calendar. Value date drives Nostro funding and is control-
critical for settlement. At minimum, validate format-plus-not-excessively-back-valued and flag
non-business-day value dates per settlement currency.

### M-6. No reversal / unwind path; `unpaidFlag` unused
**Files:** `confirmPaymentInstruction.ts`, `types.ts` (`unpaidFlag`, `unpaidAmountTxCcy`)

Your review checklist calls for reversal/exception handling. A confirmed instruction currently
has no reversal or contra-posting path, and `unpaidFlag`/`unpaidAmountTxCcy` are carried but
never populated or acted on. For a payment engine, reversal (and partial/unpaid handling) is a
core lifecycle state, not an edge case — flag as a design gap even if deferred.

### M-7. RPFM's flat ±0.01 tolerance is applied to the whole instruction
**File:** `confirmPaymentInstruction.ts:112`, `balanceValidation.ts:45-64`

The RPFM tolerance is a single absolute `0.01` over the entire instruction, independent of how
many FX-conversion (rounding) events occurred. With many FX legs, legitimate cumulative rounding
can exceed 0.01 (false reject); conversely a genuine 0.01 posting error passes silently (false
accept). Best practice ties tolerance to the number of conversion legs (e.g. `n_fx_legs × half
a minor unit`) rather than a blanket constant.

### M-8. No transport-layer security controls on the service
**File:** `app.ts`

`createApp` wires `express.json()` and the router with no auth, no `express.json({ limit })`
body cap, no rate limiting, and no request/trace-id correlation. Acceptable for the demo, but
these are table-stakes for anything posting to a GL and should be on the productionisation list.

---

## 5. Low

- **L-1. Non-UUID entry/leg/message IDs.** `accountEntries.ts:24-28`, `voucherDescription.ts:111-115`,
  `swiftMessages.ts:46-50` use module-global counters + `Date.now()`. Collision-prone across
  instances and non-deterministic; `instructionId` already uses `randomUUID()` — do the same here.
- **L-2. `classify` preview requires ≥1 credit leg.** `requestSchema.ts:130-134` keeps `.min(1)`
  on `creditLegs`, so a `chargeComponentBridge` case (legitimately empty credit side) cannot use
  the preview endpoint — minor inconsistency with the relaxed Confirm rule.
- **L-3. `onConfirm()` does not gate on `debitValid`/`creditValid`.** Already recorded in
  `CLAUDE.md` as a pre-existing, general gap. Worth fixing (disable Confirm while either side is
  invalid) independently of the charge-bridge work.
- **L-4. Coverage excludes templates/DOM.** README notes the 9 vanilla custom elements and every
  `.html` template are outside `collectCoverageFrom`; the `NG9` template-compile incident in
  `CLAUDE.md` is exactly the class of bug that slips through — keep the "`ng build` after any
  template change" rule enforced in CI, not just by convention.

---

## 6. What is done well (keep doing)

- Decimal-only arithmetic behind a single `money.ts` choke point — the correct posture, and rare.
- Clean Charge ↔ Payment component separation via a `Suspense - Credit` clearing account; no
  duplicated charge posting (`CLAUDE.md` boundary section).
- FX pairs sized from already-rounded, already-on-the-wire amounts — the team already diagnosed
  and removed the "combine-then-reconvert" drift bug (v1.7.x history in `suspenseBridge.ts`).
- Idempotency designed in, with an honest production note about the in-memory limitation.
- OAS-first typing, documented deliberate deviations (V8, RTGS = NOSTRO+flag), and a strong,
  gated test suite.
- **Per-currency balance is hard-enforced through the FX Exchange (汇兑头寸) account** — every
  conversion is routed through it as a self-balancing pair, so each currency stays Dr = Cr by
  construction while V8 catches any real aggregate discrepancy, and the CURRENCY VIEW makes it
  visible. A textbook multi-currency GL control (this is why the earlier C-1 was withdrawn).

---

## 7. Suggested priority order for remediation

1. **C-2 / H-1** payload-aware, atomic idempotency (correctness + concurrency together).
2. **H-2** currency-scale validation on submitted amounts.
3. **H-3** SWIFT 32A/33B split + UETR (if SWIFT output is in scope).
4. **M-1…M-8** input hardening (signed amounts, rate bounds), FX diff-sign guard, value-date and
   reversal design, tolerance model, transport security.
5. **L-1…L-4** cleanup.
