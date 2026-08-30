---
knowledge_id: export-confirmation-role-gated-exposure-and-honour-negotiation-accepta
title: "出口保兑——角色决定风险暴露，兑付/议付/承兑三分支"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# 出口保兑——角色决定风险暴露，兑付/议付/承兑三分支

同一笔出口信用证会根据 bank_role 产生零条、一条或两条风险暴露分录，一旦保兑成立，还会依据可用付款期限（tenor availability）进一步分支。

```mermaid
flowchart TD
  A[收到出口信用证] --> B{bank_role}
  B -->|ADVISING 仅通知行| Z1[无或有负债、无资产——仅履行 Art.9 通知义务]
  B -->|NOMINATED 被指定但未行使| Z2[无或有负债、无资产]
  B -->|NOMINATED 被指定并议付（未保兑）| Z3[无或有负债——出口押汇 Export Bills Negotiated，对出口商有追索权]
  B -->|CONFIRMING 已实际通知保兑| C[产生保兑或有负债——义务人＝开证行＋所在国家]
  C --> D[交单 -> 5 天审单期，仅作 MEMO_ONLY 备忘]
  D -->|单证相符| E{availableWith / 付款期限}
  E -->|即期，任何情形| F[CNF_HONOUR_SIGHT——解除或有负债，＋应收开证行款项，无追索权]
  E -->|买方远期 BU，可即期/议付| F
  E -->|买方或卖方远期 BU/SU，本行以承兑/延期付款方式承付| G[CNF_ACCEPT——解除或有负债，＋表内保兑承兑负债＋应收开证行款项]
  E -->|卖方远期 SU，仅开证行可承付| H[不产生 CNF_ACCEPT——开证行自身的承兑仅确定到期日]
  D -->|单证不符，按核准方式转递| I[保兑状态不变——仅履行代理角色]
  D -->|单证不符，保留追索权项下付款| J[解除保兑——转为有追索权垫款，义务人＝出口商]
  D -->|5 天届满仍无有效拒付| K[EX_DOC_PRECLUDED 视为丧失拒付权——权重调整为 100%]
  K --> F
```

## 来源证据

- `TF_Contingent_Liability_Lifecycle-en.txt §6, §7.3, §7.4, §7.5, §7.6, §13 (Export)`

## 相关知识

- Foundational Design-Rationale Docs（TF Balance Spec + Contingent Liability Lifecycle 基础设计原理文档）
- [[Business-Rule-Index]]
