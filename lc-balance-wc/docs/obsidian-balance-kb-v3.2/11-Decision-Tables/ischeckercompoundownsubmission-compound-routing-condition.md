---
knowledge_id: ischeckercompoundownsubmission-compound-routing-condition
title: "isCheckerCompoundOwnSubmission ——复合提交路由判定条件"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# isCheckerCompoundOwnSubmission ——复合提交路由判定条件

| Priority（优先级） | Condition checked（检查条件） | Result if condition matches（条件成立时的结果） |
|---|---|---|
| 1 | selectedFunctionStrategy.compoundSubmission.possibleShapes 包含 'documentArrivalWithSg' | 当 selectedCheckerMovement.movementType === 'UTILIZE' 且 businessEventId 已设置时为 true |
| 2 | selectedFunctionStrategy.movementDerivation.amountVsAvailableDerivation === 'SETTLE' | 当 movementType 属于 {FULL_SETTLE, PARTIAL_SETTLE} 且 businessEventId 已设置时为 true |
| 3 | selectedFunctionStrategy.checkerRelease.settlesDocumentArrival | 当 selectedCheckerMovement.referencedTransactionId 已设置时为 true |
| 4（兜底） | selectedCheckerMovement.movementId === makerContext.submitResult?.movementId 且 compoundSubmission.possibleShapes 包含 'confirmationHonourWithReceivable' | 当 movementType === 'HONOUR' 时为 true；否则为 false（此兜底分支根据文档记载，在当前任何真实功能路径下均不可达） |

## Source Evidence

- `transaction-builder.component.ts:272-292`

## Related Knowledge

- Angular Pickers, Eligibility Hints, Orchestrating Shell
- [[Business-Rule-Index]]
