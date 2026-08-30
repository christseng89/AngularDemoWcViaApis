---
knowledge_id: MOVEMENT-RULE-048
title: "无保兑的出口 LC 通知不入任何或有负债，也不产生任何资产（设计文档规则）"
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

# MOVEMENT-RULE-048 — 无保兑的出口 LC 通知不入任何或有负债，也不产生任何资产（设计文档规则）

## Status
CONFIRMED

## Business Rule
按照源设计文档，一家纯粹作为通知行参与出口 LC 的银行，对受益人不承担独立的付款承诺；仅凭通知这一行为，永远不会入任何一类或有负债、任何表内资产，也不会产生任何一类风险敞口。Balance Component 实际的 instrumentType 集合中根本没有『仅通知』这一记录类型——该系统只会在真正加具保兑时才建模 EPLC_CONFIRMATION，这与本条规则一致（并不矛盾），只不过本条规则描述的是该系统本就不单独跟踪的一种情形。

## Conditions
bank_role = ADVISING（未加具保兑）

## Result
所有类别的余额均为零；仅确认通知手续费收入（如有）

## Example
一笔未加具保兑就被通知的出口 LC，不显示任何一类余额变动

## Verification Note
已逐字确认设计文档原文；与实际的 InstrumentType 枚举（不存在可与之矛盾的『仅通知』记录类型）在『缺省即一致』的意义上相符。

## Source Evidence

Implementation:
- `TF_Contingent_Liability_Lifecycle-en.txt §6`

Tests:
- `TF_Balance_Component_Spec-en.txt §12 T11`

## Related Knowledge
- [[BalanceMovement]]
- Export role determines exposure
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
