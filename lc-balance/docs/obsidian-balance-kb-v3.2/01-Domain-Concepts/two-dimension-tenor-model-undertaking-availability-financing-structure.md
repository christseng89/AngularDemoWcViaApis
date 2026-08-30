---
knowledge_id: two-dimension-tenor-model-undertaking-availability-financing-structure
title: "二维付款期限模型：undertaking_availability × financing_structure × funding_party 取代单一 tenor 标志位"
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

# 二维付款期限模型：undertaking_availability × financing_structure × funding_party 取代单一 tenor 标志位

买方远期（Buyer's Usance, BU）并非本行对受益人自身承诺的属性——在 BU/UPAS 结构下，受益人通常按即期收款；"远期（usance）"描述的只是申请人一方的融资安排。若将其压缩为单一的"付款期限类型"，就会被迫把 BU 处理成一种特例。正确的模型需要两个相互独立的维度：undertaking_availability（SIGHT｜ACCEPTANCE｜DEF_PAYMENT｜NEGOTIATION——支配本行对受益人的义务）与 financing_structure（NONE｜BUYER_USANCE｜SELLER_USANCE——支配结算/融资路径），再加上 funding_party（SELF｜REFINANCING_BANK，仅适用于买方远期——刻意不存在"APPLICANT"这一 funding_party 取值）。在这两个维度下，买方远期就是 availability=SIGHT ＋ financing=BUYER_USANCE 的简单组合，而或有负债解除逻辑对 BU-A（本行自有资金放款）与 BU-B（由代理行/再融资银行放款，需要将行际分录做毛额化处理，而非建模为单一贷款）都能保持一致。这是一个比实际代码库中简单的 `TenorType: SIGHT | BUYERS_USANCE | SELLERS_USANCE | DP | DA` 枚举更为丰富的模型——参见术语不一致的差距条目。

## 来源证据

- `TF_Balance_Component_Spec-en.txt §4: 'tenorType is the business classification...It is never read by accounting, risk or regulatory logic'`
- `TF_Contingent_Liability_Lifecycle-en.txt §2.4: 'you need two dimensions, not one'`
- `TF_Contingent_Liability_Lifecycle-en.txt §3.6: 'There is no third buyer's usance variant... funding_party ∈ {SELF, REFINANCING_BANK}'`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
