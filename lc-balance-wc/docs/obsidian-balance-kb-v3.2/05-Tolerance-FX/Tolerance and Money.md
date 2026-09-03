---
title: "Tolerance and Money"
type: concept
domain: money
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["tolerance", "money"]
source_files:
  - "microservices/balance-component/src/domain/tolerance.ts"
  - "microservices/balance-component/src/money.ts"
  - "src/app/transaction-builder/amount-shorthand.ts"
  - "src/app/transaction-builder/formatted-amount-field.component.ts"
---

# Tolerance and Money

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

Tolerance 只對適用的 LC／Confirmation movement 生效。Issue 使用最終 tolerance；Amendment request 使用整數 `toleranceChangePct` 與方向，resulting tolerance 由 API 計算並在 Release 後成為 contract 值。結果不得低於 0。Expiry Date Amendment 不接受 tolerance。

金額以 currency minor units 驗證並使用 ROUND_HALF_UP。Angular amount input 支援目前 parser 定義的 `m/k/h` shorthand；API wire value 始終是 decimal string。
