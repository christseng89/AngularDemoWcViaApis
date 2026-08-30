---
knowledge_id: balancecontractstore-thin-repository-over-balance-contracts
title: "BalanceContractStore ——覆盖在 balance_contracts 之上的轻量级仓储层"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# BalanceContractStore ——覆盖在 balance_contracts 之上的轻量级仓储层

BalanceContractStore 封装了 insert/findById/findActiveByLogicalContractId/findActiveByNaturalKey/findByNaturalKey/listVersions/listCatalog/markSuperseded/markClosed 等方法。它本身不包含任何业务逻辑（业务逻辑位于 src/domain/）；其自身的文档注释说明它只负责读写行数据、并强制数据库层面的唯一性约束。findByNaturalKey（区别于 findActiveByNaturalKey）刻意省略了 ACTIVE 过滤条件，使得查询类场景（Look Up Current Balance/Inquire Events）仍能通过自然键解析出一个 CLOSED 合约；其排序规则是优先返回存在的 ACTIVE 行，否则返回按 created_at 排序最新的一行。

## 来源证据

- `microservices/balance-component/src/store/balanceContractStore.ts:1-9,122-217`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
