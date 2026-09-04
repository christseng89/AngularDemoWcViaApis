---
title: "Movement Lifecycle"
type: concept
domain: movement
status: verified
source_of_truth: source-code
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: []
tags: ["lifecycle"]
source_files:
  - "microservices/balance-component/src/domain/statusTransition.ts"
  - "microservices/balance-component/src/service/movementReleasePolicyService.ts"
  - "microservices/balance-component/src/service/movementReleaseSideEffectService.ts"
---

# Movement Lifecycle

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

一般 movement 經過 `PENDING → RELEASED` 或 `PENDING → REJECTED/CANCELLED`。Maker 與 Checker 必須不同。A3／A3S／B3 是 earmark 顯示類型，UI 顯示 `EARMARKING → EARMARKED`；底層 movement status 仍由 source code 的 lifecycle 決定。Release 前會重新驗證 eligibility、stale basis 與最新餘額。
