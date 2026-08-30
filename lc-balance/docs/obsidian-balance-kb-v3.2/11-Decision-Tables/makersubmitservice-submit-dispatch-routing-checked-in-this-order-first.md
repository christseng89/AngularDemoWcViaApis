---
knowledge_id: makersubmitservice-submit-dispatch-routing-checked-in-this-order-first
title: "MakerSubmitService.submit() 分发路由（按此顺序依次检查，命中即止）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# MakerSubmitService.submit() 分发路由（按此顺序依次检查，命中即止）

| # | Condition（条件） | Shape invoked（调用的处理形态） | createMovement call count（createMovement 调用次数） |
|---|---|---|---|
| 1 | compoundSubmission.possibleShapes 包含 documentArrivalWithSg 且 selectedArrivalSg 已设置 且 arrivalSgSnapshot 已设置 | submitDocumentArrivalWithSg（A3S） | 2（先 SG 赎回，再 LC UTILIZE） |
| 2 | compoundSubmission.possibleShapes 包含 confirmationHonourWithReceivable 且 model.movementType === 'HONOUR' 且 selectedContract 已设置 | submitConfirmationHonourWithReceivable（B4 即期） | 2（先 Honour，再 Due-From-Issuing-Bank CREATE） |
| 3 | compoundSubmission.possibleShapes 包含 confirmationAcceptWithReceivable 且 selectedContract 已设置 | submitConfirmationAcceptWithReceivable（B4 远期） | 3（Accept、Acceptance CREATE、Receivable CREATE） |
| 4 | movementDerivation.amountVsAvailableDerivation === 'SETTLE' 且 model.instrumentType === 'EPLC_ACCEPTANCE' 且 selectedContract 已设置 | submitAcceptanceSettleWithReceivable（B5） | 2 次 createMovement + 1 次 resolveContract（Settle、解析 receivable 合约、REIMBURSE） |
| 5（默认） | 以上均未命中 | submitPlain | 1 |

## Source Evidence

- `maker-submit.service.ts:66-85`

## Related Knowledge

- Angular Maker Panel + Submit Orchestration
- [[Business-Rule-Index]]
