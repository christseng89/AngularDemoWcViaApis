---
knowledge_id: index-reference-balance-contracts-and-balance-movements
title: "索引参考——balance_contracts 与 balance_movements"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 索引参考——balance_contracts 与 balance_movements

| Index（索引） | Columns（列） | Type（类型） | Purpose（用途） |
|---|---|---|---|
| idx_contracts_logical_version | (logical_contract_id, contract_version) | UNIQUE | 确保同一逻辑合约下每个版本号唯一 |
| idx_contracts_one_active | (logical_contract_id) WHERE status='ACTIVE' | UNIQUE（部分索引） | 任一时刻同一逻辑合约至多存在一个 ACTIVE 版本——版本链模型的关键完整性约束 |
| idx_contracts_naturalkey | (instrument_type, lc_number, ib_number, sg_number, leg_seq) | 非唯一 | 自然键查找（GET /balance-contracts）及 LC 编号目录查询；不强制自然键唯一性（详见 §8.4 的差距说明） |
| idx_contracts_catalog | (instrument_type, status) | 非唯一 | 目录选择器按产品类型 + 状态分页 |
| idx_contracts_parent | (parent_logical_contract_id, instrument_type) | 非唯一，复合索引（2026-08-21 修复，此前为单列） | 表外风险敞口查询：查找某 LC 名下所有 SHGT/Acceptance/EPLC_EXAMINATION 子合约 |
| idx_movements_idempotency | (balance_contract_id, event_seq) | UNIQUE | 幂等性键——数据库层拦截重复的事件提交 |
| idx_movements_contract_status | (balance_contract_id, status) | 非唯一 | Confirmed/Available Balance 推导的主要访问路径 |
| idx_movements_business_event | (business_event_id) | 非唯一 | 复合提交（A3S/B5）的跨合约关联查询 |

## Source Evidence

- `Balance-Component-DB-Design.txt §4.1.1 (lines 205-223), §4.2.6 (lines 413-423)`

## Related Knowledge

- DB Design + DB Optimization Analysis Docs
- [[Business-Rule-Index]]
