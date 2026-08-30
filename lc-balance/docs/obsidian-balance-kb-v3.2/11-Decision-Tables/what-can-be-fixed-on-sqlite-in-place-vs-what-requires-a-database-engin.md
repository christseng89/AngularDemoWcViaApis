---
knowledge_id: what-can-be-fixed-on-sqlite-in-place-vs-what-requires-a-database-engin
title: "哪些问题可在 SQLite 上原地修复，哪些需要更换数据库引擎"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 哪些问题可在 SQLite 上原地修复，哪些需要更换数据库引擎

| 项目 | 能否在 SQLite 上修复？ | 工作量/备注 |
|---|---|---|
| busy_timeout | 能 | 微不足道——仅一行 PRAGMA。已于 2026-08-21 完成 |
| 复合索引 idx_contracts_parent | 能 | 微不足道——CREATE INDEX + 一次迁移。已于 2026-08-21 完成 |
| listCloseEligibleContracts() 的 N+1 问题 | 能 | 工作量小——批量 store 方法 + preFetched 参数。已于 2026-08-21 完成 |
| LIKE 前缀匹配 / FTS5 | 能（尚未完成） | 工作量小——纯查询层改写；出于业务取舍刻意未做 |
| OFFSET -> keyset 分页 | 能（尚未完成） | 工作量小——纯查询层改写；出于业务取舍刻意未做（目前无此需求，且会触及 API） |
| 规范化拆分为 movement_actions / movement_snapshots 表 | 能（尚未完成） | 工作量中至大——需新增表 + store 层改写；与数据库引擎无关，但为配合 PostgreSQL 迁移而延后处理 |
| 自引用列上的 FK 约束 | 能 | 工作量中等——需要「重建表」流程。已于 2026-08-21 完成，与 CHECK 约束一并处理 |
| 枚举列上的 CHECK 约束 | 能 | 工作量中等——同样的重建表流程。已于 2026-08-21 完成 |
| 行级锁：同一 LC 串行化，不同 LC 之间绝不互相阻塞 | 不能——属架构层面限制 | 必须以 PostgreSQL（SELECT...FOR UPDATE，范围限定于 balance_contract_id）或 MySQL/InnoDB 取代 SQLite；任何 schema 或索引层面的改动都无法达成 |

## Source Evidence

- `Balance-Component-DB-Optimization-Analysis.txt §3 (lines 166-209)`

## Related Knowledge

- DB Design + DB Optimization Analysis Docs
- [[Business-Rule-Index]]
