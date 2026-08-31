---
knowledge_id: contractstatus-enum
title: "ContractStatus 枚举"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# ContractStatus 枚举

| 值 | 含义 | 备注 |
|---|---|---|
| ACTIVE | 当前生效版本 | 每个 logical_contract_id 最多只能有一笔，由 idx_contracts_one_active 强制约束 |
| SUPERSEDED | 已被后续修改版本取代 | 当经由 markSuperseded() 插入新的 ACTIVE 版本时，会设置在原有那一行上 |
| CLOSED | 合约已关闭 | A10/B6 关闭功能自 2026-08-21 起上线——确实在使用中，并非仅作预留 |
| CANCELLED | 合约已作废 | 预留状态，供未来流程使用 |

## 来源证据

- `Balance-Component-DB-Design.txt §5.2 (lines 516-529)`

## 相关知识

- DB Design + DB Optimization Analysis Docs
- [[Business-Rule-Index]]
