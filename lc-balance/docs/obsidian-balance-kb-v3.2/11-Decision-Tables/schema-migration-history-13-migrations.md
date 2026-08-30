---
knowledge_id: schema-migration-history-13-migrations
title: "Schema 迁移历史（13 次迁移）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# Schema 迁移历史（13 次迁移）

| # | 新增内容 | 业务背景（摘要） |
|---|---|---|
| 1 | acknowledged_by / acknowledged_at | 2026-08-15，Present Docs Earmark 确认（acknowledgment）动作 |
| 2 | contingent_account_entry | 2026-08-16，自动生成或有负债的借/贷分录 |
| 3 | referenced_transaction_id | 2026-08-16，修复 A6/B4 跨会话 Checker Release 问题 |
| 4 | maker_submitted_by / maker_submitted_at | 2026-08-16，A4 真正意义上的 Maker Submit 步骤 |
| 5 | event_snapshot | 2026-08-17，事件时点余额快照的持久化 |
| 6 | root_event_snapshot | 2026-08-17，子账合约对母合约的快照 |
| 7 | acceptance_event_snapshot / sg_event_snapshot | 2026-08-17，唯一同胞合约的快照 |
| 8 | finalize_event_snapshot | 2026-08-18，修复 A4 终结 A3 快照时的冻结问题 |
| 9 | finalize_acceptance_event_snapshot / finalize_sg_event_snapshot | 2026-08-18，将同一冻结逻辑扩展到同胞快照 |
| 10 | present_docs_consumed_at / present_docs_consumed_by | 2026-08-18，在 B3 成为真正独立的 Release 之后新增的消耗标记 |
| 11 | cancelled_by / cancelled_at | 2026-08-20，将 Submit/EC/Approve 处理为三个互不覆写的审计事实 |
| 12 | （无新增列）idx_contracts_parent 升级为复合索引 | 2026-08-21，数据库优化 P2——修复 N+1/索引缺口问题 |
| 13 | （无新增列）为 6 个枚举列加上 CHECK 约束、为 4 个自引用列加上 FK 约束，透过整表重建完成 | 2026-08-21，数据库优化 P1/P2——SQLite 的 ALTER TABLE 无法追加约束，因此采用重建表的迁移方式 |

## Source Evidence

- `Balance-Component-DB-Design.txt §7 (lines 720-763)`

## Related Knowledge

- DB Design + DB Optimization Analysis Docs
- [[Business-Rule-Index]]
