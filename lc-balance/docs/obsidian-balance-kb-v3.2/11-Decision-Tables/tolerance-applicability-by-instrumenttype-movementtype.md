---
knowledge_id: tolerance-applicability-by-instrumenttype-movementtype
title: "按 InstrumentType × MovementType 划分的容差适用性"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 按 InstrumentType × MovementType 划分的容差适用性

| InstrumentType | movementType | tolerancePct 是否存在？ | 是否套用容差？ | 结果 |
|---|---|---|---|---|
| IPLC_LC | ISSUE | 是 | 是 | ceilingAmount = amount × (1+pct/100) |
| IPLC_LC | AMEND_INCREASE | 是 | 是 | ceilingAmount = amount × (1+pct/100) |
| IPLC_LC | AMEND_DECREASE | 是 | 是 | ceilingAmount = amount × (1+pct/100) |
| IPLC_LC | UTILIZE | 是 | 否 | ceilingAmount = amount（不变） |
| IPLC_LC | ISSUE | null/undefined | 否 | ceilingAmount = amount（恒等） |
| IPLC_LC | ISSUE | '0' | 否（数学上恒等） | ceilingAmount = amount |
| EPLC_LC | ISSUE | 是 | 是 | ceilingAmount = amount × (1+pct/100)，与 IPLC_LC 相同 |
| EPLC_CONFIRMATION | ISSUE | 是 | 是 | ceilingAmount = amount × (1+pct/100)——CONF LIAB |
| EPLC_CONFIRMATION | AMEND | 是 | 是 | ceilingAmount = amount × (1+pct/100)——出口 LC 修改 |
| EPLC_CONFIRMATION | HONOUR | 是 | 否 | ceilingAmount = amount（不变） |
| EPLC_CONFIRMATION | ACCEPT | 是 | 否 | ceilingAmount = amount（不变） |
| SHGT | ISSUE | 是 | 否 | ceilingAmount = amount——防碰撞保护：尽管 movementType 字串相同，SHGT ISSUE ≠ LC ISSUE |
| IPLC_ACCEPTANCE | CREATE | 是 | 否 | ceilingAmount = amount（该 instrumentType 不适用） |
| IPLC_ACCEPTANCE | AMEND_DECREASE | 是 | 否 | ceilingAmount = amount——instrumentType 关卡在 movementType 尚未被考量前就已拒绝 |
| EPLC_ACCEPTANCE | 任意 | 是 | 否 | ceilingAmount = amount（该 instrumentType 不在 TOLERANCE_APPLICABLE_INSTRUMENT_TYPES 之中） |

## Source Evidence

- `src/domain/tolerance.ts:32-68`
- `test/unit/domain/tolerance.test.ts`

## Related Knowledge

- Tolerance / Ceiling Conversion
- [[Business-Rule-Index]]
