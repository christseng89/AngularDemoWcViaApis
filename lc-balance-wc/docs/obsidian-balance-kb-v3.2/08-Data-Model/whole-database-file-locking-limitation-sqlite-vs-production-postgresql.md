---
knowledge_id: whole-database-file-locking-limitation-sqlite-vs-production-postgresql
title: "整数据库文件锁定的限制（SQLite 与生产环境 PostgreSQL 需求的对比）"
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

# 整数据库文件锁定的限制（SQLite 与生产环境 PostgreSQL 需求的对比）

SQLite（即便在 WAL 模式下）是在整个数据库文件层级加锁的——同一时间只能有一个写入者，没有行级锁 / SELECT...FOR UPDATE。内部设计需求要求：同一张 LC 的请求要串行化，而不同 LC 的请求绝不能互相阻塞；SQLite 只能满足前半段（过度保守的全局串行化），永远无法体现真正的按单据并发。这在文档中被记录为对单进程原型来说安全但不完整，并被标注为生产上线前必须替换为 PostgreSQL（限定在 balance_contract_id 范围内的行级锁）的事项。

## 来源证据

- `microservices/balance-component/src/db/index.ts:9-21`
- `microservices/balance-component/src/db/schema.ts:4-16`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
