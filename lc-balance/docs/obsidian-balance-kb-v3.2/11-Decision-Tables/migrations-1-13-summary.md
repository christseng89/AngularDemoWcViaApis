---
knowledge_id: migrations-1-13-summary
title: "迁移脚本 1-13 摘要"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 迁移脚本 1-13 摘要

| id | What it adds/changes（新增/变更内容） |
|---|---|
| 1 | balance_movements.acknowledged_by/acknowledged_at（交单 Earmark 确认，后续为历史字段） |
| 2 | balance_movements.contingent_account_entry（借/贷或有负债配对分录，JSON） |
| 3 | balance_movements.referenced_transaction_id（A6/B4 跨会话关联） |
| 4 | balance_movements.maker_submitted_by/maker_submitted_at（A4 真实的 Maker Submit） |
| 5 | balance_movements.event_snapshot（持久化的 PENDING/RELEASED 余额快照，JSON） |
| 6 | balance_movements.root_event_snapshot（子账本移动记录对应的父级 LC/Confirmation 余额快照，JSON） |
| 7 | balance_movements.acceptance_event_snapshot / sg_event_snapshot（关联合约的余额快照，JSON） |
| 8 | balance_movements.finalize_event_snapshot（A4 最终确认时点快照，保留 A3 原始快照） |
| 9 | balance_movements.finalize_acceptance_event_snapshot / finalize_sg_event_snapshot |
| 10 | balance_movements.present_docs_consumed_at/present_docs_consumed_by（B3 被 B4 消费的追踪） |
| 11 | balance_movements.cancelled_by/cancelled_at（EC 审计轨迹，从 released_by/released_at 中拆分而来） |
| 12 | idx_contracts_parent 由单列升级为复合索引 (parent_logical_contract_id, instrument_type) |
| 13 | 完整表重建，为 6 个枚举列新增 CHECK 约束，并为 4 个自引用列新增真实的 FK REFERENCES，balance_contracts 与 balance_movements 两表均涉及 |

## Source Evidence

- `microservices/balance-component/src/db/migrations.ts:38-306`

## Related Knowledge

- Data Model — DB Schema, Migrations, Stores, Types/Money/Errors
- [[Business-Rule-Index]]
