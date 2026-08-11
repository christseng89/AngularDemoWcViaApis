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

`lc-payment-wc/` has its own nested `CLAUDE.md` (auto-loaded by Claude Code whenever you're working inside
that directory) — it carries the Trade Finance/Payments solution-architect persona plus a growing log of
reviewer-confirmed architecture decisions for that project specifically, most centrally the
Charge/Balance Component ↔ Payment Component boundary (the `suspenseBridge` mechanism — see below) and a
planned-but-not-yet-implemented OAS structured Reference/Event model
(`docs/RDD-oas-reference-event-model.md`). That log records individual decisions (and their supersessions —
entries get renamed, extended, or removed outright as requirements change) in more granular, dated detail
than belongs here; treat entries marked "reviewer-confirmed"/"business-requirement-confirmed" there as
settled, don't re-litigate them without new information from the user, and check that file directly rather
than assuming a specific past decision is still current — it changes frequently.

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

Coverage target for this project's jest suite: 90% statements/branches/functions/lines (`coverageThreshold`
in `jest.config.js`) — `npm test` fails the build below it. Deliberately excluded from `collectCoverageFrom`
rather than dragging the numbers down: `business-case-runner.component.ts`'s own `.html` template, all of
`web-components/**` (the vanilla Custom Elements for the Import/Export LC tabs — need TestBed/DOM-level
rendering tests as a separate follow-up), and pure Angular bootstrap/DI wiring (`app.component.ts`,
`lc-payment.component.ts`). `business-case-runner.component.ts` itself (the Formly/RxJS orchestration
component) *is* covered — direct instantiation with mocked services, same pattern as `leg-allocator`, no
TestBed needed.

The microservice has its own, separate Jest config (`microservices/payment-component/jest.config.js`):

```bash
cd lc-payment-wc/microservices/payment-component
npm run typecheck        # tsc --noEmit — checks src/ and test/
npm test                 # Jest unit suite (test/unit/), gated at 90% branches/functions/lines/statements
npm run test:regression  # replays the FSD-verified test vectors (§13) + one real HTTP smoke test — separate from and complementary to `npm test`, not superseded by it
npm run build             # tsc -p tsconfig.build.json → dist/
npm run dev               # node --watch -r ts-node/register src/server.ts — auto-restarts on save
```

Same single-test syntax as above applies here too (`npm test -- <file-or--t-pattern>`).

If running the microservice some other way (e.g. plain `ts-node src/server.ts`), it will **not** auto-restart
on source changes — a stale process serving old behavior looks exactly like a new bug.

**Never let the two Jest configs cross.** Always `cd` into `microservices/payment-component` before running
its own Jest commands, and don't run it from `lc-payment-wc/` directly. If the microservice's `test/**` gets
pulled into `lc-payment-wc`'s own `npm test` run (wrong working directory, or otherwise mixing the two
`tsconfig`s), the app's stricter `tsconfig.spec.json` (`noPropertyAccessFromIndexSignature`) fails
`routes/paymentInstructions.ts` with TS4111 errors that look like a real break but aren't — nothing is
actually broken, the configs just got crossed.

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
  - `business-case-runner.component.ts` — ties it all together (Formly/RxJS orchestration; unit-tested via
    direct instantiation + mocked services, its `.html` template is the untested part).
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
| `src/domain/accountEntries.ts` | §6.1 | Settlement voucher stream (§6.2/§6.3 removed v1.6.0) |
| `src/domain/swiftMessages.ts` | §7 | SWIFT cross-field validation + message generation |
| `src/domain/confirmPaymentInstruction.ts` | §5.4 | Orchestrator, in source-verified execution order |
| `src/store/paymentInstructionStore.ts` | FSD §6.1 | Idempotency store — **in-memory, swap for a real DB before production** |

**One request field has no home in the official OAS** and is accepted as an optional top-level JSON
extension instead of an invented OAS property (`RequestExtensions` in `routes/paymentInstructions.ts`):
`sourceFunctionCode` (resolves the voucher-description prefix — `originModule` alone is ambiguous). See
`voucherDescription.ts`'s doc comment and `analysis/Payment_Mapping_Functions.docx` §10 before changing
this contract. (`chargeContext`/`liabilityContext` — the §6.2/§6.3 legacy extension fields — existed here
through v1.5.0; removed v1.6.0 along with §6.2/§6.3 Account Entry generation itself. A Balance/Charge
Component that bridges through Suspense now books its own Liability/Charge leg on its own books — see
the microservice README's "Balance/Charge Component ↔ Payment Component bridge" section for the full
version history. Current behavior (**v1.9.0**, superseding v1.7.0–v1.8.0): for each foreign-currency
bucket in a `suspenseBridge` entry, `domain/suspenseBridge.ts` generates **at most one** self-balancing
FX Exchange pair, not a caller-reconciled netted figure. A `creditEntries` bucket still gets up to two
independent pairs when a matching real credit leg coexists (a "Suspense pair", always credit-anchored,
plus a "real-leg pair") — a same-direction real leg is an independent exposure, not the same money. A
`debitEntries` bucket instead nets the Suspense amount against any matching-currency real `debitLegs`
first and emits only the residual (zero pair on an exact match — "Same Currency + Same Amount → Direct
Settlement → No FX Pair") — safe because a debit leg is opposite-direction from the (always-credit)
Suspense leg, i.e. genuinely the same money. `domain/suspenseBridge.ts`'s own top doc comment has the
full per-version history and the algebraic proof of why the two sides are treated asymmetrically; the
request contract itself (`SuspenseBridge`, `PaymentLegInput`) is unchanged throughout. Generated FX
Exchange pair(s) also read as one adjacent Dr/Cr block in debitLegs/creditLegs — Normal Debit(s) → FX
Debit → FX Credit → Normal Credit(s) → Suspense Credit — an accounting-review best practice, not a
correctness change.)

**Known deliberate deviations from legacy source** (see the microservice README for full detail before
touching this logic):
- RTGS is **not** a standalone `AccountType` (v1.3.0 design decision) — it's `accountType: 'NOSTRO'` +
  `rtgsIndicator: true`, still resolving to its own voucher-description TypeChar (`'R'`).
- `balanceValidation.ts` implements V8 (exact equality between `Σ debitLegs[].amountTxCcy` and
  `Σ creditLegs[].amountTxCcy`, optional tolerance) rather than replicating the legacy
  `Debit_Chk_Total_Pct()` screen check verbatim, because the single-POST request shape has no equivalent
  shared total field.
