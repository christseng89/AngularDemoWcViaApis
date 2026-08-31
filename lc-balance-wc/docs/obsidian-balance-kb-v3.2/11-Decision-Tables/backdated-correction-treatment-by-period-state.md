---
knowledge_id: backdated-correction-treatment-by-period-state
title: "按会计期间状态划分的追溯调整（backdated correction）处理方式"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 按会计期间状态划分的追溯调整（backdated correction）处理方式

| effective_date 所在期间 | 处理方式 | 下游影响 |
|---|---|---|
| 未结账（Open） | 以 booking_date = effective_date 入账 | 从 effective_date 起重新计算费用摊销、预期信用损失（ECL）、利息与汇率 |
| 已结账，当前财政年度 | 在当前未结账期间入账；利息／汇率计算仍沿用 effective_date | 从 effective_date 起重新计算；差额落在当前期间 |
| 已结账，以前财政年度 | 在当前未结账期间入账；产生一笔跨期调整（prior-period adjustment），标记待复核 | 从 effective_date 起重新计算；跨期调整需披露 |
| 任意期间，且该事件为冲正 | 按 original_event_date 冲正，再依上述各行规则重新入账 | 两笔分录均重新计算 |

## 来源证据

- `TF_Balance_Component_Spec-en.txt §5.4 Backdating decision table`

## 相关知识

- Foundational Design-Rationale Docs (TF Balance Spec + Contingent Liability Lifecycle)
- [[Business-Rule-Index]]
