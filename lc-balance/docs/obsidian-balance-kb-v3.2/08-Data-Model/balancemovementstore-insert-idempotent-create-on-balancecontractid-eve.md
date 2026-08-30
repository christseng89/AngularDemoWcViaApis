---
knowledge_id: balancemovementstore-insert-idempotent-create-on-balancecontractid-eve
title: "BalanceMovementStore.insert() ——基于 (balanceContractId, eventSeq) 的幂等创建"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# BalanceMovementStore.insert() ——基于 (balanceContractId, eventSeq) 的幂等创建

说明同一笔流水创建请求的重复提交如何被检测出来，并转化为安全的空操作而非错误，而其他各类数据库失败则照常向上传播。

```mermaid
flowchart TD
  A["insert(movement)"] --> B["INSERT INTO balance_movements (...)"]
  B --> C{"是否抛出异常？"}
  C -- 否 --> D["return { created: true }"]
  C -- 是 --> E{"err.message 是否匹配\n/UNIQUE constraint failed/ ？"}
  E -- 否 --> F["重新抛出原始错误\n（例如 FOREIGN KEY constraint failed）"]
  E -- 是 --> G["findByContractAndEventSeq(\nbalanceContractId, eventSeq)"]
  G --> H{"是否找到？"}
  H -- 是 --> I["return { created: false, existing }"]
  H -- 否 --> F
```

## 来源证据

- `microservices/balance-component/src/store/balanceMovementStore.ts:128-211`

## 相关知识

- Data Model — DB Schema, Migrations, Stores, Types/Money/Errors
- [[Business-Rule-Index]]
