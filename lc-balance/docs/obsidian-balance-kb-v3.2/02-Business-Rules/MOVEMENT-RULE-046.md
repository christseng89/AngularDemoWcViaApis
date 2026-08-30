---
knowledge_id: MOVEMENT-RULE-046
title: "现金保证金按用信比例分摊使用，绝不会在首次提用时一次性全额扣减（设计文档规则）"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-046 — 现金保证金按用信比例分摊使用，绝不会在首次提用时一次性全额扣减（设计文档规则）

## Status
CONFIRMED

## Business Rule
按照源设计文档，当一笔 LC 承付为部分承付时，所持有的现金保证金必须按照实际提用的金额比例分摊使用（margin_applied = drawn × margin_pct），而不是在第一次提示单据时就全额释放。Balance Component 自身实际的数据模型或代码中并不存在保证金/现金抵押品的概念（types.ts 中没有 margin 字段）——这是一条设计文档层面的规则，描述的是该组件当前实现范围之外的预期行为（保证金/抵押品的跟踪目前并不属于 Balance Component 实际持久化或计算的内容）。

## Conditions
针对一笔持有现金保证金的 LC，发生了一次部分承付/提用

## Result
margin_applied = drawn_amount × margin_pct（按比例分摊）

## Example
一笔保证金为 20% (20,000) 的 100,000 LC，首次提用 50,000：margin_applied = 10,000，而不是 20,000

## Verification Note
已通过 grep 逐字确认设计文档原文（精确找到了 margin_applied = drawn × margin_pct 公式）。特此标明这仅属于设计文档范围，因为在本轮及此前的历次抽取中检查的实际 TypeScript 类型/领域代码中，任何地方都没有出现保证金相关概念。

## Source Evidence

Implementation:
- `TF_Contingent_Liability_Lifecycle-en.txt §3.5`

Tests:
- `TF_Balance_Component_Spec-en.txt §12 T1`

## Related Knowledge
- [[BalanceMovement]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
