---
title: "Balance Account Configuration"
type: reference
domain: accounting
status: verified
source_of_truth: source-code
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: ["Balance Account Number Maintenance"]
tags: ["accounting", "configuration", "solid"]
source_files:
  - "microservices/balance-component/config/balance-account-mappings.json"
  - "microservices/balance-component/src/config/balanceAccountTaxonomy.ts"
  - "microservices/balance-component/src/service/balanceAccountMappingService.ts"
  - "microservices/balance-component/src/store/balanceAccountMappingStore.ts"
  - "microservices/balance-component/src/db/migrations.ts"
  - "src/app/balance-account-maintenance/balance-account-maintenance.component.ts"
  - "scripts/generate-runtime-config.mjs"
  - "analysis/balance-component-api.yaml"
---

# Balance Account Configuration

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Canonical hierarchy

`config/balance-account-mappings.json` 是 `Category → Business Type / GL Family → Tenor SL` 的唯一配置來源。Account Number Maintenance 第一層沿用交易頁名稱：

| Category | Category-scoped Tenor SL |
|---|---|
| Import LC | `SIGHT`、`SELLERS_USANCE`、`BUYERS_USANCE` |
| Export Confirmed | `SIGHT`、`USANCE` |

Import Sight 與 Export Sight 是不同 category 的配置身分，所以是 Import 3 + Export 2，共五種，不是全域四值 enum。

| Family key | GL family | Category | Current instrument | Tenor SL routes |
|---|---|---|---|---|
| `IMPORT_LC_BALANCE` | Import LC Balance | IMPORT | `IPLC_LC` | `SIGHT`、`SELLERS_USANCE`、`BUYERS_USANCE` |
| `SHIPPING_GUARANTEE_BALANCE` | Shipping Guarantee Balance | IMPORT | `SHGT` | `SIGHT`、`SELLERS_USANCE`、`BUYERS_USANCE` |
| `IMPORT_ACCEPTANCE_BALANCE` | Import Acceptance Balance | IMPORT | `IPLC_ACCEPTANCE` | `SELLERS_USANCE`、`BUYERS_USANCE` |
| `CONFIRMED_LC_BALANCE` | Confirmed LC Balance | EXPORT | `EPLC_CONFIRMATION` | `SIGHT`、`USANCE` |
| `CONFIRMED_ACCEPTANCE_BALANCE` | Confirmed Acceptance Balance | EXPORT | `EPLC_ACCEPTANCE` | `USANCE` |

## Runtime rules

- Taxonomy provider 在啟動時驗證 duplicate category、family、Tenor、mapping 與錯誤引用。
- Store 啟動時只補配置新增的 mapping，不覆蓋已維護值；配置移除的舊 row 不再列出，但歷史 voucher snapshot 不變。
- DB mapping table 不以固定 `instrument_type`／`risk_class` CHECK 寫死配置域。
- Family PUT 必須包含全部 configured SL 且 version 全部正確；任一衝突會 rollback，不能部分成功。
- Maintenance `Reload` 呼叫專用 POST，立即以 configuration defaults 原子覆寫全部 11 筆 configured mappings；成功後 version 為 1、actor 為 `SYSTEM_CONFIG_RELOAD`，任一失敗全部 rollback。Cleanup Database 保留 mappings。
- Angular 導覽依 API hierarchy generic render；family 明細只在 presentation layer 改為先列 Contingent Liability／Liability GL（含 GL Number／Description 輸入），再於各 GL 下列出配置式 Tenor SL（含 SL Number／Description 輸入）。GL 預設取 Sight mapping 並移除 Sight；SL Number／Description 預設取 configured Tenor key／label。儲存前由 Angular 組合 GL + SL。DB、API mapping row、movement posting 與 voucher 結構均不因這個畫面編輯模型改變。
- 交易 Tenor options 也由同一 JSON 在 build preparation 產生，沒有第二份清單。

## Configuration defaults exported from DB

| Mapping key | Account A Number | Account A Description | Account B Number | Account B Description |
|---|---|---|---|---|
| `IPLC_LC:SIGHT` | Customer Liability for DC — Sight | Customer Liability for DC — Sight | DC Liability — Sight | DC Liability — Sight |
| `IPLC_LC:BUYERS_USANCE` | Customer Liability for DC — Buyer's Usance | Customer Liability for DC — Buyer's Usance | DC Liability — Buyer's Usance | DC Liability — Buyer's Usance |
| `IPLC_LC:SELLERS_USANCE` | Customer Liability for DC — Seller's Usance | Customer Liability for DC — Seller's Usance | DC Liability — Seller's Usance | DC Liability — Seller's Usance |
| `IPLC_ACCEPTANCE:BUYERS_USANCE` | Customer Liability for Acceptance — Buyer's Usance | Customer Liability for Acceptance — Buyer's Usance | Acceptance Liability — Buyer's Usance | Acceptance Liability — Buyer's Usance |
| `IPLC_ACCEPTANCE:SELLERS_USANCE` | Customer Liability for Acceptance — Seller's Usance | Customer Liability for Acceptance — Seller's Usance | Acceptance Liability — Seller's Usance | Acceptance Liability — Seller's Usance |
| `SHGT:SIGHT` | Customer Liability for SG — Sight | Customer Liability for SG — Sight | SG Liability — Sight | SG Liability — Sight |
| `SHGT:BUYERS_USANCE` | Customer Liability for SG — Buyer's Usance | Customer Liability for SG — Buyer's Usance | SG Liability — Buyer's Usance | SG Liability — Buyer's Usance |
| `SHGT:SELLERS_USANCE` | Customer Liability for SG — Seller's Usance | Customer Liability for SG — Seller's Usance | SG Liability — Seller's Usance | SG Liability — Seller's Usance |
| `EPLC_CONFIRMATION:SIGHT` | Customer Liability for Confirmed DC — Sight | Customer Liability for Confirmed DC — Sight | Confirmed DC Liability — Sight | Confirmed DC Liability — Sight |
| `EPLC_CONFIRMATION:USANCE` | Customer Liability for Confirmed DC — Usance | Customer Liability for Confirmed DC — Usance | Confirmed DC Liability — Usance | Confirmed DC Liability — Usance |
| `EPLC_ACCEPTANCE:USANCE` | Customer Liability for Confirmed Acceptance — Usance | Customer Liability for Confirmed Acceptance — Usance | Confirmed Acceptance Liability — Usance | Confirmed Acceptance Liability — Usance |

未來新增 Account Maintenance category 或 business family 只改配置。全新交易 lifecycle／會計 behavior 仍屬產品功能開發，不可假裝由帳號配置自動產生。SBLC/LG 文件目前只作參考，不是已實作規格。

此分層符合 SRP/OCP/DIP：provider 負責配置、store 負責 persistence、service 負責 use case、Angular 負責 presentation；新增配置不修改 consumer source。
