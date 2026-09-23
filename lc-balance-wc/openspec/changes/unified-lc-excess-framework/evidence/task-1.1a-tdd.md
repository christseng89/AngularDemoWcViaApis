# Task 1.1a TDD Evidence — PBD Authorization Policy

## Scope and candidate identity

- Branch: `OVERDRAWN`
- Working-tree base HEAD: `fdbe5f25689d077bec5e602248ad8f56333b477c`
- Requirement: PBD fallback requires explicit, effective-dated authorization and exact `fallbackPolicyId`／`fallbackPolicyVersion`; missing／false／out-of-period authorization fails closed.
- Candidate file SHA-256:
  - `src/config/excessPolicyConfig.ts`: `9F855E189BE0E20C6690C82B099ABE6117338868F4238C24FADA96CE6D425278`
  - `test/unit/config/excessPolicyConfig.test.ts`: `183FC9A372223E4612AE40F70ADBB5079EF6AD05BF4DE37E3D622EC6B87D1AD9`
  - `config/excess-policy.non-production.json`: `9BC402E68A2BECD19631A359C3E992F9BD6114919AF598AE549E354D563816DD`

These hashes identify the uncommitted candidate reviewed in this evidence. Final release evidence must bind a clean exact commit under task 8.4b.

## RED

Tests were added before the resolver／schema implementation. From `microservices/balance-component`:

```text
npm test -- test/unit/config/excessPolicyConfig.test.ts --runInBand
```

Expected RED result:

```text
FAIL test/unit/config/excessPolicyConfig.test.ts
TS2305: Module '../../../src/config/excessPolicyConfig' has no exported member
'resolvePbdFallbackAuthorization'.
Test Suites: 1 failed, 1 total
Tests: 0 total
```

## GREEN and QA hardening

The minimal implementation added a mandatory discriminated policy, immutable nested config and a half-open resolver. QA then required direct inclusive-start and open-ended assertions; both were added without changing the contract.

Final focused evidence is included in the combined run:

```text
npm test -- test/unit/db/cleanupScripts.test.ts test/unit/db/migration28V4CureRemoval.test.ts test/unit/db/excessSchema.test.ts test/unit/store/excessStores.test.ts test/unit/config/excessPolicyConfig.test.ts --runInBand --coverage=false
Test Suites: 5 passed, 5 total
Tests: 37 passed, 37 total
```

The config file contributes 23 passing tests, covering missing, explicit false, authorized identity, before-start, exact inclusive start, exact exclusive end, open-ended future authorization, invalid interval and invalid decision time.

Validation:

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
Statements: 98.06%
Branches: 95.24%
Functions: 98.88%
Lines: 98.57%
```

`git diff --check` for the slice completed with no whitespace error; line-ending notices are informational.

