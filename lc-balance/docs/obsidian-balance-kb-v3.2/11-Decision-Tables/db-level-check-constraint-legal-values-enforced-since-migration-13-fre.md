---
knowledge_id: db-level-check-constraint-legal-values-enforced-since-migration-13-fre
title: "数据库层 CHECK 约束合法值（自 migration 13／全新数据库 schema.ts 起强制生效）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 数据库层 CHECK 约束合法值（自 migration 13／全新数据库 schema.ts 起强制生效）

| 表 | 字段 | 合法值 | 是否可为 Null？ |
|---|---|---|---|
| balance_contracts | instrument_type | IPLC_LC, EPLC_LC, IPLC_ACCEPTANCE, EPLC_ACCEPTANCE, SHGT, EPLC_CONFIRMATION, EPLC_DUE_FROM_ISSUING_BANK, EPLC_ACCEPTANCE_REIMB_RECEIVABLE, EPLC_EXPORT_BILLS_DISCOUNTED, EPLC_EXAMINATION | 否（NOT NULL） |
| balance_contracts | status | ACTIVE, SUPERSEDED, CLOSED, CANCELLED | 否（NOT NULL） |
| balance_contracts | tenor_type | SIGHT, BUYERS_USANCE, SELLERS_USANCE, DP, DA | 是（对 SHGT／承兑／审单为 NULL） |
| balance_movements | movement_type | ISSUE, CREATE, AMEND_INCREASE, AMEND, AMEND_DECREASE, UTILIZE, HONOUR, ACCEPT, PARTIAL_REDEEM, FULL_REDEEM, REIMBURSE, RECLASSIFY_OUT, PARTIAL_SETTLE, FULL_SETTLE, CLOSE | 否（NOT NULL） |
| balance_movements | exposure_nature | CONTINGENT, ACTUAL, MEMO | 否（NOT NULL） |
| balance_movements | status | PENDING, RELEASED, REJECTED, CANCELLED, SUPERSEDED | 否（NOT NULL） |

## 来源证据

- `microservices/balance-component/src/db/schema.ts:19-153`
- `microservices/balance-component/src/db/migrations.ts:160-263`

## 相关知识

- Data Model — DB Schema, Migrations, Stores, Types/Money/Errors
- [[Business-Rule-Index]]
