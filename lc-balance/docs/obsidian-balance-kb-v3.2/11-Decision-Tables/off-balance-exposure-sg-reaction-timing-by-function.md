---
knowledge_id: off-balance-exposure-sg-reaction-timing-by-function
title: "表外敞口（SG）——按功能划分的反应时点"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 表外敞口（SG）——按功能划分的反应时点

| 功能 | Movement | 组合数字 #4 的反应时点 | 拆分桶 #8/#9 |
|---|---|---|---|
| A8（Shipping Gtee Issue） | ISSUE（增加） | Submit 时——Release 时不再反应 | Release 时在 Pending→Approved 之间迁移，合计数不变 |
| A9（独立 SG Redemption） | FULL_REDEEM（敞口减少） | 仅在真正的 Checker Release 时反应——Submit 时不反应 | Submit 时 #8 不变；仅在 Release 时 #8→#9 |
| A3S（匹配的复合配对） | 与仍处于 PENDING 的 UTILIZE 共享 businessEventId 的 PARTIAL_REDEEM/FULL_REDEEM | Submit 时——唯一的例外，因为两条腿会一起 release/rollback | 仅在复合 Checker Release 时 #8 减少、#9 增加 |

## Source Evidence

- `Balance-Figures-Calculation-Logic.txt lines 384-397 (§5 bullet)`
- `Balance-Figures-Calculation-Logic.txt lines 800-923 (A8/A9 tables)`

## Related Knowledge

- Balance Figures Calculation Logic + TF Balance Component Mapping Workbook
- [[Business-Rule-Index]]
