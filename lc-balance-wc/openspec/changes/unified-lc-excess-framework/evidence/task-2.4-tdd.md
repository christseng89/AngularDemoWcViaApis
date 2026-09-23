# Task 2.4 TDD Evidence — BD-07 Return／Reversal Removal

## Scope

- Remove `RETURN_REVERSAL` and `CANCELLATION_REVERSAL` from the active Excess event type and fresh schema.
- Preserve pre-BD-07 draft reversal rows as read-only legacy audit evidence.
- Exclude every legacy reversal row from active list and aggregate decisions so Approved Excess cannot be reduced.
- Define the pure whole Delete Pending policy: only `PENDING|REJECTED`, no amount／partial indicator, full retained reservation release, zero Approved Excess delta.

## RED

Base branch／HEAD before the Task 2.4 production changes:

```text
OVERDRAWN
fdbe5f25689d077bec5e602248ad8f56333b477c
```

Tests were added before production changes:

- `test/unit/store/excessStores.test.ts`
- `test/unit/db/excessSchema.test.ts`
- `test/unit/db/migration29V4ReturnRemoval.test.ts`
- `test/unit/domain/excessPendingLifecycle.test.ts`

Initial focused command:

```text
npm test -- --runInBand test/unit/store/excessStores.test.ts test/unit/db/excessSchema.test.ts test/unit/db/migration29V4ReturnRemoval.test.ts test/unit/domain/excessPendingLifecycle.test.ts
```

Observed RED evidence (`exit code 1`):

- TypeScript `TS2307`: missing `../../../src/domain/excessPendingLifecycle`;
- TypeScript `TS2339`: `listLegacyReversalEventsByAccount` did not exist on `ExcessLedgerStore`;
- two failing fresh-schema assertions because `RETURN_REVERSAL` and `CANCELLATION_REVERSAL` inserts did not throw;
- two failing active-store assertions because `RETURN_REVERSAL` and `CANCELLATION_REVERSAL` inserts did not throw;
- overall result: `4 failed suites`; `4 failed / 10 passed tests` before implementation.

## GREEN

Implemented:

- active event union limited to reservation／utilization／release;
- fresh DB check constraint excludes both reversal types;
- migration 29 blocks new reversal inserts on upgraded databases while retaining immutable historical rows;
- a typed read-only legacy reversal decoder, excluded from active list and aggregate;
- `planWholeDeletePending` exact-decimal pure policy with runtime rejection of amount／partial fields and invalid statuses.

Focused verification:

```text
npm test -- --runInBand --coverage=false test/unit/store/excessStores.test.ts test/unit/db/excessSchema.test.ts test/unit/db/migration29V4ReturnRemoval.test.ts test/unit/domain/excessPendingLifecycle.test.ts
```

Result: `4 suites / 21 tests PASS`.

Full regression:

```text
npm test -- --runInBand
```

Result: `52 suites / 973 tests PASS`.

Coverage:

- Statements `97.99%`
- Branches `95.15%`
- Functions `98.91%`
- Lines `98.56%`

Typecheck and ESLint completed with zero errors. Existing repository-wide formatting drift was not bulk-modified; only Task 2.4 files were formatted and checked.

## Candidate Binding

The reviewed working-tree candidate is based on branch `OVERDRAWN` at base HEAD `fdbe5f25689d077bec5e602248ad8f56333b477c`. SHA-256 values after the final QA-requested dual-trigger test were:

```text
a7e3e09650b74b213fbe6598feab09630e8427cd98dbfa0e57f35046d17001da  microservices/balance-component/src/types.ts
fdf466c5fa021d5e36bf1a94e2c35c6e5731485a5f4a4058f766ee01f4b460bf  microservices/balance-component/src/db/schema.ts
7f68c675275947f1ffb0f89efaed72699ced93f5a6b943d9d53d53303963e85e  microservices/balance-component/src/db/migrations.ts
0e39b8192722be9345ea4e2fcab678b5953a9e56c741b77cd91fa53b1fee3039  microservices/balance-component/src/store/excessLedgerStore.ts
3bf0bb05cdd2d586526283a3d1d934897b2435413aff0aa0d548b825f2e7a2be  microservices/balance-component/src/domain/excessPendingLifecycle.ts
eb5b0db1f0ea397b39cf09fe837aef4255c2c287f05e34dd7c54c25bb18ee21f  microservices/balance-component/test/unit/store/excessStores.test.ts
320749ab1a6c8591c2dc3dc6d998a9b04f207a60051665c1c934b6dab5c48258  microservices/balance-component/test/unit/db/excessSchema.test.ts
1c0ed00466f6b5f49fe13ba984192ab020bf86164ef86f3443b7cb7889a3528e  microservices/balance-component/test/unit/db/migration29V4ReturnRemoval.test.ts
58c12c52cb89304a5a10daa467003cb0360133e4b510b637b4ef35a1f2d876ea  microservices/balance-component/test/unit/domain/excessPendingLifecycle.test.ts
```

## Independent Review

- Trade Finance BA: PASS.
- Independent 4-Eyes: PASS, P0／P1／P2 = 0.
- Independent QA: initial `REQUIRES_CHANGE` P2 x2; both evidence completeness findings corrected; final re-review PASS with no remaining findings.
