---
knowledge_id: tolerance-ceilingamount-conversion
title: "容差 / ceilingAmount 换算"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，参见 [[Source-to-Knowledge-Map|来源知识对照表]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 容差 / ceilingAmount 换算

ceilingAmount = amount × (1 + tolerancePct/100)，仅在 instrumentType 为 IPLC_LC、EPLC_LC 或 EPLC_CONFIRMATION，且 movementType 为 ISSUE、AMEND_INCREASE、AMEND_DECREASE 或 AMEND 时适用。其余所有组合一律采用 ceilingAmount = amount 原值不变——SHGT 与承兑（Acceptance）的金额始终以面值计算，此为业务已确认事项，即便其合约本身恰好带有 tolerancePct 数值也不例外。这是一项双重条件判断（instrumentType 与 movementType 须同时匹配），而非单一字段查找。

## Source Evidence

- `Balance-Figures-Calculation-Logic.txt lines 313-327 (§4 Tolerance / ceilingAmount Conversion)`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
