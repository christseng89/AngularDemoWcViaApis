# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo shape

This repository holds several **independent** trade-finance demo/prototype projects, each with its own
`package.json`, `node_modules`, and dev server — there is no shared root build. Always `cd` into the
relevant project before running any command.

| Directory | Tracked in git? | What it is |
|---|---|---|
| `lc-issue-angular/` | yes | Angular 17 + Formly demo for LC (Letter of Credit) **Issue** — charge calculation, balance/tolerance commission. |
| `lc-payment-wc/` | yes | Angular 17 demo for LC **Payment** journal entries + a Formly-driven Payment Component Business Case Simulator. Contains a nested, independently-versioned TypeScript microservice under `microservices/payment-component/`. |
| `lc-issue/` | **no (gitignored)** | Older, plain JS/HTML scratch version of the LC Issue demo (`lc-issue-demo*.html`, `gen-spec.js`). Superseded by `lc-issue-angular/`; treat as reference only, not a place to build new work. |
| `*.docx` at root | yes | MVV architecture design docs (LcIssueElement / BalanceComponent), bilingual EN/CN. |

Everything here revolves around **trade finance back-office domain logic**: LC issuance charge/commission
calculation, and payment-instruction confirmation (Dr/Cr voucher generation, SWIFT messaging) traced against
legacy source systems and formal spec documents (OAS YAML, FSD `.docx`, calculation-validation `.docx`).
When a module cites a spec section (e.g. "§5.4", "V8", "Rev. 2"), that citation is load-bearing — it points at
a source-of-truth document under `lc-payment-wc/analysis/`, not an arbitrary comment.

---

## `lc-issue-angular/` — LC Issue demo

Two-process dev setup: Angular app (port 4200) + Express mock backend (port 3001, proxied via `/api`).

```bash
cd lc-issue-angular
npm install
cd backend && npm install && cd ..

# Terminal 1
cd backend && npm start
# Terminal 2
npm start        # ng serve --open
```

- `backend/server.js` is the **source of truth** for all financial calculations and default form values
  (`GET /api/config/defaults`, `GET /api/fx/rates`, `GET /api/fx/rate/:from/:to`, `GET /api/applicant/:id`,
  `POST /api/charges/calc`) — nothing is computed client-side. FX rates, applicant spread tiers, and postage
  tables are hardcoded stand-ins for real feeds (FX feed, CRM, pricing engine); replace before any real use.
- `src/app/web-components/` — vanilla Custom Elements (`balance.element.ts`, `charge.element.ts`,
  `charge-grid.element.ts`, `payment.element.ts`, `payment-grid.element.ts`) wrapped for use inside the
  Angular/Formly shell (`src/app/features/lc-issue/`).
- No test runner is configured for this project (no `test` script in `package.json`).

## `lc-payment-wc/` — LC Payment demo + Payment Component microservice

**Three-process** dev setup — this app depends on two separate backends, not one:

| Process | Port | Serves |
|---|---|---|
| `ng serve` (this project) | 4200 | The Angular app itself |
| `backend/` (Express) | 3001 | Legacy Import/Export LC calculators (`/api/import/*`, `/api/export/*`, `/api/fx/rates`) — Import LC / Export LC tabs |
| `microservices/payment-component/` (Express/TS) | 3000 | `POST /payment-instructions` — the Payment Component Simulator tab |

`proxy.conf.json` forwards `/api/*` → `:3001` and `/payment-component/*` → `:3000`. If the microservice isn't
running, the Simulator tab's live preview 400s or hangs with no obvious hint — check the process before
assuming a bug.

```bash
cd lc-payment-wc
npm install
cd backend && npm install && cd ..
cd microservices/payment-component && npm install && cd ../..

npm run dev:all   # runs all three concurrently (concurrently, color-coded per process)
```

Or individually: `microservices/payment-component && npm run dev` (Terminal 1), `backend && npm start`
(Terminal 2), `npm start` i.e. `ng serve --open` (Terminal 3).

### Testing

```bash
npm test                    # jest, single run (Angular app — jest-preset-angular)
npm run test:coverage       # jest --coverage
```

To run a single test file/spec, pass a path or `-t` pattern straight through, e.g.
`npm test -- leg-allocator.component.spec.ts` or `npm test -- -t "30/70 split"`.

Coverage target for this project's jest suite: 100% statements/functions/lines, ~97% branches. Deliberately
excluded from `collectCoverageFrom` (see `jest.config.js`) rather than dragging the numbers down:
`business-case-runner.component.ts` (Formly/RxJS orchestration) and the vanilla Custom Elements under
`web-components/import|export/` — both need TestBed/DOM-level rendering tests as a separate follow-up.

The microservice has its own, separate Jest config (`microservices/payment-component/jest.config.js`):

```bash
cd lc-payment-wc/microservices/payment-component
npm run typecheck        # tsc --noEmit — checks src/ and test/
npm test                 # Jest unit suite (test/unit/), gated at 90% branches/functions/lines/statements
npm run test:regression  # replays the FSD-verified test vectors (§13) + one real HTTP smoke test — separate from and complementary to `npm test`, not superseded by it
npm run build             # tsc -p tsconfig.build.json → dist/
npm run dev               # node --watch -r ts-node/register src/server.ts — auto-restarts on save
```

If running the microservice some other way (e.g. plain `ts-node src/server.ts`), it will **not** auto-restart
on source changes — a stale process serving old behavior looks exactly like a new bug.

### Building the standalone Web Components bundle

```bash
cd lc-payment-wc
npm run build:wc     # emits dist/wc/lc-payment-wc.js (IIFE) and .esm.js
npm run watch:wc
```

Bundles the vanilla Custom Elements under `src/app/web-components/` (Import/Export LC tabs) framework-free
(no Angular, no zone.js), via `scripts/build-wc.mjs`. Open `dist/wc/index.html` against the mock backend on
`:3001` to try it standalone. The Payment Component Simulator is **not** part of this bundle — it's
Formly/Angular-dependent and only reachable through the full `ng serve` app.

### Source layout

- `src/app/features/lc-payment/` — app shell: three top-level tabs (Import LC / Export LC / Payment
  Component Simulator).
- `src/app/web-components/import/`, `.../export/` — vanilla Custom Elements for the legacy LC calculators,
  plus `shared.ts` (formatting helpers, customer/account mock data, the `/api` fetch wrapper).
- `src/app/payment-component/` — the Payment Component Simulator:
  - `business-case-registry.ts` — all 23 simulated business cases, each cited to source.
  - `leg-allocator.component.ts` — the %/amount/currency split grid, decimal.js-backed (30/70-split rounding
    is a known regression area).
  - `payment-component-api.service.ts` / `fx-rate.service.ts` — the two backend clients.
  - `business-case-runner.component.ts` — ties it all together (Formly/RxJS orchestration; not yet unit-tested).
- `backend/server.js` — mock calculation API for the legacy tabs, plus `GET /api/fx/rates`.
- `microservices/payment-component/` — the real Payment Component microservice the Simulator tab talks to;
  a separate Node/TypeScript project (own `package.json`, `jest.config.js`, README), nested here rather than
  promoted to the repo root.
- `docs/` — bilingual (EN/zh-TW) user manuals.
- `analysis/` — source-of-truth spec documents: `payment-instructions-post.yaml` (OAS), FSD and
  calculation-validation `.docx`, gap-analysis notes. Code comments citing "§N" or a named validation rule
  refer here.

#### `microservices/payment-component/` internals

TypeScript + Express + decimal.js (all monetary/rate arithmetic — the API uses decimal-string types, never
binary floats) + zod (request validation). Implements `POST /payment-component/v1/payment-instructions`
(all routes mounted under that prefix per the OAS `servers[0].url`) following the 5-step Confirm flow in
`PaymentComponent-Microservice-FSD-zh.docx` §5.4.

| Module | Formula section | Responsibility |
|---|---|---|
| `src/types.ts` | — | Types mirroring the OAS schema exactly |
| `src/money.ts` | §8.2 | Decimal-backed parse/format for monetary amounts/rates — the only module allowed to construct a `Decimal` from a wire string |
| `src/validation/requestSchema.ts` | — | zod schema; failures → 400 |
| `src/domain/balanceValidation.ts` | §3, V8 | Dr/Cr balance check |
| `src/domain/classification.ts` | §4 | Payment Component Identification Rule (Rev. 2) |
| `src/domain/voucherDescription.ts` | §5 | Per-leg `accountDesc` assembly |
| `src/domain/accountEntries.ts` | §6 | Settlement / Charge / Liability voucher streams |
| `src/domain/swiftMessages.ts` | §7 | SWIFT cross-field validation + message generation |
| `src/domain/confirmPaymentInstruction.ts` | §5.4 | Orchestrator, in source-verified execution order |
| `src/store/paymentInstructionStore.ts` | FSD §6.1 | Idempotency store — **in-memory, swap for a real DB before production** |

**Three request fields have no home in the official OAS** and are accepted as optional top-level JSON
extensions instead of invented OAS properties (`RequestExtensions` in `routes/paymentInstructions.ts`):
`sourceFunctionCode` (resolves the voucher-description prefix — `originModule` alone is ambiguous),
`chargeContext` (charge-grid amounts that depend on on-screen widget aggregation, not portable server logic),
and `liabilityContext` (module-specific screen fields the 6 per-module Liability Voucher formulas need). See
each domain module's doc comment and `analysis/Payment_Mapping_Functions.docx` §10 /
`Payment_Component_Calculation_Validation.docx` §12 before changing this contract.

**Known deliberate deviations from legacy source** (see the microservice README for full detail before
touching this logic):
- EPLC Liability Voucher credit-leg description: source has a `.valuee` typo that silently no-ops the credit
  leg's description; this service defaults to *correct* behavior. Pass
  `replicateEplcVoucherDescDefect: true` only if byte-for-byte legacy parity is explicitly required.
- RTGS is **not** a standalone `AccountType` (v1.3.0 design decision) — it's `accountType: 'NOSTRO'` +
  `rtgsIndicator: true`, still resolving to its own voucher-description TypeChar (`'R'`).
- `balanceValidation.ts` implements V8 (exact equality between `Σ debitLegs[].amountTxCcy` and
  `Σ creditLegs[].amountTxCcy`, optional tolerance) rather than replicating the legacy
  `Debit_Chk_Total_Pct()` screen check verbatim, because the single-POST request shape has no equivalent
  shared total field.
