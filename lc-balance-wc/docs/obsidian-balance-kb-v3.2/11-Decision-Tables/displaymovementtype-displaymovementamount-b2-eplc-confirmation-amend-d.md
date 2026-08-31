---
knowledge_id: displaymovementtype-displaymovementamount-b2-eplc-confirmation-amend-d
title: "displayMovementType() / displayMovementAmount() — B2（EPLC_CONFIRMATION/AMEND）去符号化处理"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# displayMovementType() / displayMovementAmount() — B2（EPLC_CONFIRMATION/AMEND）去符号化处理

| instrumentType | movementType | amount sign | displayMovementType() | displayMovementAmount() |
|---|---|---|---|---|
| EPLC_CONFIRMATION | AMEND | amount >= 0（含恰为 0） | AMEND_INCREASE | 数值不变（金额转字符串） |
| EPLC_CONFIRMATION | AMEND | amount < 0 | AMEND_DECREASE | Math.abs(amount) 转字符串 |
| EPLC_CONFIRMATION | AMEND | amount 为 null | AMEND_INCREASE（0 < 判定为 false，未落入默认的 '>= 0' 分支；null 会绕过 amount != null 的守卫条件） | ''（空字符串，由 amount != null 检查守卫） |
| 其他任意 (instrumentType, movementType) 组合 | 不适用 | 不适用 | movementType 原样传出（若为 null/undefined 则为 ''） | amount 原样传出（若为 null/undefined 则为 ''） |

## Source Evidence

- `balance-component.model.ts:665-687`
- `balance-component.model.spec.ts:683-718`

## Related Knowledge

- Angular Domain Model (balance-component.model.ts)
- [[Business-Rule-Index]]
