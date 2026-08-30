---
knowledge_id: checksagainstplainavailable-which-of-the-tight-tier-functions-also-has
title: "checksAgainstPlainAvailable——紧口径分层中哪些功能同时具备普通可用余额分层"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# checksAgainstPlainAvailable——紧口径分层中哪些功能同时具备普通可用余额分层

| 条件 | 结果 |
|---|---|
| movementTypeChecksAvailableBalance(movementType)——即该 movementType 属于 DECREASING_MOVEMENT_TYPES | true |
| isAmendDecreaseDirection 为 true（A2 的 AMEND_DECREASE 或 B2 的 AMEND+减少方向） | true |
| B3（针对别名 EPLC_CONFIRMATION 的 CREATE） | false——仅有紧口径分层，没有普通分层 |
| A8（带别名父级的 ISSUE） | false——仅有紧口径分层，没有普通分层 |

## 来源证据

- `maker-panel.component.ts:339-341, 388-405`

## 相关知识

- Angular Maker Panel + Submit Orchestration
- [[Business-Rule-Index]]
