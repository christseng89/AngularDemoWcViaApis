---
title: "Balance Sufficiency Rules"
type: rule
domain: balance
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["business-rules", "balance"]
source_files:
  - "microservices/balance-component/src/domain/offBalanceExposure.ts"
  - "microservices/balance-component/src/domain/amendDecrease.ts"
  - "microservices/balance-component/src/domain/shgtRedeem.ts"
---

# Balance Sufficiency Rules

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

- A2／B2 Decrease、A3、A8、B3 依各自 domain policy 檢查 Tight Available。
- A3 UTILIZE 同時具有 Available 與 Tight Available 層級。
- B3 新 Present Docs 必須小於或等於父 Confirmation 扣除既有 Present Docs earmark 後的容量。
- SHGT Issue 必須考慮同一父 LC 下既有 SHGT exposure，避免重疊超額。
- Release 會以最新資料再次檢查，不信任 UI picker snapshot。
