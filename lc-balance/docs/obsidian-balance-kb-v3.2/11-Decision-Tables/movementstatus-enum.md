---
knowledge_id: movementstatus-enum
title: "MovementStatus 枚举"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# MovementStatus 枚举

| 值 | 含义 | 操作方 |
|---|---|---|
| PENDING | Maker 已提交，等待 Checker 审批 | Maker |
| RELEASED | Checker 已批准（终态） | Checker |
| REJECTED | Checker 已拒绝（终态） | Checker |
| CANCELLED | Maker 撤回自己提交的 PENDING 记录（EC）（终态） | Maker |
| SUPERSEDED | 保留值——被后续的 movement 取代 | 不适用（保留） |

## Source Evidence

- `Balance-Component-DB-Design.txt §5.3 (lines 531-551)`

## Related Knowledge

- DB Design + DB Optimization Analysis Docs
- [[Business-Rule-Index]]
