---
title: "Eligibility and Lifecycle Rules"
type: rule
domain: eligibility
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["business-rules", "eligibility"]
source_files:
  - "microservices/balance-component/src/service/contractLifecycleEligibilityService.ts"
  - "microservices/balance-component/src/domain/closeEligibility.ts"
  - "microservices/balance-component/src/domain/expiryEligibility.ts"
---

# Eligibility and Lifecycle Rules

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

Root Issue 必須 RELEASED 後，下游 movement 才可建立。Catalog／picker 只提供提示；create、Maker action 與 Checker Release 都會重新驗證。Close／Reopen／Expiry Date Extension 使用各自狀態限定的 resolver，不得作為一般 ACTIVE lookup fallback。
