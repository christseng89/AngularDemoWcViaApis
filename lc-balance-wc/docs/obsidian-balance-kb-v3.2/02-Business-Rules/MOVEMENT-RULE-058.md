---
knowledge_id: MOVEMENT-RULE-058
title: "出口期限归并为 Sight/Usance 两类 —— B4 不区分源规格中 Buyer's Usance 的 'Case 1' 与 'Case 2'"
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

# MOVEMENT-RULE-058 — 出口期限归并为 Sight/Usance 两类 —— B4 不区分源规格中 Buyer's Usance 的 'Case 1' 与 'Case 2'

## 状态
CONFIRMED

## 业务规则
B4 自身的 movementTypeFromContractTenor 对 Sight 期限的 Confirmation 推导为 HONOUR，其余一律推导为 ACCEPT，将源规格自身 Sight/Buyer's Usance/Seller's Usance 三分处理归并为两类——它并不区分「Case 1」（Buyer's Usance 按即期兑付、不产生 Acceptance）与「Case 2」（Buyer's Usance 通过承兑/延期付款方式兑付、产生 Acceptance）。每一笔非 Sight 的 Confirmation 都被当作会产生 Acceptance 的路径处理。

## 触发条件
B4 HONOUR/ACCEPT 推导，任意非 Sight 的 tenorType

## 结果
Folio 4 自身的 Tenor Type 一栏只会取值「Sight」或「Usance」，从不出现三分处理；每一笔 Usance 类 Confirmation 都会额外触发 Folio 5 的 Acceptance 影子备忘录建立分录

## 示例
一笔按源规格的 Case 1 本应即期兑付、不产生 Acceptance 票据的 Buyer's Usance 已确认信用证，在 Balance Component 中始终会被导向 B4 的 ACCEPT 分支处理

## 验证说明
本轮已直接阅读了准确的 Implementation Notes 段落原文；与所述内容逐字相符。

## 来源证据

实现:
- `analysis/contingent-liability-ledger.html — Implementation Notes, 'Export tenor collapse (Sight/BU/SU -> Sight/Usance)' paragraph`

测试:
- （未引用直接测试证据）

## 相关知识
- [[BalanceMovement]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
