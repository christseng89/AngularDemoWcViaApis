---
knowledge_id: node-sqlite-databasesync-as-the-persistence-engine-no-better-sqlite3
title: "以 node:sqlite 的 DatabaseSync 作为持久化引擎（不使用 better-sqlite3）"
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

# 以 node:sqlite 的 DatabaseSync 作为持久化引擎（不使用 better-sqlite3）

Balance Component 使用 Node 内建的 node:sqlite（DatabaseSync，需 Node >=22.5）而非 better-sqlite3，因为本环境没有可用于编译 better-sqlite3 原生代码的 C++ 构建工具链。node:sqlite 支持与 src/store/ 全程所用相同的 @name 预处理语句写法，因此切换引擎时 store 层完全不需要改动 API。这被明确记录为一项刻意为之、且已公开披露的原型阶段取舍，而不是疏漏。

## 来源证据

- `microservices/balance-component/src/db/index.ts:1-23`
- `microservices/balance-component/src/db/schema.ts:1-17`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
