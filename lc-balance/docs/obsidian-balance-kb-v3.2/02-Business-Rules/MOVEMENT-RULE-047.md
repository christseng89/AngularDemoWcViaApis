---
knowledge_id: MOVEMENT-RULE-047
title: "保留付款/凭保函付款并不属于承付 — 产生的是一项追索权资产，而不是干净的申请人应收款（设计文档规则）"
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

# MOVEMENT-RULE-047 — 保留付款/凭保函付款并不属于承付 — 产生的是一项追索权资产，而不是干净的申请人应收款（设计文档规则）

## Status
CONFIRMED

## Business Rule
按照源设计文档，当银行针对存在不符点的单据以保留方式或凭保函向交单人付款时，LC 的或有负债会被解除，但由此产生的表内资产必须标记为 recourse=TRUE，并计入『保留付款项下垫款——对交单人有追索权』这一独立的 ECL 分类。这种『保留付款』的变体在 Balance Component 的实际实现中明确没有被建模——ledger.html 参考文档自身即指出，Sight Honour（即期承付）始终仅被建模为单一的『先 Utilize 后 Release』复合步骤，不存在保留/追索权变体。

## Conditions
存在不符点的单据是以保留方式/凭保函付款，而非干净的/放弃不符点的承付

## Result
按设计文档：-或有负债；+保留付款项下垫款——对交单人有追索权（资产，recourse=TRUE）

## Example
一笔存在不符点的 50,000 保留付款，会入账一项追索权垫款，而不是一笔申请人应收款

## Verification Note
已逐字确认设计文档原文。已与独立验证过的『Sight Honour 是单一的先 Utilize 后 Release 复合步骤』这一 ledger.html 规则做了交叉比对，后者明确证实这条保留/追索权路径在实际系统中并未被建模——因此将本条标记为设计文档/未实现范围。

## Source Evidence

Implementation:
- `TF_Contingent_Liability_Lifecycle-en.txt §3.4`

Tests:
- `TF_Balance_Component_Spec-en.txt §12 T17`

## Related Knowledge
- [[BalanceMovement]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
