---
knowledge_id: idempotency-key-unique-balance-contract-id-event-seq
title: "幂等键：UNIQUE(balance_contract_id, event_seq)"
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

# 幂等键：UNIQUE(balance_contract_id, event_seq)

balance_movements 携带一个建立在 (balance_contract_id, event_seq) 上的 UNIQUE 索引，用以实现设计文档 §8 中定义的幂等键。当同一个 (合约, 事件序号) 组合被提交两次时，数据库层的 UNIQUE 约束会拦截第二次写入；BalanceMovementStore.insert() 捕获该冲突，查找已存在的行，并返回 {created: false, existing}，使调用方能够安全地对重试请求以 200 响应，而不会误报错误或造成重复入账。

## 来源证据

- `Balance-Component-DB-Design.txt §2.3 (lines 83-91), §4.2.6 (lines 416-417), §4.2.7 insert row (lines 430-432)`
- `Balance-Component-DB-Optimization-Analysis.txt §1 (lines 28-31)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
