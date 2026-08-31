---
knowledge_id: channel-function-catalog-a1-a9-b1-b5
title: "渠道功能目录（A1–A9、B1–B5）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 渠道功能目录（A1–A9、B1–B5）

| 代码 | 名称 | 买卖方向 | instrumentType | hasParent | currencyMode | submitsTransaction | compoundLegs（复合分录数） |
|---|---|---|---|---|---|---|---|
| A1 | 开立 LC | IMPORT（进口） | IPLC_LC | false | INPUT | true | 1（ISSUE） |
| A2 | LC 修改 | IMPORT（进口） | IPLC_LC | false | CARRIED | true | 1（AMEND_INCREASE \| AMEND_DECREASE） |
| A3 | 单据到达 | IMPORT（进口） | IPLC_LC | false | CARRIED | true | 1（UTILIZE） |
| A3S | 单据到达（含装船保函） | IMPORT（进口） | IPLC_LC | false | CARRIED | true | 2（先 SHGT 赎回，后 LC UTILIZE） |
| A4 | 即期结算 | IMPORT（进口） | IPLC_LC | false | CARRIED | false | 1（放行既有 UTILIZE，无需 Maker 提交） |
| A6 | 承兑（远期） | IMPORT（进口） | IPLC_ACCEPTANCE | true | CARRIED | true | 1（CREATE，放行时对所引用的单据到达做终结处理） |
| A7 | 承兑结算 | IMPORT（进口） | IPLC_ACCEPTANCE | true | CARRIED | true | 1（FULL_SETTLE \| PARTIAL_SETTLE） |
| A8 | 装船保函（开立） | IMPORT（进口） | SHGT | true | CARRIED | true | 1（ISSUE） |
| A9 | 装船保函（赎回） | IMPORT（进口） | SHGT | true | CARRIED | true | 1（FULL_REDEEM \| PARTIAL_REDEEM） |
| B1 | 保兑 LC | EXPORT（出口） | EPLC_CONFIRMATION | false | INPUT | true | 1（ISSUE） |
| B2 | 保兑 LC 修改 | EXPORT（出口） | EPLC_CONFIRMATION | false | CARRIED | true | 1（AMEND） |
| B3 | 交单 | EXPORT（出口） | EPLC_EXAMINATION | true | CARRIED | true | 1（CREATE，MEMO_ONLY） |
| B4 | 承付／承兑 | EXPORT（出口） | EPLC_CONFIRMATION | false | CARRIED | true | 2（即期）或 4（远期） |
| B5 | 结算——偿付／到期 | EXPORT（出口） | EPLC_ACCEPTANCE | true | CARRIED | true | 2（FULL_SETTLE + REIMBURSE） |

## 来源证据

- `balance-component-channel-api.yaml lines 832-982`

## 相关知识

- OpenAPI Specs — Microservice + Channel API
- [[Business-Rule-Index]]
