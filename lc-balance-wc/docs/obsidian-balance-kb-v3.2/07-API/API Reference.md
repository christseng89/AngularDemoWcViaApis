---
title: "API Reference"
type: reference
domain: api
status: verified
source_of_truth: source-code
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: []
tags: ["api"]
source_files:
  - "microservices/balance-component/src/routes/balanceContracts.ts"
  - "microservices/balance-component/src/routes/balanceMovements.ts"
  - "microservices/balance-component/src/routes/balanceAccountMappings.ts"
  - "microservices/balance-component/src/routes/deletePendingAudit.ts"
  - "analysis/balance-component-api.yaml"
  - "analysis/balance-component-channel-api.yaml"
---

# API Reference

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

OAS 是 consumer contract；Express route 與 service 是 runtime implementation。

| Method | Path | Implementation |
|---|---|---|
| `GET` | `/balance-contracts` | `microservices/balance-component/src/routes/balanceContracts.ts` |
| `GET` | `/balance-contracts/catalog` | `microservices/balance-component/src/routes/balanceContracts.ts` |
| `GET` | `/balance-contracts/close-eligible` | `microservices/balance-component/src/routes/balanceContracts.ts` |
| `GET` | `/balance-contracts/reopen-eligible` | `microservices/balance-component/src/routes/balanceContracts.ts` |
| `GET` | `/balance-contracts/:balanceContractId` | `microservices/balance-component/src/routes/balanceContracts.ts` |
| `GET` | `/balance-contracts/:balanceContractId/balance` | `microservices/balance-component/src/routes/balanceContracts.ts` |
| `GET` | `/balance-contracts/:balanceContractId/movements` | `microservices/balance-component/src/routes/balanceContracts.ts` |
| `POST` | `/balance-movements` | `microservices/balance-component/src/routes/balanceMovements.ts` |
| `POST` | `/balance-movements/compound` | `microservices/balance-component/src/routes/balanceMovements.ts` |
| `POST` | `/balance-movements/compound-release` | `microservices/balance-component/src/routes/balanceMovements.ts` |
| `POST` | `/balance-movements/compound-actions` | `microservices/balance-component/src/routes/balanceMovements.ts` |
| `POST` | `/balance-movements/:movementId/release` | `microservices/balance-component/src/routes/balanceMovements.ts` |
| `GET` | `/balance-movements/:movementId/balance-as-of` | `microservices/balance-component/src/routes/balanceMovements.ts` |
| `GET` | `/balance-movements` | `microservices/balance-component/src/routes/balanceMovements.ts` |
| `POST` | `/balance-movements/:movementId/reject` | `microservices/balance-component/src/routes/balanceMovements.ts` |
| `POST` | `/balance-movements/:movementId/cancel` | `microservices/balance-component/src/routes/balanceMovements.ts` |
| `POST` | `/balance-movements/:movementId/edit` | `microservices/balance-component/src/routes/balanceMovements.ts` |
| `POST` | `/balance-movements/:movementId/acknowledge` | `microservices/balance-component/src/routes/balanceMovements.ts` |
| `POST` | `/balance-movements/:movementId/maker-submit` | `microservices/balance-component/src/routes/balanceMovements.ts` |
| `POST` | `/balance-movements/:movementId/withdraw-maker-submit` | `microservices/balance-component/src/routes/balanceMovements.ts` |
| `GET` | `/balance-account-mappings` | `microservices/balance-component/src/routes/balanceAccountMappings.ts` |
| `POST` | `/balance-account-mappings/reload-configuration` | `microservices/balance-component/src/routes/balanceAccountMappings.ts` |
| `PUT` | `/balance-account-mappings/families/:familyKey` | `microservices/balance-component/src/routes/balanceAccountMappings.ts` |
| `PUT` | `/balance-account-mappings/:mappingKey` | `microservices/balance-component/src/routes/balanceAccountMappings.ts` |
| `GET` | `/delete-pending-audit/lc-catalog` | `microservices/balance-component/src/routes/deletePendingAudit.ts` |
| `GET` | `/delete-pending-audit` | `microservices/balance-component/src/routes/deletePendingAudit.ts` |

## Error model

Typed domain／validation errors 由 HTTP layer 映射為 4xx；未處理錯誤為 5xx。UI 必須保留 status、code 與 cause，不得全部改寫成 generic error。
