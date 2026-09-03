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
| `lc-balance-wc/` | yes | Angular 17 demo for the **Balance Component** — contingent-liability/on-balance-sheet ledger (BalanceContract/BalanceMovement) for LC, Shipping Guarantee, Acceptance/DPU, UPAS, Export Confirmation. Contains a nested TypeScript microservice under `microservices/balance-component/` and its own Node orchestrator under `backend/`, plus a **Web Component packaging layer** on top — publishes the Transaction Builder/Business Case Runner UI as a framework-agnostic `<balance-component-app>` custom element with Angular/React/Vue adapters. Publishable npm package (`private: false`, an `exports` map, optional peerDependencies). Originally a duplicate of a sibling `lc-balance/` project; that sibling was deleted outright (commit `91a3229`, 2026-09-02) and this is now the only Balance Component project in the repo. |
| `lc-issue/` | **no (gitignored)** | Older, plain JS/HTML scratch version of the LC Issue demo (`lc-issue-demo*.html`, `gen-spec.js`). Superseded by `lc-issue-angular/`; treat as reference only, not a place to build new work. |
| `*.docx` at root | yes | MVV architecture design docs (LcIssueElement / BalanceComponent), bilingual EN/CN. |
| `SonarQube_instructions.md` | yes | A saved ad-hoc prompt for running a Docker-hosted SonarQube scan and saving the report — **stale**: it still targets the `lc-balance` folder (deleted in commit `91a3229`, 2026-09-02) and a `lc-balance/SonarQube-scan-report.md` output path. Retarget to `lc-balance-wc/` (and confirm the intended output path with the user) before acting on it verbatim. |
| `scratchpad_out*.md` at root | **no (gitignored)** | Ad-hoc scratch notes; `.gitignore`'s own `/scratchpad_out*.md` rule. |

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

`lc-balance-wc/` (the sole surviving Balance Component project — see the repo-shape table above) has an
analogous nested `CLAUDE.md` of its own (same solution-architect persona, same "reviewer-confirmed"
decision-log convention), covering the Balance Component's own domain model
(`InstrumentType`/`MovementStatus`/`ExposureNature`), balance-derivation direction table, Tolerance
conversion, off-balance-sheet exposure hardening (incl. the Present Docs Earmark), SHGT/Acceptance
redemption, and the Maker/Checker service-layer guards (re-ISSUE, tenor routing, SG issue cap,
idempotency) — check that file directly before touching anything under `lc-balance-wc/`, same caveats
as above (entries supersede each other; don't assume a decision is still current without checking). It
does **not** have its own leg-allocator or an OAS Reference/Event model decision log (both are
`lc-payment-wc/`-specific — the Balance Component has no per-leg split grid, and no analogous D-1…D-N
idempotency-key redesign has been proposed for it); its design docs
(`analysis/COMMON-BalanceComponent-Design-zh.md`, an Export Confirmation Gap Analysis, `impl-spec-en.md`)
are cited by section number throughout the microservice's source but, like `lc-payment-wc/`'s reverted
RDD note, were never committed as files — the nested `CLAUDE.md`'s own decision log is the only
place that captures them.

`lc-balance-wc/CLAUDE.md` is itself a leftover copy from a now-deleted sibling `lc-balance/` project's own
copy — it still opens with "本文件是 `lc-balance` 的仓库级开发入口" and its 常用命令/文档导航 sections
don't mention the Web Component layer at all (never reworded since the original duplication, and now
stale in a different way since the thing it was duplicated *from* no longer exists). Its cross-layer
business rules and decision-log content are still current (the underlying domain logic is untouched), but
for anything about the packaging layer itself, use the `## lc-balance-wc/` section below and
`lc-balance-wc/docs/web-component*.md` instead. Five more nested `CLAUDE.md` files have since been added
under `lc-balance-wc/` on top of this one (`src/app/transaction-builder/`, `microservices/balance-component/`
and its own `src/domain/`, `src/db/`, `test/` subdirectories) — read the nearest one before touching that
area; the `## lc-balance-wc/` section below lists what each covers rather than restating their content here.

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
  `docs/obsidian-payment-kb.zip` sits alongside it: the gitignore rule only matches the directory, so
  the zip is a plain file and is now committed (`cc1d077`, 2026-08-22) as a versioned backup — 354
  files at that snapshot; `git ls-files` confirms it's still tracked (verified 2026-08-31). It's opaque
  to `git diff`/`grep` and can't be browsed or `[[Wiki Link]]`-navigated on GitHub the way the unpacked
  vault can, so treat it as a backup, not a substitute for reading the vault directly. See
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

## `lc-balance-wc/` — Balance Component demo + Web Component packaging

Originally created as a duplicate of a sibling `lc-balance/` project (commit `d99bf31`, "Duplicate
lc-balance to lc-balance-ws" — note the commit message's own typo; the directory is `lc-balance-wc/`)
plus a Web Component packaging layer on top. `lc-balance/` was deleted outright in commit `91a3229`
("Remove lc-balance folder", 2026-09-02) — directory, its own nested `CLAUDE.md`, everything — so
`lc-balance-wc/` is now the **only** Balance Component project in this repo; nothing here duplicates a
still-living sibling anymore.

**Three-process** dev setup, same shape as `lc-payment-wc/`:

| Process | Port | Serves |
|---|---|---|
| `ng serve` (this project) | 4200 | The Angular app itself |
| `backend/` (Express) | 4300 | Node.js 中台 orchestrator — sequences calls into the microservice per a declarative Business Case Registry (Import/Export Cases, `backend/data/businessCases.js`) so the UI can run/replay a whole scenario in one click (`GET /api/business-cases`, `POST /api/business-cases/:id/run`) — the exact case count grows frequently, check `lc-balance-wc/CLAUDE.md`'s own decision log for the current total rather than assuming a number here is still accurate |
| `microservices/balance-component/` (Express/TS) | 4100 | `POST /balance-movements` + `GET /balance-contracts/*` — the actual Balance Component ledger |

`proxy.conf.json` forwards `/api/*` → `:4300` and `/balance-component/*` → `:4100` (rewriting the prefix
away). Same failure mode as `lc-payment-wc/`: if a backend isn't running, the corresponding UI tab 400s
or hangs with no obvious hint — check the process before assuming a bug.

There's a fourth, standalone microservice not part of the three-process setup above:
`microservices/business-days-mock/` (port 4500, `cd microservices/business-days-mock && npm start`) — a
minimal Taiwan-calendar `POST /business-days/add` mock originally built for the F1 proposal §13.5 "Auto
Close Grace Period" **Phase 2**. It is still **not** wired into `dev:all` and still not called over HTTP
by anything — `domain/autoCloseGracePeriod.ts`'s `addBusinessDays()` is still the unchanged Phase-1
weekend-only stand-in. Its `data/calendar.json` has since gained a second, unrelated consumer at build
time (not runtime) — see "Codegen runs before almost everything" below — but that doesn't make the mock
service itself "wired in"; don't conflate the two.

```bash
npm install
npm install --prefix backend
npm install --prefix microservices/balance-component

npm run dev:all   # runs all three concurrently (concurrently, color-coded per process)
```

Or individually: `microservices/balance-component && npm run dev` (Terminal 1, `node --watch -r
ts-node/register src/server.ts` — auto-restarts on save), `backend && npm start` (Terminal 2), `npm
start` i.e. `ng serve lc-balance-wc --open` (Terminal 3).

### Testing

Unlike `lc-issue-angular/`, **all three processes have their own Jest suite here**, all gated at a
**95%** `coverageThreshold` (statements/branches/functions/lines) in their own `jest.config.js` — higher
than `lc-payment-wc/`'s 90% floor; a change that drops any of the four metrics below 95% in any of the
three fails `npm test`, and per `lc-balance-wc/CLAUDE.md`'s own standing rule, all three must be re-run
and green (not just the one you touched) before a change counts as complete.

```bash
npm test                    # jest — src/app/**/*.ts (Angular app)
npm run test:coverage       # jest --coverage
npx tsc -p tsconfig.app.json --noEmit   # typecheck (no dedicated "typecheck" npm script for this project)

npm test --prefix backend                              # 中台 orchestrator
npm run test:coverage --prefix backend

npm run typecheck --prefix microservices/balance-component   # tsc --noEmit
npm test --prefix microservices/balance-component             # Jest (test/unit/) — domain logic, schema, full case-walkthrough tests
npm run test:coverage --prefix microservices/balance-component
npm run build --prefix microservices/balance-component        # tsc -p tsconfig.build.json → dist/
```

Same single-test syntax as `lc-payment-wc/` throughout (`npm test -- <file-or--t-pattern>`), and the same
**never let the two Jest configs cross** caveat applies between the Angular app and the microservice
(this project's `tsconfig.json` also sets `noPropertyAccessFromIndexSignature`) — always `cd` into
`microservices/balance-component` before running its own Jest commands directly (rather than `--prefix`).

`npm run lint` (eslint) and `npm run format:check` (prettier) exist in all three of this project's
sub-projects — baseline-only, not wired into CI or `npm test`. Neither `lc-issue-angular/` nor
`lc-payment-wc/` has equivalent scripts.

Coverage-tracking is inconsistent across this project's own three sub-projects, unlike `lc-payment-wc/`
(same "tracked in git, not gitignored" convention for the whole project): `microservices/balance-component/coverage/`
has its own `.gitignore` entry excluding it entirely. The Angular app's `coverage/` and `backend/coverage/`
are a middle case — `lc-balance-wc/.gitignore` excludes only `**/coverage/lcov-report/` (the bulky
generated HTML report, regenerated on every test run); `lcov.info` (the compact text summary) stays
tracked, so `git status` will still show it as modified after a `test:coverage` run — that alone isn't a
sign something broke, but a plain `lcov-report/` diff should no longer appear. Don't assume the same
behavior across all three.

The Angular app's test suite is split across multiple spec files per source file where the source is
large. `transaction-builder.component.ts` is covered by four spec files
(`transaction-builder.component.spec.ts` for function/mode selection, `.actions.spec.ts` for
Maker/Checker action-dispatch wiring, `.gaps.spec.ts` for leftover getters/error branches, and
`.inquire.spec.ts` for Inquire Events wiring) — a holdover from when the component itself was much larger
(see Source layout below), not a project-wide pattern.

`Quality-report-balance.md` is a SonarQube-style static/structural code-quality review of this project
(bugs, vulnerabilities, code smells, duplication, coverage) with prioritized findings and a remediation
log — check it before assuming an area is unreviewed; it records what's already been fixed (and what was
deliberately deferred, and why) rather than needing to be re-derived from scratch.

`TODO.md` is the actual outstanding-work tracker for this sub-project — production gate conditions
(auth, Angular CVEs, SQLite locking), findings from any external BA/expert review, and other
known-but-not-yet-fixed items — kept append-only with dated resolution notes rather than
deleted-and-forgotten; check it, not just `Quality-report-balance.md`, before assuming something is
unaddressed.

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
  a sequence of BAL-003 extractions logged in `lc-balance-wc/CLAUDE.md` — most recently a
  "Feature Components + Facade" pilot moving Maker-side logic into `MakerPanelComponent` and Checker
  search/queue into `CheckerPanelComponent` — brought it down to 436 lines before subsequent feature work
  grew it back further; it's still not the largest file in this sub-project — `maker-panel.component.ts`
  is. Both counts drift often and this directory has kept growing (inquire-events, maker-queue,
  inquire-delete-pending, maker-action-bar, and several policy/strategy modules have all been added
  since); treat exact line counts as approximate. `transaction-builder.component.ts` remains a thin
  orchestration/wiring layer, not a God Component again: mode/function-side selection, wiring
  `MakerPanelComponent` ↔ `CheckerPanelComponent` ↔ `LookUpPanelService` ↔ `InquireEventsService`
  together via signal/context objects, the Account Entries dialog's own open/close state, and the
  Checker action-dispatch methods (`release()`/`reject()`/`checkerAct()`/`deleteMakerPending()`/
  `acknowledgeArrival()`, each a thin call into `CheckerActionsService`) — no longer owns the 3 paginated
  pickers (now `CatalogPickerService`/`PickerSelectionService`) or the Maker `submit()` dispatch across
  all 17 named business functions (now `MakerPanelComponent`, via `MakerSubmitService`). Its
  API-calling methods still share one `describeApiError()` helper, extracted to close a duplication
  finding in `Quality-report-balance.md`. This directory has its own nested `CLAUDE.md` (see below) —
  read it before touching any file in here.
- `src/app/balance-account-maintenance/` — new since the `lc-balance/` fork: see "Balance Account Number
  Maintenance" below.
- `src/app/core/http-retry/` — new since the fork: see "HTTP retry policy" below.
- `backend/server.js` — the Node.js 中台 orchestrator; `backend/data/businessCases.js` is the
  declarative registry of Import/Export cases it replays.
- `microservices/balance-component/` — the real Balance Component microservice (its own nested
  `CLAUDE.md`, plus deeper ones under `src/domain/` and `src/db/` — see below):
  - `src/service/balanceService.ts` — orchestrates the routes; `src/routes/balanceContracts.ts` /
    `balanceMovements.ts` are the two Express routers (contract lookup/catalog/balance/movements-history
    vs. movement post/release/reject/cancel/maker-submit — a maker-checker-style lifecycle per movement;
    the `acknowledge` endpoint that used to sit here was removed 2026-08-18 — B3 now uses the standard
    release path, see `lc-balance-wc/CLAUDE.md`'s own decision log for the redesign).
  - `src/domain/` — `balanceDerivation.ts`, `tolerance.ts`, `statusTransition.ts`, `amendDecrease.ts`,
    `offBalanceExposure.ts`, `balanceAccountMapping.ts`, `domesticCalendar.ts` (new — see below), and
    others — the actual accounting/exposure logic, cited to `analysis/TF_Balance_Component_Spec-{en,zh}.docx`
    / `TF_Contingent_Liability_Lifecycle-{en,zh}.docx` the same way `lc-payment-wc/`'s microservice cites
    its own FSD. Has its own nested `CLAUDE.md` (pure-function/no-I/O boundary, plus a responsibility map
    of existing domain files — check it before adding a new one so you don't duplicate an existing formula).
  - `src/db/` — **Node's built-in `node:sqlite` (`DatabaseSync`)**, not `better-sqlite3` (this machine
    has no C++ build toolchain for native modules) — `':memory:'` for tests, a real file otherwise.
    `db/index.ts`'s own doc comment records a known limitation worth knowing before touching concurrency
    logic: SQLite locks at the whole-database-file level (even under WAL), so it cannot demonstrate true
    per-instrument (per-`logicalContractId`) non-blocking concurrency the way the design doc's §6
    requires — safe/over-conservative for this single-process prototype, but flagged as a **must-replace**
    (PostgreSQL row-level locking) before that requirement is actually validated in production. Has its
    own nested `CLAUDE.md` (schema/migration rules).
  - `src/store/` — `balanceContractStore.ts` / `balanceMovementStore.ts`, the SQL-backed persistence
    layer the service reads/writes through.
  - `test/` — its own nested `CLAUDE.md` covers microservice test conventions.
- `analysis/` — source-of-truth spec documents: `balance-component-api.yaml` (OAS, at v1.45.0 as of the
  Balance Account Number Maintenance work — see below), `TF_Balance_Component_Spec-{en,zh}.docx`,
  `TF_Balance_Component_Mapping-{en,zh}.xlsx`, `TF_Contingent_Liability_Lifecycle-{en,zh}.docx`. Code
  comments citing a spec section refer here, same convention as `lc-payment-wc/analysis/`.
- `docs/obsidian-balance-kb-v3.2/` — a generated Obsidian vault mirroring `lc-payment-wc/docs/
  obsidian-payment-kb/`'s role for this project: reverse-engineers the Balance Component's business
  knowledge (~700+ notes covering business rules, decision tables, and test scenarios — the exact count
  grows as the vault regenerates, don't treat any specific number as current) out of source,
  APIs, and tests, self-scored against a 9-dimension quality rubric; start from
  `00-Home/Balance-Knowledge-Home.md`. **Tracked in git**, unlike `lc-payment-wc/`'s own
  `obsidian-payment-kb/` — root `.gitignore` has an `obsidian-balance-kb*/` wildcard rule that would
  cover this directory, but that line is commented out, so all files in it are committed and `git status`
  will show them as modified whenever the vault regenerates. Don't assume this is gitignored without
  re-checking `.gitignore` first. See `lc-balance-wc/CLAUDE.md`'s own "Balance Knowledge Base (Obsidian)"
  section for its evidence-status convention (CONFIRMED/INFERRED/UNCLEAR/CONFLICT) and staleness caveat
  before trusting it over the code or this file's decision log.

### Codegen runs before almost everything — `prepare:app`

`package.json`'s `pretest`/`prebuild`/`prebuild:wc`/`prestart`/`prewatch`/`predev:all` hooks all run
`npm run prepare:app` (`generate:calendar && generate:config`) first, so `npm test`, `npm run build`,
`npm start`, and `npm run dev:all` silently regenerate two files before doing anything else:

- `scripts/generate-runtime-config.mjs` reads `.env` (falling back to defaults: 3 retries, 250ms initial /
  2000ms max backoff, 15 recovery retries every 2000ms) and writes
  `src/app/core/http-retry/http-retry.config.generated.ts` — a **build-time** constant, not a per-instance
  DOM property. Changing `.env` requires re-running this (or any of the hooks above) and, for the Web
  Component bundle specifically, a rebuild — a stale `dist/` won't pick up a new `.env` on its own.
- `scripts/generate-domestic-calendar.mjs` copies `microservices/business-days-mock/data/calendar.json`
  verbatim into two generated files: `src/app/transaction-builder/domestic-holidays.generated.ts` and
  `microservices/balance-component/src/domain/domesticHolidays.generated.ts`. This feeds a different
  feature than the mock service's original purpose — A1/B1 Expiry Date domestic-holiday validation
  (`domain/domesticCalendar.ts`, added 2026-08-26) — via a build-time codegen copy, never a live HTTP call
  to the mock service; the microservice's own `prebuild`/`pretest` re-run this independently (its own
  script at `../../scripts/generate-domestic-calendar.mjs`), so the two generated copies can't drift as
  long as both projects' hooks run.
- Both generated files are marked "generated, do not edit by hand" in their own header comment.

### New since the `lc-balance/` fork: Balance Account Number Maintenance

`src/app/balance-account-maintenance/` — a searchable/filterable index + single-record detail editor for
the fixed two-account (`accountA`/`accountB`, shown to users as Contingent Liability / Liability) routing
table used by every Instrument Type × Tenor/Risk Class combination; users can edit Account Number/
Description but can't add or remove routes. Reachable at the `balance-accounts` route (`app.routes.ts`)
ahead of Transaction Builder and Business Case Runner, and surfaced identically inside
`<balance-component-app>`. `balance-account-maintenance-api.service.ts` is its client; SQLite
`balance_account_mappings` is the sole runtime source of truth (the JSON seed at
`microservices/balance-component/config/balance-account-mappings.json` only seeds an empty DB, never
overwrites a maintained value); each transaction snapshots the mapping it used into
`contingentAccountEntry` at creation/Fix-Pending time, so editing a mapping never rewrites historical
vouchers. Optimistic concurrency via a required `expectedVersion` on PUT (`409
ACCOUNT_MAPPING_VERSION_CONFLICT` on a stale write). Full detail:
`docs/balance-account-number-maintenance.md`.

### HTTP retry policy

`src/app/core/http-retry/http-retry.interceptor.ts`, config generated as described above. Retries only
`GET`/`HEAD`/`OPTIONS` on network failure, `408`, `429`, or `5xx` — `POST` commands (Submit, Release,
Approve, Fix Pending, Delete Pending, Cleanup Database) are never auto-retried, since the UI doesn't
assume every Balance command is idempotent. Business Case Runner's post-Cleanup backend-recovery probe is
a separate, lower-frequency mechanism that deliberately bypasses the global fast-retry interceptor to
avoid two retry layers stacking. Full policy, `.env` keys, and the safety-boundary rationale:
`docs/http-retry-policy.md`.

### Directory-level `CLAUDE.md` files

Beyond `lc-balance-wc/CLAUDE.md` itself (see the intro paragraphs above — it's a leftover copy from the
deleted `lc-balance/` sibling, still current for cross-layer business rules/decision log, not for the
packaging layer), five more nested `CLAUDE.md` files exist — read the nearest one before touching that
area rather than relying on this section:

- `src/app/transaction-builder/CLAUDE.md` — Angular Maker/Checker UI ownership boundaries (Components
  display/coordinate only; cross-Function differences belong in `function-strategy.ts`/`function-policy.ts`/
  `builder-fields.ts`/`submit-rules.ts`, not template conditionals).
- `microservices/balance-component/CLAUDE.md` — the microservice's layering rules (`routes/` → `service/` →
  `domain/` → `store/`/`db/`) and server-side-authority checklist.
- `microservices/balance-component/src/domain/CLAUDE.md` — pure-function/no-I/O boundary for domain logic,
  plus a responsibility map of existing domain files.
- `microservices/balance-component/src/db/CLAUDE.md` — SQLite/schema/migration rules.
- `microservices/balance-component/test/CLAUDE.md` — microservice test conventions.

### The Web Component itself

Built up incrementally across six phases logged in `docs/plans/2026-08-31-web-component-phase-{1..6}.md`.

`src/web-component.ts` + `src/app/web-component/` wrap the existing `TransactionBuilderComponent`/
business-case-runner UI as a single `<balance-component-app>` custom element (Angular Elements,
`ViewEncapsulation.ShadowDom`, its own bundled `styles.css` loaded into the shadow root before the first
view activates):

- **Config contract** (`balance-component-element.contract.ts`): `{ version: '1', initialView?:
  'transaction-builder' | 'business-cases', theme?: 'system' | 'light' | 'dark' }` — set as a DOM
  property, never serialized to an attribute. `theme: 'system'` (the default) tracks
  `prefers-color-scheme` live via a `MediaQueryList` listener.
- **Imperative API**: `element.navigate(view)` / `element.refresh()` return Promises. The outer custom-
  element class and the inner Angular component are bridged via a `balance-component-element.command.ts`
  `CustomEvent` (resolve/reject carried in the event detail) rather than reaching into Angular internals
  from outside the zone.
- **Events**: `balance-ready`, `balance-navigation`, `balance-refresh`, `balance-error` (typed `code`s
  incl. `INVALID_CONFIG`, `VIEW_LOAD_FAILED`, `STYLESHEET_LOAD_FAILED`, `ELEMENT_NOT_CONNECTED`, each
  carrying an `operation` field so a host can tell which call failed).
- **Styling**: a documented `--balance-color-*`/`--balance-font-*`/`--balance-radius` CSS custom-property
  token list (`docs/web-component-styling.md`) lets a host restyle the shadow content without piercing
  encapsulation.
- **Framework adapters** (`src/adapters/`): `adapter-core.ts` centralizes config/event wiring and the
  `navigate`/`refresh` handle shared by every binding; `adapters/angular/`, `adapters/react/`,
  `adapters/vue/` are thin per-framework mount/lifecycle glue over that core. React and Vue are taken as
  an injected runtime parameter rather than imported directly, so the package carries no hard react/vue
  dependency — both are optional `peerDependencies` alongside `@angular/core`.

### Build, package, and verify

```bash
npm run build:wc          # ng build balance-component-wc → dist/balance-component-wc (the element itself)
npm run build:adapters    # tsc -p tsconfig.adapters.json → dist/adapters
npm run release:prepare   # build:wc + build:adapters + release:manifest (asset-manifest.json); also runs as `prepack`
npm run release:verify    # scripts/verify-release.mjs — checks every package.json `exports` entry actually resolves
npm run docs:verify       # scripts/validate-wc-docs.mjs — structure/links/OAS-route coverage across docs/web-component*.md
npm run e2e               # playwright test — e2e/framework-hosts.spec.ts drives real Angular/React/Vue host pages
                           # against the built element in system Chrome (playwright.config.ts uses channel: 'chrome',
                           # not a Playwright-managed browser download)
```

`package.json` is `private: false` with an `exports` map (`./wc`, `./wc/styles.css`, `./manifest`,
`./contract`, `./adapters`, `./adapters/angular`, `./adapters/react`, `./adapters/vue`) pointing at the
built `dist/` output — don't hand-edit those paths without re-running `release:verify` afterward.
`release:prepare`/`build:wc`/`build:adapters` all inherit the `prepare:app` codegen step above via their
`pre*` hooks, so a release build always regenerates the retry config and holiday data first.

### Docs

`README.md` (bilingual EN/中文) is the project entry point — 5-minute quick start, doc index, and
verification commands; start there before the docs below.

For the Web Component packaging layer specifically: `docs/web-component.md` is the entry point;
`web-component-contract.md`, `web-component-styling.md`, `web-component-governance.md`,
`web-component-operations.md`, `web-component-testing.md`, `web-component-usage.md`, and
`framework-integrations.md` split out the formalized reference set (added phase 6, 2026-08-31), plus
`docs/migrations/web-component-v1.md` and dated entries under `docs/decisions/` for that phase's
OAS-impact and doc-formalization decisions. `docs/http-retry-policy.md` and `docs/releasing-web-component.md`
sit outside that phase-6 set but are current and referenced from both `README.md` and `package.json`'s
`files` array.

For the Balance Component domain itself (ported over from the deleted `lc-balance/`'s equivalents, still
current): `docs/architecture.md`, `docs/balance-business-rules.md`, `docs/engineering-standards.md`,
`docs/current-behavior.md`, `docs/history/` — `lc-balance-wc/CLAUDE.md`'s own 文档导航 section is the
index. `docs/balance-account-number-maintenance.md` and `docs/http-retry-policy.md` are the newest
additions (see "Balance Account Number Maintenance" and "HTTP retry policy" above).
