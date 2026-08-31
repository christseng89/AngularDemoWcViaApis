---
knowledge_id: lcindexrow-closingpending
title: "LcIndexRow.closingPending"
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

# LcIndexRow.closingPending

仅当 root 合约存在一笔 CLOSE movementType 的动账、且该笔动账真正仍处于 PENDING 状态时才为真（在 Release 将其状态翻转为 CLOSED 之前，合约本身的 status 一直保持 ACTIVE）。该值在每次调用 loadIndex() 时都会从 root 合约自身的动账重新推导（从不缓存），因此后续若该 CLOSE 被 Checker Reject，下一次加载时会自然还原为 false，无需任何特殊处理。判断只针对 `root` 事件，不针对合并后的子事件，因为 A10/B6 的 CLOSE 永远是 root 层级的动账。

## Source Evidence

- `inquire-events.service.spec.ts:395-465 closingPending test block`
- `inquire-events.service.ts:131-141 doc comment`
- `inquire-events.service.ts:402-404 closingPending derivation`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
