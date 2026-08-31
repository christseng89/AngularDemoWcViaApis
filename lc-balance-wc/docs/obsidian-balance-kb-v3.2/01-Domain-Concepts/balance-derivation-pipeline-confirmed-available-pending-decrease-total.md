---
knowledge_id: balance-derivation-pipeline-confirmed-available-pending-decrease-total
title: "Balance derivation pipeline (Confirmed -> Available -> Pending Decrease Total -> Face Amount)"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# Balance derivation pipeline (Confirmed -> Available -> Pending Decrease Total -> Face Amount)

这四个数字全部在查询时刻由同一份原始异动数组计算而来，从不存储。Confirmed Balance 是仅计入 RELEASED 状态的基础数字；Available Balance 在此基础上叠加了 PENDING 异动的净影响；Pending Decrease Total 是另一个范围更窄、独立计算的加总（仅计入呈减少型态的 PENDING 部分），作为其他地方（这三个文件之外）计算 Tight Available Balance 的一个组成部分；Face Amount 则使用同一份异动清单独立计算，使用原始的 amount 而非 ceilingAmount。

```mermaid
flowchart TD
  M["异动清单\n（movementType、ceilingAmount、amount、status）"]
  M --> F1{"status == RELEASED？"}
  F1 -->|是| CB["signedAmount = ceilingAmount x MOVEMENT_DIRECTION\n加总 -> Confirmed Balance"]
  F1 -->|否| SKIP1[不计入 Confirmed Balance]
  CB --> AB["Available Balance = Confirmed Balance\n+ PENDING 异动的 signedAmount 加总"]
  M --> F2{"status == PENDING？"}
  F2 -->|是| SGN{"signedAmount 为负？"}
  SGN -->|是| PDT["加上 abs(signedAmount)\n-> Pending Decrease Total"]
  SGN -->|否，即 PENDING 增加| SKIP2[不计入 Pending Decrease Total]
  F2 -->|否| SKIP3[不计入 Pending Decrease Total]
  M --> F3{"status == RELEASED 且\nmovementType 属于\n{ISSUE, AMEND_INCREASE, AMEND_DECREASE}？"}
  F3 -->|是| FA["amount x MOVEMENT_DIRECTION\n加总 -> Face Amount"]
  F3 -->|否| SKIP4[不计入 Face Amount，例如 UTILIZE]
  PDT -.->|在 balanceService.ts 的 assembleSnapshot 中另作使用| TAB["Tight Available Balance\n（完整公式不在这三个文件范围内）"]
```

## Source Evidence

- `microservices/balance-component/src/domain/balanceDerivation.ts (full file)`

## Related Knowledge

- Balance Derivation, Status Transition, Tenor Routing
- [[Business-Rule-Index]]
