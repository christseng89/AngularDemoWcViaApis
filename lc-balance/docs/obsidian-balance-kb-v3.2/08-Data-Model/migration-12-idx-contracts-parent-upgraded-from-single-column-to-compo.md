---
knowledge_id: migration-12-idx-contracts-parent-upgraded-from-single-column-to-compo
title: "迁移 12：idx_contracts_parent 从单列索引升级为复合索引"
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

# 迁移 12：idx_contracts_parent 从单列索引升级为复合索引

idx_contracts_parent 从只覆盖 parent_logical_contract_id 单一列的索引，升级为覆盖 (parent_logical_contract_id, instrument_type) 的复合索引，原因是所有实际调用方（listShgtMovementsForParent/listExaminationMovementsForParent/listAcceptanceMovementsForParent 及其批量对应函数）都是同时依据这两个字段进行过滤查询。schema.ts 自身的 CREATE INDEX IF NOT EXISTS 只对全新数据库有效（SQLite 的 IF NOT EXISTS 只检查索引名称是否存在），真正能升级已存在磁盘文件的，是迁移 12 中明确的 DROP + CREATE 操作；这一点已由一个专门的重新打开测试所确认，该测试会先预先建好旧的单列索引再进行验证。

## 来源证据

- `microservices/balance-component/src/db/migrations.ts:142-150`
- `microservices/balance-component/src/db/schema.ts:124-134`
- `microservices/balance-component/test/unit/db/index.test.ts:103-132`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
