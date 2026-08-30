---
knowledge_id: computeoffbalanceexposure-shgt-movement-inclusion-sign
title: "computeOffBalanceExposure——装船保函 movement 的纳入判定与符号"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# computeOffBalanceExposure——装船保函 movement 的纳入判定与符号

| 状态 | movementType | 是否纳入风险敞口？ | 符号／贡献值 |
|---|---|---|---|
| RELEASED | ISSUE | 是 | +ceilingAmount |
| RELEASED | PARTIAL_REDEEM / FULL_REDEEM | 是 | -ceilingAmount |
| PENDING | ISSUE | 是（"占用從寬"） | +ceilingAmount |
| PENDING | PARTIAL_REDEEM / FULL_REDEEM，且 businessEventId 与同一 LC 下某笔 PENDING 的同级 UTILIZE 匹配 | 是（A3S 匹配例外） | -ceilingAmount |
| PENDING | PARTIAL_REDEEM / FULL_REDEEM，独立存在（无匹配的同级记录） | 否（"增加從嚴"） | 排除 |
| CANCELLED / REJECTED / SUPERSEDED | 任意 | 否 | 排除 |
| 任意状态 | movementType 不属于 ISSUE/PARTIAL_REDEEM/FULL_REDEEM | 不适用 | 抛出 Error（防御性处理） |

## 来源证据

- `microservices/balance-component/src/domain/offBalanceExposure.ts:54-74`

## 相关知识

- [[Off-Balance-Sheet Exposure|Off-Balance-Sheet Exposure & Contingent Account Entries]]
- [[Business-Rule-Index]]
