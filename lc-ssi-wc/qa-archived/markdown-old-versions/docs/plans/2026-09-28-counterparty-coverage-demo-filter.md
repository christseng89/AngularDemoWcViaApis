# Counterparty Coverage Demo Filter Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. If that skill is unavailable, execute the same Red-Green-Refactor steps directly and preserve their evidence.

**Goal:** Make the demo Counterparty Inbox count only operationally visible SSI records while retaining all controlled QA and MT347 fixture data.

**Architecture:** Keep the existing API and UI contracts unchanged. Add generic data-scope predicates to the SQLite aggregation so fixture-bound, QA-scoped, and explicitly hidden records cannot enter the operational counterparty coverage projection. Do not hard-code message types, fixture variants, banks, or expected production counts.

**Tech Stack:** TypeScript, NestJS repository adapter, SQLite JSON1, Jest, Nx.

---

### Task 1: Capture the incorrect aggregation as a failing repository test

**Files:**

- Modify: `apps/ssi-service/src/test/app/sqlite-repositories.spec.ts`

**Step 1: Extend the existing counterparty coverage test**

Insert three ACTIVE counterparty records alongside the ordinary operational records:

```ts
{
  ...makeRecord("SSI-FIXTURE", "BARCGB22", "USD"),
  fixtureBindingId: "FIX-DEMO@v1",
}
{
  ...makeRecord("SSI-QA", "BARCGB22", "JPY"),
  usageScope: "QA_POSITIVE",
}
{
  ...makeRecord("SSI-HIDDEN", "BARCGB22", "HKD"),
  operationalVisible: false,
}
```

Retain the expected operational result of two BARCGB22 records and two currencies.

**Step 2: Run the focused test and verify Red**

Run:

```powershell
npx nx test ssi-service --configuration=ci --runInBand --testPathPatterns=sqlite-repositories.spec.ts --testNamePattern="aggregates complete counterparty coverage"
```

Expected: FAIL because the current query returns five records and five currencies for BARCGB22.

### Task 2: Implement the minimum DB-side scope filter

**Files:**

- Modify: `apps/ssi-service/src/app/sqlite-ssi.repository.ts:551`
- Test: `apps/ssi-service/src/test/app/sqlite-repositories.spec.ts`

**Step 1: Add generic SQL predicates**

Add DB-side conditions equivalent to:

```sql
AND json_type(payload,'$.fixtureBindingId') IS NULL
AND substr(COALESCE(json_extract(payload,'$.usageScope'),''),1,3) <> 'QA_'
AND COALESCE(json_extract(payload,'$.operationalVisible'),1)=1
```

These predicates must apply before grouping and counting.

**Step 2: Run the focused test and verify Green**

Run the focused command from Task 1.

Expected: PASS with only operational records counted.

**Step 3: Run the complete repository specification**

```powershell
npx nx test ssi-service --configuration=ci --runInBand --testPathPatterns=sqlite-repositories.spec.ts
```

Expected: PASS.

### Task 3: Validate the real demo projection and project quality gates

**Files:**

- No production-file changes expected.

**Step 1: Execute an equivalent read-only query against `data/ssi-demo.sqlite`**

Expected current operational demo projection:

- `CHASUS33`: 6 SSI, 2 currencies
- `DEUTDEFF`: 6 SSI, 2 currencies
- `BOFAUS3N`: 3 SSI, 1 currency

These counts are diagnostic expectations, not hard-coded assertions in production code.

**Step 2: Run lint and type checks**

```powershell
npm run lint
npm run typecheck
```

Expected: PASS.

**Step 3: Run the standard project gate**

```powershell
npm run verify
```

Expected: PASS. If an unrelated environmental or pre-existing failure occurs, record it exactly and do not claim completion.

**Step 4: Review the isolated diff**

Confirm that only the plan, repository test, and repository SQL changed. Do not merge, push, reload, or modify Main.
