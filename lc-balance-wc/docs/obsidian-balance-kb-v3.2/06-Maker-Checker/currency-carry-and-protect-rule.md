---
knowledge_id: currency-carry-and-protect-rule
title: "Currency 携带与保护规则（Carry-and-Protect Rule）"
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

# Currency 携带与保护规则（Carry-and-Protect Rule）

A1/B1 是唯一真正允许选择 Currency 的功能（以下拉框形式渲染，选项来自 CURRENCY_OPTIONS）；其余所有功能都从 selectedParent 携带 Currency（优先检查 selectedParent，因为 hasParent 类功能在第 1 步就会解析出该值），若不存在则回退到 selectedContract，并在两者之一解析出结果的瞬间锁定该字段。

## Source Evidence

- `src/app/transaction-builder/builder-fields.ts lines 57-60, 104-114`
- `src/app/transaction-builder/function-policy.spec.ts lines 105-115`
- `src/app/transaction-builder/function-policy.ts lines 77-85`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
