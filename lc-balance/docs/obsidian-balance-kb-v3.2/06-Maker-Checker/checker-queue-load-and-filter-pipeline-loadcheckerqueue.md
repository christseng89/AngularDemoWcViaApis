---
knowledge_id: checker-queue-load-and-filter-pipeline-loadcheckerqueue
title: "Checker Queue 加载与过滤流水线（loadCheckerQueue）"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# Checker Queue 加载与过滤流水线（loadCheckerQueue）

loadCheckerQueue() 如何把一份合约的原始 movement 列表，转换成呈现给 Checker 的、按功能限定范围且已通过 4-eyes 门控的一组可操作 PENDING 项目。

```mermaid
flowchart TD
  A[loadCheckerQueue called] --> B{checkerContractId set?}
  B -- No --> Z[No-op: emit movementPicked null and queueReloaded, no API call]
  B -- Yes --> C[GET listMovements contractId]
  C -->|error| ZE[checkerItems = empty, checkerLoading = false, queueLoadSucceeded NOT emitted]
  C -->|success| D[Filter each returned movement]
  D --> E{status == PENDING?}
  E -- No --> X[Excluded]
  E -- Yes --> F{movementTypeMatchesFunction selectedFunction, movementType?}
  F -- No --> X
  F -- Yes --> G{deferSettlement function AND movementType == deferMovementType AND acknowledgedAt set?}
  G -- Yes --> X
  G -- No --> H{requiresEarmarked function AND movementType == UTILIZE?}
  H -- Yes --> I{acknowledgedAt missing OR makerSubmittedAt missing?}
  I -- Yes --> X
  I -- No --> J[Included in checkerItems]
  H -- No --> J
  J --> K[queueLoadSucceeded emitted]
```

## Source Evidence

- `checker-panel.component.ts:232-293`

## Related Knowledge

- Angular Checker 面板 + Actions
- [[Business-Rule-Index]]
