---
knowledge_id: checkeractionsservice-release-routing-by-function-shape
title: "CheckerActionsService.release() 按功能形态的路由方式"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# CheckerActionsService.release() 按功能形态的路由方式

| FunctionStrategy 条件 | 适用对象 | 放行链路 | 成功后的结果类型 |
|---|---|---|---|
| checkerRelease.settlesDocumentArrival && sourceAlreadyReleasedBeforePick | B4（来源为 B3，已单独放行过） | resolveSettlesDocumentArrivalIds() -> releaseAcceptance()（先放行主分录，再分支至开证行应收分录 [HONOUR] 或 承兑负债+应收 分录 [ACCEPT]）——绝不重复放行来源分录 | released |
| checkerRelease.settlesDocumentArrival && !sourceAlreadyReleasedBeforePick | A6（来源为远期单据到达，仅需确认） | resolveSettlesDocumentArrivalIds() -> 放行来源分录 -> releaseAcceptance() 放行新增的承兑主分录 | released |
| compoundSubmission.possibleShapes 包含 'documentArrivalWithSg' | A3S | resolveLinkedMovementId(SG redeem) -> 放行 SG 赎回 -> 对来源 UTILIZE 调用 acknowledgeUtilize()（该分录从不放行） | documentArrivalAcknowledged |
| movementDerivation.amountVsAvailableDerivation === 'SETTLE' | B5 | resolveLinkedMovementId(Reimburse) -> 放行承兑结算主分录 -> 放行匹配的偿付应收 | released |
| 以上均不适用 | A1-A5（普通）、A7-A9、B1-B3 | 对 selectedCheckerMovement.movementId ?? submitResult.movementId 执行单一的普通 release() | released |

## 来源证据

- `checker-actions.service.ts:49-128`

## 相关知识

- Angular Checker Panel + Actions
- [[Business-Rule-Index]]
