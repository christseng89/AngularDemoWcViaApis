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
own Jest setup — see `jest.config.js`/`setup-jest.ts`/`tsconfig.spec.json`). 196 tests,
12 suites; `jest.config.js` enforces a **90% floor** (`coverageThreshold`) across
statements/branches/functions/lines for everything `collectCoverageFrom` tracks — `npm test`
fails the build if a change drops coverage below it. Current numbers:

| Metric | Coverage |
|---|---|
| Statements | 99.8% |
| Functions | 99.3% |
| Lines | 100% |
| Branches | 97.67% |

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
  component.ts` (ties it together, including the Suspense/Charge-Component
  accounting bridge — see that file's `suspenseBridgeLeg()`/
  `fxExchangePairLegs()` doc comments).
- `backend/server.js` — mock calculation API for the legacy tabs, plus
  `GET /api/fx/rates` (a small fixed USD/EUR/JPY/GBP/TWD table).
- `microservices/payment-component/` — the real Payment Component
  microservice the Simulator tab talks to; a separate Node/TypeScript project
  with its own `package.json`, `jest.config.js`, and `README.md` (nested here
  rather than at the repo root).
- `docs/` — bilingual (EN/zh-TW) user manuals.

## Suspense Debit / Suspense Credit — the Charge Component accounting bridge

**NOT FSD/OAS-sourced** — a Simulator-only extension, requested and validated independently
of the traced source, modeling the accounting bridge between an external "Charge Component"
(which books `Dr Suspense - Debit` / `Dr Suspense - Credit` against `Cr Commission` accounts)
and this Payment Component. Under **Unit Code**, each PASS case gets two `<app-suspense-entries>`
repeaters (`suspense-entries.component.ts`) — Suspense Debit and Suspense Credit, each an
optional list of `{amount, currency}` entries (multiple entries allowed per side, e.g. several
Charge-Component commission lines in different currencies).

```
Debit Leg #1  = Total Amount + Σ Suspense Debit entries  (Trx Equivalent)
Credit Leg #1 = Total Amount − Σ Suspense Credit entries (Trx Equivalent)
```

Every non-zero entry also becomes its own **real** `Cr Suspense - Debit` / `Cr Suspense - Credit`
leg — both land on the **credit** side (not one Dr/one Cr), which is what keeps the instruction
balanced with no extra logic: the Suspense Credit terms always cancel themselves out (self-pattern
for "pay less"), while Suspense Debit is the one term that changes the instruction's net size
(the "collect more" case). When an entry's own currency differs from the transaction currency, a
matching **FX Exchange** pair (`fxExchangePairLegs()`) is added too, so the voucher balances **by
each individual currency**, not just in transaction-currency-equivalent terms — see
`business-case-runner.component.ts`'s `suspenseBridgeLeg()`/`fxExchangePairLegs()`/
`suspenseBridgeLegs()` doc comments for the full worked derivation. These are ordinary
`PaymentLegInput` entries sent through the normal `debitLegs`/`creditLegs` arrays — no backend
changes were needed for this feature (`accountType: 'SUSPENSE'` and `'INTERNAL'` already existed
in the OAS).

This is a **different, separate mechanism** from the microservice's own
`suspensePassThrough` opt-in (see `microservices/payment-component/README.md`) — that one
predates this design, was never wired into `routes/paymentInstructions.ts`'s HTTP layer, and the
Simulator does not use it.
