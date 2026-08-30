---
knowledge_id: checkeractionsservice-release-dispatch-by-compound-submission-shape
title: "CheckerActionsService.release() 按组合提交形态分发"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# CheckerActionsService.release() 按组合提交形态分发

一次 Release 点击如何依据所选功能被路由到正确的多 leg 释放链，包括每个分支所依赖的跨会话 businessEventId/referencedTransactionId 兜底机制。

```mermaid
flowchart TD
  S[release ctx called] --> A{checkerRelease.settlesDocumentArrival? A6/B4}
  A -- Yes --> A1{sourceAlreadyReleasedBeforePick? B4}
  A1 -- Yes --> A1a[resolveSettlesDocumentArrivalIds then releaseAcceptance: release primary, branch to Due-from-Issuing-Bank OR Acceptance-liability+Receivable]
  A1 -- No --> A1b[resolveSettlesDocumentArrivalIds: release source first, then releaseAcceptance for the new Acceptance primary. A6]
  A -- No --> B{documentArrivalWithSg? A3S}
  B -- Yes --> B1[resolveLinkedMovementId SG redeem: release SG redemption, then acknowledgeUtilize on the source UTILIZE - never released]
  B -- No --> C{amountVsAvailableDerivation SETTLE? B5}
  C -- Yes --> C1[resolveLinkedMovementId Reimburse: release primary Acceptance settle, then release matched Reimbursement Receivable]
  C -- No --> D[Plain single release: selectedCheckerMovement.movementId or submitResult.movementId]
  A1a --> OUT[CheckerActionOutcome]
  A1b --> OUT
  B1 --> OUT
  C1 --> OUT
  D --> OUT
```

## Source Evidence

- `checker-actions.service.ts:49-128`

## Related Knowledge

- Angular Checker 面板 + Actions
- [[Business-Rule-Index]]
