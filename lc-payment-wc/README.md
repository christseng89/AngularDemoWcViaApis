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
own Jest setup — see `jest.config.js`/`setup-jest.ts`/`tsconfig.spec.json`). Current
coverage (142 tests, 10 suites):

| Metric | Coverage |
|---|---|
| Statements | 100% |
| Functions | 100% |
| Lines | 100% |
| Branches | 96.93% |

**Covered:** `leg-allocator.component.ts` (incl. RTGS-indicator threading, the
30/70-split rounding regression, `*ngFor` row-array stability), `business-case-request.ts`
(request mapping for all 6 `LiabilitySpec` kinds), `business-case-fields.ts` (Formly
field-group construction), `fx-rate.service.ts` / `currency.service.ts` /
`payment-component-api.service.ts` (all via `HttpClientTestingModule`),
`response-viewer.component.ts`, `web-components/shared.ts`, `business-case-registry.ts`
(data invariants), `payment-component.types.ts` (runtime const-object regression guards).

**Not yet covered — a separate follow-up:** `business-case-runner.component.ts` (the
Formly/RxJS orchestration component) and the 9 vanilla Custom Elements under
`web-components/import|export/` need TestBed/DOM-level rendering tests, which this
first pass deliberately didn't take on; both are excluded from `collectCoverageFrom`
in `jest.config.js` rather than silently dragging the coverage numbers down.

## Source layout

- `src/app/features/lc-payment/` — the app shell: three top-level tabs
  (Import LC / Export LC / Payment Component Simulator).
- `src/app/web-components/import/`, `.../export/` — the vanilla Custom
  Elements for the legacy LC calculators, plus `shared.ts` (formatting
  helpers, customer/account mock data, the `/api` fetch wrapper).
- `src/app/payment-component/` — the Payment Component Simulator:
  `business-case-registry.ts` (all 23 simulated business cases, each cited to
  source), `leg-allocator.component.ts` (the %/amount/currency split grid,
  decimal.js-backed), `payment-component-api.service.ts` /
  `fx-rate.service.ts` (the two backend clients), `business-case-runner.
  component.ts` (ties it together).
- `backend/server.js` — mock calculation API for the legacy tabs, plus
  `GET /api/fx/rates` (a small fixed USD/EUR/JPY/GBP/TWD table).
- `microservices/payment-component/` — the real Payment Component
  microservice the Simulator tab talks to; a separate Node/TypeScript project
  with its own `package.json`, `jest.config.js`, and `README.md` (nested here
  rather than at the repo root).
- `docs/` — bilingual (EN/zh-TW) user manuals.
