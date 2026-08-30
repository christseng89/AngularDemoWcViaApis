---
knowledge_id: maximum-exposure-basis-ceiling-liability
title: "最大风险敞口基准上限负债"
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

# 最大风险敞口基准上限负债

在信用证／跟单信用证业务实务中，当存在容差条款时，开证行或保兑行的或有负债并不固定于面值金额——银行必须能够兑付面值加上约定容差百分比范围内的提示单据。本模块所计算的"Ceiling"／"最大信用证负债"数值，代表的正是这一最坏情况下的风险敞口基准，也是可保兑余额／可用余额实际用来比较的对象，与独立追踪、且从不使用 ceilingAmount 的原始"面值金额"（Face Amount）有所区别。

## 来源证据

- `src/domain/tolerance.ts:1-27（模块文档注释）`
- `test/unit/domain/tolerance.test.ts:1-48`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
