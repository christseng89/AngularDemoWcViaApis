---
knowledge_id: pragma-busy-timeout-5000-fixed-2026-08-21-p0
title: "PRAGMA busy_timeout=5000——2026-08-21 修复的 P0 问题"
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

# PRAGMA busy_timeout=5000——2026-08-21 修复的 P0 问题

此前，当 SQLite 无法立即取得写锁时，会立刻抛出 SQLITE_BUSY 而不是排队等待——这意味着针对同一张 LC 的第二笔并发写入（正是设计上明确要求要能正确串行化的场景）会直接失败，而不是排队等待。修复方式是在 createDb() 中无条件加入 db.exec('PRAGMA busy_timeout = 5000')，同时适用于文件持久化与 :memory: 两种分支。已透过一个新测试读回该 PRAGMA 的值以确认为 5000；全部 397 个微服务测试与 tsc --noEmit 均保持通过。

## 来源证据

- `Balance-Component-DB-Optimization-Analysis.txt P0 section (lines 48-69)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
