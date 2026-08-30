---
knowledge_id: migration-runner-schema-migrations-tracked-migration-array
title: "迁移执行器：由 schema_migrations 表追踪的 Migration[] 数组"
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

# 迁移执行器：由 schema_migrations 表追踪的 Migration[] 数组

runMigrations(db) 会先在缺失时建立一张 schema_migrations 表（id、applied_at），然后依序遍历 MIGRATIONS 数组，执行每一条尚未被记录过的迁移，并插入一笔追踪记录。约定是只追加不修改：一次新的 schema 变更就是在数组底部新增一个条目；一条历史记录一旦可能已经在真实数据库文件上执行过，就绝不重新编号或修改。截至本次梳理，共有 13 个迁移，涵盖字段新增（1-11）、索引升级（12），以及一次完整的 CHECK/外键约束重建（13）。

## 来源证据

- `microservices/balance-component/src/db/migrations.ts:1-16,309-325`
- `microservices/balance-component/test/unit/db/migrations.test.ts:21-69`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
