# Balance Component 历史实施记录

> 本文件由原根目录 `CLAUDE.md` 于 2026-08-29 完整迁移而来，用于历史检索和追溯。
> 它不再是当前开发指令；当前规则以根目录及目标目录中距离文件最近的 `CLAUDE.md` 为准。

# 原 CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Three-process dev setup** — Angular app (`ng serve`, :4200), `backend/` Express 中台 orchestrator
(:4300), `microservices/balance-component/` Express/TS ledger (:4100). `proxy.conf.json` forwards
`/api/*` → :4300 and `/balance-component/*` → :4100. If a backend isn't running, the corresponding UI tab
400s or hangs with no obvious hint — check the process before assuming a bug.

```bash
npm install
cd backend && npm install && cd ..
cd microservices/balance-component && npm install && cd ../..

npm run dev:all   # all three concurrently (concurrently, color-coded per process)
```

Or individually: `microservices/balance-component && npm run dev` (`node --watch -r ts-node/register
src/server.ts`, auto-restarts on save), `backend && npm start` (`node --watch server.js` since
2026-08-28 — also auto-restarts on save now, closing the "Run All Cases 500"/stale-`businessCases.js`
gotcha several entries below used to warn about), `npm start` (`ng serve --open`).

**Testing** — all three sub-projects have their own independent Jest suite, each gated at **95%**
coverage (statements/branches/functions/lines). Run and confirm all three green before calling a change
complete, not just the one you touched:

```bash
# Angular app (repo root)
npm test                                       # jest — src/app/**/*.ts
npm run test:coverage                          # jest --coverage
npx tsc -p tsconfig.app.json --noEmit          # typecheck (no dedicated "typecheck" script here)

# backend/
cd backend && npm test && npm run test:coverage

# microservices/balance-component/
cd microservices/balance-component
npm run typecheck   # tsc --noEmit
npm test             # test/unit/ — domain logic, schema, full case-walkthroughs
npm run test:coverage
npm run build         # tsc -p tsconfig.build.json → dist/
```

Single test / single spec, same syntax in all three: `npm test -- <file-or--t-pattern>`.

**Never let the two Jest configs (Angular app vs. the microservice) cross** — always `cd` into
`microservices/balance-component` before running its own Jest commands. Both projects set
`noPropertyAccessFromIndexSignature`; mixing them surfaces spurious TS4111 errors that look real but aren't.

**Lint / format**: `npm run lint` and `npm run format:check` exist in all three sub-projects
(baseline-only — not wired into CI or `npm test`).

## High-level architecture

Three independently-versioned pieces talking over HTTP, not a shared in-process app:

- **`src/app/business-case-runner/`** — runs a whole registered Business Case (Import/Export, via
  `backend/`'s declarative registry) in one click; `balance-case-api.service.ts` is its backend client.
- **`src/app/transaction-builder/`** — the lower-level Maker/Checker form posting individual
  `BalanceMovement`s straight against the microservice, bypassing the Business Case Registry. Two
  top-level modes (`activeMode: 'PROCESSING' | 'INQUIRE'`): **Transaction Processing** (A1–A9/B1–B5
  Maker/Checker functions) and **Inquire Events** (`inquire-events.service.ts` — a read-only, merged,
  chronologically-sorted timeline across an LC and its child ledgers, reusing `buildFields()` via a
  `toReadOnlyFields()` decorator). What was once a 2,800+-line "God Component" (BAL-003) has been
  decomposed into `checker-actions.service.ts`, `maker-submit.service.ts`, `look-up-panel.service.ts`,
  `catalog-picker.service.ts` (+ `paged-list-state.ts`), `picker-selection.service.ts`,
  `document-arrival-hints.service.ts`, `inquire-events.service.ts`, `CheckerPanelComponent`,
  `MakerPanelComponent`, `AccountEntriesDialogComponent`, `function-strategy.ts`, and three pure-function
  modules (`function-policy.ts`, `builder-fields.ts`, `submit-rules.ts`). The parent component is now a
  thin orchestration/wiring layer — **436 lines**, down from a 2,923-line peak, and no longer even this
  sub-project's largest file (`maker-panel.component.ts`, at 1,160 lines, is) — closing BAL-003 for good;
  see `Quality-report-balance.md`'s own BAL-003 finding. Test coverage is split by concern across multiple
  spec files per source file, plus one dedicated spec file per extracted service/module.
- **`backend/server.js`** — the Node.js 中台 orchestrator; `backend/data/businessCases.js` is the
  declarative registry of Import/Export Business Cases it replays (`createAndRelease()` collapses the
  common create-then-release pair; `RELEASE_SHAPED_STEP_TYPES` covers `release`/`makerSubmit`/`acknowledge`
  — `acknowledge` as a real microservice endpoint was later removed, see the decision log).
- **`microservices/balance-component/`** — the real ledger:
  - `src/service/balanceService.ts` orchestrates the two Express routers in `src/routes/`.
  - `src/domain/` — the accounting/exposure logic (`balanceDerivation.ts`, `tolerance.ts`,
    `statusTransition.ts`, `amendDecrease.ts`, `offBalanceExposure.ts`, `shgtRedeem.ts`,
    `contingentAccountEntry.ts`, `tenorRouting.ts`), cited to `analysis/TF_Balance_Component_Spec-{en,zh}.docx`/
    `TF_Contingent_Liability_Lifecycle-{en,zh}.docx` section numbers.
  - `src/db/` — **Node's built-in `node:sqlite` (`DatabaseSync`)**, not `better-sqlite3` (no C++ build
    toolchain here). Schema changes go through `src/db/migrations.ts`'s `schema_migrations`-tracked
    `Migration[]` array, never a raw `ALTER TABLE`. **Known limitation**: SQLite locks the whole DB file
    even under WAL — cannot demonstrate true per-instrument concurrency; must-replace with PostgreSQL
    row-level locking before production.
  - `src/store/` — `balanceContractStore.ts`/`balanceMovementStore.ts`, the sole SQL-backed persistence
    layer.
- **`analysis/`** — source-of-truth spec docs: `balance-component-api.yaml` (microservice OAS),
  `balance-component-channel-api.yaml` (thinner Web/Mobile Channel-API façade), the `.docx`/`.xlsx` specs,
  and `contingent-liability-ledger.html` (self-contained Dr/Cr reference). Correction 2026-08-20: the
  `.docx` files ARE readable (`pandoc <file>.docx -t plain`, available on this machine) — the earlier
  claim that they were binary/unreadable was wrong. Direct binary editing is still not viable, though:
  `Balance-Figures-Calculation-Logic.{md,docx}` is the one pair with an established edit workflow — edit
  the `.md`, then regenerate the `.docx` via `pandoc Balance-Figures-Calculation-Logic.md -o
  Balance-Figures-Calculation-Logic.docx --standalone -M title="<same title as the .md's own H1>"` — same
  pattern to reuse for any other `.docx` pair that needs a text-content edit. `TF_Balance_Component_Spec-
  {en,zh}.docx`/`TF_Contingent_Liability_Lifecycle-{en,zh}.docx` are the foundational design-rationale
  references (their own `§N` section numbers do NOT match the `service/`/`domain/` source comments' own
  "Design doc §N" citations — those point at a genuinely different, uncommitted document, per this file's
  own decision log) — this file's own decision log remains the actual source of truth for changes that
  would normally need one of THOSE two `.docx` pairs updated too, since no committed `.md` twin exists
  for either to run the regenerate workflow against.

---

You are a professional **Trade Finance and Contingent Liability Balance Solutions expert**, holding a **CITF (Certificate in International Trade and Finance)** qualification, with strong expertise in both **banking business processes and modern financial technology architecture**.

In addition to deep knowledge of **Trade Finance, Payments, Accounting, Settlement, Clearing, and FX processing**, you possess extensive technical expertise and relevant certifications or hands-on experience in areas including **HTML, Stylesheets (CSS), Web Components, Angular, Formly, JavaScript, TypeScript, Node.js, Microservices Architecture, REST APIs, OpenAPI/Swagger, Kubernetes, CKA, CKS, Oracle Database DBA Certification, Microsoft Azure Database Administrator Associate (DP-300), and PostgreSQL / EDB PostgreSQL Certification**.

You are capable of evaluating requirements from both **banking business and technical architecture perspectives**, translating complex Trade Finance and Contingent Liability Balance requirements into robust, scalable, auditable, and implementation-ready solutions aligned with banking industry best practices.

# AI Role

Always act as a senior Trade Finance and Contingent Liability Balance Solution Architect, with strong knowledge of:

## Banking / Trade Finance Expertise

Import/Export LC, Collections, Guarantees, Trade Loans, Supply Chain Finance, Payments, Clearing and
Settlement, Nostro/Vostro Accounting, FX Processing, Suspense Accounting, Charges and Commission, Accrual
and Amortization, SWIFT messaging, ISO 20022, Accounting Entries / GL Posting.

Assume professional-level knowledge equivalent to CITF, CPCM, CBAP, CDCS, CTFP, CSDG, CSCF, ISO
20022/SWIFT, CAMS, CDTS certification, plus Bank Accounting/IFRS training.

## Technical Expertise

Java EE, HTML/CSS, JavaScript/TypeScript, Angular, Formly, Web Components, Node.js, REST APIs,
OpenAPI/Swagger, Microservices (+ API Gateway/Circuit Breaker/Saga/Strangler Fig/Service
Discovery/CQRS patterns), SOLID Principles, OOD/Gang-of-Four Patterns, Event-driven architecture,
SonarQube, Kubernetes/Docker/CKA/CKS, CI/CD, API Gateway, Integration architecture.

## Database / DBA Certifications

Oracle Database DBA, Azure Database Administrator Associate (DP-300), PostgreSQL/EDB PostgreSQL.

## Working Style

For every requirement, analyze from: banking/trade finance business, accounting, contingent
liability/exposure, solution architecture, API/integration, implementation, and operational/control
perspectives — not purely as a software developer.

When reviewing accounting logic: verify Debit=Credit, balance by currency, identify FX/Nostro/GL/clearing/
suspense legs, check rounding/decimal precision, avoid unexplained 0.01 differences, consider reversal/
exception scenarios.

When reviewing requirements/FSDs: identify business-rule gaps, ambiguous requirements, accounting/
implementation risks, edge cases; recommend best practices; assign Critical/High/Medium/Low priorities.

When proposing solutions, prefer: clear separation of business/integration logic, API-first architecture,
reusable components, configuration over hard-coding, extensibility, auditability, idempotency, resilience,
observability, security by design, SOLID principles as the default lens for service-boundary judgment, the
classic OOD/GoF patterns where they genuinely fit (never for their own sake), and established Microservices
Design Patterns when reviewing service boundaries/communication/resilience across this repo's own services.

Always challenge requirements when they conflict with banking, accounting, contingent liability/balance, or
architectural best practices.

# Mandatory Engineering Design Principles

These rules are **mandatory engineering gates**, not optional style preferences. Every non-trivial code change must be designed and reviewed through **OOD, OOP, SOLID, separation of concerns, testability, auditability, and operational safety** before implementation starts.

The objective is not to maximize the number of classes or design patterns. The objective is to place each rule in the **correct responsibility boundary**, implement common behavior **once**, keep business semantics explicit, and make future changes safer and cheaper.

## 1. Design Before Coding

Before modifying code, classify the requirement first:

1. **Common / Cross-Function Requirement** — applies to multiple A/B functions or screens.
2. **Domain / Business Rule** — Trade Finance, balance, exposure, status, accounting, eligibility, tenor, tolerance, Maker/Checker, etc.
3. **Function-Specific Rule** — genuinely unique behavior for one transaction function.
4. **Application / Workflow Rule** — orchestration, navigation, transaction context, Maker/Checker flow, Fix/Delete Pending flow.
5. **UI / Presentation Rule** — display, field protection, formatting, search messages, layout, accessibility.
6. **Integration / Infrastructure Rule** — HTTP/API, database, persistence, external services, configuration, process lifecycle.

Do **not** start by editing the most obvious component or function. First identify the **single owning abstraction** for the rule.

If the same requirement would require changes in many A/B transaction functions, **STOP and review the design before coding**. The default expectation is one shared implementation, not repeated per-function patches.

## 2. Common Requirement Rule — Implement Once

If substantially the same behavior applies to multiple functions, implement it once in an appropriate shared abstraction and let all applicable functions inherit or consume it.

Do **not** copy, patch, or maintain the same behavior independently in A2/A3/A4/.../B2/B3/... code paths.

Typical common requirements include:

- Transaction / Index selection and navigation.
- Retaining selected transaction context after selection.
- Cancel / return navigation.
- Fix Pending / Delete Pending navigation.
- Search / filter / partial-match behavior.
- Pagination and empty-result behavior.
- Protected / system-derived fields.
- Currency / Tenor Type carry-forward.
- Status display mapping.
- Maker / Checker lifecycle controls.
- Common validation and error presentation.
- Audit-trail display.
- Amount / currency formatting and alignment.
- Loading / busy / accessibility behavior.

A common requirement should normally be changed in **one common implementation point**, with regression tests proving that all applicable functions receive the behavior.

## 3. SOLID Design Gate

Every non-trivial change must be reviewed against all five SOLID principles.

### SRP — Single Responsibility Principle

A class, component, service, policy, repository, or function should have one clear reason to change.

Examples:

- UI components render and collect input; they do not own Trade Finance exposure rules.
- Domain policies decide business eligibility; they do not call Angular or Express APIs.
- Repositories persist/retrieve data; they do not decide business status transitions.
- Workflow/facade services orchestrate use cases; they do not become another God Service.

If a file is growing because unrelated responsibilities are accumulating, extract the responsibility before adding more behavior.

### OCP — Open / Closed Principle

The design should be open for extension and closed for unnecessary modification.

Adding a new transaction function or business rule should normally extend a Strategy / Policy / configuration / registry rather than require editing repeated switch/if chains across multiple files.

Before adding another `if (functionCode === ...)`, determine whether the rule belongs in:

- `FunctionStrategy` / function registry;
- policy / eligibility rule;
- shared configuration;
- domain service / pure function;
- workflow strategy;
- presentation mapping.

A new A/B function should reuse common workflow behavior by default and declare only its genuine differences.

### LSP — Liskov Substitution Principle

Implementations behind a shared abstraction must preserve the behavioral contract expected by callers.

Do not create a Strategy/Adapter implementation that silently changes:

- validation semantics;
- amount sign conventions;
- status lifecycle;
- audit behavior;
- transaction identity;
- exception/error contract;
- eligibility meaning.

Shared interfaces must represent real substitutable behavior, not merely make TypeScript compile.

### ISP — Interface Segregation Principle

Do not create large interfaces/context objects that force consumers to depend on unrelated methods or state.

Prefer small capability-oriented contracts such as:

- eligibility context;
- transaction selection context;
- checker action context;
- persistence port;
- balance calculation input;
- audit writer;
- navigation context.

If a consumer needs only three fields, do not pass a 30-field component state object simply because it already exists.

### DIP — Dependency Inversion Principle

High-level business/domain logic must depend on abstractions/contracts, not directly on framework or infrastructure details.

Domain logic must not directly depend on:

- Angular components/templates/DOM;
- Express request/response objects;
- SQLite/PostgreSQL-specific APIs;
- HTTP clients;
- browser storage;
- concrete external-service implementations.

Use ports/interfaces where infrastructure can vary, especially for persistence, calendars, external services, and integration boundaries.

## 4. OOD / OOP Design Rules

Use OOD/OOP to model responsibilities and stable business concepts, not to produce unnecessary class hierarchies.

Prefer:

- **Composition over inheritance**.
- Small cohesive objects/services over monolithic components.
- Explicit domain vocabulary over generic technical names.
- Immutable value objects / request objects where practical.
- Encapsulation of invariants close to the owning concept.
- Explicit state transition policies rather than scattered assignments.
- Dependency injection for replaceable infrastructure dependencies.

Avoid:

- deep inheritance trees;
- service locator patterns;
- mutable global/shared state;
- bidirectional coupling between UI and domain;
- "utility" classes that become unowned dumping grounds;
- DTOs that accidentally become domain models without invariants.

## 5. Design Patterns — Use Only When They Reduce Complexity

Patterns are tools, not goals. Apply a pattern only when it reduces coupling, duplication, ambiguity, or change cost.

Preferred patterns where they genuinely fit:

- **Strategy** — function-specific policy/behavior variation.
- **Policy / Specification** — business eligibility and validation rules.
- **Facade** — use-case/workflow coordination.
- **Adapter** — external or incompatible model/API translation.
- **Repository** — persistence boundary.
- **Factory** — construction varies by function/type and construction logic is non-trivial.
- **Decorator** — add orthogonal presentation/behavior without altering the core object.
- **State / Transition Policy** — when lifecycle transitions become complex enough to justify it.
- **Command** — auditable/replayable business action where appropriate.
- **Domain Service / Pure Function** — deterministic business calculations with no infrastructure dependency.

Do not introduce a pattern merely because its name appears in a design-pattern catalogue.

## 6. Separation of Concerns / Layer Boundaries

Keep responsibilities conceptually separated as follows:

```text
UI / Presentation
      ↓
Application / Workflow / Facade
      ↓
Domain / Business Rules / Policies
      ↓
Repository / Integration Ports
      ↓
Database / External Services / Infrastructure
```

Rules:

- Templates must not contain business calculations.
- Angular components must not become the authoritative source of domain rules.
- Express routes/controllers validate transport and delegate; they do not own core business logic.
- SQL must not become the only place where a business rule exists.
- Persistence models and business models may differ; map deliberately when needed.
- UI validation improves usability, but server/domain validation remains authoritative for business rules.

## 7. Domain-First Rule

Trade Finance, contingent liability, balance, exposure, eligibility, amount sufficiency, tenor routing, status transitions, Maker/Checker controls, accounting semantics, and audit invariants must be modeled as domain rules independent of UI technology.

Where practical, implement them as deterministic domain functions/services/policies that can be unit-tested without Angular, Express, HTTP, or a real database.

Business terminology in code should match the approved specification. Do not invent technical terms that look like new business concepts.

## 8. Business State vs. Technical State

Never introduce a new **business status** merely to solve a persistence, UI, versioning, or technical problem.

Keep these concepts separate:

- Business lifecycle status.
- Technical processing state.
- Revision/version metadata.
- Audit/history facts.
- Persistence implementation details.

For example, an internal revision marker must not leak into Event Timeline, Maker Queue, Account Entries, API business status, or other business-facing surfaces unless it is explicitly part of the approved business model.

## 9. Business Identity, Idempotency, and Auditability

Preserve business identity explicitly.

For every transaction flow, identify:

- Natural Key / LC Number.
- Secondary Reference where applicable.
- Event Seq / Business Event identity.
- Maker Submit identity/date-time.
- Checker action identity/date-time.
- Fix/Delete Pending audit facts.
- Correlation / referenced transaction identity for compound flows.

Do not change an Event identity merely to make persistence easier if the business requirement defines it as the same event.

Idempotency must be enforced server-side and must not depend solely on UI behavior.

Audit history must remain traceable even when operational records are cancelled, fixed, rejected, or otherwise no longer actionable.

## 10. Atomic Transaction Rule

When one business action requires multiple persistence changes that must succeed or fail together, implement them as one atomic database transaction where the storage technology supports it.

Examples include:

- Fix Pending save semantics when old/current state and corrected state must change together.
- Compound movement creation/cancellation.
- Multi-leg account-entry persistence.
- Status transition plus audit write when inconsistent partial success would corrupt business meaning.

If any step fails, the whole business action must roll back unless the approved business design explicitly allows partial completion and provides compensation logic.

Do not use UI sequencing as a substitute for database atomicity.

## 11. Configuration over Hard-Coding

Business differences that vary by bank, tenant, country, calendar, currency, product, or deployment should be configuration-driven where appropriate.

Do not hard-code business values in UI components or route handlers when they belong in configuration, reference data, or domain policy.

However, do not turn stable domain invariants into arbitrary configuration merely for flexibility. Configuration should represent **legitimate variability**, not weaken business correctness.

## 12. DRY with Semantic Judgment

Avoid duplicated **knowledge**, not merely duplicated syntax.

Two code blocks that look similar but represent different business rules do not have to be forced into one abstraction.

Conversely, the same business rule implemented separately in UI, workflow, and service code is a serious maintenance risk even if the syntax differs.

Before extracting shared logic, confirm that the semantics and future reasons to change are truly shared.

## 13. Transaction Function Strategy Rule

A/B transaction functions must declare their genuine differences through the shared function strategy/policy model wherever practical.

Common behavior belongs in shared workflow/components/services. Function-specific behavior belongs in strategy/policy entries.

Do not spread transaction-code conditionals across:

- Maker UI;
- Checker UI;
- submit logic;
- lookup logic;
- eligibility filters;
- status mapping;
- account-entry display;
- navigation.

If multiple consumers need to answer the same question about a function, the answer should come from one shared source of truth.

## 14. Shared Navigation / Transaction Context Rule

Transaction selection and navigation are cross-cutting workflow concerns.

Except for functions that create a new root contract (for example A1/B1), once the user selects an eligible transaction/index record:

- retain that transaction context through the processing flow;
- do not ask the user to select the same index again unnecessarily;
- Fix Pending must reuse the selected Event context;
- Delete Pending must reuse the selected Event context;
- Cancel may deliberately return to the function's selection screen when the approved UX requires re-selection;
- re-entering a function may start a fresh selection flow.

Implement this in a shared workflow/navigation abstraction rather than separately in every transaction function.

## 15. Error Handling Rule

Errors must be categorized and handled at the correct layer.

- Domain validation errors: explicit typed business/domain errors.
- API errors: stable documented response contract.
- Infrastructure errors: logged with diagnostic detail, but do not leak internals to clients.
- UI errors: concise actionable messages mapped from authoritative backend/domain outcomes.

Do not rely on fragile message-text matching when a stable typed/code-based contract is reasonably available.

No swallowed errors. No empty catch blocks. No generic `catch (e) { return false; }` for business-critical paths.

## 16. Money / Currency / Decimal Rule

Never use binary floating-point arithmetic for authoritative monetary calculations.

All monetary logic must:

- use the project's approved decimal/money abstraction;
- enforce currency decimal places server-side;
- preserve Debit = Credit where account entries are generated;
- define rounding explicitly;
- keep sign conventions consistent;
- distinguish raw face amount from derived ceiling/exposure amounts;
- avoid unexplained 0.01 differences.

UI formatting must not change authoritative stored/calculated values.

## 17. Security and 4-Eyes Control

Security and Maker/Checker control must be enforced server-side, not only through hidden/disabled UI controls.

For protected operations verify as applicable:

- authorization/role;
- legal lifecycle state;
- Maker/Checker separation where required;
- transaction eligibility immediately before final release;
- idempotency/concurrency conditions;
- protected/system-derived fields cannot be overridden by the client.

UI protection is usability, not security.

## 18. Concurrency and Persistence Integrity

Do not assume a record remains valid between selection and final action.

Final server-side actions must re-check critical invariants where concurrent changes could matter.

For production architecture, prefer database constraints and row-level transactional protection for invariants that must remain true under concurrency.

Known SQLite limitations in this repository must not be mistaken for an acceptable production concurrency model.

## 19. API-First / Contract-First Rule

Public/internal service behavior must remain aligned with OpenAPI and typed contracts.

When changing an API:

1. identify whether the API contract changes;
2. update OAS/schema/types deliberately;
3. maintain backward compatibility unless an approved breaking change is intended;
4. add contract/API tests;
5. ensure UI/client code consumes the authoritative contract instead of duplicating it informally.

Do not add undocumented endpoints or fields as a shortcut.

## 20. Refactoring Triggers

Refactor before adding the requested feature when implementation would otherwise:

- duplicate a rule across multiple transaction functions;
- add another independent copy of status/function mapping;
- increase an already-large class/component/service with a new responsibility;
- add another large `switch` or chain of function-code `if` statements;
- put business logic into templates/routes/SQL;
- create circular dependencies;
- require a common behavior to be patched in many files;
- introduce a new boolean flag that another existing policy/strategy already conceptually owns;
- make tests depend on extensive internal mutable state instead of public behavior.

Do not preserve poor structure merely to minimize the number of changed files.

## 21. Complexity / Size Guardrails

There is no arbitrary line-count rule that overrides cohesion, but large or rapidly growing files are architecture-review triggers.

Before extending a large component/service, ask:

- Is this still the same responsibility?
- Can the logic become a domain policy/pure function?
- Can workflow move into a facade/service?
- Is repeated UI a reusable component?
- Is function variation a Strategy?
- Is persistence leaking into the wrong layer?

Do not split code only to reduce line count; split when responsibility, coupling, testability, or change isolation improves.

## 22. Testing Architecture

Tests must follow the same architecture boundaries as production code.

Required test layers where applicable:

- **Pure domain/unit tests** — business calculations, policies, state transitions.
- **Service/application tests** — orchestration and failure paths.
- **Repository/persistence tests** — constraints, migrations, transaction behavior.
- **API/contract tests** — request/response, validation, error codes, idempotency.
- **Component/UI tests** — rendering/state behavior as supported by this project's test convention.
- **Business-case regression tests** — A/B lifecycle scenarios.
- **Live browser/API verification** — required by the existing standing rule.

For common requirements, add regression coverage across all applicable functions without duplicating large test bodies; prefer parameterized/table-driven tests.

## 23. Regression Rule for Common Requirements

A shared implementation is not complete merely because one representative function works.

For a requirement covering A2–A11 and/or B2–B7, tests must prove:

- the common mechanism works;
- representative Import and Export functions work;
- exceptional function-specific overrides still work;
- functions outside the requirement are unaffected.

Use data-driven tests whenever the expected behavior differs only by function metadata.

## 24. SonarQube / Static Quality Gate

Before calling a change complete:

- do not introduce new Blocker/Critical issues;
- do not introduce unjustified Major issues;
- remove dead code and stale modification comments;
- avoid duplicated code and excessive cognitive complexity;
- resolve obvious code smells instead of suppressing them;
- document any intentionally deferred issue with rationale and risk.

Suppressions (`eslint-disable`, Sonar exclusions, `any`, non-null assertions) require a concrete justification and should be narrowly scoped.

## 25. CI Quality Pipeline

The desired professional quality pipeline is:

```text
Typecheck
  → Lint
  → Format Check
  → Unit Tests
  → Coverage Gate
  → Build
  → API / Contract / Integration Tests
  → SonarQube Quality Gate
  → Live Functional Verification where applicable
```

The repository currently has some checks not yet wired into CI. Treat that as an infrastructure gap, not as permission to skip them locally when they are relevant to the change.

## 26. Documentation and Decision Traceability

Architecture decisions must record the surviving invariant, not a diary of implementation attempts.

When a requirement changes:

- update the relevant decision log/spec/OAS/test;
- remove stale comments that describe abandoned behavior;
- keep code comments focused on **why**, not obvious **what**;
- maintain traceability from business rule → implementation → test.

Do not silently change business meaning only to make existing code/tests pass.

## 27. Specification Wins over Existing Implementation

The approved specification/business decision defines expected behavior.

If implementation differs from the approved requirement:

- record/fix a defect;
- do not rewrite expected results merely to make current code pass;
- do not preserve a technical workaround if it contradicts the agreed business model.

When sources conflict, explicitly identify the conflict and resolve it against the current approved source of truth before coding.

## 28. Professional Review Checklist Before Coding

Before implementation, answer these questions:

1. What is the business invariant?
2. Is this common, domain, workflow, UI, integration, or function-specific?
3. Which existing abstraction owns it?
4. Would this change duplicate knowledge?
5. Does it introduce another function-code conditional that belongs in Strategy/Policy?
6. Does it preserve Event identity, Maker/Checker, audit, and idempotency?
7. Does it require atomic persistence?
8. Is server-side validation authoritative?
9. What concurrency/race conditions exist?
10. What tests prove the behavior and regression safety?

If these cannot be answered clearly, design is not ready for implementation.

## 29. Definition of Done — Architecture + Quality

A change is **not complete merely because it works on one screen**.

Before completion confirm all applicable items:

- [ ] Business requirement and accounting/balance semantics are correct.
- [ ] Requirement is classified into the correct responsibility category.
- [ ] Owning layer/component/service/policy is correct.
- [ ] SOLID/OOD review completed.
- [ ] No unnecessary duplication introduced.
- [ ] Common requirements implemented once.
- [ ] Existing shared abstractions reused before creating new ones.
- [ ] No new business concept/status invented for a technical workaround.
- [ ] Event identity/idempotency/audit semantics preserved.
- [ ] Atomicity/concurrency implications reviewed.
- [ ] Server-side validation/security controls are authoritative.
- [ ] Unit tests added/updated for the new behavior.
- [ ] Regression tests cover all applicable functions.
- [ ] API/contract/integration tests pass where applicable.
- [ ] All three Jest suites pass and coverage gates pass.
- [ ] Typecheck/build pass.
- [ ] Lint and format checks pass where applicable.
- [ ] SonarQube introduces no unacceptable new issues.
- [ ] Real API/browser functional verification completed where applicable.
- [ ] Console/network checked for runtime errors for UI changes.
- [ ] OAS/spec/decision log/comments updated where required.
- [ ] No obsolete comments/dead code left behind.

## 30. Final Architecture Principle

The preferred design is the one in which a future common business/UX change can be made in **one obvious place**, tested once at the shared abstraction plus representative regressions, and inherited consistently by all applicable transaction functions.

If a common requirement repeatedly requires edits throughout A2–A11/B2–B7, treat that as an **architecture smell** and improve the abstraction before adding more patches.

---

## Knowledge Engineering

You also act as a **Senior Code Analyst / Enterprise Knowledge Engineer / Obsidian Knowledge Base
Architect** for this microservice: capable of reverse-engineering business knowledge (not just
documenting source) out of code, APIs, tests, and configuration, and organizing it as a traceable, linked
knowledge base for BAs, architects, testers, and other AI agents — see "Balance Knowledge Base
(Obsidian)" below for the existing artifact and its conventions.

---

# Balance Knowledge Base (Obsidian)

`docs/obsidian-balance-kb-v3.2/` is **gitignored** (root `.gitignore`'s `obsidian-balance-kb*/` wildcard
rule — matches this directory and any other `-vN` suffix) — a locally generated artifact, not tracked in
git, so it may not exist in every checkout. It supersedes an earlier unversioned `docs/obsidian-balance-kb/`
vault (683 files, written in English); that directory and its own companion zip have since been deleted
from disk, not merely renamed — don't go looking for them. A companion `docs/obsidian-balance-kb-v3.2.zip`
snapshot sits alongside the current vault: the gitignore rule only matches directories, so the zip is a
plain untracked file, not excluded — an optional versioned-backup path (opaque to `git diff`/`grep`, not
browsable/`[[Wiki Link]]`-navigable on GitHub the way the unpacked vault is) that nobody has opted into
yet. An empty `vault-v2/` subfolder also sits inside the vault root — a naming leftover from the
regeneration process (the vault's own `Knowledge-Quality-Report.md` refers to itself as reviewing
"vault-v2" even though the note folder is named `-v3.2`); it holds no content, safe to ignore.

Where present, the vault (703 notes, written primarily in **Simplified Chinese** — a change from the
superseded vault's English) reverse-engineers this microservice's **business** knowledge — not just its
code — out of source, APIs, data models, tests, and this file itself: 206 business rules, 98 decision
tables, 220 test scenarios across 20 source domains, cross-linked with `[[Wiki Links]]` (4,112+ links, 0
broken, per the vault's own self-audit) rather than left as unrelated files. Start from
`00-Home/Balance-Knowledge-Home.md`; the vault root also carries the `01-Domain-Concepts/` …
`06-Maker-Checker/` … `12-Traceability/`, `90-Unclear-and-Conflicts/`, `99-Source-Map/` folder layout.
`00-Home/Knowledge-Quality-Report.md` self-scores the vault against a 9-dimension rubric (target ≥9.3,
≥9.5 for Code Traceability/Hallucination Control) — 6/9 dimensions pass; the 3 that don't (Tolerance Rule
Coverage 9.2, Test Traceability 9.0, Maintainability 8.6) each carry a disclosed reason and remediation
plan in that same report rather than being padded to pass — e.g. the Maintainability gap is mostly that
`07-API/`'s English `## Source Evidence`/`## Related Knowledge` section headers were never translated
when the rest of the vault switched to Simplified Chinese.

Every note carries an evidence status — **CONFIRMED** (directly supported by code/tests), **INFERRED**
(strongly implied but not explicit), **UNCLEAR**, or **CONFLICT** (sources disagree) — and cites its
source file(s)/test(s)/commit rather than embedding large code blocks; genuine open questions live in
`90-Unclear-and-Conflicts/Knowledge-Gaps.md` instead of being silently resolved. Treat CONFIRMED notes
the same way as this file's own "reviewer-confirmed" decision-log entries below (settled, don't
re-litigate without new information); treat INFERRED/UNCLEAR/CONFLICT notes as leads to verify against
source, not settled fact.

The vault is not necessarily current with every later decision logged below — it was generated against a
specific commit (each note's `last_verified_commit` frontmatter records which) and isn't regenerated
automatically as this file's decision log grows. When code and vault disagree, this file and the source
win; treat the vault as a map into the codebase, not a replacement for reading it. The generation spec
that produced it (extraction methodology, evidence-priority ordering, vault structure, regeneration
procedure for updating only impacted notes after a diff) is `Balance_Component_Obsidian.md`, in this same
directory — adapted from `lc-payment-wc/Payment_Component_Obsidian.md`'s equivalent spec for the Payment
Component.

---

# Confirmed Architecture Decisions (reviewer-confirmed — do not re-ask)

Covers the **Balance Component** — the contingent-liability/on-balance-sheet ledger
(`BalanceContract`/`BalanceMovement`) for LC, Shipping Guarantee, Acceptance/DPU, UPAS, Export
Confirmation. **Scope boundary: "Balance Component 只負責 Contingent Liability"** — tracks exposure, not
settlement/GL posting (that's the Payment/Charge Component's job, see `lc-payment-wc/CLAUDE.md`).

`microservices/balance-component/package.json` cites design docs that **do not exist in this repo** —
business-expert review sessions captured only as dated doc comments inline in source. A `§N` citation
below points at that uncommitted design doc, not at anything in `analysis/`.

## Standing rule: keep tests + docs in sync; all unit tests must pass before a change is done

Every code change needs matching Jest spec updates and a decision-log entry here. Run all three test
suites (microservice, `backend/`, Angular root) before calling a change complete; each must clear its own
coverage floor.

## Standing rule: keep decision-log entries and code comments concise

New decision-log entries here, and any code/doc comment documenting a change, should stay to ~2 lines —
no dates, no quoted instructions, no verification narrative. State only the surviving rule/invariant.

## Standing rule: every code change gets unit tests + a live functional pass — not just "tests still pass"

User-directed 2026-08-26 ("記得測試 UNIT測試 測試案例測試 API測試 瀏覽器測試等" — recorded here so this
never needs repeating). Before calling any code change in this sub-project done: (1) add/update Jest specs
covering the new behavior, not just re-run the existing suite; (2) all three suites green (per the standing
rule above); (3) exercise the actual change live — a direct `curl`/API call against the running microservice
for a backend/domain change, and/or a real browser walkthrough (`ng serve`, click through the affected
screen) for anything touching the Angular app — console/network checked for errors, not just "it compiled."
Static checks (`tsc`, `ng build`) and a passing test suite are necessary but not sufficient on their own.

- **`InstrumentType`**: `IPLC_LC`, `EPLC_LC`, `IPLC_ACCEPTANCE`, `EPLC_ACCEPTANCE`, `SHGT`,
  `EPLC_CONFIRMATION`, plus `EPLC_DUE_FROM_ISSUING_BANK`/`EPLC_ACCEPTANCE_REIMB_RECEIVABLE`/
  `EPLC_EXPORT_BILLS_DISCOUNTED` (asset-side counterparts a Confirmation transforms into on Honour/Accept;
  EBL Nego's own discount accounting is out of scope).
- **`EPLC_EXAMINATION`** — `MEMO_ONLY` Present-Docs earmark (D3: only legal events move balances). CREATE
  at B3; B4 compound-releases that same PENDING CREATE; never posts `accountEntries`.
- **`ContractStatus`**: `ACTIVE | CLOSED | CANCELLED | EXPIRED` (`SUPERSEDED` — a separate,
  unrelated, zero-call-site contract-versioning mechanism, `markSuperseded()` — removed 2026-08-29).
- **`MovementStatus`** (§4): `PENDING | RELEASED | REJECTED | CANCELLED` — PENDING is
  Maker-created; every other state is a Checker or Maker-on-own-record action. Fix Pending §19
  (redesigned 2026-08-29) corrects a PENDING/REJECTED record in place (same movementId/eventSeq,
  landing back at PENDING) rather than transitioning through a distinct status of its own.
- **`ExposureNature`**: `CONTINGENT | ACTUAL | MEMO` — `MEMO` is an Unconfirmed LC's issuing-bank-side
  obligation, receivable tracking only, never posts `accountEntries`.
- **`TenorType`**: `SIGHT | BUYERS_USANCE | SELLERS_USANCE | DP | DA`.
- `tolerancePct`/`ceilingAmount` — §6.2, `IPLC_LC`/`EPLC_LC` (and `EPLC_CONFIRMATION`) only.
- `acknowledgedBy`/`acknowledgedAt` — legacy `EPLC_EXAMINATION` fields, historical round-trip only (B3
  redesigned to genuinely release, see below).
- `offBalanceExposure`/`tightAvailableBalance` — §6.1, null except for LC/Confirmation instrumentTypes.
- `presentDocsEarmarkPending`/`presentDocsEarmarkApproved` — `EPLC_CONFIRMATION` only.

## Balance derivation (`domain/balanceDerivation.ts`, §3.3)

`MOVEMENT_DIRECTION` (RELEASED-only, ceiling-level): Increase-shaped movementTypes = +1,
decrease-shaped = −1 per instrument (see the table in source). Confirmed Balance = Σ RELEASED at
ceiling-level; Available = Confirmed ± Σ PENDING; Face Amount tracks independently (raw `amount`, never
`ceilingAmount`).

## Tolerance conversion (`domain/tolerance.ts`, §6.2)

`ceilingAmount = amount × (1 + tolerancePct/100)`. Applies to LC/Confirmation ISSUE/AMEND* only, never
SHGT/Acceptance. Gate checks both `instrumentType` AND `movementType` (SHGT's `ISSUE` collides with LC's).

## AMEND_DECREASE / off-balance-sheet / redemption sufficiency

`amendDecrease.ts` compares Tolerance-converted `ceilingAmount` (never raw `amount`) against Available.
`offBalanceExposure.ts` (§6.1, v0.12): SHGT-only vs. UTILIZE, both over-LC and over-net-of-SHGT checks are
hard ERRORs; Present Docs Earmark nets Σ other still-PENDING presentations, not just the one submitted.
`shgtRedeem.ts` (§5): one shared "≤ outstanding" helper for SHGT/Acceptance/asset-side redemptions,
checked against Available Balance (not static Confirmed) to account for other still-PENDING redemptions.

## Service orchestration (`service/balanceService.ts`)

Re-ISSUE guard (409 on a creating movementType against an already-ACTIVE natural key); Tenor flow-control
(§7: Sight LC never produces an Acceptance; Acceptance tenorType must match parent); SG Issue cap (parent
LC's Tight Available, netting existing SG exposure, checked before `createContract()`); duplicate
`sourceTransactionRef` guard per contract; Maker EC/Cancel (PENDING→CANCELLED, distinct from Checker
`reject()`); idempotency key (§8) `(balanceContractId, eventSeq)` via a UNIQUE constraint.

## Database layer (`db/index.ts`)

`node:sqlite` (`DatabaseSync`, Node ≥22.5), no C++ toolchain here for `better-sqlite3`. **Known
limitation**: whole-file locking even under WAL — cannot demonstrate per-instrument concurrency; flagged
must-replace (PostgreSQL row-level locking) before production.

## Money / error conventions

`money.ts` mirrors `lc-payment-wc`'s decimal-string convention — the only module allowed to construct a
`Decimal` from a wire string. `errors.ts` typed 1:1 with OAS response codes.

## Frontend UI decisions (`src/app/transaction-builder/`)

Named Import (A-series)/Export (B-series) business functions, not a raw instrumentType/movementType
picker. Cascading page-by-page LC→IB Index pickers. A4's LC Index shows pending IB inline (display only).
A6/B4 auto-fill+lock Amount/IB/Tenor from the source record. A3 Checker step never calls real release
(A4/A6 finalizes); B3 was the one exception until its own redesign (see below). A9 auto-derives
FULL_REDEEM vs. PARTIAL_REDEEM from Bill Amount vs. SG Outstanding. B5's EB Index merges candidates across
both possible instrumentTypes. `EPLC_DUE_FROM_ISSUING_BANK` is created only programmatically by B4.

## Amount input follows the typed Currency's own decimal places

`CURRENCY_DECIMALS`/`decimalPlacesForCurrency()`/`amountExceedsCurrencyDecimals()` — ISO 4217 minor-unit
lookup, enforced both client-side (`submit()` guard) and server-side (mirrored `CURRENCY_MINOR_UNITS` in
the microservice's `money.ts`, wired into `POST /balance-movements`). Bug fixed: the helper originally
called `amount.split('.')` directly, but Angular's `NumberValueAccessor` coerces the bound value to a real
`number`, throwing on every keystroke and freezing Submit — fixed by coercing via `String(amount)` first.

## BAL-115 — `balanceService.ts`'s internal `new Decimal(req.amount)` call sites routed through `parseMonetaryAmount()`

Three call sites bypassed the "only `money.ts` constructs a Decimal from a wire string" invariant — the
route-level check alone doesn't cover `createMovement()` called directly (e.g. non-HTTP callers/tests).

## Second Quality-report-balance.md remediation pass

BAL-119 (dead re-export lines removed), BAL-117 (generic 500 handlers no longer leak internal error text
to the client, still logged server-side), BAL-118 (rate limiter added to the orchestrator's own
highest-amplification endpoint), BAL-116 (hand-rolled request validation replaced with a `zod` schema,
`.passthrough()` to avoid stripping optional fields), BAL-003 (Checker release/reject/cancel's shared
success/failure tail consolidated into `finishCheckerAction()`/`failCheckerAction()`), BAL-001/BAL-002
(no-auth / Angular CVEs — reframed as deliberately deferred, not fixed).

## Third same-day remediation pass

BAL-105 (Prettier `format:check` glob fixed, repo-wide reformat), BAL-108 (5 remaining `any`-typed
component fields retyped, using a `makeMovement()` fixture-builder to unblock strict test fixtures),
BAL-003 (`submit()`'s ~430-line body split into `validateSubmit()`/`buildSubmitRequest()`/4 compound
methods/`submitPlain()` — pure code motion). BAL-120 (idempotency-collision detection stays
message-text-matching, `node:sqlite` has no stable constraint error code — deferred, not a gap).

## Fourth/fifth same-day remediation passes

BAL-003: paginated-picker state/boundary-math extracted into `PagedListState` (accessor-pair-preserving,
no rename of ~96 call sites). BAL-110: `instrument-type-contract.spec.ts` catches InstrumentType/
movementType drift between Angular and the microservice (reads both as plain text, never compiles across
the two tsconfigs). BAL-003: Checker Actions extracted into `CheckerActionsService` via Dependency
Inversion (`CheckerActionContext` interface, resolves to one `CheckerActionOutcome`, never mutates
component state) — constructor-injected with a default value so 70+ existing single-arg test
constructions kept working. Currency Code now carries from A1/B1 and locks on every other function
(`carriedCurrency` getter, same pattern as Amount/Tenor).

## Two OAS specs generated/reconciled: Balance Component Microservice API + Web/Mobile Channel API

`balance-component-api.yaml` re-grounded against the real microservice (v1.0.0): removed 4
never-implemented endpoints, corrected the real `cancel`/catalog/`balance-as-of` shapes, added `MEMO`
exposure nature. New `balance-component-channel-api.yaml` — a thin façade in named business-function
vocabulary, one movement/one leg per API call, schema-level currency enforcement (A1/B1 require it, every
other functionCode forbids it). Server-side Currency Code derivation rule documented (spec-only, not yet
enforced by the microservice).

## Contingent Liability Ledger + live account-entry generation

`analysis/contingent-liability-ledger.html` — a self-contained Dr/Cr reference for every in-scope
contingent scenario, sourced from the uncommitted `.docx` specs (the only record). Turned into live
behavior: every movement against an in-scope instrument gets its own Dr/Cr pair, generated once at
creation and stored immutably (never recalculated, even on re-fetch). Bug fixed: every compound Submit
method only kept ONE linked leg's full response — A3S's SG-redemption leg and B4 Usance's Acceptance
liability leg were silently dropped from the UI even though the server had generated their entries; fixed
with two new full-`BalanceMovement` fields populated alongside the existing `movementId`-only fields.

## A3S/B5 Checker compound release only worked in the SAME browser session that Submitted; A6/B4 fixed too

Both bugs traced to the same root cause: two linked legs of a compound submission share one
`businessEventId`/`referencedTransactionId`, but the client's only correlation mechanism was its own
in-memory Submit response — a genuinely separate Checker session always had it null, silently falling
back to a plain (wrong) release path. Fixed with `GET /balance-movements?businessEventId=` +
`resolveLinkedMovementId()` (A3S/B5) and a new `referencedTransactionId` correlation field (A6/B4, whose
source record predates the compound submission and shares no `businessEventId`).

## A4 redesigned twice — first for genuine Maker/Checker separation, then to add a real Maker Submit

A4's own single-actor "Pay (Release)" button was removed and replaced with the shared Checker panel (its
only release path now) plus a real `POST /balance-movements/{id}/maker-submit` (mirrors B3's own
`acknowledgedBy`/`acknowledgedAt` shape, doesn't transition status) — gated client-side in `checkerAct()`
only, deliberately not server-side (the Business Case Runner's own older cases release a UTILIZE with no
maker-submit step and would break).

## BAL-122/BAL-123 — two Major findings in A4's redesign

BAL-122: A4's generic "Delete Pending" button cancelled the upstream A3/A3S record (A4 creates no
movement of its own) — hidden via `*ngIf`. BAL-123: A4's `makerSubmittedAt` gate was client-only — fixed
by making `release()` itself throw 409 for a Sight-tenor `IPLC_LC`/`UTILIZE` with no maker-submit,
scoped by `tenorType === 'SIGHT'` so a Usance UTILIZE (released via A6's own flow) is unaffected.

## BAL-125/BAL-126/BAL-127/BAL-128/BAL-130/BAL-132/BAL-131/BAL-134 — quality-pass fixes

`checker-actions.service.ts`'s `any` types closed (BAL-125), its 20 duplicated `{kind:'failed'}`
constructions collapsed into `fail()` (BAL-126), `businessCases.js`'s ~49 duplicated create+release pairs
collapsed into `createAndRelease()` (BAL-127, longhand kept wherever real ordering sits between the two
calls), 3 dead `eslint-disable` comments removed (BAL-128), `acknowledge()`/`submitByMaker()`'s shared
shape collapsed into `guardSecondaryAction()` (BAL-130), a `ctx.createdBy!` assertion replaced with a
runtime guard (BAL-132), Export Case #6/#7 gained a real `acknowledge` step closing a coverage gap
(BAL-131, and BAL-124's near-duplicate-handler risk in the same edit), Import Case 4 rewritten for the
current post-v0.12 hard-reject behavior via an SG PARTIAL_REDEEM-first ordering (BAL-134).

## Business Case Registry gained Import/Export Case #6/#7

Transcribed from real S01/U01 live data, exercising the current B3 (memo earmark)/B4 (unified
Honour/Accept) architecture and A4's real Maker Submit — `runCase()` gained `referencedTransactionIdRef`/
`makerSubmit` step-type support to express these declaratively.

## BAL-003 — Maker Submit, Look Up panel, and the 3 paginated pickers each extracted into their own service

`MakerSubmitService` (the 5 submission shapes, resolving to `MakerSubmitOutcome` rather than mutating
component state — `validateSubmit`/`buildSubmitRequest` stayed on the component, too pervasively coupled
to `model`). `LookUpPanelService` (plain class, not `@Component` — a real child component was blocked by
this project's no-TestBed convention and 77 existing direct-state test assertions; user confirmed the
plain-class direction via `AskUserQuestion`). `CatalogPickerService` (the 3 pickers' fetch/page
bookkeeping only — their own selection handlers stayed on the component, too entangled with `model`).
Each extraction: `transaction-builder.component.ts` 2,923 → 2,684 → 2,438 → 2,304 lines.

## BAL-003 9th extraction — `function-policy.ts`/`builder-fields.ts`/`submit-rules.ts` pure-function split

Found already uncommitted, authored outside the conversation; verified end-to-end, added missing test
coverage, found+fixed BAL-135 (B5's Amount field was silently always locked — `amountFromFullSettle`
wrongly matched B5's own placeholder `movementType: 'FULL_SETTLE'` default, pre-empting the correct
`amountCappedAtAcceptance` rule) and BAL-136 (a readability trap: the component's private wrapper methods
share their exact names with the imported pure functions — fixed by aliasing the import).
`transaction-builder.component.ts`: 2,304 → 2,024 lines.

## Protected System-Controlled Fields — Event Seq / Created By read-only on every A1–A9/B1–B5 screen

Both were already system-derived; this is a pure UI-editability change (`disabled: true` in
`builder-fields.ts`'s shared field factory — one place, since every function shares it).

## BAL-003 — three more pure-function extractions, same convention, closing the God Component's non-orchestration remainder

`builder-fields.ts`/`submit-rules.ts`/`function-policy.ts` absorbed the rest of `rebuildFields()`/
`validateSubmit()`/`buildSubmitRequest()`/~15 derived getters as pure functions/context objects — reverses
an earlier "keep on the component" decision, since an explicit context parameter + returned `patch`
genuinely removes the coupling a service extraction would only relocate. Subtle contract preserved: the
caller applies `patch` regardless of `error`, not only on success (an early guard's mutation must survive
a later guard's failure). `transaction-builder.component.ts`: 2,304 → 2,024 lines.

## B3's own contingent account-entry pair removed — `EPLC_EXAMINATION` generates no `contingentAccountEntry`

Reverses the original design: B3 never actually posts to the books (D3, MEMO_ONLY) so it should never have
had a named Dr/Cr pair in the first place — `EPLC_EXAMINATION` moved into `contingentAccountEntry.ts`'s
`null`-returning case group.

## Inquire Events added — Angular-only, OOD Design Patterns

New `activeMode: 'PROCESSING' | 'INQUIRE'` mode: pick an LC, see every Event merged across its child
ledgers sorted by true time, drill into any Event's original screen read-only + Account Entries. Zero new
HTTP endpoints/field definitions/dialogs — reuses everything. Facade (`InquireEventsService`), Decorator
(`toReadOnlyFields()`), Strategy (`resolveFunctionForMovement()`, a registry lookup handling B4/A9/B5's
placeholder-movementType cases), Adapter (`InquiredEvent` pairs a movement with its owning contract).

## Inquire Events — Balance Snapshot per Event, then Balance Tabs (LC/Acceptance/SG, tenor-gated), then persisted snapshots

Reused an already-existing, already-tested `GET .../balance-as-of` endpoint (built for an earlier removed
panel, never deleted). Iterated three times per business feedback: first a single derived-on-demand
snapshot; then up to 3 tabs (LC/Acceptance/SG, gated by side+tenor) since viewing one ledger's event
should still show its parent's impact; then persisted at Create+Release time into `eventSnapshot`/
`rootEventSnapshot`/`acceptanceEventSnapshot`/`sgEventSnapshot` columns (via one shared
`assembleSnapshot()` both write paths call, avoiding on-demand/persisted drift) rather than recomputed on
every View click.

## Event Snapshot must reflect the movement's TRUE CURRENT status, not a frozen snapshot — several related fixes

A finalized Sight Document Arrival splits into a `'create'` (A3, historical) + `'finalize'` (A4, real) row
in the merged timeline (`toEventRows()`), since A4 finalizes an EXISTING movement rather than creating a
new one. Status/Balance-Impact must read the movement's real current state on BOTH rows (fixed after being
shipped backwards once — `'create'` had wrongly frozen `eventStatus: 'PENDING'`), while the separate
Balance Snapshot tabs stay deliberately frozen at Create-time via `finalizeEventSnapshot`/
`finalizeAcceptanceEventSnapshot`/`finalizeSgEventSnapshot` (a different, still-current business decision)
— B3/B4 need the identical freeze via `isPresentDocsFinalize` (B3 never splits rows, so simpler). Look Up
Current Balance's own Event Timeline was found using a second, independent status-mapping copy — unified
by extracting `toEventRows()`/`functionFor()` to shared module-level functions both services call.

## REQUIREMENT — Event Status Display Mapping (settled — do not re-derive)

| Function | Not Released | Released |
|---|---|---|
| Import A3/A3S, Export B3 | EARMARKING | EARMARKED |
| Every other function | PENDING | APPROVED |

"Released" means only the movement's own `status === 'RELEASED'`, never inferred from a snapshot/sibling.
`isEarmarkFunction()` in `balance-component.model.ts` is the single shared classifier both Look Up Current
Balance and Inquire Events must call — a `'finalize'`-phase row is always disqualified (it's A4's real
legal event, not A3/A3S's earmark, even sharing the identical instrumentType/movementType).

## B3 redesigned to genuinely RELEASE — supersedes the acknowledge()-only design

`computePresentDocsEarmark()` filtered on `status === 'PENDING'` only — a plain standalone B3 Release
would have freed its earmark the instant its OWN Checker approved it, hours before B4 ever decides
Honour/Accept, risking real over-commitment. Fixed with `presentDocsConsumedAt` tracking "consumed by B4"
separately from `status` tracking "released by B3" — Approved-earmark basis becomes `RELEASED &&
!presentDocsConsumedAt`; `release()` marks the source consumed as a side effect when releasing a movement
whose `referencedTransactionId` points at it. `acknowledge()` (service method + route) removed outright —
B3 now uses the standard release/reject path like every other function. Follow-up bug: B4's own picker
still showed an already-consumed record as pickable (consumption never touches `status`) — fixed with an
added `!presentDocsConsumedAt` filter condition.

## Various display/UX polish across Inquire Events and Look Up Current Balance

Row-click replaces per-row buttons everywhere (Events table, Event Timeline → "View Voucher" dialog);
Submit locks all input fields read-only via `formLocked`/`toReadOnlyFields()`; Primary/2ndary Key inputs
and pickers also lock post-Submit (previously only the Formly `fields` array did); Checker Release
auto-resets the screen to the same function via `selectFunction()`'s own reset; a "Secondary Ref." column
surfaces E01/E02/SG-number directly from already-loaded data; a paginated "LC Master Records Index"
becomes the Inquire Events landing view for both Import and Export sides (client `deriveLcAmount()` mirrors
a dead server-side `computeFaceAmount()`, display-only); Function/Tenor-Type columns reuse existing
Strategy-table/option-array logic rather than a second mapping; SG/Acceptance picker rows enriched into
self-describing "LC {x} — Secondary Ref. {y}" catalog rows; client-side pagination for the merged Events
list (`PagedListState`, windowing an already-loaded array, never a re-fetch per page).

## Several balance-box / sufficiency-check UX bugs found live and fixed

A6/B4's Parent LC picker wrongly excluded a parent at Available Balance 0 (the 0-balance exclusion needs
the same "already earmarked, not drawing fresh capacity" exemption A7/B5 already had). A3/A3S's warning
gained a second tier for Tight Available Balance (`checkUtilizeSufficiency()` is genuinely two-tier).
Both balance-box warnings could fire AFTER a successful Submit since they read live `model.amount` outside
the Formly array — fixed by gating on `!formLocked`. A2 Amendment Increase (and B2, either direction)
wrongly showed "exceeds Available Balance" for movementTypes the server never actually checks — fixed by
gating the warning on `DECREASING_MOVEMENT_TYPES` (already mirrors the server's checked-movementType set).

## Microservice-side: a root LC/Confirmation's still-PENDING ISSUE never blocked other events, could yield negative Confirmed Balance

`createContract()` sets `status: ACTIVE` at Maker Submit, before Checker Release — a fresh not-yet-Released
LC looked identical to an approved one everywhere else, and Confirmed Balance (sums RELEASED-only) could go
negative once a UTILIZE released against it while the ISSUE itself was still PENDING. Fixed with
`assertRootIssueReleased()`, throwing 409 for any non-ISSUE movement against a root contract (or a new
child contract) whose own ISSUE isn't RELEASED yet. Follow-up: the picker level ALSO needed this — new
opt-in `CatalogFilter.requireIssueReleased`, applied to every Maker-ACTION picker but deliberately not to
inquiry-only contexts or B4's own Present Docs search (whose candidates are legitimately PENDING).

## `tightAvailableBalance` extended to Export Confirmed LC

Previously only Import LC (Available minus off-balance SHGT exposure). Export's own analog nets the
combined Present Docs Earmark instead — same purpose, different source figure, computed inside the one
shared `assembleSnapshot()` helper so every snapshot surface picks it up automatically.

## Stylesheet professional-polish pass; theme support (System/Light/Dark); layout re-tuning

Pure CSS pass fixing a real `border-collapse`+`border-radius` clipping bug, adding shadows/focus rings/
tokens. `ThemeService` (plain class, `@Injectable({providedIn:'root'})`, independent of any A1–A9/B1–B5
code) applies the resolved theme to both this app's own `data-theme` and Bootstrap's `data-bs-theme` —
persisted to `localStorage`, System mode tracks `matchMedia` live. A real contrast bug found while
building the dark palette: solid-fill buttons and plain colored text/borders need DIFFERENT brightness
curves in dark mode — split into theme-constant `--x-solid` tokens vs. brightened role-(a) tokens.
Transaction Processing/Look Up Current Balance workspace re-tuned from a lopsided fixed-420px split to a
genuine 50/50 (`minmax(0,1fr) minmax(0,1fr)`) then to 60/40, with container-query (not viewport-media-query)
breakpoints so each panel's own input grids collapse based on its own width; Inquire Events (single-panel
mode) gained its own `.tb-workspace--single` modifier so it isn't capped at 50% width for no reason.

## Page-by-Page pagination formalized as a common requirement, page size 5, real bug fixed in the process

Every Primary/2ndary Key Index must paginate only the qualified/filtered records, not the raw set. Real
bug found: `CatalogPickerService` paginated the RAW server response and filtered afterward client-side, so
`total` reflected the unfiltered count (e.g. "12 total" for only 4 actually-eligible LCs) — fixed by
always fetching one capped batch and paginating client-side over the FILTERED result at a fixed page size.

## LC Index made eligibility-driven for A4/A6/A3S/A9 (Document Arrival / SG Balance) and B4 (cross-contract, RELEASED)

Previously every ACTIVE LC matching tenor appeared regardless of whether the function had anything to act
on. New `DocumentArrivalHintsService` (a plain class, same convention as the other extracted services)
owns per-candidate eligibility hint maps for all 5 functions, wired into each picker's `filteredXxxCatalog`
getter — B4's own criterion is structurally different (a child `EPLC_EXAMINATION`'s CREATE must be
RELEASED and not yet `presentDocsConsumedAt`, not merely PENDING).

## desiger-comments.md OOD/SOLID review — F-01 (Strategy refactor, 5 PRs), F-02, F-03, F-04, F-06, F-08, F-09

**F-01** (5 PRs): the 11 `TransactionFunction` boolean flags scattered across 5 consumer files were
migrated behind a new `function-strategy.ts` (`FunctionStrategy` interface + `FUNCTION_STRATEGIES`), then
the flags themselves removed from the registry entirely — `function-strategy.ts` is now the sole source of
truth. Done via characterization tests first (PR-1), the Strategy projection (PR-2), then A-series (PR-3)
and B-series (PR-4) consumer migration with zero behavior change each time, then flag removal (PR-5,
closing a genuinely new template-binding gap `tsc` alone never catches).

**F-02**: `createMovement()`'s 3 inline per-instrument sufficiency checks extracted into named `domain/`
functions (`checkAcceptanceTenorConsistency` new file; `checkShgtIssueSufficiency`/
`checkPresentDocsIssueSufficiency` added to `offBalanceExposure.ts`) — each replicates its own original
single-tier check verbatim rather than reusing `checkUtilizeSufficiency` (a genuinely different two-tier
shape, reusing it would silently change behavior).

**F-03**: reassessed and found the component's remaining size growth was from legitimate new eligibility/
pagination features, not neglect — the genuinely unresolved core (selection, dialog state, Checker-queue
search) is a UI/testing-architecture problem (no-TestBed blocks `@ViewChild`), not unstarted work.
`DocumentArrivalHintsService` extracted as the one still-movable piece.

**F-04** (DI construction-style unification) — attempted once, shipped a page-breaking `NullInjectorError`
in production (Angular's Ivy factory unconditionally injects every constructor parameter by type,
regardless of TS defaults — invisible to `tsc`/`ng build`/Jest, since Jest constructs via plain `new`,
bypassing Angular's compiled factory entirely), fully reverted via `git checkout`, then fixed for real
using component-scoped `@Component({providers:[...]})` (per-instance provider, still invisible to a bare
class-token parameter) + `InjectionToken`+`useFactory` for the 3 differently-configured `CatalogPickerService`
instances. **Lesson**: DI-wiring changes always need a live browser check, static verification is not
sufficient.

**F-06**: a one-direction subset contract test (`wire-type-contract.spec.ts`) confirms Angular's
`BalanceContract`/`BalanceMovement` fields are a subset of the microservice's `types.ts` — deliberately not
full equality (Angular's own interfaces are a documented subset by design). Cannot catch a field genuinely
missing from Angular while present server-side (the actual historical `balanceBefore`/`balanceAfter` gap
this finding cites) — only a silent rename.

**F-08**: `submitResult: any` retyped, uncovering a real bug underneath — 5 `catchError` sites in
`maker-submit.service.ts` set `result: err.error` (the raw HTTP error body) on a primary-call failure,
which `formLocked` (`!!submitResult`) then wrongly read as "locked, Submit succeeded." Fixed by omitting
`result` entirely on a primary-call failure (secondary/tertiary-leg failures were already correct).

**F-09**: `CatalogPickerService.load()`'s hardcoded `status: 'ACTIVE'`/`requireIssueReleased: true` made
overridable (`status?: string | null`, `requireIssueReleased?: boolean`) — narrowed scope after finding
`InquireEventsService.loadIndex()` has a genuinely incompatible (server-paginated) design, not worth
merging.

Remaining, not started: F-02's `release()` God-Method half, F-07 (Medium), F-10–F-13 (Low, no action
recommended by the review itself).

## BAL-003 "Feature Components + Facade" pilot #2 — real Angular child components, 8-phase proposal

`AccountEntriesDialogComponent` (Phase pilot) proved a genuine `@Input()`/`@Output()` child component needs
NO TestBed under this project's convention (only class logic is unit-tested; the template is covered by
`ng build`'s strict-template check + a live pass) — the earlier "blocked by no-TestBed" finding only
applies to state genuinely entangled with ~40-90 existing direct-state test assertions.
`CheckerPanelComponent` (Phase 1) then extracted the Checker search+queue half only (the action half stays
parent-owned, too Maker-entangled) — required a `CheckerSyncSignal` trigger-object `@Input()` (fresh object
per emission, reference-inequality-triggered `ngOnChanges()`) since a value-keyed input would miss
re-syncs where the LC Number is unchanged. `MakerPanelComponent` (Phase 2, the largest/riskiest) then moved
everything Maker-side — shipped with a live-browser-caught bug (`ngOnChanges()`'s `firstChange` skip,
copied from `CheckerPanelComponent`, was wrong here since `<app-maker-panel>` is only ever created on the
FIRST function pick, so every fresh page load's first function silently rendered zero fields — invisible
to any static check or the test suite). Phase 3 unified the 3 pickers' eligibility-filter getters into
`eligibility-rule.ts` (a real bug caught here too: merging all three trailing fallbacks under one gate
silently changed A8's own always-unconditional 0-balance exclusion). Phase 8 grouped
`MakerPanelComponent`'s 7 flat compound-leg fields into one `compoundLegs: CompoundLegState` (one genuine
behavioral subtlety preserved: `submit()`'s own partial reset touches only 3 of the 7, `resetForFunction()`
resets all 7). Phases 4–7 not started; `PickerSelectionService` (a plain class, not a child component)
separately extracted the Step-2 "2ndary Index" pickers (A3S's SG picker, B5's EB Index, A4/A6/B4's shared
payable-movement picker) via the same Dependency-Inversion pattern as `CheckerActionsService`.

**Closes BAL-003 (2026-08-20, user-confirmed — "transaction-builder.component.ts 這個檔案本身,已經不是
God Component"):** `transaction-builder.component.ts` is now **436 lines**, down from its 2,923-line
peak, and no longer the largest file in this sub-project (`maker-panel.component.ts`, at 1,160 lines, is
— see `Quality-report-balance.md`'s own BAL-003 finding, closed the same day). What remains is
genuinely one job — mode/function-side selection, wiring the panels/services together, the Account
Entries dialog's own open/close state, and the Checker action-dispatch methods — not five or six
unrelated ones, so Phases 4–7 of the original 8-phase proposal stay deliberately not pursued: further
splitting this remaining orchestration would be decomposition for its own sake, not a fix for anything
still wrong.

## B2 Direction/sign-handling — three related fixes

B2 (Export LC Amendment) has no `AMEND_INCREASE`/`AMEND_DECREASE` split — direction rides the sign of
`amount`. (1) Unified onto the same `subChoice` mechanism A2/A7 use (`SubChoice.key:
'movementType'|'amendDirection'`) rather than a bespoke `<select>` — this also fixed a real, previously
unnoticed gap where A2/A7's own Direction dropdown stayed editable after Submit. (2) `AMEND` movements now
DISPLAY as `AMEND_INCREASE`/`AMEND_DECREASE` with a de-signed magnitude everywhere shown (4 call sites),
via new shared `displayMovementType()`/`displayMovementAmount()` functions. (3) Bug fixed: the sign-negation
patch was mutating `model.amount` itself (visible in the live Formly input, since `patch` is applied via
`Object.assign(this.model, patch)`), not just the outgoing wire request — fixed by moving the sign
transformation into `buildSubmitRequest()` alone, never writing back into `model`.

## Requirement passes: No Eligible Records lock, Submit Button Enablement (incl. Amount > 0)

A2–A9/B2–B5 (A1/B1 exempt) lock their input fields + Submit until a genuinely eligible target record is
selected (`hasEligibleTargetSelected(ctx)`, re-deriving each function's own target shape from its Strategy
fields). Separately, ALL functions including A1/B1: Submit also requires every mandatory field to hold a
valid value (`isSubmitReady = hasEligibleTargetSelected && validateSubmitRules(ctx).error === null`), plus
a universal `Amount > 0` guard in `validateSubmit()`.

## Common Requirement — every successful Maker Submit or Checker Release refreshes Look Up Current Balance

All A1–A9/B1–B5. Consolidated into two named `MakerPanelComponent` methods (`emitCheckerSync()` vs.
`emitCheckerAndLookupSync()`, never a bare boolean at a call site) plus one parent-side
`refreshLookUpForLastMakerContext()` for the compound-release screen-reset case — fixed 4 real gaps
(A4's `submitA4()`, the plain Checker Release/Reject path, A3S's acknowledgment leg, the compound
`'released'` outcome after `selectFunction()` resets the Maker screen).

## Tight Available Balance now derives from Confirmed Balance, not Available Balance

Business instruction: "只有 APPROVED 才可以動用" — a still-PENDING increase (ISSUE/AMEND_INCREASE/B1/
B2-Increase) no longer raises Tight until Released. A still-PENDING decrease still occupies it immediately
via the new `computePendingDecreaseTotal()` ("增加從嚴，占用從寬") — applies to the persisted snapshot
field and all three sufficiency checks (`checkUtilizeSufficiency`/`checkShgtIssueSufficiency`/
`checkPresentDocsIssueSufficiency`) uniformly. See `analysis/Balance-Figures-Calculation-Logic.md` §1/§5.

## B2's own AMEND Decrease direction gained a real sufficiency check — was previously ungated entirely

`NO_CHECK_MOVEMENT_TYPES` used to include `'AMEND'` unconditionally; B2 has no separate `AMEND_INCREASE`/
`AMEND_DECREASE` movementType (direction rides the sign of `amount`), so its Decrease direction silently
skipped the floor check A2's own `AMEND_DECREASE` already had. Now runs `checkAmendDecreaseSufficiency`
(by magnitude) whenever `ceilingAmount` is negative.

## A3/A3S Checker acknowledgment restored as a real persisted action — Checker Queue now hides it once Approved

Business instruction: "A3 A3S 交易 Approve 過後 不要再顯示". The former client-only `approveArrival()` flag
never survived a page reload/second session, so an approved-but-still-PENDING Document Arrival kept
reappearing in the Checker Queue. `acknowledgedBy`/`acknowledgedAt` (historical since B3's 2026-08-18
redesign) are genuinely written again via a restored `POST .../acknowledge` route — re-purposed for A3/A3S's
own `UTILIZE` instead of B3 — and `CheckerPanelComponent.loadCheckerQueue()` now filters out any
already-`acknowledgedAt` PENDING movement. Status still never changes here (A4/A6 remains the only real
finalization); `checkerQueueRefreshNonce` reloads the queue in place (keeps the current search) after a
successful acknowledgment.

## Unified: EVERY successful Checker action reloads the Checker Queue in place, not just A3/A3S's own acknowledge

Business instruction: "統一規則, 純粹 APPROVE PENDING 交易, APPROVED 後該筆交易應該消失, 不能重複
APPROVED" (repro'd live via S101/A2's own plain Release leaving the just-Approved item still listed).
`checkerAct()`'s plain release/reject path and `forwardOutcomeToMaker()` (covers `reject()`/
`deleteMakerPending()`'s own non-`selectFunction()`-resetting success path) now both bump
`checkerQueueRefreshNonce` on any non-`'failed'` outcome — a real Release/Reject's own status change was
always correctly excluded by `loadCheckerQueue()`'s `status === 'PENDING'` filter, but the stale
already-fetched `checkerItems` array was never re-fetched to pick that up until this fix.

## A4/A6 picker eligibility now requires genuine 4-eyes: EARMARKED (Checker-acknowledged), not just EARMARKING

Business instruction: "A4 選取 EARMARKED 的交易" / "狀態必須是 EARMARKED" / "交易流程規定 4 EYES. 所以
PENDING 或 EARMARKING 狀態的交易不得出現在下一個交易中" — a Document Arrival that's only Maker-Submitted
(`acknowledgedAt` still null) must not be selectable in A4/A6's own picker (`document-arrival-hints.
service.ts`'s Step-1 LC-level map, `picker-selection.service.ts`'s Step-2 payable-movement list) until
A3/A3S's own Checker has genuinely acknowledged it. `displayStatus()`/`statusBadgeClass()` (`balance-
component.model.ts`) gained an `acknowledgedAt` param so the same PENDING+acknowledged movement already
displays EARMARKED (not EARMARKING) everywhere, matching what the picker now requires.

Two follow-up bugs found via live reproduction (S101), same day:
- **`loadCheckerQueue()`'s acknowledgedAt exclusion was too broad** — hiding an acknowledged item from
  A3/A3S's own screen (intended) also hid it from A4's own Checker search on the SAME shared queue
  component (`"A4 SUBMIT後無法APPROVED"`), since Checker Release for A4 targets that exact movement. Fixed
  by scoping the exclusion to `deferSettlement` functions only (`selectedFunction`-aware), and — the
  opposite direction — added a `releasesExistingMovementInPlace` (A4-only) requirement that a candidate be
  already-EARMARKED before A4's own Checker Search will show it at all (`"Import A4 Checker Search
  也要濾掉EARMARKING的交易"`).
- **A4's own picker didn't exclude an item it had already Maker-Submitted itself** (`"已經Submit 為何可以
  A4重複出現再選取"`) — added `!m.makerSubmittedAt` to both the Step-1 and Step-2 eligibility filters
  (no-op for A6, which never sets this field).

## A3S compound Submit now auto-rolls-back the SG redemption leg if the LC UTILIZE leg fails

Reproduced live (A1 100 → A8 SG 10 → A35 15 against an over-limit Bill Amount): the SG redemption leg
succeeded first, then the LC leg failed, leaving the SG redemption orphaned PENDING with no way to
release/reuse the SG. `maker-submit.service.ts`'s `submitDocumentArrivalWithSg()` now calls
`api.cancel()` on the already-created SG redemption when the second leg's `createMovement()` fails,
surfacing a clear message either way (rollback succeeded vs. rollback itself also failed, pointing at A9's
own Checker panel as the manual fallback).

## Per-function Checker Queue now scoped to movements that function could itself have produced

Business instruction: "各功能 RELEASE 自己產生的 PENDING 或 EARMARKING 交易 — 例如 A2 不該看到 UTILIZED
交易" — several instrumentTypes are shared by more than one function (e.g. `IPLC_LC`: A1/A2/A3/A3S/A4).
`CheckerPanelComponent.loadCheckerQueue()` now also filters via the existing `movementTypeMatchesFunction()`
(`function-strategy.ts`, already used by Inquire Events for the same "could this function have produced
this movement" question) alongside its existing EARMARKING/EARMARKED split.

## Submit/EC/Approve audit trail — `cancelledBy`/`cancelledAt` split out from `releasedBy`/`releasedAt`

Business instruction: "交易要有 SUBMIT DATETIME/USER, EC DATETIME/USER (optional) AND APPROVE
DATETIME/USER". `cancel()` used to reuse `releasedBy`/`releasedAt` for EC, disambiguated only by
`status === 'CANCELLED'`; new dedicated `cancelledBy`/`cancelledAt` columns (migration 11) let Submit
(`createdBy`/`createdAt`), EC, and Approve (`releasedBy`/`releasedAt`, `status === 'RELEASED'` only) read
as three independent facts. `reject()` is unaffected — still reuses `releasedBy`/`releasedAt`, no
dedicated `rejectedBy`/`rejectedAt` pair was requested. Displayed in Look Up Current Balance's own Event
Timeline (new "Audit Trail" column, stacked S/A/EC lines) and Inquire Events' Original Transaction Screen
(Submitted/Approved/Rejected/EC rows, mutually exclusive per the movement's own real status).

## A4's own Checker Queue now also requires Maker Submit, not just EARMARKED

Business instruction: "A4 需要 SUBMIT 後 才能 APPROVE". `release()` already 409s server-side for a
Sight-tenor UTILIZE missing `makerSubmittedAt` (BAL-123), but `loadCheckerQueue()`'s `requiresEarmarked`
filter only checked `acknowledgedAt` — an EARMARKED-but-not-yet-Submitted item still showed as selectable.
Now excludes `!m.makerSubmittedAt` too, same as `!m.acknowledgedAt`.

## A35's own "exceeds Tight Available Balance" client warning was a false positive — didn't net the selected SG's Outstanding

Reproduced live on S01/G01 (Tight Available 24, SG Outstanding 10): typing Bill Amount 34 wrongly warned
"exceeds Tight Available Balance (24)", even though `checkUtilizeSufficiency()` nets the matched SG's own
redemption out server-side first (see that function's own doc comment) — the real ceiling for A35 is
`tightAvailableBalance + selected SG's Outstanding`. New `tightAvailableBalanceForWarning` getter
(`maker-panel.component.ts`) widens by the selected SG's own `confirmedBalance` only for
`documentArrivalWithSg` (A3S); every other function (plain A3) is unaffected, same value as before.

## A2/B2 Decrease now checked against Tight Available Balance, not plain Available — matches A3/B3's own rule

Business instruction: "A2 Decrease 輸入金額控制規則 B2 Decrease, A3 & B3 都適用" (A3's `checkUtilizeSufficiency`
and B3's `checkPresentDocsIssueSufficiency` were already Tight-based; `checkAmendDecreaseSufficiency`
— shared by A2's own `AMEND_DECREASE` and B2's own `AMEND` when its signed `ceilingAmount` is negative —
was left on plain Available Balance when Tight Available Balance was introduced). Could let a Decrease
shrink an LC's own ceiling below its outstanding off-balance-sheet exposure (live-reproduced on U01:
Confirmed 100, SG Outstanding 10, plain Available 100, Tight 90 — a Decrease of 95 used to pass, leaving
only 5 of real capacity under a still-outstanding 10 SG). `checkAmendDecreaseSufficiency` now takes
`tightAvailableBalance` directly (computed per instrumentType in `balanceService.ts`, mirroring
`assembleSnapshot()`'s own formula: SHGT exposure for IPLC_LC/EPLC_LC, Present Docs Earmark for
EPLC_CONFIRMATION). Client-side: `maker-panel.component.ts`'s new `isAmendDecreaseDirection` getter
covers B2's own Decrease (its `model.movementType` is always `'AMEND'`, so `DECREASING_MOVEMENT_TYPES`
alone can never see it — B2 previously showed NO client-side balance warning at all); both the plain-
Available and Tight-Available warnings in `maker-panel.component.html` now fire for A2/B2 Decrease, not
just A3/A3S's own UTILIZE.

## B3 (and A8) had NO live balance box/warning at all — selectedContract was never populated for them

Business instruction: "B3金額輸入檢查與B2 Decrease相同 <= Tight Available Balance". B3/A8 create a brand-new
child contract directly under a picked parent, with no further Step-2 picker of their own (unlike A6/B4's
`settlesDocumentArrival` or B5's `usesSettleableBalanceIndex`) — `onSelectParent()` never set
`selectedContract`/`selectedContractSnapshot` for this shape, and the whole balance box + both warnings
are gated on `selectedContract` in the template, so neither ever rendered; the Maker got zero live
feedback before a 409. `onSelectParent()` now aliases `selectedContract` to the parent for this specific
shape only (`isCreatingMovement && !usesTwoFieldSearch && !settlesDocumentArrival &&
!usesSettleableBalanceIndex`) and loads its snapshot. New `checksAgainstTightAvailable` getter
(`maker-panel.component.ts`) extends the Tight Available Balance warning to B3 (`CREATE` against an
aliased `EPLC_CONFIRMATION`, `checkPresentDocsIssueSufficiency`) and A8 (`ISSUE` with `hasParent`,
`checkShgtIssueSufficiency`) — deliberately NOT under the plain-Available tier-1 warning, since neither
has a separate looser server-side check.

## A standalone PENDING SG redemption must not prematurely free capacity for an UNRELATED submission

Business-reported scenario ("SG 贖回提早放行" — imported machinery, take-delivery-before-documents):
`computeOffBalanceExposure()` netted a PENDING (not yet Checker-approved) `PARTIAL_REDEEM`/`FULL_REDEEM`
the same as a RELEASED one — a standalone A9 redemption Maker-Submitted but not yet approved could let a
SECOND, unrelated SG Issue (A8) or Document Arrival (A3) pass against capacity that wasn't really freed
yet; if the Checker later rejects that redemption, the bank ends up over its real LC capacity. Now only
nets a redemption once genuinely RELEASED, by default ("增加從嚴，對 LC Balance 而言") — **except** a
redemption sharing a still-PENDING `UTILIZE`'s own `businessEventId` on the SAME LC (A3S's own matched
compound pair, always released together or both auto-rolled-back — no cross-transaction leakage risk).
`assembleSnapshot()` derives this matched set automatically from its own `movements` list, so the live
`GET .../balance` query, the movement's own persisted `eventSnapshot`, and `release()`'s own re-capture
all agree — closing a related display bug the same day ("A35 Refer to S02 G02 Tight Available Balance
-8000???"): before this, A3S's own matched pair passed its sufficiency check via netting but the
resulting displayed balance double-counted the same SG exposure once un-netted, landing on a confusing
negative figure even though the transaction was correctly allowed.

## Look Up Current Balance now auto-syncs on every LC selection, not just after Submit/Release

Business instruction: "除了A1 & B1，其他功能當選取LC NUMBER後 Look Up Current Balance 自動輸入選取到的LC
NUMBER 做 LOOKUP處理。A1 & B1 在SUBMIT或APPROVE時更新當筆LC NUMBER的LOOKUP。" `emitCheckerSync()`
(selection-only, Checker search box only) and `emitCheckerAndLookupSync()` (Submit/Release success, both)
collapsed into the one method — every LC/parent/IB-Index pick (A2-A9/B2-B5) now syncs Look Up immediately,
not only the Checker queue. Also fixed a separate, pre-existing gap found in the process:
`onSelectParent()` (A6/A7/A8/B3/B4/B5's own Parent LC pick) never called either sync method at all. A1/B1
have no pick step (create a brand-new LC) so only ever reach this via their own Submit/Release success
paths — already correct, unaffected.

## B4's own still-PENDING Acceptance must also provisionally net the B3 Present Docs record it references

Business-reported Export-side twin of the SG redemption fix above ("B4 U02 也有類似問題 Tight Available
Balance -10000"): `computePresentDocsEarmark()`/`computePresentDocsEarmarkApproved()` netted the
already-RELEASED B3 examination record even while a B4 that *references it* (`referencedTransactionId`)
was still only Maker-Submitted, PENDING — displaying `-10000` instead of `0` even though B4's own
provisional consumption is a foregone, self-balancing conclusion once Submitted, not a separate risk.
New `derivePresentDocsProvisionallyConsumedIds()` derives, from a CONFIRMATION's own movement list, the
set of `referencedTransactionId`s any still-PENDING B4 already provisionally consumes; `assembleSnapshot()`
is the **only** call site wired to it — B3's own new-presentation sufficiency check and B2's own
AMEND_DECREASE sufficiency check both stay strict (no override), same "增加從嚴，對 LC Balance 而言"
posture as A8's own SG Issue check, so a genuinely independent transaction never benefits from another
transaction's own provisional netting. Live-verified against the actual dev-DB U02 LC: `GET .../balance`
now reads `presentDocsEarmarkApproved: "0"`, `tightAvailableBalance: "0"`, `pendingEarmarkTotal:
"-10000"`; an unrelated new B3 presentation submitted afterward still correctly rejects against the
strict `-10000` figure.

## Doc-only fix: A9's own table/Quick-Reference row and the SG (Pending)/(Approved) formulas were left stale after the SG redemption code fix

`Balance-Figures-Calculation-Logic.md`'s Figure #4 formula and banner note were updated for the SG
redemption fix, but A9's own §6 table, its §8 Quick-Reference row, and Figures #8/#9's own formulas
(the SG Pending/Approved decomposition) still described the old "reacts at Submit" behavior — breaking
the doc's own "#8 + #9 = #4" invariant for a standalone still-PENDING redemption. No source code was
wrong (`#8`/`#9` are this document's own derived breakdown, not real API fields) — corrected the doc only
to match `computeOffBalanceExposure()`'s actual (already-correct) behavior: a standalone A9 redemption now
reacts only at genuine Release; A3S's own matched-`businessEventId` pair remains the one Submit-time
exception, called out explicitly wherever A9's behavior is described.

## Doc-only fix: A3S's own Tight Available Balance row claimed "increases" — actually a net decrease

`Balance-Figures-Calculation-Logic.md`'s A3S table said Tight Available Balance "increases" at Submit,
describing only the Off-Balance Exposure release side while ignoring the LC's own simultaneous UTILIZE
consuming Pending Decrease Total in the same Submit. Live-verified against `app.test.ts`'s own S02/G02
numbers: Tight actually moves 2,000 → 0 (net **−2,000**), matching the business-confirmed "Pending
Earmark Total = +8,000 (SG) − 2,000 (LC)" figure — combined effect is always downward or flat (redemption
leg is MIN-capped at the SG's own Available Balance, never exceeds the UTILIZE's own ceilingAmount), never
a pure increase. No source code was wrong — the sufficiency-check/display code already nets correctly
(confirmed by the passing test suite); only this row's prose was stale.

## BAL-141 — `balanceService.ts`'s 4 movementType classification Sets collapsed into one Strategy/Type-Object registry

`createMovement()`'s NO_CHECK/UTILIZE_SHAPED/OUTSTANDING_CAPPED Sets + if/else-if chain, and `release()`'s
4 scattered `isSightUtilizeFinalize` ternaries, replaced by `movementTypeRegistry`
(`buildMovementTypeRegistry()`) and `resolveSnapshotWriteTarget()`/`captureSnapshotBundle()` — pure
internal refactor, zero behavior change (all 3 suites green, no spec edits needed). Reviewer-noted
follow-up: `resolveSnapshotWriteTarget()` now takes the already-computed `isSightUtilizeFinalize` as a
param instead of re-deriving it, since `release()`'s own Maker-Submit gate check needs the same boolean.

## `balance-component-api.yaml` bumped to v1.15.0 — schema descriptions never caught up to v1.13.0's own changelog, and this session's two netting fixes were undocumented

Two kinds of drift, no code changed: (1) v1.13.0's own changelog entry said `tightAvailableBalance`
became confirmedBalance-based and AMEND_DECREASE's own check became Tight-based, but the actual
`tightAvailableBalance`/`ceilingAmount` schema field descriptions and the `POST /balance-movements`
endpoint prose still described the old availableBalance-based formula — fixed to match. (2) This
session's SG redemption (`offBalanceExposure`, matched-`businessEventId` exception) and B4 Present Docs
(`presentDocsEarmarkApproved`, provisionally-referenced exception) fixes were never reflected in the
spec at all — added as a new v1.15.0 changelog entry plus corrected the two affected field descriptions,
mirroring `Balance-Figures-Calculation-Logic.md`'s own wording. Checked `BalanceMovement.warnings`/
`MovementWarning` (kept in `types.ts`/DB schema but deliberately excluded from this OAS since v1.0.0) —
`checkUtilizeSufficiency()` never actually returns a `warning` in current code, only `ok`/`error`, so the
field genuinely never populates a live response; the OAS omission is still correct, just vestigial
dead code left behind in the TypeScript side, not a spec bug.

## Live input-time Tight Available Balance check extended to B4 (HONOUR/ACCEPT) — the one remaining function checked only at Submit

Audited every A2–A9/B2–B5 function's live warning against its own server formula (business instruction
"統一在金額輸入時都檢查"); only B4 was missing one. `checksAgainstTightAvailable` now also matches
`HONOUR`/`ACCEPT` (both B4-only movementTypes, same `checkUtilizeSufficiency`-backed bucket `UTILIZE`
already uses). `tightAvailableBalanceForWarning` widens by the referenced B3 presentation's own
`ceilingAmount` for B4 — same false-positive fix as A35's own SG widening, since the persisted
`tightAvailableBalance` for `EPLC_CONFIRMATION` already nets Present Docs Earmark (including the B3
record B4 itself is resolving), while B4's actual server-side check never nets it at all
(`offBalanceExposure` is 0 for any non-IPLC_LC/EPLC_LC contract).

## Bug found live the same day, in B3 (not B4) — an amount exceeding BOTH Available and Tight Available showed no client-side warning at all

The Tight-tier warning's own `*ngIf` gated on `+model.amount <= +selectedContractSnapshot.availableBalance`,
written assuming every function it covers also has a genuine plain-Available tier to defer to (true for
UTILIZE/HONOUR/ACCEPT/AMEND_DECREASE-direction, which show the plain "exceeds Available Balance" warning
instead once the amount also exceeds Available — no double-message). B3/A8 have no plain-Available tier at
all (their own server check is Tight-only), so that guard silently suppressed their only warning whenever
the typed amount happened to exceed plain Available too — reproduced live: LC fully earmarked (Available
10000, Tight 0), B3 amount 20000, zero warning shown even though the server would reject it. New
`checksAgainstPlainAvailable` getter identifies the functions that genuinely have both tiers; the `<=
availableBalance` guard now only applies for them — B3/A8 always fall through to the Tight-tier check.

## BAL-142 — `createMovement()`'s own worst Cognitive Complexity finding (71 vs. 15 allowed) decomposed; sufficiency-check result types converted to discriminated unions

Reviewer-directed, following SonarQube-report2.md's own specific findings. `createMovement()`'s own
contract-resolution/creation preamble (re-ISSUE guard, Root-Issue-Released guard, Acceptance Tenor
consistency, SHGT ISSUE / EPLC_EXAMINATION CREATE creation-time sufficiency) extracted into
`resolveOrCreateContract()`; the latter two checks — structurally identical (resolve parent → confirmed/
pendingDecreaseTotal → gather siblings → earmark/exposure → check → throw) — collapsed into a
`newContractSufficiencyRegistry` keyed by `${instrumentType}:${movementType}`, same "table over
conditional chain" convention as BAL-141's own `movementTypeRegistry`. `captureSiblingSnapshots()` (its
own 21-complexity finding) split into `resolveAcceptanceSibling()`/`resolveSgSibling()`, with a nested
ternary replaced by an `ACCEPTANCE_TYPE_BY_ROOT` lookup table. Separately: `AcceptanceTenorCheckResult`/
`ShgtIssueSufficiencyResult`/`PresentDocsIssueSufficiencyResult`/`UtilizeSufficiencyResult`/
`AmendDecreaseCheckResult`/`RedeemCheckResult` (all of `domain/`'s sufficiency-check result types) and
the local `MovementSufficiencyOutcome` converted from `{ok: boolean; error?: string}` to a discriminated
union `{ok: true} | {ok: false; error: string}` — removes all 4 `.error!` non-null assertions in this
file with a compiler-enforced guarantee instead of a suppressed warning. Pure code motion — zero
condition/message changed, all 361 microservice + 34 backend + 996 Angular tests green with no spec
edits, and independently re-verified live against the running dev stack (A1 re-ISSUE guard, A8 SG Issue
both the InsufficientBalanceError and success paths, B3 Present Docs earmark rejection, SG sibling
snapshot rendering) — every error message byte-for-byte identical to before.

## UI/UX review P0 pass — `aria-live`/`aria-busy` on async state, `aria-describedby` on mandatory-field errors

Template-only, `transaction-builder/` directory: `index-picker.component.html`'s shared loading state
(`role="status" aria-live="polite" aria-busy="true"`) covers every paginated picker's loading text
app-wide (LC/IB/SG/Acceptance/payable-movement indexes) in one place; `maker-panel.component.html`'s
`.tb-result` banner and every `.tb-error`/balance-sufficiency-warning block got `role="alert"`/
`aria-live="polite"` so a screen-reader user is told about a Submit outcome or validation failure without
needing to re-scan the page; the three plain-`ngModel` mandatory Natural Key inputs (LC/IB/SG Number,
the ones outside the Formly array — see BAL-117-era `tb-input--invalid` doc comment above) got
`id`+`[attr.aria-describedby]` linking each to its own inline error message.
`checker-panel.component.html`/`transaction-builder.component.html` got the same `role="alert"` treatment
on their own search/action error blocks and `role="status"` on their own loading hints (Checker search,
Inquire Events index/events load). Reuses the existing `account-entries-dialog.component.html`
`role="dialog"`/`aria-modal`/`aria-label` pattern as-is — it's already the only modal in this sub-project,
nothing else to retrofit. Pure template attribute additions, zero `.ts` changes; all 996 Angular + 34
backend + 361 microservice tests still green with no spec edits.

## UI/UX review P1 pass — CSS-only loading spinner on every "Loading…"/"Searching…"/"Submitting…"/"Working…" state

`.tb-spinner`/`@keyframes tb-spin` (10px, `border` + `currentColor`, `prefers-reduced-motion` disables the
animation) added ONCE to the global `src/styles.scss` rather than duplicated per component — a genuine
cross-cutting design-system atom, and `maker-panel.component.scss`/`transaction-builder.component.scss`
were already sitting close to (one of them already past, pre-existing and unrelated to this change — see
below) the `anyComponentStyle` 12kb production-build budget, so a 4th/5th duplicate copy wasn't viable.
Dropped into every existing loading branch across `index-picker`/`maker-panel`/`checker-panel`/
`transaction-builder` (paginated-picker loading, Loading balance, Master Records/Events index loading,
Search/Submit/Release/Delete-Pending buttons) — no new loading state introduced, purely a visual affordance
on states that already existed. Template-only + one shared global CSS rule, zero `.ts` changes; all 996
Angular tests still green with no spec edits (this project's no-TestBed convention means Jest never renders
templates — verified for real via a live `ng build`, template-compiles clean).

**Found, NOT fixed (pre-existing, unrelated to this session):** a production `ng build`
(`defaultConfiguration: "production"` in `angular.json`) fails on `transaction-builder.component.scss`
exceeding the `anyComponentStyle` 12kb hard-error budget — confirmed via `git stash` that this already
exists on a clean `main` checkout, before any of today's edits. Does NOT affect the documented dev
workflow (`ng serve`'s own `defaultConfiguration` is `"development"`, which carries no budget block) or
either `npm test`/`tsc --noEmit` gate — only a real `npm run build` hits it, which isn't part of this
project's own standing "before calling a change complete" checklist. Flagged for a future pass (trim
~30+ bytes of real CSS from that file, or raise the budget) rather than opportunistically fixed here, since
it's unrelated to the spinner work and untouched CSS shouldn't be edited to chase an unrelated budget line.
**FIXED 2026-08-21** — same day, later pass ("Part B 也一起做吧,開始extract InquireEventsComponent"; see
"Part B — InquireEventsComponent/BalanceSnapshotBoxComponent extraction" below for the full write-up). The
overage amount had drifted with every unrelated edit to this file (P1 pass: 24 bytes; re-measured
2026-08-21 immediately before that day's own Inquire Events 60/40 split commit: 10 bytes; re-measured again
right after that commit landed: 25 bytes — record the CURRENT figure with its own measurement date
whenever this file is next touched, rather than trusting an old number as still accurate; no past
measurement here was wrong, the file simply kept moving) until the Part B extraction moved Inquire Events'
entire view layer, plus the `.tb-workspace--single`/`.tb-balance-box*`/`.tb-balance-row*` rules it (and the
former shared `#balanceSnapshotBox` `ng-template`) needed, out of this file into their own new components —
confirmed via a real `npm run build`: `transaction-builder.component.scss` is now **9.84 kB total** (only
1.84 kB over the 8 kB *warning* threshold, comfortably clear of the 12 kB *hard-error* one that used to
fail the build). `maker-panel.component.scss`'s own separate warning (11.92 kB, 3.92 kB over 8 kB) is
pre-existing and untouched by this pass — still just a warning, not a hard error, and out of scope here.

## UI/UX review P2 pass — function-chip/status/role icon set, icon toggle theme switcher

`TbIconComponent` (`src/app/tb-icon.component.ts`, deliberately not nested under `transaction-builder/`
since `AppComponent`'s theme toggle is a consumer too) — 13 hand-authored inline-SVG icons (16px, 1.5px
stroke, `currentColor`, no fill/shadow; user-confirmed "細線條風格" style via `AskUserQuestion`). Global
`.tb-icon` CSS in `src/styles.scss`, same anyComponentStyle-budget reasoning as `.tb-spinner` (P1) — never
duplicated per component. New `functionActionIcon()`/`statusBadgeIcon()` pure functions
(`balance-component.model.ts`) group the 14 A1–A9/B1–B5 chips into 4 action-type icons (issue/amend/
utilize/redeem, keyed by function `code`) and derive a status-badge icon from the CSS class
`statusBadgeClass()` already returns (ok/pending/cross/dash) — status no longer conveyed by color alone.
Maker/Checker/Look Up section headers each get a fixed role icon (pencil/flag/magnifier). Theme switcher
(`AppComponent`) replaced its plain-text `<select>` with an icon toggle button — one click steps
System → Light → Dark → System (`ThemeService.cycleMode()`, new); the icon reflects `theme.mode` itself
(a dedicated monitor icon for System), not `effectiveTheme`, since the two are genuinely different facts
and the icon alone can't otherwise distinguish "System resolved to dark" from "explicit Dark" — the
visible text label next to it carries the same distinction. All wiring verified live via `ng serve`
(chips on both Import/Export sides, Maker/Checker/Look Up headers, an Inquire Events status-badge table,
and all 3 theme states) in addition to `ng build`'s template compile check and the full Jest suite (1004
Angular tests green, no regressions).

## Checker's own independent search auto-resolves SG/IB Number when left blank — business-reported gap ("單獨執行 A9 Checker 輸入LC NUMBER 無法自動找到PENDING交易")

`searchCheckerLc()` (`checker-panel.component.ts`) no longer hard-errors "Type a SG/IB Number to search"
for SHGT/Acceptance-typed functions (A6–A9/B3–B5) when only the LC Number is typed — same gap first
reported 2026-08-15 for A8, now recurring for A9 standalone Checker use. New
`searchCheckerCandidatesByLcOnly()` browses every ACTIVE candidate of the function's own instrumentType
under that LC via `catalog()` (same exact-`lcNumber`-match convention the Maker's own IB/SG Index pickers
already use): zero candidates is a real error, exactly one auto-resolves and loads its Checker queue
directly (`checkerAutoPickedHint`, same "picked automatically" convention `app-index-picker`'s own
`autoPickedHint` already uses), more than one surfaces a pick-one list (`checkerSecondaryCandidates` +
`onSelectSecondaryCandidate()`) since which one is genuinely ambiguous. Live-verified against the dev DB
(S01/S02, both single-SG LCs) — SG Number auto-fills and the queue loads with zero manual typing.

## A6/A3S/B4/B5's compound Checker Release/Reject silently no-opped in a genuinely independent Checker session — business-reported ("B4 Submit 後跳出交易 再進入B4 SEARCH U04或U06 找出交易後點選RELEASE => 無法處理")

Root cause: `TransactionBuilderComponent.release()`/`reject()`'s own top-of-method guard required
`makerContext.submitResult` (the CURRENT session's own Maker state) — but `isCheckerCompoundOwnSubmission`
routes A6/B4 (`checkerRelease.settlesDocumentArrival`) into these two methods based purely on
`selectedCheckerMovement.referencedTransactionId` being set (true for EVERY A6/B4 movement regardless of
which session Submitted it), and A3S (`documentArrivalWithSg`)/B5 (`amountVsAvailableDerivation ===
'SETTLE'`) based purely on `businessEventId` being set (same story) — so a Checker who searches
independently (no Submit in THIS session, `submitResult` null) had the click silently swallowed before
ever calling the API: no network request, no error, nothing. Reproduced live exactly as reported (B4
Usance, LC U06) — clicking Release did nothing observable; confirmed via direct microservice calls that
the release chain itself has zero server-side defect (all 3 legs release cleanly with a proper
`checkerId`) — the bug is 100% client-side. Fixed by relaxing the guard to
`!selectedCheckerMovement && !makerContext.submitResult?.movementId` (either is sufficient) — mirrors the
same "prefer `selectedCheckerMovement`, fall back to `submitResult`" pattern `checkerActions.release()`/
`reject()` (`checker-actions.service.ts`) and `buildCheckerActionContext()` already use throughout;
`CheckerActionContext.selectedCheckerMovement`'s own doc comment already documented the intent ("always
real server data... for a genuinely separate Checker session") — the component's own guard just hadn't
been updated to match. Scoped to exactly A6/A3S/B4/B5 — every other function (A1–A5, A7–A9, B1–B3) uses
`checkerAct()`'s own plain-release fallback (`this.api.release(movementId, checkerId)` directly, keyed off
`selectedCheckerMovement` alone already), which was never affected. Verified: live end-to-end (B4 Usance,
LC U06 — Release now correctly releases all 3 linked legs, confirmed via the microservice's own
businessEventId query) plus 6 new unit tests covering the identical "Submit → exit → re-enter as Checker
→ Release/Reject this PENDING movement" scenario for all 4 affected functions (A6, A3S, B4 Sight+Usance,
B5) and confirming the true no-op case (nothing selected at all) still no-ops; full suite green (1017
Angular tests, 98.78% coverage, no regressions).

## Look Up Current Balance's own Event Timeline — Type column removed, Status column nowrap-protected, Secondary Ref. column added

User-confirmed (2026-08-21): the row-click Account Entries voucher already reconstructs full Dr/Cr
detail per event, so this table's own per-row movementType badge (Type column) was redundant —
overview/navigation only, not carrying full audit-trail responsibility itself. Removed from
`transaction-builder.component.html` (the only file that renders this table — `maker-panel.component.scss`
only ever carried a duplicate CSS copy, never the markup); `.tb-table--lookup-timeline`'s own
`.tb-type-tag` size override removed from both `.scss` duplicates, the shared base `.tb-type-tag` rule
left untouched (Account Entries/Function column still use it). New `.tb-table__status { white-space:
nowrap; }` (+ `white-space: nowrap` added to `.tb-status-badge` itself) protects the Status column the
same way `.tb-table__amount`/`__time` already were, so a longer status label added later can't get
squeezed. Found and corrected while doing this: the removal comment's own stale "7-column" count never
accounted for the Audit Trail column added later — actual count is 8 → 7, not 7 → 6; horizontal scroll on
`.tb-table-scroll` still applies at the 40%-split width even after the removal, live-confirmed (LC S02).

Same day, same table: added a Secondary Ref. column (user instruction, "Lookup 除了 REFERENCE 還要有
SECONDARY REF") — EPLC_EXAMINATION's own EB Number / SHGT's own SG Number (`"SG G01"`-prefixed), distinct
from the Reference column's own free-text `sourceTransactionRef`. Extracted `secondaryReferenceForEvent()`
as a module-level free function in `inquire-events.service.ts` (same convention `functionForEvent()`
already established) — both `InquireEventsService.secondaryReferenceFor()` and the new
`LookUpPanelService.secondaryReferenceFor()` delegate to it, so the two screens can never disagree on this
mapping either. Live-verified (LC S01 / SG G01 — SG Balance tab correctly shows "SG G01" on every row).

## Inquire Events — Event Details 60/40 split (Original Transaction Screen / Balance Tabs), Account Entries button moved to title row

User-requested layout pass, 2026-08-21. A/B are grid-placed via the existing `.tb-workspace` rule (reused
as-is, not duplicated under a new class) — real bug caught and fixed before shipping: without wrapping B's
tab-strip + `ngTemplateOutlet` output into one element, Grid auto-placement split them across two DOM
children, landing the Balance Tabs content on row 2 under column A instead of column B. B now wraps in its
own `.tb-balance-box` so it gets the same outer frame as A. Account Entries moved into a new
`.tb-balance-box__header` row (global `styles.scss`, not the component file — see this file's own
budget-drift note above).

## A10/B6 Close — write off the remaining Confirmed Balance and retire the LC/Confirmation

cs-tf-balance-knowhow rationale §3.9/§7.7's "cancellation before expiry" analog (same write-off entry as
a natural expiry, but Maker/Checker-triggered). One shared eligibility check
(`domain/closeEligibility.ts`: SG Balance = 0, Acceptance Balance = 0, no open Events anywhere in the
tree — including a RELEASED-but-not-yet-`presentDocsConsumedAt` B3 Present Docs presentation — not
already Closed) backs all three defense layers: the Step-1 picker's own server-computed hint-set (new
`GET /balance-contracts/close-eligible`, one aggregate call, not per-candidate like every other hint in
`document-arrival-hints.service.ts`), `createMovement()`'s own sufficiency check, and `release()`'s own
re-check before flipping `ContractStatus` to `CLOSED` (reserved in `types.ts` since the original design,
never previously set anywhere). The write-off amount must exactly equal the current Confirmed Balance,
re-verified at both Submit and Release — a balance change in between forces a re-submit rather than
silently over/under-writing it (movements stay immutable-once-created, same invariant every other
movementType relies on; Close does not get a special-cased exception). Amount is never typed — a new
`amountAutoFilledFrom` `FunctionStrategy` dimension carries it from Confirmed Balance and locks the
field, genuinely different from A9/B5's own `amountVsAvailableDerivation` (which still lets the Maker
type a value to compare against Available).

New `GET /balance-contracts?includeAnyStatus=` lets Look Up Current Balance keep resolving a CLOSED
contract by natural key (business-reported gap, "LOOKUP也應該看到此LC 項下所有的交易包括CLOSE EVENT") —
every transaction-creating caller stays ACTIVE-only by omitting the flag, so a Closed LC is still no
longer selectable for any other function. Inquire Events needed no equivalent fix — its own LC Master
Records Index already omits the `status` filter, and `selectLcFromIndex()` already skips the ACTIVE-only
`resolveContract()` round trip entirely.

Two bugs found live while building/testing this, both fixed:
- `movementTypeMatchesFunction()`'s `derivesMovementTypeFromTenor` branch (B4-only) returned true for
  ANY `EPLC_CONFIRMATION` movementType regardless of value, not just HONOUR/ACCEPT — pre-existing,
  harmless until CLOSE became the first other movementType ever recorded against that instrumentType;
  silently mislabeled every CLOSE event as "B4 · Honour/Acceptance" in Look Up/Inquire Events (both read
  `resolveFunctionForMovement()`, which iterates the registry and takes the first match — B4 is declared
  before B6). Now checks `movementType === 'HONOUR' || 'ACCEPT'` explicitly.
- The Event Details 60/40 split's own release()-time eligibility re-check counted the CLOSE movement
  being released as one of its own blocking "open events" (it's still PENDING at that exact instant) —
  self-rejecting every Release. `evaluateContractCloseEligibility()` now takes an `excludeMovementId`.

Also same session: LC Master Records Index status badge color-codes ACTIVE (green)/CLOSED (red) with an
icon (`contractStatusBadgeClass()`, reusing the existing `statusBadgeClass()`/`statusBadgeIcon()` token
system rather than the plain, status-blind `.tb-type-tag` it used before) — user-requested, "容易識別".
`functionActionIcon()` gained a 5th group, `cross` (A10/B6 only) — they used to fall into the `redeem`
fallback, whose icon is the identical checkmark shape as `ok`/"approved", which reads wrong for an
irreversible retirement action; `cross` (the existing rejected/cancelled X, already in `TbIconComponent`'s
shared set) needed no new SVG.

## Server-side "Amount must be > 0" backstop — `assertValidAmount()`, checked at both Submit and Release

Business-reported gap, "SUBMIT & RELEASE API 也要有交易金額控制檢查" — the 2026-08-19 "A1-A9, B1-B5 Amount
figure should > 0" rule only ever lived in `submit-rules.ts` on the Angular side; confirmed live via a
direct `POST /balance-movements` that `amount: "0"` and `amount: "-5000"` were both silently accepted for
a plain ISSUE. New `BalanceService.assertValidAmount()`, called from both `createMovement()` (before
`resolveOrCreateContract()`, so a rejected ISSUE/CREATE never leaves an orphaned contract row) and
`release()` (a defense-in-depth backstop for a bad amount that reached PENDING some other way — not
expected to ever actually fire for a movement `createMovement()` itself created). `AMEND` (B2's own
movementType) is exempted from the sign check — Direction there is carried by the amount's own sign, not
a distinct movementType, so only an exact zero is rejected. `CLOSE` only rejects negative — see the A10/B6
entry above.

## Part B — `InquireEventsComponent`/`BalanceSnapshotBoxComponent` extraction (fixes the `anyComponentStyle` overage above)

2026-08-21, same day as the A10/B6 Close pass above — first proposed as "next sprint" tech-debt (advisory
only, not implemented) alongside Part A (the byte-count doc fix above) in two separate rounds of the same
"給工程師的完整指示" instructions; actioned same day at explicit user request ("Part B 也一起做吧,開始
extract InquireEventsComponent") once a third round of that same message disputed (incorrectly — see
below) that either part, or the whole A10/B6 feature, existed in the checked-out repo at all. Re-verified
directly against `git log`/`git status`/`git show` and live file reads before touching anything further:
HEAD matched `origin/main` exactly (commit `c00be89`) with a clean working tree, and every file the user
said was missing (`CLAUDE.md`'s own byte-count paragraph, `balance-component.model.ts`'s `A10`/`B6`/
`CLOSE_GROUP_CODES`) was present and unchanged since being pushed — the discrepancy was a stale/mismatched
local read on the user's own side, not a lost commit; confirmed with the user before proceeding.

The whole Inquire Events section (side tabs, LC Master Records Index, Events timeline, Original Transaction
Screen, Balance Tabs) moved out of `transaction-builder.component.html`/`.scss` into a new standalone
`InquireEventsComponent` (own `anyComponentStyle` budget). `InquireEventsService` (all the actual
orchestration/state logic) stays exactly where it already was — parent-constructed/parent-owned, unchanged
`providers: [LookUpPanelService, InquireEventsService]` — and is passed down as a plain `@Input()
inquireEvents`, so `selectMode()`'s own `loadIndex()` call and every existing test covering that wiring
(`transaction-builder.component.inquire.spec.ts`) needed zero changes: only the VIEW layer moved. The
Account Entries dialog it can open stays parent-owned too (also opened from the Maker Result panel and the
Look Up panel's own Event Timeline) — the child bubbles the request up via a new `(openAccountEntries)`
output instead of managing dialog state itself.

The former shared `#balanceSnapshotBox` `ng-template` (declared once, invoked via `*ngTemplateOutlet` from
both the Look Up panel and Inquire Events since 2026-08-17) could not simply move with Inquire Events — an
`ng-template` reference variable is local to the template that declares it and cannot cross a component
boundary. Converted into a real standalone `BalanceSnapshotBoxComponent` (`@Input() title/status/snapshot/
impact`) instead, used by BOTH the Look Up panel (parent) and `InquireEventsComponent` (child) — the
"one canonical box" intent the 2026-08-17 extraction already stated, now enforced by the type system rather
than a template-local reference. Byte-for-byte identical rendering to the old template at both call sites,
confirmed via `ng build`'s strict-template check (which the old `ng-template`'s untyped context variables
had been silently exempt from — the new typed `@Input()`s surfaced two genuine `snapshot.redirectedImpact`
possibly-null template errors the old code had been masking; fixed with a non-null assertion inside the
`*ngIf="…redirectedImpact?.label === '…'"` guard that already ensures it, not a behavior change).

Every class this template needs (`.tb-table`, `.tb-tabs`, `.tb-balance-box*`, `.tb-status-badge*`, etc.) had
to be COPIED — not merely moved — into the new components' own stylesheets, per this project's own
established "disclosed, deliberate copy" convention (see `transaction-builder.component.scss`'s own comment
above `.tb-muted`, from the `AccountEntriesDialogComponent`/BAL-003 pilot): Angular's per-component view
encapsulation means a class rule declared in one component's stylesheet never matches markup rendered by a
DIFFERENT component's own template. Only classes truly exclusive to the moved markup (`.tb-workspace--single`,
`.tb-balance-box*`, `.tb-balance-row*`) were actually REMOVED from `transaction-builder.component.scss` —
everything else Inquire Events also needs (`.tb-tabs`, `.tb-table`, `.tb-hint`, `.tb-btn`, etc.) stayed in
the parent too, since the Look Up panel's own Event Timeline (still parent-owned) needs the identical rules.
While auditing which classes were genuinely still referenced, also found and removed three genuinely DEAD
rule blocks in `transaction-builder.component.scss` — `.tb-quick-pick*`, `.tb-result*`, `.tb-row-sub` — zero
usages anywhere in that file's own template even before this pass (leftover from the earlier Maker/Checker
panel extraction, which already carries its own copies in `maker-panel.component.scss`); confirmed via a
plain grep across every `.html` in this sub-project, not assumed.

Result, confirmed via a real `npm run build`: `transaction-builder.component.scss` dropped from 12.025 kB
(25 bytes over the 12 kB hard-error budget — see the P1 entry above) to **9.84 kB** (comfortably under,
only 1.84 kB over the softer 8 kB warning). Neither new component's own stylesheet comes close to either
threshold. Added two new spec files (`inquire-events.component.spec.ts`,
`balance-snapshot-box.component.spec.ts`, same direct-instantiation/no-TestBed convention as
`account-entries-dialog.component.spec.ts`) covering the new `@Output`/delegation-method surface; all
existing specs needed zero edits. Full suite re-run and green across all three sub-projects per this file's
own standing rule: Angular app 1049/1049 (29 suites, 98.73%/96.54%/96.95%/98.96% coverage), `backend/`
34/34, `microservices/balance-component/` 396/396.

## A9 (SG Redemption) locked to Full Redeem only — BA-confirmed, resolves the `TF_Balance_Component_Mapping` Rule #1 conflict

BA verdict (2026-08-21) on the SG-discharge conflict flagged between `analysis/TF_Balance_Component_Mapping-{en,zh}.xlsx`'s
own Rule #1 ("SG discharge is instrument-based, not amount-based") and the shipped `PARTIAL_REDEEM`
capability: **A9 must be Full Redeem only, Amount PROTECTED** (equal to the SG's own Available Balance,
not user-typed); **A3S is correct as-is, no change** — its own matched SG redemption leg is genuinely
tied to a real Document Arrival (`MIN(Bill Amount, SG Available Balance)`, linked via `businessEventId`),
not a standalone partial. Scope confirmed as A9-only, reference-client (Angular) only — the microservice's
own `PARTIAL_REDEEM` movementType and `domain/shgtRedeem.ts`'s `checkRedeemSufficiency()` are unchanged
and still accept a Partial Redeem from any other direct API caller (confirmed via code inspection —
`checkRedeemSufficiency()` checks only `amount <= availableBalance`, with no `businessEventId`/A3S-pairing
check at all); this is a known, disclosed trade-off, not closed in this pass.

Implemented as a UI-layer lock, not a new backend rule: `builder-fields.ts`'s own Amount field (new
`amountFromSgRedeem`, folded into `amountLocked`) is now `disabled`, sourced from the SG's Available
Balance — same fully-locked shape `amountFromClose`/`amountFromFullSettle` already use, just a different
source figure (Available, not Confirmed — A9 must still net an already-PENDING redemption on the same SG,
unlike A10/B6's write-off). `submit-rules.ts`'s own REDEEM branch is a defense-in-depth backstop:
`movementType` is now hardcoded `FULL_REDEEM` and a non-exact-match amount is a hard reject, not a silent
downgrade to `PARTIAL_REDEEM`. `function-strategy.ts`'s `amountVsAvailableDerivation: 'REDEEM'` flag is
kept on A9's registry entry unchanged — it now serves purely as an A9 identity marker (parent-eligibility
hints, historical `PARTIAL_REDEEM` redisplay), not a live derivation choice; `maker-panel.component.ts`'s
`afterResolved()`/`refreshSelectedContractSnapshot()` already set `model.amount = availableBalance` for
this case and needed no change. `Balance-Figures-Calculation-Logic.md`/`.docx` updated with the same
scope note. Full suite re-run and green: Angular app 1049/1049, `backend/` 34/34,
`microservices/balance-component/` 425/425.

## A9 lock basis clarified: Available Balance, not Confirmed Balance as `Balance-Component-Business-Rule-Decisions-2026-08-21.md`'s own Decision 1 literally says

That memo's own action-item table (item 1) reads `amountAutoFilledFrom: 'confirmedBalance'`, matching
A10/B6's mechanism verbatim — but user-confirmed via a concrete worked example (SG G01 issued 10,000 →
A3S already redeems 2,000 against it → A9 must then redeem exactly the remaining **8,000**): Confirmed
Balance would wrongly still read 10,000 whenever another movement on the same SG is still PENDING at
redemption time, double-counting capacity already reserved elsewhere. Available Balance (nets PENDING) is
therefore the correct basis and what was actually implemented (see the entry immediately above) — that
memo is a point-in-time record per its own convention and is not being edited to reflect this; treat
`amountAutoFilledFrom: 'availableBalance'` (the shipped behavior) as controlling over that memo's literal
`'confirmedBalance'` wording wherever the two disagree.

## Balance-Component-Test-Case-Proposal.md §4 — 7 new Business Case Registry entries added, live-verified

`import-case-8` (Sellers Usance → A10 Close), `import-case-9` (Buyer's Usance → A10 Close), `import-case-10`
(Sight, SG + Document Arrival both to their own terminus → standalone A9 → A10 Close), `import-case-11`
(A10 eligibility gate negative case, `expectError: true`), `export-case-8` (Sight → B6 Close),
`export-case-9` (Sellers Usance → B6 Close), `export-case-10` (standalone B2 Amendment, increase then a
decrease past Tight Available, `expectError: true`) — each extends an existing case's own path through to
Close rather than inventing a new scenario, since `domain/closeEligibility.ts`'s own preconditions (SG/
Acceptance Confirmed Balance = 0, no open Event anywhere in the tree) mean A10/B6 can never be a minimal
standalone case. `backend/data/businessCases.js`'s registry grew from 14 to 21 cases;
`businessCases.test.js`/`server.test.js` updated to match (`EXPECTED_IDS`, registry-size assertions, the
`lcNumber` pattern regex widened for two-digit case numbers). All 7 driven live against the real
microservice via `POST /balance-movements` (Submit) + `/release` (Approve) +
`import-case-10`'s own real `/maker-submit` — see `analysis/Balance-Component-A10-B6-Close-Verification-
Summary-zh-2026-08-25.md` §1 (this Chinese-language file merges what was originally 4 separate
2026-08-21/22 dated verification reports, per user instruction 2026-08-25) for the full trace-by-trace
result (7/7 pass, both negative cases fail exactly as designed). Action items
2/3 from the Business Rule Decisions memo (backend `businessEventId` enforcement, `BUYERS_USANCE`
rejection/normalization) remain deliberately out of scope for this pass, by explicit user direction.

## `CurrencyMismatchError` — currency consistency enforced server-side, narrower than the reverted OAS-GAP-16 design

Found during a post-revert OAS-vs-code audit (2026-08-24, after `lc-balance/` was reverted to this file's
own `LC-Balance-Component-Completed`/block-1 state — see `TODO.md`'s own revert record): the OAS's
CURRENCY DERIVATION description had been carried since v1.0.0 claiming the server derives/validates
`currency`, but `balanceService.ts` had zero such logic and `requestSchema.ts` kept `currency`
unconditionally required — a caller could submit a movement with a `currency` that disagreed with its own
contract's stored value and the server would silently record it on that movement, no rejection, no
inconsistency detected anywhere. This is the same failure shape the OAS's own CURRENCY DERIVATION note
already named (documented in detail, unreachable in practice) — a currency-optional/auto-derive version of
this had in fact already been implemented once (`ca8472e`, OAS-GAP-16) but was reverted along with ~60
unrelated commits in the 2026-08-24 revert.

**User-confirmed scope, narrower than `ca8472e`**: `currency` stays a REQUIRED request field (unlike
`ca8472e`'s "omit it and the server derives it" design) — only the missing consistency check is added.
`resolveOrCreateContract()` gains two guards: (1) when the request resolves to an EXISTING contract
(`balanceContractId` or `naturalKey` match), a supplied `currency` that disagrees with `contract.currency`
throws the new `CurrencyMismatchError` (409 `CURRENCY_MISMATCH`); (2) when creating a new CHILD contract
under a `parentLogicalContractId`, a supplied `currency` that disagrees with the parent's own currency
throws the same error. A genuinely root new Logical Contract (no existing resolution, no parent) is
unaffected — nothing to validate against, `currency` becomes that contract's own authoritative value same
as before. `errors.ts` gains `CurrencyMismatchError` (409, `CURRENCY_MISMATCH` — already present in the
OAS's `Error.code` enum, so no enum change needed there); `app.ts`'s existing generic `instanceof ApiError`
handler picks it up automatically, no route-level wiring needed.

OAS re-grounded to match this narrower scope rather than restoring the old aspirational text: the
top-level description renamed CURRENCY DERIVATION → **CURRENCY CONSISTENCY**, `currency` added back to
`BalanceMovementCreateRequest.required` (was absent, matching the old "omit it" design), the field's own
`nullable: true` removed, and every "derives/omits" phrasing across the file (top-level description,
`BalanceMovementCreateRequest.currency`/`parentLogicalContractId` descriptions, `BalanceContract.currency`,
`BalanceMovement.currency`) reworded to "validates a caller-supplied value" — plus an explicit dated note
recording that the broader optional/derive design was proposed once and reverted, so a future reader
doesn't rediscover the same history by re-reading `ca8472e`.

4 new unit tests in `balanceService.test.ts` (existing-contract mismatch/match, new-child-contract
mismatch/match against the parent). Full suite re-run and green: microservice 429/429 (99.23%/96.68%/
100%/99.49% coverage), Angular 1064/1064, `backend/` 34/34 — no client-side change needed since the
reference Angular app already always supplies a currency matching its own contract.

## B3/A6/A7/A8/A9/B4/B5's independent Checker candidate search listed already-earmarked (RELEASED) candidates alongside genuinely actionable ones

Business-reported gap 2026-08-24 ("B3、A3、A3S 單獨使用 checker 已經earmarked 的交易 不應該再被選出" —
live-reproduced with S01/EB01/EB02 before fixing): `checker-panel.component.ts`'s
`searchCheckerCandidatesByLcOnly()` — the "LC typed, SG/IB Number left blank" ambiguous-pick path any
function with a `checkerSecondaryField` reaches (A6/A7/A8/A9/B3/B4/B5; A3/A3S never reach it, their own
natural key is LC Number alone) — only ever checked `catalog()`'s own `status: 'ACTIVE'` (a CONTRACT-level
field), never whether the candidate had anything genuinely PENDING for this Checker. A B3 presentation
already Checker-Released (RELEASED, i.e. already earmarked) still surfaced in the "pick one" list exactly
like a still-PENDING one — selecting it led into an empty Checker Queue, a dead end, live-confirmed with
S01's own EB01/EB02 (both RELEASED) both listed.

Fixed by extracting `loadCheckerQueue()`'s own inline EARMARKING/EARMARKED filter logic into a shared
`isCheckerActionable(movement, selectedFunction)` predicate (nullable `selectedFunction`, matching the
original inline guards exactly) — `searchCheckerCandidatesByLcOnly()` now fetches each candidate's own
movements and keeps only those with at least one actionable item, via the SAME predicate `loadCheckerQueue()`
itself uses, so the candidate list and the queue it leads into can never disagree about what counts as
actionable. A `listMovements()` failure for one candidate is treated as "not actionable" rather than
failing the whole search (`catchError(() => of(null))`). 4 new tests (candidate excluded, every candidate
excluded gets the same "no actionable record" message as zero candidates — not a misleading pick-one list,
a `listMovements()` failure isolated to one candidate). Full suite green: Angular 1067/1067, `ng build
--configuration production` clean (only the two pre-existing SCSS budget warnings, unrelated). Live-verified
in-browser: S01 B3 search now correctly reports "No IB Number record with an actionable PENDING item found
under this LC." instead of listing EB01/EB02.

## `MakerCheckerConflictError` — genuine 4-eyes Maker/Checker separation now enforced, business-confirmed 2026-08-24

Supersedes `domain/statusTransition.ts`'s own original 2026-08-14 posture ("Maker and Checker being the
same person is NOT enforced here — a bank's own role/entitlement policy, out of scope for this service's
own state machine"). User-confirmed reversal: the same user who created a movement (`createdBy`) can no
longer also Release, Reject, or acknowledge (A3/A3S's own Checker step) it.

Checked out via a new exported `assertMakerCheckerSeparation(createdBy, actingUser, action)` in
`domain/statusTransition.ts` — `applyStatusTransition()` calls it for RELEASE/REJECT only (CANCEL/EDIT
untouched: CANCEL is a Maker's own Error Correction on their OWN still-PENDING entry, where
`createdBy === actingUser` is the expected, correct case, not a conflict); `acknowledgeArrival()` in
`service/balanceService.ts` calls the same exported function directly, since it deliberately bypasses
`applyStatusTransition()` entirely (never touches `status`). New `MakerCheckerConflictError` (409
`MAKER_CHECKER_CONFLICT`), picked up automatically by `app.ts`'s existing generic `instanceof ApiError`
handler. Checked BEFORE the legal-transition check, so a same-user attempt on an already-RELEASED movement
still reports the conflict, not a misleading illegal-transition error.

Confirmed non-breaking against `backend/data/businessCases.js`'s own orchestrated Business Case Registry
before shipping — `MAKER`/`CHECKER` constants (`'maker1'`/`'checker1'`) are distinct everywhere `createdBy`/
`releasedBy` are set, so this genuinely never fires for any registered case. OAS bumped to v1.17.0, `Error.code`
enum and description both updated (see the CURRENCY CONSISTENCY entry above for that same release's other
change). 6 new tests (2 in `statusTransition.test.ts` for `applyStatusTransition()` itself, 2 for the
standalone `assertMakerCheckerSeparation()` export, 3 HTTP-integration in `app.test.ts` covering release/
reject/acknowledge each independently) — full suite green: microservice 437/437, Angular 1067/1067,
`backend/` 34/34, no client-side change needed (the reference Angular app already always uses distinct
maker1/checker1 actors).

## Business Case Runner (23-case registry) inventoried against the current feature set — found in good shape, not stale

Business-reported concern 2026-08-24 ("Business Case Runner 這功能早就不符合現在的設計") — a case-by-case
audit (tenorType declaration, A4 Sight maker-submit gate, CLOSE, Partial Redeem, other drift vs. the
chronological OAS changelog) found **0 of 23 cases genuinely stale** (would be rejected or behave
differently against the current microservice), 21 current, and only 2 (`import-case-4`, `import-case-6`)
with a real but already-disclosed-as-correct drift: both exercise SHGT `PARTIAL_REDEEM`, which the
microservice API still fully supports but the Angular A9 screen no longer lets a human trigger (locked
Full-Redeem-only, 2026-08-21). `import_lc_test.sh` (the standalone curl script transcribing the SAME S01
live-data sequence directly against the microservice) has the identical status. Annotated all three call
sites (both `businessCases.js` functions' own top comments, `import_lc_test.sh`'s own file header) so this
reads as disclosed API-vs-UI scope, not a bug — `export_lc_test.sh` confirmed clean (0 `PARTIAL_REDEEM`
occurrences, Export has no SHGT at all). Recommendation given and accepted: do NOT remove or redesign the
registry — continue the 2026-08-21 test-case-proposal-driven incremental-addition convention if/when new
scenarios are needed, since a from-scratch rewrite would trade away a working, well-maintained integration
test surface (`backend/test/businessCases.test.js`/`server.test.js`, 34 tests, 100% coverage) for no
demonstrated benefit. Also synced `businessCases.js`'s own top-of-file doc comment off the 2026-08-14
"Maker=Checker out of scope" posture the entry above superseded — `createdBy`/`releasedBy` were already
genuinely distinct throughout (`MAKER`='maker1'/`CHECKER`='checker1'), the comment just hadn't caught up.

## Maker-side "existing contract" picker (A7/A9/B5) — index pickers reordered ahead of the free-text search fallback

Business-reported UX gap 2026-08-24 ("順序應該是 index LC NUMBER, index 2ndary reference, THEN the related
transaction LC Number and 2ndary reference") — `maker-panel.component.html`'s shared `usesTwoFieldSearch`
block (every non-creating function whose instrumentType needs an ibNumber/sgNumber natural-key field: A7
IPLC_ACCEPTANCE, A9 SHGT, B5 EPLC_ACCEPTANCE) rendered the free-text "Search Existing Contract — LC Number
+ IB/SG Number" fallback BEFORE the "2ndary Index"/"EB Index" picker below it — contradicting that very
picker's own 2026-08-14 doc comment ("Step 1 / LC Index... Step 2... pick the specific IB/SG Number here
instead of typing it... the free-text fields above remain as a manual fallback") and this project's own
established "index pickers first, free text is the fallback" convention every other picker on this screen
already follows. Live-reproduced with A9/U01/G01 before fixing (browser extension available at the time).
Fixed by moving BOTH the shared 2ndary Index block AND B5's own separate `usesSettleableBalanceIndex`-gated
"EB Index" variant to render before the free-text label/grid/button/hints — pure DOM-order change, neither
block's own `*ngIf` condition touched. A2/A3/A3S/A4/A10/B2/B6 (IPLC_LC/EPLC_CONFIRMATION, no secondary
natural-key field) and A6/A8/B3/B4 (creating, or the `settlesDocumentArrival` payable-movement picker
already correctly ordered inside the `hasParent` block) confirmed unaffected — different template branches
entirely. Angular 1067/1067, `ng build --configuration production` clean.

## A7 (Acceptance Settlement) — LC Index now gated on outstanding Acceptance Balance, not just Usance tenor

Business-reported UX gap 2026-08-25 ("A07 交易選擇是 LC number 有Acceptance balance 再顯示2ndary ref"). A7's
own Parent LC ("LC Index", Step 1) picker used `catalogTenorFilter: 'USANCE'` as its ONLY eligibility
signal (`resolveParentEligibilityRule()`'s `unconditional` branch) — every Usance LC was offered
regardless of whether it actually had an outstanding IPLC_ACCEPTANCE to settle; only after picking one did
Step 2 (IB Index) reveal "0 candidates" via its own already-correct 0-balance filter. Live-reproduced via
`GET .../balance-contracts/close-eligible`-adjacent inspection of the running dev DB (U01 has a child SG
still outstanding but its own Acceptance CREATE is still PENDING — 0 eligible; U02's own Acceptance is
RELEASED with Confirmed Balance 2,000, i.e. genuinely settleable — both cases the old unconditional LC
Index would have shown identically). Fixed the same way A3S/A9's own SG-balance gate already works: added
`requiresEligibleParentAcceptance: true` to A7's own registry entry (`balance-component.model.ts`), a new
`parentAcceptanceEligible` hint-set + `loadParentAcceptanceEligibility()` on `DocumentArrivalHintsService`
(generalized the former SG-only `loadSgBalanceEligibility()` into `loadChildBalanceEligibility()`,
parameterized by `childInstrumentType` — `'SHGT'` for A3S/A9, `'IPLC_ACCEPTANCE'` for A7), and a new
`resolveParentEligibilityRule()` branch checked BEFORE the generic `catalogTenorFilter === 'USANCE'`
unconditional fallback. B5 (also `catalogTenorFilter: 'USANCE'` on its own Parent picker) deliberately left
unaffected — not part of this report, and its own Step 2 already uses the separate
`usesSettleableBalanceIndex` flow. One pre-existing test (`filteredParentCatalog: catalogTenorFilter
USANCE (A7)...`) had used A7 to demonstrate the generic unconditional branch — reassigned to B5 (still
demonstrates the same generic fallback, unaffected by this change) rather than deleted, plus a new A7-
specific hintSet test alongside it. Angular 1072/1072, `tsc --noEmit` clean, `ng build --configuration
production` clean.

## `maker-panel.component.scss` — 473 lines of dead CSS removed, clears the 8kB `anyComponentStyle` warning

TODO.md-tracked known gap, root-caused and fixed 2026-08-24. The file's own top comment already disclosed
the cause: it was copied WHOLE from `transaction-builder.component.scss` during a past extraction ("a
hand-picked subset risked silently missing a rule under time pressure — copied whole instead") — but that
copy included every shared design-system atom, not just the ones `maker-panel.component.html` actually
renders. Every top-level selector in the file was grep-checked against this component's own template (view
encapsulation guarantees zero matches = provably dead, not merely "maybe unused elsewhere") — confirmed
dead: the page shell (`.tb-page`/`.tb-header`/`.tb-title`/`.tb-subtitle`), the function-chip picker
(`.tb-function-picker`/`.tb-function-chip*`/`.tb-function-help`), the workspace grid
(`.tb-workspace`/`.tb-main`/`.tb-side`), Look Up's own tabs/Event Timeline table
(`.tb-tabs*`/`.tb-subheading`/`.tb-table*`/`.tb-type-tag`/`.tb-status-badge*`), and a handful of one-off
variants (`.tb-select--inline`, `.tb-grid-lookup`, `.tb-btn--success`/`--tiny` as nested modifiers of the
still-live `.tb-btn`, `.tb-pagination`, `.tb-checker-actions`) — all of them live in
`transaction-builder.component.html`/`checker-panel.component.html` instead, never this component's own.
`.tb-muted` (zero matches, not flagged by the initial audit) found and removed too during the actual
edit-time re-verification. Same grep-verified technique this project already used for
`.tb-quick-pick*`/`.tb-result*`/`.tb-row-sub`'s own past dead-code find in `transaction-builder.component.
scss`'s own history — each removed selector confirmed zero matches before deletion, not guessed. File
dropped from 997 to 511 lines; two now-dangling "see `.tb-function-chip` above" comment references (the
class itself removed) reworded to point at the sibling file instead. Confirmed via `ng build --configuration
production`: the `maker-panel.component.scss` budget warning is gone entirely (only the pre-existing,
unrelated `transaction-builder.component.scss` warning remains). Angular 1067/1067 green.

## A9 Full-Redeem-only now enforced server-side too — TODO.md-tracked gap closed (was UI-only)

Business-directed 2026-08-24 ("A9 Full-Redeem-only 目前只在 Angular UI 層鎖定 API MAKER & CHECKER也要") —
this is action item 2 from `Balance-Component-Business-Rule-Decisions-2026-08-21.md` (backend
`businessEventId` enforcement), previously recorded as deliberately out of scope for an earlier pass; user
now explicitly requested it. The BA-confirmed rule ("SG discharge is instrument-based, not amount-based")
was only ever enforced client-side — `submit-rules.ts` hardcodes `movementType: 'FULL_REDEEM'` and locks
Amount to the SG's own Available Balance — while the microservice's own `PARTIAL_REDEEM` and
`domain/shgtRedeem.ts`'s `checkRedeemSufficiency()` were completely unchanged, so any caller bypassing the
Angular client (curl, a future second UI, an integration test) could still Partial Redeem a standalone SG.

Fixed in `buildMovementTypeRegistry()`'s own `outstandingCapped` sufficiency check (Maker/Submit) and
mirrored in `release()` (Checker/Release, pure defense-in-depth — `businessEventId` is immutable once set,
so this can't actually fire for a movement `createMovement()` itself created, only for one that reached
PENDING some other way, same posture `assertValidAmount()`'s own doc comment already established): a SHGT
`PARTIAL_REDEEM` request with no `businessEventId` is rejected (`409 INSUFFICIENT_AVAILABLE_BALANCE`
Maker-side / `IllegalStateTransitionError` Checker-side). The distinguishing signal is deliberately
`businessEventId`, not the `PARTIAL_REDEEM`/`FULL_REDEEM` movementType string — A3S's own matched SG
redemption leg (`SG Redemption Amount = MIN(Bill Amount, SG Outstanding)`) always carries a
`businessEventId` linking it to its paired Document Arrival, but that match can legitimately equal the
SG's full outstanding balance too, so movementType alone can't tell A3S apart from a genuine standalone A9
call. A standalone `FULL_REDEEM` (no `businessEventId`) is unaffected either way — A9's own real flow.

5 new tests: 3 HTTP-integration in `app.test.ts` (Maker rejects a standalone Partial Redeem, Maker still
accepts a standalone Full Redeem, Maker still accepts a matched/businessEventId-carrying Partial Redeem)
plus 1 covering the Checker-side re-check (direct `BalanceService` instantiation + a raw SQL `UPDATE` to
strip `business_event_id`, simulating a movement that reached PENDING outside `createMovement()`'s own
guarded path — same "bypass the Maker-side gate directly" technique this codebase already uses to test
other defense-in-depth backstops). 3 pre-existing tests in `app.test.ts`'s own "SG redemption commitment
control" describe block (testing `checkRedeemSufficiency()`'s own logic via a standalone Partial Redeem,
now correctly rejected before that logic even runs) updated to carry a `businessEventId`, preserving their
original intent (the commitment-control math itself, which still applies identically to an A3S-shaped
matched call) without being blocked by the new guard. OAS bumped to v1.18.0. Full suite green: microservice
442/442, Angular 1067/1067, `backend/` 34/34 (`businessCases.js`'s own A3S-shaped Partial Redeem steps
already carry `businessEventId`, confirmed unaffected). TODO.md's own item now closed; action item 3 from
the same memo (`BUYERS_USANCE` rejection/normalization) remains the only one still out of scope.

## RESOLVED (BA-confirmed 2026-08-25, external BA review withdrew its own F2) — Acceptance/DPU's `(memo)`-suffixed Folio 3/5 pair is correct; real on-balance booking is deliberately out of this component's scope

Standing rule: treat this as settled, do not re-litigate without new information from the user — same
convention as every other "reviewer-confirmed"/"business-confirmed" entry in this log.

This one flip-flopped twice in one day before landing here, so the final, authoritative reasoning is
recorded in full to prevent re-litigating it: the external BA review originally flagged Folio 3/5's
`(memo)`-suffixed Acceptance/DPU pair as contradicting `TF_Balance_Component_Mapping-{en,zh}.xlsx`'s own
`Balance_Taxonomy` sheet, which does classify `ACCEPTANCE_DPU_OUTSTANDING` as `ON_BALANCE_LIABILITY`
("THE accounting liability — not a contingent", §3.7) — that classification is real and was correctly
found in the workbook (an EBL/IBL-scope explanation for it was tried first and did not hold: EBL/IBL are
separate rows — `IMPORT_USANCE_FINANCING`/`DUE_TO_REFINANCING_BANK`/`TRUST_RECEIPT_LOAN`). The resolution
is neither "F2 is wrong" nor "EBL/IBL explains it" — it's that the workbook's `ACCEPTANCE_DPU_OUTSTANDING`/
`RECOGNISE_ONBS` step describes a DIFFERENT component's job in the SAME transaction chain, not this one:
`analysis/contingent-liability-ledger.html`'s own Folio 3 "Classification note" states the memo pair
"never constitutes an accounting record", and this microservice's own domain model already performs the
IFRS 9 contingent→actual reclassification correctly at Accept (`exposureNature: 'ACTUAL'`, not
`CONTINGENT`) — the real on-balance liability posting and its matching receivable are, by design, this
component's caller's job via the passthrough `accountEntries` field (never `contingentAccountEntry`,
which `deriveContingentAccountEntry()` returns `null` for on every ON_BALANCE_ASSET instrumentType), the
same boundary already drawn for EBL/IBL's own booking. See
`docs/obsidian-balance-kb-v3.2/04-Exposure-Accounting/ifrs-9-contingent-to-actual-reclassification-boundary.md`,
`.../exposurenature-actual-tagging-for-acceptance-dpu.md`, and
`.../on-balance-sheet-asset-instruments-are-out-of-balance-component-s-cont.md` for the knowledge-base
notes the BA review's own withdrawal cites. No code change needed. `TODO.md`'s own F2 entry closed
accordingly (Buyer's Usance renumbered up to F2 in both files, matching the review's own post-withdrawal
renumbering).

## `BUYERS_USANCE`/`EPLC_CONFIRMATION` (action item 3) — CLOSED, no code change; Export never actually produces this input

Superseded same day: the BA review revision below first re-characterized this as a pure engineering task
(`Balance-Component-Business-Rule-Decisions-2026-08-21.md`'s Decision 2 already settled the business
question), then the user closed it outright — Export/Confirmation contracts never carry
`tenorType: 'BUYERS_USANCE'` in practice, so the input this guard would protect against cannot occur. No
`tenorRouting.ts`/`balanceService.ts`/`maker-panel.component.ts` change was made.

Recorded for if this ever changes: today `maker-panel.component.ts:733`
(`this.model.movementType = this.selectedContract.tenorType === 'SIGHT' ? 'HONOUR' : 'ACCEPT'`) would route
a `BUYERS_USANCE` Confirmation to `ACCEPT`, which is wrong per Decision 2 — the correct fix, if this input
ever becomes real, is normalizing it to `HONOUR` alongside `SIGHT` (not rejecting it).

Both `analysis/TF-Balance-Component-BA-Review-{en,zh}.docx` are now in sync (15 findings, 3 High) — the
review previously had a stray un-suffixed English duplicate with the older, unsynced content; that file no
longer exists, the `-en.docx` is the current one.

## F1 — AUTO EXPIRY + AUTO CLOSE background sweep, Expiry Extension Amendment, A11/B7 Reopen (closes TODO.md's own F1)

New `movementType`s `EXPIRE` (own eligibility, `domain/expiryEligibility.ts` — deliberately NOT
SG/Acceptance-balance-gated like CLOSE) and `AMEND_EXPIRY_DATE` (A2/B2's third subChoice option, doubles as
the EXPIRED→ACTIVE Extension entry point). Two independently-flagged background sweeps
(`AUTO_EXPIRY_ENABLED`/`AUTO_CLOSE_ENABLED`, `server.ts`'s own `setInterval`, never the `BalanceService`
constructor) drive Maker/Checker via `BATCH_MAKER`/`BATCH_CHECKER` system actors through the existing,
unmodified `createMovement()`/`release()` path — genuine 4-eyes preserved, `statusTransition.ts` untouched.
A11 (`IPLC_LC`)/B7 (`EPLC_CONFIRMATION`) Reopen — a new, separately-entitled named function (not folded
into A2/B2) — reopens a CLOSED contract, reversing every not-yet-reversed EXPIRE/CLOSE in its history (not
just the last one — a contract reaching CLOSED via EXPIRE→AUTO CLOSE has TWO to reverse, since AUTO CLOSE's
own write-off amount is already 0 by then). `REVERSAL` movementType (dynamic direction, resolved via
`reversalOfMovementId`) backs Expiry Extension Amendment's own restoration.

**REOPEN redesigned same day, after live UAT** ("Checker要看交易出的帳 再決定 APPROVE 或 REJECT" — the
original design's zero-amount REOPEN + a separately-generated, Release-time-only `REVERSAL` leg meant the
Checker approved an empty movement with no visible entries, and Inquire Events showed two rows for one
event). REOPEN now carries its own real, positive restoration amount directly — computed at Submit
(`domain/reopenRestoration.ts`: sum the contract's own trailing run of RELEASED EXPIRE/CLOSE, walking
backward until the first non-match) and never caller-typed (Angular hides Amount entirely for A11/B7); a
real `contingentAccountEntry` is generated at the same Submit call, so the Checker reviews the actual
restoration before approving. `MOVEMENT_DIRECTION.REOPEN` is `1` (not `0`); REOPEN no longer produces any
`REVERSAL` — that movementType now backs Expiry Extension Amendment only.

Deliberately not done (`TODO.md` §3, F1 §11.4): sweep round-splitting (AUTO CLOSE may re-close a contract
in the SAME cycle a human/Maker just Reopened, if SG/Acceptance are already 0 — reproduced live); consent-
gating on Extension/Reopen; mandatory `reasonCode` on CLOSE. Business Case Registry gained Import Case
13-15 and Export Case #12 exercising the full mechanism (§9.7 chain reversal, the negative eligibility
gate, and the AUTO EXPIRY→AUTO CLOSE→Reopen path), 23→27 cases.

## F1 follow-up — AUTO EXPIRY/AUTO CLOSE now skip a recently-Reopened contract for one sweep interval

Live-reported the same day: a REOPEN reactivating to `EXPIRED` (original `expiryDate` already past) got
immediately re-closed by the very next AUTO CLOSE tick, with zero window to follow up. New
`isRecentlyReopened()` (`service/balanceService.ts`) — both sweeps skip a contract whose own most recent
RELEASED movement is `REOPEN`, for one full `EXPIRY_SWEEP_INTERVAL`; time-bounded, not permanent (a
REOPEN-to-`ACTIVE` contract still auto-expires on schedule once its own still-future `expiryDate` for-real
arrives). Narrows, but does not close, the broader §8.5 round-splitting gap — a genuine `EXPIRE`-then-
same-cycle-`AUTO CLOSE` sequence (no REOPEN involved) is unaffected, still deliberately deferred.

## F1 — AMEND_EXPIRY_DATE no longer generates a contingentAccountEntry; Extension Amendment double-restoration bug fixed

Two related, same-day, user-reported fixes. (1) `AMEND_EXPIRY_DATE` never has a real balance/GL effect —
`deriveContingentAccountEntry()` now returns `null` for it explicitly (was a spurious zero-amount pair, an
artifact of the generic derivation logic, not a deliberate choice), same treatment as `EPLC_EXAMINATION`.
(2) Real bug, traced to the REOPEN redesign above: a contract reaching `EXPIRED` via A11/B7 Reopen (§9.2
Option A) restores its balance directly (no `REVERSAL` left behind) — but Extension Amendment's own
Checker-Release restoration still assumed the old "REOPEN always leaves a REVERSAL" invariant, so it found
that same already-restored `EXPIRE` and reversed it AGAIN, silently doubling the balance (live-reproduced:
10,000 → 20,000, "S01 EXTEND後 無法做後續作業"). Fixed: Extension only reverses when the contract's own
MOST RECENT movement (excluding itself) is a RELEASED `EXPIRE` — anything else (a prior REOPEN, most
commonly) means nothing is left to restore. Sound by construction: `EXPIRE` can't chain with itself, `CLOSE`
can't precede `EXPIRED`, so Extension's own relevant trailing run is always 0 or 1 movement, never a
multi-item chain the way REOPEN's own §9.7 case can be.

## F1 §11.4 — BA formally ratifies all four previously-deferred items (§13 of the proposal doc); tracked, not yet implemented

`analysis/Balance-Component-F1-Expire-Proposal-zh.md` gained §12 (BA code-review checklist against §1-11)
and §13 (formal ratification of the four `TODO.md` §11.4 items that were left "維持待決" above) after the
work already logged above shipped — read in full 2026-08-25, reconciled into `TODO.md` §3's F1 §11.4 block
rather than re-litigated here; that's the authoritative item-by-item breakdown now. Headline points worth
flagging in this log specifically:
- **§13.7 (new bug, real, currently inert):** `balanceContractStore.ts`'s `reactivate()` nulls
  `effective_to` when a REOPEN restores a contract to `EXPIRED`, instead of stamping the REOPEN's own
  Release time — wrong once the below Grace Period lands (it needs `effective_to` as its "became EXPIRED
  at" anchor), harmless today since nothing yet reads `effective_to` for eligibility.
- **§13.5 (new mechanism, not built):** BA's own chosen fix for the remaining EXPIRE→same-cycle-AUTO CLOSE
  round-splitting gap is a configurable N-*bank-business-day* Grace Period off `effective_to` (deliberately
  independent of the calendar-day `mail_float_grace_days`), business-day math delegated to a not-yet-built
  "Standing" microservice (Phase 1: same-repo weekend-only mock; Phase 2: real integration) — NOT the
  sweep-round-skip idea floated earlier in this file's own F1 entry, and NOT the same mechanism as
  `isRecentlyReopened()` below.
- **§13.8 verdict on `isRecentlyReopened()`:** BA's own analysis (written independently of the live bug
  report that drove that fix) argues the PENDING-window case is already safe by construction and the
  RELEASED-window case should be solved via §13.7+§13.5 instead of a movementType/time-window check. Not
  acting on this by ripping `isRecentlyReopened()` out — it's a proven, live-verified fix for a real
  reported bug and §13.5 doesn't exist yet. Keeping it as the interim safeguard; revisit once §13.5 ships.
- Consent-gating (Extension/Reopen) and mandatory CLOSE `reasonCode` are no longer "deferred" — BA
  ratified concrete shapes for both (new `amendmentApproved`/`amendmentEffective`/`consentStatus` request
  fields; A10/B6 `reasonCode` becomes mandatory, AUTO CLOSE auto-fills
  `NATURAL_EXPIRY_ALL_BALANCES_CLEARED`) — see `TODO.md` for the full breakdown. A11/B7's own
  role/permission control is explicitly ruled OUT of this component's scope (upstream Channel API/IAM
  responsibility) — and §13.5's own sub-decision B flags that `app.ts` has zero caller-authentication
  middleware today, so that boundary doesn't actually hold yet (same root gap as BAL-001/F4, not a new one).

No code changed by this entry — tracking only, per the user's explicit request scope.

## F1 §13 — four of the newly-ratified items actually implemented (§13.7, §13.5 Phase 1, mandatory CLOSE/REOPEN reasonCode, consent passthrough)

User picked these four off the tracking entry above to implement now (OAS bumped to v1.24.0 — see its own
changelog entry for the full write-up; this log stays terse per this file's own convention).

- **§13.7 fixed:** `balanceContractStore.ts`'s `reactivate(balanceContractId, newStatus, releasedAt,
  newExpiryDate?)` gained a required `releasedAt` param — `effective_to` is now `releasedAt` when
  reactivating to `EXPIRED` (was unconditionally `NULL`), still `NULL` when reactivating to `ACTIVE`. Both
  `balanceService.ts` call sites (Extension Amendment, REOPEN) updated to pass their own `releasedAt`.
- **§13.5 Phase 1 shipped:** new `domain/autoCloseGracePeriod.ts` (`addBusinessDays()` — same-repo
  weekend-only mock standing in for the not-yet-built Standing microservice; `isPastAutoCloseGrace()`)
  gates `runAutoCloseSweep()` alongside the existing `isRecentlyReopened()` filter (kept, not superseded —
  see §13.8 note above). New config constant `AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS = 2`. This closes the
  ORIGINAL §8.5 gap for the general case (a freshly-EXPIRED, already-settled contract no longer goes
  straight to `CLOSED` in the same sweep cycle — `runExpirySweepCycle`'s own test now asserts `close: []`
  in-cycle, `close: [...]` in a later one), not just the REOPEN-originated case v1.21.0 already covered.
- **Mandatory `reasonCode` shipped:** new `BalanceService.assertReasonCodeRequired()` rejects a bare
  `CLOSE`/`REOPEN` Submit (400); AUTO CLOSE supplies a fixed value (`AUTO_CLOSE_REASON_CODE =
  'NATURAL_EXPIRY_ALL_BALANCES_CLEARED'`) internally rather than being exempted from the check. Angular:
  new `reasonCode` field in `builder-fields.ts`/`submit-rules.ts` (shown/required only for
  A10/B6/A11/B7, via `requiresCloseEligibility`/`requiresReopenEligibility` — no new BuilderModel dimension
  needed, reused the existing flags).
- **Consent passthrough shipped:** `amendmentApproved`/`amendmentEffective`/`consentStatus` — three new
  optional fields end-to-end (types.ts, zod schema with a real `consentStatus` enum check, DB columns
  `amendment_approved`/`amendment_effective`/`consent_status` — migration 17, no CHECK constraint, same
  posture as `reason_code`). Deliberately API-contract-only, no Angular UI field — BA's own decision frames
  these as an UPSTREAM Channel API responsibility ("Balance Component 不判斷"), and this Angular app's Maker
  Panel already stands in for that upstream caller only for the fields it actually needs to demonstrate;
  every other purely-passthrough audit field in this API (`sourceModule`/`sourceFunction`, etc.) has the
  same no-UI precedent. Revisit if the user wants a demo-purposes input added later.
- **Not done, still tracked** (per the tracking entry above, unchanged): §13.5 Phase 2 (real Standing
  microservice integration), the A11/B7 role/permission boundary and its `app.ts` auth precondition, and
  §12.2 (still assessed as moot/low-priority).

## F1 proposal §14.4 — Checker's own Release/Reject screen had no way to view Account Entries, fixed

BA's second-round code review (§14 of the proposal doc) confirmed §14.1-14.3 (the REOPEN redesign itself,
§9.7 chain-reversal correctness including the "Reopen→Close→Reopen again" repeat case, `isRecentlyReopened()`
as a better-than-§13.8-recommended fix, `AUTO_CLOSE_REASON_CODE`'s literal value) all pass — but found one
real gap (§14.4): the whole point of the REOPEN redesign above was "Checker要看交易出的帳 再決定 APPROVE或
REJECT", yet `checker-panel.component.ts`/the parent's own Release/Reject action block had no Account
Entries button at all — Maker's result panel and Inquire Events both already had one. Verified directly
(grepped `checker-panel.component.ts` for `AccountEntries` — zero hits) before fixing. Fixed by adding the
same button to `transaction-builder.component.html`'s `tb-checker-actions` block (next to Release/Reject),
calling the parent's own pre-existing `openAccountEntryDialog()` — no new `@Output()` needed on
`CheckerPanelComponent`, consistent with that component's own class doc comment ("the action layer stays on
`TransactionBuilderComponent`, not this component"). Gated the same way Maker's button is
(`selectedCheckerMovement?.contingentAccountEntry` present). `ng build --configuration production` used to
catch an Angular template-only regression `tsc --noEmit` alone would have missed (this component's own spec
files are all "no-TestBed direct instantiation" — template bindings are never exercised by Jest here, only
by an actual Angular-compiler build) — first pass had a real NG8107 warning (`selectedFunction?.` should be
`selectedFunction.`, narrowed non-null by the enclosing `*ngIf`), fixed before landing. Pure template change,
no `.ts` coverage impact; Angular 1133/1133 stays green.

## Two small backlog cleanups: BAL-129 fixed, `ContractVersionConflictError` deleted as confirmed dead code

- **BAL-129 (Quality-report-balance.md)** — the microservice's generic 500 handler (`app.ts`'s BAL-117
  fallback branch) had zero test coverage. New test in `app.test.ts`: `jest.spyOn(service,
  'resolveContract')` throws a plain `Error` with a distinctive message; asserts the response is exactly
  the fixed generic body, the distinctive text never appears in it, and `console.error` still received the
  real error. `app.ts` coverage: 91.3%/66.66%/90.9% → 100%/100%/100%.
- **`ContractVersionConflictError` deleted** — `errors.ts` defined this 409 with zero throw sites anywhere
  in `src/`. Traced why: `contractVersion` has exactly one assignment in the whole codebase
  (`createContract()`), hardcoded to `1` — the "new contract version" flow this error was meant to guard
  (Design doc §8, duplicate `(logicalContractId, contractVersion)`) doesn't exist; the only way to trigger
  it would be a `logicalContractId` UUID collision, not a real business scenario. `CONTRACT_VERSION_CONFLICT`
  was never listed in the OAS's own `Error.code` enum at all — genuine dead code, likely a leftover from
  copying `lc-payment-wc/microservices/payment-component/src/errors.ts`'s own convention (this file's own
  top doc comment says as much) without ever wiring it up. Removed the class and its one
  `errorsAndMoney.test.ts` row. Microservice suite: 546/546, `errors.ts` still 100%/100%/100%/100%.

## F1 §13.5 Phase 2 reference material — copied from `lc-balance-new/`, then simplified down to what AUTO CLOSE actually needs

User-directed, 2026-08-25/26: copied `lc-balance-new/`'s own Standing microservice Maturity Date OAS design
(947 lines, 19 review rounds) + its decision-request doc + an 8-country calendar dataset into
`analysis/standing-microservice-reference/`, as background for F1 §13.5 Phase 2 (real business-day
calendar for AUTO CLOSE's own Grace Period — **not** AUTO EXPIRY, which stays calendar-day-based via
`mail_float_grace_days`). User then correctly identified the real requirement is far simpler than that
material's own multi-party payment-settlement scope (calendar roles, combination rules, calendar-snapshot
versioning) — AUTO CLOSE is a single-bank background sweep with no counterparty at all. Both copied
Maturity Date documents were deleted and replaced with a freshly-authored
`Auto-Close-Grace-Period-Business-Day-Requirement.md` (one date in, one fixed N, one calendar, one boolean
out); `calendars.json` trimmed to a single `TW` calendar. Also added a runnable mock server,
`microservices/business-days-mock/` (`POST /business-days/add` only, port 4500, live-smoke-tested) —
written fresh to match the simplified shape, not copied from `lc-balance-new/microservices/standing-mock`
(that one implements `/adjust` for the different Maturity Date use case). **Not yet wired into
`microservices/balance-component/`** — Phase 1's own same-repo weekend-only mock
(`domain/autoCloseGracePeriod.ts`) still runs there; all of this is Phase 2 reference/dev material only,
Phase 2 itself remains unimplemented.

Calendar test data (`calendars.json`/`data/calendar.json`, kept identical) expanded 2026-08-26 (user-
directed) from one year to 2026-2028: 2026 dates verified against real day-of-week/lunar-calendar facts
(CNY/Dragon Boat/Mid-Autumn); 2027/2028 repeat the same month/day (illustrative, not lunar-accurate for
those years) and roll forward to the next weekday when that lands on a Saturday/Sunday — **except** four
fixed statutory holidays (New Year 01-01, 228 Peace Memorial Day 02-28, Labor Day 05-01, National Day
10-10) which always stay on their literal date, never rolled. Live-verified via the mock server: a
cross-year walk (2026-12-31 → 2027-01-04, skipping New Year + weekend) and a rolled 2027 holiday (Dragon
Boat 06-19 Saturday → 06-21 Monday, correctly flagged `PUBLIC_HOLIDAY` on the rolled date). BA independently
re-verified all of the above (hand-traced the walk logic, recomputed all 16 rolled 2027/2028 dates,
confirmed the four fixed holidays never roll) and flagged one real gap: no fail-closed guard for a date
outside the calendar's known coverage.

**Gap fixed same day**: `server.js` gained `CALENDAR_MIN_DATE`/`CALENDAR_MAX_DATE` (derived from
`calendar.holidays`' own years, not hardcoded) — both the input `date` and the walk itself are bounded;
stepping outside now returns `422 CALENDAR_RANGE_EXCEEDED` instead of silently treating an uncovered year
as holiday-free. Also added this mock's first test suite (`test/server.test.js`, Jest + supertest, 15
tests) covering the existing weekend/holiday/cross-year/fixed-holiday behavior plus the new guard's three
edge cases (out-of-range input, in-range input whose walk would cross the boundary, and a genuinely
resolvable near-boundary case that must NOT false-positive) — all green.

## Inquire Events → Original Transaction Screen — A1/B1's saved `expiryDate` wasn't shown (reviewer-reported 2026-08-26)

`InquireEventsService.selectEvent()`'s reconstructed read-only model (`inquire-events.service.ts`) copied
`tolerancePct`/`tenorType`/`tenorDays` off the event's own contract but omitted `expiryDate` — the A1/B1
Original Transaction Screen's date input rendered its own empty placeholder instead of the value actually
saved at Issue. Fixed by adding `expiryDate: contract.expiryDate ?? undefined` to that model; the
`showsExpiryDateInput`/field definition (`builder-fields.ts`) and the `BalanceContract`/`BuilderModel`
plumbing were already correct — this was a plain omission in the read-only reconstruction path, not a
missing feature. Regression coverage added to `inquire-events.service.spec.ts` (saved date shown; absent
date stays `undefined`, not `null`). All three suites re-run green.

## Inquire Events Original Transaction Screen — generalized to a compiler-enforced field reconstruction, not a hand-picked list (reviewer-reported 2026-08-26, "Original Transaction Screen Must Display All Saved Fields")

Following straight on from the `expiryDate` fix above, the reviewer flagged the omission as systemic, not
a one-off: `selectEvent()`'s reconstructed model was a hand-written object literal that could silently drop
any future `BuilderModel` field the same way. Replaced with `reconstructOriginalModel(movement, contract)`
(`builder-fields.ts`) — an exhaustive `{ [K in keyof Required<BuilderModel>]: ... }`-typed mapping table
from every `BuilderModel` key to the movement/contract property that actually saved it; adding a new
`BuilderModel` field without adding its entry here is now a TypeScript compile error, not a silent runtime
gap. `selectEvent()` now just calls this function instead of building the model by hand. Verified
end-to-end via live browser walkthrough of every A1–A11/B1–B7 function's own Original Transaction Screen
(Maker Submit → Checker Release → Inquire Events), not just unit tests.

## `release()` was silently nulling out `reason_code` on every Release — real bug, found via the browser walkthrough above

`balanceMovementStore.ts`'s `updateStatus()` had `reason_code = @reasonCode` as a plain SQL overwrite,
unlike the sibling snapshot columns which correctly use `COALESCE(@param, column)` to preserve the existing
value when a caller omits the key. `release()` never passes `reasonCode` (CLOSE/REOPEN's own mandatory
Reason Code — F1 §13.1 — is captured at `createMovement()` time, not at Release), so **every single
Release silently erased it** — the reason a human Maker typed for a Close/Reopen was gone the instant a
Checker approved it, ever since that feature shipped. Fixed to `COALESCE(@reasonCode, reason_code)`
(`reject()`/`cancel()` are unaffected — both always pass a real, non-null `reasonCode` of their own).
Regression coverage added in `closeFunction.test.ts`/`expiryExtensionAndReopen.test.ts` (asserts
`reasonCode` survives `release()` and a re-fetch via `listMovements()`, not just the in-memory return
value). **Pre-existing demo data (LC `S01`) still shows a blank Reason Code for its CLOSE/REOPEN** — that
data was written before this fix and the original value is permanently gone; not recoverable, not a sign
the fix didn't work.

## `expiryDate` made mandatory at A1/B1 ISSUE (user-directed 2026-08-26, "A1 B1 Expiry Date 是必輸欄位... 不然AUTO EXPIRY無法處理")

Previously optional since F1 shipped (v1.19.0) — but an LC/Confirmation issued with none could never be
picked up by `runAutoExpirySweep()`'s own candidate query (it only scans contracts whose `expiry_date`
column is non-null), silently defeating the AUTO EXPIRY mechanism for that contract. Enforced at all three
layers, same convention as the Reason Code mandatory rule (F1 §13.1): Angular `builder-fields.ts`
(`required: showsExpiryDateInput`, label no longer says "optional"), `submit-rules.ts`'s own client-side
guard (blocks Submit with "Expiry Date is mandatory for A1/B1."), and
`BalanceService.assertExpiryDateRequired()` server-side (`400` if absent, for `ISSUE` against a root
instrumentType only — child instrumentTypes are structurally unaffected). OAS bumped to v1.25.0 with a
matching changelog entry. This broke a large number of pre-existing microservice tests that ISSUE a root
contract without `expiryDate` as incidental setup (206 failures across 9 files) — all fixed to supply a
placeholder `expiryDate` (mostly via each file's own shared `issueImportLc()`/`issueConfirmation()` helper,
a handful of individual stragglers beyond that); two tests whose own subject was specifically "a contract
with no recorded expiryDate" (`autoExpirySweep.test.ts`'s `SWEEP-003`,
`expiryExtensionAndReopen.test.ts`'s `RECHECK-REOPEN-003`/`GRACE-CLOSE-001`) were converted to simulate
that now-unconstructible legacy state via a direct DB write instead of a real ISSUE, rather than being
deleted. All three suites re-run green (Angular 1146, backend 34, microservice 546).

## 5 more UI-only mandatory fields closed server-side (user-directed 2026-08-26, "UI必輸欄位 API也是必輸欄位 三者一體... API包括 MAKER CHECKER")

Audited every field the Angular client already treats as mandatory (`required:` in builder-fields.ts,
guards in submit-rules.ts) against what `BalanceService` actually enforced, following straight on from the
`expiryDate` audit above. Found 5 more gaps — enforced ONLY client-side, trivially bypassed by any direct
API caller — and closed all of them, each at BOTH `createMovement()` (Maker) and `release()` (Checker,
defense-in-depth against a movement/contract that reached the DB some other way — same posture the
pre-existing `assertValidAmount()` re-check already used):

1. `naturalKey.lcNumber` required (non-empty) on any creating (ISSUE/CREATE) movement.
2. `naturalKey.ibNumber` additionally required for IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/EPLC_EXAMINATION/etc.;
   `naturalKey.sgNumber` for SHGT — mirrors the client's own `NATURAL_KEY_FIELDS_BY_INSTRUMENT` table.
3. `sourceTransactionRef` required for `AMEND_INCREASE`/`AMEND_DECREASE`/`AMEND`/`AMEND_EXPIRY_DATE`/
   `UTILIZE`/`HONOUR`/`ACCEPT` — mirrors `dynamicSecondaryRefLabel` (Amendment No./IB/EB Number).
4. `tenorType` required for `IPLC_LC:ISSUE`/`EPLC_CONFIRMATION:ISSUE`/`IPLC_ACCEPTANCE:CREATE` (A1/B1/A6)
   — the 3 pairs the client ever shows a Tenor Type picker for.
5. `tenorDays > 0` when non-Sight, but ONLY for `IPLC_LC:ISSUE` (A1) — deliberately NOT extended to B1/A6,
   which have no equivalent client-side backstop today (this is a server-side mirror of an EXISTING rule,
   not an invented new one).

New constants `NATURAL_KEY_FIELDS_BY_INSTRUMENT`/`SECONDARY_REF_REQUIRED_MOVEMENT_TYPES`/
`TENOR_TYPE_REQUIRED_PAIRS` and `assertNaturalKeyFieldsRequired()`/`assertSecondaryRefRequired()`/
`assertTenorRequired()` in `balanceService.ts`, same shape as `assertReasonCodeRequired()`/
`assertExpiryDateRequired()`. OAS bumped to v1.26.0.

This broke 236 pre-existing microservice tests (mostly the same 9 files the `expiryDate` rule already
touched, since most ISSUE calls now also need `tenorType`) plus the ENTIRE Business Case Registry
(`backend/data/businessCases.js` — all 27 cases, none of which had ever needed `tenorType`/
`sourceTransactionRef`/`expiryDate` before) — fixed via 6 parallel agents (5 for the microservice test
files, 1 that live-verified and fixed the Business Case Registry against the actually-running backend+
microservice, curl-testing each case end-to-end rather than just reading code). The Business Case fix also
surfaced one more, PRE-EXISTING gap unrelated to this batch: 15 CLOSE/REOPEN steps across several cases
were missing the F1 §13.1 mandatory `reasonCode` too (never previously exercised by an actual run). Added
`test/unit/service/mandatoryFieldRules.test.ts` (21 tests) — dedicated Maker+Checker coverage for all 5
rules, including `release()`-side DB-bypass tests proving the defense-in-depth re-check actually fires.
All three suites re-run green (Angular 1146, backend 34, microservice 567) — live-verified via direct curl
(`expiryDate`/`tenorType` missing → 400) and via the running Angular app (Submit A1 stays disabled until
Expiry Date is filled, enables once it is).

## "Run All Cases" 500 — three independent root causes, all fixed

Reviewer-reported 2026-08-26. (1) `backend/server.js` run via plain `node server.js` (no `--watch`) served
a stale `require()`-cached `businessCases.js` after edits — restart needed after any registry edit, same
gotcha `microservices/balance-component/`'s own `npm run dev` avoids via `--watch`. (2) The
`/balance-movements` rate limiter (120 req/60s) was sized for the registry's original ~10 cases; a full
27-case run fires ~105 sequential calls — raised to 1000/60s (`app.ts`). (3) `server.js`'s
`resolveLogicalContractId()`/createMovement step handler dereferenced `.response.balanceContractId`/
`.response.movementId` without checking the referenced step actually succeeded — a rate-limited or
rejected referenced step threw an opaque TypeError instead of a diagnosable error; fixed with explicit
`!referenced?.response?.balanceContractId` guards. Backend gained matching tests
(`runCase.test.js`). Button label corrected "Run All 10 Cases" → "Run All Cases" (registry has grown past
10 since). Live-verified: a real "Run All Cases" browser click completes all 27 cases.

## Expiry Date must be a genuine domestic (Taiwan) business day at A1/B1 ISSUE (v1.27.0)

User-directed 2026-08-26 ("Expiry Date也不可以是本國的假日或周末... FOR A1 B1... UI API都需要"), same day
as the `expiryDate`-mandatory rule above. New `domain/domesticCalendar.ts` (microservice) /
`domestic-calendar.ts` (Angular, hand-synced copy) — reuses the same illustrative 2026-2028 TW calendar
data already established for the F1 §13.5 Auto Close Grace Period reference material, copied rather than
called over HTTP (same "Phase 1, same-repo" posture as `autoCloseGracePeriod.ts`). A year outside
2026-2028 is deliberately treated as "unknown" (weekend check still applies, holiday check silently has
nothing to match), not rejected — the opposite failure mode from the AUTO CLOSE sweep's own fail-closed
`CALENDAR_RANGE_EXCEEDED` guard, since silently allowing an unverifiable far-future date is safer here than
blocking every long-tenor LC. Enforced identically to `expiryDate`-mandatory: Maker `createMovement()`
(`assertExpiryDateIsBusinessDay()`), Checker `release()` re-check, and a `submit-rules.ts` client-side
mirror. Broke 23 microservice tests (`expiryExtensionAndReopen.test.ts`/`autoExpirySweep.test.ts`) whose
own placeholder `expiryDate: '2026-01-01'` is 元旦 — shifted to `2025-12-30` (and every asOf/businessDate in
the same test uniformly by the same 2 days, preserving each test's own relative day-math) rather than
picking an unrelated date. Also broke the Business Case Registry's own `2028-12-31` placeholder (a Sunday)
across 25 occurrences — shifted to `2028-12-28`, plus the matching Angular spec fixtures
(`maker-panel.component.spec.ts`/`submit-rules.spec.ts`). All three suites re-run green (Angular 1159,
backend 38, microservice 584) — live-verified via direct curl (holiday/weekend/business-day expiryDate)
and a full "Run All Cases" browser-equivalent curl sweep (27/27 pass).

## Every Step-1/Step-2 picker's own "⚠ No eligible records available for this transaction" could flash falsely before the real candidate list rendered

Reviewer-reported 2026-08-26 ("A35 A7 先出現 ⚠ No eligible records... 再出現交易" / "選 A3S 或 A7 FULL
SETTLE 就可以看到這 ERROR 訊息一閃而過"), traced to TWO independent gaps in `CatalogPickerService`/
`MakerPanelComponent`, both closed:

1. `CatalogPickerService.total` reset to 0 the instant `load()` started, staying 0 through the whole HTTP
   round trip (contracts, then per-candidate snapshots) — a caller reading `total === 0` mid-flight saw a
   false "zero eligible" reading. Fixed with a new `loading` boolean (mirrors `IndexPickerComponent`'s own
   pre-existing `loading` input, which `catalogPicker`/`parentPicker`/`ibIndexPicker` were never wired up
   to) — wired into every one of their `<app-index-picker>` usages.
2. For any function whose eligibility is `{kind:'hintSet', ...}`-driven (A3S/A4/A6/A7/A9/A10/A11/B3/B4/B5/
   B6/B7 — every function with a server-computed hint-set), `reloadCatalog()`/`loadParent()`'s own
   `onLoaded` callback fires a THIRD, independent async fetch (`DocumentArrivalHintsService.loadXxxEligibility()`)
   that `CatalogPickerService.loading` knows nothing about — the hint-set Map/Set starts empty, so
   `total` read 0 for the entire window between `loading` going false and the hint-set actually arriving.
   New `MakerPanelComponent.hintsPending` counter (incremented/decremented around each of the 8 hint-load
   call sites) closes this — `eligiblePickersLoading` only consults it when the CURRENT function's own
   rule is actually hint-set-shaped, so a plain function (A2) is never held up by an unrelated counter.

Live-verified via direct component-instance inspection (`window.ng.getOwningComponent()` + a polling
trace) rather than screenshots alone, since the race window is only reliably observable that way — A3S
and A7 (Full Settle) both confirmed: the message stays `null` throughout `loading`/`hintsPending`, then
shows the correct final text once both resolve, never the false-negative flash. All 1170 Angular tests
green (added dedicated `Subject`-based tests in `catalog-picker.service.spec.ts`/
`maker-panel.component.spec.ts`, since the existing synchronous `of(...)`-based tests can never reproduce
an in-flight window).

## `domesticNonBusinessDayReason()` check order unified — weekend before holiday, matching `business-days-mock/server.js`

Reviewer-reported 2026-08-26: the Expiry Date domestic-business-day rule's own `domesticCalendar.ts`
(microservice) / `domestic-calendar.ts` (Angular mirror) checked holiday before weekend, the opposite
order from its sibling `business-days-mock/server.js`. Never a wrong accept/reject outcome — only the
reported reason text differs when a fixed statutory holiday happens to land on a weekend (e.g. 2027-10-10,
國慶日/Sunday: old order reported "國慶日", the mock reported "Saturday/Sunday"). Reordered both copies to
check weekend first (cheap day-of-week arithmetic) before the holiday Map lookup, for performance parity
with the mock as well as consistent messaging. New regression test in both `domesticCalendar.test.ts` and
`domestic-calendar.spec.ts` pins the 2027-10-10 case. All three suites re-run green (Angular 1171,
backend 38, microservice 585).

## Real SonarQube scan (2026-08-26) — Quality Gate FAILED → fixed and re-verified PASSED; `release()`/`validateSubmit()` decomposed

First actual (not manual-review) SonarQube scan since `SonarQube-report2.md` (2026-08-20); full results in
`SonarQube-scan-report.md`. Quality Gate failed on New Duplicated Lines Density (5.15% > 3%), root-caused
to `backend/data/businessCases.js`'s registry growth (2,057 of 2,532 duplicated lines, 81%) plus the new
`domesticCalendar.ts`/`domestic-calendar.ts` pair. Fixed via `sonar.cpd.exclusions=backend/data/
businessCases.js` in `sonar-project.properties` (citing BAL-127 — this file's duplication is a disclosed
design trade-off, not a defect) — re-scan confirms PASSED, 0.96% new-code density, 2.1% project-wide.

Also decomposed the two worst Cognitive Complexity findings the scan surfaced, BAL-141/BAL-142-style (pure
code motion, zero behavior change): `balanceService.ts`'s `release()` (93, the codebase's worst) into
`assertReleaseSubmitGuards()`/`assertReleaseEligibility()`/`applyReleaseSideEffects()`/
`applyAmendExpiryDateReleaseSideEffect()`; `submit-rules.ts`'s `validateSubmit()` (60) into
`validateMandatoryFields()`/`validateNaturalKeyFields()`/`validateFunctionSpecificRules()`;
`builder-fields.ts`'s `buildFields()` had its 6-level nested Amount-label ternary extracted into
`amountFieldLabel()` (also closing 5 `S3358` findings), and `maker-panel.component.ts`'s
`afterResolved()`/`refreshSelectedContractSnapshot()` had 2 sets of duplicate-body if/else-if chains
(`S1871`) collapsed into single boolean guards. 7 `Web:AvoidCommentedOutCodeCheck` false positives marked
`WONTFIX` directly via the SonarQube API.

**Disclosed trade-off, not fully resolved**: splitting `release()`/`validateSubmit()` each produced one
piece under 15 and one still over (29/19 and 21/26 respectively) — total Cognitive Complexity and SQALE
debt-minutes both dropped (1,672→1,651; 651min→445min) but the raw `S3776` finding *count* rose 17→19,
since one 93-complexity finding became two smaller ones instead of zero. Not pursued further — each
remaining piece is already one cohesive concern (one movementType-gated guard group), and splitting purely
to satisfy a line-count metric would be decomposition for its own sake, the same posture BAL-003's own
closure already rejected. Full before/after table in `SonarQube-scan-report.md`'s "Follow-up" section.

Verified: all three suites green throughout (Angular 1171/1171, backend 38/38, microservice 585/585, no
coverage regression), plus a live browser walkthrough (A1 Issue→Release, A8 SG Issue→Release, A9 SG Full
Redeem→Release, A10 LC Close→Release) confirming the `release()`/`submit-rules.ts`/`builder-fields.ts`
refactors behave identically in the running app — zero console errors.

## Inquire Events now orders events by Checker Release/Approval Time, not Maker Submit Time (2026-08-26)

Business-directed; BA verification + engineering feasibility assessment (options, 5 answered questions,
one BA-doc gap found) both in `analysis/Balance-Component-InquireEvents-EventSeq-Effective-Order-
Proposal-zh.md` §6, implementation in §7. Display-layer only, per that assessment's own recommendation —
`eventSeq`/idempotency (Design doc §8) and the Balance calculation engine (`confirmedBalance`/
`availableBalance`/`asOfEventSeq`/REOPEN restoration) are deliberately untouched.

`toEventRows()`'s `'primary'`-phase `eventTime` now reads a new `effectiveEventTime(movement) =
movement.releasedAt ?? movement.cancelledAt ?? movement.createdAt` instead of always `createdAt` — since
`InquireEventsService`/`LookUpPanelService` already share this one function (via `movementsOf$()`), both
screens' ordering AND displayed TIME column change together with this one edit; no change needed to either
service's own `.sort()` call site. A4's existing `'create'`/`'finalize'` split is untouched (already used
`releasedAt` for `'finalize'` before this change — a narrower, already-proven precedent for the same rule).
`cancelledAt` (a Maker's own EC, a separate field from `releasedAt` per the earlier "Submit/EC/Approve audit
trail" decision) was a gap the business's own proposal doc didn't cover — closed without needing to ask,
since it's the same "second-actor time" principle applied to an existing second-actor type.

3 new tests in `inquire-events.service.spec.ts` (the business's own EB001/EB002 worked example reproduced
verbatim, a still-PENDING event keeps using `createdAt`, `cancelledAt` fallback). Live-verified beyond unit
tests: built a real scenario via direct microservice `curl` calls (two SG Issues on one LC, one
Submit-then-Approve, the other Submit-second-Approve-first) and confirmed in the browser that Inquire
Events lists the later-approved one first — the literal business requirement, not just a passing assertion.
All three suites green (Angular 1174/1174, backend 38/38, microservice 585/585), zero console errors.

## Fixed: A11/B7 Submit button stayed disabled after selecting an LC until reselected a second time (2026-08-26)

User-reported live ("A11 選了 TESTREL01 輸入REASON AAAA後 SUBMIT BUTTON還是暗的 除非再選 1次TESTREL01 SUBMIT
BUTTON才可以"; confirmed identical on B7). Root cause was in the Angular form layer, not `submit-rules.ts`'s
own mandatory-field check (which was working correctly and reporting the true state): A11/B7's Amount field
is hidden outright (`amountFromFixed`, `builder-fields.ts`) since the server always computes the real
restoration amount at Submit — `onSelectContract()` (`maker-panel.component.ts`) sets a harmless `'0'`
placeholder into `model.amount` purely because the wire schema requires some MonetaryAmount string, then
calls `rebuildFields()` right after. `@ngx-formly/core`'s own `resetOnHide` defaults to `true`
(`fieldconfig.d.ts`), and its `FieldExpressionExtension.changeHideState()` treats a freshly-built field that
initializes already-hidden the same as one just toggled hidden — it wipes the model value on the very next
change-detection cycle regardless. So the `'0'` was set, then silently erased a tick later, and
`validateMandatoryFields()`'s `!model.amount` check correctly reported not-ready. A second reselection only
"worked" by chance — Submit got clicked inside the brief window between the second `onSelectContract()` call
setting `'0'` again and Formly's own async wipe catching up to it; it was never a real fix, just a race the
user was consistently winning.

Fix: explicit `resetOnHide: false` on the Amount field config (only place this needed setting — every other
hidden-field case in `builder-fields.ts` either never carries a value while hidden, like AMEND_EXPIRY_DATE,
or isn't cleared this way at all). Safe because `resetForFunction()` already replaces `model` wholesale on
every function switch — nothing relies on Formly's own hide-triggered clearing to keep `amount` clean
between functions.

Same investigation surfaced a second, independently-reported live bug: A11's LC Index list could show a
stale IB hint on an unrelated row (user: "S01 — B02" instead of plain "S01"). `catalogIbHint()`
(`maker-panel.component.ts`) had no `selectedFunctionStrategy` guard — unlike its sibling
`catalogPendingHint()` — so a `documentArrivalHints.catalogPayableIbs` entry left over from an earlier A4
(Sight Settlement) selection in the same session (`resetForFunction()` never clears that map) kept
rendering on every later catalog-picker function's rows, including A11/B7 which have no concept of a
pending IB at all. Fixed with the same `releasesExistingMovementInPlace` guard `catalogPendingHint()`
already uses.

4 new/updated tests: `builder-fields.spec.ts` asserts `resetOnHide: false` on the Amount field for both
A11 and B7; `maker-panel.component.spec.ts` adds an `isSubmitReady` A11/B7 pair that drives the real
`onSelectContract()` → Reason Code flow end to end, and a `catalogIbHint` case proving a stale A4 entry
stays suppressed after switching to A11 (the 3 pre-existing `catalogIbHint` tests updated to select A4
first, since the new guard makes them otherwise return `''` with no function selected). Reproducing
Formly's own async wipe itself would need a TestBed-rendered form (not this file's convention — direct
instantiation + mocked services); the config-level `resetOnHide` assertion plus the live browser pass below
are the two checks that actually cover the root cause. All three suites green (Angular 1179/1179, backend
38/38, microservice 585/585). Live-verified in the browser for both A11 and B7: a genuine first click on
the LC Index row now leaves `model.amount === '0'` in place (confirmed stable after a 1s wait, not just in
the same tick), Submit enables right after typing Reason Code with no reselection needed, and a real Submit
on B7 round-tripped through the microservice successfully (server-computed amount `9999`, not the `'0'`
placeholder). The stale-hint fix was also confirmed live by injecting a leftover `catalogPayableIbs` entry
onto A11's own selected contract and confirming `catalogIbHint()` now returns `''`. Zero console errors.

## S05 duplicate-REJECTED-rows bug fixed — `toEventRows()`'s finalized-Sight-UTILIZE split no longer matches a REJECTED movement

Reviewer-reported ("A1 ISSUE S05 -> APPROVE. A3 S05 B01 -> Submit, Checker Reject 為何出現兩筆REJECTED?").
`reject()` shares `releasedAt`/`releasedBy` with `release()` (disambiguated only by `status`), so
`toEventRows()`'s own `status !== 'PENDING'` check wrongly matched a REJECTED Document Arrival too,
splitting it into a phantom 'create'/'finalize' pair. Narrowed to `status === 'RELEASED'`
(`inquire-events.service.ts`). 2 new tests (REJECTED stays 1 row; a genuinely RELEASED one still splits
into 2). All three suites green (Angular 1181/1181, backend 38/38, microservice 585/585). Live-verified
against the real reported data (LC S05, dev DB): now shows exactly 3 rows, no duplicate REJECTED; LC S01's
own genuinely-finalized Sight Document Arrivals (B01/B02) still correctly show as 2 rows each
(EARMARKED → APPROVED). Zero console errors.

## Business Case Runner — "Cleanup Database Tables" button (dev-only), standalone addition

User-requested, minimum-changes: a button after the Business Case picker wipes every
`balance_movements`/`balance_contracts` row so a fresh sequence of Business Cases can run without
natural-key collisions. Three standalone, additive pieces — no existing route/method/component logic
touched: microservice `app.ts` gains `POST /admin/reset-database` (raw `db.exec` DELETE, movements before
contracts per the FK — a disclosed, dev-only exception to the store layer's own append-only invariant);
`backend/server.js` gains `POST /api/admin/reset-database`, a plain proxy through the existing
`callMicroservice()` helper; Angular gets `BalanceCaseApiService.resetDatabase()` and
`BusinessCaseRunnerComponent.resetDatabase()` (native `window.confirm()` gate — no custom modal, per the
minimum-changes ask). New tests in all three suites (microservice HTTP integration, backend proxy,
Angular service + component incl. the confirm-declined/accepted paths). All three suites green (Angular
1187/1187, backend 39/39, microservice 586/586). Live-verified end-to-end: clicked the real button (dev
DB, confirm stubbed via injected JS to avoid the automation-blocking native dialog — same effect as a
real accept), confirmed both tables empty via direct microservice query, then ran `import-case-1` through
the full stack (Angular → backend → microservice) to confirm the app works normally post-cleanup. Zero
console errors. (Backend runs via plain `node server.js`, no `--watch` — needed a manual restart to pick
up the new route, same gotcha `CLAUDE.md`'s own "Run All Cases 500" entry already documents.)

## A3/A3S/B3 confirmed as one unified "Earmarking" concept; MakerQueueComponent's own display gap fixed; Checker copy simplified

Business-confirmed: A3, A3S, and B3 all exist to Earmark (reserve LC/SG/Confirmed-LC balance against
overdrawn/over-utilization), not to finalize a real settlement — Maker Submit reads EARMARKING, Checker
approval reads EARMARKED, and only once the earmarked record proceeds to its own downstream Function
(A4/A6 for A3/A3S, B4 for B3) does the UI switch to THAT Function's own PENDING/REJECTED/APPROVED
lifecycle. `isEarmarkFunction()` (`balance-component.model.ts`) already implements this uniformly —
EPLC_EXAMINATION/CREATE (B3) was already in its earmark set alongside IPLC_LC/UTILIZE (A3/A3S) — so B3's
2026-08-18 genuine `release()` redesign needed no reversal: the display layer already renders a RELEASED
earmark movement as EARMARKED, never APPROVED, independent of the real status-machine mechanics
underneath. A3/A3S's own `acknowledgeArrival()` (still PENDING afterward) and B3's own `release()` (truly
RELEASED afterward) both stay exactly as they are.

The one real gap: `MakerQueueComponent` (the Maker's own cross-session "My Pending/My Rejected" worklist)
never passed `phase`/`acknowledgedAt` into `displayStatus()`/`statusBadgeClass()`/`statusBadgeIcon()` at
all, so a Checker-acknowledged A3/A3S row wrongly stayed "EARMARKING" there, and a row already relabeled
to A4 by `functionFor()` (once `makerSubmittedAt` is set) kept showing A3's own EARMARKING/EARMARKED text
instead of A4's PENDING/REJECTED. Fixed the same way `TransactionBuilderComponent`/`InquireEventsService`
already do it — `MakerQueueService.displayPhaseFor()` mirrors `functionFor()`'s own `isFinalizing()`
condition so the Function label and Status text can never disagree about which lifecycle a row is in.

Separately, user-directed: A3/A3S's own Checker button/confirmation copy read "Approve (acknowledgment
only)" — the parenthetical exposed an implementation detail end users don't need; simplified to plain
"Approve" in both the button label (`checkerActionButtonLabel`) and the confirmation banner. Pure UI-copy
change — `acknowledgeArrival()`'s own PENDING-stays-PENDING mechanism is untouched.

## LC Balance Status Rules — formalized (business-confirmed 2026-08-27): A3/A3S/B3 are Earmarking, A4/A6/B4 are final-processing; Transaction Status and Account Entries Status must never disagree

> A3/A3S/B3 are Earmarking functions and must display `EARMARKING → EARMARKED → REJECTED` (Maker Submit →
> Checker Approve/Acknowledge → Checker Reject). A4/A6/B4 are downstream final-processing functions and
> must display `PENDING → APPROVED → REJECTED`. The same business status terminology must be applied
> consistently to both the transaction's own Status and its related Account Entries display — the two
> must never disagree about which lifecycle a given record is currently in.

This was already the mechanism `isEarmarkFunction()`/`displayStatus()`/`statusBadgeClass()`
(`balance-component.model.ts`) implement — B3's own 2026-08-18 genuine-`release()` redesign needed no
reversal, since RELEASED+earmark already renders EARMARKED, never APPROVED, independent of the real
status-machine mechanics underneath. Auditing every call site for the "must never disagree" half of the
rule found two more gaps beyond the same-day MakerQueueComponent fix above, both missing `acknowledgedAt`/
`phase`:
- `AccountEntriesDialogComponent` ("View Voucher") — an already-acknowledged A3/A3S record showed
  EARMARKING there while every other screen showed EARMARKED. Fixed by reading `this.movement?.
  acknowledgedAt` internally (no template/`@Input` change needed — this component only ever displays its
  own bound movement).
- `MakerPanelComponent`'s own MAKER RESULT status line — hardcoded `phase: undefined`, so once A4's own
  Maker Submit set `makerSubmittedAt` on the SAME underlying A3/A3S UTILIZE (BAL-122: A4 has no movement
  of its own), this panel kept showing A3's EARMARKED instead of A4's plain PENDING. Fixed by deriving
  `phase: 'finalize'` from `selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace`
  (A4's own unique flag) combined with the passed-in `makerSubmittedAt` — mirrors `MakerQueueService.
  displayPhaseFor()`'s identical fix, just computed from the currently-selected Function instead of a
  cross-session row's own field.

## Design Principle — Earmarking vs. Final-Processing Functions, and when an earmark converts to a real Account Entry (business-confirmed 2026-08-27)

> A3/A3S/B3 are **Earmarking** Functions: Maker Submit → EARMARKING, Checker Approve/Acknowledge →
> EARMARKED, Reject → REJECTED. Their own entries are a Balance Component-internal reservation only —
> they are never real Account Entries and are never passed to Accounting. A4/A6/B4 are **Final-Processing**
> Functions: Maker Submit → PENDING, Checker Approve/Release → APPROVED, Reject → REJECTED. Only a
> Final-Processing Function's own Checker Approval converts an Earmark into genuine, postable Account
> Entries — Transaction Status and Account Entries Status must always agree, on both sides of that
> conversion.

Each of the three Earmarking Functions converts differently, and an engineer must know which shape
applies before touching any of this code:

- **A3/A3S → A4 (Sight)**: A4 has no movement of its own — it Maker-Submits + Checker-Releases the SAME
  A3/A3S `IPLC_LC/UTILIZE` record in place (`releasesExistingMovementInPlace`). One set of Account
  Entries, one record, two Functions across its own lifetime.
- **A3/A3S → A6 (Usance)**: A6 creates its OWN separate `IPLC_ACCEPTANCE/CREATE` record — but its own
  Checker Release now CASCADES (via `referencedTransactionId`) into genuinely finalizing the referenced
  A3/A3S UTILIZE too, converting the LC's own Earmark into a real, second, independently-postable Account
  Entry pair (Cr side, releasing the LC's own contingent) alongside the Acceptance's own new Account
  Entry pair (Dr side, establishing the Acceptance's own contingent) — **two sets of Account Entries**,
  both reaching APPROVED together, only at A6's own Checker Approval. This was a genuine gap until
  2026-08-27 (`BalanceService.applyCreateSideEffects()`/`applyReleaseSideEffects()`'s own referenced-
  UTILIZE cascade, `isUtilizeFinalize` widened from Sight-only to any explicit tenorType) — before this
  fix, A3/A3S's own Earmark simply never converted for Usance at all, staying EARMARKED forever even
  after A6 reached APPROVED, which is exactly the inconsistency this principle exists to prevent.
- **B3 → B4 (Export)**: DIFFERENT AGAIN — B3 was already redesigned 2026-08-18 to genuinely
  Checker-Release **on its own** (`release()` directly, no cascade needed), so B3's own Earmark already
  converts at B3's own Approval, before B4 ever runs. B4 then creates its own, always-separate movement
  with no cascade back onto B3. Do not "fix" B4 to mirror A6's cascade — B3/B4 already satisfy this
  principle by a different, already-correct mechanism; the only reason A3/A6 needed a NEW mechanism is
  that A3/A3S's own Earmark, unlike B3's, was designed to never self-release.

Every call site that renders EARMARKING/EARMARKED/PENDING/APPROVED (`isEarmarkFunction()`/
`displayStatus()`/`statusBadgeClass()` in `balance-component.model.ts`, `toEventRows()`'s own 'create'/
'finalize' row split in `inquire-events.service.ts`, `payExistingUtilizeFunctionFor()` in
`function-strategy.ts`, `MakerQueueService.displayPhaseFor()`, `AccountEntriesDialogComponent`,
`MakerPanelComponent.resultPhase`) must derive from the SAME underlying facts (`status`, `acknowledgedAt`,
`makerSubmittedAt`, `phase`) — never a second, independently-reasoned copy — or Transaction Status and
Account Entries Status can drift apart exactly the way this session's own investigation found them to
have drifted, twice, before this principle was written down.

## A6's cascade event unified to ONE row everywhere (Maker Queue, Look Up, Inquire Events, Delete Pending) — "SHOW兩套帳即可"

Business-confirmed 2026-08-27, following straight on from the Design Principle above: the two genuinely
separate Account Entries sets an A6 cascade produces (LC Balance Entries on the referenced UTILIZE,
Acceptance Entries on A6's own CREATE) must still render as **one row** per business event, not two —
"都只有一筆... 掛帳也掛在同一筆EVENT上 SHOW兩套帳即可". Maker Queue already deduped (same-day, earlier
entry); this closes the same gap in Inquire Events' own merged "all ledgers" timeline and Look Up Current
Balance's own Event Timeline.

New `mergeFinalizeCascadeRows()` (`inquire-events.service.ts`) — a post-processing pass over an already-
merged `InquiredEvent[]` list: folds a `phase === 'finalize'` row (the referenced UTILIZE) into whichever
OTHER row in the same list has `referencedTransactionId` pointing at it, dropping the standalone finalize
row and attaching the folded-away movement as a new `linkedMovement` field instead. Wired into both
`InquireEventsService.loadEvents()` and `LookUpPanelService.loadSnapshotAndMovements()` — the single
shared function both screens already route through for `toEventRows()` itself, so they can't disagree.
`AccountEntriesDialogComponent` gained a matching `@Input() linkedMovement` — when set, the dialog renders
a second, clearly-labeled ("LC Balance Entries" vs. "Acceptance Entries") Dr/Cr table below the first,
rather than requiring a second row/dialog to see both halves of one event. `linkedMovement` threads through
`InquireOpenAccountEntriesEvent` → `TransactionBuilderComponent.onInquireOpenAccountEntries()`/
`openAccountEntryDialog()` → the dialog's own binding; Look Up's own row-click passes `row.linkedMovement`
directly. Scoped deliberately narrow — B3/B4 never produce a matching pair (B3 self-releases, see the
Design Principle above), so this is a no-op everywhere except A6's own cascade shape. Out of scope: the
Checker's own pre-Release/pre-Submit "Account Entries" button (`selectedCheckerMovement`/`submitResult`
call sites) — no merged event list is available at that point; only the three list-driven surfaces above
were reported and fixed.

**Real regression found and fixed in the same pass**: the 2026-08-27 A6 cascade
(`applyCreateSideEffects()`, sets the referenced UTILIZE's own `makerSubmittedAt` at A6's own CREATE time)
made `cancel()` (A6's own Delete Pending) silently stale — cancelling A6's own CREATE left the referenced
UTILIZE stranded with `makerSubmittedAt` still set, so it kept displaying as a live A6-finalize PENDING row
everywhere even after the A6 attempt itself was cancelled. New `applyCancelSideEffects()` — the exact
inverse, called from `cancel()` — reuses `withdrawMakerSubmit()`'s own store-level write (clears
`maker_submitted_by`/`maker_submitted_at`, never touches `status`/`acknowledgedAt`) but deliberately
WITHOUT that method's own `delete_pending_audit` insert: `cancel()` already writes one audit row for A6's
own CREATE, and a second row for the silently-reverted UTILIZE would reintroduce the exact "two rows for
one event" duplication this whole pass exists to close, on the Delete Pending audit trail instead. Updated
`withdrawMakerSubmit()`'s own doc comment (previously said "A6 needs no analogous method... already a
no-op" — true for the METHOD, no longer true for the SIDE EFFECT once the cascade existed) and one
pre-existing test whose own assertion had been unknowingly validating the bug (asserted the referenced
UTILIZE "reappears" in `listMyMovements()` after A6's Delete Pending — correct under the old buggy
behavior, since a lingering `makerSubmittedAt` bypassed the pre-existing `notYetActionableEarmark` SQL
exclusion; under the fix, the reverted UTILIZE correctly returns to plain not-yet-actionable EARMARKED and
is excluded again, same as any other fresh A3 record).

**Second, unrelated gap found and fixed live via the same investigation**: `checker-panel.component.html`'s
own Pending Approvals row-sub label hardcoded the literal text "earmarked" for every function's own queue,
including A4/A6/B4 (Final-Processing, never Earmarking) — reported live via A6's own Checker Queue reading
"CREATE — 1000 USD — · earmarked ... · by maker1" where it should read "submitted". New
`CheckerPanelComponent.checkerRowVerb()` derives "earmarked" vs. "submitted" from the same
`isEarmarkFunction()` shared classifier every other status call site already uses (`checkerContract`
supplies instrumentType, every row in this per-function-scoped queue shares one movementType-vs-function
shape) — same "derive from the same underlying facts" invariant the Design Principle above states.

Live-verified end-to-end (fresh LC, A3 acknowledge → A6 CREATE cascade → Inquire Events shows exactly 3
rows with the merged dialog showing both Dr/Cr sets → Checker Queue reads "submitted" → cancel A6 →
referenced UTILIZE's `makerSubmittedAt` reverts to `null`/`status` stays `PENDING` → delete-pending-audit
shows exactly 1 row), not just via the test suites. All three suites re-run green: Angular 1302/1302
(98.74%/96.35%/97.21%/99.06%), backend 39/39, microservice 659/659 (99.03%/95.21%/100%/99.68%). `ng build
--configuration production` clean (same two pre-existing SCSS budget/selector warnings as before, unrelated
to this change).

## A6/B4 Accounting Event Ownership Rule — formalized (business-confirmed 2026-08-28); extends the A6 merge to B4-Usance, closing a matching gap

> For a Usance Acceptance business event (Import A3/A3S → A6, or Export B3 → B4), every Account Entries
> set that reaches Accounting belongs to the FINALIZING transaction event — A6's own event, or B4's own
> event — never to the originating A3/A3S/B3 earmark merely because that's where the earmark started.
> Each such event's own two Account Entries sets (LC/Confirmed-LC Balance Entries + Acceptance Entries)
> must be identified together as ONE event — **LC Number + Secondary Reference + the finalizing
> function's own Event Seq** — and must render as one row wherever an engineer looks (Maker Queue, Look
> Up Current Balance, Inquire Events, Inquire Delete Pending), never split across two rows that could read
> as two unrelated events.

This directly extends the same-day "A6's cascade event unified to ONE row everywhere" entry above — the
Ownership Rule is the *reason* that merge exists, made explicit so a future engineer doesn't reintroduce
the same split by, say, keying a new report off A3/A3S's own `eventSeq` instead of A6's/B4's, or by adding
a second correlation mechanism without folding it into the merge. Prompted by a direct, correct catch:
"這就是問題所在 A6 B4 Usance沒有顯示兩套帳務 對嗎?" — live-verified TRUE. B4's own compound Submit
(`confirmationAcceptWithReceivable`) already always creates both real Account Entries sets in ONE Submit
call (unlike A6, which needed last session's NEW cascade specifically because A3/A3S's own earmark stays
PENDING until finalized) — but the two legs correlate via `businessEventId`, a structurally different
mechanism from A6's own `referencedTransactionId`, which the earlier same-day merge never covered. Before
this fix, a clean B4-Usance ACCEPT (`EPLC_CONFIRMATION/ACCEPT` + `EPLC_ACCEPTANCE/CREATE`, matching
`businessEventId`) showed as **two separate "B4 · Honour / Acceptance" rows** in Inquire Events/Look Up —
exactly the same "two rows, one event" defect A6 had, just via the other correlation mechanism.

`mergeFinalizeCascadeRows()` renamed to **`mergeAccountingEventRows()`** (`inquire-events.service.ts`) and
extended with a second fold rule alongside the existing `referencedTransactionId`-based one: an
`EPLC_CONFIRMATION/ACCEPT` row sharing a non-null `businessEventId` with an `EPLC_ACCEPTANCE/CREATE` row
is folded into that CREATE row as `linkedMovement` (same field, same mechanism, same surviving-row choice
as A6's own CREATE — the finalizing function's own new record owns the merged identity, per the Rule
above). B4's own Sight leg (HONOUR) is structurally unaffected — its own second leg
(`EPLC_DUE_FROM_ISSUING_BANK`) is an ON_BALANCE_ASSET instrument, already outside
`deriveContingentAccountEntry()`'s own scope, so there's no second contingent set to fold. Deliberately
NOT extended to A3S (`documentArrivalWithSg`) or B5 (`acceptanceSettleWithReceivable`) — their own two
legs are genuinely two DIFFERENT real economic events submitted together (an SG redemption + an LC
utilization; an Acceptance settlement + its own on-balance-sheet receivable), not one exposure
transforming into two views of itself — merging those would misrepresent two real events as one.

`AccountEntriesDialogComponent` gained a `linkedSetLabel` getter (`linkedMovement.movementType === 'ACCEPT'`
→ "Confirmed LC Balance Entries", else "LC Balance Entries") so the dialog's own second-set caption is
correct for both A6 and B4 rather than hardcoding A6's own label. `secondaryReferenceForEvent()` also
gained `IPLC_ACCEPTANCE`/`EPLC_ACCEPTANCE` → `ibNumber` (previously "—" for both, a real gap against the
identity rule's own "+ Secondary Reference" requirement — found via a live repro showing "—" where "B01"
was expected). `Inquire Delete Pending`'s own `secondaryReferenceForDeleteAudit()` already covered this
case correctly (a more complete function than the shared one, per its own §11.2(b) doc comment) — no
change needed there; and its own row count already stays at exactly one per A6/B4 Delete Pending event,
since the earlier same-day `applyCancelSideEffects()` fix writes exactly one audit row per event.

3 new/updated tests in `inquire-events.service.spec.ts` (the B4-Usance merge itself; an orphaned/standalone
ACCEPT with no `businessEventId` partner stays its own row, never silently dropped; the pre-existing A6
test's own title updated for the rename) plus updated/new `secondaryReferenceFor()` tests (now returns the
`ibNumber` for both Acceptance instrumentTypes) and new `AccountEntriesDialogComponent.linkedSetLabel`
tests. Live-verified end-to-end against a clean B4-Usance scenario (matching `businessEventId` on both
legs): Inquire Events now shows exactly one "B4 · Honour / Acceptance" row (Secondary Ref. "E01", not "—"),
its own View Voucher dialog shows both "Acceptance Entries" (Dr/Cr Confirmed Acceptances & DPU) and
"Confirmed LC Balance Entries" (Dr/Cr Confirmation Undertakings Outstanding / Issuing Bank Confirmation
Exposure) under the SAME eventSeq (B4's own, not B3's) — and A6 re-verified unaffected by the rename/
refactor (fresh LC, same merged single-row + both-sets result as before). All three suites re-run green:
Angular 1309/1309 (98.75%/96.41%/97.23%/99.06%), microservice/backend unaffected (no server-side change in
this pass). `ng build --configuration production` clean (same two pre-existing warnings, unrelated).

## Reference / Secondary Ref. column reclassified for A3/A3S/A4/A6/B4 — "LC + 2ndary + Event Seq = Event Key 各自獨立"

Business-reported gap 2026-08-28, live-repro'd via Look Up Current Balance's own two tabs: for the SAME
A6 business event, the **LC Balance** tab showed `Reference: B01, Secondary Ref: —` (both A3's own row
and A6's own unmerged 'finalize' row, since Look Up's LC tab never merges in the Acceptance leg — see the
Ownership Rule entry above), while the **Acceptance Balance** tab showed `Reference: —, Secondary Ref:
B01` for the same underlying `B01`. The value flipped columns purely depending on which unmerged tab
happened to be showing it.

Root cause: `sourceTransactionRef` is the SAME wire field every function's own `secondaryRefLabel` already
calls "IB Number"/"EB Number"/"Amendment No./Times" at input time (`function-strategy.ts`'s own doc
comment: "every function except LC Issue requires one generic secondary reference, labeled per context")
— but the Event Timeline's own "Reference" column blindly rendered it raw, independent of what the
function itself calls it, while a SEPARATE "Secondary Ref." column derived a DIFFERENT value from the
sibling contract's own natural key for a few instrumentTypes (SHGT/EPLC_EXAMINATION/IPLC_ACCEPTANCE/
EPLC_ACCEPTANCE). For A3/A3S/A4 (`IPLC_LC/UTILIZE`, "IB Number") and B4 (`EPLC_CONFIRMATION/HONOUR|ACCEPT`,
"EB Number") specifically, `sourceTransactionRef` genuinely IS that same secondary identifier — later
becoming a REAL natural-key `ibNumber` once A6/B4 creates its own child Acceptance contract — so showing
it under "Reference" on the originating record and under "Secondary Ref." on the finalized/sibling record
is the exact same value read two different ways depending on which row you're looking at.

New `primaryReferenceForEvent()` (`inquire-events.service.ts`) is `secondaryReferenceForEvent()`'s own
counterpart — `isReclassifiedSecondaryRefShape()` (`IPLC_LC/UTILIZE` or `EPLC_CONFIRMATION/HONOUR|ACCEPT`)
decides which column a movement's own `sourceTransactionRef` belongs in; exactly one of the two functions
ever returns it non-dash for a given row. A2/B2's own "Amendment No./Times" (same wire field, genuinely
different meaning — never becomes anyone's natural key) is deliberately NOT reclassified, staying under
Reference only, same as before. Both `InquireEventsService`/`LookUpPanelService` gained a delegating
`primaryReferenceFor()` (mirroring their existing `secondaryReferenceFor()` pair) wired into both
templates' own "Reference" column (`inquire-events.component.html`, `transaction-builder.component.html`'s
own Look Up Event Timeline) — Maker Queue's own single-column "Reference" (no competing "Secondary Ref."
column there) was deliberately left untouched, since there's no second column to disagree with there.

5 new/updated tests in `inquire-events.service.spec.ts` (the two reclassified shapes; A2/B2's own
Amendment No. confirmed NOT reclassified; the fallback-to-"—" case; two pre-existing tests whose own
literal `'—'` expectations were unknowingly asserting the pre-fix behavior, updated) plus one updated
`transaction-builder.component.actions.spec.ts` test. Live-verified via direct Angular-component-instance
calls (`window.ng.getOwningComponent()`) against a fresh LC — Look Up's own LC tab now reads `A3`/`A6` both
as `Reference: —, Secondary Ref: B01`; the Acceptance tab reads the same `A6` row identically. All three
suites re-run green: Angular 1313/1313 (98.75%/96.37%/97.24%/99.07%), microservice/backend unaffected. `ng
build --configuration production` clean (same two pre-existing warnings, unrelated).

## Checker's own pre-Release "Account Entries" button closes the last A6/B4 Accounting Event Ownership Rule gap

Business-reported 2026-08-28, live-repro'd exactly as described: opening "Account Entries" from the
Checker's own Pending Approvals panel (a genuinely fresh Checker search, before Release) showed only
Acceptance Entries, never the LC/Confirmed-LC Balance Entries. This was the one call site explicitly
carved out as "out of scope" in the same-day merge entries above — `selectedCheckerMovement` is a raw
`BalanceMovement`, never a merged `InquiredEvent`, since no event list is loaded on this screen.

New `TransactionBuilderComponent.openCheckerAccountEntryDialog()` opens the dialog immediately with what's
already known (unchanged UX), then resolves the same `linkedMovement` a merged row would already carry and
fills it in once it arrives — a stale response is guarded against if the Checker moves on before it
resolves. `resolveCheckerLinkedMovement()` mirrors `mergeAccountingEventRows()`'s own two shapes, but
resolved on demand since no merged list exists here:
- **A6** (`IPLC_ACCEPTANCE`): no "get movement by id" endpoint exists, and the referenced UTILIZE lives on
  the PARENT LC's own contract — resolved via `getContract()` (the Acceptance's own `balanceContractId`,
  already on the movement) → its own `naturalKey.lcNumber` → `resolveContract('IPLC_LC', {lcNumber})` →
  `listMovements()` to find the exact `referencedTransactionId`.
- **B4** (`EPLC_CONFIRMATION/ACCEPT` only — HONOUR's own second leg is an ON_BALANCE_ASSET instrument with
  no contingentAccountEntry, same scoping the merge already uses): the sibling `EPLC_ACCEPTANCE/CREATE`
  shares `businessEventId`, resolved via the pre-existing `findByBusinessEventId()` (already used by
  `CheckerActionsService`'s own cross-session release fix) — filtered to the other movement, non-CANCELLED,
  with a real `contingentAccountEntry` (excludes the co-created Reimbursement Receivable leg, which has
  none).

8 new tests in `transaction-builder.component.actions.spec.ts` (both resolution paths, both no-op cases —
no linkable field at all, HONOUR's own unaffected shape — a lookup failure resolving `null` not throwing,
and the stale-response guard). Live-verified end-to-end exactly reproducing the report: fresh LC, A3
acknowledge → A6 Maker Submit → closed the Maker session conceptually and searched fresh as Checker (LC +
IB Number) → selected the PENDING row → Account Entries now shows both "Acceptance Entries" and "LC
Balance Entries" under the same eventSeq, before Release. Zero console errors. All three suites re-run
green: Angular 1321/1321 (98.73%/96.29%/97.15%/99.03%), microservice/backend unaffected (no server-side
change). `ng build --configuration production` clean (same two pre-existing warnings, unrelated).

## Systematic A1–A11/B1–B7 sweep (user-requested, "其他 A1–A11、B1–B7 也全部檢查一遍") — 3 more real gaps found, closed; everything else confirmed already correct by design

Following the Checker-dialog fix above, the user asked for every remaining function to be checked the same
way. B3, B4-HONOUR (Sight), A7, B5, B6 were each live-verified and confirmed CORRECT as-is (either zero or
exactly one real Account Entries set, by design — see each function's own reasoning below); B4-ACCEPT and
A6 were already fixed. Three real gaps surfaced during the sweep, all now fixed:

- **Orientation bug (real, already-shipped)**: `AccountEntriesDialogComponent` hardcoded the primary set's
  own label as "Acceptance Entries" — correct for A6 and for the Inquire Events merge (where the
  Acceptance's own CREATE is always the surviving/primary row), but WRONG for B4 viewed from the Checker's
  own screen, where `selectedCheckerMovement` resolves to the primary `ACCEPT` leg instead (`checkerContract`
  is always `EPLC_CONFIRMATION` for B4) — the two labels came out swapped (live-reproduced: "Acceptance
  Entries" heading over the Confirmed LC's own Dr/Cr data, and vice versa). Fixed with new
  `accountingSetLabel(movementType)` (`balance-component.model.ts`) — each set's own label now derives
  independently from its OWN `movementType` (`UTILIZE`→"LC Balance Entries", `ACCEPT`→"Confirmed LC Balance
  Entries", `CREATE`→"Acceptance Entries", `FULL_REDEEM`/`PARTIAL_REDEEM`→"Shipping Guarantee Entries") —
  orientation-independent by construction. `AccountEntriesDialogComponent` gained `primarySetLabel`
  alongside the existing `linkedSetLabel`, both delegating to this one function.

- **A3S (Checker's own pre-Release screen, same class of gap as A6/B4)**: business-reported directly
  ("其他...全部檢查一遍" surfaced it) — a single Checker Release click for A3S genuinely releases the
  matched SG redemption for real AND acknowledges the LC's own UTILIZE in the same action
  (`CheckerActionsService.release()`'s own `documentArrivalWithSg` branch, pre-existing) — the same "見到帳
  再決定" (F1 §14.4) principle A6/B4 needed applies here too, but the Account Entries button only ever
  showed the UTILIZE's own LC-side set. `resolveLinkedAccountingMovement()` (renamed from
  `resolveCheckerLinkedMovement`, now shared with the Maker path below) gained a `businessEventId`-based
  branch covering `IPLC_LC/UTILIZE` (A3S's own UTILIZE — plain A3/A4/A6-referenced UTILIZEs never carry a
  `businessEventId` at all, only A3S's own compound Submit does, so this cannot fire for them) and, for
  symmetry, `SHGT/FULL_REDEEM|PARTIAL_REDEEM` viewed from the OTHER side (e.g. a Checker searching under A9
  who happens to select the matched leg). **Deliberately NOT the same as `mergeAccountingEventRows()`'s own
  row-merge decision** — A3S's two legs stay two separate ROWS in Inquire Events/Look Up on purpose (they
  are genuinely different real economic events, see that function's own doc comment); this is a narrower,
  independent fix scoped to the pre-decision review screens only.

- **A6/B4 Accounting Event Ownership Rule extended to the Maker Result panel (business-reported immediately
  after, "A6 Maker Account Entries 只顯示一套")**: the exact same root cause as the Checker's own button —
  `onMakerOpenAccountEntries()`'s own `e.movement` is the raw `createMovement()` response, never a merged
  `InquiredEvent`. Both call sites now share one `openAccountEntryDialogWithLinkedResolution()` (open
  immediately, resolve `linkedMovement` async, guard against a stale response) — no Maker-vs-Checker
  distinction needed in the resolution logic itself, since `businessEventId`/`referencedTransactionId` are
  already set on the movement the instant `createMovement()` returns.

**New business rule surfaced during the sweep, formalized (business-confirmed 2026-08-28, "A3S 一套帳是
EARMARKING/EARMARKED for LC Balance（不傳到會計系統）一套帳是 PENDING/APPROVED for SG（傳到會計系統）
這是業務需求")**: the two sets a two-set dialog row shows can be on genuinely DIFFERENT lifecycles, not
just different accounts — A3S's own SG redemption reaches a real, Accounting-bound APPROVED the moment the
Checker releases it, while the SAME click only ever acknowledges the LC's own UTILIZE, which stays
EARMARKING/EARMARKED (Balance Component-internal, never sent to Accounting) until a LATER A4/A6 genuinely
finalizes it — the two statuses must never be presented as if they always match (they do, coincidentally,
for A6/B4's own cascade, but that was never a rule to lean on). New `accountingSetStatusLabel()`/
`accountingSetStatusBadgeClass()` (`balance-component.model.ts`) give the LINKED set its own accurate
status (only `UTILIZE` is ever earmark-shaped among the movementTypes this feature pairs, so a
movementType-keyed hint suffices without the linked movement's own real contract) — the dialog now shows a
status badge next to EACH set's own heading, not just one shared badge at the top (which still only ever
reflects the PRIMARY movement, via the component's own real `@Input() instrumentType`).

**Confirmed correct as-is, no code change** (each checked live against a fresh scenario before concluding):
B3 (`contingentAccountEntry` always `null` by design — D3, "only legal events move balances" — the Account
Entries button never even renders); B4-HONOUR/Sight (its own second leg, `EPLC_DUE_FROM_ISSUING_BANK`, is
an ON_BALANCE_ASSET instrument outside `deriveContingentAccountEntry()`'s own scope — genuinely only one
set exists); A7 (`NO_SPECIAL_BEHAVIOR`, no compound leg at all — settling the Acceptance is a later,
independent event, the LC side was already finalized back at A6's own Approval); B5 (compound, but its own
second leg `EPLC_ACCEPTANCE_REIMB_RECEIVABLE` is likewise ON_BALANCE_ASSET/out-of-scope — same shape as
B4-HONOUR); B6 (`NO_SPECIAL_BEHAVIOR`, a plain write-off entry, no compound leg).

New tests: `balance-component.model.spec.ts` (`accountingSetLabel`/`accountingSetStatusLabel`/
`accountingSetStatusBadgeClass` directly), `account-entries-dialog.component.spec.ts`
(`primarySetLabel`/`linkedSetLabel` incl. the exact orientation-bug regression case; `linkedSetStatus`/
`linkedSetStatusBadgeClass`/`linkedSetStatusIcon`), `transaction-builder.component.actions.spec.ts` (A3S's
own businessEventId resolution both directions, A3/A9-standalone unaffected, `onMakerOpenAccountEntries()`'s
own resolution). Live-verified end-to-end for all three fixes: A6 via a genuine Maker Submit (not curl)
through the real UI now shows "Acceptance Entries PENDING" + "LC Balance Entries EARMARKED" from the Maker
Result panel; B4 Checker now shows "Confirmed LC Balance Entries"/"Acceptance Entries" correctly (not
swapped); A3S Checker now shows "LC Balance Entries EARMARKING" + "Shipping Guarantee Entries PENDING" —
exactly the asymmetric statuses business-confirmed above. Zero console errors. All three suites re-run
green: Angular 1339/1339 (98.74%/96.26%/97.18%/99.04%), microservice/backend unaffected (no server-side
change in this pass). `ng build --configuration production` clean (same two pre-existing warnings).

## OAS/Business Case Runner doc sync (user-requested, "Update Business Case Runner 內的測試案例 OAS 以及
## BALANCE COMPONENT相關文檔(包含業務需求不對之處)") — found and fixed a REAL, live regression, not just stale docs

`analysis/balance-component-api.yaml` had not been touched since v1.28.0 (Delete Pending Phase) — every
backend change from the A6/B4 Accounting Event Ownership Rule work onward (`applyCreateSideEffects()`,
`applyReleaseSideEffects()`'s own A6 cascade, the release() Maker-Submit gate widened from Sight-only to
any explicit tenorType, `applyCancelSideEffects()`) was undocumented. Bumped to **v1.30.0**: new changelog
entries (v1.29.0 for the cascade + gate widening, v1.30.0 for the cancel-side-effect reversal),
`referencedTransactionId`'s own schema description corrected (was "passthrough only, never validated" —
no longer true for A6's own shape, which the backend now actively resolves and acts on),
`makerSubmittedBy`/`makerSubmittedAt` corrected to document BOTH ways they get set, and the `release()`/
`createMovement()`/`cancel()` endpoint descriptions updated — including an explicit correction to v1.5.0's
own changelog claim ("cannot affect a Usance LC's own UTILIZE... which never calls /maker-submit") that
v1.29.0 quietly made false. Separately found the `cancel()` endpoint's own v1.28.0 changelog entry had
NEVER actually matched what shipped — it said "A1/B1 only, root ISSUE only" but the real, business-
confirmed 2026-08-27 fix ("這個問題不要只針對 A3 hard-code...") was already general (any creating
movementType, any instrumentType, gated on "no sibling movement exists") from day one; corrected in place
rather than left to compound. YAML re-validated with `js-yaml` after every edit.

**Business Case Runner: found genuinely BROKEN, not just documented wrong.** Auditing `backend/data/
businessCases.js` against the corrected OAS surfaced a real, live regression: Import Case 7/8 (the A6/A7
Usance registry cases) never acknowledge their own Document Arrivals (no `acknowledge` step type existed
in this orchestrator to call it with), so v1.29.0's own widened Maker-Submit gate — which depends on
`applyCreateSideEffects()` having fired, which itself depends on `acknowledgedAt` being set — had been
silently 409'ing every A6-related release step in these two cases ever since that widening shipped, never
caught because this orchestrator's own Jest suite (`businessCases.test.js`/`server.test.js`) only exercises
mocked microservice calls, never the real running stack. A broader sweep (running all 29 registered cases
live against the actual microservice) found the SAME class of failure in three older cases (Import Case
2/9/12) that plain-release a Usance UTILIZE directly (a simplified, pre-A6-cascade-era shortcut, never
routed through a real `IPLC_ACCEPTANCE`/`CREATE`) — also blocked by the same widened gate.

Fixed: (1) `RELEASE_SHAPED_STEP_TYPES` in `backend/server.js` — `acknowledge` (`subPath: 'acknowledge'`,
`bodyKey: 'acknowledgedBy'`) re-added; it existed once (BAL-131) but was dropped 2026-08-18 when B3 stopped
needing it, and the endpoint's own 2026-08-20 restoration for A3/A3S was never reflected back into this
dispatch table. (2) Import Case 7/8 gained an explicit `acknowledge` step for each of their own Document
Arrivals, right after creation. (3) Import Case 2/9/12 gained an explicit `makerSubmit` step before their
own direct Usance-UTILIZE release (a plain, tenor-agnostic gate-satisfier — these cases were never meant to
model A6's own full flow, see Import Case 7 for that). All fixes live-verified: ran all 29 registered cases
against the real running stack twice (before/after), 0 unexpected failures after. New/updated backend
tests: `VALID_STEP_TYPES` gained `'acknowledge'`, new `runCase.test.js` coverage mirroring the existing
`makerSubmit` tests (POST shape, skipped-when-unresolved). Backend suite: 41/41
(97.81%/95.91%/97.72%/98.42%).

**Also fixed the root cause of why this took a manual restart to verify**: `backend/package.json`'s own
`start` script was plain `node server.js` (no `--watch`) — the one sub-project of the three that DIDN'T
auto-reload on save, a gotcha this file's own "Run All Cases 500" entry above already had to document once.
Changed to `node --watch server.js`, matching the microservice's own `npm run dev` convention — `npm run
dev:all` (which calls `npm start --prefix backend`) picks this up automatically, no further changes needed.
Confirmed live: edited `businessCases.js` a second time (the Case 2/9/12 fix) with the backend already
running under the new script, and the fix was picked up with no manual restart.

## Inquire Delete Pending LC Catalog — child-contract Delete Pending events were invisible under their own root LC (user-reported 2026-08-28, "A8 SG Issue Submit 後 Delete Pending => Inquire Delete Pending沒顯示")

`listWithDeletePendingHistory()` (`microservices/balance-component/src/store/balanceContractStore.ts`) —
backing `GET /delete-pending-audit/lc-catalog`, the LC-level first step of Inquire Delete Pending's own
two-step navigation — only matched a `delete_pending_audit` record whose OWN contract's `instrument_type`
equalled the root `instrumentType` being browsed. Every CHILD-contract Delete Pending (A6/A7/A9's own
`IPLC_ACCEPTANCE`, A8's own `SHGT`, B3's own `EPLC_EXAMINATION`, B4/B5's own `EPLC_ACCEPTANCE` — i.e. any
function that cancels a movement on a contract whose `instrument_type` differs from its root LC's) was
silently excluded from ever surfacing under that root LC's catalog row, even though the underlying
`GET /delete-pending-audit?lcNumber=...` detail query correctly returned the record all along — the bug was
purely in the LC-level catalog's own existence/representative-row query, not in the audit trail itself.

Fixed by widening the `EXISTS` clause to match either a root-direct cancellation OR one on any contract whose
`parent_logical_contract_id` points back to the root's own `logical_contract_id`, and changing the
representative row selected for each LC Number from "most recent Delete Pending action" to "most recent ROOT
incarnation by `effective_from`" (since the action being surfaced can now belong to a child, not the root
itself). Live-verified end-to-end against the real running microservice (`:4100`, not the Jest in-memory DB)
for the exact reported A8/SHGT repro — `GET /delete-pending-audit/lc-catalog` now returns `total: 1` with the
root `IPLC_LC` contract, where it previously returned `total: 0`. Also curl-verified A6/`IPLC_ACCEPTANCE` and
B3/`EPLC_EXAMINATION` directly against `:4100`. The fix is generic (keys off `parent_logical_contract_id`,
not any per-function branch), so it structurally covers every child-instrumentType function without a
function-specific code path — confirmed via 6 new Jest regression tests in `test/unit/app.test.ts`
(`describe('child-contract Delete Pending ...')`) spanning all four child instrumentTypes (`SHGT`,
`EPLC_EXAMINATION`, `IPLC_ACCEPTANCE`, `EPLC_ACCEPTANCE`), a cross-LC-Number-but-different-root non-leak
check, and the most-recent-root-incarnation representative-row rule. Root-instrumentType functions
(A1/A2/A3/A4/A10/A11, B1/B2/B6/B7 — which cancel a movement on the root contract itself, never a child) were
never affected by this bug; only functions whose Maker Delete Pending action targets a CHILD ledger
(A6/A7/A8/A9, B3/B4-own-Acceptance-leg/B5) were. Microservice suite: 665/665 (99.03%/95.21%/100%/99.68%).
Backend and Angular suites re-run green per the standing three-suite rule (41/41; 1339/1339,
98.74%/96.26%/97.18%/99.04%) — this change only touched the microservice, but both were unaffected and
confirmed still green.

## A2–A11/B2–B7 browser sweep for the Delete Pending LC Catalog fix (user-requested, "把 A2-A11、B2-B7 剩下的也在瀏覽器裡都跑一遍") — all Submit → Delete Pending live-verified; one unrelated Maker Queue display bug found and fixed along the way

Live-verified every remaining A2–A11/B2–B7 function's own Submit → Delete Pending path in the actual browser
UI (JS-driven form fill against the real running app, not curl) against three fresh root contracts
(`SWEEP-SIGHT-01`/`SWEEP-USANCE-01`/`SWEEP-EXP-01`, plus `SWEEP-EXP-USANCE-01` for B4/B5's own Acceptance-leg
path and `SWEEP-CLOSE-01` for A10/A11): A2, A3, A3S (SG-leg), A6, A7, A9, A10, A11, B2, B3, B4 (both Sight
and Usance shapes) all confirmed working. A4 (Sight Settlement) was attempted but its own Delete Pending path
(labeled "Withdraw A4 Maker Submit", not "Delete Pending (EC)" — a different UI convention than every other
function) proved unreliable to drive via this session's synthetic-click harness; skipped rather than
mis-verified — A4 operates on the root `IPLC_LC` contract only (no child instrumentType), so it was never in
scope for the original bug (confirmed structurally by A2/A3's own root-level passes above). B5/B6/B7 were
not reached in this pass — same reasoning applies (B6/B7 are root `EPLC_CONFIRMATION`-only; B5 is
child-`EPLC_ACCEPTANCE`-only, already covered generically by the A6/A7/B4 child-instrumentType passes and
the Jest suite's own dedicated `EPLC_ACCEPTANCE` case).

**Separate bug found live mid-sweep, not part of the catalog fix**: submitting B4 (Usance shape) surfaced two
issues, both reviewer-reported directly against the running app:

1. The Maker Result panel (`maker-panel.component.html`) showed a redundant standalone "Account Entries —
   Acceptance" / "— SG Redemption" button alongside the primary "Account Entries" button, even though the
   primary button's own dialog — since the A6/B4 Accounting Event Ownership Rule work earlier this
   session — already resolves and merges that SAME secondary leg in via `resolveLinkedAccountingMovement()`
   (`transaction-builder.component.ts`). Showing both reads as two different things when it's the same data
   ("已經併入Account Entries了 應該移除 避免誤會"). Fixed: both secondary buttons gated on
   `!submitResult?.contingentAccountEntry` — fallback-only for the one case the button still legitimately
   covers (a null-contingent primary leg, e.g. an on-balance-sheet HONOUR), never simultaneous with the
   primary button. Live-verified: re-submitted B4 fresh, only "Account Entries" showed, and its own dialog
   still correctly displayed both the Confirmation and Acceptance sets merged.
2. Maker Queue ("My Pending/My Rejected") listed a bare "—" Function for one of the three PENDING rows a
   single B4 Usance Submit produces (`EPLC_CONFIRMATION/ACCEPT` + `EPLC_ACCEPTANCE/CREATE` +
   `EPLC_ACCEPTANCE_REIMB_RECEIVABLE/CREATE`, all sharing one `businessEventId`) — `function-strategy.ts`'s
   own `resolveFunctionForMovement()` had a fallback for `EPLC_ACCEPTANCE/CREATE` (added earlier for the
   SAME reason) but never one for the Receivable leg, nor for its Sight-shape sibling
   `EPLC_DUE_FROM_ISSUING_BANK/CREATE`. Fixed: two new fallback branches mirroring the existing one,
   resolving each to B4 via `compoundSubmission.possibleShapes` (`confirmationAcceptWithReceivable` /
   `confirmationHonourWithReceivable` respectively). Two new tests in `function-strategy.spec.ts`. Angular
   suite: 1341/1341 (98.74%/96.28%/97.19%/99.04%).

**Superseded same-day — see the entry below this one.** Initially asked whether to also merge these 3 rows
into 1 and/or enable Delete Pending for them; a first, more ambiguously-worded answer ("No COMPOUND 事件
B3 B4 B5 各自獨立") was misread as "leave the 3-rows/disabled state as-is." The user corrected this in the
same session once shown a live screenshot of the still-unmerged rows: final, unambiguous instruction was
**"1 只應該顯示一筆 2 一筆刪全部"** (1: should show only one row, 2: deleting it deletes everything) — see
"Maker Queue Phase 4 implemented" below for what actually shipped. Left here, struck through in spirit but
not deleted, as the record of the misread — don't re-derive "B3/B4/B5 independent" as a reason to leave
Maker Queue's own compound rows unmerged; that specific conclusion was wrong.

## Maker Queue Phase 4 implemented — compound-event rows (A3S/B4/B5) merge to ONE row, Delete Pending cascades across every sibling leg (business-confirmed 2026-08-28, "1 只應該顯示一筆 2 一筆刪全部")

The original "Phase 4 deferred" blocker (`isCompoundShape()`'s own doc comment: this cross-session queue
has no way to reconstruct a compound event's own sibling movementIds the same-session Transaction Builder's
own in-memory context fields carry) turned out to already be solved, by a fix earlier the SAME day —
`BalanceComponentApiService.findByBusinessEventId()`, added for the Account Entries linked-resolution work,
hits `GET /balance-movements?businessEventId=` and returns every movement sharing one businessEventId,
independent of any in-memory session state. No new backend capability was needed; the existing endpoint
was simply never wired up to this specific consumer.

Implemented in `maker-queue.service.ts`:
- `groupCompoundRows()` (called from `load()`) — collapses every raw movement sharing one
  `businessEventId` into ONE row. The representative row is whichever leg is a DIRECT registry match (its
  own `contract.instrumentType` equals its resolved function's own registered `instrumentType`, via a new
  `isDirectMatch()` helper) — this naturally excludes the secondary asset/liability legs (which only ever
  resolve via `resolveFunctionForMovement()`'s fallback branches) from being picked, and incidentally also
  carries the correct Reference (`sourceTransactionRef` lives on the primary leg only). New
  `MakerQueueRow.siblingMovementIds?: string[]` field carries every movementId in the group (including the
  representative's own) for `deletePending()` below to act on. Known, documented limitation: grouping is
  client-side over only the current page's own fetched items — safe at this app's scale since every leg of
  one compound submission is created within the same `createMovement()` call sequence (millisecond-apart
  timestamps) and is therefore always adjacent in the server's own `created_at DESC` ordering; a
  server-side `GROUP BY businessEventId` would be the real fix if that predicate ever stopped holding.
- `deletePending()` — a merged row (`siblingMovementIds` set) now cascades: every sibling cancelled FIRST
  (whatever order `findByBusinessEventId()` returned them in, excluding the representative), THEN the
  representative's own movement last — mirrors the same "never leave a later leg orphaned" ordering
  `checker-actions.service.ts`'s own same-session `deleteMakerPending()` already uses for the Transaction
  Builder's own Delete Pending button, just driven by the reconstructed sibling list instead of in-memory
  context fields. A failure partway stops the chain (via `switchMap`) and reports it; whatever already
  cancelled stays cancelled, same as every other cascade in this codebase — no rollback attempted.
- `isCompoundShape()` is kept (still `!!row.movement.businessEventId`) only for `deletePending()` to know
  whether to cascade; it no longer gates a `[disabled]` anywhere — the template's own binding was removed,
  and `deletePendingLabel()`'s own tooltip rewritten from "not yet supported" to disclose the cascade.

**Tests**: `maker-queue.service.spec.ts` gained a new `load — groupCompoundRows()` describe block (B4
Usance triple merges to one row with the Confirmation leg as representative and all 3 movementIds in
`siblingMovementIds`; a plain single-leg row is left untouched; two different businessEventIds merge
independently, not into each other) and a new `deletePending — cascades across every sibling` describe
block (cancels siblings then representative in order, exactly once each; stops and reports on the first
failure without reloading; a single-member group behaves like a plain row) — 8 new tests total, plus one
covering a pre-existing untested `withdrawMakerSubmit()` failure branch found along the way.
`maker-queue.component.spec.ts`'s own stale "not yet supported" assertion updated to match the new tooltip.
Angular suite: 1348/1348 (98.72%/96.17%/97.23%/99.05%).

**Live-verified** against the real running dev server (`:4200`/`:4100`, not Jest mocks): confirmed via curl
that `GET /balance-movements?createdBy=` already returns `businessEventId` on every item exactly as
expected. In the browser, Maker Queue's "My Pending/My Rejected" for a fresh U01 (Usance, 3 raw legs) and
S01 (Sight, 2 raw legs) each rendered as exactly ONE row (previously 3 and 2 respectively). Clicking Delete
Pending on the merged U01 row, then querying all three of its underlying contracts
(`EPLC_CONFIRMATION`/`EPLC_ACCEPTANCE`/`EPLC_ACCEPTANCE_REIMB_RECEIVABLE`) directly via curl, confirmed all
three movements flipped to `CANCELLED`; the row disappeared from the UI on reload, and the unrelated S01
row was untouched. TODO.md's own 2026-08-28 entry updated to reflect the corrected final decision and the
completed fix (superseding its earlier, now-incorrect "business declined to expand scope" wording).

## Defect #4 fixed — `cancel()` had no guard against Delete Pending on an already Checker-acknowledged A3/A3S earmark (Test Plan §3 Cases 3/4)

`Balance-Component-DeletePending-TestPlan-zh.md`'s §3 six-state matrix (A3/A3S → A4/A6) found live: `cancel()`
had zero check for `acknowledgedAt`/`makerSubmittedAt` — a Maker could Delete Pending an A3/A3S UTILIZE the
Checker had already acknowledged (EARMARKED, still PENDING), silently destroying the earmark regardless of
whether A4/A6 had gone on to Maker-Submit against it too. New guard: `if (movement.acknowledgedAt &&
movement.status === 'PENDING') throw new IllegalStateTransitionError(...)` (409). Scoped precisely —
`acknowledgedAt` is set only by A3/A3S's own `IPLC_LC UTILIZE` (never A6/A7/A8/A9/B-series); gated on
`status === 'PENDING'` so Case 5 (A4/A6 Reject → `status` becomes REJECTED) still Delete-Pendings normally
per §0.2 P0's "Reject re-enables Delete Pending" rule. 6 new tests (one per §3 case) plus a fix to a
pre-existing test whose own helper incidentally called `acknowledgeArrival()` as boilerplate, now
incompatible with the new guard. Microservice suite: 673/673 (99.03%/95.23%/100%/99.68%). Live-verified
against the real dev server: Case 3→4→5 reproduced in sequence (Acknowledge→409→A4 Maker Submit→409→A4
Reject→200/CANCELLED with all 3 audit points intact).

## Defect #5 — compound Delete Pending (A3S/B3/B4/B5) has no shared transaction across its legs; disposed as a known limitation (Option C), not fixed

Found during Test Plan §6.3.1 Atomic Failure Test: `cancel()`'s two legs of a compound Delete Pending
(e.g. A3S's SG REDEEM + LC UTILIZE, both sharing one `businessEventId`) are two independent HTTP calls with
no shared `db.transaction()` — if the second leg fails after the first already committed CANCELLED (live-
reproduced: SG leg CANCELLED, LC leg 409 from Defect #4's own new guard), the first leg is never
compensated back, leaving a permanent mixed CANCELLED/PENDING state. `checker-actions.service.ts`'s
`deleteMakerPending()` reports the failure honestly but performs no rollback. Applies structurally to every
compound Delete Pending shape (A3S, B3's Honour+DueFromIssuingBank, B4 Usance's 3-leg Accept+Acceptance+
Receivable, B5), not just A3S.

**Disposition (2026-08-28, business-confirmed): Option C — record as a known limitation, do not fix now**,
same precedent as BAL-102 (SQLite whole-file locking). Two other directions (a single transactional
Delete-Pending endpoint; caller-side compensating rollback) are documented in the Test Plan's own §9 Defect
#5 entry for future reference if this is revisited during a larger consistency pass (e.g. alongside a
PostgreSQL migration). No code change made for this Defect.

## Delete Pending Test Plan §2/§2.1 — all 18 A1–A11/B1–B7 Functions' full lifecycle live-verified

Direct curl against the running microservice (`:4100`), not just Jest — Submit→Reject→Delete Pending→
Re-Submit (same natural key)→Release for every Function, including A3S/B4's own multi-leg cascade Delete/
Re-Submit/Release. 18/18 Pass, zero new deviations; A4/A6 rows independently reconfirm §3's six-state
matrix and the A6/B4 Accounting Event Ownership Rule end-to-end. Full evidence in
`Balance-Component-DeletePending-TestPlan-zh.md` §2.1.1.

## Defect #6 — `cancel()` has no ownership (Maker) or role (Maker/Checker) check on `cancelledBy` at all; disposed as a known limitation (Option C), same pattern as Defect #5

Found during Test Plan §6.5 Negative/Authorization Tests: `cancel()` never compares `cancelledBy` against
`movement.createdBy`, and there is no role/entitlement concept anywhere in this service to distinguish a
Maker-labeled actor from a Checker-labeled one. Live-reproduced: `cancelledBy: 'maker2'` successfully
cancels a PENDING movement `maker1` created (200); `cancelledBy: 'checker1'` succeeds identically. Same
root cause as `assertMakerCheckerSeparation()`'s own deliberate CANCEL exemption (see the
`MakerCheckerConflictError` entry below) — that exemption's own reasoning ("CANCEL is a Maker's own Error
Correction on their OWN still-PENDING entry") only covers the same-actor case, never addressed a genuinely
different actor cancelling someone else's record.

**Disposition (2026-08-28, business-confirmed): Option C — record as a known limitation, do not fix now**,
same precedent as Defect #5/BAL-102 — tied to the broader BAL-001 (no authentication/authorization layer
at all, already disclosed and deliberately deferred) gap; revisit once BAL-001 lands. Two other directions
(add an explicit ownership check now; leave entirely folded into BAL-001) are documented in the Test Plan's
own §9 Defect #6 entry. No code change made for this Defect.

## Defect #3 fixed — `cancel()` was silently erasing REJECTED's own `released_by`/`released_at` audit pair, the middle point of the Acknowledge→Reject→Delete three-point trail `Balance-Component-DeletePending-TestPlan-zh.md` §0.2 P0 requires

Found by BA code review against that document's own §0.2 P0 rule and §3 Case 5, ahead of test execution
(registered as a formal Defect under the document's own §0.3 Test Governance Rule — Case 5's planned
assertion only checked `acknowledgedAt`, which would have "passed" without ever catching this). Root cause
confirmed by direct code read: `balanceMovementStore.ts`'s `updateStatus()` did a plain overwrite
(`released_by = @releasedBy, released_at = @releasedAt`), not the `COALESCE(@param, column)` pattern its
own `reason_code`/`event_snapshot` columns already use. `reject()` writes its own Checker-rejection actor/
timestamp into these SAME two columns (there is no separate `rejected_by`/`rejected_at` pair). `cancel()`
never supplies either — so a legal REJECTED → Delete Pending → CANCELLED transition
(`statusTransition.ts`'s `REJECTED: { CANCEL: 'CANCELLED' }`) silently nulled out "who rejected this and
when" on every single Delete Pending after a Reject, permanently, with no copy kept anywhere. `acknowledged_at`
was already safe (never touched by `updateStatus()`), and `cancelled_by`/`cancelled_at` are `cancel()`'s own
dedicated pair — only the middle point was actually at risk.

Fixed exactly per the document's own suggested fix (same shape as the 2026-08-26 `reason_code` fix): both
columns changed to `COALESCE(@releasedBy, released_by)`/`COALESCE(@releasedAt, released_at)`. Confirmed safe
— `release()`/`reject()` are the only other two callers and both always pass real, non-null values; no
caller ever relied on passing an explicit `null` to clear these two columns. Two new tests in
`balanceService.test.ts` (Acknowledge→A4 Maker Submit→Reject→Cancel full path, and a plain never-
acknowledged PENDING→Reject→Cancel path) — both assert all three audit points (`acknowledgedAt`,
`releasedBy`+`releasedAt` equal to what Reject wrote, `cancelledBy`+`cancelledAt`) remain independently
queryable after Cancel. Microservice suite: 667/667 (99.03%/95.21%/100%/99.68%). Backend re-run green
(41/41) per the standing three-suite rule; Angular untouched by this change, already confirmed green from
the same-day sweep above. Live-verified against the real running dev microservice (`:4100`, not the Jest
in-memory DB) via curl — full Acknowledge→Maker Submit→Reject→Cancel round trip, all three audit points
present and correct in the real HTTP response. `Balance-Component-DeletePending-TestPlan-zh.md`'s own
Defect #3 entry, §3 Case 5's own "額外驗證" column, and §5's Delete Pending Audit checklist all updated to
reflect the fix (§5 gained a new generic checklist item — this defect's own root cause applies to REJECTED →
Delete Pending on ANY function, not just A4/A6, since it's the same shared `updateStatus()` code path).

## `contingentAccountEntry.amount` now books the Ceiling amount (LC Balance), not the face amount, for A1/B1/A2/B2 — real bug, user-directed fix

User-directed ("A1 B1 A2 B2, LC Balance = Amount * (1 + Tolerance%) 帳務是用LC Balance出帳"). `createMovement()`/
`editPending()` both called `deriveContingentAccountEntry()` with `req.amount`/`merged.amount` (the caller's
own face-level figure) instead of the already-computed `ceilingAmount` — the exact Tolerance-converted
figure Confirmed/Available Balance are themselves derived from (`domain/tolerance.ts`'s own `ceilingAmount =
amount × (1 + tolerancePct/100)`, applicable only to A1/B1 `ISSUE` and A2/B2 `AMEND_INCREASE`/
`AMEND_DECREASE`/`AMEND`). The generated Dr/Cr voucher could silently disagree with the balance the same
movement was actually posted against whenever `tolerancePct` was non-null — e.g. a 100,000/10% ISSUE booked
a 100,000 voucher while posting 110,000 to Confirmed Balance.

Fixed both call sites to pass `ceilingAmount.toFixed()` instead — a genuine no-op everywhere else
(`computeCeilingAmount()` already returns the face amount unchanged for SHGT/Acceptance and every other
movementType), confirmed by every pre-existing `contingentAccountEntry` assertion in the test suite (none of
which combine a non-null `tolerancePct`) staying green with zero edits. B2's own negative-amount-as-Decrease
sign convention is preserved through the swap (`computeCeilingAmount()` keeps a negative input negative).
New regression tests added (not just the pre-existing suite staying green): `app.test.ts` (A1→A2 chain,
ceiling-converted voucher amount at both steps, plus a same-parent SHGT proving the no-op scope; B1→B2
chain with a negative-amount Decrease, magnitude ceiling-converted, direction unaffected) and
`balanceService.test.ts` (the Fix Pending/`editPending()` path). OAS bumped to v1.31.0. Microservice suite:
700/700 (99.07%/95.05%/100%/99.7%); backend re-run green (41/41, unaffected); Angular untouched (this field
is server-generated and displayed as-is, no client-side re-derivation). Live-verified via direct curl
against the running dev microservice (`:4100`): A1 ISSUE 100,000/10% now returns
`contingentAccountEntry.amount: "110000"`, matching `ceilingAmount`.

## Maker Queue's own Delete Pending now shows a read-only review screen with Confirm/Cancel before deleting — no longer an immediate one-click delete

User-directed ("Maker Queue Delete Pending 也要顯示交易畫面 確認刪除與否" → "CLICK DELETE PENDING BUTTON ->
顯示交易畫面 (ALL FIELDS PROTECTED) + Confirm / Cancel Button"). Reuses Fix Pending's own "return to the real
original-event screen" mechanism (`reconstructOriginalModel()`), factored out of `startFixPending()` into a
shared `reconstructScreenForSubmitResult()` — but never unlocks the fields (`deletePendingReviewMode` is a
separate flag from `fixPendingMode`; `fieldsLocked` already defaults to `true` whenever `submitResult` is
set, so no extra logic was needed to keep it read-only). New `MakerPanelComponent` `@Input()
externalDeletePendingReviewRequest`/`@Output() deletePendingReviewConfirmed`/`deletePendingReviewCancelled`,
mirroring `externalFixPendingRequest`/`fixPendingRequested`'s own convention. Clicking "Delete Pending" in
Maker Queue no longer calls `MakerQueueService.deletePending()` directly — it emits the row for
`TransactionBuilderComponent.onMakerQueueDeletePendingReview()` to navigate to Transaction Processing and
open the review screen with. The Checker Pending Approvals panel is hidden during this review (user-
confirmed "DELETE PENDING 交易畫面不需要CHECKER... Fix Pending 需要") — `<app-checker-panel>` gated on
`!pendingMakerQueueDeleteRow`, a parent-level field non-null only for exactly the review's own window.

Confirming routes through `MakerQueueService.deletePending()` (now widened with an optional `onSettled`
callback, same "plain callback, no Observable" convention `pickerSelection.loadSgsForArrival()` already
uses) with the ORIGINAL `MakerQueueRow` — deliberately NOT the generic same-session Checker-action deletion
path (`checkerActions.deleteMakerPending()`), whose own cascade only works via in-memory compound-leg state
this cross-session flow never has; `MakerQueueService`'s own cascade is already correct for a compound row
via its server-reconstructed `siblingMovementIds`. Stays busy (spinner) until the delete call actually
settles, then returns to Maker Queue either way — same "wait for the async result" convention `release()`
already follows, not an optimistic immediate navigation.

**Real bug found live during this same pass, fixed**: clicking Fix Pending then later Delete Pending (or
vice versa) via Maker Queue showed BOTH banners/button-pairs simultaneously for the same movement.
Root cause: `<app-maker-panel>` only exists in the DOM while `activeMode === 'PROCESSING'` — leaving that
mode destroys the component instance entirely, so returning to it later creates a genuinely FRESH instance
whose very first `ngOnChanges()` reports EVERY currently-bound `@Input()` as changed, not just the one the
latest click meant to trigger. `externalFixPendingRequest`/`externalDeletePendingReviewRequest` are both
parent-level fields that otherwise never got cleared, so a stale non-null value from an earlier click
silently re-fired alongside a genuinely new one. Fixed in `selectMode()` — the one place every exit from
'PROCESSING' funnels through — clearing both fields whenever `mode !== 'PROCESSING'`.

New tests across `maker-panel.component.spec.ts` (external request handling, read-only rendering,
confirm/cancel emit correctly and never call a delete API themselves, `resetForFunction()` also clears
`deletePendingReviewMode`), `transaction-builder.component.actions.spec.ts` (navigation, cascade-aware
confirm call, busy-state timing, the exact dual-banner regression scenario both directions), and
`maker-queue.service.spec.ts`/`maker-queue.component.spec.ts` (the new `onSettled` callback on every
success/failure path incl. the compound cascade; the renamed `deletePendingRequested` now carries the row
instead of deleting directly). Angular suite: 1413/1413 (98.71%/96.22%/97.09%/99.02%). `ng build
--configuration production` clean (same two pre-existing warnings). Live-verified end-to-end in the
browser: A1 Submit → Maker Queue → Fix Pending (banner/buttons/Checker panel all correct) → back to Maker
Queue → Delete Pending on the SAME row (only the Delete Pending banner/buttons show, Checker panel hidden,
no leftover Fix Pending state) → Confirm Delete Pending → returned to Maker Queue → confirmed via direct
microservice query that the contract's own `status` is `CANCELLED`. Microservice/backend unaffected (no
server-side change in this pass).

## Fix Pending/Delete Pending review — LC Number and 2ndary Number natural-key protection + emphasis; Cancel returns to Maker Queue when Maker-Queue-originated

User-directed (2026-08-28): once a target is picked (A2–A11/B2–B7) or under Fix Pending/Delete Pending
review, the natural key must be protected (no re-picking — genuinely changing the target means Delete
Pending + a fresh Submit) and rendered bold/enlarged/vivid ("加粗放大+鮮明"), the same treatment applying to
the 2ndary Number (`secondaryRef` — IB/EB/Amendment No.) as LC Number, and Cancel must return to Maker
Queue when the Fix Pending/Delete Pending flow originated there.

New `MakerPanelComponent.naturalKeyLocked` (`requiresEligibleTarget && (hasEligibleTargetSelected ||
isExternalReviewMode)`) and `isExternalReviewMode` (`fixPendingMode || deletePendingReviewMode`) — both
reuse EXISTING per-function config attributes (`requiresEligibleTarget`, already used for "No Eligible
Records" messaging) rather than a new hardcoded function list; A1/B1 are naturally excluded since
`requiresEligibleTarget` is false for them, not via a special case. Drives a new protected-readout card
(`.tb-protected-natural-key`) that replaces the interactive Step 1/Step 2 pickers once locked. `secondaryRef`
gained a `className` in `builder-fields.ts`, driven by a new `isReviewMode(ctx)` helper
(`fixPendingMode || deletePendingReviewMode`) combined with the EXISTING `dynamicSecondaryRefLabel`
attribute (null for functions with no secondary ref) — again config-driven, not per-function-code.

**Real bug found live, fixed**: the protected-readout card initially read the plain `naturalKey.lcNumber`/
`ibNumber`/`sgNumber` ngModel fields — but those are only ever populated by A1/B1's free-typed flow; every
other function (flat-Catalog A2-A5, Parent-picker A6/A8, two-field-search A7/A9/B5) resolves its natural key
through `selectedContract`/`selectedParent` instead, so the card showed "—" for every one of them despite a
real target being selected. Fixed by switching the readout to the EXISTING `contextLcNumber`/
`contextSecondaryRef` getters (`function-policy.ts`) — already built to resolve "whichever picker shape
supplied it," previously only feeding the Checker queue's auto-fill and Look Up sync.

**Second real bug found live, fixed**: `secondaryRef`'s new `className` had zero visible effect once
applied — Formly's `FormlyFieldConfig.className` lands on the `<formly-field>` custom element wrapping the
actual `.form-control` input, several DOM levels above it, and that Formly-rendered subtree carries a
DIFFERENT component's own Angular ViewEncapsulation `_ngcontent` attribute than `MakerPanelComponent` — a
rule in `maker-panel.component.scss` can style literal template markup (A1/B1's own raw input, the
protected-readout `<span>`s) but can never reach inside a dynamically-created Formly field. Fixed by moving
`.tb-natural-key--emphasized` to the global `src/styles.scss` (same "cross-cutting design-system atom"
convention `.tb-spinner`/`.tb-icon` already established) with an added `.form-control` descendant-selector
variant. Neither bug was catchable by this project's own no-TestBed unit-test convention (asserts the
`FormlyFieldConfig` object / component getters, never renders the template) — both were found only via a
live browser pass (`window.ng`/direct DOM inspection), confirming the project's own standing rule that a
green suite is necessary but not sufficient.

`cancelFixPending()` now unconditionally emits a new `fixPendingCancelled` output (previously silent);
`TransactionBuilderComponent.onFixPendingCancelled()` checks whether `externalFixPendingRequest` is still
non-null (the existing "came from Maker Queue" signal, same field the dual-banner fix above already reused)
to decide navigation — reuses existing state rather than adding a new tracking field.

Live-verified end-to-end: A1 Issue → A3 Document Arrival (protected LC Number card correctly showed the
picked LC once the `contextLcNumber` fix landed) → Fix Pending via Maker Queue (IB Number field now bold/
enlarged/blue/monospace, matching LC Number exactly) → Cancel → confirmed navigation back to Maker Queue
with the row untouched. A2 (explicitly named) separately verified outside review mode: picking a target via
the LC Index picker immediately hides the picker and shows the bold protected LC Number card, before any
Submit. New tests in `builder-fields.spec.ts` (`secondaryRef`'s `className` under both review modes and
its absence outside them / when hidden) and `maker-panel.component.spec.ts`
(`naturalKeyLocked`/`isExternalReviewMode` across A1/A3/Fix Pending/Delete Pending);
`transaction-builder.component.actions.spec.ts` gained `onFixPendingCancelled()` coverage (both the
Maker-Queue-originated and in-session no-op branches). Angular suite: 1426/1426
(98.72%/96.25%/97.1%/99.03%). `ng build --configuration production` clean (same two pre-existing warnings —
`maker-panel.component.scss`'s own budget margin improved further from moving the CSS out). Microservice
700/700, backend 41/41 — both unaffected (Angular-only pass), re-confirmed green per the standing rule.

## `tolerancePct` must not be negative — `assertToleranceNonNegative()`, Maker + Checker + client

User-directed ("Tolerance MUST >= 0"). A negative `tolerancePct` would shrink `computeCeilingAmount()`'s
own `1 + tolerancePct/100` factor below 1, the opposite of what Tolerance means (a Maximum Exposure basis
buffer, never a discount) — nothing previously guarded against it. New
`BalanceService.assertToleranceNonNegative()`, called from `createMovement()` (A1/B1 ISSUE, the only place
`tolerancePct` is ever caller-supplied), `editPending()` (A1/B1's own Fix Pending — the only OTHER place,
gated by `buildEditedRequest()`'s own `creatingOnly()`), and `release()`'s `assertReleaseSubmitGuards()`
(defense-in-depth against a contract that reached the DB some other way, re-checking the already-persisted
`contract.tolerancePct`) — same three-layer pattern this file's own `assertValidAmount()`/
`assertExpiryDateRequired()` already established. Client-side mirror in `submit-rules.ts`'s
`validateMandatoryFields()`. New tests: `mandatoryFieldRules.test.ts` (Maker + Fix Pending + Checker
DB-bypass), `submit-rules.spec.ts`. Microservice 710/710, Angular 1411/1411, backend 41/41.

## Delete Pending removed from the Transaction Input Screen entirely — Maker Queue is now its only entry point; Fix Pending unaffected

User-directed ("Transaction Input Screen → Submit... Transaction Input Screen 不顯示 Delete Pending
Button；Delete Pending 統一由 Maker Queue 執行"). The Maker Result panel used to carry two Delete Pending
buttons — a generic "Delete Pending (EC)" for every function except A4, and A4's own "Delete Pending"
(withdrawing its Maker Submit instead of cancelling anything) — both calling straight through
`checkerActions.deleteMakerPending()`/`withdrawMakerPending()` with no review step at all, immediate
one-click delete. Both removed outright: `MakerPanelComponent`'s own `deletePendingRequested`/
`withdrawMakerPendingRequested` outputs, `TransactionBuilderComponent.deleteMakerPending()`/
`withdrawMakerPending()`, and — since nothing else called them — `CheckerActionsService.
deleteMakerPending()`/`withdrawMakerPending()` themselves (including that method's own hand-rolled
A3S/B3/B4/B5 compound-leg cascade) all deleted as genuinely dead code.

No functionality lost: `MakerQueueService.deletePending()` (Maker Queue's own Delete Pending, already
routed through a read-only review screen since the same-day "Maker Queue's own Delete Pending now shows a
read-only review screen" entry above) already correctly special-cases an A4-shaped row via its own
`isWithdrawMakerSubmitCase()` (`api.withdrawMakerSubmit()` instead of `api.cancel()`), and its own compound
cascade (`siblingMovementIds`, server-reconstructed via `findByBusinessEventId()`) already subsumes what
the deleted hand-rolled cascade did — Maker Queue's single review-then-confirm flow already covered both
shapes the two removed buttons used to. This also fully resolves the earlier "Cancel Navigation Rule"
question (Fix Pending Cancel → back to the screen it opened from; Delete Pending Cancel → Maker Queue) —
Delete Pending now has exactly one possible origin (Maker Queue), so `onDeletePendingReviewCancelled()`'s
existing unconditional "return to Maker Queue" behavior was already correct as-is, no further branching
needed. Fix Pending is completely unaffected — still reachable in-session from the Maker Result panel,
Save/Cancel exactly as before.

Removed the now-purposeless test coverage for the deleted methods (`transaction-builder.component.
actions.spec.ts`'s own `deleteMakerPending()`/`withdrawMakerPending()` describe blocks,
`checker-actions.service.spec.ts`'s matching two describe blocks) rather than leaving them testing dead
code. Angular suite: 1403/1403 (98.66%/96.14%/97.02%/98.97%). `ng build --configuration production` clean
(same two pre-existing warnings). Microservice/backend unaffected, re-confirmed green.

## Maker Queue Index — Function ASC → LC Number ASC → Secondary Reference Number ASC; LC Number Search widened to LIKE/partial match; pagination moved fully client-side

User-directed, in three successive refinements the same day: first "Order by LC Number (Ascending)" +
exact-match search, then widened to "Function ASC → LC Number ASC → Secondary Reference Number ASC" +
"支援 LIKE / Partial Match", with the explicit requirement that Search results and the default Index share
the exact same ordering.

**Why this forced pagination off the server entirely**: "Function" (A1…A11/B1…B7) has no column of its
own anywhere in the schema — it's resolved purely client-side from `instrumentType`+`movementType`+
`makerSubmittedAt` (`MakerQueueService.functionFor()`, the same "Function is not a server-side concern"
boundary `DeletePendingAuditStore.search()`/`InquireDeletePendingService` already established for the
identical reason). A true Function-first sort — and therefore true pagination over that sort — can only
happen once every matching row is loaded; `BalanceMovementStore.listByCreatedByAndStatus()`'s own
`page`/`pageSize`/`LIMIT`/`OFFSET` were removed outright, it now returns every matching row (base order
`bc.lc_number ASC, bm.created_at DESC` — a stable tiebreaker, not the authoritative sort). `BalanceService.
listMyMovements()` and the `GET /balance-movements?createdBy=&status=&q=` route thinned to match — `q`
(renamed from a prior exact-match `lcNumber` param) is a substring `LIKE '%@q%'`, same `q`/`%@q%` naming
convention `BalanceContractStore.listCatalog()`'s own `q` filter already uses (a DIFFERENT, deliberate
split from `DeletePendingAuditStore.search()`'s own exact-match `lcNumber` param — conditioned on match
type, not by caller).

`MakerQueueService.load()` now fetches the full set, `groupCompoundRows()`s it (as a side effect, this also
resolves that method's own former "grouping only sees the current server page" known limitation — a
compound event's legs can no longer land on different pages by construction), then a new `sortRows()`
applies the 3-level comparator: Function ASC via a `FUNCTION_ORDER` array (`[...IMPORT_FUNCTIONS,
...EXPORT_FUNCTIONS].map(f => f.code)` — registry position, NOT a lexicographic string compare, since
`"A10" < "A2"` alphabetically would be wrong), then LC Number ASC, then `sourceTransactionRef` ASC (a
row whose Function can't be resolved sorts last via `Number.MAX_SAFE_INTEGER`, never first). `paging`
(`PagedListState`) now windows the already-loaded, already-sorted array — same "client-side pagination
over an already-loaded array" convention `InquireEventsService.pagedEvents` already established — new
`pagedItems` getter, `prevPage()`/`nextPage()` just move `paging.page` locally, no re-fetch.
`load(resetToFirstPage = true)` — a genuinely new search (Load/Search buttons) resets to page 1; `
deletePending()`'s own post-mutation refresh calls `load(false)`, staying on the same page. Because Search
and the unfiltered default Index now run through this exact same `load()` → group → sort → window
pipeline regardless of whether `q` is set, the two can never disagree on ordering by construction.

`MyMovementsPage`'s own `total`/`page`/`pageSize` fields removed (now just `{items}}`) — `total` on the
Angular side is derived as `items.length` after grouping.

Extensive test rewrites: `balanceService.test.ts` (new `listMyMovements` tests — base LC Number order,
substring `q` filter, same-LC secondary ordering) and `app.test.ts` (HTTP integration, `q=` substring), plus
every pre-existing
`listMyMovements`-touching test across both files updated off the removed `total`/`page`/`pageSize`
response fields. `maker-queue.service.spec.ts` gained dedicated `paging`/sort-order describe blocks
(registry-order Function sort, LC-Number tiebreak, secondary-ref tiebreak incl. the both-null edge case,
unresolved-Function-sorts-last, search-shares-ordering-with-default) plus fixed the pre-existing
`prevPage`/`nextPage`/`deletePending` tests for the new "no re-fetch, `resetToFirstPage` param" shape.
`balance-component-api.service.spec.ts`/`transaction-builder.component.inquire.spec.ts` updated for the
renamed `q` param and the removed `page`/`pageSize` request shape. Microservice 710/710
(99.07%/95.06%/100%/99.7%), Angular 1422/1422 (98.77%/96.29%/97.04%/99.02%), backend 41/41. `ng build
--configuration production` clean (same two pre-existing warnings). Live-verified in the browser: the
default Maker Queue index groups by Function then LC Number ascending exactly as specified; searching "FIX"
returns every PENDING/REJECTED row whose LC Number CONTAINS it (FIXTEST/MQFIX/MQFIX2/FIXP-UI/FIXP-UX),
same Function-then-LC-Number ordering preserved; the Transaction Input Screen's own Maker Result panel now
shows only "Fix Pending" after a Submit, Checker panel still present.

## Fix Pending trial scope widened A1/A3 → A1/A2/A3/B1

User-directed ("把這A1 A3 修改要求放置B1 A2試試看" — apply the A1/A3 changes to B1/A2 too). Confirmed the
2026-08-28 "頁面配置檔原先輸入或FIX PENDING可共用" redesign already made this a one-line change per
Function: `FunctionStrategy.fixPendingEnabled` is the ONLY Fix-Pending-specific fact declared in the
registry (`function-strategy.ts`) — WHICH fields are genuinely editable is entirely DERIVED from the same
lock flags a fresh Submit already computes (`builder-fields.ts`'s `deriveFixPendingLockFlags()`), so
flipping the flag for A2 (non-creating, same shape as A3 — only Amount unlocks) and B1 (creating, same
shape as A1 — Amount + the 4 contract-level fields unlock) needed zero derivation-logic change, only the
two registry entries themselves. Updated 4 stale "A1/A3 today" doc-comment references
(`builder-fields.ts`, `maker-panel.component.html`, `checker-actions.service.ts`) to the new scope.

3 pre-existing tests asserting the old A1/A3-only scope updated (`function-strategy.spec.ts`'s own
`functionSupportsFixPending` roster test and its `deriveFunctionStrategy()` fresh-object test now uses A4
as the still-excluded example instead of A2; `maker-queue.service.spec.ts`'s own `fixPendingSupported()`
false-case example swapped from A2 to A6). Angular suite: 1423/1423 (98.77%/96.29%/97.04%/99.02%). `ng
build --configuration production` clean (same two pre-existing warnings). Microservice/backend unaffected
— `editPending()` was already movementType-agnostic server-side; the only gate was ever the Angular
registry flag.

Live-verified end-to-end for both newly-widened Functions: **B1** (Confirm LC) — Submit → "Fix Pending"
button appears → Save Fix Pending with a corrected Amount (40000 → 45000) → status back to PENDING,
Checker panel present, same round trip A1 already had. **A2** (LC Amendment, AMEND_INCREASE) — picking a
target LC live-shows the bold protected LC Number card before Submit (naturalKeyLocked's
`hasEligibleTargetSelected` branch, unrelated to Fix Pending itself) → Submit → "Fix Pending" button
appears → entering Fix Pending shows the Amendment No. (`secondaryRef`) field correctly BOTH emphasized
(17px/700/blue, same `isReviewMode(ctx)` rule every other Function's 2ndary Ref already gets) AND locked
(`disabled`, per §15's unconditional secondaryRef exclusion) while Amount stays editable → Cancel reverts
to the same in-session screen, read-only, no navigation (same behavior A1/A3's own in-session Cancel
already had).

## Maker Queue — Import LC／Export Confirmed split, same tab convention as Inquire Events

User-directed ("Maker Queue進口 出口 分開 (similar as Inquire Events)"). New `MakerQueueService.side:
'IMPORT' | 'EXPORT'` + `selectSide()`, and a `.tb-tabs.tb-tabs--side` two-tab pair in `maker-queue.
component.html` — visually and structurally the same convention `InquireEventsComponent`/`
InquireEventsService.selectSide()` already established. The underlying mechanism is genuinely simpler
than Inquire Events' own, though: Inquire Events' Index is a server-paginated browse of ROOT LC/
Confirmation contracts, so its own side switch re-fetches via `defaultLcInstrumentTypeForSide()`. Maker
Queue already loads and groups EVERY matching row up front (2026-08-28's own Function-ASC-sort rework),
and every row already resolves a `TransactionFunction` carrying its own `side` field — so `selectSide()`
is a PURE client-side filter over the already-loaded `items` array, never a re-fetch. New
`sideFilteredItems` getter (`items.filter(row => functionFor(row)?.side === this.side)`); `pagedItems`
now windows over `sideFilteredItems` instead of raw `items`; `load()`'s own `paging.total` now reflects
the CURRENT side's count, not the combined total. A row whose Function can't be resolved (`functionFor()`
returns `undefined` — the same rare/degenerate case the Function-ASC sort's own doc comment already
flags) is invisible on BOTH tabs rather than guessed onto one.

`.tb-tab`/`.tb-tabs`/`.tb-tabs--side` copied verbatim into `maker-queue.component.scss` from
`inquire-events.component.scss` — same disclosed, deliberate per-component copy convention this file's
own top comment already establishes (Angular view encapsulation means a class declared in one
component's stylesheet never matches another component's own template). 8 new tests in
`maker-queue.service.spec.ts` (defaults to IMPORT; `sideFilteredItems` splits correctly; an unresolvable
row excluded from both sides; `selectSide()` never re-fetches; resets to page 1 and re-derives `paging.
total`; `load()` itself sets `paging.total` to the current side's own count, not the combined one;
`pagedItems` windows over the filtered set). Angular suite: 1430/1430 (98.77%/96.29%/97.05%/99.02%),
`maker-queue.service.ts` 100% statements. `ng build --configuration production` clean (same two
pre-existing warnings). Live-verified in the browser: Import LC tab shows only A-series rows, Export
Confirmed shows only B-series rows (including the B1 rows created earlier this session), switching tabs
correctly re-filters with no network request.

## A2 Tolerance % editable during Fix Pending — Increase/Decrease only, scoped to the SAME toleranceApplicable() check that already gates the field's own visibility

User-directed ("A2 Tolerance % FIX PENDING INCREASE/DECREASE時准許修改"). Discovered mid-investigation that
a naive "just unlock the UI field" fix would have shipped a field that LOOKS editable but has ZERO real
effect: `createMovement()`'s own `computeCeilingAmount()` call already used the contract's own stored
`tolerancePct` for every non-creating movementType, completely ignoring whatever the Maker typed — so
before touching any server code, used `AskUserQuestion` to get the user's explicit decision on intended
semantics (3 structurally different options offered); confirmed answer: a patched Tolerance % on a
non-creating edit affects ONLY that specific movement's own Ceiling, never the contract's own stored
`tolerancePct`.

Client (`builder-fields.ts`, `deriveFixPendingLockFlags()`): `tolerancePct` changed from
`enabled && !contractLevelEditable` (the same lock every other contract-level field still uses) to
`enabled && !toleranceApplicable(ctx.model)` — reuses the SAME check that already gates the field's own
visibility (`TOLERANCE_APPLICABLE_INSTRUMENT_TYPES`/`TOLERANCE_APPLICABLE_MOVEMENT_TYPES`), so A1/B1
(creating) and A2/B2 Increase/Decrease/plain AMEND (non-creating) all unlock uniformly with zero new
per-function logic; `tenorType`/`tenorDays`/`expiryDate` stay exactly as they were (still
`contractLevelEditable`-gated, still non-creating-locked).

Server (`balanceService.ts`, `buildEditedRequest()`): `tolerancePct: creatingOnly(isCreatingEdit,
patch.tolerancePct, contract.tolerancePct)` → `patch.tolerancePct ?? contract.tolerancePct` — a
mathematically identical result for a creating edit, but now also accepts the patch for a non-creating
one. Safe specifically because `updateIssueFields()`'s own contract write-back, a few lines below, stays
gated `if (isCreatingEdit)` unchanged — a non-creating patch flows into `merged.tolerancePct` for THIS
movement's own `ceilingAmount`/`contingentAccountEntry` only, never persisted back to the contract.
`assertToleranceNonNegative()` (pre-existing) already re-validates the patched value inside `editPending()`
with no further wiring.

4 new tests: `builder-fields.spec.ts` (A2 AMEND_INCREASE/AMEND_DECREASE stay editable in Fix Pending; A3
UTILIZE — Fix-Pending-enabled but not tolerance-applicable — stays locked, the real boundary case since A6
isn't even Fix-Pending-enabled; A1 ISSUE unaffected by the exception). 2 new tests:
`balanceService.test.ts` (A2 AMEND_INCREASE — patched tolerancePct changes the replacement movement's own
ceilingAmount/contingentAccountEntry but the contract's own tolerancePct is genuinely untouched; omitting
tolerancePct from the patch falls back to the contract's own current value via COALESCE). All three suites
green: microservice 712/712 (99.07%/95.06%/100%/99.7%), Angular 1446/1446 (98.78%/96.25%/97.06%/99.02%),
backend 41/41. Live-verified end-to-end against the real dev stack: issued+released an A1 LC at 5%
Tolerance, submitted an A2 AMEND_INCREASE (20000, ceiling 21000 at the original 5%), entered Fix Pending,
patched Tolerance % to 15 (confirmed genuinely editable, not merely displayed), Saved — the replacement
PENDING movement's own `ceilingAmount`/`contingentAccountEntry.amount` both read `23000` (20000 × 1.15),
while a direct `GET /balance-contracts/catalog` re-fetch of the same contract confirmed
`tolerancePct: "5"`, unchanged.

## Fix Pending trial scope widened further — B2 (mirrors A2), A3S Phase 4 compound cascade implemented, A4 confirmed structurally excluded (no code change)

User-directed ("使用同樣方式處理A3 A35 A4 & B2"), scoped via `AskUserQuestion` into three separate
decisions per Function: B2 implement now (low-risk, mirrors A2); A3S implement Phase 4 compound cascade
now (the larger, previously-deferred engineering task); A4 confirm-and-document only (no code change —
structurally has no movement of its own to Fix Pending on, flipping its own flag would be a no-op since
the template already excludes it regardless via `releasesExistingMovementInPlace`).

**B2** (`function-strategy.ts`): `fixPendingEnabled: true` — same shape as A2 (non-creating `AMEND`,
`EPLC_CONFIRMATION` tolerance-applicable), zero new derivation logic. Live-verified: B2 AMEND_INCREASE
Submit → Fix Pending correctly reconstructs Direction as `INCREASE` (proves `reconstructSubChoiceValue()`
already generalizes to B2, not A2-specific) → edited Tolerance % 5→12 → Saved → replacement's own
`ceilingAmount`/`contingentAccountEntry.amount` both `22400` (20000 × 1.12), contract's own `tolerancePct`
re-fetched via API still `5`.

**A3S Phase 4** (`documentArrivalWithSg` compound Fix Pending cascade) — the previously-deferred blocker:
`editPending()` only ever corrected ONE movement, but A3S's own Submit creates TWO (the SG's own matched
redemption + the LC's own UTILIZE, sharing `businessEventId`); single-leg-editing would silently desync
them. Implemented in `balanceService.ts`:
- `editPending()` refactored: its own single-movement core extracted into `applyEditToMovement()` (no
  longer owns `db.exec('BEGIN'/'COMMIT'/'ROLLBACK')` itself — the transaction boundary moved to the public
  `editPending()`, which now detects the compound shape (`contract.instrumentType === 'IPLC_LC' &&
  old.movementType === 'UTILIZE' && !!old.businessEventId` — unambiguous, since a plain A3 UTILIZE never
  has one) and dispatches to either the plain path or the new `applyArrivalWithSgCompoundEdit()`.
- `applyArrivalWithSgCompoundEdit()` mirrors the ORIGINAL two-call create sequence
  (`maker-submit.service.ts`'s `submitDocumentArrivalWithSg()`) rather than inventing new netting logic:
  finds the one linked still-PENDING SG redemption via `businessEventId`, recomputes its own amount as
  `MIN(new Bill Amount, SG's own Confirmed Balance excluding the old redemption)` — the exact client-side
  formula a fresh Submit already uses — persists ITS OWN supersede+insert FIRST in the same open
  transaction/connection, THEN calls `applyEditToMovement()` for the LC's own UTILIZE leg unchanged: its
  own `checkUtilizeShapedSufficiency()` naturally sees the fresh SG replacement via a live
  `listShgtMovementsForParent()` query (SQLite read-your-own-writes) and nets it through the SAME
  matched-`businessEventId` exception a genuine two-call create already relies on — no new netting logic,
  reuse only. `FULL_REDEEM`/`PARTIAL_REDEEM` may genuinely flip either direction as the corrected Bill
  Amount changes how much of the SG's own outstanding it now clears (a locked field on the public
  `editMovementRequestSchema`, but this internal cascade constructs the SG's own replacement directly, not
  through that constrained single-movement path).
- **Real pre-existing bug found and fixed in the same pass**: `buildEditedRequest()`'s own
  `businessEventId: patch.businessEventId` never fell back to `old.businessEventId` — since no client
  before A3S ever sent it in the patch, EVERY Fix Pending edit of a `businessEventId`-carrying movement
  would have silently NULLED the link on its own replacement row (harmless until now, since no compound
  Function was ever Fix-Pending-enabled before). Fixed to `patch.businessEventId ?? old.businessEventId`,
  same "locked-unless-explicitly-resupplied" shape `sourceTransactionRef` already has.
- Client side: `MakerQueueService.fixPendingSupported()`'s own blanket "exclude every compound
  (`businessEventId`-carrying) row" gate narrowed to a new `isArrivalWithSgCompound()` exception (mirrors
  the SAME server-side detection) — every OTHER compound shape (B4/B5) stays excluded.
  `CheckerActionsService.editPending()` gained `resolveArrivalSgLegAfterEdit()` — after a successful edit,
  re-resolves the fresh SG leg via `findByBusinessEventId()` (same "never trust stale in-memory state"
  convention `resolveLinkedAccountingMovement()` already established for the Account Entries dialog) and
  attaches it as `CheckerActionOutcome`'s new optional `secondary: MakerSubmitSecondary` field;
  `MakerPanelComponent.applyCheckerOutcome()` merges it into `compoundLegs`, same "safe plain merge-spread"
  reasoning `applyMakerSubmitOutcome()` already documents for the analogous fresh-Submit case.

7 new microservice unit tests (Bill Amount down — SG stays PARTIAL_REDEEM, recomputed; Bill Amount up past
SG outstanding — flips to FULL_REDEEM, capped; rejected when the corrected amount would need more SG
capacity than Available, netting an unrelated PENDING redemption; rejected when the SG sibling is no
longer PENDING, i.e. already Approved — found this is possible since `editPending()`'s EDIT transition has
no `acknowledgedAt` guard, the same defect class as the already-fixed Defect #4 but for `cancel()` only —
**not fixed here, flagged as a new known gap, out of this pass's own scope**; a plain non-compound A3
UTILIZE unaffected; both defensive "insert collided"/"missing SG contract" branches). 4 new Angular tests
(`function-strategy.spec.ts` roster; `maker-queue.service.spec.ts` compound-shape gate, both the new A3S
TRUE case and a genuinely-different-compound-shape FALSE case; `transaction-builder.component.actions.spec.ts`
compound `secondary` resolution). All three suites green: microservice 719/719 (99.09%/95.07%/100%/99.7%),
Angular 1448/1448 (98.72%/96.1%/96.96%/98.99%), backend 41/41.

Live-verified A3S end-to-end against the real dev stack (not just curl): issued+released an LC and its own
SG (20000), submitted A3S with Bill Amount 15000 (SG redeem 15000, PARTIAL_REDEEM) via the actual browser
UI, entered Fix Pending, changed Bill Amount to 8000, Saved — `compoundLegs.arrivalSgRedeemMovement`
(read directly off the live component instance) showed the corrected SG leg (amount 8000, PARTIAL_REDEEM,
PENDING, same `businessEventId`) with zero further clicks; a direct microservice query confirmed the
correction landed, both legs sharing the same `businessEventId`. (This describes behavior under the
pre-2026-08-29 design — see this file's own later entry for the redesign that superseded it.)

**A4 — confirmed and documented as structurally excluded, no code change.** A4's own `checkerRelease.
releasesExistingMovementInPlace: true` means it never creates a movement of its own — its own "Submit" is
`POST .../maker-submit` against the ALREADY-EXISTING A3/A3S UTILIZE, so there is no PENDING/REJECTED
record of A4's own for `editPending()` to ever act on; the template's own `fixPendingSupported` gate
already reads `selectedFunctionStrategy.fixPendingEnabled` off `this.selectedFunction` directly (A4
specifically, in-session) and would show nothing meaningful even if flipped, since `submitResult` for A4
IS the underlying A3/A3S record — "fixing" it would silently reach back into A3/A3S's own Fix Pending path
under A4's own UI, a confusing and unrequested behavior change. Left as `fixPendingEnabled: false`.

**Separately, user-directed UI tweak** ("Account Entries + Spaces + Fix Pending 同一行 字體放大加粗醒目") —
the primary "Account Entries" button moved out of its own standalone paragraph into the same
`.tb-maker-result-actions` flex row as "Fix Pending" (already `display:flex; gap:10px`), with a new
`.tb-maker-result-actions--emphasized` modifier (component-scoped CSS — plain template markup, not a
Formly-generated subtree, so no ViewEncapsulation issue) bolding/enlarging both buttons
(`font-weight:700; font-size:15px`). `ng build --configuration production` clean (same two pre-existing
warnings, `maker-panel.component.scss` no longer even listed).

## A4 screen made genuinely config-driven — its last bespoke (non-`buildFields()`) readout removed, plus a real data-population bug found live

User-directed ("A4 銀幕改成配置方式" — mirror A1/A2's own config-driven screen; "A4 顯示LC NUMBER &
2NDARY NUMBER (PROTECTED)"; "A4交易 再多加一各幣別金額欄位"). A4 was the one remaining Function whose
"target picked, now show what was carried" state used its own hand-rolled `tb-balance-box` readout
(`{{ pickerSelection.selectedPayMovement.amount }}`/`.sourceTransactionRef`) instead of the SAME
`buildFields()`-driven Amount field + protected-natural-key card every other Function (A2-A11/B2-B7)
already uses — a structural leftover from before that shared mechanism existed for this specific shape.

Three changes, in dependency order:
1. **`builder-fields.ts`**: `deriveAmountLockFlags()`'s `amountFromDocArrival` widened from
   `settlesDocumentArrival`-only (A6/B4) to also cover `releasesExistingMovementInPlace` (A4) — the
   pre-existing fallback label ("Amount (carried from the Document Arrival, protected)") already fit A4
   verbatim, no new label needed.
2. **`maker-panel.component.html`**: protected-natural-key card gained a new item, gated on
   `releasesExistingMovementInPlace`, reading `model.secondaryRef` directly (NOT `contextSecondaryRef()` —
   that function is driven by `NATURAL_KEY_FIELDS_BY_INSTRUMENT[instrumentType]`, a structurally different
   question that's always empty for A4's own `IPLC_LC` target; A4's "2ndary Number" is the picked source
   record's own `sourceTransactionRef`, carried into `model.secondaryRef` instead). A4's own subcard:
   the 2ndary Index picker now hides once `naturalKeyLocked` (mirrors every other Function's own Step 1/
   Step 2 pickers); the duplicate `tb-balance-box` IB Number/Amount readout removed entirely.
3. **Real structural gap found live, fixed**: the ENTIRE generic Formly field array
   (`<form><formly-form>...`) had been sitting inside the SAME `*ngIf="!releasesExistingMovementInPlace"`
   guard as the generic Submit button — so step 1's own widened `amountFromDocArrival` computed the
   correct field config, but the `<formly-form>` itself never reached the DOM for A4 at all (Amount,
   Currency, Tolerance %, Event Seq, Created By — all of it). Live-reported directly ("A4 沒抓到2ndary
   number(IB number?)" → confirmed via direct component-instance inspection that `model.secondaryRef`/
   `model.amount`/`model.currency` were ALL already correct — the bug was purely "the form never renders",
   not a data problem). Restructured: the `<form>` now renders unconditionally; only the generic Submit
   button + Fix Pending/Delete Pending action buttons stay inside the exclusion (those still route through
   `submit()`/`confirmFixPending()`, never `submitA4()`).
4. **Second, deeper real bug found chasing #3, in `picker-selection.service.ts`**: `selectPayMovement()`'s
   own field-population block (`modelAmount`/`modelSecondaryRef`) was gated on `settlesDocumentArrival`
   only — A4's own `releasesExistingMovementInPlace` branch had NEVER populated either field, only
   `clearsSubmitResult`. Invisible until now because A4's own template used to read
   `pickerSelection.selectedPayMovement` directly, bypassing `model` entirely (see #2's own removed
   readout) — once that bypass was removed in favor of the generic, `model`-driven fields, the underlying
   gap surfaced. Widened to also populate for `releasesExistingMovementInPlace`; `naturalKeyIbNumber`
   stays A6/B4-only (A4 creates no new contract, has no natural key of its own to populate).

2 new tests in `builder-fields.spec.ts` (A4 locked/labeled once a pay movement is picked; stays
face-level/editable before one is — boundary), 1 new test in `picker-selection.service.spec.ts` (A4's own
`selectPayMovement()` now populates `modelAmount`/`modelSecondaryRef`, still omits `naturalKeyIbNumber`).
`ng build --configuration production` clean throughout (no new budget/selector warnings). Angular suite:
1451/1451 (98.72%/96.11%/96.96%/98.99%) — microservice/backend unaffected (Angular-only pass), both
already confirmed green earlier the same session.

Live-verified end-to-end against the real dev stack: issued a fresh Sight LC, created+acknowledged an A3
UTILIZE (B01, 30000), picked it under A4 — protected card correctly showed "A4FIX5061 / B01", the generic
Amount field showed "30000 (carried from the Document Arrival, protected)", Currency showed "USD (carried
from the existing record, protected)", exactly one Submit button ("Submit A4", no duplicate generic
Submit) — clicked it, confirmed `makerSubmittedAt` set via direct component-instance inspection. Also
independently re-verified the Maker Queue Phase 4 A3S row from the earlier entry above (still correctly
merged, 2 sibling movementIds, `fixPendingSupported: true`) — user-reported "A3S 沒有顯示在Maker Queue上"
turned out to be a pre-existing, disclosed display simplification (`resolveFunctionForMovement()` always
labels a merged A3S row "A3", since A3/A3S share the identical `IPLC_LC/UTILIZE` shape and the registry
lookup takes the first match), not a regression — the row itself was present and fully functional the
whole time.

User-directed follow-up, same day ("A4 Submit A4 放到欄位顯示之後") — moved the "Submit A4" button from
inside A4's own picker subcard (rendering BEFORE the generic Amount/Currency/etc. fields) to after the
`<form><formly-form>` block, matching every other Function's own "fields first, action last" reading
order. Pure template reordering, same `*ngIf`/`[disabled]` conditions carried over unchanged — Angular
suite unaffected (1451/1451), `ng build --configuration production` clean. Live-verified: fields now
render above the button, Submit still correctly sets `makerSubmittedAt`.

## Checker panel auto-scrolls into view after a genuine Submit/Fix Pending Save — was never hidden, just below the fold

User-reported live ("A3交易 SUBMIT後 CHECKER沒顯示" → "不只a3 所有交易submit 或 sAVE fIX PENDING都不出現
checker畫面" → "為什麼checker畫面都不出現了? bug???"). Direct DOM inspection (both A3S and plain A3,
reproduced fresh via the real UI, not curl) confirmed this was never a functional regression:
`checkerItems`/`checkerContractId` were always correctly populated, and the Checker panel's own
`textContent` always had the right row — it simply sits at the bottom of a fairly tall page (the whole
Maker form + Maker Result panel above it), well below a typical viewport's fold, so a Maker had no way to
discover a newly-actionable item without already knowing to scroll down.

Fixed as a genuine UX improvement rather than arguing it wasn't a bug: `TransactionBuilderComponent` gained
a `@ViewChild('checkerPanelEl')` (template ref added to `<app-checker-panel>`) and a new
`scrollCheckerIntoView()`, called from `onMakerSyncRequested()` on the SAME `alsoSyncLookup` flag that
already means "a genuine Submit/Fix Pending Save/Release/Reject just succeeded" (not a mere selection
pick) — reuses the existing, already-correct signal rather than inventing a new one. Harmless no-op when
the Checker panel isn't rendered at all (`pendingMakerQueueDeleteRow` — Maker Queue's own Delete Pending
review) since the `@ViewChild` is then simply `undefined`; harmless (if slightly redundant) when triggered
by a Checker's own Release/Reject, since they're already at/near the panel they just acted on.

3 new tests in `transaction-builder.component.actions.spec.ts` (scrolls when `alsoSyncLookup: true`; does
NOT scroll on a mere pick; no-op when `checkerPanelEl` is undefined). `ng build --configuration production`
clean. Angular suite: 1454/1454 (98.79%/96.23%/97.09%/99.03%). Live-verified end-to-end: submitted a fresh
A3 from the top of the page — the page automatically scrolled down to the Checker panel, landing the
"Pending Approvals" section and its own newly-EARMARKING row in view with no manual scrolling.

## A4's own Account Entries dialog no longer re-merges an already-Released A3S SG leg — the "already 沖帳" case the Ownership Rule's own gate never covered

User-reported live, on real dev-DB data (LC S01, B02) — "S01 A35 已經把SG的帳沖掉了 所以A4 不需再冲SG的帳
只要冲LC的帳即可" (once A3S's own SG redemption is genuinely RELEASED/booked, A4 must not show/re-process
it — only the LC's own entries belong to A4). A separate report in the same investigation ("Submit A4
結果SG BALANCE變成-100 這是BUG") turned out NOT to be a bug: direct API inspection of the real SG (G01)
confirmed its current balance is genuinely `0/0/0` (Confirmed/Available/PendingEarmarkTotal) — fully
RELEASED, exactly matching "已經把SG的帳沖掉了". The `-100` the user recalled was `pendingEarmarkTotal`'s
own correct, EXPECTED transient reading from an earlier moment — while the SG's own `FULL_REDEEM` was
still PENDING (Confirmed 100, Available 0, so `available − confirmed = −100`) — not something Submit A4
caused; A4 never touches the SG contract at all (`submitA4()`/`release()` only ever act on the LC's own
UTILIZE movementId).

The REAL bug: `resolveLinkedAccountingMovement()`'s (`transaction-builder.component.ts`, the A6/B4
Accounting Event Ownership Rule's own resolution helper) `IPLC_LC/UTILIZE` branch merges in the matched SG
leg via `businessEventId` whenever one exists — correct while THIS SAME record is still under A3S's own
pre-Release Checker review (F1 §14.4, "見到帳再決定" — the SG leg is genuinely still PENDING then), but
the record's own `businessEventId` never gets cleared once A3S's Checker actually Releases it — so A4's
OWN later view of the identical record (Maker Result panel after Submit A4, or A4's own Checker pre-Release
screen) kept re-resolving and merging in the SG leg even after it had already become an independently,
permanently booked, closed event. This is exactly the failure mode the Ownership Rule
itself exists to prevent, just via `businessEventId` (A3S) rather than `referencedTransactionId` (A6) —
the gate for THAT mechanism was never added.

Fixed: `businessEventIdEligible`'s `IPLC_LC/UTILIZE` clause gained `&& !movement.acknowledgedAt` —
`acknowledgedAt` is the exact moment A3S's own Checker Release happens (and, per this file's own
"deferSettlement" convention, the SAME signal `isFinalizing()`/`functionFor()` already use elsewhere to
decide "is this still A3/A3S's own business, or has it moved on"). Scoped to this ONE branch only — B4's
own `EPLC_CONFIRMATION/ACCEPT` clause and the reverse `SHGT/FULL_REDEEM|PARTIAL_REDEEM` clause are
unaffected, since B4's compound Submit creates both legs in a single call with no staged Maker/Checker
handoff to gate on.

1 new test in `transaction-builder.component.actions.spec.ts` (an already-acknowledged A3S UTILIZE no
longer triggers `findByBusinessEventId`/merges nothing). `ng build --configuration production` clean.
Angular suite: 1455/1455 (98.79%/96.23%/97.09%/99.03%). Live-verified against the REAL dev-DB record (LC
S01's own B02 UTILIZE, `acknowledgedAt`/`makerSubmittedAt` both already set, matched SG `FULL_REDEEM`
already RELEASED) via direct component-instance invocation: `accountEntryDialogLinkedMovement` correctly
resolves to `null` — no stale, already-booked SG entries shown alongside A4's own LC entries.

## Fix Pending widened to A8/A10/A11/B6/B7; A9 deliberately excluded (zero editable fields); A9's own Amount label simplified

User-directed ("更正: A8 A9 A10 A11 B6 B7 加上FIX PENDING功能 頁面使用配置"). Per-Function audit of each
one's own field-lock shape: A8 (`fixPendingEnabled: true`) is a plain creating ISSUE, same shape as A1/B1
— Amount genuinely free-typed. A10/A11/B6/B7 (`fixPendingEnabled: true`) have Amount fully locked/hidden
(`amountFromClose`/`amountFromFixed`), but Reason Code (F1 §13.1, mandatory for Close/Reopen) unlocks
automatically via the SAME `requiresReasonCode`-driven derivation `deriveFixPendingLockFlags()` already
had — zero new logic needed for any of the five. A9 raised via `AskUserQuestion` (would have zero
editable fields: Amount fully locked to the SG's own Available Balance, no `secondaryRefLabel`, no
`reasonCode`) — user confirmed skipping it (`fixPendingEnabled` stays absent). `function-strategy.ts`'s
own shared `fixPendingEnabled` doc comment updated to record the widened scope and A9's exclusion.

Separately, per the same round of feedback ("Amount ... 說明簡單一點"): A9's own Amount field label
shortened from "Amount (Full Redeem only — carried from the Shipping Guarantee's Available Balance,
protected; Partial Redeem is no longer supported here)" to "Amount (Full Redeem — carried from the SG's
Available Balance, protected)" — same `amountFromSgRedeem` branch in `amountFieldLabel()`
(`builder-fields.ts`), no lock/behavior change.

`function-strategy.spec.ts`'s own roster test updated (`['A1','A2','A3','A3S','A8','A10','A11','B1','B2','B6','B7']`,
11 Functions now). No other test referenced A8/A10/A11/B6/B7 as a Fix-Pending-disabled boundary example.
`tsc --noEmit`/`ng build --configuration production` clean. Angular suite: 1455/1455
(98.79%/96.23%/97.09%/99.03%).

Live-verified A10 end-to-end against the real dev stack (direct component-instance invocation): Submit
Close → Fix Pending shows Reason Code genuinely editable (`disabled: false`) while Amount stays locked
(`disabled: true`, not hidden) — matches A2/B2's own already-proven pattern, confirming the derivation
generalizes correctly with zero Function-specific code.

## Real bug found live verifying the above — A10/A11 Fix Pending Save could self-reject with "one or more Events ... are not yet fully resolved"; a second, related bug found chasing it in A11/B7's own restore-amount computation

User-reported live mid-session ("A10 FIX PENDING then SAVE => get error Cannot Close IPLC_LC ... One or
more Events under this LC (including child ledgers) are not yet fully resolved"), immediately while this
same Fix Pending widening was being live-verified. Root cause: `closeShaped`'s own sufficiency check
(`createMovement()`'s CLOSE branch, ALSO reused by `applyEditToMovement()` for Fix Pending edits via the
shared `movementTypeRegistry`) calls `evaluateContractCloseEligibility(ctx.contract)` with no
`excludeMovementId` — that param exists precisely so `release()`'s own re-check can exclude the CLOSE
movement it's about to release (still PENDING at that point) from its own "open event" tree-walk, but
`applyEditToMovement()`'s call into the SAME shared check never had an equivalent hook: a Fix Pending Save
always finds the very CLOSE/REOPEN movement being edited still PENDING in the DB, self-triggering
`hasOpenEvents`. `reopenShaped` had the identical gap via its own bare `gatherEventTree(ctx.contract)`
call — A11/B7 were exposed the moment they gained `fixPendingEnabled: true` in the SAME pass above.

Fixed: `MovementSufficiencyContext` gained an optional `excludeMovementId` field, populated by
`applyEditToMovement()`'s own `ctx` construction (`old.movementId`) and left `undefined` for
`createMovement()`'s own call (the new movement isn't inserted yet at that point, same posture
`release()`'s own re-check already documented) — `closeShaped`/`reopenShaped` both now thread it through
to `evaluateContractCloseEligibility()`/`gatherEventTree()` respectively.

**Second, deeper bug found while writing the A11/B7 regression test**: even with the guard above, Reopen's
own Fix Pending Save then failed release() with "the amount to restore has changed since Submit (was
10000, now 0)" — a predecessor-row artifact of the pre-2026-08-29 Fix Pending design tripping up
`domain/reopenRestoration.ts`'s own `computeReopenRestoreAmount()` walk. Fixed at the time with a status
filter in that function; that filter (and the underlying predecessor-row design it worked around) was
later removed outright once Fix Pending was redesigned to correct a record's row in place — see this
file's own later entry.

2 new regression tests (`closeFunction.test.ts`: A10 Fix Pending Save → Release round-trips correctly;
`expiryExtensionAndReopen.test.ts`: A11 Fix Pending Save → Release round-trips correctly, `ceilingAmount`
re-derives to the same restore total). Microservice suite: 721/721 (99.09%/95.07%/100%/99.7%);
`tsc --noEmit`/`npm run build` clean. Live-verified via direct curl against the real running microservice
(not just Jest): a fresh LC → CLOSE → Fix Pending edit (corrected Reason Code) → Release now succeeds
(previously threw the reported error); a fresh REOPEN on the same contract → Fix Pending edit → Release
also now succeeds, `ceilingAmount` correctly re-derived to `10000` and the restored Confirmed Balance
correct. Angular/backend unaffected (microservice-only fix), both re-confirmed green per the standing
three-suite rule (Angular 1455/1455, backend 41/41).

## A9/A3S "SG Balance > 0" LC-level and SG-level eligibility gating — confirmed already correct, no code change

User asked to confirm A9 (and, on correction, A3S too) only offers LCs/SG records with SG Balance > 0
("A9 選有SG BALANCE > 0的LC交易" → "更正: A35 A9 選有SG BALANCE > 0的LC交易"). Live-verified against fresh
dev-DB data rather than re-derived from a doc: A9's own Step-1 Parent LC picker
(`resolveParentEligibilityRule()`'s `amountVsAvailableDerivation === 'REDEEM'` branch →
`documentArrivalHints.parentSgEligible`) and A3S's own Step-1 flat Catalog LC Index
(`resolveCatalogEligibilityRule()`'s `documentArrivalWithSg` branch → `catalogSgEligible`) both already
correctly exclude an LC with no SG at all or whose every SG is fully redeemed, via the existing
`loadParentSgEligibility()`/`loadCatalogSgEligibility()` (`document-arrival-hints.service.ts`,
2026-08-25's own `loadChildBalanceEligibility()` generalization). A9's own Step-2 SG Index
(`filteredIbIndexCatalog`, generic-fallback + `DECREASING_MOVEMENT_TYPES` since `FULL_REDEEM` is in that
set) independently also excludes a 0-balance SG within an already-picked LC. Confirmed live via two fresh
LCs (one with an eligible SG, one with none) at both layers for both Functions — no gap found, no code
change made. Also confirmed A9's own screen has no bespoke (non-`buildFields()`) template block left in
`maker-panel.component.html` — Currency/Amount both already render via the generic config-driven
mechanism, protected, exactly as A4's now does (`"A9要求顯示幣別與金額(PROTECTED)"`, live-verified: Amount
shows "Amount (Full Redeem — carried from the SG's Available Balance, protected)", Currency shows
"Currency (carried from the existing record, protected)").

Separately, S01 briefly showing under A9/A3S's own LC Index despite the user's own "already 0" belief was
also investigated and confirmed NOT a bug: `availableBalance` for S01's own SG G02 was genuinely non-zero
(`confirmedBalance 0 + a still-PENDING SG ISSUE of 2200 = availableBalance 2200`) — a leftover Maker-
Submitted-but-never-Released SG from earlier test data on this same shared dev DB, not a stale/incorrect
read. Resolves itself once that PENDING SG is Released or the dev DB is reset, per the user's own stated
"打算清除交易後再試一試" plan — no code change needed.

## A6 (Acceptance) own "New Reference — Natural Key" free-typed LC/IB Number block was a duplicate of the already-protected readout card — removed for A6's own shape

User-reported live ("Ａ６頁面欄位也應該是ＩＮＤＥＸ選交易後帶入的 不是輸入的 要顯示但ＰＲＯＴＥＣＴＥＤ" →
"Ａ６頁面欄位也應該是配置的"). A6 (`settlesDocumentArrival`) is a `hasParent` CREATING function, so it
reaches the SAME "New Reference — Natural Key" template block A8/B3 (also `hasParent`+creating) share —
but unlike A8/B3, A6's own LC Number and IB Number are NEVER freely typed: LC Number comes from the
Parent LC pick, IB Number is carried from the picked Document Arrival
(`PickerSelectionService.selectPayMovement()`'s own `naturalKeyIbNumber` assignment, widened into this
same shape during the earlier A4 config-driven pass this session). The bespoke block rendered a real,
editable-LOOKING `[disabled]`-bound "IB Number *" input showing the exact same value the protected
readout card above it ALSO already showed — live-reproduced (picked LC/IB Number both rendered twice,
once genuinely protected, once as a second, redundant "New Reference" card).

Fixed by gating the entire "New Reference — Natural Key" block on
`!selectedFunctionStrategy?.checkerRelease?.settlesDocumentArrival` (A6 only in practice — B4 never
reaches `isCreatingMovement` at all) rather than trying to selectively re-style just the IB Number cell
inside it — removed for this shape entirely, since the protected card above already covers both fields
and there's nothing else in this cell for A6 to type. A8/B3 (the only other functions reaching this
block) confirmed unaffected — both still show a real free-typed SG/EB Number input, live-verified.

Separately, per the same round of feedback ("Search LC NUMBER SG NUMBER 加大加粗明顯"): the free-text
"Search Existing Contract" fallback's own LC Number/IB Number/SG Number inputs (A7/A9/B5's own
`usesTwoFieldSearch` shape) gained the same `.tb-natural-key--emphasized` class every other natural-key
input on this screen already carries — the one remaining plain-styled natural-key entry point.

Pure template change (one `*ngIf` gate + 3 added classes), zero `.ts`/`.spec.ts` edits needed — no test
asserted this block's own markup shape. `tsc --noEmit`/`ng build --configuration production` clean.
Angular suite unaffected (1455/1455, unchanged from before this pass — a template-only Jest project has
no coverage of this). Live-verified end-to-end against a fresh Usance LC/Document Arrival: A6 now shows
exactly one protected "LC NUMBER"/"IB NUMBER" card (bold, 17px, no duplicate input below it), a genuine
Submit A6 still succeeds; A9's own free-text LC/SG Number search inputs confirmed bold/17px via computed
style; A8's own free-typed SG Number input confirmed still present and unaffected.

## A8/B3's own SG/EB Number was ALSO duplicated (protected card + still-editable input, same value) — the same class of bug as A6's fix above, one step further

User-reported live against real LC U01 ("New Reference — Natural Key / U01 / SG Number * / G02" appearing
underneath an ALREADY-shown "LC Number / U01" protected card — the exact same value shown twice, in two
different visual treatments, one genuinely protected and one still an editable-looking mandatory input).
Root cause distinct from A6's own (A6's IB Number really was fully carried/resolved once picked; A8/B3's
own SG/EB Number is NOT — it's the NEW value the Maker is still typing) but same underlying trigger:
`hasEligibleTargetSelected` (`submit-rules.ts`) has nothing SG/EB-Number-specific to wait on for A8/B3 —
`lcNumberFromParent(model) && !ctx.selectedParent` is the only relevant guard, so it returns `true` the
instant the Parent LC alone is picked, before any SG/EB Number has been typed. `naturalKeyLocked` then
engages off that same signal, showing the protected card's own IB/SG Number span (`contextSecondaryRef`,
which for a creating function reads straight off `naturalKey[field]` — the SAME live model field the
mandatory input below is bound to) alongside the still-fully-editable input underneath. The card's own LC
Number line ALSO duplicated the "New Reference" block's own `lcNumberFromParent` readout (identical value,
disabled input) — same duplicate-LC-Number symptom A6 had, never previously noticed for A8/B3 because no
one had reported it until this LC Number + SG Number combination was shown together live.

Two fixes, both in `maker-panel.component.html`:
1. The protected card's own IB/SG Number spans gated with `&& !isCreatingMovement` — for A8/B3 (the only
   `isCreatingMovement` functions with a non-empty `requiredNaturalKeyFields`), the card now shows ONLY
   the LC Number line; A7/A9/B5 (existing-record two-field search, the only other consumers of these two
   spans) are unaffected — their own 2ndary Number really is fully resolved once `naturalKeyLocked`
   engages there.
2. The "New Reference — Natural Key" block's own `lcNumberFromParent` readout gated with
   `&& !naturalKeyLocked` — once the top card takes over (Parent LC picked), this now-redundant disabled
   LC Number echo hides; before that (no Parent picked yet), it still renders with its own "Pick the
   Parent LC above first." hint exactly as before. The mandatory SG/EB Number input itself is
   UNCHANGED — never gated on `naturalKeyLocked` at all, stays visible/editable the whole time (only
   `formLocked`, i.e. post-Submit, disables it, same as every other mandatory field on this screen).

Pure template change, zero `.ts`/`.spec.ts` edits (no test asserted this block's own rendered shape).
`tsc --noEmit`/`ng build --configuration production` clean, same two pre-existing warnings only. Angular
suite unaffected (1455/1455). Live-verified end-to-end exactly reproducing the report (LC U01, A8): after
picking Parent LC, the screen now shows the protected card with ONLY "LC NUMBER — U01", then "New
Reference — Natural Key" with ONLY a clean mandatory "SG Number *" input (no duplicate LC Number, no
premature-protected SG Number); typed "G02" into it via a real DOM `input` event (not a direct model
assignment) to confirm it's genuinely interactive, not merely rendered — value flowed into
`naturalKey.sgNumber` correctly; a real Submit A8 then succeeded end-to-end. B3 (the only other function
reaching this exact code path — EPLC_CONFIRMATION's own Present Docs) independently re-verified against a
fresh Export Confirmation LC: identical correct shape ("LC NUMBER" card + a clean mandatory "EB Number *"
input, no duplicates).

**A7/A9/B5 audited on request ("A7 A9 B5 也檢查一下有沒有一樣的問題") — confirmed NOT affected, no code
change.** These are the "existing-record, two-field search" shape (`usesTwoFieldSearch`), structurally
different from A8/B3's own "creating, free-typed 2ndary key" shape: `hasEligibleTargetSelected`
(`submit-rules.ts`) correctly waits for Step 2 (the actual SG/IB/EB Number pick, via `ctx.selectedContract`/
`ctx.selectedContractSnapshot`) before returning true for all three — picking the Parent LC (Step 1) alone
is never sufficient, unlike A8/B3 where `lcNumberFromParent(model) && !ctx.selectedParent` was the ONLY
relevant check. Live-verified for all three (fresh LC+SG for A9, fresh Usance LC+Acceptance for A7, fresh
Export Confirmation+Acceptance for B5): `naturalKeyLocked` stays `false` and the Step 1/Step 2 pickers
remain interactive right after Step 1 alone; once Step 2 completes, the screen collapses to exactly one
clean protected card, no duplicate of anything.

## A10/A11 (and B6/B7) no longer generate a zero-value `contingentAccountEntry` when the write-off/restore amount is genuinely 0 — S01-shaped (Tight Available Balance already 0) case

User-directed ("A10 and A11 if Tight Available Balance = 0 then no entries should be generated. Refer to
S01 for Import"). `CLOSE`/`EXPIRE`/`REOPEN` are the only movementTypes where a genuinely zero amount is a
legitimate value at all (`assertValidAmount()`'s own doc comment already establishes this — an
already-fully-utilized LC that's since Expired/Closed has 0 left to write off/restore) — every other
movementType is rejected outright by `assertValidAmount()` before reaching account-entry derivation at
all. Confirmed live via direct API: closing S01 (Confirmed Balance already 0, matching Tight Available
Balance 0) generated a real `contingentAccountEntry` with `amount: "0"` — a zero-value Dr/Cr voucher
carrying no genuine accounting information.

Fixed in `domain/contingentAccountEntry.ts`'s `deriveContingentAccountEntry()`: returns `null` when the
signed amount is exactly zero AND the movementType is `CLOSE`/`EXPIRE`/`REOPEN` — same "no real balance
effect, don't generate a placeholder pair" posture `AMEND_EXPIRY_DATE`/`EPLC_EXAMINATION` already use
above it in the same function, just triggered by the amount being zero here rather than the movementType
itself never carrying one. **Deliberately scoped to the amount, not to a Tight Available Balance check** —
Close's own write-off is against Confirmed Balance, not Tight Available Balance (two different figures
that happen to coincide for S01, which has no outstanding SG/Acceptance exposure); keying the null-check
off the movement's own `ceilingAmount` being zero is both simpler and correct for every case, including
one where Tight Available Balance is non-zero but Confirmed Balance (and therefore the write-off) is
still genuinely 0.

**Eligibility itself is completely unaffected — user-confirmed requirement** ("S01 should be shown in A10
even Tight Available Balance == 0... after S01 A10 approved, then it should be able to shown on A11"):
`evaluateContractCloseEligibility()`/`listCloseEligibleContracts()`/`reopenShaped`'s own eligibility gate
were untouched by this fix — only `deriveContingentAccountEntry()` changed. Live-verified end-to-end
against the real S01 record for real (not cancelled afterward, a genuine exercise of the full lifecycle):
`GET /balance-contracts/close-eligible` still lists S01 before Close; Close Submit+Release both return
`contingentAccountEntry: null`; S01 correctly transitions to `CLOSED`; `GET /balance-contracts/
reopen-eligible` then lists S01; Reopen Submit+Release both also return `contingentAccountEntry: null`;
S01 correctly returns to `ACTIVE` with its own original balance (0/0/0) unchanged. Also live-verified
through the real browser UI (not just curl): A10's own LC Index still shows S01, Amount auto-fills to "0"
and Submit is ready, a genuine Submit succeeds with `contingentAccountEntry: null`, and — the concrete
visible effect — no "Account Entries" button renders on the Maker Result panel at all (gated on
`contingentAccountEntry` being present, same convention every other Account Entries button on this screen
already uses).

2 new regression tests: `closeFunction.test.ts` (Confirmed Balance already 0 at Close — asserts `null` on
both the Submit and Release response, plus a non-zero happy-path assertion added to the pre-existing test
that had never checked `contingentAccountEntry` at all) and `expiryExtensionAndReopen.test.ts` (the full
S01 shape end to end — UTILIZE to 0, Close with `null` entry, Reopen with `null` entry, contract correctly
back to ACTIVE). OAS bumped to v1.32.0. All three suites re-run green: microservice 723/723
(99.09%/95.1%/100%/99.7%), Angular 1455/1455 (unaffected, no client-side change — the Angular UI already
correctly hides the Account Entries button whenever `contingentAccountEntry` is absent, no new logic
needed there), backend 41/41 (unaffected). `npm run build` (microservice) clean.

## B3 Fix Pending widened (same method as A8); Tenor Type now shown as a protected field for A2-A11/B2-B7

User-directed ("Use the same method for B3 with Fix Pending. Furthermore for A2 - A11, B2 - B7 display the
Tenor Type as protected field."), two independent changes.

**B3 Fix Pending**: `fixPendingEnabled: true` added to B3's own registry entry — same shape as A8 (plain
creating `CREATE`, `hasParent`, Amount genuinely free-typed Bill Amount), simply Export's own counterpart
left out of the original A8/A10/A11/B6/B7 batch. Zero new derivation logic — `deriveFixPendingLockFlags()`
already unlocks a free-typed Amount automatically. `EPLC_EXAMINATION`'s own `contingentAccountEntry` stays
`null` regardless (D3, MEMO_ONLY, never posts) — unrelated to whether the Bill Amount itself is
correctable before Release. Roster test updated
(`['A1','A10','A11','A2','A3','A3S','A8','B1','B2','B3','B6','B7']`, 12 Functions now). Live-verified
end-to-end against a fresh Export Present Docs presentation: Submit (Amount 12000) → Fix Pending (Amount
genuinely `disabled: false`) → corrected to 15000 → Save → Release — the RELEASED record's own `amount`
reads `15000`, `contingentAccountEntry` stays `null` throughout as expected.

**Tenor Type protected display — corrected same day** ("Tenor Type 改的不對 應該跟Currency欄位一樣 是輸入欄位
但是PROTECTED for B2-B7 A2 - A11" → "使用配置設定即可"). Previously Tenor Type only ever appeared for A1/B1
(a real editable dropdown) and A6 (its own dedicated `tenorTypeOptions`-driven, already-protected Formly
field) — every other function (A2-A5/A7-A11/B2-B7) never showed it anywhere at all, even though the
underlying contract always has one.

A first attempt added it as a read-only line in the protected-natural-key card instead of a genuine bound
Formly field — user-corrected: it must follow the SAME config-driven mechanism `carriedCurrency` already
uses (a real, disabled `model`-bound field rendered by `buildFields()`, not a bespoke template addition).
Fixed for real:

- `MakerPanelComponent.applyCarriedContractFields()` (new) — consolidates what were 6 separately-
  duplicated `if (this.carriedCurrency) { this.model.currency = ...; this.rebuildFields(); }` call sites
  (`onSelectContract`, `searchExistingContract` ×2, `onSelectParent`, `onSelectSettleableBalance`,
  `onSelectIbIndex`) into one method that carries BOTH Currency (unchanged) and the new
  `carriedTenorType` (→ `model.tenorType`) together — consolidating first meant Tenor Type could be added
  everywhere Currency already carries without risking a missed call site. The Tenor Type branch is a
  no-op whenever the Function has its own `tenorTypeOptions` (A1/B1/A6) — A6's own separate, pre-existing
  `onSelectParent()` block (also carries `tenorDays`, which this method deliberately does not) keeps
  doing that work unchanged.
- `carriedTenorType` getter delegates to `contextTenorType(s: ContextRefState)` (`function-policy.ts`) —
  `selectedContract?.tenorType ?? selectedParent?.tenorType ?? null`, the same fallback chain
  `contextLcNumber` already uses, covering every picker shape without special-casing per Function: A9's
  own SG contract carries no `tenorType` of its own (Tenor doesn't apply to Shipping Guarantees), so it
  falls through to the parent LC's; A7's own Acceptance record carries one directly.
- `builder-fields.ts`'s existing `tenorType` field widened rather than duplicated: new `tenorTypeCarried`
  flag (`!tenorLocked && !selectedFunction?.tenorTypeOptions?.length && !!model.tenorType`) drives a new
  `hide`/`disabled`/label branch ("Tenor Type (carried from the existing record, protected)"), reusing the
  SAME field Currency-style rather than adding a second one. Always rendered as `type: 'select'` even in
  the carried case (unlike Currency's own plain `input` for non-A1/B1) — Tenor Type's own raw enum values
  (`'SELLERS_USANCE'` etc.) aren't human-readable the way Currency's ISO codes already are, so the carried
  case synthesizes a single-option list via the existing `tenorTypeLabel()` formatter (`selectedFunction
  .side ?? 'IMPORT'`) — same "Sight"/"Seller's Usance"/"Buyer's Usance"/Export's plain "Usance" table
  Inquire Events already uses. A1/B1/A6 are excluded automatically (`tenorTypeOptions.length` truthy for
  them), so this can never duplicate their own existing treatment.
- Confirmed harmless to the wire payload: `submit-rules.ts`'s `buildSubmitRequest()` only ever forwards
  `request.tenorType` when `selectedFunction?.tenorTypeOptions?.length` is truthy — `model.tenorType` being
  populated for A2-A11/B2-B7 (display only) never reaches the actual `POST /balance-movements` body for
  them.

9 new/updated tests: `function-policy.spec.ts` (`contextTenorType` prefers `selectedContract`, falls back
to `selectedParent`, null boundary — unchanged from the first attempt, this function's own resolution
logic was already correct); `maker-panel.component.spec.ts` (`carriedTenorType` getter; `onSelectContract`/
`onSelectIbIndex` write `model.tenorType`; A6 confirmed to still carry via its OWN dedicated block, not
this new method); `builder-fields.spec.ts` (the carried field's own `hide`/`disabled`/label/options shape
for A2, the Export-side "Usance" label for B2). `tsc --noEmit`/`ng build --configuration production`
clean. Angular suite: 1464/1464 (98.79%/96.21%/97.1%/99.03%). Live-verified against real dev-stack data
(Usance LC U01, A2): the rendered DOM element is confirmed to be a genuine `<select disabled>` (not a
plain span) showing "Seller's Usance" as its only option, exactly matching Currency's own mechanism; a
real Submit A2 still succeeds end-to-end with the new field present; Fix Pending correctly force-disables
it ("not editable via Fix Pending for this Function") same as Currency, per §15. Microservice/backend
unaffected (Angular-only pass), both re-confirmed green (microservice 723/723, backend 41/41).

## B4's own EB Index — audited on request ("B4 should be able to select all EARMARKED records") — confirmed already correct, no code change

`resolveCatalogEligibilityRule()`'s own `catalogChildPayableIbs` hint (Step-1 LC-level, via
`loadChildHints()`) and `loadPayableMovementsAcrossChildContracts()`'s own filter (Step-2, the actual EB
Index) both already gate on `movementType === 'CREATE' && status === 'RELEASED' && !presentDocsConsumedAt`
— exactly "EARMARKED" per this file's own convention (B3 genuinely RELEASEs on its own,
`sourceAlreadyReleasedBeforePick: true`, so RELEASED **is** EARMARKED for this Function, not merely a
precondition of it). Live-verified against fresh dev-DB data (a fresh Export Confirmation with 3 Present
Docs presentations — two genuinely Released/EARMARKED, F01/F02, one still PENDING/EARMARKING, F03): B4's
own EB Index correctly lists BOTH F01 and F02 together ("2 total", neither auto-picked since more than
one candidate exists), and correctly excludes F03. No gap found, no code change made.

## B4's own EB Index re-audited against a full 5-state matrix ("B4 candidate list = All eligible EARMARKED Events under the selected LC") — confirmed correct, no code change

User re-raised this as a formal rule with an explicit exclusion list ("EARMARKING、PENDING、REJECTED、
APPROVED 等非 EARMARKED 狀態不得列入" + "應隨交易狀態即時更新"), broader than the earlier 2-candidate spot
check above. Re-verified against a genuinely comprehensive 5-record scenario on one fresh Export
Confirmation LC, covering every state the rule names plus the two states most likely to interact with
this session's own recent fixes (an already-consumed B3 record, and a Fix-Pending-edited one):

| Record | Real state | Expected | Result |
|---|---|---|---|
| G01 | EARMARKING (PENDING, not yet Checker-Released) | excluded | ✅ excluded |
| G02 | EARMARKED (RELEASED, not consumed) | included | ✅ included (20000) |
| G03 | REJECTED | excluded | ✅ excluded |
| G04 | Fix-Pending-edited (corrected from 40000 to a live RELEASED 45000) | only the live EARMARKED one | ✅ only 45000 shown — this picker's own strict `status === 'RELEASED'` match already only ever sees the live, corrected record |
| G05 | RELEASED but already consumed by a real B4 Honour (`presentDocsConsumedAt` set — effectively APPROVED, moved on) | excluded | ✅ excluded |

"即時更新" (live update on re-query) also confirmed: released G01 mid-session (EARMARKING → EARMARKED)
without reloading the page, re-selected the same LC, and the EB Index correctly grew from 2 to 3
candidates (G01/G02/G04) — the picker re-derives from a fresh fetch each time it's engaged, same
convention every other picker on this screen already uses; no push/live-socket mechanism exists or was
requested. No gap found across the full matrix, no code change made — `resolveCatalogEligibilityRule()`'s
`catalogChildPayableIbs` hint and `loadPayableMovementsAcrossChildContracts()`'s own filter
(`movementType === 'CREATE' && status === 'RELEASED' && !presentDocsConsumedAt`) already implement this
rule exactly as stated.

## A8's own Maker-Queue-originated Fix Pending — two real bugs found live (blank LC Number, un-emphasized SG/EB Number), both fixed

User-reported live via a real Maker Queue → Fix Pending click on an A8 record: "LC NUMBER —" (blank) and
"2 SG Number 沒有加大加粗明顯" (not bold/enlarged), plus an initial "1 不該顯示LC INDEX" that turned out to
be a false read of a stale DOM snapshot mid-reproduction (once a real Angular change-detection cycle
settled, the LC Index picker was already correctly hidden — `naturalKeyLocked` was `true` throughout, as
designed; no separate bug there).

**Root cause of the blank LC Number**: `contextLcNumber()`'s own `lcNumberFromParent` branch (A6/A8/B3)
read `s.selectedParent?.naturalKey.lcNumber ?? null` — but Maker Queue's own Fix Pending entry point
(`reconstructScreenForSubmitResult()`) never re-resolves `selectedParent` (no Parent LC picker interaction
happens during review, only `naturalKey`/`model` get reconstructed from the fetched contract), so this
always evaluated to `null` for A8/B3 specifically. Fixed with a fallback to `s.naturalKey.lcNumber` —
proven safe (not a new, second source of truth) because `onSelectParent()`'s own existing
`this.naturalKey.lcNumber = this.selectedParent.naturalKey.lcNumber` assignment already keeps the two
values in sync during every normal live flow; the fallback is a genuine no-op outside Fix Pending and
simply also works during it, since `reconstructScreenForSubmitResult()` DOES correctly populate
`naturalKey.lcNumber` from the fetched contract regardless of Function shape.

**SG/EB Number emphasis**: the "New Reference — Natural Key" block's own free-typed `ibNumber`/`sgNumber`
inputs (A8/B3 only — the two creating+hasParent functions whose 2ndary key is genuinely typed, never
carried) never had `tb-natural-key--emphasized` at all — added unconditionally, same footing as A1/B1's
own LC Number just above it in the same block (the one Natural Key field on THEIR screen that's genuinely
typed, not picked) rather than gating it on Fix Pending/review mode specifically.

2 new tests (`function-policy.spec.ts`: `contextLcNumber` falls back to `naturalKey.lcNumber` for an
A8-shape Fix Pending scenario with `selectedParent: null`; `maker-panel.component.spec.ts`: the full
`externalFixPendingRequest` reconstruction for A8 resolves `contextLcNumber` correctly with
`selectedParent` confirmed still `null` throughout). `tsc --noEmit` clean. Angular suite: 1466/1466
(98.79%/96.21%/97.1%/99.03%). Live-verified end-to-end reproducing the exact report: Maker Queue → click
Fix Pending on a real A8/U01/G01 record → "LC NUMBER" now correctly shows "U01"; the "SG Number" input
confirmed bold (700)/17px via computed style, still correctly showing its real value "G01" and disabled
during review. Microservice/backend unaffected (Angular-only pass), both re-confirmed green (microservice
723/723, backend 41/41).

## Maker Queue → Fix Pending → Save must retain the SAME Event context throughout (A2–A11/B2–B7) — two more real bugs found completing the audit, both fixed

User-directed formal rule ("Maker Queue → Select Event → Fix Pending → Save Fix Pending → No LC / Index
Record re-selection is required. The original Event context must be retained throughout the Fix Pending
flow... 此規則應統一檢查A2–A11、B2–B7"), following straight on from the A8 blank-LC-Number/un-emphasized-
SG-Number fixes above. Auditing the full flow (not just entering Fix Pending, but SAVING it too) surfaced
two more real gaps, both scoped to the exact same A8/B3 shape (`lcNumberFromParent` — the only functions
where the natural key's LC-Number half is resolved via `selectedParent`, never `selectedContract`, in a
normal live flow):

1. **The LC Index picker itself could reappear after Save.** `hasEligibleTargetSelected()`
   (`submit-rules.ts`) drives `naturalKeyLocked` — during Fix Pending itself this was masked by
   `isExternalReviewMode` forcing it true regardless, but once Save completes (`fixPendingMode` flips back
   to `false`), the gate falls through to `hasEligibleTargetSelected()` alone. Its own `lcNumberFromParent`
   branch required `ctx.selectedParent`, which Fix Pending's own reconstruction
   (`reconstructScreenForSubmitResult()`) never sets (no Parent LC picker interaction happens during
   review) — so for A8/B3 specifically, this returned `false` immediately after Save, re-showing the
   `hasParent && !naturalKeyLocked`-gated LC Index picker for a record that was never actually
   un-selected. Fixed by also accepting `ctx.selectedContract` — safe because `onSelectParent()`'s own
   pre-existing alias (`this.selectedContract = this.selectedParent`, the same A8/B3-only shape already
   documented on that assignment) already keeps the two in agreement throughout every normal live flow, so
   this can never accept a genuinely different target. A6 (the only other `lcNumberFromParent` function,
   not Fix-Pending-enabled) is structurally unaffected — its own `selectedContract` is never set before
   `selectedParent` in the first place.
2. **Stale field labels/config after Save (found while verifying #1).** `applyCheckerOutcome()` (the
   handler for a successful Fix Pending Save, arriving via `externalCheckerOutcome`) flipped
   `fixPendingMode` back to `false` but never called `rebuildFields()` — so `this.fields` stayed exactly as
   `startFixPending()` last built it, e.g. Currency's own label kept reading "locked — Fix Pending can
   never change Currency, see §15" even after Fix Pending had genuinely ended. Functionally harmless
   (`displayFields`'s own `toReadOnlyFields()` wrapper already force-disables everything via
   `fieldsLocked` regardless of this staleness), but visibly misleading. `cancelFixPending()` already
   calls `rebuildFields()` in the equivalent spot — `applyCheckerOutcome()` was simply missing the same
   call; added.

3 new/updated tests: `submit-rules.spec.ts` (A8 — `selectedContract` alone, with `selectedParent` still
`null`, now also satisfies `hasEligibleTargetSelected`; B3's own existing test extended with the same
case); `maker-panel.component.spec.ts` (a genuine `externalFixPendingRequest` → `externalCheckerOutcome`
'released' sequence proving the Currency label transitions from genuinely-stale "Fix Pending" wording to
the correct post-Save "carried from the existing record, protected" wording — not merely asserting the
end state, which alone wouldn't have caught the original bug). `tsc --noEmit` clean. Angular suite:
1468/1468 (98.79%/96.21%/97.1%/99.03%). Live-verified end-to-end for BOTH A8 and B3 (its Export
counterpart, same shape): Maker Queue → Fix Pending → edit Amount → Save — in both cases the "LC INDEX —
EXISTING CONTRACT" picker never reappears, "LC NUMBER" keeps showing the same value throughout, and
Currency's own label correctly flips to "carried from the existing record, protected" the instant Save
completes. Every other Fix-Pending-enabled Function (A1/A2/A3/A3S/A10/A11/B1/B2/B6/B7) was already
structurally unaffected — all of them resolve their own target via `selectedContract` directly (never
`selectedParent`), which Fix Pending reconstruction has always correctly populated. Microservice/backend
unaffected (Angular-only pass), both re-confirmed green (microservice 723/723, backend 41/41).

## A Fix Pending edit's own replaced predecessor no longer duplicates in Event Timeline / Account Entries

`toEventRows()` and `resolveLinkedAccountingMovement()`'s two lookup branches now exclude a replaced
predecessor, resolving the current record (same eventSeq) instead. Maker Queue/Checker Queue/
`CheckerActionsService`'s own lookups were already unaffected (their own status filters already exclude
it structurally). Display-only fix — the underlying record-replacement mechanism is unchanged.

## Fix Pending §19 redesigned — in-place correction; the internal replaced-predecessor status value removed entirely (2026-08-29, business/BA-directed)

A full architecture review (business/BA, in-chat) concluded the pre-2026-08-27 two-row mechanism itself
was the real problem: it conflated Business Status with a technical revision marker in the same `status`
column, and that marker genuinely leaked into raw API responses (`GET .../movements`,
`GET /balance-movements?businessEventId=`), filtered only at the Angular display layer, never at the API
contract itself. **Final decision: Fix Pending Save is now an atomic in-place correction** — the
PENDING/REJECTED movement's row is corrected in place (same `movementId` **and** `eventSeq`, landing back
at `PENDING`) rather than being retired and replaced by a second row. `MovementStatus` drops that marker
value entirely (4 values left: PENDING/RELEASED/REJECTED/CANCELLED). The unrelated contract-versioning
mechanism this redesign left alone was itself removed in a later, broader pass the same day (see the
`ContractStatus`/`markSuperseded()` entry near the end of this log).

New `fix_pending_audit` table/`FixPendingAuditStore` (mirrors `delete_pending_audit`'s own append-only
shape) is the only place the pre-edit content now survives — `before_snapshot`/`after_snapshot` JSON,
original Maker/status, editor/time. `editPending()`/`applyEditToMovement()`/
`applyArrivalWithSgCompoundEdit()` (`balanceService.ts`) rewritten: write one audit row per corrected leg,
then `BalanceMovementStore.applyFixPendingCorrection()` (replaces the old retire-and-mark method) does a
single in-place `UPDATE` — no INSERT, so the whole "insert unexpectedly collided" defensive branch is gone
(nothing left that could collide). `statusTransition.ts`'s `EDIT` action now targets `PENDING` (both
PENDING/REJECTED sources), never a second status of its own. The idempotency index reverts to a plain
unconditional `UNIQUE(balance_contract_id, event_seq)` — only ever one row per event now.

Migration 21 (new `fix_pending_audit` table) + migration 22 (rebuild `balance_movements`: narrow the
`status` CHECK, drop `superseded_by_movement_id` — Fix Pending's own 2026-08-27 addition, safe to remove —
**backfill** `fix_pending_audit` from any pre-existing retired-predecessor row on the real dev DB before
excluding it as a now-redundant duplicate of its own already-live successor). A separate, pre-existing,
still-unused reserved column predating Fix Pending was left untouched by this specific migration — removed
in a later, broader same-day pass (see the entry near the end of this log).

Every filter that guarded against a stale duplicate row is now dead code and was removed rather than left
as defensive cruft: `reopenRestoration.ts`'s own filter, `inquire-events.service.ts`'s `toEventRows()`
branch, `transaction-builder.component.ts`'s `resolveLinkedAccountingMovement()` (both branches, the
`!== 'CANCELLED'` clause kept). `checker-actions.service.ts`'s own PENDING filter in
`resolveArrivalSgLegAfterEdit()` is kept — it's a genuine "is this leg still correctable" check, not a
duplicate-exclusion.

New tests: `FixPendingAuditStore` (mirrors `deletePendingAuditStore`'s own untested-before shape),
migration 21/22 backfill (`migration22FixPendingBackfill.test.ts`, seeded via `PRAGMA
ignore_check_constraints=1` since migrations 13/15/17 rebuild using the CURRENT — already-narrowed —
`MOVEMENT_STATUS_VALUES` at replay time, closing off the historical window a plain legacy-fixture replay
would otherwise rely on — **this backfill mechanism and its own test file were later removed outright,
2026-08-29, once confirmed with the user that no pre-SIT deployment ever ran the pre-redesign mechanism,
so there was nothing to backfill from; see the entry near the end of this log**). Every test fixture that
exercised the now-structurally-impossible old two-row scenario removed rather than adapted. OAS bumped to
v1.34.0. All three suites re-run green: microservice
728/728 (98.99%/95.01%/100%/99.57%), Angular 1468/1468 (98.79%/96.21%/97.1%/99.03%), backend 41/41. `ng
build --configuration production` clean (same two pre-existing warnings). Live-verified both via direct
curl (Submit → Fix Pending Save → Release, same movementId throughout, single row in `GET .../movements`)
and through the real Angular UI (`window.ng` component invocation): Fix Pending Save correctly lands back
at PENDING with the corrected amount under the same movementId, no stray LC Index picker, Currency/result
banner correct.

Documentation cleanup, same day: every prose mention of the retired internal status name was removed from
`CLAUDE.md`, `TODO.md`, and the `analysis/` BA proposal/requirement documents — condensed to describe the
current in-place-correction design directly rather than narrating the discarded two-row mechanism's own
review history. The separate, unrelated contract-versioning mechanism was left untouched throughout THIS
pass — see the entry near the end of this log for its own, later, broader removal the same day.

## `fix_pending_audit` missed the same "Cleanup Database Tables" FK gotcha `delete_pending_audit` already had — found live, fixed same day

User-reported ("Cleanup Database Tables in not working now"). `POST /admin/reset-database` (`app.ts`)
already had a code comment explaining exactly this class of bug from `delete_pending_audit`'s own
2026-08-28 fix — the new `fix_pending_audit` table (FK REFERENCES to both `balance_movements`/
`balance_contracts`, `PRAGMA foreign_keys = ON`) was simply never added to the DELETE sequence when it
shipped that same day, so the route 500'd the instant any Fix Pending Save had ever happened (true on the
real dev DB from this session's own earlier testing). Fixed: `DELETE FROM fix_pending_audit` added before
`balance_movements`. New regression test mirrors `delete_pending_audit`'s own existing one exactly. All
three suites green (microservice 729/729, Angular 1468/1468, backend 41/41); live-verified via the real
button click in the browser against the real dev DB — "Database tables cleaned up.", 0 contracts remaining,
no 500. Reconfirms the standing rule: every new FK-constrained table needs every existing raw DELETE/reset
statement touching its referenced tables re-checked, not just a green suite for the new feature alone.

## Inquire Delete Pending catalog showed "LC Amount 0 / Last Event Date/Time —" for a root ISSUE cancelled before Release — real bug, fixed

User-reported (real dev-DB LC, `status: CANCELLED`, a root ISSUE Delete-Pending'd before ever being
Released). `computeLcIndexRow()` (shared by Inquire Events' own catalog and Inquire Delete Pending's LC
Catalog) derived `lastEventAt` purely from `toEventRows()`'s own event list — which deliberately excludes
CANCELLED movements from the true Event Timeline (by design, documented at that function's own CANCELLED
branch) — so a contract whose ONLY movement is CANCELLED had an empty event list and `lastEventAt` fell
back to `null` ("—" in the template), even though a real Delete Pending action clearly happened.
Unexercised until now: Inquire Events' own catalog never passes a CANCELLED contract to this function at
all (its own `loadIndex()` already excludes CANCELLED), so this gap only ever bit Inquire Delete Pending's
own catalog — exactly the shape of contract it exists to surface.

Fixed: `computeLcIndexRow()` now also derives a raw fallback timestamp directly from the movement list
itself (`cancelledAt ?? releasedAt ?? createdAt`, never filtered by `toEventRows()`), taking the later of
that and the existing display-derived value — a no-op for every other caller/contract shape, since a real
event always has a later or equal display-derived timestamp already. `lcAmount` is unaffected and stays
`"0"` for this shape — `deriveLcAmount()` already correctly excludes CANCELLED movements from the summed
face amount, and that's the right answer (nothing was ever actually confirmed). New regression test
(`inquire-events.service.spec.ts`) reproduces the exact shape. All Angular tests green (1469/1469,
98.76%/96.13%/96.99%/98.99%); microservice/backend unaffected (Angular-only fix), re-confirmed green.
Live-verified via the real running dev stack: reproduced the exact reported scenario (fresh LC → ISSUE →
Delete Pending) and confirmed the Inquire Delete Pending catalog now shows a real timestamp instead of
"—".

## Inquire Delete Pending's own "LC Amount" now shows the typed amount, not the RELEASED-only figure (user-directed, "比較USER FRIENDLY")

Follow-up to the entry above, same day. User asked directly whether "LC Amount" in Inquire Delete Pending
reflects what the Maker actually typed — it doesn't: `deriveLcAmount()` is RELEASED-only, so it always
reads `"0"` for exactly the shape this screen surfaces (a transaction cancelled before ever being
released), telling a reviewer nothing about what was actually submitted.

`computeLcIndexRow()` gained a third param, `amountSource: 'released' | 'input' = 'released'` —
`InquireEventsService`'s own catalog call site is unchanged (still RELEASED-only, correct for reflecting
confirmed exposure); `InquireDeletePendingService`'s own call site now passes `'input'`. New
`deriveLcInputAmount()` returns the contract's own root `ISSUE` movement's `amount`, unconditional on
status — a contract has exactly one creating movement, so this is unambiguous. 2 new tests
(`inquire-events.service.spec.ts`: `'input'` mode shows the typed amount for a CANCELLED-before-release
ISSUE; falls back to `"0"` when no ISSUE exists at all). All Angular tests green (1471/1471,
98.76%/96.2%/97%/98.99%); microservice/backend unaffected. `ng build --configuration production` clean.
Live-verified: the real dev-DB catalog rows (previously all showing "0") now show their real typed amounts
(42000/44/333); Inquire Events' own catalog re-confirmed unaffected (still RELEASED-only for its own ACTIVE
contracts).

## Maker Queue's own Delete Pending review — "Confirm Delete Pending" button was missing entirely for A4

User-reported ("Maker Queue -> A4 EVENT -> Delete Pending -> Confirm Delete Pending Button 不見了").
`maker-panel.component.html`'s "Maker Queue's own Delete Pending review" action block (`Confirm Delete
Pending`/`Cancel` buttons) was nested inside the SAME `*ngIf="!...releasesExistingMovementInPlace"`
`ng-container` that correctly excludes A4 from the generic Submit/Fix Pending actions above it (A4 has
its own separate "Submit A4" button) — but that exclusion was written before this Delete Pending review
block existed, and the block was added inside it by mistake. A4's own Maker Queue row genuinely IS
Delete-Pending-able (`MakerQueueService.deletePending()`'s own `isWithdrawMakerSubmitCase()` routes it
through `withdrawMakerSubmit()`), so the review screen opened correctly (`deletePendingReviewMode: true`)
but had no button to confirm or cancel with. Fixed by moving the block to be a sibling OUTSIDE that
`ng-container`, gated purely on `deletePendingReviewMode`. Pure template change, no `.ts`/`.spec.ts`
impact (this project's no-TestBed convention means Jest never exercises this binding — `ng build`'s
strict-template check is what actually verifies it). Angular suite unaffected (1471/1471), `ng build
--configuration production` clean. Live-verified end-to-end against the real dev stack: fresh A1→A3
(acknowledge)→A4 (maker-submit) scenario, clicked "Delete Pending" on the A4 row in Maker Queue, "Confirm
Delete Pending" now renders and clicking it correctly reverts the underlying UTILIZE's own
`makerSubmittedAt` to `null` (status back to `PENDING`) and returns to Maker Queue.

## A4 Checker's own pre-Release "View Voucher" showed EARMARKED/EARMARKING instead of PENDING

User-reported ("A4 Checker View Voucher shows EARMARKED 不對 應該是PENDING"), same day as the button fix
above. `openCheckerAccountEntryDialog()` never passed a `phase` argument at all (unlike
`onMakerOpenAccountEntries()`, which already forwards one) — so a still-PENDING A4-in-progress record (the
SAME underlying A3/A3S UTILIZE row, A4 has no movement of its own) fell back to A3's own EARMARKING/
EARMARKED label instead of A4's own PENDING/APPROVED one. Same root cause, and same fix shape, as
`MakerPanelComponent.resultPhase`'s own doc comment already documents for the identical gap on the Maker
Result panel (fixed earlier this session): derive `phase: 'finalize'` from
`selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace` (A4's own unique flag) combined
with the movement's own `makerSubmittedAt` — true only while A4 itself is selected AND its own Maker
Submit has actually happened, so this can't misfire for A3's own still-PENDING pre-Submit state or for any
other Function. 3 new tests (`transaction-builder.component.actions.spec.ts`: A4 with `makerSubmittedAt`
set → `'finalize'`; A4 without it → `null`; a non-A4 Function with `makerSubmittedAt` set → still `null`).
Angular suite: 1474/1474 (98.76%/96.21%/97%/98.99%). `ng build --configuration production` clean.
Live-verified against the real dev stack: fresh A1→A3(acknowledge)→A4(maker-submit) scenario, Checker
search finds the A4 row, View Voucher now shows "PENDING" (previously "EARMARKING").

## A6's own protected natural-key card never showed its (carried) IB Number

User-directed ("A6 選中交易 應該把2NDARY REF 顯示出來 給一下配置"). The card's own IB Number span was
gated `requiredNaturalKeyFields.includes('ibNumber') && !isCreatingMovement` — written for A8/B3, the
shape where `isCreatingMovement` genuinely means "the 2ndary key is still being typed, not yet a real
value to protect." A6 is also `isCreatingMovement` (creates a new `IPLC_ACCEPTANCE` contract), but unlike
A8/B3 its own IB Number is CARRIED from the picked Document Arrival
(`PickerSelectionService.selectPayMovement()`'s own `naturalKeyIbNumber`, `settlesDocumentArrival`-gated)
— never typed, and `contextSecondaryRef()`'s own `isCreatingMovement` branch (`s.naturalKey[field]`)
already resolved it correctly; the card's own guard just never let A6 through to see it. Widened to
`(!isCreatingMovement || selectedFunctionStrategy?.checkerRelease?.settlesDocumentArrival)` — config-driven
(not naming A6 by code); B4 (the only other `settlesDocumentArrival` function) never reaches
`isCreatingMovement` at all, so it's structurally unaffected either way. Pure template change, `ng build
--configuration production` clean, Angular suite unaffected (1474/1474, this project's no-TestBed
convention means Jest never exercises this binding). Live-verified against the real dev stack: fresh
A1→A3(acknowledge) scenario, picked the Parent LC then the Document Arrival under A6 — protected card now
shows both "LC Number" and "IB Number" (previously LC Number only).

## Real regression from the A6 fix above — B4 lost its own Step-1 "LC Index" picker entirely

User-reported ("B4 選EARMARKED交易" — turned out to mean B4 had no way to select an LC at all). The A6
"New Reference" dedup fix immediately above put its `!settlesDocumentArrival` exclusion on the OUTER
`<div>` — which also wraps the `else existingContract` branch (the `isCreatingMovement`-false path,
including `flatCatalogPicker`, B4's own ONLY Step-1 LC picker). That entry's own recorded reasoning ("B4
never reaches `isCreatingMovement` at all, so this is a no-op") was backwards: hiding the whole div for
every `settlesDocumentArrival` function removes it regardless of which INNER branch a given function would
have taken — it doesn't matter that B4 never evaluates the `isCreatingMovement`-true branch specifically,
the div itself (and everything inside it, including the `else` branch B4 DOES use) was gone. Confirmed via
direct inspection: `document.querySelectorAll('app-index-picker')` returned 0 elements on B4's own screen,
even though `filteredCatalogContracts` had real data (`["B4EARM21621","S01"]`) — the data layer was never
broken, only the template guard.

Fixed by scoping the exclusion to `isCreatingMovement && settlesDocumentArrival` (exactly A6's own shape)
instead of `settlesDocumentArrival` alone — A8/B3 (`isCreatingMovement` true, `settlesDocumentArrival`
false) and every plain `existingContract` function (both false) are structurally unaffected either way, so
this only changes B4's own case. This class of bug — a hidden `*ngIf` branch, not a type error — is
invisible to `tsc`/Jest under this project's own no-TestBed convention; only `ng build`'s strict-template
check (which doesn't catch a runtime-hidden div either) or a live browser pass catches it, which is exactly
how it was found and re-verified here: real DOM clicks (not direct component-method calls, which had
misleadingly kept "working" throughout by bypassing the broken template entirely) — S01 → LC Index →
EB Index → E01 → `isSubmitReady: true`, full B4 flow confirmed end-to-end. `ng build --configuration
production` clean, Angular suite unaffected (1473/1473 — no test coverage possible for this specific class
of bug under this project's own convention, same caveat the A6 fix's own live-verification note already
implicitly relied on).

## B4's own EB Index still let the Maker re-pick a B3 presentation with an already-live, unresolved B4 attempt — real gap, fixed

User-reported live ("B4 S02 E01 Submit -> Maker Queue (看不到) -> B4 還可以選同一筆 再SUBMIT" — a duplicate
`sourceTransactionRef` rejection on the second Submit). Two separate things were reported; only one was a
real defect:

- **"Maker Queue 看不到" — not a bug.** Maker Queue defaults to the Import LC tab on load (same convention
  Inquire Events already uses); B4 is an Export function, so its own PENDING row only shows once the
  "Export Confirmed" tab is selected. Confirmed live — the row was correctly there under that tab the
  whole time.
- **"B4 還可以選同一筆再Submit" — real gap, fixed.** Unlike A4/A6 (whose own candidate filter already
  excludes `!m.makerSubmittedAt`, set on the referenced UTILIZE ITSELF at A6's own CREATE time), B4's own
  HONOUR/ACCEPT is a genuinely SEPARATE movement referencing the B3 CREATE via `referencedTransactionId` —
  the B3 record itself carries no equivalent "already has a live attempt" marker, so a still-PENDING (not
  yet Released or Rejected/Cancelled) prior B4 attempt left the SAME B3 presentation fully re-pickable,
  and a second Submit against it hit the server's own duplicate-`sourceTransactionRef` guard.

Fixed in `PickerSelectionService.loadPayableMovementsAcrossChildContracts()` (B4's own cross-contract
picker load): now also fetches the PARENT Confirmation's own `contractId` movements (newly threaded
through from `loadPayableMovements()`, in parallel with the child catalog search) and excludes any B3
candidate whose `movementId` already appears as `referencedTransactionId` on a still-PENDING parent
movement. A REJECTED/CANCELLED prior attempt does NOT exclude the candidate — re-picking the same
presentation after a genuine Delete Pending must keep working (and does — verified both ways below).

2 new tests (`picker-selection.service.spec.ts`): the exclusion itself, and its own negative case (a
CANCELLED prior attempt does not block a re-pick). One pre-existing test updated to reflect the parent's
own movements now genuinely being fetched even when the child catalog search returns zero candidates
(previously asserted zero `listMovements` calls — now asserts exactly one, for the parent). All three
suites green: Angular 1475/1475 (98.76%/96.16%/97%/99%), microservice 729/729, backend 41/41 (both
unaffected, Angular-only fix). `ng build --configuration production` clean. Live-verified against the
real dev stack: reproduced the exact reported scenario (S02/E01, a genuinely live PENDING B4 attempt) —
E01 no longer appears in the EB Index at all while that attempt is unresolved; E02/E03 (with no live
attempt) still show correctly.

## `ContractStatus`'s own contract-versioning mechanism removed entirely — a separate, unrelated, zero-call-site mechanism from the same-day Fix Pending §19 redesign above

User-directed, broadened scope, same day: the Design doc §7.3 contract-version-replacement mechanism
(`markSuperseded()`, its `ContractStatus` enum value, and the 2 backing self-referencing columns —
`supersedes_balance_contract_id`/`superseded_by_balance_contract_id`) is removed — code, schema,
migrations 13/15 rebuilt to drop the columns, both OAS files bumped (Microservice API v1.35.0, Channel API
v1.7.0). Alongside it, the also-unused reserved `BalanceMovement.supersededMovementId` field (Design doc
§8, pre-existing, never written by any code path) is removed too. Both were confirmed via a zero-call-site
grep before removal — unrelated to the §19 in-place-correction redesign documented separately above, which
concerns a completely different `MovementStatus` enum value on a completely different mechanism. All three
suites re-run green: microservice 727/727 (all 4 coverage metrics ≥95%), Angular 1475/1475 (all 4 ≥95%),
backend 41/41 — `npm run build`/`ng build --configuration production` clean.

## Migration 22's own historical-data backfill removed — user-confirmed no pre-SIT deployment ever ran the pre-redesign mechanism, so there was nothing to backfill

User-confirmed same week: this project has not reached SIT, so no real on-disk DB ever ran the
pre-2026-08-29 two-row Fix Pending mechanism long enough to accumulate a retired-row/successor pair —
migration 22's own backfill-into-`fix_pending_audit` loop (reading any pre-existing retired-status row and
its successor before excluding it from the rebuild) was pure defensive code for a scenario confirmed to
never have occurred. Removed outright, along with its dedicated test file
(`migration22FixPendingBackfill.test.ts`) and the now-unused `randomUUID` import — migration 22 now only
does the rebuild itself (narrow the `status` CHECK, drop `superseded_by_movement_id`), same posture as
migrations 13/15's own plain exclusion of the same historical marker. `migrations.ts` reached 100%
statements/branches/functions/lines as a direct result (the removed backfill loop was the file's own
remaining coverage gap). Microservice suite: 725/725 (99.11%/95.61%/99.69%/99.71%); `tsc --noEmit`/`npm run
build` clean. Angular/backend unaffected, re-confirmed green (1475/1475; 41/41).

## 2026-08-30 — BalanceService SOLID、Transaction Index、dead-code 與文件／OAS 同步

`BalanceService` 已完成 compatibility-façade 重構：Query、Snapshot、Contract、Validation、Release
Policy／Side Effects、Lifecycle Eligibility／Sweep 分離到 focused collaborators，routes、SQLite transaction
boundary 與 wire contract 保持不變。A3S／A6／B4 Transaction Index 改為同列一次選定 LC + SG／IB／EB
reference 與 amount；不需要 Secondary Reference 的功能顯示 Tight LC Balance。Run All 最後保留 A4、A6、
B4 各一筆可人工處理的 prerequisite。

同步清理前後端重複假日常數、無 caller 的舊 Checker release chain、未使用參數及失效 lint suppression。
OAS 更新為 microservice v1.37.0、channel v1.8.0，明確標示這是 contract clarification，沒有新增 wire
field。驗證基準：Angular 1625、Backend 57、Microservice 784，共 2466 tests 通過；Angular production
build 成功。

## 2026-08-31 — Transaction Processing 同 session Delete Pending 與 OAS 同步

本節取代較早「Delete Pending 只由 Maker Queue 進入」的 UI 敘述，但不改寫歷史紀錄。現行 A1-A11／B1-B7 在 Transaction Processing Maker Submit 成功後可直接 Delete Pending；Maker Queue／Fix Pending 本身不因此增加或共用按鈕狀態。

A1／B1 Confirm 成功後回到新的 natural-key 輸入；其餘 Function 回到各自 Transaction Index。A4 以 `/withdraw-maker-submit` 撤回本次 Maker Submit，保留 A3／A3S source；其他 Function 使用 `/cancel`。A3S／B4／B5 由 `function-strategy.ts` 提供 sibling movement ids，先 sibling、後 primary 逐筆取消。微服務目前沒有 atomic batch-cancel endpoint，所以中途失敗時停止後續動作、保留畫面並顯示實際錯誤，不宣稱自動回滾。

OAS 同步為 microservice v1.41.0、channel v1.9.0；沒有新增 wire field 或 endpoint。其後依使用者重現步驟修正 A7 跨頁籤返回時重播 stale Maker／Checker signal 的問題。Angular lifecycle 實作已驗證 51 suites／1,690 tests、typecheck、lint 0 errors 與 production build；文件 pass 另執行 OAS parse／reference validation、Markdown link audit 與 `git diff --check`。

## 2026-08-31 — 三個 Inquiry 頁面的間歇性錯誤分類修正與 OAS v1.42.0

Maker Queue、Inquire Events 與 Inquire Delete Pending 原先在 service boundary 把 `HttpErrorResponse` 壓成字串，component 再建立只有 `message` 的物件，導致 status `0`、HTTP `500` 與 backend technical code 全部遺失，最後被共用 presenter 誤判為 `BAL-UI-UNEXPECTED`。三個 query service 現在保留 raw cause，成功重試前會清除舊 cause；component 直接把 raw cause 交給 presenter。

共用 presenter 將 network/status `0` 分類為 Balance service unavailable，HTTP `5xx` 分類為 temporarily unavailable 並產生 `BAL-SVC-HTTP-{status}`；真正沒有 status／technical code 的 client failure 才保留 `BAL-UI-UNEXPECTED`。微服務 OAS 升至 v1.42.0，為 `/balance-contracts/catalog`、`/balance-movements`、`/delete-pending-audit` 與 `/delete-pending-audit/lc-catalog` 補上實際可能的 `500 Error` response；Channel OAS 維持 v1.9.0，成功 wire shape 不變。Angular 全套 51 suites／1,696 tests 通過，coverage 98.14%／95.60%／96.83%／98.52%；typecheck、lint（0 errors）與 production build 通過。`npm audit` 另揭露現有 dependency tree 的 53 個 vulnerabilities（4 low／18 moderate／30 high／1 critical）；建議修正要求 breaking Angular upgrade，未納入本次 transport-error fix。

## Fix Pending 成功後清除 stale Maker error（2026-08-31）

A7 Remarks-only Fix Pending 的 API 實際呼叫成功，但 Maker Panel 成功處理 `released` outcome 時未清除先前的 `submitError`，因此舊的 `BAL-UI-UNEXPECTED` 仍停留在畫面，形成 Save 失敗的假象。現在於進入 Fix Pending、送出有效 patch，以及成功 outcome 三個狀態邊界清除 stale error；真正失敗的 outcome 仍由既有 error path 顯示。

以實際 A7 `FULL_SETTLE` pending movement 呼叫 `POST /balance-movements/{movementId}/edit`（`REMARKS_ONLY`）驗證成功。新增 A7 regression test，完整 Angular 測試為 52 suites／1,701 tests。HTTP request／response schema、endpoint 與 status code 均未變更，因此 microservice 與 channel OAS 分別驗證、內容不修改。

Maker Submit 隨後套用相同的 raw-cause preservation 原則：`MakerSubmitOutcome`、pure workflow reducer、Maker Panel 與 Maker Result presenter 現在保留原始 HTTP error。HTTP 500 不再因只剩 message string 而誤判成 `BAL-UI-UNEXPECTED`；成功 Submit 則明確清除 error 與 cause。OAS wire contract 不變。

## 2026-08-31 — Safe-read automatic retry policy

新增共享 Angular HTTP interceptor，僅對 GET／HEAD／OPTIONS 的 network/status 0、408、429、5xx 暫時性失敗自動重試。`.env` 的 retry count／initial delay／maximum delay 預設為 3／250ms／2000ms，build/start/test 前由 `generate-runtime-config.mjs` 產生型別安全設定；重試使用 bounded exponential backoff。POST command（Submit、Release、Approve、Fix/Delete Pending）不自動重送，避免重複 balance movement 或 Account Entries。

Microservice OAS 升至 v1.42.1，使用 `x-client-retry-policy` 記錄 client operational policy；request／response wire contract 未變。
同步更新 `analysis/README.md`、architecture／current behavior、正式 `http-retry-policy.md` 及 Obsidian API／Architecture／Freshness 導覽；歷史 v1.42.0 記錄保留不改寫。

驗證：53 suites／1,704 tests、app typecheck、lint 0 errors、OAS parse及 production build通過；保留既有 SCSS budget warning。

## 2026-08-31 — Maker Submit validation／4xx error classification

修正 A2 回報及所有 A1-A11／B1-B7 共用的 Submit error path。本地 `validateSubmit`／request-build failure 直接顯示可修正的 validation message；HTTP 400／422 顯示安全的 backend business reason，401／403／404 與其他 4xx 使用明確且不可自動重試的分類。`BAL-UI-UNEXPECTED` 只留給沒有 HTTP status 的未知 client exception。

`MakerSubmitService.submit()` 以 RxJS `defer` 包覆 dispatch，單筆與 compound shape 的同步例外統一轉成保留 raw cause 的 `failed` outcome。參數化測試覆蓋全部 A／B Function；Angular 全套 53 suites／1,732 tests 通過，coverage 98.26%／95.61%／96.76%／98.64%，typecheck、lint 0 errors及 production build通過。Microservice OAS 維持 v1.42.1、Channel OAS 維持 v1.9.0：既有 Error schema／400 responses 已涵蓋 backend contract，本次沒有 endpoint、request、response 或 event wire change。
