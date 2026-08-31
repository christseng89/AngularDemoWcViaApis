---
knowledge_id: tolerance-ceilingamount-conversion-applicability
title: "Tolerance / ceilingAmount 换算适用性"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# Tolerance / ceilingAmount 换算适用性

| instrumentType | movementType | ceilingAmount 公式 |
|---|---|---|
| IPLC_LC、EPLC_LC、EPLC_CONFIRMATION | ISSUE / AMEND_INCREASE / AMEND_DECREASE / AMEND | amount × (1 + tolerancePct/100) |
| SHGT、IPLC_ACCEPTANCE、EPLC_ACCEPTANCE（任意 movementType） | 任意 | ceilingAmount = amount（面额，永不套用容差，业务已确认） |
| IPLC_LC / EPLC_LC / EPLC_CONFIRMATION | UTILIZE / CREATE / HONOUR / ACCEPT / CLOSE / 任何未列出的 movementType | ceilingAmount = amount，不变 |

## Source Evidence

- `Balance-Figures-Calculation-Logic.txt lines 313-327 (§4)`

## Related Knowledge

- Balance Figures Calculation Logic + TF Balance Component Mapping Workbook
- [[Business-Rule-Index]]
