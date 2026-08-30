---
knowledge_id: idempotency-key-unique-balance-contract-id-event-seq-resubmission-retu
title: "幂等键：UNIQUE(balance_contract_id, event_seq)，重复提交返回原始记录"
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

# 幂等键：UNIQUE(balance_contract_id, event_seq)，重复提交返回原始记录

balance_movements 只有一个 UNIQUE 索引，建立在 (balance_contract_id, event_seq) 上——即幂等键。BalanceMovementStore.insert() 会捕获 INSERT 失败，通过对抛出错误的 .message 字符串做匹配（匹配 /UNIQUE constraint failed/，而非错误代码——node:sqlite 并未暴露稳定的约束违反代码）来判断是否正是这一特定的 UNIQUE 冲突；若是，则查找并返回已存在的原始记录（{created:false, existing}），而不是报错——调用方应以 200 响应并返回已存在的记录。其他任何数据库错误（例如外键违反）都会原样重新抛出，不会被吞掉。

## 来源证据

- `microservices/balance-component/src/store/balanceMovementStore.ts:122-211`
- `microservices/balance-component/test/unit/db/schema.test.ts:79-89,292-299`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
