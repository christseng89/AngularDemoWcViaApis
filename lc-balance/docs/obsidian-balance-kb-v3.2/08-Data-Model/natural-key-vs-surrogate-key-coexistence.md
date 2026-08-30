---
knowledge_id: natural-key-vs-surrogate-key-coexistence
title: "自然键与代理键并存"
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

# 自然键与代理键并存

balance_contract_id（UUID）是数据库层面的代理主键；lc_number/ib_number/sg_number/leg_seq 组成了用户实际用来搜索的、面向业务的自然键，两者通过 idx_contracts_naturalkey 与 findActiveByNaturalKey() 相互桥接。之所以刻意不把自然键当作主键，是因为同一个逻辑合约会随着版本链累积出多个版本与修订，因此自然键会在各版本之间重复出现——只有 balance_contract_id 才能唯一锁定某一个具体版本。

## 来源证据

- `Balance-Component-DB-Design.txt §2.6 (lines 119-126)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
