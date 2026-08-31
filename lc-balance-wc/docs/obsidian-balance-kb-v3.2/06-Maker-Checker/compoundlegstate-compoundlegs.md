---
knowledge_id: compoundlegstate-compoundlegs
title: "CompoundLegState（compoundLegs）"
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

# CompoundLegState（compoundLegs）

一个单一对象，聚合了 A3S/A6/B4/B5 多 leg 提交所产生的 7 个扁平化 movement-id/movement 字段（SG 赎回、Due-from-Issuing-Bank、Acceptance 负债及其自身完整的 movement、Acceptance Reimbursement Receivable、相匹配的 Receivable）。其中两个字段（`arrivalSgRedeemMovement`、`acceptanceMovement`）携带的是完整的 `BalanceMovement`，而不仅仅是一个 id，专门用来支撑面板自身"Account Entries — SG Redemption/Acceptance"按钮。`resetForFunction()` 会清空全部 7 个字段；而 `submit()` 只清空其中 3 个（`arrivalSgRedeemMovementId`、`arrivalSgRedeemMovement`、`acceptanceMovement`）——这是刻意为之的部分重置。

## Source Evidence

- `maker-panel.component.ts:1192-1194 (partial reset in submit())`
- `maker-panel.component.ts:456 (full reset in resetForFunction())`
- `maker-panel.component.ts:64-89 (CompoundLegState interface + EMPTY_COMPOUND_LEGS)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
