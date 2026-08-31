---
knowledge_id: exposurenature-actual-tagging-for-acceptance-dpu
title: "承兑/DPU 的 exposureNature=ACTUAL 标记"
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

# 承兑/DPU 的 exposureNature=ACTUAL 标记

一旦汇票被承兑或产生 DPU（Deferred Payment Undertaking），该风险敞口在 IFRS 9 下即脱离或有负债科目，转为一项现时、无条件的表内金融负债，并由一笔表内应收款相匹配——本文档并未展示这两条腿中的任何一条。Balance Component 自身的领域模型也体现了这一点：一笔承兑（Acceptance）动作被标记为 exposureNature = ACTUAL，而非 CONTINGENT，以区别于真正的或有负债对（LC/SG/保兑配对），即便 Folio 3 与 Folio 5 仍会为 MIS/MT 对账目的显示一组"影子备忘"Dr/Cr 记账对。

## Source Evidence

- `analysis/contingent-liability-ledger.html Folio 3 .callout 'Classification note'`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
