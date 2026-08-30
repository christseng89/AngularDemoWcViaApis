---
knowledge_id: version-chain-modeling-for-amendments
title: "修订（Amendment）的版本链建模"
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

# 修订（Amendment）的版本链建模

对合约的一次修订（Amendment），绝不是一次就地 UPDATE。而是插入一笔全新的 balance_contracts 行，contract_version 递增，并透过 supersedes_balance_contract_id 指回上一个版本；上一个版本会被标记为 SUPERSEDED，并填入 superseded_by_balance_contract_id。logical_contract_id 是贯穿“同一份合约”所有版本的识别符。这样做保留了完整的修订历史，而不是直接覆盖掉——代价是需要一条局部唯一索引（partial-unique-index）不变量，来保证任何时刻每个逻辑合约都恰好只存在一个 ACTIVE 版本。

## 来源证据

- `Balance-Component-DB-Design.txt §2.4 (lines 93-104)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
