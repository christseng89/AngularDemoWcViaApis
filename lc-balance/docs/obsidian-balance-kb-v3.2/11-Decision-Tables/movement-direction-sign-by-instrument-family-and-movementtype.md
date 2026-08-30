---
knowledge_id: movement-direction-sign-by-instrument-family-and-movementtype
title: "MOVEMENT_DIRECTION ——按工具族与 movementType 划分的符号"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# MOVEMENT_DIRECTION ——按工具族与 movementType 划分的符号

| Instrument family（工具族） | movementType | Direction (Confirmed/Available contribution)（方向，对 Confirmed/Available 的贡献） |
|---|---|---|
| IPLC_LC / EPLC_LC | ISSUE | +1 |
| IPLC_LC / EPLC_LC | AMEND_INCREASE | +1 |
| IPLC_LC / EPLC_LC | AMEND_DECREASE | −1 |
| IPLC_LC / EPLC_LC | UTILIZE | −1 |
| IPLC_ACCEPTANCE / EPLC_ACCEPTANCE | CREATE | +1 |
| IPLC_ACCEPTANCE / EPLC_ACCEPTANCE | PARTIAL_SETTLE / FULL_SETTLE | −1 |
| SHGT | ISSUE | +1 |
| SHGT | PARTIAL_REDEEM / FULL_REDEEM | −1 |
| EPLC_CONFIRMATION | AMEND（方向随金额符号而定，不遵循本表） | +1（增额）/ −1（减额），取决于金额符号 |
| EPLC_CONFIRMATION | HONOUR / ACCEPT | −1 |
| EPLC_DUE_FROM_ISSUING_BANK / EPLC_ACCEPTANCE_REIMB_RECEIVABLE | CREATE | +1 |
| EPLC_DUE_FROM_ISSUING_BANK / EPLC_ACCEPTANCE_REIMB_RECEIVABLE | REIMBURSE / RECLASSIFY_OUT | −1 |
| EPLC_EXAMINATION（B3） | CREATE | 从不贡献 Confirmed/Available——MEMO_ONLY（D3） |
| IPLC_LC / EPLC_LC / EPLC_CONFIRMATION | CLOSE（A10/B6） | −1 |

## Source Evidence

- `Balance-Figures-Calculation-Logic.txt lines 265-311 (§3)`

## Related Knowledge

- Balance Figures Calculation Logic + TF Balance Component Mapping Workbook
- [[Business-Rule-Index]]
