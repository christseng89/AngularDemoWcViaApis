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
| `lc-balance/` | yes | Angular 17 demo for the **Balance Component** — contingent-liability/on-balance-sheet ledger (BalanceContract/BalanceMovement) for LC, Shipping Guarantee, Acceptance/DPU, UPAS, Export Confirmation. Contains a nested TypeScript microservice under `microservices/balance-component/` and its own Node orchestrator under `backend/`. |
| `lc-issue/` | **no (gitignored)** | Older, plain JS/HTML scratch version of the LC Issue demo (`lc-issue-demo*.html`, `gen-spec.js`). Superseded by `lc-issue-angular/`; treat as reference only, not a place to build new work. |
| `lc-balance-new/` | **no (gitignored)** | A full, independent parallel copy of `lc-balance/` — own `package.json`/`angular.json`/`backend/`/`microservices/balance-component/` and its own nested `CLAUDE.md`. Not the tracked project; don't assume work done here is reflected in (or should be ported to) `lc-balance/` without checking with the user first. |
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
confirmed-but-not-yet-implemented OAS structured Reference/Event model (idempotency key design, `D-1`
through `D-N` in that file's own decision log — the standalone RDD note that once lived at
`docs/RDD-oas-reference-event-model.md` was later reverted; the same content is preserved in
`lc-payment-wc/docs/payment-component-expert-review.md` and inline in the decision-log entry itself, so
don't go looking for that path). That log records individual decisions (and their supersessions —
entries get renamed, extended, or removed outright as requirements change) in more granular, dated detail
than belongs here; treat entries marked "reviewer-confirmed"/"business-requirement-confirmed" there as
settled, don't re-litigate them without new information from the user, and check that file directly rather
than assuming a specific past decision is still current — it changes frequently.

`lc-balance/` has an analogous nested `CLAUDE.md` of its own (same solution-architect persona,
same "reviewer-confirmed" decision-log convention), covering the Balance Component's own domain model
(`InstrumentType`/`MovementStatus`/`ExposureNature`), balance-derivation direction table, Tolerance
conversion, off-balance-sheet exposure hardening (incl. the Present Docs Earmark), SHGT/Acceptance
redemption, and the Maker/Checker service-layer guards (re-ISSUE, tenor routing, SG issue cap,
idempotency) — check that file directly before touching anything under `lc-balance/`, same caveats
as above (entries supersede each other; don't assume a decision is still current without checking). It
does **not** have its own leg-allocator or an OAS Reference/Event model decision log (both are
`lc-payment-wc/`-specific — the Balance Component has no per-leg split grid, and no analogous D-1…D-N
idempotency-key redesign has been proposed for it); its design docs
(`analysis/COMMON-BalanceComponent-Design-zh.md`, an Export Confirmation Gap Analysis, `impl-spec-en.md`)
are cited by section number throughout the microservice's source but, like `lc-payment-wc/`'s reverted
RDD note, were never committed as files — the nested `CLAUDE.md`'s own decision log is the only
place that captures them.

Also relevant to trade finance accounting entries/exposure-transformation questions in general
(not tied to either project's specific code): the `cs-tf-balance-knowhow` skill.

---

## `lc-issue-angular/` — LC Issue demo

Two-process dev setup: Angular app (port 4200) + Express mock backend (port 3000, proxied via `/api`).

```bash
cd lc-issue-angular
npm install
cd backend && npm install && cd ..

# Terminal 1
cd backend && npm start        # or `npm run dev` for nodemon auto-restart on save
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
- `npm run build` (`ng build`) / `npm run watch` (`ng build --watch --configuration development`) exist
  but produce no reusable bundle the way `lc-payment-wc/`'s `build:wc` does — mainly useful for a
  production-config sanity check.
- No test runner is configured for this project (no `test` script in `package.json`), and no
  lint/format scripts either.

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
(Terminal 2 — or `npm run dev` there too, for nodemon auto-restart), `npm start` i.e. `ng serve --open`
(Terminal 3).

### Testing

```bash
npm test                    # jest, single run (Angular app — jest-preset-angular)
npm run test:coverage       # jest --coverage
```

`backend/` (the legacy Import/Export LC mock API) also has its own Jest suite, separate from both of the
above — `cd backend && npm test`.

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

Unlike most Angular projects, `lc-payment-wc/coverage/` (the `lcov-report/` HTML + `lcov.info`) is
**tracked in git, not gitignored** — running `npm test`/`npm run test:coverage` regenerates it, and
`git status` will then show those files as modified. That's expected, not a sign something broke.

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

`microservices/payment-component/test/curl-tests/` is a third, separate testing surface from the two Jest
suites above — hand-built curl requests (`run-cases.bat` + `requests/*.json`) that hit
`POST /payment-instructions` directly over HTTP with the microservice running, no assertions, no Angular/
Formly involved. Useful for manually exploring `suspenseBridge`/FX-pair behavior against a live server;
see `lc-payment-wc/Payment-Component-Suspense-FX-Test-Cases-zh.md` (Traditional Chinese) for the worked
examples it currently covers.

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
- `docs/` — bilingual (EN/zh-TW) user manuals, plus `docs/obsidian-payment-kb/` — a generated Obsidian
  vault reverse-engineering this microservice's business knowledge (domain concepts, business rules,
  payment/FX/accounting flows, decision tables, requirement→code→test traceability) out of source, APIs,
  and tests; start from `00-Home/Payment-Knowledge-Home.md`. **Gitignored** (root `.gitignore`'s
  `obsidian-payment-kb/` rule) — a local generated artifact, not tracked in git. A companion
  `docs/obsidian-payment-kb.zip` sits alongside it, untracked but NOT excluded by that rule (which only
  matches the directory) — an optional versioned-backup path nobody has opted into yet. See
  `lc-payment-wc/CLAUDE.md`'s own "Payment Knowledge Base (Obsidian)" section for its evidence-status
  convention (CONFIRMED/INFERRED/UNCLEAR/CONFLICT) and staleness caveat before trusting it over the code
  or this file's decision log.
- `analysis/` — source-of-truth spec documents: `payment-instructions-post.yaml` (OAS), FSD and
  calculation-validation `.docx`, gap-analysis notes. Code comments citing "§N" or a named validation rule
  refer here. The OAS file's own `info.version` field and changelog prose lag the actual implementation by
  one release at times (e.g. it can read `1.10.1` while `microservices/payment-component/package.json` is
  already at a later version with a schema change already reflected but not yet changelogged) — trust the
  microservice's own `package.json`/`README.md` for "what version is this" over the YAML's self-reported
  banner.

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

## `lc-balance/` — LC Balance Component demo

**Three-process** dev setup, same shape as `lc-payment-wc/`:

| Process | Port | Serves |
|---|---|---|
| `ng serve` (this project) | 4200 | The Angular app itself |
| `backend/` (Express) | 4300 | Node.js 中台 orchestrator — sequences calls into the microservice per a declarative Business Case Registry (Import/Export Cases, `backend/data/businessCases.js`) so the UI can run/replay a whole scenario in one click (`GET /api/business-cases`, `POST /api/business-cases/:id/run`) — the exact case count grows frequently, check `lc-balance/CLAUDE.md`'s own decision log for the current total rather than assuming a number here is still accurate |
| `microservices/balance-component/` (Express/TS) | 4100 | `POST /balance-movements` + `GET /balance-contracts/*` — the actual Balance Component ledger |

`proxy.conf.json` forwards `/api/*` → `:4300` and `/balance-component/*` → `:4100` (rewriting the prefix
away). Same failure mode as `lc-payment-wc/`: if a backend isn't running, the corresponding UI tab 400s
or hangs with no obvious hint — check the process before assuming a bug.

```bash
cd lc-balance
npm install
cd backend && npm install && cd ..
cd microservices/balance-component && npm install && cd ../..

npm run dev:all   # runs all three concurrently (concurrently, color-coded per process)
```

Or individually: `microservices/balance-component && npm run dev` (Terminal 1, `node --watch -r
ts-node/register src/server.ts` — auto-restarts on save), `backend && npm start` (Terminal 2), `npm
start` i.e. `ng serve --open` (Terminal 3).

### Testing

Unlike `lc-issue-angular/`, **all three processes have their own Jest suite here** — the Angular app and
`backend/` were bootstrapped later (jest-preset-angular / plain Jest respectively, mirroring
`lc-payment-wc/`'s own setup) specifically to close that gap. All three are gated at a **95%**
`coverageThreshold` (statements/branches/functions/lines) in their own `jest.config.js` — higher than
`lc-payment-wc/`'s 90% floor; a change that drops any of the four metrics below 95% in any of the three
fails `npm test`, and per `lc-balance/CLAUDE.md`'s own standing rule, all three must be re-run and
green (not just the one you touched) before a change counts as complete.

```bash
# Angular app (from lc-balance/)
npm test                    # jest — src/app/**/*.ts
npm run test:coverage       # jest --coverage
npx tsc -p tsconfig.app.json --noEmit   # typecheck (no dedicated "typecheck" npm script for this project)

# backend/ (中台 orchestrator)
cd lc-balance/backend
npm test
npm run test:coverage

# microservices/balance-component/
cd lc-balance/microservices/balance-component
npm run typecheck        # tsc --noEmit
npm test                  # Jest (test/unit/) — domain logic, schema, and full case-walkthrough tests
npm run test:coverage
npm run build              # tsc -p tsconfig.build.json → dist/
```

Same single-test syntax as `lc-payment-wc/` throughout (`npm test -- <file-or--t-pattern>`), and the same
**never let the two Jest configs cross** caveat applies between the Angular app and the microservice
(this project's `tsconfig.json` also sets `noPropertyAccessFromIndexSignature`) — always `cd` into
`microservices/balance-component` before running its own Jest commands.

`npm run lint` (eslint) and `npm run format:check` (prettier) exist in all three of this project's
sub-projects (Angular app, `backend/`, `microservices/balance-component/`) — baseline-only, not wired
into CI or `npm test`. Neither `lc-issue-angular/` nor `lc-payment-wc/` has equivalent scripts.

Coverage-tracking is inconsistent across this project's own three sub-projects, unlike `lc-payment-wc/`
(same "tracked in git, not gitignored" convention for the whole project): `microservices/balance-component/coverage/`
has its own `.gitignore` entry excluding it entirely. The Angular app's `coverage/` and `backend/coverage/`
are a middle case (2026-08-22) — `lc-balance/.gitignore` (a new file; this sub-project previously had none)
excludes only `**/coverage/lcov-report/` (the bulky generated HTML report, regenerated on every test run);
`lcov.info` (the compact text summary) stays tracked as before, so `git status` will still show it as
modified after a `test:coverage` run — that alone isn't a sign something broke, but a plain `lcov-report/`
diff should no longer appear. Don't assume the same behavior across all three.

The Angular app's test suite is split across multiple spec files per source file where the source is
large. `transaction-builder.component.ts` is still covered by four spec files
(`transaction-builder.component.spec.ts` for function/mode selection, `.actions.spec.ts` for
Maker/Checker action-dispatch wiring, `.gaps.spec.ts` for leftover getters/error branches, and
`.inquire.spec.ts` for Inquire Events wiring) — a holdover from when the component itself was much larger
(see Source layout below: it's now 436 lines, a thin orchestration layer, not a God Component), not a
project-wide pattern.

`lc-balance/Quality-report-balance.md` is a SonarQube-style static/structural code-quality review of
this project (bugs, vulnerabilities, code smells, duplication, coverage) with prioritized findings and a
remediation log — check it before assuming an area is unreviewed; it records what's already been fixed
(and what was deliberately deferred, and why) rather than needing to be re-derived from scratch.

`lc-balance/TODO.md` is the actual outstanding-work tracker for this sub-project — production gate
conditions (auth, Angular CVEs, SQLite locking), findings from any external BA/expert review, and other
known-but-not-yet-fixed items — kept append-only with dated resolution notes rather than deleted-and-
forgotten; check it, not just `Quality-report-balance.md`, before assuming something is unaddressed.

### Source layout

- `src/app/business-case-runner/` — runs a whole registered Business Case (via `backend/`'s
  orchestrator) with one click; `balance-case-api.service.ts` is its backend client.
- `src/app/transaction-builder/` — a lower-level form for posting individual `BalanceMovement`s
  straight against the microservice (`balance-component-api.service.ts`, `balance-component.model.ts`,
  `index-picker.component.ts`), bypassing the Business Case Registry. `balance-component-api.service.ts`
  exports a `BalanceMovement` interface mirroring the microservice's own `src/types.ts` shape by hand
  (kept in sync manually, same convention `balance-component.model.ts`'s own design-doc field tables
  already use) — every mutating/listing method is typed against it rather than `Observable<any>`.
  `transaction-builder.component.ts` was once this repo's single largest file (2,923 lines at its peak);
  a sequence of BAL-003 extractions logged in `lc-balance/CLAUDE.md` — most recently a
  "Feature Components + Facade" pilot moving Maker-side logic into `MakerPanelComponent` and Checker
  search/queue into `CheckerPanelComponent` — brought it down to **436 lines**, no longer even the
  largest file in this sub-project (`maker-panel.component.ts`, at 1,160 lines, is). It's now a thin
  orchestration/wiring layer: mode/function-side selection, wiring `MakerPanelComponent` ↔
  `CheckerPanelComponent` ↔ `LookUpPanelService` ↔ `InquireEventsService` together via signal/context
  objects, the Account Entries dialog's own open/close state, and the Checker action-dispatch methods
  (`release()`/`reject()`/`checkerAct()`/`deleteMakerPending()`/`acknowledgeArrival()`, each a thin call
  into `CheckerActionsService`) — no longer owns the 3 paginated pickers (now `CatalogPickerService`/
  `PickerSelectionService`) or the Maker `submit()` dispatch across all 14 named business functions (now
  `MakerPanelComponent`, via `MakerSubmitService`). Its ~30 API-calling methods still share one
  `describeApiError()` helper, extracted to close a duplication finding in `Quality-report-balance.md`.
- `backend/server.js` — the Node.js 中台 orchestrator; `backend/data/businessCases.js` is the
  declarative registry of Import/Export cases it replays.
- `microservices/balance-component/` — the real Balance Component microservice:
  - `src/service/balanceService.ts` — orchestrates the routes; `src/routes/balanceContracts.ts` /
    `balanceMovements.ts` are the two Express routers (contract lookup/catalog/balance/movements-history
    vs. movement post/release/reject/cancel/maker-submit — a maker-checker-style lifecycle per movement;
    the `acknowledge` endpoint that used to sit here was removed 2026-08-18 — B3 now uses the standard
    release path, see `lc-balance/CLAUDE.md`'s own decision log for the redesign).
  - `src/domain/` — `balanceDerivation.ts`, `tolerance.ts`, `statusTransition.ts`, `amendDecrease.ts`,
    `offBalanceExposure.ts` — the actual accounting/exposure logic, cited to
    `analysis/TF_Balance_Component_Spec-{en,zh}.docx` / `TF_Contingent_Liability_Lifecycle-{en,zh}.docx`
    the same way `lc-payment-wc/`'s microservice cites its own FSD.
  - `src/db/` — **Node's built-in `node:sqlite` (`DatabaseSync`)**, not `better-sqlite3` (this machine
    has no C++ build toolchain for native modules) — `':memory:'` for tests, a real file otherwise.
    `db/index.ts`'s own doc comment records a known limitation worth knowing before touching concurrency
    logic: SQLite locks at the whole-database-file level (even under WAL), so it cannot demonstrate true
    per-instrument (per-`logicalContractId`) non-blocking concurrency the way the design doc's §6
    requires — safe/over-conservative for this single-process prototype, but flagged as a **must-replace**
    (PostgreSQL row-level locking) before that requirement is actually validated in production.
  - `src/store/` — `balanceContractStore.ts` / `balanceMovementStore.ts`, the SQL-backed persistence
    layer the service reads/writes through.
- `analysis/` — source-of-truth spec documents: `balance-component-api.yaml` (OAS),
  `TF_Balance_Component_Spec-{en,zh}.docx`, `TF_Balance_Component_Mapping-{en,zh}.xlsx`,
  `TF_Contingent_Liability_Lifecycle-{en,zh}.docx`. Code comments citing a spec section refer here,
  same convention as `lc-payment-wc/analysis/`.
- `docs/obsidian-balance-kb-v3.2/` — a generated Obsidian vault mirroring `lc-payment-wc/docs/
  obsidian-payment-kb/`'s role for this project: reverse-engineers the Balance Component's business
  knowledge (703 notes — 206 business rules, 98 decision tables, 220 test scenarios) out of source,
  APIs, and tests, self-scored against a 9-dimension quality rubric; start from
  `00-Home/Balance-Knowledge-Home.md`. **Gitignored** (root `.gitignore`'s `obsidian-balance-kb*/`
  wildcard rule — covers this directory and any other `-vN` suffix). A companion
  `docs/obsidian-balance-kb-v3.2.zip` sits alongside it, untracked but NOT excluded by that rule (which
  only matches directories) — an optional versioned-backup path nobody has opted into yet. Supersedes an
  earlier unversioned `docs/obsidian-balance-kb/` vault (683 files, written in English) — that directory
  and its own companion zip have since been deleted from disk, not merely renamed; don't go looking for
  them. The current vault is written primarily in **Simplified Chinese**. See `lc-balance/CLAUDE.md`'s
  own "Balance Knowledge Base (Obsidian)" section for its evidence-status convention
  (CONFIRMED/INFERRED/UNCLEAR/CONFLICT) and staleness caveat before trusting it over the code or this
  file's decision log.
