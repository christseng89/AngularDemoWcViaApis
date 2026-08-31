---
knowledge_id: cross-session-linked-leg-resolution-via-businesseventid-referencedtran
title: "通过 businessEventId / referencedTransactionId 实现跨会话关联 leg 解析"
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

# 通过 businessEventId / referencedTransactionId 实现跨会话关联 leg 解析

一次组合提交的关联 leg 共享同一个 businessEventId（A3S/B5），或者较新的记录携带一个指向其源记录的 referencedTransactionId（A6/B4）。由于一个真正独立的 Checker 会话永远不会有 Maker 内存中的 submitResult，resolveLinkedMovementId() 和 resolveSettlesDocumentArrivalIds() 会在调用方自身已知的 id 为 null 时，回退到一次真实的 GET /balance-movements?businessEventId=（或读取 selectedCheckerMovement.referencedTransactionId）——找不到时解析为 null（而非抛出异常），调用方随即将其转化为一个干净的 'failed' 结果，而不是未处理的错误。

## Source Evidence

- `checker-actions.service.spec.ts:80-99,188-205,222-323 (multiple cross-session tests)`
- `checker-actions.service.ts:233-296`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
