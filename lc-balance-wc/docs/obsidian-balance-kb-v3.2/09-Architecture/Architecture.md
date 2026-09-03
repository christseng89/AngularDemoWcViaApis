---
title: "Architecture"
type: architecture
domain: architecture
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["architecture", "solid"]
source_files:
  - "microservices/balance-component/src/service/balanceService.ts"
  - "microservices/balance-component/src/service/unitOfWork.ts"
  - "src/app/transaction-builder/function-strategy.ts"
  - "src/app/transaction-builder/transaction-builder.component.ts"
---

# Architecture

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Boundaries

- Angular strategies／policies：畫面組態、輸入與 orchestration。
- Route layer：HTTP parsing 與 response mapping。
- Service layer：use-case orchestration、transaction boundary。
- Domain layer：純計算與 eligibility policies。
- Store layer：SQLite persistence ports。

本頁只定義分層與依賴方向。物件設計原則的 canonical 說明見 [[OOP OOD SOLID]]；產品擴充與 generic Balance action 的已接受 target architecture 見 [[ADR-001 Generic Balance Action Model]]；個別業務規則一律連結其 canonical rule note，避免複製。
