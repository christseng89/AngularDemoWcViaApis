---
knowledge_id: balanceservice-ts-movementtyperegistry-outstandingcapped-decreaseshape
title: "balanceService.ts 的 movementTypeRegistry——outstandingCapped / decreaseShaped / amendShaped / closeShaped 处理器"
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

# balanceService.ts 的 movementTypeRegistry——outstandingCapped / decreaseShaped / amendShaped / closeShaped 处理器

createMovement() 的充足性检查派发表，将每个 movementType 映射到一个处理函数：outstandingCapped（赎回/结算组）调用 checkRedeemSufficiency；decreaseShaped（AMEND_DECREASE）与 amendShaped（AMEND，以 ceilingAmount 为负数为门控条件）二者都调用 checkDecreaseShapedSufficiency → checkAmendDecreaseSufficiency；closeShaped（CLOSE）则调用 evaluateContractCloseEligibility 并附加一次精确金额检查。

## 证据来源

- `microservices/balance-component/src/service/balanceService.ts lines 185-254`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
