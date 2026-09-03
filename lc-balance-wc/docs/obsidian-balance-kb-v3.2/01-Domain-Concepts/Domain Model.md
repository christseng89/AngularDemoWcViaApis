---
title: "Domain Model"
type: concept
domain: domain
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["domain"]
source_files:
  - "microservices/balance-component/src/types.ts"
  - "microservices/balance-component/src/domain/balanceDerivation.ts"
---

# Domain Model

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## 核心聚合

- `BalanceContract`：Logical Contract 的目前版本與生命週期。
- `BalanceMovement`：append-oriented 業務事件、Maker／Checker 狀態與 immutable snapshots。
- `BalanceSnapshot`：Confirmed、Available、Pending、Off-Balance 與 Tight Available 的查詢結果。

## Enumerations

- Instrument Types：`IPLC_LC`、`EPLC_LC`、`IPLC_ACCEPTANCE`、`EPLC_ACCEPTANCE`、`SHGT`、`EPLC_CONFIRMATION`、`EPLC_DUE_FROM_ISSUING_BANK`、`EPLC_ACCEPTANCE_REIMB_RECEIVABLE`、`EPLC_EXPORT_BILLS_DISCOUNTED`、`EPLC_EXAMINATION`
- Movement Statuses：`PENDING`、`RELEASED`、`REJECTED`、`CANCELLED`
- Exposure Natures：`CONTINGENT`、`ACTUAL`、`MEMO`
- Tenor Types：`SIGHT`、`BUYERS_USANCE`、`SELLERS_USANCE`、`DP`、`DA`

參見 [[Balance Calculation]] 與 [[Movement Lifecycle]]。
