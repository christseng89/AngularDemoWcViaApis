---
knowledge_id: BalanceMovement
title: "BalanceMovement"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
  - movement
---

# BalanceMovement

**BalanceMovement** 是账本中「交易」的一侧：针对某个 [[BalanceContract]] 记录的单一事件——一笔 ISSUE、一笔 AMEND、一笔 UTILIZE、一笔赎回（redemption）、一笔 Close 冲销等等。每一笔异动都带有 `movementType`、`MovementStatus`、`ExposureNature`、一个金额（若适用则还有经宽容度换算得出的 `ceilingAmount`，见 [[Tolerance Processing]]），以及一条审计轨迹。

## MovementStatus 生命周期

```
PENDING | RELEASED | REJECTED | CANCELLED | SUPERSEDED
```

`PENDING` 是唯一由 Maker 建立时即产生的状态。其余每一个状态都是经由 Checker 的动作（`release()`/`reject()`）或 Maker 针对自己尚未获核准记录的动作（Maker EC/Cancel——有别于 Checker 的 `reject()`）达成。只有 `RELEASED` 状态的异动才计入 Confirmed Balance（见 [[Balance Derivation Rules]]）。

## ExposureNature

```
CONTINGENT | ACTUAL | MEMO
```

`CONTINGENT` 是一般的表外风险暴露（见 [[Off-Balance-Sheet Exposure]]）。`MEMO` 专用于未保兑信用证（Unconfirmed LC）开证行一侧的义务——仅作应收追踪，从不产生 `contingentAccountEntry` 过账。`ACTUAL` 则标示真正的表内风险暴露。

## 审计轨迹栏位

一笔异动自身的审计轨迹分离出三组各自独立的事实，各自拥有一组独立的操作人+时间戳：`createdBy`/`createdAt`（Maker 提交）、`cancelledBy`/`cancelledAt`（Maker EC——从 `releasedBy`/`releasedAt` 中拆分出来，使 EC 与真正的核准动作不再仅靠 `status` 一个栏位来区分）、以及 `releasedBy`/`releasedAt`（Checker 核准，仅限 `status === 'RELEASED'`）。`reject()` 重复使用 `releasedBy`/`releasedAt`——并没有专属的 `rejectedBy`/`rejectedAt` 组合。`acknowledgedBy`/`acknowledgedAt` 是另一个独立栏位，用于 A3/A3S 自身的 Checker 确认（acknowledgment）步骤（见 [[Maker Checker Lifecycle]]），历史上也曾被重新设计前的 B3 使用。`makerSubmittedAt` 是另外新增、用来限制即期（Sight）期限 UTILIZE 放行的独立栏位（BAL-123）。

## 组合／关联异动

部分业务功能会在同一次提交中建立两笔相互关联的异动——例如 A3S 的单据到单（Document Arrival）+ SG 赎回段，或是 B4 的 Honour/Accept 与其所参照的 B3 押单（Present Docs）记录。这些异动共用一个 `businessEventId`（用于同一交易中一并建立的一对异动），或是一个 `referencedTransactionId`（用于解决*较早*异动的后续异动，例如 B4→B3、A6/A4→其自身的单据到单记录）。这两个栏位存在的目的正是为了让一个真正独立的 Checker 会话也能正确关联并放行/拒绝这一对相互关联的异动——此关联机制修补过的缺陷详见 [[Maker Checker Lifecycle]]。

## 幂等性（Idempotency）

一笔异动自身的幂等键为 `(balanceContractId, eventSeq)`，透过 UNIQUE 约束强制执行——用以防止同一逻辑事件被重复提交。

## Related knowledge

- [[BalanceContract]]
- [[Balance Derivation Rules]]
- [[Tolerance Processing]]
- [[Exposure Model]]
- [[Maker Checker Lifecycle]]
- [[Business-Rule-Index]]
