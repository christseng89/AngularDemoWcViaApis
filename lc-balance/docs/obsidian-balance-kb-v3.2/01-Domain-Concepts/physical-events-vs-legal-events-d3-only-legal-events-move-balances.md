---
knowledge_id: physical-events-vs-legal-events-d3-only-legal-events-move-balances
title: "物理事件与法律事件之分（D3）——只有法律事件才能变动余额"
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

# 物理事件与法律事件之分（D3）——只有法律事件才能变动余额

这是贯穿整个事件目录的一条结构性区分：单据抵达银行柜台是一个物理事件，不产生任何风险确认效果；而兑付、承兑、拒付与放弃不符点则是法律事件，只有法律事件才被允许变动余额。这正是无论在进口还是出口生命周期中，都将单据收讫/审单一律作 MEMO_ONLY 处理（仅作操作性备忘，无风险效果）的理论依据，也与实际 Balance Component 中 EPLC_EXAMINATION 本身即为 MEMO_ONLY、从不过账 accountEntries 的做法一致（见 CLAUDE.md 记录的 B3 重新设计历史）——交单预留（Present-Docs earmark）是一个物理/操作层面的事实，尚不构成法律事件。

## 来源证据

- `TF_Balance_Component_Spec-en.txt §3.4: 'Arrival of documents does not crystallise anything... operational memo only, no risk effect'`
- `TF_Contingent_Liability_Lifecycle-en.txt §1 D3: 'Physical events and legal events are different events...Only legal events move balances.'`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
