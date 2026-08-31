---
knowledge_id: only-one-candidate-auto-pick-convention
title: "唯一候选自动选取惯例"
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

# 唯一候选自动选取惯例

本范围所涉及的 Step-2 选择器中反复出现的一种模式：当恰好只存在一个合格候选项时（A3S 自身的未结清 SG 列表、A4/A6/B4 自身的可付款动账列表，包括搜索将过滤后的集合收窄至恰好一项的情形），选择器会自动选中该候选项，并触发与真实用户手动选取完全相同的结果/回调，同时在界面上显示“自动选取”提示。之所以要在搜索收窄结果时重新触发，是因为 IndexPicker 自身的 `autoPickedHint` 是依据 `items.length === 1` 触发的，而自动选取本身却只在加载时执行过一次。

## Source Evidence

- `picker-selection.service.ts:120-123`
- `picker-selection.service.ts:344-346`
- `picker-selection.service.ts:400-402`
- `picker-selection.service.ts:412-429`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
