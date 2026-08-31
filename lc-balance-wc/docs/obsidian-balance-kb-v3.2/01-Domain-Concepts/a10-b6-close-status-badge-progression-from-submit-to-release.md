---
knowledge_id: a10-b6-close-status-badge-progression-from-submit-to-release
title: "A10/B6 Close — status/badge progression from Submit to Release"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# A10/B6 Close — status/badge progression from Submit to Release

CLOSE 异动自身状态标签的业务流程，独立于上方的预扣（earmark）流程之外——CLOSE 永远优先走专属的 CLOSING/CLOSED 分支，不进入预扣/一般异动的分岔；而合约层级的徽章（另一个不同的函数 contractStatusBadgeClass）只有在该异动真正被 Release、且 ContractStatus 本身翻转为 CLOSED 之后，才会永久性地变为红色。

```mermaid
flowchart TD
  A[A10/B6 Maker 提交\n异动状态=PENDING，movementType=CLOSE\nContractStatus 仍为 ACTIVE] --> B[异动显示：CLOSING\n徽章 --negative]
  B --> C[索引列：contractStatusBadgeClass\nACTIVE + closingPending=true]
  C --> D[索引徽章：红色 / 标签 CLOSING]
  D --> E[Checker 放行]
  E --> F[异动状态=RELEASED\nContractStatus 翻转为 CLOSED]
  F --> G[异动显示：CLOSED\n徽章 --negative]
  G --> H[索引列：contractStatusBadgeClass\nCLOSED]
  H --> I[索引徽章：红色 / 标签 CLOSED]
```

## Source Evidence

- `balance-component.model.ts:598-663 (isCloseMovement, displayStatus/statusBadgeClass CLOSE branch, contractStatusBadgeClass/contractStatusLabel)`
- `CLAUDE.md decision log: 'A10/B6 Close — write off the remaining Confirmed Balance and retire the LC/Confirmation' and 'U03 應該是CLOSING狀態' closingPending fix`

## Related Knowledge

- Angular Domain Model (balance-component.model.ts)
- [[Business-Rule-Index]]
