---
knowledge_id: tenor-placeholder-notation
title: "[Tenor] 占位符标记法"
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

# [Tenor] 占位符标记法

当某一事件的 Dr/Cr 记账形态在各期限类型下完全相同时，适用的期限类型只在该行列出一次，并以 [Tenor] 作为科目名称中的字面替代符号——此写法沿袭自原始 Lifecycle 规格自身 §3.2/§3.9/§7.2/§7.7 的约定。此标记仅用于 Folio 1（LC）与 Folio 4（保兑），因为这两者的科目名称会随期限类型变化而带后缀；Folio 2、3、5 所用的科目从不因期限类型而异，因此不出现此占位符。

## Source Evidence

- `analysis/contingent-liability-ledger.html .notation-box`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
