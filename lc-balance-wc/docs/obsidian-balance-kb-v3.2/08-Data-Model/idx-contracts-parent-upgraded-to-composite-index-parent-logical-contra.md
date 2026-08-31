---
knowledge_id: idx-contracts-parent-upgraded-to-composite-index-parent-logical-contra
title: "idx_contracts_parent 升级为复合索引 (parent_logical_contract_id, instrument_type)"
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

# idx_contracts_parent 升级为复合索引 (parent_logical_contract_id, instrument_type)

该索引最初是单列的（仅 parent_logical_contract_id），但所有针对它的真实查询（balanceMovementStore.ts 中用于 SHGT/Acceptance/Examination 子流水查找的 3 个调用点）都同时使用 instrument_type 与 parent_logical_contract_id 作为两个等值条件，导致索引扫描之后仍需回表查询。已于 2026-08-21 修复：schema.ts 中新建数据库使用的索引定义已更改，migration 12（DROP INDEX IF EXISTS + 重新创建）会升级任何仍带有旧单列定义的现有磁盘数据库，因为 CREATE INDEX IF NOT EXISTS 只检查索引名称，并不会自动升级已存在的索引定义。

## 来源证据

- `Balance-Component-DB-Design.txt §7 migration #12 (lines 755-758)`
- `Balance-Component-DB-Optimization-Analysis.txt P2 composite-index row (lines 130-134)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
