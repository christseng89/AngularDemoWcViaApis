---
knowledge_id: submit-vs-approved-general-pattern-by-figure-and-movement-shape
title: "Submit 对比 Approved ——按数字项目与 Movement 形态划分的通用模式"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# Submit 对比 Approved ——按数字项目与 Movement 形态划分的通用模式

| 数字项目 | 增加形态（ISSUE/AMEND_INCREASE/B1/B2-Inc）——Submit 时 | ……Approval 时 | 减少形态（AMEND_DECREASE/UTILIZE/B2-Dec/CLOSE）——Submit 时 | ……Approval 时 |
|---|---|---|---|---|
| Confirmed Balance | 不变 | += ceilingAmount | 不变 | −= ceilingAmount |
| Available Balance | += ceilingAmount | 不变（已经反映过） | −= ceilingAmount | 不变（已经反映过） |
| Pending Earmark Total | += ceilingAmount | 归零 | −= ceilingAmount | 归零 |
| Tight Available Balance | 不变（在 Approved 之前不可见——增加從嚴） | += ceilingAmount | −= ceilingAmount（透过 Pending Decrease Total——占用從寬） | 不变（已经反映过） |

## Source Evidence

- `Balance-Figures-Calculation-Logic.txt lines 348-382 (§5)`

## Related Knowledge

- Balance Figures Calculation Logic + TF Balance Component Mapping Workbook
- [[Business-Rule-Index]]
