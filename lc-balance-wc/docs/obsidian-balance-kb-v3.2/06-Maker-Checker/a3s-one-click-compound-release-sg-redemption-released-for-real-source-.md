---
knowledge_id: a3s-one-click-compound-release-sg-redemption-released-for-real-source-
title: "A3S 一键组合释放：SG 赎回被真正释放，源 UTILIZE 仅被确认（acknowledge）"
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

# A3S 一键组合释放：SG 赎回被真正释放，源 UTILIZE 仅被确认（acknowledge）

对于 documentArrivalWithSg（A3S），Checker 一次 Release 点击会真正释放 SG 自身相匹配的赎回（FULL_REDEEM/PARTIAL_REDEEM），随后通过 acknowledgeUtilize() 在 LC 自身的 UTILIZE 上持久化确认（acknowledge，而非 release）——Document Arrival 这笔 movement 本身仍保持 PENDING，留待 A4/A6 之后真正终结。普通的 A3（deferSettlement，未匹配 SG）则通过另一个独立的 acknowledgeArrival() 方法到达同一个 acknowledgeUtilize() 尾段。

## Source Evidence

- `checker-actions.service.spec.ts:62-166`
- `checker-actions.service.ts:81-100,130-149`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
