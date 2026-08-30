---
knowledge_id: migration-array-append-only-convention
title: "迁移数组只追加不修改的约定"
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

# 迁移数组只追加不修改的约定

MIGRATIONS 数组自身顶部的注释明确规定：新增迁移一律追加到数组底部——一旦某条历史记录可能已经在真实数据库文件上执行过，就绝不能重新编号或修改它。这是取代早期那种手写的“检查字段是否存在、缺少就 ALTER”一次性做法的 schema 演进约定，并且刻意保持最小化（没有 down-migration，没有 CLI）以适配单进程原型环境，目前也仍然只支持 SQLite（未来若要换成 PostgreSQL 引擎，是与本迁移工具本身分开处理的另一个议题）。

## 来源证据

- `microservices/balance-component/src/db/migrations.ts:1-16,37`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
