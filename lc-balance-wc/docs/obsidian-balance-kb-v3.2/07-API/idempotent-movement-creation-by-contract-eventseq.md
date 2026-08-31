---
knowledge_id: idempotent-movement-creation-by-contract-eventseq
title: "按 (contract, eventSeq) 实现的幂等 movement 创建"
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

# 按 (contract, eventSeq) 实现的幂等 movement 创建

POST /balance-movements 若重复提交相同的 balanceContractId + eventSeq 组合，会返回 HTTP 200，并原样带回最初的（ORIGINAL）movement 记录——重复提交的请求体中任何存在差异的字段（例如不同的 amount）都会被静默忽略，而不会被应用。一个真正全新的 (contract, eventSeq) 组合则会返回 201。这正是 (balanceContractId, eventSeq) 这一 UNIQUE 约束幂等键，在请求层面的具体体现。

## Source Evidence

- `test/unit/app.test.ts:87-102`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
