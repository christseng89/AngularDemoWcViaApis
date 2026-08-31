---
knowledge_id: b3-b4-present-docs-earmark-provisional-netting
title: "B3 → B4 Present Docs 圈存临时性净额处理"
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

# B3 → B4 Present Docs 圈存临时性净额处理

一笔仍处于 PENDING 状态、引用了某个已 RELEASED 的 B3 提示单据的 B4（Honour/Acceptance），会在 B4 一被 Submit 的当下，就立即把该笔提示单据从 Present Docs Earmark（Approved）中临时性地剔除，而不必等到 B4 真正 Approved 之后——因为 B4 一旦被 Submit，其对该特定提示单据的消耗就已是板上钉钉、自我平衡的必然结果。这项净额处理只作用于显示层面，仅在 assembleSnapshot() 内部透过 derivePresentDocsProvisionallyConsumedIds() 完成；presentDocsConsumedAt 本身要等到 B4 真正 Release 时才会被写入，而 B3 自身的新提示单据充分性检查、以及 B2-Decrease 自身的充分性检查，两者都依然针对未经净额处理的原始数字保持严格——因此一笔真正独立的交易，绝不会因为另一笔交易的临时净额处理而占到便宜。

## 来源证据

- `Balance-Figures-Calculation-Logic.txt lines 109-126 (banner: Present Docs Earmark basis)`
- `Balance-Figures-Calculation-Logic.txt lines 1144-1216 (B4 table and its own live-verified U02 worked example)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
