---
knowledge_id: checkeract-dispatch
title: "checkerAct() 分派逻辑"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# checkerAct() 分派逻辑

| 顺序 | 条件 | 所采取的动作 |
|---|---|---|
| 1 | isCheckerCompoundOwnSubmission 为 true | 路由至完整的 release()/reject() 复合流程（经由 checkerActions.release()/reject()） |
| 2 | action === 'release' 且 checkerRelease.deferSettlement 且 movementType === (selectedFunction.deferSettlementMovementType ?? 'UTILIZE') | 调用 acknowledgeArrival()——仅持久化 Checker 的确认记录，状态不变 |
| 3 | action === 'release' 且 checkerRelease.releasesExistingMovementInPlace 且 !selectedCheckerMovement.makerSubmittedAt | 被阻止——设置 checkerError，不发起 API 调用 |
| 4（默认） | 以上均不满足 | 调用普通的 api.release(movementId, checkerId) 或 api.reject(movementId, checkerId, 'MANUAL_QUEUE_REJECT') |

## 来源证据

- `transaction-builder.component.ts:419-468`

## 相关知识

- Angular Pickers, Eligibility Hints, Orchestrating Shell
- [[Business-Rule-Index]]
