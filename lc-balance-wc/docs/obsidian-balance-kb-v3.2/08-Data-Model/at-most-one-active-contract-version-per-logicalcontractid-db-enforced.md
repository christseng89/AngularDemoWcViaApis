---
knowledge_id: at-most-one-active-contract-version-per-logicalcontractid-db-enforced
title: "每个 logicalContractId 至多一个 ACTIVE 合约版本，由数据库强制保证"
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

# 每个 logicalContractId 至多一个 ACTIVE 合约版本，由数据库强制保证

idx_contracts_one_active 是建立在 balance_contracts(logical_contract_id) 上、条件为 status='ACTIVE' 的部分 UNIQUE 索引，因此数据库本身会拒绝同一个 logicalContractId 出现第二个 ACTIVE 行，这与任何应用层检查无关。idx_contracts_logical_version 则是另一个独立的 UNIQUE 索引，建立在 (logical_contract_id, contract_version) 上，用于保证每个版本号只有一行。

## 来源证据

- `microservices/balance-component/src/db/schema.ts:107-114`
- `microservices/balance-component/test/unit/db/schema.test.ts:69-77`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
