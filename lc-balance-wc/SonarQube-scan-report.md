# LC Balance Component — SonarQube Scan Report

## 1. Executive Summary

本報告來自 **Docker SonarQube 的實際掃描結果**，不是人工模擬或 SonarQube-style review。

| 項目 | 結果 |
|---|---:|
| Quality Gate | **PASSED** |
| Bugs | **0** |
| Vulnerabilities | **0** |
| Security Hotspots | **0** |
| Code Smells | **78** |
| Reliability Rating | **A (1.0)** |
| Security Rating | **A (1.0)** |
| Security Review Rating | **A (1.0)** |
| Maintainability Rating | **A (1.0)** |
| Coverage | **97.0%** |
| Line Coverage | **98.1%** |
| Branch Coverage | **95.4%** |
| Duplicated Lines Density | **1.0%** |
| Technical Debt | **616 minutes（10h 16m）** |

整體 Quality Gate 通過，沒有 SonarQube 認定的 Bug、Vulnerability 或待審 Security Hotspot。主要改善空間是可維護性：78 個 Code Smells 中有 25 個 Critical，全部屬於 Cognitive Complexity。

## 2. Scan Evidence

| 項目 | 值 |
|---|---|
| Scan date | 2026-08-30 |
| SonarQube server | 9.9.8.100196 LTS Community |
| Project key | `lc-balance-wc` |
| Project name | LC Balance Component Demo |
| Project version | 1.0 |
| Analysis ID | `AaBShC7vXnVXnIFIy5x0` |
| Compute Engine task | `AaBShCIa8ote_WB9eeqM` |
| Compute Engine status | `SUCCESS` |
| Analysis submitted | 2026-08-30 11:53:06 UTC |
| Compute Engine completed | 2026-08-30 11:53:17 UTC |
| Scanner execution | `EXECUTION SUCCESS` |
| Scanner elapsed time | 6m 33s |
| Indexed files | 242 |
| Analyzed TypeScript files | 188 |
| Analyzed JavaScript files | 7 |
| Analyzed text/secret files | 236 |
| SonarQube dashboard | <http://localhost:9000/dashboard?id=lc-balance-wc> |

### Docker environment

- SonarQube server image: `sonarqube:lts-community`, native `linux/arm64`.
- Scanner image: `sonarsource/sonar-scanner-cli:latest`, `linux/amd64` under ARM64 emulation.
- Source code remained local; analysis was uploaded only to the local Docker SonarQube at `localhost:9000`.

### Scope

The scan used `sonar-project.properties` and covered:

- Angular Balance Component: `src/`
- Business Case Runner backend: `backend/`
- Balance microservice: `microservices/balance-component/src/`
- Co-located Angular tests, backend tests and microservice tests

Generated output and dependencies such as `node_modules`, `dist` and `coverage` were excluded from source analysis. `backend/data/businessCases.js` remained analyzable but was excluded from CPD as an intentionally declarative case registry.

## 3. Test and Coverage Evidence

Coverage files were regenerated immediately before the scan and all three LCOV reports were imported by the SonarQube JavaScript/TypeScript Coverage Sensor.

| Sub-project | Suites | Tests | Test result | Jest coverage summary |
|---|---:|---:|---|---|
| Angular | 51 | 1,625 | PASS | 98.31% statements; 95.58% branches; 98.57% lines |
| Backend | 3 | 57 | PASS | 98.91% statements; 96.05% branches; 100% lines |
| Balance microservice | 39 | 784 | PASS | 98.94% statements; 95.18% branches; 99.43% lines |
| **Total** | **93** | **2,466** | **PASS** | SonarQube combined coverage **97.0%** |

SonarQube coverage denominator differs from each Jest summary because the project-level analysis applies Sonar source/test classification and coverage exclusions across the three sub-projects.

## 4. Quality Gate

Overall status: **OK / PASSED**. Clean-as-you-code status: **compliant**.

| New-code condition | Threshold | Actual | Status |
|---|---:|---:|---|
| Reliability Rating | must be A | A | PASS |
| Security Rating | must be A | A | PASS |
| Maintainability Rating | must be A | A | PASS |
| Coverage | ≥ 80% | 97.0% | PASS |
| Duplicated Lines Density | ≤ 3% | 0.4195% | PASS |
| Security Hotspots Reviewed | 100% | 100% | PASS |

The new-code period is `PREVIOUS_VERSION`, based on 2026-08-15 18:22:45 UTC.

## 5. Project Metrics

| Metric | Result |
|---|---:|
| Lines of Code | 20,595 |
| Files | 141 |
| Classes | 61 |
| Functions | 1,354 |
| Statements | 4,291 |
| Complexity | 3,521 |
| Cognitive Complexity | 2,271 |
| Lines to Cover | 5,240 |
| Uncovered Lines | 102 |
| Conditions to Cover | 3,550 |
| Uncovered Conditions | 162 |
| Duplicated Lines | 286 |
| Duplicated Lines Density | 1.0% |
| Technical Debt | 616 minutes |

## 6. Findings by Severity and Type

All 78 unresolved issues are `CODE_SMELL`. SonarQube reported no Bug or Vulnerability.

| Severity | Count | Main category |
|---|---:|---|
| Blocker | 0 | — |
| Critical | 25 | Cognitive Complexity |
| Major | 23 | Nested ternary / excessive parameters / commented code |
| Minor | 30 | Redundant assertions, union aliases and duplicate imports |
| Info | 0 | — |
| **Total** | **78** | **Code Smells only** |

### Findings by rule

| Rule | Count | Description |
|---|---:|---|
| `typescript:S3776` | 24 | TypeScript Cognitive Complexity above 15 |
| `javascript:S3776` | 1 | JavaScript Cognitive Complexity above 15 |
| `typescript:S3358` | 20 | Nested ternary should be extracted |
| `typescript:S4323` | 14 | Repeated union should use a type alias |
| `typescript:S4325` | 14 | Redundant type assertion |
| `typescript:S3863` | 2 | Duplicate import from the same module |
| `Web:AvoidCommentedOutCodeCheck` | 2 | Commented-out HTML code |
| `typescript:S107` | 1 | Method has too many parameters |

## 7. Critical Findings

All Critical findings are complexity issues. The values below are the actual SonarQube cognitive-complexity values versus the allowed threshold of 15.

| File:line | Actual | Estimated debt |
|---|---:|---:|
| `src/app/transaction-builder/builder-fields.ts:189` | 65 | 55m |
| `src/app/transaction-builder/inquire-events.service.ts:799` | 46 | 36m |
| `microservices/balance-component/src/store/balanceMovementStore.ts:138` | 38 | 28m |
| `microservices/balance-component/src/service/balanceService.ts:562` | 37 | 27m |
| `backend/server.js:125` | 34 | 24m |
| `src/app/transaction-builder/submit-rules.ts:314` | 31 | 21m |
| `microservices/balance-component/src/service/movementReleasePolicyService.ts:25` | 29 | 19m |
| `src/app/transaction-builder/maker-panel.component.ts:1360` | 29 | 19m |
| `src/app/transaction-builder/inquire-events.service.ts:412` | 28 | 18m |
| `src/app/transaction-builder/submit-rules.ts:157` | 28 | 18m |
| `src/app/transaction-builder/maker-panel.component.ts:1075` | 26 | 16m |
| `src/app/transaction-builder/submit-rules.ts:63` | 23 | 13m |
| `microservices/balance-component/src/service/balanceService.ts:911` | 22 | 12m |
| `src/app/transaction-builder/checker-actions.service.ts:234` | 21 | 11m |
| `src/app/transaction-builder/checker-actions.service.ts:274` | 21 | 11m |
| `microservices/balance-component/src/service/balanceService.ts:1014` | 19 | 9m |
| `src/app/transaction-builder/balance-component.model.ts:624` | 19 | 9m |
| `src/app/transaction-builder/submit-rules.ts:388` | 18 | 8m |
| `microservices/balance-component/src/service/balanceService.ts:716` | 17 | 7m |
| `microservices/balance-component/src/service/contractLifecycleEligibilityService.ts:32` | 17 | 7m |
| `microservices/balance-component/src/store/balanceMovementStore.ts:454` | 17 | 7m |
| `src/app/transaction-builder/maker-balance-warning.policy.ts:17` | 17 | 7m |
| `microservices/balance-component/src/service/balanceService.ts:847` | 16 | 6m |
| `src/app/transaction-builder/maker-panel.component.ts:1937` | 16 | 6m |
| `src/app/transaction-builder/submit-rules.ts:241` | 16 | 6m |

## 8. Major and Minor Findings

### Major

- 20 nested ternaries (`typescript:S3358`) across service, store, domain and Angular policy/builder code.
- `balance-component-api.service.ts:331`: `catalog` has 9 parameters; maximum configured value is 7.
- Commented-out HTML at `inquire-delete-pending.component.html:5` and `maker-panel.component.html:762`.

### Minor

- 14 repeated union-type findings (`typescript:S4323`).
- 14 unnecessary type assertions (`typescript:S4325`).
- Duplicate imports in:
  - `microservices/balance-component/src/routes/balanceMovements.ts:5`
  - `microservices/balance-component/src/service/contractLifecycleEligibilityService.ts:6`

## 9. Findings Concentration

| File | Open issues |
|---|---:|
| `src/app/transaction-builder/maker-submit.service.ts` | 11 |
| `src/app/transaction-builder/inquire-events.service.ts` | 8 |
| `src/app/transaction-builder/submit-rules.ts` | 7 |
| `src/app/transaction-builder/builder-fields.ts` | 6 |
| `microservices/balance-component/src/service/balanceService.ts` | 6 |
| `src/app/transaction-builder/balance-component.model.ts` | 6 |
| `microservices/balance-component/src/store/balanceMovementStore.ts` | 4 |
| `maker-panel.component.ts` | 3 |
| `checker-actions.service.ts` | 3 |
| `transaction-builder.component.ts` | 3 |

### Sub-project summary

| Scope | Coverage | Code Smells | Duplication | Technical debt |
|---|---:|---:|---:|---:|
| Angular `src/` | 97.2% | 58 | 0.1% | 428m |
| Backend | 97.6% | 1 | 0.0% | 24m |
| Balance microservice | 96.6% | 19 | 3.4% | 164m |

The microservice's 3.4% directory-level duplication is concentrated in `src/db` (22.2%). The project-wide duplication remains 1.0%, and new-code duplication is 0.4195%, so the Quality Gate passes.

## 10. Recommended Remediation Priority

### P1 — Highest-complexity methods

Refactor the highest S3776 findings first:

1. `builder-fields.ts:189` — replace nested function/field branching with declarative field policies and small builders.
2. `inquire-events.service.ts:799` — separate event classification, projection and balance selection strategies.
3. `balanceMovementStore.ts:138` — extract row mapping and optional-column groups; keep repository orchestration linear.
4. `balanceService.ts:562` — continue façade decomposition by moving the remaining command policy into focused collaborators.
5. `backend/server.js:125` — extract Business Case step handlers and error translation from the route/controller.

### P2 — Remaining complexity cluster

- Refactor the other 20 S3776 issues with guard clauses, policy maps, strategy objects and focused pure functions.
- Prioritize `submit-rules.ts`, `maker-panel.component.ts`, `checker-actions.service.ts` and `movementReleasePolicyService.ts` because they affect transaction workflow maintainability.

### P3 — Mechanical cleanup

- Replace 20 nested ternaries with named local variables or policy functions.
- Introduce parameter objects for `catalog` rather than adding more positional parameters.
- Remove two commented HTML blocks.
- Consolidate two duplicate imports.
- Replace repeated unions with named aliases and remove redundant assertions.

All refactoring should preserve the current 2,466-test regression baseline and rerun SonarQube to verify that complexity is reduced without increasing duplication or reducing coverage.

## 11. Security and Reliability Assessment

- Bugs: **0**
- Vulnerabilities: **0**
- Security Hotspots requiring review: **0**
- Reliability Rating: **A**
- Security Rating: **A**
- Security Review Rating: **A**

This means the configured SonarQube Community quality profiles did not identify security or reliability issues in this scan. It does not replace dependency vulnerability scanning, runtime penetration testing or manual threat modelling.

## 12. Scanner Warnings and Limitations

The Compute Engine recorded three analysis warnings:

1. SCM provider was not detected inside the scanner container; issue author/blame data is therefore unavailable.
2. Scanner-bundled Node.js 22 is not the version recommended by this SonarQube 9.9 JavaScript analyzer (recommended 16 or 18).
3. Password authentication is deprecated for scanner use; a local project token should replace `sonar.login` + `sonar.password` on future runs.

The scan itself completed successfully despite these warnings. The SonarQube server uses the embedded H2 database, which SonarQube documents as evaluation-only; persistent team use should use a supported external database.

## 13. Reproduction Commands

Coverage generation:

```powershell
npm run test:coverage
npm run test:coverage --prefix backend
npm run test:coverage --prefix microservices/balance-component
```

Docker scanner pattern used for this analysis:

```powershell
docker run --rm --name lc-balance-sonar-scanner `
  -e SONAR_HOST_URL=http://host.docker.internal:9000 `
  -v "C:\Users\samfi\Downloads\outputs\lc-balance:/usr/src" `
  -w /usr/src `
  sonarsource/sonar-scanner-cli:latest `
  "-Dsonar.projectBaseDir=/usr/src" `
  "-Dsonar.login=<local-user-or-token>"
```

Do not commit a SonarQube password or token to source control.
