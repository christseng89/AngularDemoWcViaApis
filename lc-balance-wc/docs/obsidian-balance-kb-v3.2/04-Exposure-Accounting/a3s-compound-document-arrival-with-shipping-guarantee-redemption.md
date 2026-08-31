---
knowledge_id: a3s-compound-document-arrival-with-shipping-guarantee-redemption
title: "A3S — 含 Shipping Guarantee 赎回的复合式提货文件到单"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# A3S — 含 Shipping Guarantee 赎回的复合式提货文件到单

两笔共享同一个 businessEventId 的异动：信用证自身的 UTILIZE，以及与之匹配的 SG 自身的赎回，以 SG 优先的顺序提交，且只有 SG 这一条分支会真正被 Checker 释放。

```mermaid
flowchart TD
  A[Maker 提交 A3S] --> B[创建 SG 赎回分支，PENDING<br/>金额 = MIN(提单金额, SG Available Balance)]
  B --> C[创建 LC UTILIZE 分支，PENDING<br/>金额 = 提单金额，共享 businessEventId]
  C --> D[两条分支皆为 PENDING：<br/>LC Off-Balance Exposure 立即 -= 赎回 ceilingAmount — 匹配配对例外<br/>LC SG-Pending -= 赎回金额<br/>LC Tight Available Balance 净变动为下降或持平]
  D --> E[Checker 审核]
  E --> F[Checker Release]
  F --> G[SG 赎回分支真正 RELEASED<br/>SG Confirmed Balance -= ceilingAmount<br/>LC SG-Approved += 赎回金额]
  F --> H[LC UTILIZE 分支维持 PENDING — EARMARKING<br/>等待 A4/A6 真正敲定]
  H --> I[A4/A6 之后敲定该 UTILIZE<br/>LC Confirmed Balance -= UTILIZE 的 ceilingAmount<br/>Document Arrival Approved += ceilingAmount]
```

## 来源证据

- `Balance-Figures-Calculation-Logic.txt lines 586-682 (A3S table)`

## 相关知识

- Balance Figures Calculation Logic + TF Balance Component Mapping Workbook
- [[Business-Rule-Index]]
