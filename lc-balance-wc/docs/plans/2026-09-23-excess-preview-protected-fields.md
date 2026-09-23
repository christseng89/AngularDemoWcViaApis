# Excess Preview Protected Fields Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use the available TDD workflow to implement this plan task-by-task.

**Goal:** Synchronize A3/A3S/B3 pre-submit validation with the approved Excess framework and show four authoritative protected Excess fields before Maker Submit.

**Architecture:** Add a read-only, zero-write preview operation to the Balance microservice. It reuses the same capacity, cumulative Excess, FX and allowance rules as Maker Submit, then Angular displays the returned values and derives its warning from the preview result rather than the legacy `amount > available` rule. The existing `OVERDRAWN` branch is the isolated implementation branch; main remains untouched.

**Tech Stack:** Node.js 22, TypeScript, Express, SQLite, Decimal.js, Angular 20, RxJS, Jest, OpenSpec.

---

## Confirmed contract

- Applies only to A3, A3S and B3.
- All four fields are protected/read-only:
  - `Previous Exceed Amount`
  - `This Exceed Amount`
  - `Total Exceed Amount`
  - `Max Exceed Amount Equivalent (In Trx Currency)`
- `Previous = active Pending Excess + active Approved outstanding Excess`, excluding reversed/released/deleted/expired amounts.
- Fix Pending excludes the movement's existing reservation before calculating Previous.
- `This = max(0, transaction amount - effective capacity)`.
- `Total = Previous + This`.
- `Max = effective Excess limit converted to transaction currency`.
- USD uses `USD_PAR`; non-USD uses provider-supplied Approved/Effective/Fresh BOOKING rate only.
- Preview is zero-write. Maker Submit always recalculates and remains authoritative.
- `Total <= Max` is eligible; `Total > Max` is rejected with the existing A2/B2 increase guidance.

## Non-functional decisions

- Demo-scale only: one debounced preview request for the current selection/amount; no new microservice.
- Preview failures never fabricate values or FX rates.
- Protected values are display-only and never copied into the Maker command as trusted input.
- Existing A8/A9 and main A3S SG lifecycle remain unchanged.

## Decision log

1. Chose a backend preview API over UI-only arithmetic to prevent FX, cumulative Excess and Fix Pending drift.
2. Previous includes both active Pending and active Approved Excess because both consume the allowance.
3. Preview reuses domain calculation inputs but performs no transaction, reservation or audit write.
4. Policy-specific terminology shown to users remains “Exceed” as requested; internal domain/API names remain “Excess”.

---

### Task 1: Synchronize approved OpenSpec contracts

**Files:**
- Modify: `openspec/changes/unified-lc-excess-framework/design.md`
- Modify: `openspec/changes/unified-lc-excess-framework/specs/http-api-and-inquiry/spec.md`
- Modify: `openspec/changes/unified-lc-excess-framework/specs/transaction-builder-ui/spec.md`
- Modify: `openspec/changes/unified-lc-excess-framework/specs/excess-allowance-control/spec.md`
- Modify: `openspec/changes/unified-lc-excess-framework/tasks.md`
- Modify: `openspec/changes/unified-lc-excess-framework/requirement-traceability.md`

1. Add the confirmed four-field, zero-write preview contract and A3/A3S/B3 scope.
2. Add Previous/This/Total/Max formulas, active-status inclusion and Fix Pending self-exclusion.
3. Add FX failure behavior and prohibit client-derived non-USD values.
4. Add requirement IDs and implementation/test trace rows.
5. Run `openspec validate --all --strict --no-interactive`; expect all specs PASS.

### Task 2: Domain preview calculation — RED/GREEN

**Files:**
- Create: `microservices/balance-component/src/domain/excessPreview.ts`
- Create: `microservices/balance-component/test/unit/domain/excessPreview.test.ts`
- Reuse: `microservices/balance-component/src/domain/excessPolicy.ts`
- Reuse: `microservices/balance-component/src/domain/minimumRequiredIncrease.ts`

1. Write failing tests for zero Excess, Pending+Approved Previous, Total arithmetic, max conversion and eligibility.
2. Add cases for released/reversed exclusion and Fix Pending self-exclusion.
3. Add exact decimal/rounding tests for USD and non-USD transaction currencies.
4. Implement a pure result:

```ts
interface ExcessPreviewResult {
  previousExcessAmountTransaction: string;
  thisExcessAmountTransaction: string;
  totalExcessAmountTransaction: string;
  maxExcessAmountTransaction: string;
  eligible: boolean;
  businessResultCode: null | 'EXCESS_LIMIT_EXCEEDED' | 'FX_RATE_UNAVAILABLE' | 'FX_RATE_STALE';
}
```

5. Run the focused Jest suite; expect PASS.

### Task 3: Read-only service and API — RED/GREEN

**Files:**
- Modify: `microservices/balance-component/src/service/balanceService.ts`
- Modify: `microservices/balance-component/src/routes/balanceMovements.ts`
- Modify: `microservices/balance-component/src/validation/requestSchema.ts`
- Modify: `microservices/balance-component/src/store/excessLedgerStore.ts` only if an existing aggregate cannot expose the required active totals.
- Modify: `microservices/balance-component/test/unit/app.test.ts`
- Modify: `microservices/balance-component/test/unit/service/balanceServiceMakerExcess.test.ts`
- Modify: `analysis/balance-component-api.yaml`

1. Write failing contract tests for `POST /balance-movements/excess-preview` for A3, A3S and B3.
2. Assert the request accepts the same protected identity/currency/capacity references used by Maker Submit plus optional `excludeMovementId` for Fix Pending.
3. Assert response values and eligibility match Maker Submit for identical facts.
4. Assert preview performs zero writes across movements, accounts, ledger events, decisions, FX snapshots and audits.
5. Assert unavailable/stale FX returns the approved typed result without fallback.
6. Implement the route/service by reusing existing policy, FX and aggregate readers.
7. Parse the OpenAPI YAML and run focused tests, typecheck and lint.

### Task 4: Angular API model and preview orchestration — RED/GREEN

**Files:**
- Modify: `src/app/transaction-builder/balance-component-api.service.ts`
- Modify: `src/app/transaction-builder/balance-component-api.service.spec.ts`
- Modify: `src/app/transaction-builder/maker-panel.component.ts`
- Modify: `src/app/transaction-builder/maker-panel.component.spec.ts`

1. Write failing API service tests for the preview request/response.
2. Write failing Maker panel tests proving preview applies only to A3/A3S/B3.
3. Add a debounced/switch-mapped preview flow so stale responses cannot overwrite the latest amount/selection.
4. Clear protected values when function, selected contract, SG/presentation or amount becomes incomplete.
5. Preserve submitted values as server-owned display data; never send displayed totals back as trusted command fields.
6. Run focused component/service tests and typecheck.

### Task 5: Four protected UI fields and synchronized warning — RED/GREEN

**Files:**
- Modify: `src/app/transaction-builder/maker-panel.component.html`
- Modify: `src/app/transaction-builder/maker-balance-warning.policy.ts`
- Modify: `src/app/transaction-builder/maker-balance-warning.policy.spec.ts`
- Modify: `src/app/transaction-builder/maker-panel.component.spec.ts`

1. Write failing tests for exact labels, protected state, formatting and A3/A3S/B3 visibility.
2. Render the four values near Amount with transaction currency and a loading/unavailable state.
3. Remove the legacy unconditional rejection message for in-scope functions.
4. Show within-limit guidance when `Total <= Max` and rejection/A2/B2 guidance only when `Total > Max`.
5. Keep legacy warnings for functions outside A3/A3S/B3, especially A8.
6. Run focused UI tests, ESLint and Angular typecheck.

### Task 6: Regression and quality gates

**Files:**
- Modify: `backend/data/businessCases.js`
- Modify: `backend/test/businessCases.test.js`
- Add evidence: `openspec/changes/unified-lc-excess-framework/evidence/task-excess-preview-protected-fields-tdd.md`

1. Add Business Case Runner assertions for A3, A3S and B3 Previous/This/Total/Max values.
2. Include cumulative Pending+Approved and Fix Pending self-exclusion cases.
3. Include non-USD booking-rate success and unavailable/stale negative cases.
4. Run microservice, backend and Angular test suites.
5. Run `openspec validate --all --strict --no-interactive`.
6. Run production build and SonarQube quality gate using the existing ARM-compatible QA workflow.
7. Perform independent BA, 4-Eyes and QA review before marking the task complete.

