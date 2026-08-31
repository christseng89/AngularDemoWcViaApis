---
knowledge_id: concurrency-model-current-sqlite-whole-file-lock-vs-required-postgresq
title: "并发模型：现行 SQLite 整文件锁 与 未来必需的 PostgreSQL 行级锁"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# 并发模型：现行 SQLite 整文件锁 与 未来必需的 PostgreSQL 行级锁

说明当前单进程原型所使用的 SQLite 引擎，为何无法满足“同一 LC 串行化、不同 LC 之间绝不互相阻塞”的业务需求，并展示改用 PostgreSQL 行级锁之后会是什么样子。

```mermaid
flowchart TD
  subgraph CUR["现状：node:sqlite（DatabaseSync），即使启用 WAL 也是如此"]
    A1["针对 LC-A 的写请求"] --> L1["整个数据库文件的写锁"]
    A2["针对 LC-B（无关合约）的并发写请求"] --> L1
    L1 --> S1["所有写入在全局范围内串行化——尽管 LC-A 和 LC-B 是不同的合约，LC-B 的写入仍需排在 LC-A 之后"]
  end
  subgraph TGT["目标方案（上生产前必须替换）：PostgreSQL"]
    B1["针对 LC-A 的写请求"] --> R1["SELECT ... FOR UPDATE，作用范围限定为 balance_contract_id = A"]
    B2["针对 LC-B 的并发写请求"] --> R2["SELECT ... FOR UPDATE，作用范围限定为 balance_contract_id = B"]
    R1 --> P1["独立推进"]
    R2 --> P2["独立推进——不会被无关的 LC 阻塞"]
  end
```

## 来源证据

- `Balance-Component-DB-Design.txt §1.1 (lines 47-58), §8.1 (lines 767-774)`
- `Balance-Component-DB-Optimization-Analysis.txt §3 (lines 198-207)`

## 相关知识

- DB Design + DB Optimization Analysis Docs
- [[Business-Rule-Index]]
