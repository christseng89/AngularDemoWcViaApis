---
knowledge_id: v1-15-0-provisional-netting-exceptions
title: "v1.15.0 临时性净额处理例外（'增加從嚴，占用從寬'）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# v1.15.0 临时性净额处理例外（'增加從嚴，占用從寬'）

| 数字项目 | 默认（严格）规则 | 临时性例外 | 例外适用范围 |
|---|---|---|---|
| offBalanceExposure（SHGT 赎回） | 仅在真正 RELEASED 之后才对赎回做净额处理 | 也对与同一 LC 上仍处于 PENDING 状态的 UTILIZE 共享 businessEventId 的赎回做净额处理 | 同时适用于展示数字 **以及** offBalanceExposure 数字本身（即匹配的 A3S 配对）；真正新增、无关联的 SG Issue 或单据到达仍沿用严格的未净额数字进行检查 |
| presentDocsEarmarkApproved（Present Docs） | 在 presentDocsConsumedAt 被设置之前，持续计入已 RELEASED 的 EPLC_EXAMINATION CREATE | 也排除已被某笔仍处于 PENDING 状态的 HONOUR/ACCEPT 引用（referencedTransactionId）的记录 | 仅影响展示——新的 B3 交单自身的充足性检查，以及 AMEND_DECREASE/Confirmation-AMEND-Decrease 自身的检查，两者仍沿用严格的未净额数字 |

## Source Evidence

- `balance-component-api.yaml lines 426-453, 1650-1732`

## Related Knowledge

- OpenAPI Specs — Microservice + Channel API
- [[Business-Rule-Index]]
