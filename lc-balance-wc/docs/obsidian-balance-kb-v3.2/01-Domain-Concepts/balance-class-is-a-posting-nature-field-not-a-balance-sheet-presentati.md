---
knowledge_id: balance-class-is-a-posting-nature-field-not-a-balance-sheet-presentati
title: "Balance class is a posting-nature field, not a balance-sheet presentation answer (D6)"
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

# Balance class is a posting-nature field, not a balance-sheet presentation answer (D6)

账本记录的是经济事实本身（balance_class / ledger_natural_class —— CONTINGENT、ON_BALANCE_ASSET、ON_BALANCE_ASSET_CONTRA、ON_BALANCE_LIABILITY、PROFIT_AND_LOSS、MEMO_ONLY）；而列示方式（某项目是否在报表正表上呈现为资产/负债、是总额还是净额）则是一个**独立**、依报告日期推导而得的栏位，绝不由配置直接断言。这项分离机制，正是为了防止例如结算/存放同业（nostro）/同业存款（vostro）账户（其余额可能变换正负号）被赋予一个固定的列示分类，也防止净额抵销资格（IAS 32.42——即该权利在所有相关方违约/无力清偿/破产情形下仍具法律可执行性，且具备结算意图）被配置旗标直接指定：一旦净额抵销资格评估失败或缺失，结果一律解析为 GROSS（总额），绝不会解析为净额，也绝不会报错。

## Source Evidence

- `TF_Balance_Component_Spec-en.txt §2.4 D6, §2.4.1, §2.4.2, §2.5`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
