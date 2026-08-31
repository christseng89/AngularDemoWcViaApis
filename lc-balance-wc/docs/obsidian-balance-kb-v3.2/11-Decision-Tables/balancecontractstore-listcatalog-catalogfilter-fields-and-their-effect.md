---
knowledge_id: balancecontractstore-listcatalog-catalogfilter-fields-and-their-effect
title: "BalanceContractStore.listCatalog——CatalogFilter 各字段及其效果"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# BalanceContractStore.listCatalog——CatalogFilter 各字段及其效果

| 过滤字段 | 行为 |
|---|---|
| instrumentType | 必填的相等匹配过滤条件——始终存在 |
| status | 可选的相等匹配；省略时返回所有状态 |
| q | 对 lc_number 做不区分大小写的子字符串匹配（用于输入联想） |
| lcNumber | 对 lc_number 做精确匹配（用于级联的 LC 索引 -> IB/SG 索引选取器）；与 q 不同，绝不做子字符串匹配 |
| tenorFamily: SIGHT（即期族） | tenor_type='SIGHT' OR tenor_type IS NULL |
| tenorFamily: USANCE（远期族） | tenor_type != 'SIGHT' OR tenor_type IS NULL（历史遗留的 tenor 为 NULL 的记录，两个族群都会包含） |
| requireIssueReleased | 存在一笔该合约上 type 为 ISSUE/CREATE 且 status='RELEASED' 的 movement；可选启用，默认 false |
| page / pageSize | 页码从 1 开始，默认 1/10；总数／分页均基于「过滤后」的结果集计算，而非原始表 |

## 来源证据

- `microservices/balance-component/src/store/balanceContractStore.ts:67-279`
- `microservices/balance-component/test/unit/db/schema.test.ts:91-222`

## 相关知识

- Data Model — DB Schema, Migrations, Stores, Types/Money/Errors
- [[Business-Rule-Index]]
