---
knowledge_id: migration-1-11-incremental-alter-table-add-column-each-self-checking-v
title: "迁移 1-11：渐进式 ALTER TABLE ADD COLUMN，每一步都通过 PRAGMA table_info 自我检查"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 迁移 1-11：渐进式 ALTER TABLE ADD COLUMN，每一步都通过 PRAGMA table_info 自我检查

迁移 1 到 11 各自为 balance_movements 新增一到两个可为 NULL 的 TEXT 字段（acknowledged_by/at、contingent_account_entry、referenced_transaction_id、maker_submitted_by/at、event_snapshot 及其兄弟/finalize 变体、present_docs_consumed_at/by、cancelled_by/at）。每个迁移在执行 ALTER 之前都会重新检查 PRAGMA table_info(balance_movements)，因此如果数据库中已经存在该字段（来自更早期手写的迁移工具），会被安全地当作空操作处理，而不会因为“字段重复”而报错。

## 来源证据

- `microservices/balance-component/src/db/migrations.ts:38-141`
- `microservices/balance-component/test/unit/db/migrations.test.ts:118-135`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
