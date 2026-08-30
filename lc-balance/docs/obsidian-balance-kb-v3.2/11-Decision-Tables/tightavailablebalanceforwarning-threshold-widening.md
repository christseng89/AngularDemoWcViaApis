---
knowledge_id: tightavailablebalanceforwarning-threshold-widening
title: "tightAvailableBalanceForWarning ——阈值放宽"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# tightAvailableBalanceForWarning ——阈值放宽

| 功能形态 | 放宽条件 | 放宽后的阈值 |
|---|---|---|
| A3S（documentArrivalWithSg） | arrivalSgSnapshot 为 null | 原始 tightAvailableBalance（不放宽） |
| A3S（documentArrivalWithSg） | arrivalSgSnapshot 存在 | 原始值 + arrivalSgSnapshot.confirmedBalance |
| B4（movementType 为 HONOUR 或 ACCEPT） | selectedPayMovement 为 null | 原始 tightAvailableBalance（不放宽） |
| B4（movementType 为 HONOUR 或 ACCEPT） | selectedPayMovement 存在 | 原始值 + selectedPayMovement.ceilingAmount |
| 其余所有功能 | 不适用 | 原始 tightAvailableBalance |

## Source Evidence

- `maker-panel.component.ts:796-808`

## Related Knowledge

- Angular Maker Panel + Submit Orchestration
- [[Business-Rule-Index]]
