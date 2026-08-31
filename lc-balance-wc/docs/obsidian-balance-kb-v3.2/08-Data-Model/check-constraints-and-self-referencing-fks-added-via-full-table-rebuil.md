---
knowledge_id: check-constraints-and-self-referencing-fks-added-via-full-table-rebuil
title: "通过整表重建迁移（migration 13）新增的 CHECK 约束与自引用外键"
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

# 通过整表重建迁移（migration 13）新增的 CHECK 约束与自引用外键

SQLite 的 ALTER TABLE 无法对已存在的列追溯添加 CHECK 或 REFERENCES 约束。Migration 13 为 5 个由 types.ts 支撑的枚举列，加上由 movement_type 注册表支撑的那一列，新增了 CHECK 约束；并为 4 个自引用 ID 列（supersedes_balance_contract_id、superseded_by_balance_contract_id、superseded_movement_id、reversal_of_movement_id）新增了真正的外键约束，做法是遵循 SQLite 官方的“重建表”（rebuild table）流程：PRAGMA foreign_keys=OFF -> BEGIN -> 创建带约束的新表 -> 逐列显式 INSERT...SELECT -> 删除旧表 -> 重命名 -> 重建所有索引 -> COMMIT（若失败则 ROLLBACK，不留下半成品表）-> PRAGMA foreign_keys=ON。该迁移已针对真实开发库数据（51 条现有 balance_contracts 行，行数未变）完成验证，并通过 git-stash 前后对比验证了 10 类此前被静默接受的非法输入现在会被拒绝，同时对合法输入零回归。

## 来源证据

- `Balance-Component-DB-Design.txt §7 migration #13 (lines 760-762)`
- `Balance-Component-DB-Optimization-Analysis.txt P2 CHECK-constraint row (lines 136-149), §3 table rows (lines 190-196)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
