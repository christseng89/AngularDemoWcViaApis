---
knowledge_id: computefaceamount
title: "computeFaceAmount()"
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

# computeFaceAmount()

一个导出（exported）函数，将原始 `amount` 栏位（绝非 ceilingAmount）乘以 MOVEMENT_DIRECTION 后加总，并过滤限定为 movementType 属于 FACE_AMOUNT_MOVEMENT_TYPES = {ISSUE, AMEND_INCREASE, AMEND_DECREASE} 的 RELEASED 异动。此函数独立于 Confirmed Balance 之外追踪信用证的申报面额，因为 UTILIZE（属限额层面的消耗）从不属于这个集合，所以永远不会改变 Face Amount。

## Source Evidence

- `microservices/balance-component/src/domain/balanceDerivation.ts lines 54-55, 101-117`
- `microservices/balance-component/test/unit/domain/balanceDerivation.test.ts lines 35-44`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
