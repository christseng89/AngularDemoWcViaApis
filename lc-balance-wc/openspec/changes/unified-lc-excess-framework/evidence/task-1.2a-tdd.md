# Task 1.2a TDD Evidence — Remove Active Formal Increase Cure

## Scope and candidate identity

- Branch: `OVERDRAWN`
- Working-tree base HEAD: `fdbe5f25689d077bec5e602248ad8f56333b477c`
- Requirement: no active `FORMAL_INCREASE_REGULARIZATION`, allocation write DTO／API or aggregate cure effect; preserve previously migrated allocation data as read-only legacy audit through a non-destructive compatibility migration.
- Representative candidate SHA-256:
  - `src/types.ts`: `860ECEBB621891241B24024AF8C53B5C695C56EF5FB5FD787B90AFC6B6535305`
  - `src/store/excessLedgerStore.ts`: `C1ABD41C6BCB474B83AE39B757ADE3BFDE8EB02EBC5F1142D3E00F527313D669`
  - `src/db/schema.ts`: `60E05617DC3B55E3D41197D077444D0DA52F5BE134789C19B054D40EFCDB8D0C`
  - `src/db/migrations.ts`: `C2327D1A41A98059D0E2BBAA26021A58AE77699781F2FD1FD356409FAE971B36`
  - `test/unit/db/migration28V4CureRemoval.test.ts`: `976605A4FF58946F3423801337877E495D7BDAA0ACB98D4513416EBE6BD3FFDC`
  - `test/unit/db/cleanupScripts.test.ts`: `06130EC93773F52244A82FDFA23A6B356606A05DD9A4AD52324270281BEDE61D`

These hashes identify the uncommitted candidate reviewed in this evidence. Final release evidence must bind a clean exact commit under task 8.4b.

## RED

Negative fresh-schema／store tests were added first:

```text
npm test -- test/unit/store/excessStores.test.ts test/unit/db/excessSchema.test.ts --runInBand --coverage=false
```

Expected RED evidence:

```text
FAIL test/unit/db/excessSchema.test.ts
- fresh schema still contained excess_allocations
- FORMAL_INCREASE_REGULARIZATION insert did not throw

FAIL test/unit/store/excessStores.test.ts
TS2551: listLegacyAllocationsForApprovedEvent does not exist;
the active listAllocationsForApprovedEvent API still existed.
```

BA／4-Eyes then identified two missing isolation assertions. They were added before the follow-up implementation:

```text
npm test -- test/unit/db/migration28V4CureRemoval.test.ts test/unit/db/cleanupScripts.test.ts --runInBand --coverage=false
FAIL test/unit/db/migration28V4CureRemoval.test.ts
TS2339: listLegacyFormalIncreaseEventsByAccount does not exist on ExcessLedgerStore.
```

The same test also requires INSERT／UPDATE／DELETE rejection on the legacy allocation table and upgraded cleanup coverage.

## GREEN

The minimal implementation:

- removes the cure event from the active TypeScript enum and fresh-schema CHECK;
- removes the active allocation DTO／write method;
- removes cure subtraction from aggregate calculation;
- adds migration 28, which renames any pre-existing table to `legacy_excess_allocations`, preserves rows, keeps it append-only and blocks all new Formal Increase cure inserts;
- blocks INSERT／UPDATE／DELETE on `legacy_excess_allocations`;
- filters preserved cure events out of `listByAccount()` and exposes them only through an explicit legacy audit DTO／decoder;
- exposes only a read-only legacy allocation decoder and returns an empty list for fresh schema;
- updates controlled cleanup tooling to handle the optional legacy table without restoring an active capability; cleanup tests construct the old table and execute the real migration 28 before invoking cleanup-all／cleanup-by-LC.

Focused evidence:

```text
npm test -- test/unit/db/cleanupScripts.test.ts test/unit/db/migration28V4CureRemoval.test.ts test/unit/db/excessSchema.test.ts test/unit/store/excessStores.test.ts test/unit/config/excessPolicyConfig.test.ts --runInBand --coverage=false
Test Suites: 5 passed, 5 total
Tests: 37 passed, 37 total
```

The task 1.2a DB／store／cleanup subset contributes 14 passing tests. Full regression and quality evidence:

```text
npm run typecheck
exit 0

npx eslint <changed TypeScript files> --no-cache
exit 0

npx prettier --check <changed files excluding known baseline files>
All matched files use Prettier code style!

npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests: 944 passed, 944 total
Statements: 97.99%
Branches: 95.15%
Functions: 98.89%
Lines: 98.58%
```

`git diff --check` for the slice completed with no whitespace error; line-ending notices are informational.
