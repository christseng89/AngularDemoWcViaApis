# SSI Prototype Demo Implementation Plan

**Date:** 2026-09-07
**Baseline:** Gate G0 package v1.0-rc.4 and SSI Prototype Demo FSD included by that package

## Goal

Deliver an executable end-to-end SSI prototype using an Nx monorepo, Angular/Formly Web Components, NestJS BFF and backend services, SQLite persistence, and JSON mock reference APIs. Pseudo MT/MX imports contain only SSI-related fields and are not represented as network-valid SWIFT messages.

## Acceptance slices

1. Workspace and quality gates
   - Nx workspace, strict TypeScript, ESLint, Jest/Vitest, Playwright, SonarQube and coverage thresholds >=95%.
2. Domain and application core
   - SSI aggregate, versions, Maker/Checker separation, activation, resolution, transaction-only candidates, audit and idempotency.
3. Parameter engine
   - Versioned JSON-schema-validated page, validation, severity, classification and MT/MX mapping catalogues.
4. Persistence and integration
   - SQLite repositories, transactional outbox/inbox, HTTP ports, JSON mock APIs.
5. SSI backend and BFF
   - OpenAPI endpoints for import, Maker, Checker, lookup, resolution, tag extraction/generation and audit.
6. Angular portal and Web Components
   - Dashboard, import, Maker, Checker, search/history, resolver, tag laboratory, parameters and audit views.
7. Samples
   - Non-duplicate MT3xx, MT4xx, MT7xx, pacs.008, pacs.009 and pacs.009 COV SSI examples.
8. Verification
   - Unit, integration, contract, component and E2E tests; lint, typecheck, build, dependency audit and SonarQube configuration.

## Architecture rules

- Domain libraries do not import NestJS, Angular, SQLite or HTTP packages.
- Application use cases depend on ports; adapters implement ports.
- UI and Web Components call only the BFF.
- BFF never accesses SQLite directly.
- Mock services are GET-only and return deterministic JSON fixtures.
- Mapping is keyed by standards release, message type, direction, business function, field/element, option and qualifier.
- Parameter expressions use an allow-listed declarative DSL; arbitrary JavaScript evaluation is prohibited.
- Maker cannot approve their own SSI change.
- Full SWIFT message validation, FIN transport, RMA and production AML integration are explicitly out of scope.

## Test-first sequence

1. Write domain acceptance tests for lifecycle and four-eyes controls.
2. Implement domain entities and policies.
3. Write parameter/mapping tests, including ambiguous same-tag semantics.
4. Implement declarative parameter and SSI mapping engines.
5. Write repository and API contract tests.
6. Implement SQLite adapters, backend endpoints, BFF orchestration and mocks.
7. Write Angular component and Web Component tests.
8. Implement the portal and elements.
9. Add E2E journeys and negative-path fixtures.
10. Run all quality gates and publish verification evidence.

## Verification commands

```bash
npm ci
npx nx run-many -t lint,typecheck,test,build
npx nx run-many -t test --configuration=ci
npx nx e2e ssi-portal-e2e
npm audit --audit-level=high
```

## Decision log

| Decision | Outcome | Reason |
|---|---|---|
| UI stack | Angular + Formly | Parameter-driven enterprise forms |
| Embedding | Angular Elements | Standards-based Web Components |
| Workspace | Nx monorepo | Enforced boundaries and shared contracts |
| Node services | NestJS | OOP/SOLID modules and dependency injection |
| Prototype database | SQLite | Self-contained local demo |
| External dependencies | GET-only JSON mock APIs | Deterministic and offline-capable demo |
| Message input | Pseudo MT/MX SSI fields only | Avoid false claim of complete SWIFT parsing |
| Event integration | SQLite outbox/inbox worker | Demonstrate reliable pattern without Kafka |
