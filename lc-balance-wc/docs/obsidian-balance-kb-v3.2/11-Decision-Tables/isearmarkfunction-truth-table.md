---
knowledge_id: isearmarkfunction-truth-table
title: "isEarmarkFunction() 真值表"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# isEarmarkFunction() 真值表

| instrumentType | movementType | phase | Result（结果） |
|---|---|---|---|
| IPLC_LC | UTILIZE | undefined / 'primary' / 'create' | true |
| IPLC_LC | UTILIZE | 'finalize' | false |
| EPLC_EXAMINATION | CREATE | undefined / 'primary' / 'create' | true |
| EPLC_EXAMINATION | CREATE | 'finalize' | false |
| IPLC_LC | ISSUE / AMEND_INCREASE / 其他任意 | 任意 | false |
| EPLC_EXAMINATION | AMEND / 其他任意 | 任意 | false |
| EPLC_CONFIRMATION / SHGT / EPLC_LC / 其他任意 instrumentType | 任意 | 任意 | false |
| undefined / null | undefined / null | 任意 | false |

## Source Evidence

- `balance-component.model.ts:534-541`
- `balance-component.model.spec.ts:638-679`

## Related Knowledge

- Angular Domain Model (balance-component.model.ts)
- [[Business-Rule-Index]]
