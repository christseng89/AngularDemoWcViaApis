---
knowledge_id: exposurenature-enum
title: "ExposureNature 枚举"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# ExposureNature 枚举

| Value | Meaning（含义） | Posts accountEntries?（是否过账科目分录） |
|---|---|---|
| CONTINGENT | 或有负债——绝大多数移动记录的默认值 | 是，凡在范围内均经由 contingentAccountEntry 过账 |
| ACTUAL | 实际/已入账负债 | 是 |
| MEMO | 纯粹用于留痕的记录用途（例如未保兑 LC 项下开证行一方的义务）——并非本行自身的负债，仅用于应收款/到期日追踪 | 从不 |

## Source Evidence

- `Balance-Component-DB-Design.txt §5.4 (lines 553-565)`

## Related Knowledge

- DB Design + DB Optimization Analysis Docs
- [[Business-Rule-Index]]
