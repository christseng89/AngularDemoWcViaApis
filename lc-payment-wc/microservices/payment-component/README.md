# Payment Component Service (Node.js / TypeScript)

Implements `POST /payment-instructions` from `payment-instructions-post.yaml`
v1.3.0, following the 5-step Confirm flow specified in
`PaymentComponent-Microservice-FSD-zh.docx` §5.4 and every formula traced in
`Payment_Component_Calculation_Validation.docx` (§3-§8).

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
| `src/domain/accountEntries.ts` | §6 | Settlement / Charge / Liability voucher streams |
| `src/domain/swiftMessages.ts` | §7 | SWIFT cross-field validation + message generation |
| `src/domain/confirmPaymentInstruction.ts` | §5.4 (all 5 steps) | Orchestrator, in source-verified execution order |
| `src/store/paymentInstructionStore.ts` | FSD §6.1 | Idempotency store — **in-memory, swap for a real DB before production** |
| `src/routes/paymentInstructions.ts`, `src/app.ts`, `src/server.ts` | — | HTTP wiring |
| `test/regression.ts` | Calc/Validation §13 | Re-runs the 6 FSD-verified scenarios (§2.3.2, §2.3.3, §6.5) through the actual code, plus one real HTTP round trip |

## Gaps against the official OAS — flagged, not silently guessed

Three inputs the traced source logic genuinely needs have **no corresponding
field in `PaymentInstructionConfirmRequest`** today. Rather than invent OAS
properties unilaterally, this service accepts them as optional top-level JSON
extensions on the POST body (validated separately from the strict OAS schema,
see `RequestExtensions` in `routes/paymentInstructions.ts`). Each is documented
in the relevant domain module and cross-referenced to where the gap was first
raised:

1. **`sourceFunctionCode`** (string) — resolves the `{MODULE}{FuncCode}`
   voucher-description prefix (§5). `originModule` alone is ambiguous: IPLC
   alone maps to two different prefixes depending on which of its 3 confirmed
   functions is calling. See `domain/voucherDescription.ts` and
   `Payment_Mapping_Functions.docx` §10 for the full prefix table and two
   still-unresolved FSD rows (EPLC Pay/Accept, EXCO SettlementAtMaturity) that
   require `voucherCodePrefixOverride` instead.

2. **`chargeContext`** (object, optional) — `SYT_CHG_VOUCHER()`'s amount
   formula depends on `Chg.Screen.*` widget aggregations over an on-screen
   charge grid, not portable server-side logic (§6.2/§12.2). Omit to skip
   Charge Voucher generation for a given instruction.

3. **`liabilityContext`** (object, optional, module-tagged) — the 6
   per-module Liability Voucher sub-formulas (§6.3.1-§6.3.6) need
   module-specific screen fields (`STL_AMT`, `LIAB_ACNO`, `MTHD_OF_ISS`, …)
   that `PaymentLegInput` doesn't carry. Omit for functions that correctly
   never produce a liability entry (EXCO — always; IMCO Pre-Payment/Payment
   D/P).

**Recommendation for a future OAS revision (v1.4.0 — v1.3.0 has since shipped,
for the unrelated RTGS remodel below):** promote these three to formal
`PaymentInstructionConfirmRequest` properties once the owning modules agree on
their exact shape — see the open items already logged in
`Payment_Component_Calculation_Validation.docx` §12 and
`Payment_Mapping_Functions.docx` §10.

## Known anomalies replicated (or not) from source

- **EPLC Liability Voucher credit-leg description** (`domain/accountEntries.ts`,
  `LiabilityVoucherContext` module `'EPLC'`): source has a `.valuee` typo
  (`TrxSys.js:5908`) that silently no-ops the credit leg's voucher
  description. This implementation defaults to **correct** behavior (sets it
  properly); pass `replicateEplcVoucherDescDefect: true` only if byte-for-byte
  legacy parity is explicitly required — see §11 (A1) of the Calculation &
  Validation doc for why this must be a deliberate choice, not a default.
- **RPFM `Settle Participant`**: the `RTGS`-on-IDR-branch anomaly documented in
  `Payment_Mapping_Functions.docx` §7.1 (A2) is a RPFM-side source issue, not
  something this service's `LiabilityVoucherContext` needs to special-case —
  RPFM is not yet one of the confirmed callers of this API (see FSD §8.4.2).
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
