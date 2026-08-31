---
knowledge_id: shipping-guarantee-lifecycle-instrument-based-two-stage-discharge
title: "船公司保函（Shipping Guarantee）生命周期——以票据本身为准的两阶段解除"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# 船公司保函（Shipping Guarantee）生命周期——以票据本身为准的两阶段解除

SG 或有负债按发票金额的上浮比例开立，只能通过真正来自承运人一方的行为解除（绝不能以匹配单据金额的方式解除）。存在两个独立阶段：收到单据（仅变更状态，不涉及 GL）与承运人放行（全额解除，无余额残留）。

```mermaid
flowchart TD
  A[SG_ISSUE —— 借：客户对 SG 项下负债 / 贷：SG 未平仓余额，按发票上浮比例开立，例如发票金额的 110%] --> B[状态：OUTSTANDING 未平仓]
  B -->|银行收到相应单据| C[状态：REDEEMABLE 可赎回 —— 不涉及 GL 变动，或有负债不变]
  C -->|承运人退回 SG 正本，或承运人出具书面放行函，或已提交 B/L 提单予以证明| D[SG_RELEASE —— 借：SG 未平仓余额 / 贷：客户对 SG 项下负债，全额解除，无残留]
  D --> E[状态：RELEASED -> CLOSED 已解除 -> 已结案]
  B -->|承运人就该 SG 提出索偿| F[SG_CLAIM —— 解除 SG 或有负债 ＋ 对申请人的索偿应收款，Stage 3 ECL]
  F --> G[状态：CLAIMED -> CLOSED 已索偿 -> 已结案]
  C -->|可赎回状态超过 30 天| H[账龄监控预警 —— 未及时催缴承运人属操作性失误，构成真实存续风险暴露]
```

## 来源证据

- `TF_Contingent_Liability_Lifecycle-en.txt §4.4, §13 Revised lifecycle architecture`

## 相关知识

- Foundational Design-Rationale Docs（TF Balance Spec + Contingent Liability Lifecycle 基础设计原理文档）
- [[Business-Rule-Index]]
</content>
