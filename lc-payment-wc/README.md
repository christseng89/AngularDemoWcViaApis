# lc-payment-wc

Angular 17 web-components demo for LC Payment Journal accounting entries, plus
a Formly-driven **Payment Component Business Case Simulator** that talks to
the real `microservices/payment-component` service — a nested sub-project
under this folder, not a sibling of it (see the repo root `CLAUDE.md` for the
business context).

## Three-process dev setup

This app depends on **two separate backends**, not one — running just
`ng serve` is not enough to exercise every tab:

| Process | Port | What it serves |
|---|---|---|
| `ng serve` (this project) | 4200 | The Angular app itself |
| `backend/` (Express) | 3001 | The legacy Import/Export LC calculators (`/api/import/*`, `/api/export/*`, `/api/fx/rates`) — powers the **Import LC** / **Export LC** tabs and the FX-rate auto-fetch used by the Payment Component leg allocator |
| `microservices/payment-component/` (Express/TS) | 3000 | `POST /payment-instructions` and friends — powers the **Payment Component Simulator** tab. See its own README for details. |

`proxy.conf.json` forwards `/api/*` → `:3001` and `/payment-component/*` →
`:3000` so the Angular app can call both same-origin in dev. If the
microservice isn't running, the Simulator tab's live preview will just 400 or
hang with no obvious hint why — it's not currently running, not a bug.

### Start everything at once

```bash
npm install
cd backend && npm install && cd ..
cd microservices/payment-component && npm install && cd ../..

npm run dev:all
```

`dev:all` runs the microservice (`npm run dev`, ts-node — no build step), the
mock backend (`npm start`), and `ng serve` together via `concurrently`,
prefixed and color-coded per process. Stop with Ctrl+C.

### Start individually

```bash
# Terminal 1
cd microservices/payment-component && npm run dev

# Terminal 2
cd backend && npm start

# Terminal 3
npm start   # ng serve --open
```

## Building the standalone Web Components bundle

The vanilla Custom Elements under `src/app/web-components/` (used by the
Import/Export LC tabs) can also be bundled framework-free (no Angular, no
zone.js) for embedding in non-Angular pages:

```bash
npm run build:wc     # emits dist/wc/lc-payment-wc.js (IIFE) and .esm.js
npm run watch:wc      # same, in watch mode
```

Open `dist/wc/index.html` (copied from `demo/index.html`) against the mock
backend on :3001 to try it standalone. The Payment Component Simulator
(`src/app/payment-component/`) is **not** part of this bundle — it's
Formly/Angular-dependent and only reachable through the full `ng serve` app.

## Testing

```bash
npm test              # jest, single run
npm run test:coverage # jest --coverage
```

Jest + `jest-preset-angular` (a separate config from `microservices/payment-component`'s
own Jest setup — see `jest.config.js`/`setup-jest.ts`/`tsconfig.spec.json`). 197 tests,
12 suites; `jest.config.js` enforces a **90% floor** (`coverageThreshold`) across
statements/branches/functions/lines for everything `collectCoverageFrom` tracks — `npm test`
fails the build if a change drops coverage below it. Current numbers:

> **⚠ Run each project's tests from its own directory.** `npm test` from this
> (`lc-payment-wc/`) root only compiles `src/**`. But because the microservice lives
> under `microservices/payment-component/`, running the *microservice's* `npm test`
> from the wrong working directory (or otherwise letting the two `tsconfig`s cross)
> pulls `microservices/payment-component/test/**` into this project's stricter
> `tsconfig.spec.json` (which sets `noPropertyAccessFromIndexSignature`) — that fails
> `routes/paymentInstructions.ts` with TS4111 errors in 2 suites even though nothing
> is actually broken. Always `cd` into `microservices/payment-component` before running
> its Jest commands (below), and don't mix the two `node_modules`/configs.

| Metric | Coverage |
|---|---|
| Statements | 99.8% |
| Functions | 99.3% |
| Lines | 100% |
| Branches | 97.72% |

**Covered:** `leg-allocator.component.ts` (incl. RTGS-indicator threading, the
30/70-split rounding regression, `*ngFor` row-array stability), `suspense-entries.component.ts`
(the Suspense Debit/Credit repeater), `business-case-runner.component.ts` (the Formly/RxJS
orchestration component itself — direct instantiation + mocked services, same pattern as
leg-allocator, no TestBed needed; covers the Suspense/FX bridge-leg calculations, the real
debounced preview pipeline via `fakeAsync`/`tick`, and the onConfirm/runPreview API wiring),
`business-case-request.ts` (request mapping for all 6 `LiabilitySpec` kinds),
`business-case-fields.ts` (Formly field-group construction), `fx-rate.service.ts` /
`currency.service.ts` / `payment-component-api.service.ts` (all via `HttpClientTestingModule`),
`response-viewer.component.ts`, `web-components/shared.ts`, `business-case-registry.ts`
(data invariants), `payment-component.types.ts` (runtime const-object regression guards).

**Not yet covered — a separate follow-up:** the 9 vanilla Custom Elements under
`web-components/import|export/` and every component's own `.html` template need
TestBed/DOM-level rendering tests, which this project deliberately hasn't taken on; excluded
from `collectCoverageFrom` in `jest.config.js` rather than silently dragging the coverage
numbers down.

### Payment Component microservice (backend) tests

`microservices/payment-component/` has its own independent Jest setup (its own
`jest.config.js`, `node_modules`, and `tsconfig`) — it is **not** run by this project's
`npm test` and isn't part of the 196-test/90%-floor numbers above. Run it from inside
that directory:

```bash
cd microservices/payment-component
npm install
npm run typecheck        # tsc --noEmit — checks src/ and test/
npm test                 # Jest unit suite (test/unit/), gated at 90% branches/functions/lines/statements
npm run test:coverage    # same as `npm test`; explicit alias
npm run test:regression  # FSD-verified test vectors (§13) + an end-to-end HTTP smoke test
```

See `microservices/payment-component/README.md`'s "Running" section for what each
command covers in more detail.

## Source layout

- `src/app/features/lc-payment/` — the app shell: three top-level tabs
  (Import LC / Export LC / Payment Component Simulator).
- `src/app/web-components/import/`, `.../export/` — the vanilla Custom
  Elements for the legacy LC calculators, plus `shared.ts` (formatting
  helpers, customer/account mock data, the `/api` fetch wrapper).
- `src/app/payment-component/` — the Payment Component Simulator:
  `business-case-registry.ts` (all 23 simulated business cases, each cited to
  source), `leg-allocator.component.ts` (the %/amount/currency split grid,
  decimal.js-backed), `suspense-entries.component.ts` (the Suspense
  Debit/Credit repeater — NOT FSD-sourced, see below), `payment-component-api.service.ts` /
  `fx-rate.service.ts` (the two backend clients), `business-case-runner.
  component.ts` (ties it together, including building the v1.4.0
  `suspenseBridge` request field — see that file's `buildSuspenseBridge()`
  doc comment; the actual balancing algorithm itself now lives server-side,
  see below).
- `backend/server.js` — mock calculation API for the legacy tabs, plus
  `GET /api/fx/rates` (a small fixed USD/EUR/JPY/GBP/TWD table).
- `microservices/payment-component/` — the real Payment Component
  microservice the Simulator tab talks to; a separate Node/TypeScript project
  with its own `package.json`, `jest.config.js`, and `README.md` (nested here
  rather than at the repo root).
- `docs/` — bilingual (EN/zh-TW) user manuals.

## Suspense Debit / Suspense Credit — the Charge Component accounting bridge

**NOT FSD-sourced** (no legacy §-section covers it — the legacy screens never had both
components live in the same request path) but, as of **v1.4.0, a formal part of the OAS
contract** (`payment-instructions-post.yaml`'s `SuspenseBridge`/`SuspenseEntry` schemas). Models
the accounting bridge between an external "Charge Component" (which books `Dr Suspense - Debit` /
`Dr Suspense - Credit` against `Cr Commission` accounts) and this Payment Component. Under **Unit
Code**, each PASS case gets two `<app-suspense-entries>` repeaters (`suspense-entries.component.ts`)
— Suspense Debit and Suspense Credit, each an optional list of `{amount, currency}` entries
(multiple entries allowed per side, e.g. several Charge-Component commission lines in different
currencies).

```
Debit Leg #1  = Total Amount + Σ Suspense Debit entries  (Trx Equivalent)
Credit Leg #1 = Total Amount − Σ Suspense Credit entries (Trx Equivalent)
```

The Leg #1 seeding above is still a Simulator-only UI concern (`sideDefaults()` in
`business-case-runner.component.ts`) — it feeds `<app-leg-allocator>`'s starting total before any
%-split happens. The actual **balancing algorithm** — turning each Suspense entry into its own
`Cr Suspense - Debit` / `Cr Suspense - Credit` leg (both land on the credit side, which is what
keeps the instruction balanced with no further caller-side logic) plus a matching **FX Exchange**
pair leg when an entry's own currency differs from the transaction currency (so the voucher
balances **by each individual currency**, not just in transaction-currency-equivalent terms) — was
**moved server-side in v1.4.0** (`microservices/payment-component/src/domain/suspenseBridge.ts`,
ported 1:1 from this component's former `suspenseBridgeLeg()`/`fxExchangePairLegs()`/
`suspenseBridgeLegs()` methods, now removed). This component's own job today is just building the
raw `suspenseBridge: { debitEntries, creditEntries }` request field — see `buildSuspenseBridge()`'s
doc comment for the full picture, including what the server does and does not adjust on the
caller's behalf.

This superseded the microservice's earlier, orphaned `suspensePassThrough` opt-in (see
`microservices/payment-component/README.md`'s "verify a would-be extension point is actually
wired" note) — that one predated this design, was never wired into
`routes/paymentInstructions.ts`'s HTTP layer, and was removed rather than kept.
