---
knowledge_id: import-lc-discrepancy-branch-from-document-receipt-to-honour-refusal-w
title: "进口信用证不符点分支——从收单到兑付、拒付、放弃不符点、保留追索权，或由 SG 触发的强制兑付"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# 进口信用证不符点分支——从收单到兑付、拒付、放弃不符点、保留追索权，或由 SG 触发的强制兑付

单据到达本身不产生任何风险确认效果（D3，属物理事件），但会启动一个为期 5 个银行营业日的 Art. 16(d) 审单时钟。结果可分为四个分支，外加第五条由 SG 触发、使拒付在经济上失去意义（尽管法律权利仍然存在）的路径。

```mermaid
flowchart TD
  A[收到单据 —— 仅作 MEMO_ONLY 备忘，无风险效果，启动 Art.16(d) 5 个银行营业日审单时钟] --> B{审单}
  B -->|单证相符| C[兑付 —— 解除信用证或有负债，产生表内应收款]
  B -->|单证不符| D{银行在 5 个银行营业日内的回应}
  D -->|拒付，并发出符合规定的拒付通知| E[单据留存待交单人处置 —— 或有负债维持不变]
  E -->|申请人事后放弃不符点| C
  D -->|申请人预先接受放弃不符点| C
  D -->|保留追索权 / 凭保函付款| F[或有负债解除 —— 转为保留追索权项下垫款，recourse=TRUE，非纯净应收款]
  F -->|保函后续被索偿且交单人偿还| G[通过 LC_RESERVE_CALLED 恢复或有负债]
  D -->|5 个银行营业日内未发出符合规定的拒付通知| H[Art.16f 丧失拒付权自动触发 —— 系统事件]
  H --> I[承保风险权重调整为 100% —— 兑付成为强制性]
  I --> C
  J[该批货物已开立 SG 保函] -.使拒付在经济上失去意义.-> D
  J --> K[discrepancy_refusal_economically_unavailable = TRUE —— Art.16 项下法律拒付权仍名义上存在]
  K --> C
```

## 来源证据

- `TF_Balance_Component_Spec-en.txt §3.4 branch diagram`
- `TF_Contingent_Liability_Lifecycle-en.txt §13 Revised lifecycle architecture (Import)`

## 相关知识

- Foundational Design-Rationale Docs（TF Balance Spec + Contingent Liability Lifecycle 基础设计原理文档）
- [[Business-Rule-Index]]
</content>
