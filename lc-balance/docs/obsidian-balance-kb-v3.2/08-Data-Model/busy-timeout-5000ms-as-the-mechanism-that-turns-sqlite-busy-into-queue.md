---
knowledge_id: busy-timeout-5000ms-as-the-mechanism-that-turns-sqlite-busy-into-queue
title: "busy_timeout=5000ms 是把 SQLITE_BUSY 转化为排队串行化的机制"
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

# busy_timeout=5000ms 是把 SQLITE_BUSY 转化为排队串行化的机制

如果没有设置 PRAGMA busy_timeout，SQLite 在无法获取写锁时的默认行为是立即抛出 SQLITE_BUSY，而不是将第二个写入者排队等待。由于设计要求同一 LC 的并发请求必须串行化（而不是直接失败），busy_timeout=5000 使被阻塞的写入者最多等待 5 秒，而不是直接报错。文档明确指出这个数值对原型阶段来说是"宽裕的"，并未针对生产环境的负载做过调优。

## 来源证据

- `microservices/balance-component/src/db/index.ts:34-39`
- `microservices/balance-component/test/unit/db/index.test.ts:73-87`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
