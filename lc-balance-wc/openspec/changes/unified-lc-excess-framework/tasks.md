## 0. Review Gate

- [x] 0.1 Obtain OpenSpec Change Review／Approval for `proposal.md`, `design.md`, all delta specs, `tasks.md` and `requirement-traceability.md` before implementation.
- [x] 0.2 Confirm BD-01 and BD-02 in review evidence; do not add `FX_RATE_PENDING` or use the virtual adapter in production.
- [ ] 0.3 Obtain amended OpenSpec Change Approval for BD-03 Zero Allowance Legacy Fallback before implementing BD-03 behavior.

## 1. Contracts, Configuration and Persistence — Tests First

- [x] 1.1 Add failing configuration tests and implement versioned `ExcessPolicyConfig` under `microservices/balance-component/src/config.ts` plus a reviewed config file under `microservices/balance-component/config/`; test missing, overlap, effective date, maximum, percentage and `FAIL_CLOSED` freshness policy.
- [x] 1.2 Add failing migration／constraint tests in `microservices/balance-component/test/unit/db/` before extending `microservices/balance-component/src/db/schema.ts` and `migrations.ts` with `excess_account`, append-only `excess_ledger_event`, `excess_allocation`, `fx_rate_snapshot`, `sg_capacity_event` and `command_idempotency`.
- [x] 1.3 Add typed wire／domain models and exact enums in `microservices/balance-component/src/types.ts`; keep Excess decision, workflow, accounting, contract and FX command result states separate.
- [x] 1.4 Add store contract tests before implementing narrow stores in `microservices/balance-component/src/store/`; prove owner versioning, immutable events, aggregate derivation and migration preservation.

## 2. Pure Policies and Currency Exchange Port — Tests First

- [x] 2.1 Add `excessPolicy.test.ts` then implement pure exact-decimal Covered／Excess split and owner allowance policy under `microservices/balance-component/src/domain/`.
- [ ] 2.2 Add boundary tests for zero capacity, exact limit, one minor unit over, currency rounding and concurrent aggregate inputs; use `microservices/balance-component/src/money.ts`, never JavaScript number.
- [ ] 2.3 Add function strategies for A8／A3／A3S／B3 covered-capacity inputs without duplicating allowance arithmetic.
- [ ] 2.4 Add formal allocation／return attribution pure-policy tests, including partial, repeated and over-reversal rejection.
- [x] 2.5 Define `CurrencyExchangePort` and DTOs under `microservices/balance-component/src/integration/`; add contract tests for BOOKING purpose, Approved／Effective, freshness, correlation, source／version and USD par.
- [x] 2.6 In `../lc-payment-wc/backend/data/fx-rates.json` and `../lc-payment-wc/backend/server.js`, first add tests then extend the non-production virtual endpoint to emit exact-decimal `buyRate`, `sellRate`, optional `bookingRate`, deterministic metadata and `bookingRate=(buyRate+sellRate)/2` when omitted; preserve legacy fixtures by explicitly setting both sides where appropriate.
- [ ] 2.7 Implement a Balance virtual adapter and a production adapter boundary; configuration MUST reject the virtual adapter in production, and production MUST reject missing provider Booking Rate without deriving or falling back from Buy／Sell or any alternate-purpose rate.
- [ ] 2.8 Test timeout／retry／late／out-of-order handling and map unavailable／not Approved／not Effective to `FX_RATE_UNAVAILABLE`, stale to `FX_RATE_STALE`.
- [ ] 2.9 Add pure routing tests proving `configuredMaximumUsd = 0 OR allowancePercentage = 0` selects legacy sufficiency before Covered／Excess or FX, while both values greater than zero select the Excess Framework.

## 3. Maker／Checker and Allowance Ledger — Tests First

- [ ] 3.1 Add service tests for the Maker sequence: idempotency, current facts, config, split, FX, locked allowance, atomic persistence.
- [ ] 3.2 Implement owner account orchestration and Pending Excess Reservation in new narrow services／stores; integrate through `microservices/balance-component/src/service/balanceService.ts` and `unitOfWork.ts`.
- [ ] 3.3 Prove any FX、limit、store or audit failure creates no movement／reservation／idempotent success.
- [ ] 3.4 Extend `movementReleasePolicyService.test.ts` first, then re-read contract、linked facts、policy、allowance and latest Booking Rate at Checker Release.
- [ ] 3.5 Prove Checker unavailable／stale rate retains the pending movement and reservation while recording only a command-attempt audit.
- [ ] 3.6 Atomically convert reservation to Approved Excess with release side effects in `movementReleaseSideEffectService.ts` and `unitOfWork.ts`.
- [ ] 3.7 Extend Fix Pending tests and service so Amount is mutable only for pending A8／A3／A3S／B3; atomically replace reservation only after fresh FX／allowance success.
- [ ] 3.8 Extend Reject／Delete tests and `deletePendingAudit.ts` so reservation release and audit are atomic and approved facts cannot be deleted.
- [ ] 3.9 Add Formal Increase command／service tests and implement explicit allocation events without FIFO／LIFO inference.
- [ ] 3.10 Add typed Import／Export Return Documents command tests and implement Maker／Checker／idempotency／audit boundaries; keep A8 cancellation on its existing lifecycle with attributable reversal.
- [ ] 3.11 Add A8／A3／A3S／B3 service tests and implement BD-03 legacy routing with existing `INSUFFICIENT_AVAILABLE_BALANCE` code／message, zero FX interaction and zero Excess persistence.

## 4. SG Capacity and Downstream Eligibility — Tests First

- [ ] 4.1 Add A8 approval tests then initialize Eligible SG Capacity with Covered／Excess attribution independently of SHGT legal balance.
- [ ] 4.2 Add A3S partial／full／over-capacity tests before changing `offBalanceExposure.ts`, `shgtRedeem.ts` and release side effects.
- [ ] 4.3 Prove A8→A3S transfers attribution exactly once and only the amount above SG capacity receives a new parent Covered／Excess decision.
- [ ] 4.4 Prove A3S does not release SG legal／contingent liability and A9 does not automatically release Approved Excess.
- [ ] 4.5 Implement traceable A3／A3S／B3 Return and A8 cancellation capacity restoration／reversal with eligibility guards.
- [ ] 4.6 Extend A4／A6／B4／A9 eligibility and compound service tests so downstream completion preserves Approved Excess and remains atomic.

## 5. API, OAS, Idempotency and Inquiry — Tests First

- [ ] 5.1 Add request schema tests before extending `microservices/balance-component/src/validation/requestSchema.ts` for idempotency keys, return／regularization references and client event identity; never accept caller-authoritative Covered／Excess or USD amounts.
- [ ] 5.2 Extend route tests before updating `microservices/balance-component/src/routes/balanceMovements.ts` with typed success and `EXCESS_LIMIT_EXCEEDED`／`FX_RATE_UNAVAILABLE`／`FX_RATE_STALE`／`IDEMPOTENCY_CONFLICT` responses.
- [ ] 5.3 Extend `analysis/balance-component-api.yaml` with schemas, examples, error statuses, Excess／FX snapshots, Return／Formal Increase commands and inquiries; validate OpenAPI.
- [ ] 5.4 Add same-key/same-hash replay, same-key/different-hash conflict, compound atomicity and concurrent owner allowance tests.
- [ ] 5.5 Add Formal Increase API／inquiry tests with explicit allocation IDs and immutable history.
- [ ] 5.6 Add Return／Cancellation API／inquiry tests with partial／over／duplicate cases and accounting-status separation.
- [ ] 5.7 Add API contract tests proving BD-03 preserves the existing `409 INSUFFICIENT_AVAILABLE_BALANCE` response and never maps the legacy path to `EXCESS_LIMIT_EXCEEDED`.

## 6. Angular Transaction Builder — Tests First

- [ ] 6.1 Extend `balance-component.model.ts` and `balance-component-api.service.spec.ts`／`.ts` for typed Excess、FX、eligibility and error contracts.
- [ ] 6.2 Add component tests before displaying Covered／Excess preview, allowance, policy version, Maker／Checker snapshots and linked history under `src/app/transaction-builder/`.
- [ ] 6.3 Extend function／protected-field／maker submit／checker action tests so Amount Fix is enabled only for A8／A3／A3S／B3 and failed Fix reloads original pending facts.
- [ ] 6.4 Add accessible UI states for `FX_RATE_UNAVAILABLE`, `FX_RATE_STALE`, `EXCESS_LIMIT_EXCEEDED` and retained pending reservation; never display `FX_RATE_PENDING`.

## 7. Regression and Business Case Runner

- [ ] 7.1 Add deterministic A8／A3／A3S／B3 Covered-only, partial Excess, full Excess, exact-limit and over-limit cases in `backend/data/businessCases.js` with assertions in `backend/test/businessCases.test.js` and `runCase.test.js`.
- [ ] 7.2 Add A4／A6／B4／A9 cases proving downstream completion does not reduce Approved Excess.
- [ ] 7.3 Add A8→A3S partial／full／over-capacity／reversal cases proving no parent capacity or allowance double count.
- [ ] 7.4 Add virtual FX explicit Booking、derived midpoint、missing side、unavailable、not Approved、not Effective、stale、timeout and Maker-vs-Checker revaluation cases; add a production-mode negative case proving Buy／Sell availability never permits midpoint derivation when provider Booking Rate is absent.
- [ ] 7.5 Add Formal Increase exact allocation／over-allocation／immutable-history cases.
- [ ] 7.6 Add A3／A3S／B3 Return Documents and A8 cancellation partial／duplicate／over-reversal cases.
- [ ] 7.7 Add concurrent submit, idempotent replay and payload-conflict cases.
- [ ] 7.8 Run all Balance microservice unit／integration tests and coverage gates; document commands and results.
- [ ] 7.9 Run all Angular unit tests、coverage and browser acceptance; retain existing A1–A11／B1–B7 characterization evidence except intentionally replaced hard-reject assertions.
- [ ] 7.10 Run Backend and Business Case Runner full suite against real Balance microservice plus virtual FX adapter.
- [ ] 7.11 Add a parameterized BD-03 matrix for each of `(configuredMaximumUsd, allowancePercentage) = (0, 0)`, `(0, positive)` and `(positive, 0)` × A8／A3／A3S／B3 × Maker within-capacity／Maker over-capacity／Checker Release／Fix within-capacity／Fix over-capacity. Assert exact legacy success or `409 INSUFFICIENT_AVAILABLE_BALANCE` code／message, forbid `FX_RATE_UNAVAILABLE`／`FX_RATE_STALE`／`EXCESS_LIMIT_EXCEEDED`, assert Currency Exchange spy count = 0, and assert unchanged before／after counts for `USD_PAR`, `fx_rate_snapshot`, `ExcessDecision`, Pending Excess Reservation, Approved Excess utilization and Excess ledger rows.

## 8. Documentation, Validation and Release Gate

- [ ] 8.1 Document the Currency Exchange port, virtual Buy／Sell／Booking midpoint rule, Approved／Effective／Freshness and non-production restriction in Obsidian Architecture／API／FX pages.
- [ ] 8.2 Update A8／A3／A3S／B3, Maker／Checker, data model, decision tables, downstream eligibility and traceability pages under `docs/obsidian-balance-kb-v3.2/`.
- [ ] 8.3 Verify every row in `requirement-traceability.md` has passing test evidence and resolve C-01～C-07 without lowering v11.15 requirements.
- [ ] 8.4 Run OAS validation, lint, formatting, all coverage gates and `openspec validate --all --strict --no-interactive`.
- [ ] 8.4a Run a fresh SonarQube server scan against the exact `OVERDRAWN` release-candidate commit and retain machine-readable measures／Quality Gate evidence. New Code MUST have Issues = 0, Security Hotspots Reviewed = 100%, Coverage >= 92%, Duplicated Lines <= 1%, Maintainability Issues = 0, Medium Severity Issues = 0 and Security Issues = 0. Overall Code MUST have Coverage >= 92%, Duplicated Lines <= 3%, High Severity Issues = 0, Maintainability Issues <= 20, Medium Severity Issues = 0, Security Hotspots Reviewed = 100% and Security Issues = 0. A pre-candidate or stale scan is not evidence.
- [ ] 8.5 Obtain implementation Review／Approval; only after all tasks and scenarios pass, run `openspec archive unified-lc-excess-framework --yes`, re-run strict validation and verify current specs contain the approved behavior.
