---
knowledge_id: sqlite-whole-file-locking-cannot-demonstrate-true-per-instrument-concu
title: "SQLite 的整文件锁定机制，无法体现真正的按单据并发能力"
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

# SQLite 的整文件锁定机制，无法体现真正的按单据并发能力

设计文档 §6 中的业务需求是：针对同一张 LC 的并发提交必须正确串行化，而针对不同 LC 的提交则不能互相阻塞。SQLite（即便是在 WAL 模式下）是在整个数据库文件层级加锁的——不论涉及哪一个 logicalContractId，每一次写入都会被全局串行化。对单进程原型来说，这是安全但过于保守的做法，但设计文档已明确将其标注为生产环境上线前必须替换的限制：生产环境需要 PostgreSQL，并搭配限定在 balance_contract_id 范围内的 SELECT...FOR UPDATE（或 MySQL/InnoDB 的行级锁），才能真正验证“不同 LC 之间绝不互相阻塞”这一半的需求。

## 来源证据

- `Balance-Component-DB-Design.txt §1.1 (lines 47-58), §8.1 (lines 767-774)`
- `Balance-Component-DB-Optimization-Analysis.txt §1 (lines 39-43), §3 (lines 198-207), §4 item 5 (lines 229-230)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
