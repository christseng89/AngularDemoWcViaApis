---
knowledge_id: sourcetransactionref-uniqueness-per-contract
title: "sourceTransactionRef 在同一合约内的唯一性"
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

# sourceTransactionRef 在同一合约内的唯一性

在同一合约上，如果第二笔 Movement 重复使用了一个已经用过的 sourceTransactionRef，会被以 400 REQUEST_VALIDATION_FAILED 拒绝（注意：这是一种校验类拒绝，不同于本系统其他地方使用的 409 CONTRACT_VERSION_CONFLICT/NATURAL_KEY_ALREADY_EXISTS 模式），即便 eventSeq/amount 不同也是如此——被拒绝的尝试不会改变 Confirmed Balance。该唯一性约束的作用范围是按合约各自独立的，而非全局性的：同一个引用字符串在另一份合约上是被接受的。

## Source Evidence

- `test/unit/app.test.ts:1064-1172`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
