---
knowledge_id: idempotent-movement-insert-unique-idempotency-key-handling
title: "幂等的流水插入（UNIQUE 幂等键处理）"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# 幂等的流水插入（UNIQUE 幂等键处理）

说明 BalanceMovementStore.insert() 如何处理重复的 (balance_contract_id, event_seq) 提交，以及如何处理真正全新的提交。

```mermaid
flowchart TD
  A["调用方提交一笔流水事件"] --> B["BalanceMovementStore.insert()"]
  B --> C{"是否违反 UNIQUE(balance_contract_id, event_seq)？"}
  C -- 否 --> D["插入新的 PENDING 流水行"]
  D --> E["返回 created: true"]
  C -- 是 --> F["捕获 UNIQUE 约束冲突"]
  F --> G["查找已存在的流水行"]
  G --> H["返回 created: false, existing"]
  E --> I["调用方正常响应"]
  H --> I2["调用方以 200 响应，不会重复入账"]
```

## 来源证据

- `Balance-Component-DB-Design.txt §2.3 (lines 83-91), §4.2.7 insert row (lines 430-432)`

## 相关知识

- DB Design + DB Optimization Analysis Docs
- [[Business-Rule-Index]]
