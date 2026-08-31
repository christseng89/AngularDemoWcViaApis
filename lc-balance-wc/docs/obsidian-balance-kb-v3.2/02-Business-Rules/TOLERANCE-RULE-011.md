---
knowledge_id: TOLERANCE-RULE-011
title: "UCP 600 Art. 30(a) 金额容差（僅此一項）應驅動 max_liability；Art. 30(b) 數量容差不應如此"
domain: Balance
category: Business Rule
status: INFERRED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - tolerance
  - inferred
---

# TOLERANCE-RULE-011 — UCP 600 Art. 30(a) 金额容差（仅此一项）应驱动 max_liability；Art. 30(b) 数量容差不应如此

## Status
INFERRED

## Business Rule
设计文档原则：一笔 LC 的最大合约责任（max_liability）应仅由 Art. 30(a) 的"约/大约"（about/approximately）金额容差来抬升；Art. 30(b) 的 ±5% 数量容差仅属于单据审查层面的属性，绝不能用于抬升已入账的 ceiling/max_liability 数值。该文档建议将 amount_tolerance_pct（仅对应 30(a)）与 quantity_tolerance_pct 作为两个独立字段分别追踪，contingent 应以 max_liability 为准来驱动。

## Conditions
LC/Confirmation 的票面金额带有"约/大约"限定语（Art. 30(a)），相对于带有明确数量容差声明（Art. 30(b)）的情形。

## Result
仅为设计意图：max_liability = face_amount × (1 + amount_tolerance_pct)，仅使用 30(a) 的容差。

## Example
一笔"约 USD 100,000"的 LC → max_liability = 110,000；30(b) 的 5% 数量容差不得将已入账责任推高至 105,000。

## Verification Note
已从候选条目原本的 CONFIRMED 降级为 INFERRED。本规则的唯一证据来源是一份设计/原理说明文档（analysis/TF_Contingent_Liability_Lifecycle-en.txt），在证据优先级排序中属于倒数第二等级。已直接核对实际实现代码（types.ts、tolerance.ts），确认代码库中并不存在独立的 quantity_tolerance_pct 字段——只有单一的 tolerancePct 字段，且 computeCeilingAmount() 完全没有 30(a)/30(b) 区分的概念（在 src/ 与 test/ 全库搜索 'quantity_tolerance'/'Art. 30' 均无任何匹配）。代码目前的单一容差行为恰好与文档所述原则相符（因为根本不存在会被错误纳入的 30(b) 追踪逻辑），但文档自身所建议的具体数据模型并未被实现——这属于有抱负的设计构想，而非任何地方实际强制执行的系统规则。此区分完全没有测试证据支持。

## Source Evidence

Implementation:
- `converted/TF_Contingent_Liability_Lifecycle-en.txt:255-265 (verified content matches, incl. the recommended dual-field data model)`

Tests:
- (no direct test evidence cited)

## Related Knowledge
- [[Tolerance Processing]]
- Tolerance 存在的原因——UCP 600 Art. 30(a) 金额容差 vs. Art. 30(b) 数量容差
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
