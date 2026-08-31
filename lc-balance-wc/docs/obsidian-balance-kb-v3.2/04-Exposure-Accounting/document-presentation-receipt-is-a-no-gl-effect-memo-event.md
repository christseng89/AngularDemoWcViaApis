---
knowledge_id: document-presentation-receipt-is-a-no-gl-effect-memo-event
title: "单据／提示单据收讫是不影响总账的备忘事件"
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

# 单据／提示单据收讫是不影响总账的备忘事件

单据实际到达（A3 进口 Document Arrival、B3 出口 Present Docs）是一个真实存在的生命周期事件，但完全不产生任何或有负债的总账效果——之所以特意以备忘（memo）标记的方式独立列出一行，正是为了让 A3/B3 能被清楚可见地纳入记录，而不是在 Folio 1/4 中无声无息地缺失，这依据的是设计原则 D3（"单据到达是一个物理事件……只有法律事件才会变动余额"）以及源规格本身的 MEMO_ONLY 分类。

## 来源证据

- `analysis/contingent-liability-ledger.html Folio 1 r-memo row, Folio 4 r-memo row, Notes item 2`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
