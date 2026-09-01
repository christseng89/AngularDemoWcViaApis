---
knowledge_id: compound-checker-release-reject-routing
title: '复合式 Checker 放行/拒绝路由'
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

# 复合式 Checker 放行/拒绝路由

`TransactionBuilderComponent.isCheckerCompoundOwnSubmission` 判断 A3S、A6 或 B4 是否必须走完整的 compound／source-linked release/reject 流程，而不是普通单腿 API。判断依据来自 `FunctionStrategy` 以及 movement 的 `businessEventId`／`referencedTransactionId`，并支持独立 Checker 会话。B5 使用 plain 单腿路径，不属于 compound 判定。

## 证据来源

- `transaction-builder.component.ts:272-292`
- `transaction-builder.component.ts:373-402`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
