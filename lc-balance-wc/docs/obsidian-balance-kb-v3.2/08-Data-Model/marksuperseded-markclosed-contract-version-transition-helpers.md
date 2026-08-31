---
knowledge_id: marksuperseded-markclosed-contract-version-transition-helpers
title: "markSuperseded/markClosed 合约版本转换辅助函数"
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

# markSuperseded/markClosed 合约版本转换辅助函数

markSuperseded() 在一次 UPDATE 中，将合约状态改为 SUPERSEDED、设置 superseded_by_balance_contract_id，并写入 effective_to——调用方必须把这个操作和新版本的 insert() 一并包在同一个事务中。由于 superseded_by_balance_contract_id 现在带有真正的外键（FK，migration 13 引入），调用方还必须设置 PRAGMA defer_foreign_keys=ON，这样这条指向尚未插入的后继行的临时前向引用，才会只在 COMMIT 时被检查，而不是逐语句检查。markClosed() 是 A10/B6 Close 的对应函数——将状态改为 CLOSED 并设置 effective_to，在 CLOSE 移动经 Checker 完成 Release 后，作为 release() 的一个副作用被调用。

## 来源证据

- `microservices/balance-component/src/store/balanceContractStore.ts:281-304`
- `microservices/balance-component/test/unit/db/schema.test.ts:261-290`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
