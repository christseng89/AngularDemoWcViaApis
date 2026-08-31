---
knowledge_id: computeceilingamount-decision-flow
title: "computeCeilingAmount() 决策流程"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# computeCeilingAmount() 决策流程

computeCeilingAmount() 依照实际实现的确切顺序，依次应用三道闸门，最终返回原始面值金额或经容差换算后的上限（Ceiling）金额。

```mermaid
flowchart TD
  A["computeCeilingAmount(amount, tolerancePct, movementType, instrumentType)"] --> B["faceAmount = parseMonetaryAmount(amount)"]
  B --> C{"instrumentType 是否属于\n{IPLC_LC, EPLC_LC, EPLC_CONFIRMATION}？"}
  C -- "否（SHGT / IPLC_ACCEPTANCE / EPLC_ACCEPTANCE / 其他）" --> Z["返回未变更的 faceAmount"]
  C -- 是 --> D{"movementType 是否属于\n{ISSUE, AMEND_INCREASE,\nAMEND_DECREASE, AMEND}？"}
  D -- "否（UTILIZE / HONOUR / ACCEPT / CREATE / 其他）" --> Z
  D -- 是 --> E{"tolerancePct 是否为\nnull 或 undefined？"}
  E -- 是 --> Z
  E -- 否 --> F["toleranceFactor = 1 + tolerancePct/100"]
  F --> G["ceilingAmount = faceAmount × toleranceFactor"]
  G --> H["返回 ceilingAmount（Decimal）"]
```

## 来源证据

- `src/domain/tolerance.ts:53-68`

## 相关知识

- 容差／上限换算（Tolerance / Ceiling Conversion）
- [[Business-Rule-Index]]
