---
knowledge_id: scope-boundary-contingent-off-balance-sheet-only
title: "范畴边界——仅限或有负债/表外项目"
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

# 范畴边界——仅限或有负债/表外项目

完整的范畴判断说明见 [[Balance Component Overview#範疇之外|余额组件概览的「范畴之外」小节]]，此处不重复展开。

技术要点：
- 文档明确指出 Balance Component 仅负责或有负债/表外风险敞口，所展示的每一组 Dr/Cr 记账对都只是备忘性质，从不触及财务报表科目。
- 表内的相关分支（Honour 产生的已放款应收款、真正的承兑/DPU 负债、保证金、手续费、ECL 减值计提、结算、往来账 nostro）均被明确列为范畴之外，即便原始规格是在同一笔交易单元中一并入账，本文档的每张表格也均不予呈现。

## Source Evidence

- `analysis/contingent-liability-ledger.html .scope-box, .scope-grid (in-scope/out-of-scope lists)`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
