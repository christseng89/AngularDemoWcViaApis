---
title: "Maker Checker Lifecycle"
type: concept
domain: maker-checker
status: verified
source_of_truth: source-code
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: []
tags: ["maker-checker"]
source_files:
  - "microservices/balance-component/src/domain/statusTransition.ts"
  - "microservices/balance-component/src/service/movementReleasePolicyService.ts"
  - "src/app/transaction-builder/checker-actions.service.ts"
---

# Maker Checker Lifecycle

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

Maker 建立或修正 pending movement；Checker Release／Reject 前重新讀取並驗證。Maker 與 Checker identity 不得相同。Fix Pending 只修改允許修正的欄位，reference、currency 與受保護金額依 function policy 鎖定。Delete Pending 只處理尚未完成的 movement，並留下 audit。

Account Entries review 顯示 movement 已持久化的 voucher，不在 UI 重新計算。
