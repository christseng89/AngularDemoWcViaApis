---
title: "Source Map"
type: source-map
domain: documentation
status: verified
source_of_truth: source-code
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: []
tags: ["source-map"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "src/app/transaction-builder/transaction-builder.component.ts"
  - "microservices/balance-component/src/app.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
  - "microservices/balance-component/src/types.ts"
  - "microservices/balance-component/src/domain/balanceDerivation.ts"
  - "microservices/balance-component/src/domain/offBalanceExposure.ts"
  - "microservices/balance-component/src/domain/contingentAccountEntry.ts"
  - "microservices/balance-component/src/db/schema.ts"
  - "backend/data/businessCases.js"
  - "analysis/balance-component-api.yaml"
  - "analysis/balance-component-channel-api.yaml"
  - ".env"
  - "scripts/generate-runtime-config.mjs"
  - "microservices/balance-component/config/balance-account-mappings.json"
  - "microservices/business-days-mock/data/calendar.json"
  - "proxy.conf.json"
  - "src/app/web-component/balance-component-element.contract.ts"
---

# Source Map

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

完整逐 module／export inventory 見 [[Production Source Inventory]]。

| Area | Source |
|---|---|
| Angular function catalog | `src/app/transaction-builder/balance-component.model.ts` |
| Angular field policies | `src/app/transaction-builder/builder-fields.ts` |
| Angular orchestration | `src/app/transaction-builder/transaction-builder.component.ts` |
| HTTP application | `microservices/balance-component/src/app.ts` |
| Core service facade | `microservices/balance-component/src/service/balanceService.ts` |
| Domain types | `microservices/balance-component/src/types.ts` |
| Balance math | `microservices/balance-component/src/domain/balanceDerivation.ts` |
| Exposure math | `microservices/balance-component/src/domain/offBalanceExposure.ts` |
| Internal vouchers | `microservices/balance-component/src/domain/contingentAccountEntry.ts` |
| Database | `microservices/balance-component/src/db/schema.ts` |
| Business cases | `backend/data/businessCases.js` |
| Microservice OAS | `analysis/balance-component-api.yaml` |
| Channel OAS | `analysis/balance-component-channel-api.yaml` |
| Runtime and deployment configuration | `.env` |
| Generated runtime configuration | `scripts/generate-runtime-config.mjs` |
| Account mapping taxonomy | `microservices/balance-component/config/balance-account-mappings.json` |
| Domestic calendar fixture | `microservices/business-days-mock/data/calendar.json` |
| Development proxy | `proxy.conf.json` |
| Web Component runtime contract | `src/app/web-component/balance-component-element.contract.ts` |

Generated at revision `1865d80`. Working-tree changes are included because generation reads files directly from disk.
