---
title: "Data Model"
type: reference
domain: data
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["database"]
source_files:
  - "microservices/balance-component/src/db/schema.ts"
  - "microservices/balance-component/src/db/migrations.ts"
  - "microservices/balance-component/src/store/balanceContractStore.ts"
  - "microservices/balance-component/src/store/balanceMovementStore.ts"
---

# Data Model

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

SQLite 保存 contract versions、movements、account mappings、Fix Pending 與 Delete Pending audits。金額以 TEXT decimal string 保存。Movement 以 contract＋event sequence 維持 idempotency；snapshot-on-write 保存事件當時畫面。Migrations 是 append-only 陣列，啟動時依序執行。Production concurrency 與 persistence 升級不可假設 SQLite 的 whole-file locking 等同 production database。

完整 physical schema、欄位、keys、indexes 與關聯見 [[Data Tables Layout]]。
