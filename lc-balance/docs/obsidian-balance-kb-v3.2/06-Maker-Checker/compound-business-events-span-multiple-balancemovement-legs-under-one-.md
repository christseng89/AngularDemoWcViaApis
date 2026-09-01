---
knowledge_id: compound-business-events-span-multiple-balancemovement-legs-under-one-
title: '组合业务事件在同一个 businessEventId 下横跨多个 BalanceMovement leg'
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

# 组合业务事件在同一个 businessEventId 下横跨多个 BalanceMovement leg

现行多腿动作包括 A3S（SG redemption + Document Arrival）与 B4（Sight Honour + Due-from-Issuing-Bank，或 Usance Accept + Acceptance + Reimbursement Receivable）。它们使用 `businessEventId` 关联 compound legs；A6 使用 `referencedTransactionId` 关联既有 Document Arrival。B5 已改为单一 Acceptance settlement，不再与 Reimbursement Receivable 打包。

## Source Evidence

- `src/app/transaction-builder/function-strategy.ts`
- `checker-actions.service.ts:49-128,233-296`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
