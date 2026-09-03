---
knowledge_id: contingent-account-entry-families-by-instrumenttype-ledger-folio-1-5
title: "按 instrumentType 划分的表外科目分录族（分类账 Folio 1-5）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 按 instrumentType 划分的表外科目分录族（分类账 Folio 1-5）

| instrumentType | 分类账 Folio | establishDr（借方，方向 +1） | establishCr（贷方，方向 +1） | 是否按期限加后缀？ |
|---|---|---|---|---|
| IPLC_LC / EPLC_LC | 1 | 客户在跟单信用证下之负债（Customers' Liability under DC） | 未偿付跟单信用证（Documentary Credits Outstanding） | 是——即期／买方远期／卖方远期 |
| SHGT | 2 | 客户在装船保函下之负债 | 未偿付装船保函 | 否 |
| IPLC_ACCEPTANCE | 3 | 承兑汇票及信托收据垫款——客户负债（备忘） | 承兑汇票及信托收据垫款——未偿付余额（备忘） | 否 |
| EPLC_CONFIRMATION | 4 | 开证行保兑风险敞口 | 未偿付保兑承诺 | 是——即期／远期 |
| EPLC_ACCEPTANCE | 5 | 已保兑承兑汇票及信托收据垫款——客户负债（备忘） | 已保兑承兑汇票及信托收据垫款——未偿付余额（备忘） | 否 |
| EPLC_EXAMINATION | B3 内部 memo | Export Bills — Received, Under Examination (memo) | Export Bills — Contra (memo) | 否；仅供 UI／稽核显示，`accountEntries=null`，不外送 Accounting |
| EPLC_DUE_FROM_ISSUING_BANK / EPLC_ACCEPTANCE_REIMB_RECEIVABLE / EPLC_EXPORT_BILLS_DISCOUNTED | 不适用 | — | — | null——属表内科目，不在表外范畴内 |

## 来源证据

- `microservices/balance-component/src/domain/contingentAccountEntry.ts:41-99`

## 相关知识

- [[Off-Balance-Sheet Exposure|Off-Balance-Sheet Exposure & Contingent Account Entries]]
- [[Business-Rule-Index]]
