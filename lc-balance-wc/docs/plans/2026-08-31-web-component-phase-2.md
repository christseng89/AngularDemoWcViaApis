# Balance Component Web Component Phase 2 Implementation Record

**Goal:** Complete the framework-neutral data and event contract required for React, Vue and other hosts to reuse the existing Angular Balance UI.

**Scope:** Angular/Web Component boundary only. Backend, orchestrator, microservice, OAS, authentication, API paths and Balance business rules are unchanged.

## Confirmed contract

- Preserve the versioned `config` DOM property and existing relative HTTP paths.
- Add `navigate(view): Promise<void>` and `refresh(): Promise<void>` to `<balance-component-app>`.
- Keep both feature views lazy-loaded; refresh recreates the current Angular view without re-downloading its bundle.
- Emit `balance-ready`, `balance-navigation`, `balance-refresh` and `balance-error` Custom Events.
- Reject failed public method promises and emit `balance-error` without replacing the last usable view.
- Support multiple elements on one host page with isolated mutable view state and events.
- Do not add an authentication contract in this phase.

## Validation

- Contract, component, registration/bootstrap and multi-instance tests.
- Full Angular Jest suite and coverage gate.
- Application and Web Component typechecks, lint and scoped formatting.
- High-severity npm audit and both production builds.
- Static verification that the Web Component entry does not install Router providers.
- Review both OAS files and leave them unchanged because the HTTP contract is unaffected.
