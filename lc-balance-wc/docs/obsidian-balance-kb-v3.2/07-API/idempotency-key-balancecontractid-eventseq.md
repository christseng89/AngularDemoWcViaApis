---
knowledge_id: idempotency-key-balancecontractid-eventseq
title: "幂等键：(balanceContractId, eventSeq)"
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

# 幂等键：(balanceContractId, eventSeq)

eventSeq 由调用方提供，目的正是为了让重试变得安全；向 POST /balance-movements 重复提交相同的 (balanceContractId, eventSeq) 组合，会返回既有记录（200），而不是报错或重复计数。Channel API 在其自身的更上一层，也声明了完全相同的机制。

## Source Evidence

- `balance-component-api.yaml lines 756-760`
- `balance-component-channel-api.yaml lines 85-89`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
