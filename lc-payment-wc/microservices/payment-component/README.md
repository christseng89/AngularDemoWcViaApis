# Payment Component Service (Node.js / TypeScript)

Implements `POST /payment-instructions` from `payment-instructions-post.yaml`
v1.7.1, following the Confirm flow specified in
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
| `src/validation/requestSchema.ts` | — | zod schema for `PaymentInstructionConfirmRequest`; failures → 400 |
| `src/domain/balanceValidation.ts` | §3, V8 | Dr/Cr balance check |
| `src/domain/classification.ts` | §4 | Payment Component Identification Rule (Rev. 2) |
| `src/domain/voucherDescription.ts` | §5 | Per-leg `accountDesc` assembly |
| `src/domain/accountEntries.ts` | §6.1 | Settlement voucher stream (§6.2/§6.3 removed v1.6.0 — see below) |
| `src/domain/swiftMessages.ts` | §7 | SWIFT cross-field validation + message generation |
| `src/domain/confirmPaymentInstruction.ts` | §5.4 (all 5 steps) | Orchestrator, in source-verified execution order |
| `src/domain/suspenseBridge.ts` | — (v1.4.0, not legacy-traced) | Charge Component ↔ Payment Component accounting bridge, incl. v1.7.0 per-currency netting — see below |
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

## Balance/Charge Component ↔ Payment Component bridge (`suspenseBridge`, v1.4.0 / v1.5.0 / v1.7.0 / v1.7.1)

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
instead of pre-computing the bridge/FX-pair legs itself. That client-side seed formula is
**unaffected by v1.7.0/v1.7.1** — netting/combining only restructures which side of the ledger the
server's own generated legs land on for a given currency and how large the FX pair is; it never
changes how much, in aggregate transaction-currency terms, those legs are worth (the FX pair's two
legs always net to zero against each other in transaction-currency terms, regardless of how they're
sized or directed — this holds for both the debit-side Net_C and the credit-side Combined_C), so the
existing gross-buffer seed formula (`Debit Leg #1 = Total + Σ debitEntries`, converting each entry
at its own gross amount) remains correct without modification. The client-side leg-allocator gained
one related UI change in v1.7.0 though: a foreign-currency row's amount can now be entered directly
in that row's own currency (`Account Ccy Equiv.`, `onAccountAmountInput` in
`leg-allocator.component.ts`) — needed so a user can literally type "this leg pays EUR 20" for the
netting formula above to compare against, rather than only being able to type a transaction-currency
amount and let the account-currency figure fall out of a rate multiplication.

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
and `Σ creditLegs[].amountTxCcy`, with an optional tolerance), which
Calculation & Validation §13.2 verified against a real FSD scenario
(§2.3.3: 800,020 == 800,000 + 20) rather than a hypothetical.
