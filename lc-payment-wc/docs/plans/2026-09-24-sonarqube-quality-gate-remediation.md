# SonarQube Quality Gate Remediation Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the local `lc-payment-wc` SonarQube Project Quality Gate pass without weakening the server-side gate or changing demo business behavior.

**Architecture:** Keep the existing Angular, Express, and TypeScript microservice boundaries. Fix security, correctness, and accessibility findings in production code; make mechanical maintainability improvements where low risk; and document narrow coverage/CPD exclusions for bootstrap files and thin custom-element wrappers that contain no independently testable business logic.

**Tech Stack:** Angular 17, TypeScript, JavaScript, Express, Jest, SonarQube Community Build 26.9.

---

## Understanding summary

- The repository is a demo prototype, so remediation should stay simple and avoid architectural expansion.
- The local SonarQube project is `lc-payment-wc` and uses the default `Project Quality Gate`.
- The baseline gate fails on coverage, duplication, high/medium/security issues, and maintainability issue count.
- Existing external behavior, request/response contracts, and calculation rules must remain stable.
- Existing UI, backend, and microservice tests must remain green.
- Local quality controls remain mandatory: focused tests, type checks, builds, dependency audits, and a fresh Sonar scan.
- The server-side Quality Gate will not be weakened and findings will not be blanket-suppressed.

## Assumptions

- Thin custom-element wrapper classes and application bootstrap files contain wiring rather than business logic.
- `backend/server.js` is a demo integration adapter already exercised by API tests; it remains fully analyzed for issues, but may be excluded from coverage accounting to avoid writing low-value line-chasing tests.
- Deliberately repetitive declarative registries, DTO/type declarations, and wrapper elements may be excluded from copy/paste detection while remaining analyzed by all other rules.
- No production deployment or remote publication is required.

## Approaches considered

1. **Targeted remediation with narrow metric exclusions (selected):** fix real issues and exclude only demo wiring/declarative repetition from coverage or CPD. Lowest delivery risk while retaining meaningful controls.
2. Full test expansion and structural deduplication: add tests for every wrapper and redesign registries/types. Stronger theoretical metrics, but disproportionate cost and regression risk for a demo.
3. Weaken the Quality Gate or broadly suppress rules: fastest, but rejected because it removes the requested quality controls.

## Decision log

- Selected approach 1 after the Product Owner clarified that this is a demo prototype and requested the easiest path with quality controls.
- Security vulnerabilities, correctness bugs, accessibility defects, and high-impact complexity findings must be fixed in code.
- Metric exclusions must be explicit, minimal, and committed in `sonar-project.properties`.
- Acceptance requires a fresh local Sonar analysis showing `OK`, not merely passing local tests.

## Acceptance criteria

- [x] Local SonarQube Quality Gate status is `OK` for `lc-payment-wc`.
- [x] Security issues are zero.
- [x] High- and medium-impact gate conditions pass.
- [x] Coverage is at least 92% and duplication is at most 3%.
- [x] UI, backend, and microservice tests pass.
- [x] Angular and microservice TypeScript checks/builds pass.
- [ ] High-severity dependency audits contain no newly introduced issue. The public-registry request was blocked because it discloses dependency metadata; explicit Product Owner approval is required before running it.

## Acceptance evidence

- Sonar analysis `4a719352-5fb5-4591-922a-6c03bf09433a`, version `1.0.0-payment-Sonar-accepted`: Quality Gate `OK`.
- Sonar metrics: coverage 98.8%, line coverage 99.8%, branch coverage 96.8%, duplication 0.0%, bugs 0, vulnerabilities 0, security hotspots 0, maintainability issues 6.
- UI Jest: 354/354 passed; microservice Jest: 262/262 passed; backend Jest: 48/48 passed.
- Angular production build passed; microservice TypeScript build and both TypeScript no-emit checks passed.

### Task 1: Establish reproducible Sonar configuration

**Files:**
- Create: `sonar-project.properties`

1. Add the project key, source/test paths, LCOV paths, TypeScript configs, and Quality Gate wait setting.
2. Add narrow coverage exclusions for bootstrap, thin web-component wrappers, and the demo Express adapter.
3. Add narrow CPD exclusions for declarative registries, DTO/type declarations, and thin wrappers.
4. Run the TypeScript checks to ensure configuration changes do not affect compilation.

### Task 2: Fix security and correctness findings

**Files:**
- Modify: `backend/server.js`
- Modify: `microservices/payment-component/src/domain/confirmPaymentInstruction.ts`
- Modify: `src/app/payment-component/response-viewer.component.ts`
- Test: existing backend, microservice, and UI Jest suites

1. Disable Express identity disclosure and constrain demo CORS behavior.
2. Remove invariant or impossible conditions identified by Sonar.
3. Use deterministic locale-based comparison for string sorting.
4. Run the affected tests and type checks.

### Task 3: Fix accessibility findings

**Files:**
- Modify: `src/app/payment-component/leg-allocator.component.html`
- Modify: `src/app/payment-component/suspense-entries.component.html`
- Modify: `src/app/payment-component/response-viewer.component.html`
- Modify: affected component styles

1. Associate every reported input with a stable label/id contract.
2. Add `scope` to reported table headers.
3. Adjust reported foreground/background color combinations.
4. Run affected component tests and the Angular build.

### Task 4: Remove high/medium maintainability findings

**Files:**
- Modify: Sonar-reported Angular, backend, and microservice source files.

1. Remove empty lifecycle hooks, nested ternaries, repeated pushes, redundant aliases, and mutable declarations reported by Sonar.
2. Split reported high-complexity functions into named helpers without changing behavior.
3. Replace reported Node imports, collections, and optional/defaulting idioms.
4. Run focused tests and type checks after each coherent batch.

### Task 5: Full verification and Quality Gate loop

**Files:**
- Update only files required by residual actionable Sonar findings.

1. Run all three test suites with coverage.
2. Run Angular and microservice builds/type checks.
3. Run high-severity dependency audits.
4. Run the local SonarQube scan and retrieve detailed gate conditions.
5. If the gate fails, perform one residual-finding repair round and rerun all affected checks.
6. Stop after two complete Sonar rounds if external configuration or a disproportionate redesign is required.
