# OOP / OOD / SOLID Architecture Audit

Date: 2026-09-03  
Scope: Angular application, Business Case backend, and Balance Component microservice in the current source tree.

## Outcome

The codebase applies OOP/OOD/SOLID well in its domain policies, registries, API adapters, stores, and extracted workflow services, but it is not yet uniformly SOLID. The correct remediation is incremental extraction protected by the existing unit and browser suites, not a whole-system rewrite.

## Strengths

- The Function Strategy Registry is the single extensibility point for A1–A11 and B1–B7 behavior. This supports Open/Closed and avoids scattered function-code branches.
- Pure policies (`maker-action-bar`, submit rules, eligibility, warnings, protected identity) separate decisions from Angular rendering and are independently testable.
- The microservice separates route, service, domain, store, database, and unit-of-work concerns.
- Focused Angular services own checker actions, picker selection, Maker Queue, inquiries, and API communication.
- API contracts and adapters isolate transport details from the UI.
- Automated coverage is high enough to support safe extraction: 97.99% statements and 95.10% branches at this audit.

## Remaining architecture debt

### P1 — MakerPanelComponent has too many responsibilities

`maker-panel.component.ts` still coordinates form construction, selection, snapshots, compound legs, submit, Fix Pending, Delete Pending, and presentation state. Continue extracting one cohesive workflow at a time behind pure policies or per-component services. Do not duplicate Function Strategy rules in new services.

### P1 — BalanceService is a large compatibility facade

`balanceService.ts` correctly delegates many operations, but still acts as composition root, compatibility facade, and domain orchestrator. Move construction to an explicit composition root and continue delegating lifecycle-specific commands. Keep the facade temporarily so routes and external callers remain stable.

### P2 — Component construction and test construction differ

Some Angular dependencies are provided by component factories while many unit tests instantiate components directly. Introduce shared test builders and injection-token factories before tightening constructor injection; otherwise a mechanical DI conversion would create widespread test churn without improving runtime behavior.

### P2 — Type-safety lint debt

Lint currently reports no errors but 337 warnings, mainly explicit `any` in tests and dynamic Formly expressions. Replace these gradually with typed fixtures and narrow Formly field models; do not suppress the rule globally.

## Guardrails for future refactoring

1. Keep the Function Strategy Registry as the only per-function behavior registry.
2. Extract behavior before moving markup; each extraction must have policy/service tests first.
3. Preserve the `BalanceService` public facade until routes, OAS, and consumers migrate together.
4. After each slice, require all unit tests, branch coverage at least 90%, and the live Chrome suite.
5. The live Chrome suite must run all registered Business Cases and open every registered A/B transaction workspace.

## Verification baseline

- Angular/Jest: 70 suites, 2,024 tests passed.
- Coverage: 97.99% statements, 95.10% branches, 96.50% functions, 98.52% lines.
- Chrome: 37 Business Cases completed; all 18 registered transaction workspaces opened.
- Live workflow: A4 Maker Submit → Maker Queue → Fix Pending → Save Fix Pending passed.
- Lint: 0 errors (337 pre-existing warnings).
- Web Component and adapter TypeScript checks passed.
