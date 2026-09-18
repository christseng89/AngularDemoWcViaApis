# Angular God Component Phase 0 Characterization Baseline

## Status

- Architecture: `OpenAPI-Driven Vertical Feature Refactoring Architecture`
- Phase: `0 — Characterization Baseline`
- Maker: Codex `/root`
- Independent Checker: `/root/phase0_checker`
- Acceptance verdict: `PASS / CONFIRMED`
- Production refactoring performed: `NO`
- Candidate commit before Phase 0 artifacts: `9befbe7484e8f7accb58e9a7ce3feccae513b8c0`
- Branch: `refactor`
- Project workspace: `C:\Users\samfi\Downloads\outputs\lc-ssi-wc`
- Git top-level: `C:\Users\samfi\Downloads\outputs`
- Git repository prefix: `lc-ssi-wc/`

The Independent Checker validated the source candidate, corrected evidence identities, behavioral boundaries, fresh typecheck/tests/build results, and declaration metrics. The final Git commit containing this report must retain identical reviewed content.

## Angular Scope

| Measure                                            |                               Baseline |
| -------------------------------------------------- | -------------------------------------: |
| Angular applications                               | 2 (`ssi-portal`, `ssi-web-components`) |
| Production TS/HTML/CSS files                       |                                     76 |
| Production lines                                   |                                 20,672 |
| Test files                                         |                                     47 |
| Test lines                                         |                                  8,465 |
| `AppComponent` TypeScript                          |                            4,562 lines |
| `AppComponent` template                            |                            2,378 lines |
| `AppComponent` TypeScript AST method declarations  |                                    138 |
| `AppComponent` TypeScript AST signal properties    |                                    126 |
| `AppComponent` computed declarations               |                                     94 |
| `AppComponent` direct `HttpClient` calls           |                                     36 |
| `SwiftDataCrudComponent` TypeScript                |                            1,481 lines |
| `SwiftDataCrudComponent` template                  |                              595 lines |
| `SwiftDataCrudComponent` direct `HttpClient` calls |                                     16 |

Counts are characterization metrics, not quality gates. Method and signal-property counts use the Independent Checker's TypeScript AST declaration count; computed and direct HTTP counts use source occurrence counts. Line count and direct HTTP boundaries are the primary migration indicators.

## Frozen Behavioral Boundaries

The current root component coordinates these view states: Dashboard, SSI Maker/Maintenance, Checker, Payment Resolution, Treasury, Trade Finance, SWIFT Data, Audit, and Settings.

The refactor must preserve:

- SSI revise selection, server-authoritative WIP reservation, Save Draft transition, and `×`/`Esc` cancellation.
- `canDeactivate()` fail-closed navigation behavior, including nested SWIFT Data WIP cleanup.
- Maker/Checker separation across SSI, RMA, Entity, and Nostro.
- Currency-dependent result invalidation and stale-response rejection.
- Bank Service stable identity selection without exposing companion versions as user input.
- Existing request order, endpoint, payload, loading, empty, error, and audit behavior.
- The distinction between the two controlled parameter patterns below.

## Controlled Parameter Patterns

### Governed Maintenance Pattern

- Contract source: OpenAPI `x-ui-resources`.
- Current consumers: RMA, Entity, Nostro and governed maintenance/checker presentation.
- Responsibilities: Index, Detail, Maintenance, lifecycle actions, Maker/Checker and controlled lookup integration.

### Resolution Page Pattern

- Contract source: `ResolutionPageDefinition` and its index/envelope contracts.
- Current consumers: Payment, Treasury and Trade Finance workbenches.
- Responsibilities: Scenario selection, field dependencies, lookup, resolution execution, evidence and generated output presentation.

The patterns may share UI and HTTP primitives. Their adapters and domain orchestration must remain separate.

## Validation Results

### Angular typecheck

- Command: `npx nx run-many -t typecheck --projects=ssi-portal,ssi-web-components --outputStyle=static`
- Exit code: `0`
- Result: `PASS`
- Evidence was regenerated with `--skip-nx-cache --verbose`; it records both project `tsc --noEmit` commands, Nx success, and `EXIT_CODE=0`.
- Environment note: optional Nx Cloud network access was denied; local typecheck execution completed successfully.

### Angular unit tests

- Command: `npx nx run-many -t test --projects=ssi-portal,ssi-web-components --configuration=ci --outputStyle=static`
- Exit code: `0`
- Result: `PASS`
- `ssi-portal`: 46 suites, 416 tests, all passed; line coverage 85.35%.
- `ssi-web-components`: 1 suite, 2 tests, all passed; line coverage 100%.
- Combined: 47 suites and 418 tests passed.

### Repository standard verify

- Command: `npm run verify`
- Lint: `PASS`
- Full repository typecheck: `PASS` for 8 projects.
- Full repository tests: `PASS` for 8 projects.
- Sandboxed build: `ENVIRONMENT-BLOCKED`; Angular compiler path reads failed with `Access is denied`.
- Approved outside-sandbox `npm run build`: `PASS` for all 5 build projects.
- Composite source baseline: `PASS WITH ENVIRONMENT NOTE`.

## Evidence Identities

| Evidence                                      | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `tmp/angular-refactor-phase-0/typecheck.txt`  | `0FE4209CBE6683699FE6F4EE69D7C58683D44B4F1C9844E82BB596079D3D89BD` |
| `tmp/angular-refactor-phase-0/unit-tests.txt` | `FBF6B52C1121D3DD2A05BB618A1B46A578B244C07B43C81909AD11E96953D2C1` |
| `tmp/angular-refactor-phase-0/npm-verify.txt` | `37F4DB3E3993B2A0B34EFDF0FA673F5DD74419629611959B6BDA98C30E7BEB26` |

The approved outside-sandbox build summary is recorded separately under `tmp/` and is not a substitute for independent rerun evidence.

## Phase 0 Exit Gate

Maker characterization and Independent Checker validation are complete. Phase 0 is `PASS / CONFIRMED`; Phase 1 may begin after the committed report identity is confirmed unchanged.
