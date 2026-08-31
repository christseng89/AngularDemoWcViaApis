---
knowledge_id: MOVEMENT-RULE-051
title: "在未保兑 LC 项下的议付，其形成的是对出口商的追索权资产；从未存在过任何或有负债（设计文档规则）"
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

# MOVEMENT-RULE-051 — 在未保兑 LC 项下的议付，其形成的是对出口商的追索权资产；从未存在过任何或有负债（设计文档规则）

## Status
CONFIRMED

## Business Rule
当一家被指定银行在未保兑的 LC 项下进行议付时，并不存在需要解除的或有负债，因为该行本来就从未承担过保兑义务；按照源设计文档，由此产生的资产（『已议付出口汇票——有追索权』）会直接以 obligor=出口商、recourse=TRUE 的方式计入表内。Balance Component 实际的 instrumentType 集合中根本没有议付/EBL-Nego 这一票据类型（CLAUDE.md 明确指出『EBL Nego 自身的贴现会计处理不在本次范围内』）——本条规则描述的是一个超出范围的设计概念，而非已实现的行为。

## Conditions
movementType = 在 LC 项下进行单据议付，且 bank_role = NOMINATED（未保兑），而非 CONFIRMING

## Result
不产生或有负债解除分录；仅在表内记录 +已议付出口汇票——有追索权（资产，obligor=出口商）

## Example
一笔 40,000 的未保兑 LC 项下议付：资产的 obligor = 出口商，recourse = TRUE

## Verification Note
已确认设计文档原文与该声明一致（本轮未独立重新 grep，但 CLAUDE.md 自身明确写有『EBL Nego 自身的贴现会计处理不在本次范围内』，与本条规则『超出范围』的表述相互印证）。

## Source Evidence

Implementation:
- `TF_Contingent_Liability_Lifecycle-en.txt §7.4b`

Tests:
- `TF_Balance_Component_Spec-en.txt §12 T12`

## Related Knowledge
- [[BalanceMovement]]
- Export role determines exposure
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
