---
title: "Test Coverage and Business Cases"
type: test-reference
domain: testing
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["testing"]
source_files:
  - "backend/data/businessCases.js"
  - "microservices/balance-component/test"
  - "src/app/transaction-builder"
---

# Test Coverage and Business Cases

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Required gate

Angular、Balance microservice 與 Business Case backend 三個 Jest config 都要求 statements、branches、functions、lines **各自 ≥95%**。Coverage 必須由實際 command 通過，不得以測試數或文件覆蓋率替代。

| Suite | Command | Threshold source |
|---|---|---|
| Angular | `npm run test:coverage -- --runInBand` | `jest.config.js` |
| Microservice | `npm run test:coverage --prefix microservices/balance-component -- --runInBand` | `microservices/balance-component/jest.config.js` |
| Business Case backend | `npm run test:coverage --prefix backend -- --runInBand` | `backend/jest.config.js` |

## Business Cases

| Case | Side | Source |
|---|---|---|
| `import-case-1` | Import | `backend/data/businessCases.js` |
| `import-case-2` | Import | `backend/data/businessCases.js` |
| `import-case-3` | Import | `backend/data/businessCases.js` |
| `import-case-4` | Import | `backend/data/businessCases.js` |
| `import-case-5` | Import | `backend/data/businessCases.js` |
| `import-case-6` | Import | `backend/data/businessCases.js` |
| `import-case-7` | Import | `backend/data/businessCases.js` |
| `import-case-8` | Import | `backend/data/businessCases.js` |
| `import-case-9` | Import | `backend/data/businessCases.js` |
| `import-case-10` | Import | `backend/data/businessCases.js` |
| `import-case-11` | Import | `backend/data/businessCases.js` |
| `import-case-12` | Import | `backend/data/businessCases.js` |
| `import-case-13` | Import | `backend/data/businessCases.js` |
| `import-case-14` | Import | `backend/data/businessCases.js` |
| `import-case-15` | Import | `backend/data/businessCases.js` |
| `export-case-1` | Export | `backend/data/businessCases.js` |
| `export-case-2` | Export | `backend/data/businessCases.js` |
| `export-case-3` | Export | `backend/data/businessCases.js` |
| `export-case-4` | Export | `backend/data/businessCases.js` |
| `export-case-5` | Export | `backend/data/businessCases.js` |
| `export-case-6` | Export | `backend/data/businessCases.js` |
| `export-case-7` | Export | `backend/data/businessCases.js` |
| `export-case-8` | Export | `backend/data/businessCases.js` |
| `export-case-9` | Export | `backend/data/businessCases.js` |
| `export-case-10` | Export | `backend/data/businessCases.js` |
| `export-case-11` | Export | `backend/data/businessCases.js` |
| `export-case-12` | Export | `backend/data/businessCases.js` |
| `export-case-13` | Export | `backend/data/businessCases.js` |
| `export-case-14` | Export | `backend/data/businessCases.js` |
| `import-case-16` | Import | `backend/data/businessCases.js` |
| `export-case-15` | Export | `backend/data/businessCases.js` |

## Test layers

- Domain unit tests：money、tolerance、balance、exposure、eligibility。
- Service／HTTP tests：create、edit、release、reject、compound、snapshots。
- Angular tests：field policies、submit rules、Maker／Checker actions、inquiry。
- Browser acceptance：只作真實整合驗證，不取代 automated tests。

實測百分比屬 build artifact，應讀取 coverage summary／CI，不把易失數字硬編碼為長期事實。
