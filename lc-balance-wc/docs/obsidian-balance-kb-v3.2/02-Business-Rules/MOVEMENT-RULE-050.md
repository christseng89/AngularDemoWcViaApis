---
knowledge_id: MOVEMENT-RULE-050
title: "买方远期只有 SELF / REFINANCING_BANK 两种出资方变体 — 不存在 APPLICANT 变体（设计文档规则）"
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

# MOVEMENT-RULE-050 — 买方远期只有 SELF / REFINANCING_BANK 两种出资方变体 — 不存在 APPLICANT 变体（设计文档规则）

## Status
CONFIRMED

## Business Rule
买方远期（Buyer's Usance）的定义是由买方（申请人）承担贴现成本；若改由受益人自行承担成本贴现，则该结构属于卖方/发货人远期，而不是买方远期。按照源设计文档，买方远期的 funding_party 枚举只有恰好两个合法取值（SELF、REFINANCING_BANK）；不存在 APPLICANT 取值或第三种变体。需要说明的是：Balance Component 实际的 TenorType 枚举（SIGHT/BUYERS_USANCE/SELLERS_USANCE/DP/DA）根本没有 funding_party 字段——这一概念完全停留在设计文档层面，并未在实际运行系统的数据模型中实现。

## Conditions
一笔 LC/动账正在被归类为买方远期，并被赋予一个 funding_party 取值

## Result
funding_party ∈ {SELF, REFINANCING_BANK} 且仅限于此

## Example
按设计文档，一次尝试将 funding_party = APPLICANT 会在校验环节被拒绝

## Verification Note
已通过 grep 逐字确认设计文档原文（funding_party ∈ {SELF, REFINANCING_BANK}、『APPLICANT does not exist』两处均如声明所述精确存在）。已标记为仅限设计文档范围——实际的 TypeScript 类型中不存在 funding_party 字段。

## Source Evidence

Implementation:
- `TF_Contingent_Liability_Lifecycle-en.txt §3.6`

Tests:
- `TF_Balance_Component_Spec-en.txt §12 T8,T9`

## Related Knowledge
- [[BalanceMovement]]
- Two-dimension tenor model
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
