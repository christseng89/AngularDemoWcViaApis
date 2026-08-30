---
knowledge_id: createdb-pragma-initialization-sequence
title: "createDb() 的 PRAGMA/初始化流程"
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

# createDb() 的 PRAGMA/初始化流程

createDb(filePath) 会打开一个 DatabaseSync，仅在 filePath !== ':memory:'（即真实的磁盘文件）时设置 PRAGMA journal_mode=WAL，随后无条件设置 PRAGMA foreign_keys=ON 与 PRAGMA busy_timeout=5000，执行 SCHEMA_SQL（幂等的 CREATE TABLE/INDEX IF NOT EXISTS），最后调用 runMigrations(db)。仅在文件模式下设置 WAL 的分支逻辑，以及无条件设置 busy_timeout 的行为，均有直接的测试验证。

## 来源证据

- `microservices/balance-component/src/db/index.ts:28-44`
- `microservices/balance-component/test/unit/db/index.test.ts:29-87`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
