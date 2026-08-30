---
knowledge_id: legal-transitions-table
title: "LEGAL_TRANSITIONS 表"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，详见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# LEGAL_TRANSITIONS 表

这是一个 Record<MovementStatus, Partial<Record<MovementAction,MovementStatus>>> 类型的表，定义了每一组合法的（fromStatus, action）-> toStatus 映射：PENDING 接受 RELEASE→RELEASED、REJECT→REJECTED、CANCEL→CANCELLED、EDIT→SUPERSEDED；REJECTED 只接受 CANCEL→CANCELLED 与 EDIT→SUPERSEDED；RELEASED、CANCELLED、SUPERSEDED 则不接受任何动作（均为终态）。

## Source Evidence

- `microservices/balance-component/src/domain/statusTransition.ts lines 23-29`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
