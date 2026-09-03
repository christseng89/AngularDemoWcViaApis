---
title: "System Overview"
type: overview
domain: architecture
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["architecture"]
source_files:
  - "src/app/app.routes.ts"
  - "src/app/transaction-builder/transaction-builder.component.ts"
  - "backend/server.js"
  - "microservices/balance-component/src/app.ts"
---

# System Overview

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

Balance Component 由 Angular／Web Component UI、Business Case backend orchestration 與 Balance Component microservice 組成。

```mermaid
flowchart LR
  UI[Angular Transaction Builder] --> API[Balance Component HTTP API]
  RUNNER[Business Case Runner] --> API
  API --> SVC[BalanceService and domain policies]
  SVC --> DB[(SQLite)]
```

UI 提供 Balance Account Number、Transaction Builder 與 Business Case Runner。Microservice 負責合約、movement、餘額推導、Maker／Checker、虛帳與生命週期規則。
