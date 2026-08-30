# Balance Component Service Architecture

`BalanceService` is the compatibility façade used by HTTP routes. Business behavior is composed from focused collaborators:

| Responsibility                                | Owner                                 |
| --------------------------------------------- | ------------------------------------- |
| Request field validation                      | `MovementRequestValidator`            |
| Contract resolution and creation              | `MovementContractService`             |
| Read models, catalogs and audit queries       | `BalanceQueryService`                 |
| Balance projection                            | `BalanceSnapshotService`              |
| Command-time root/sibling snapshot bundles    | `MovementSnapshotService`             |
| Close, Expire and Reopen eligibility          | `ContractLifecycleEligibilityService` |
| Release-time guards and frozen-balance checks | `MovementReleasePolicyService`        |
| Release consequences and Expiry Extension     | `MovementReleaseSideEffectService`    |
| Auto Expiry and Auto Close scheduling logic   | `LifecycleSweepService`               |
| SQLite transaction boundary                   | `UnitOfWork` / `BalanceService`       |

## Extension rule

Add a new movement type through the movement strategy registries and the smallest applicable policy service. Do not add route-specific branches to query, snapshot or lifecycle collaborators.

## Compatibility boundary

Routes continue to call `BalanceService`. Collaborators must not change route response shapes, error messages, validation order, SQLite schema or movement lifecycle semantics unless the corresponding external contract is intentionally revised.
