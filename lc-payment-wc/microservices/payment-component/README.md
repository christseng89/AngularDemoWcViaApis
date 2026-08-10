# Payment Component Service (Node.js / TypeScript)

Implements `POST /payment-instructions` from `payment-instructions-post.yaml`
v1.8.0, following the Confirm flow specified in
`PaymentComponent-Microservice-FSD-zh.docx` §5.4 and every formula traced in
`Payment_Component_Calculation_Validation.docx` (§3, §4, §5, §6.1, §7), plus
the v1.4.0 `suspenseBridge` addition and its v1.5.0 `sourceComponent`
extension (neither part of the legacy trace — see below). §6.2 Charge
Voucher and §6.3 Liability Voucher generation were removed entirely v1.6.0 —
this service now only ever produces §6.1 Settlement Account Entries.

Stack: TypeScript + Express + [decimal.js](https://mikemcl.github.io/decimal.js/)
(all monetary/rate arithmetic — decimal-string types added in OAS v1.2.0,
forbidding binary floats) + [zod](https://zod.dev/) (request validation).

## Running

```bash
npm install
npm run typecheck        # tsc --noEmit — checks src/ and test/
npm test                 # Jest unit suite (test/unit/) with coverage — gated at 90% branches/functions/lines/statements
npm run test:coverage    # same as `npm test`; explicit alias
npm run test:regression  # runs the FSD-verified test vectors (§13) + an end-to-end HTTP smoke test
npm run build             # emits dist/ from src/ only
npm start                  # node dist/server.js  (or `npm run dev` for ts-node, no build step)
```

`npm run dev` runs `node --watch -r ts-node/register src/server.ts` — it auto-restarts on every `src/` save (Node's built-in `--watch`, no extra dependency). If you're running the server directly some other way (e.g. plain `ts-node src/server.ts`), remember it will NOT pick up source changes automatically — a stale process silently serving old behavior looks exactly like a bug in the new code and can cost real debugging time before you think to check the process is even running current code.

`npm test` (Jest + ts-jest, config in `jest.config.js`) is the isolated-unit-test suite — one `test/unit/**/*.test.ts` file per `src/` module, asserting behavior in isolation rather than end-to-end. `npm run test:regression` stays a separate, complementary smoke test replaying the FSD-verified scenarios plus a real HTTP round-trip; it isn't superseded by the Jest suite and both should keep passing. `src/server.ts` (pure `app.listen()` bootstrap) is excluded from the coverage collection — `app.ts`'s `createApp()` is what's actually tested, via `supertest`.

Server listens on `PORT` (default 3000), all routes mounted under
`/payment-component/v1` per the OAS `servers[0].url`.

## Source layout

| File | Formula section | What it does |
|---|---|---|
| `src/types.ts` | — | TypeScript types mirroring every OAS schema exactly |
| `src/money.ts` | §8.2 | Decimal-backed parse/format for `MonetaryAmount`/`ExchangeRate`; the only module allowed to construct a `Decimal` from a wire string |
| `src/validation/requestSchema.ts` | — | zod schema for `PaymentInstructionConfirmRequest`; failures → 400. `creditLegs`/`debitLegs` normally require >=1 item; a `superRefine` relaxes each to 0 only when the matching bridge flag is true AND the matching `suspenseBridge` list is non-empty (2026-08-09/2026-08-12, not legacy-traced — see "Debit Payment Bridge"/"Credit Payment Bridge" below); the two bridge flags are mutually exclusive |
| `src/domain/balanceValidation.ts` | §3, V8 | Dr/Cr balance check |
| `src/domain/classification.ts` | §4 | Payment Component Identification Rule (Rev. 2) |
| `src/domain/voucherDescription.ts` | §5 | Per-leg `accountDesc` assembly |
| `src/domain/accountEntries.ts` | §6.1 | Settlement voucher stream (§6.2/§6.3 removed v1.6.0 — see below) |
| `src/domain/swiftMessages.ts` | §7 | SWIFT cross-field validation + message generation |
| `src/domain/confirmPaymentInstruction.ts` | §5.4 (all 5 steps) | Orchestrator, in source-verified execution order |
| `src/domain/suspenseBridge.ts` | — (v1.4.0, not legacy-traced) | Charge Component ↔ Payment Component accounting bridge, incl. v1.8.0 per-source FX Exchange pairs (superseding v1.7.0/v1.7.1's combined netting/combining) and the 2026-08-12 debit/credit leg-placement flip for `creditLegsComponentBridge` — see below |
| `src/store/paymentInstructionStore.ts` | FSD §6.1 | Idempotency store — **in-memory, swap for a real DB before production** |
| `src/routes/paymentInstructions.ts`, `src/app.ts`, `src/server.ts` | — | HTTP wiring |
| `test/regression.ts` | Calc/Validation §13 | Re-runs the 6 FSD-verified scenarios (§2.3.2, §2.3.3, §6.5) through the actual code, plus one real HTTP round trip |

## Gaps against the official OAS — flagged, not silently guessed

One input the traced source logic genuinely needs has **no corresponding
field in `PaymentInstructionConfirmRequest`** today. Rather than invent an
OAS property unilaterally, this service accepts it as an optional top-level
JSON extension on the POST body (validated separately from the strict OAS
schema, see `RequestExtensions` in `routes/paymentInstructions.ts`):

- **`sourceFunctionCode`** (string) — resolves the `{MODULE}{FuncCode}`
  voucher-description prefix (§5). `originModule` alone is ambiguous: IPLC
  alone maps to two different prefixes depending on which of its 3 confirmed
  functions is calling. See `domain/voucherDescription.ts` and
  `Payment_Mapping_Functions.docx` §10 for the full prefix table and two
  still-unresolved FSD rows (EPLC Pay/Accept, EXCO SettlementAtMaturity) that
  require `voucherCodePrefixOverride` instead.

(`chargeContext` and `liabilityContext` — the §6.2/§6.3 legacy extension
fields — existed here through v1.5.0; removed v1.6.0 along with §6.2/§6.3
generation itself. See "Balance/Charge Component ↔ Payment Component bridge"
below for the current design.)

A second and third field, **`debitLegsComponentBridge`** (boolean, added 2026-08-09) and its
mirror image **`creditLegsComponentBridge`** (boolean, added 2026-08-12), are a related but
mechanically DIFFERENT case: neither is routed through the `RequestExtensions` sidecar above at
all (which bypasses zod validation entirely) because each needs to participate in a cross-field
validation rule — both are declared directly on `paymentInstructionConfirmRequestSchema`
(`validation/requestSchema.ts`) with a `superRefine` that relaxes `creditLegs`'/`debitLegs`'
normal `>= 1` item requirement to 0 items, but ONLY when the matching flag is `true` AND the
matching `suspenseBridge` list has at least one entry — and rejects the request outright if both
flags are true at once (they're mutually exclusive). Also has no home in the OAS (same situation
as `sourceFunctionCode`) — see "Debit Payment Bridge (`debitLegsComponentBridge`, 2026-08-09)" and
"Credit Payment Bridge (`creditLegsComponentBridge`, 2026-08-12)" below for the full contract and
the accounting rationale of each.

## Balance/Charge Component ↔ Payment Component bridge (`suspenseBridge`, v1.4.0 / v1.5.0 / v1.7.0-v1.8.0)

Not part of the legacy trace — the legacy screens never had these components live in the same
request path, so there's no §-section to cite here. An external Charge Component posts
`Dr Suspense - Debit` / `Dr Suspense - Credit` against `Cr Commission` accounts; a caller that
also needs to bridge that through the Payment Component submits the raw amounts as
`suspenseBridge.debitEntries[]` / `creditEntries[]` (each `{ amount, currency, crossRate?,
sourceComponent?, balanceModule? }`) on the `POST /payment-instructions` body.
`domain/suspenseBridge.ts` expands each entry into its own `Cr Suspense - Debit` /
`Cr Suspense - Credit` leg — always posted at the entry's own full **gross** amount, per entry —
plus an FX Exchange pair for any currency that differs from the transaction currency
(`debitLegs[0].currency` by convention), so the settlement voucher balances **by currency**, not
just in aggregate. This expansion runs before step 1 (balance validation), so the generated legs
are already part of what V8 checks and already show up in the response's
`debitLegs`/`creditLegs`/`accountEntries` (`voucherType: SETTLEMENT`) — no separate response field
exists for them.

**v1.7.0/v1.7.1 — per-currency handling against the caller's own legs.** When a foreign-currency
entry's currency matches a real Payment Leg the caller ALSO submitted on the same side
(`debitEntries` against `debitLegs`, `creditEntries` against `creditLegs` — computed fully
independently per side), that leg affects how the FX Exchange pair for that currency is sized — but
**the two sides combine differently, and this is a deliberate accounting distinction, not an
inconsistency**, because of a pre-existing (v1.4.0) design decision that every Suspense bridge leg
lands on the credit side, unconditionally, regardless of which list it came from:

- `debitEntries` are OPPOSITE polarity from the always-credit bridge leg (debit legs are
  debit-direction) — they genuinely **NET**: `Net_C = (Σ that leg's own-currency amount) − (Σ gross
  Suspense in that currency)`. Net_C can land at exactly zero, meaning no FX conversion at all when
  a real leg exactly matches gross Suspense in that currency — sign otherwise decides the FX pair's
  direction.
- `creditEntries` are the SAME polarity as the always-credit bridge leg (credit legs are also
  credit-direction) — they can **never net against each other by subtraction**. Confirmed by
  accounting review against a worked example: "Credit Suspense EUR 100 and a real Credit Leg EUR
  100 do NOT offset — the EUR position is Credit EUR 200." They instead **COMBINE**:
  `Combined_C = (Σ that leg's own-currency amount) + (Σ gross Suspense in that currency)` — always
  ≥ 0, so the FX pair is *always* generated whenever either amount is non-zero, with a **fixed**
  direction (Debit the foreign currency, Credit the transaction currency) — there's no sign to flip.

Either way, the FX Exchange pair is generated **once per currency bucket** rather than once per
entry, and the Suspense leg(s) themselves are unaffected — still always posted gross, per entry,
always credit-direction (this is v1.7.1's correction: v1.7.0's initial implementation wrongly
treated both sides as netting, and wrongly flipped the Suspense bridge leg's own direction for
`creditEntries`). With no matching-currency leg on the matching side (the common case, and the
*entire* pre-v1.7.0 behavior for both lists — `Combined_C`/`Net_C` both degenerate to gross Suspense
when the matching leg total is zero), every foreign-currency bucket behaves byte-for-byte as it did
before v1.7.0. See `domain/suspenseBridge.ts`'s doc comments (particularly `buildNetFxExchangePairLegs`
and `expandSuspenseBridge`) for the full per-branch derivation, and its test file for a worked
example per branch, including the exact reviewer-confirmed credit-side example above.

**What this service does NOT do:** adjust any of the caller's own submitted leg amounts — netting/
combining only changes how large a NEW FX pair the server generates, never a caller-submitted leg's
own amount. `debitEntries` additions still, in aggregate (transaction-currency terms — this is
unaffected either way, see below), require the caller to increase its own debit total by the same
transaction-currency-equivalent amount before submitting (`Debit Leg #1 = Total + Σ debitEntries`,
using each entry's own GROSS trx-equivalent) or step 1 returns 409. `creditEntries` are meant to
pair with a caller-side *reduction* of an existing credit leg (`Credit Leg #1 = Total - Σ
creditEntries`). Neither adjustment is verified or performed here — see
`payment-instructions-post.yaml`'s `SuspenseBridge` schema description for the full contract.

This algorithm previously existed only client-side, inside the Business Case Simulator's
`business-case-runner.component.ts` (`suspenseBridgeLeg`/`fxExchangePairLegs`/`suspenseBridgeLegs`)
— that implementation is the validated source this module was ported from 1:1, moved server-side
(v1.4.0) so the balancing algorithm has exactly one implementation instead of one per future
caller. The Simulator still owns the "Leg #1 total adjustment" step above (a UI %-split/defaults
concern, not part of the balancing algorithm itself) and sends raw entries via `suspenseBridge`
instead of pre-computing the bridge/FX-pair legs itself. The client-side leg-allocator gained one
related UI change in v1.7.0: a foreign-currency row's amount can now be entered directly in that
row's own currency (`Account Ccy Equiv.`, `onAccountAmountInput` in `leg-allocator.component.ts`)
— needed so a user can literally type "this leg pays EUR 20" for the netting formula above to
compare against, rather than only being able to type a transaction-currency amount and let the
account-currency figure fall out of a rate multiplication.

**v1.7.3 (reverted by v1.7.4 below) — a real per-currency display gap exists, but is NOT fixable
by changing the client seed.** When a real Payment Leg exists in the SAME foreign currency as a
Suspense entry, summing settlement legs by their own displayed currency (not the transaction-
currency-pooled V8 aggregate) can show a genuine one-minor-unit gap: a EUR 100 Suspense entry
alongside a real EUR 100 leg converges to 216.62 + 108.31 = 324.93 if you naively add the leg's own
client-computed trx-equivalent to the Suspense leg's own trx-equivalent, vs. this service's actual
combined FX-pair conversion of `round(300 × rate) = 324.92` — a one-cent gap between two
independently-rounded representations of overlapping exposure, via two DIFFERENT rate directions
(the leg-allocator's own rate, from `onAccountAmountInput`'s division, vs. this service's
`crossRate`, from `resolveCrossRate`'s multiplication — not exact 6dp reciprocals of each other).
v1.7.3 briefly tried making the Simulator's seed formula mirror this service's own
`Net_C`/`Combined_C` combined-then-converted magnitude to close that gap. **This broke aggregate
V8 instead of fixing anything** — proved end-to-end: with the combined seed, the same EUR 100
Suspense + EUR 100 leg scenario produces a request where `Σ creditLegs.amountTxCcy` exceeds
`Σ debitLegs.amountTxCcy` by exactly 0.01, i.e. a real 409 `LEGS_UNBALANCED` in precisely the
scenario the fix targeted. **v1.7.4 reverts to the gross-only seed** (`Debit/Credit Leg #1 = Total ±
Σ entries`, each Suspense entry converted alone, blind to any live leg in the same currency) — this
is what this service itself already produces and accepts, because the generated FX Exchange pair's
two legs always carry the identical trx-equivalent on opposite sides and cancel out of aggregate V8
unconditionally, regardless of how that value was computed; the caller's own seed only ever needs
to offset the Suspense entries' OWN independently-rounded trx-equivalents, never a live leg's.
v1.7.4 also converts PER ENTRY rather than per currency-bucket, to mirror this service's own
`buildSuspenseBridgeLeg` exactly (a currency bucket with more than one entry could otherwise
disagree from this service's own per-entry sum by a minor unit). The per-currency display gap is
real but out of scope for a *seed-formula* fix specifically — closing it turned out not to need
unifying every leg/entry onto one shared rate direction after all; see v1.8.0 below for how it
actually gets closed, entirely server-side. This service's own domain logic (`suspenseBridge.ts`)
and this file's OAS contract are unchanged by either v1.7.3 or v1.7.4 — both were entirely Simulator
(client) changes.

**v1.7.5 — the seed formula's own summation could drift a binary-float ULP.** v1.7.4's per-entry
conversion summed each entry's already-rounded trx-equivalent as a plain JS number
(`total += trxEquivalent`). Summing multiple already-rounded decimal values as IEEE-754 doubles can
land one ULP off the canonical decimal sum even when every individual addend was correctly rounded —
reproduced: two entries independently rounding to 20330.42 and 13562.34 summed to a displayed total
of `"-33441.95999999999"` instead of the exact `"-33441.96"`. Fixed by accumulating in `Decimal.js`
end-to-end (both the per-entry conversion and the running total) and performing exactly one rounding
pass, in `Decimal`, immediately before the final Number/string conversion. No formula changed from
v1.7.4 — only the arithmetic representation used to compute it.

**v1.8.0 — the per-currency display gap closed, from the SERVER side, with a response-shape
change.** v1.7.3/v1.7.4/v1.7.5 established that the gap (leg-alone trx-equivalent vs. combined-then-
converted trx-equivalent disagreeing by a minor unit) could not be fixed by changing the *caller's*
seed formula without breaking aggregate V8. The actual fix turned out to live entirely in
`domain/suspenseBridge.ts`: instead of ONE FX Exchange pair per foreign-currency bucket, sized to a
netted/combined magnitude (`Net_C`/`Combined_C`, v1.7.0/v1.7.1), this service now generates up to
TWO independent, individually self-balancing pairs per bucket:

- a **Suspense pair** (`FX Exchange {ccy} - Suspense` / `FX Exchange {transactionCurrency} -
  Suspense` — new naming, suffixed even when no real leg coexists in that currency, so every
  Suspense-driven FX line is unambiguously self-descriptive on its own), sized to the SUM of the
  bucket's own Suspense bridge legs' already-rounded `amountTxCcy`, reused **verbatim** — always
  CREDIT-anchored, since the Suspense bridge leg is always credit-direction regardless of list.
- a **real-leg pair** (`FX Exchange {ccy}` / `FX Exchange {transactionCurrency}` — the plain,
  pre-v1.7.0 names, unchanged), sized to the SUM of the matching real legs' already-submitted
  `amountTxCcy`, reused **verbatim** — direction matches the list (a `debitEntries` bucket's
  matching `debitLegs` are debit-direction; `creditEntries`/`creditLegs` are credit-direction).
  Skipped entirely when no real leg exists in that currency (the common case).

Because each pair reuses an already-on-the-wire amount instead of re-deriving anything from a
combined magnitude, every currency now balances exactly — simultaneously with aggregate V8, which
was already guaranteed either way since both legs of every pair carry the identical `amountTxCcy`.
Confirmed against the exact scenario that exposed the gap: `CUST-ACC USD 10000`; `NOSTRO-ACC EUR
100` (`amountTxCcy 108.31`); `Suspense Credit EUR 200`; `NOSTRO-ACC2 USD 9675.07` (the caller's own
gross-only seed, unchanged since v1.7.4) — EUR debit `300` = EUR credit `300`, USD debit `10000` =
USD credit `10000`, aggregate `10324.93` = `10324.93`.

No netting/combining step — and therefore no `debitEntries`-vs-`creditEntries` asymmetry — is
needed anymore; each source (a real leg, or a currency's Suspense entries) is self-balancing on its
own, and balance is additive. One behavioral change worth flagging: the "exact cancellation" special
case (a real leg exactly matching gross Suspense in that currency) no longer skips the FX pair
entirely the way `Net_C = 0` did pre-v1.8.0 — both pairs still generate independently and still net
to the same zero incremental effect on the transaction currency once summed, just as four legs
instead of zero. This is a genuine **response-shape change** (more legs generated for a bucket with
both a Suspense entry and a matching real leg; new `- Suspense`-suffixed account names) — the
*request* contract (`SuspenseBridge`, `PaymentLegInput`, etc.) is entirely unchanged.

### Debit Payment Bridge (`debitLegsComponentBridge`, 2026-08-09; renamed from
`chargeComponentBridge` 2026-08-10)

**Business-requirement-confirmed, not legacy-traced.** A distinct usage pattern from the general
Balance/Charge Component bridge above: instead of a real leg and a Suspense entry being two
*independent* sources that happen to share a currency (the v1.8.0 model above), a
`debitLegsComponentBridge:true` request's `debitLegs` and `suspenseBridge.creditEntries` are the
**two halves of the same transaction** — `Dr Customer A/C` / `Cr Suspense - X`, with
`creditLegs` deliberately empty. The flag was renamed 2026-08-10 (from `chargeComponentBridge`)
because this same request shape — Payment Component posts only `debitLegs`, the entire credit
side is bridged out via `suspenseBridge.creditEntries` — is not charge-specific: it equally fits
a **Customer IBL Payment** (Import Bill Loan funding under a Buyer's Usance LC — a Loan Component
concept, distinct from the existing `balanceModule:'IBL'` "Import Bill Liability" tag above, and
NOT itself modeled by this microservice, same as the Charge Component isn't) collecting from the
customer and crediting `Suspense - IBL` instead of `Suspense - Credit`, or even both sources in
the same request. The Simulator's `iplc-issue-charge-bridge` business case (Charge-only) is the
first caller of this shape; see `lc-payment-wc/CLAUDE.md`'s "Charge Component ↔ Payment Component
boundary" for the Angular-side flag, `BusinessCaseConfig.debitLegsBridge`.

Because `creditLegs` is always empty in this mode, the v1.8.0 "real-leg pair" logic above —
which only ever compares a `creditEntries` bucket against the SAME-side `creditLegs` — can never
fire for it, and the unconditional gross-sized "Suspense pair" would generate FX Exchange entries
for every foreign-currency bucket regardless of whether `debitLegs` in that currency already
account for it (pure decoration when they do — no conversion is actually happening).

`expandSuspenseBridge` (`domain/suspenseBridge.ts`) instead computes, per foreign-currency
`creditEntries` bucket, **`diff = grossSuspenseAmount − matching debitLegs' native-currency
sum`** (both native-currency amounts; the transaction-currency side of `diff` is likewise
`suspenseTrxEq − matchingDebitLegs' own already-rounded amountTxCcy` — subtracting two figures
that are each ALREADY final/rounded/on-the-wire, never re-deriving one from a fresh rate
multiplication, the specific failure mode the v1.7.3 revert above describes):

- **`diff == 0`** (the debit legs in this currency exactly match the Suspense Credit bucket):
  **no FX pair at all** — just the plain `Cr Suspense - Credit {ccy}` leg, same treatment as the
  transaction-currency case.
- **`diff > 0`** (Suspense exceeds the matching debit legs — including the common case of no
  matching debit leg at all, where `diff` reduces to the full gross amount, byte-for-byte the
  v1.8.0 behavior above): a CREDIT-anchored pair, sized to just the shortfall.
- **`diff < 0`** (a real debit leg exceeds the Suspense bucket — e.g. partly funded by a surplus
  collected in a different currency): a DEBIT-anchored pair (opposite polarity from the case
  above), sized to just the excess.

Worked examples (transaction currency USD, EUR/USD rate 1.2), all verified end-to-end via
`confirmPaymentInstruction`:

| Scenario | `debitLegs` | Suspense Credit | Result |
|---|---|---|---|
| Exact match | USD 80+20, EUR 200 | USD 100, EUR 200 | No FX lines at all; `Dr CUST-ACC EUR 200` / `Cr Suspense - Credit EUR 200` balance by currency on their own |
| No matching leg | USD 340 (no EUR leg) | USD 100, EUR 200 | Full-gross FX pair (EUR 200 / USD 240) — identical to pre-existing v1.8.0 behavior |
| Partial coverage | USD 160, EUR 150 | USD 100, EUR 200 | FX pair sized to just EUR 50 / USD 60 (the residual), not the full EUR 200 / USD 240 |
| Debit exceeds | USD 88, EUR 210 | USD 100, EUR 200 | DEBIT-anchored FX pair sized to just EUR 10 / USD 12 (the excess) |

Every pair here is self-balancing by construction (adds the identical amount to both debit and
credit) regardless of how it's sized, so none of this ever affects whether aggregate V8 passes —
a genuine, unexplained mismatch (no compensating leg anywhere else in the request) still throws
409 `LEGS_UNBALANCED` exactly as before; sizing only changes the DISPLAYED magnitude. Gated
narrowly on `debitLegsComponentBridge:true` — every other request's FX-pair behavior (the v1.8.0
Suspense-pair-plus-real-leg-pair model above) is completely untouched. See
`test/unit/domain/suspenseBridge.test.ts`'s and `test/unit/domain/confirmPaymentInstruction.test.ts`'s
`debitLegsComponentBridge` describe blocks for the full test coverage of all four scenarios above.

The Simulator has a companion frontend fix for the same reason: its "Debit FX Conversion Pair"
display panel is unconditionally hidden for a debitLegsBridge case (2026-08-11,
business-requirement-confirmed — it's not needed for this case at all) — see
`lc-payment-wc/CLAUDE.md` for the fix and its history (it first netted per-currency against
`suspenseCreditEntries`, which still left gaps, before being simplified to a full hide).

**400 error attribution fixed (2026-08-11).** `debitLegsComponentBridge:true` with `creditLegs`
empty and `suspenseBridge.creditEntries` ALSO empty (or missing — reachable via a Confirm click
before any Suspense Credit row is entered, since `onConfirm()` doesn't gate on leg validity the
way the live preview does) always correctly 400'd, but the message blamed `creditLegs`
(`"creditLegs: creditLegs must contain at least 1 item"`) — misleading, since `creditLegs` is
never used in this mode at all. The `superRefine` in `requestSchema.ts` now attributes this case
to `suspenseBridge.creditEntries` instead: `"suspenseBridge.creditEntries: suspenseBridge.creditEntries
must contain at least 1 item when debitLegsComponentBridge is true — creditLegs is not used in
this mode"`. The exemption's trigger condition itself is byte-for-byte unchanged (same requests
pass/fail as before) — only which field a genuine failure reports. The ordinary (non-bridge)
`creditLegs`-empty case is unaffected and still blames `creditLegs` itself — see
`test/unit/validation/requestSchema.test.ts` for regression coverage of both directions.

### Credit Payment Bridge (`creditLegsComponentBridge`, 2026-08-12 — mirror image of Debit Payment Bridge)

**Business-requirement-confirmed, not legacy-traced.** The opposite half of the same idea: instead
of Payment Component collecting FROM the customer and crediting a Suspense bridge, a separate
upstream component (typically a Loan Component) generates the CREDIT-side funding obligation
through a Suspense account, and Payment Component performs the actual settlement TO the
beneficiary/Nostro account. A `creditLegsComponentBridge:true` request's `creditLegs` and
`suspenseBridge.debitEntries` are the two halves of the same transaction — `Dr Suspense - X` /
`Cr Nostro`, with `debitLegs` deliberately empty. Worked example — a Buyer's Usance LC:

```text
Loan Component (own books, not modeled here)
Dr IBL
    Cr Suspense - IBL

Payment Component (this service)
Dr Suspense - Debit      <- suspenseBridge.debitEntries
    Cr Nostro             <- creditLegs
```

Combined across both components: `Dr IBL / Cr Nostro`. Payment Component never duplicates the Loan
Component's own `Dr IBL / Cr Suspense - IBL` entries — its responsibility begins at `Dr Suspense -
Debit` and ends at the real Credit Legs. Mutually exclusive with `debitLegsComponentBridge` (see
"Mutual exclusivity" below). Account naming (reviewer-confirmed 2026-08-12): the Suspense leg uses
the existing generic **`Suspense - Debit`** account — NOT a literal `Suspense - IBL` account. As
with the Debit Payment Bridge's `Suspense - Credit`, `accountNo` is tied to which LIST an entry
came from (`buildSuspenseBridgeLeg`), not to a per-scenario name; which upstream component/product
a Suspense entry is for is metadata (`sourceComponent`), not a custom account name. The Simulator's
`iplc-usance-settlement-credit-bridge` business case (module IPLC) is the first caller of this
shape; see `lc-payment-wc/CLAUDE.md`'s dated entry for the Angular-side flag,
`BusinessCaseConfig.creditLegsBridge`.

**The core architectural change this required — not just a UI mirror.** Every other use of
`suspenseBridge` (the general Balance/Charge Component bridge above, AND
`debitLegsComponentBridge`) relies on a hard invariant: a `suspenseBridge`-generated leg ALWAYS
lands on the CREDIT side of the ledger, regardless of which list (`debitEntries`/`creditEntries`)
it came from (`buildSuspenseBridgeLeg`'s doc comment, unchanged). `debitLegsComponentBridge` never
needed to touch this — it uses `creditEntries`, whose desired posting direction (credit) already
matched. `creditLegsComponentBridge` uses `debitEntries` but needs a genuine **debit**-direction
posting (`Dr Suspense - Debit`) — the opposite of what the general pattern gives a
`debitEntries`-sourced leg. `expandSuspenseBridge` (`domain/suspenseBridge.ts`) now flips leg
placement (`isFlippedDebitSide`) specifically and only for `creditLegsComponentBridge:true` AND
`side === 'DEBIT'` — every other combination (the general pattern, and `debitLegsComponentBridge`
itself) keeps the original always-credit placement byte-for-byte. A flipped leg's rate field is
also relabeled `crBuyRate` → `drBuyRate` (response-shape correctness, matching `buildFxPair`'s own
DR/CR-tied convention for that field — nothing downstream branches on it today, but the wire
response should still describe the actual posting side accurately). `confirmPaymentInstruction.ts`
also needed a fix: `transactionCurrency` used to derive unconditionally from
`request.debitLegs[0]!.currency` — always safe before, since `debitLegs` was never empty for any
existing mode. It now falls back to `request.creditLegs[0]!.currency` when `debitLegs` is empty
(guaranteed non-empty by schema validation whenever it matters), and `debitLegsInput`'s ordering
gets the same FX-vs-Suspense split treatment `creditLegsInput` already had, since `bridge.debit`
can now carry real Suspense legs too, not just FX-pair legs.

**Diff-sized FX pair — mirrored, opposite anchor polarity.** `expandSuspenseBridge` gets a new
branch, `if (creditLegsComponentBridge && side === 'DEBIT')`, structurally identical to
`debitLegsComponentBridge`'s own branch but comparing against `creditLegs` (the opposite side) and
with anchor polarity flipped to match the Suspense leg's own new DEBIT-direction placement: `diff >
0` (Suspense exceeds the matching creditLegs) anchors DEBIT instead of CREDIT; `diff < 0`
(creditLegs exceed the Suspense bucket) anchors CREDIT instead of DEBIT. See
`test/unit/domain/suspenseBridge.test.ts`'s and `test/unit/domain/confirmPaymentInstruction.test.ts`'s
`creditLegsComponentBridge` describe blocks — every worked example from the Debit Payment Bridge
table above has a direct mirror there (exact match, no matching leg, partial coverage, credit
exceeds Suspense), all verified end-to-end.

**Mutual exclusivity.** `debitLegsComponentBridge` and `creditLegsComponentBridge` are mutually
exclusive — `requestSchema.ts`'s `superRefine` rejects a request with both true (400,
`creditLegsComponentBridge: "...are mutually exclusive..."`), before either per-field check runs.
Both true at once would mean Payment Component posts no real legs on EITHER side — the whole
instruction synthesized purely from `suspenseBridge` — which doesn't correspond to any described
business scenario. To bridge both a debit side and a credit side in one instruction, use the
general `suspenseBridge` mechanism directly (real `debitLegs` + `creditLegs` alongside
`suspenseBridge.debitEntries`/`creditEntries`) instead of either flag — that combined case is
already supported without them.

**400 error attribution, mirroring the debitLegsComponentBridge fix above.**
`creditLegsComponentBridge:true` with `debitLegs` empty and `suspenseBridge.debitEntries` ALSO
empty attributes the 400 to `suspenseBridge.debitEntries`, not `debitLegs` — same rationale as the
Debit Payment Bridge fix: `debitLegs` is never used in this mode, so blaming it would be
misleading. The ordinary (non-bridge) `debitLegs`-empty case is unaffected and still blames
`debitLegs` itself.

**Frontend companion fixes, mirroring the Debit Payment Bridge ones.** The Simulator hides Suspense
Credit entirely for a `creditLegsBridge` case (mirroring Suspense Debit's existing hide for
`debitLegsBridge`) and unconditionally hides the "Credit FX Conversion Pair" panel (mirroring the
2026-08-11 "Debit FX Conversion Pair" fix, applied proactively this time rather than after a
reported bug). The DEBIT `<app-leg-allocator>` also became conditionally rendered
(`*ngIf="debitLegsRequired"`) for the first time — which immediately hit the exact same NG9
template-reference-scoping issue `lc-payment-wc/CLAUDE.md`'s "Verification gap" entry already
documents for the CREDIT allocator, fixed the same way (`@ViewChild('debitAllocator')
debitAllocatorRef`, a `debitFxPairs` getter reading it instead of a template expression
referencing `#debitAllocator` directly).

**Settlement Vouchers display fix (2026-08-13, reviewer-provided worked example).**
`response-viewer.component.ts`'s client-side Posting View re-grouping had two latent breaks
specific to `creditLegsComponentBridge`: its `transactionCurrency` derivation assumed the first
settlement entry is always a real caller leg (broken once `debitLegsInput` could start with a
generated Suspense-Debit leg instead), and its section ordering unconditionally pushed "Suspense
Clearing" last (wrong once Suspense clearing could be debit-direction — the funding source, not a
trailing clearing step). Currency View also gained an explicit Debit-before-Credit sort within
each currency, no longer relying on Posting View's section order alone. See
`lc-payment-wc/CLAUDE.md`'s dated entry for the full fix and the exact worked example it closes.

### Settlement leg ordering (v1.7.2)

**Accounting-review best practice, not a correctness fix.** `debitLegs`/`creditLegs` (and therefore
the response's SETTLEMENT `accountEntries`, and the Settlement Vouchers table in the Simulator UI)
now order the generated FX Exchange pair as one adjacent Dr/Cr block:

```text
Normal Debit(s) -> FX Debit (last debit) -> FX Credit (first credit) -> Normal Credit(s) -> Suspense Credit
```

Reading debit and credit as one continuous table (which is how the Settlement Vouchers UI renders
them — all debits, then all credits), the FX Debit leg and its matching FX Credit leg land next to
each other, so a reviewer can confirm the conversion amount, rate, and per-currency balance at a
glance instead of hunting across the table for the matching leg. Implementation
(`confirmPaymentInstruction.ts`): bridge legs never land on debit except FX-pair legs (every
Suspense leg is credit-direction, unconditionally), so `bridge.debit` is pure FX and already lands
last simply by being appended after the caller's own `debitLegs`. `bridge.credit` mixes FX-pair legs
(`accountType: 'INTERNAL'`) with Suspense legs (`accountType: 'SUSPENSE'`) — these are split so the
FX ones are prepended *before* the caller's own `creditLegs`, and the Suspense ones are appended
*after* them. Purely an ordering change — no leg is added, removed, or has its own field values
changed; V8 balance validation, classification, and voucher description assembly are all
order-independent and unaffected (verified before implementing this).

### `sourceComponent` / `balanceModule` (v1.5.0) and the removal of §6.2/§6.3 (v1.6.0)

**Architecture decision, NOT legacy-traced.** A Balance Component (`IBL`/`EBL` sub-module) or
Charge Component that bridges through Suspense books ITS OWN leg on its own books — e.g. Balance
Component: `Dr IBL / Cr Suspense`. This service then only books its own offsetting leg, e.g.
`Dr Suspense / Cr Nostro`, as an **ordinary Settlement leg (§6.1)**.

As of v1.6.0 this service never generates a Charge or Liability Voucher entry **at all** —
`chargeContext`/`liabilityContext` and the §6.2/§6.3 generation code (`buildChargeVoucherEntry()`/
`buildLiabilityVoucherEntries()`) were removed entirely, along with the v1.5.0
`SUSPENSE_CONTEXT_CONFLICT` rule that used to guard against them coexisting with a
`sourceComponent`-tagged `suspenseBridge` entry — with the legacy path gone, there's nothing left
for that rule to conflict with. `sourceComponent`/`balanceModule` themselves are UNCHANGED: still
accepted on every `SuspenseEntry`, still pure provenance/audit metadata (which upstream component
owns the other leg), now simply with no server-side validation or processing consequence at all.
Any caller that genuinely still needs a §6.2/§6.3 posting independent of a Suspense bridge must be
handled outside this service.

## Known anomalies replicated (or not) from source

(The EPLC Liability Voucher `.valuee` typo and the RPFM `Settle Participant`
RTGS-on-IDR-branch anomaly, both previously documented here, applied to the
now-removed §6.3 Liability Voucher code — see git history for that content if
tracing pre-v1.6.0 Liability Voucher behavior.)

- **RTGS modeling (v1.3.0 design decision, not a source trace)**: RTGS is no
  longer a standalone `AccountType` value. Re-checked against source: nothing
  in the legacy codebase branches on RTGS differently from NOSTRO for either
  Dr/Cr classification (no such logic exists in legacy source at all — §2.3
  is a business-rule recap) or SWIFT message routing (message type is chosen
  purely by `payAdviceMsgType`/`payCoverMsgType`, never by `accountType`, and
  RPFM never reaches message generation regardless of account type — that's
  *why* it's GAP). RTGS is now `accountType: 'NOSTRO'` + the new
  `rtgsIndicator` flag, so it folds into `nostroXor` like any other Nostro
  leg while still resolving to its own voucher-description TypeChar (`'R'`,
  not NOSTRO's `'N'`) — see `types.ts`'s `AccountType` doc comment.

## V8 balance rule — why this service doesn't replicate `Debit_Chk_Total_Pct()` verbatim

The original screens checked each side independently against a shared
`CPYT_*_TTL_AMT_TTLCCY` field. The single-POST `PaymentInstructionConfirmRequest`
has no such field — only the two leg arrays. `domain/balanceValidation.ts`
therefore implements **V8** (exact equality between `Σ debitLegs[].amountTxCcy`
and `Σ creditLegs[].amountTxCcy`), which
Calculation & Validation §13.2 verified against a real FSD scenario
(§2.3.3: 800,020 == 800,000 + 20) rather than a hypothetical.

**Exact for every module (M-7, 2026-08).** The Confirm flow now requires EXACT Dr = Cr for **every**
`originModule`, RPFM included — the legacy RPFM ±0.01 auto-tolerance was removed (it was a
screen-level percentage-split slack, not a GL-posting rule). `RPFM_BALANCE_TOLERANCE` is retained
for reference only and no longer applied; `options.balanceTolerance` remains a deliberate per-call
escape hatch (defaults to 0). A genuine rounding residual should be posted to an explicit
rounding-difference leg, not tolerated (follow-up).

## Hardening review changes (2026-08)

Post-review fixes; each is unit-tested and keeps the suite at 100% coverage (**261 tests**,
`npm test`).

| Ref | File(s) | Change |
|---|---|---|
| **C-2** | `domain/confirmPaymentInstruction.ts`, `store/paymentInstructionStore.ts` | Payload-aware idempotency: a repeat on the same natural key with a **different** request payload now returns **409 `IDEMPOTENCY_KEY_CONFLICT`** instead of silently replaying the original; an identical resend still replays (200). A canonical SHA-256 fingerprint of the request is stored alongside the instruction (`findFingerprint`); it is a system/control field, not part of the OAS body. (H-1 — the concurrency race — is closed by the same production DB landing: `UNIQUE(...)` + atomic upsert comparing the fingerprint.) |
| **H-2** | `validation/requestSchema.ts`, `money.ts` | Submitted amounts are validated against the currency's minor units (Currency-API `decimals`): `amountTxCcy` vs the transaction currency, `amountAccountCcy` vs the leg currency, and each Suspense entry vs its own currency. Over-precision (e.g. `JPY 100.50`, `EUR 1.234`) → 400. A currency absent from the master is skipped (source-of-truth). |
| **H-3** | `domain/swiftMessages.ts`, `types.ts`, OAS `SwiftMessage` | 32A (settled, leg/account currency) and 33B (instructed, transaction currency) are no longer forced equal — they differ for a cross-currency payment (new `instructedCurrency` field carries 33B's currency); same-currency payments are unchanged. A gpi **UETR** (v4 UUID) is now populated on every message, shared by a leg's advice + its cover. (`serviceTypeId`/`isGpiMember` left as a config-driven follow-up.) |
| **M-1** | `validation/requestSchema.ts`, `money.ts` | Strictly-negative caller amounts (legs + Suspense entries) → 400. Direction is expressed by the Dr/Cr side; the only ledger "negative" is the FX Exchange (兌換) Dr/Cr side-swap, which the server generates on the opposite side with a positive amount, after validation. |
| **M-2** | `validation/requestSchema.ts`, `money.ts` | ExchangeRate must be **> 0**: zero is rejected (400); negative was already blocked by the ExchangeRate pattern (no leading sign). Applies to every rate field and Suspense `crossRate`. |
| **M-7** | `domain/confirmPaymentInstruction.ts`, `domain/balanceValidation.ts` | RPFM's automatic ±0.01 tolerance removed — exact Dr = Cr for all modules (see the V8 section above). |
