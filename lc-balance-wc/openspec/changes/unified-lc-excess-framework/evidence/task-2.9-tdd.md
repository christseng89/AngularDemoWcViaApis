# Task 2.9 TDD Evidence — BD-03 Pure Routing

## Scope and identity

- Branch: `OVERDRAWN`
- RED base: `e5d44de`
- GREEN implementation: `346d4b0` (with follow-up evidence hardening in the next commit)
- Requirement: `configuredMaximumUsd = 0 OR allowancePercentage = 0` selects legacy sufficiency; only two strictly positive values enable Excess.

## RED — retained failing test evidence

The tests were added before `selectExcessProcessingRoute` existed, then this command was run from `microservices/balance-component`:

```text
npm test -- --runInBand test/unit/domain/excessPolicy.test.ts
```

It failed with exit code 1 before implementation:

```text
FAIL test/unit/domain/excessPolicy.test.ts
TS2305: Module '"../../../src/domain/excessPolicy"' has no exported member
'selectExcessProcessingRoute'.
Test Suites: 1 failed, 1 total
Tests: 0 total
```

This failure proves the new test contract was not already satisfied by production code. The failure was the expected compile-time RED state, not an assertion or environment failure.

## GREEN — implementation and validation

After adding the minimal Decimal-based pure function, the following evidence passed:

```text
npm test -- --runInBand --coverage=false test/unit/domain/excessPolicy.test.ts
Test Suites: 1 passed, 1 total
Tests: 18 passed, 18 total

npm run typecheck
exit 0

npx eslint src/domain/excessPolicy.ts test/unit/domain/excessPolicy.test.ts
exit 0

npx prettier --check src/domain/excessPolicy.ts test/unit/domain/excessPolicy.test.ts
All matched files use Prettier code style!
```

The full Balance microservice suite also passed:

```text
Test Suites: 47 passed, 47 total
Tests: 925 passed, 925 total
Statements: 98.24%
Branches: 95.24%
Functions: 99.06%
Lines: 98.79%
```

OpenSpec validation passed `16/16`, and `git diff --check` was clean.

## Repository-wide format baseline disposition

The changed source and test files pass targeted Prettier. The repository-wide gates remain open because pre-existing files outside this slice are not formatted:

- Root Angular `npm run format:check`: 68 pre-existing files, exit 1.
- Balance microservice `npm run format:check`: 50 pre-existing files, exit 1.

Commit `346d4b0` changes only `excessPolicy.ts`, `excessPolicy.test.ts`, and `tasks.md`; none of the reported baseline files is introduced or modified by this slice. This is not a waiver or a PASS for task 8.4. The final repository-wide format gate remains unchecked and MUST be made green before release approval.
