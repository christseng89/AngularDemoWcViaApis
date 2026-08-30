---
knowledge_id: MOVEMENT-RULE-057
title: "进口承兑对 Buyer's Usance 与 Seller's Usance 一视同仁 —— 偏离了源规格中更严格的 BU/SU 会计拆分处理（ledger.html 已记录的偏差）"
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

# MOVEMENT-RULE-057 — 进口承兑对 Buyer's Usance 与 Seller's Usance 一视同仁 —— 偏离了源规格中更严格的 BU/SU 会计拆分处理（ledger.html 已记录的偏差）

## 状态
CONFIRMED

## 业务规则
源规格自身的推导矩阵中，Buyer's Usance 的兑付会直接路由至 LC_HONOUR_BU_A/LC_HONOUR_BU_B，在真正的 Buyer's Usance 情形下根本不会创建任何 Acceptance/DPU 票据——只有 Seller's Usance 才会触发 LC_ACCEPT。而 Balance Component 的 A6 功能却将 Buyer's Usance 与 Seller's Usance 一并作为期限选项提供，二者都会通过完全相同的影子备忘录（shadow-memo）对创建一笔 IPLC_ACCEPTANCE 记录，并不区分二者下游的会计处理方式。这一点在 ledger.html 参考文档自身的 Implementation Notes 中已被明确记录为一项已知偏差。

## 触发条件
A6 CREATE，且 tenorType = BUYERS_USANCE

## 结果
在 Balance Component 当前行为中，Buyer's Usance 项下的信用证始终会获得一笔 Acceptance 影子备忘录记录，这与源规格的规定相违背

## 示例
针对 Buyer's Usance 的 IPLC_LC 执行 A6，所过账的 Folio-3 建立分录，与针对 Seller's Usance 执行 A6 所产生的分录完全相同

## 验证说明
本轮已直接阅读了准确的 Implementation Notes 段落原文；与所述内容逐字相符，包括 LC_HONOUR_BU_A/B 的路由细节。

## 来源证据

实现:
- `analysis/contingent-liability-ledger.html — Implementation Notes, 'Import Acceptance under Buyer's Usance is a further, related divergence' paragraph`

测试:
- （未引用直接测试证据）

## 相关知识
- [[BalanceMovement]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
