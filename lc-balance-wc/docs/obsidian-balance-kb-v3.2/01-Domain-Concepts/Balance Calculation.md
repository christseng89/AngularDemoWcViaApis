---
title: "Balance Calculation"
type: concept
domain: balance
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["balance"]
source_files:
  - "microservices/balance-component/src/domain/balanceDerivation.ts"
  - "microservices/balance-component/src/domain/offBalanceExposure.ts"
  - "microservices/balance-component/src/service/balanceSnapshotService.ts"
---

# Balance Calculation

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## 核心數值

- Confirmed Balance：只計入已 RELEASED 的 movement。
- Available Balance：包含目前可見的 pending 方向效果。
- Pending Decrease Total：仍未核准的減項，採「增加從嚴」。
- Off-Balance Exposure：SHGT 等子項對父 LC 的容量占用。
- Tight Available Balance：Confirmed 基礎扣除 pending decrease 與適用 exposure／earmark。

所有金額使用 decimal string 與 `decimal.js`，不得用 JavaScript binary floating point。
