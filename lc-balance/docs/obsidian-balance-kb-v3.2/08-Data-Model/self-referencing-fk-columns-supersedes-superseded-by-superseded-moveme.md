---
knowledge_id: self-referencing-fk-columns-supersedes-superseded-by-superseded-moveme
title: "自引用外键字段（supersedes/superseded_by、superseded_movement_id/reversal_of_movement_id）"
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

# 自引用外键字段（supersedes/superseded_by、superseded_movement_id/reversal_of_movement_id）

balance_contracts.supersedes_balance_contract_id 与 superseded_by_balance_contract_id，以及 balance_movements.superseded_movement_id 与 reversal_of_movement_id，都是真正指回自身所在表的外键 REFERENCES（由迁移 13 新增）。两个方向都会被强制校验：引用一个不存在的 id 会抛出 FOREIGN KEY constraint failed，而引用一个真实存在、已插入的 id 则会被正常接受。若是同一批次内的前向引用（例如同一次重建/事务中插入的兄弟行），会透过迁移 13 重建过程中的 PRAGMA foreign_keys=OFF 来处理；而 markSuperseded() 在运行期自身事务中出现的前向引用，则是透过 PRAGMA defer_foreign_keys=ON 来处理。

## 来源证据

- `microservices/balance-component/src/db/migrations.ts:160-263`
- `microservices/balance-component/test/unit/db/checkAndForeignKeyConstraints.test.ts:168-208`
- `microservices/balance-component/test/unit/db/schema.test.ts:261-290`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
