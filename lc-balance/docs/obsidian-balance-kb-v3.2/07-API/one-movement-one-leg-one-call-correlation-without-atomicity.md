---
knowledge_id: one-movement-one-leg-one-call-correlation-without-atomicity
title: '一个 Movement、一条腿、一次调用——只有关联，没有原子性'
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: 'N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]'
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 一个 Movement、一条腿、一次调用——只有关联，没有原子性

本页记录旧版逐腿调用模型。现行实现已经为 A3S/B4 提供 atomic compound submit/release，并在同一数据库交易内成功或回滚；A6 继续透过 `referencedTransactionId` 关联既有 source。B5 已改为 plain 单一 movement。请以 [[Freshness-Update-Log-2026-09-01]] 与两份现行 OAS 为准。

## Source Evidence

- `balance-component-api.yaml lines 1418-1429 (referencedTransactionId description)`
- `balance-component-api.yaml lines 36-49 (API design principle)`
- `balance-component-channel-api.yaml lines 30-50 (channel-level restatement)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
