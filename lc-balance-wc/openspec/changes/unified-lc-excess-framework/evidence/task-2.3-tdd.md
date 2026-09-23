# Task 2.3 TDD Evidence — Function Capacity Strategies and Currency Invariant

Date: 2026-09-22  
Branch: `OVERDRAWN`  
Base HEAD: `fdbe5f25689d077bec5e602248ad8f56333b477c`

## Scope

- Added typed A8, A3, A3S and B3 capacity inputs.
- Kept shared Covered／Excess arithmetic in `excessPolicy.ts`; function strategies only resolve authoritative owner-currency capacity.
- A8 uses Import LC parent Tight Available; A3 uses Import LC Tight Available; B3 uses Export Confirmation Tight Available.
- A3S combines selected Eligible SG Capacity with non-negative residual parent Tight Available once, preventing the selected SG capacity from being counted twice or eroded by a negative residual parent capacity.
- Enforced `A8/A3/A3S.transactionCurrency = ImportLC.currency` and `B3.transactionCurrency = Confirmation.currency` as a typed `CURRENCY_MISMATCH` precondition.
- Added service-boundary proof that a mismatch leaves contract, movement, Excess, FX snapshot, SG capacity and command-idempotency fact counts unchanged for all four functions.

## RED

Command:

```text
npm test -- --runInBand test/unit/domain/excessFunctionStrategy.test.ts
```

Observed expected failure:

```text
TS2307: Cannot find module '../../../src/domain/excessFunctionStrategy'
Test Suites: 1 failed, 1 total
Tests: 0 total
```

## GREEN and Regression

Focused command:

```text
npm test -- --runInBand --coverage=false \
  test/unit/domain/excessFunctionStrategy.test.ts \
  test/unit/domain/excessPolicy.test.ts \
  test/unit/service/excessCurrencyInvariant.test.ts
```

Result: 3 suites／43 tests PASS.

Full regression command:

```text
npm test -- --runInBand
```

Result: 50 suites／962 tests PASS.

Coverage:

- Statements: 98.01%
- Branches: 95.17%
- Functions: 98.90%
- Lines: 98.59%
- `excessFunctionStrategy.ts`: 100% statements／branches／functions／lines

Additional gates:

- `npm run typecheck`: PASS
- Targeted ESLint: PASS
- Targeted Prettier check: PASS
- Scoped `git diff --check`: PASS (repository line-ending warning only)

## Candidate Hashes

```text
E8D48C1DE64F35435965235C764D97F432A503C0C3A42CE77B5303F2D8FC7DDE  src/domain/excessFunctionStrategy.ts
31283AA416F0F26E5906406AE19FE08693E5304BB9216015CC2D4748B5346192  test/unit/domain/excessFunctionStrategy.test.ts
C135F6287A9C0BE83CAEF45FED7849C0BC6833122228E5BC6A4A83A2D4414CD4  test/unit/service/excessCurrencyInvariant.test.ts
```

## Review Gate

- Trade Finance BA: PASS — no new business ambiguity
- Independent 4-Eyes: PASS — initial P2 test-evidence finding resolved by adding `command_idempotency`
- Independent QA: PASS — final hashes and post-change validation confirmed
- Review gate complete; Task 2.3 may be marked complete.
