---
knowledge_id: five-distinct-exposure-numbers-must-be-named-separately-never-merged-i
title: "五个不同的风险暴露数字必须分别命名，绝不能合并成单一的 'exposureAmount'"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 五个不同的风险暴露数字必须分别命名，绝不能合并成单一的 'exposureAmount'

同一笔基础交易会合理地产生五个彼此之间无法用常数关系互相对账的不同数字，其中任意两个都可能在同一事件下朝相反方向变动：(1) accounting_balance——总额 GL 数字，从不轧差（用于财务报表/审计）；(2) ead_economic——MAX 规则＋内部权重调整＋抵押品（用于定价/风险偏好/管理层视角）；(3) ecl_ead——IFRS 9 预期提用金额 × PD × LGD（用于拨备）；(4) ead_regulatory——总额 × CCF，且仅在 ccf_source=REGULATORY 时适用（用于资本/监管报送）；(5) limit_utilisation——按义务人与限额类型分别计算，包含预留额度（earmarks）（用于信用控制/前台）。LC_ACCEPT（信用证承兑）是最典型的例证：在这同一事件上，(1) 总额上升，(2) 保持不变，(3) 从表外重新分段为已提用，(4) 随 CCF 从 20%→已提用(100%) 而上升，(5) 从信用证子限额移至承兑子限额。监管报送绝不能以 ead_economic 为依据驱动（I10）。

## 来源证据

- `TF_Balance_Component_Spec-en.txt §8.5: 'The five exposure numbers — name them, do not merge them'`
- `TF_Contingent_Liability_Lifecycle-en.txt §10.2 Rule 6`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
