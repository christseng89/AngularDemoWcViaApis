---
knowledge_id: tenortype-enum
title: "TenorType 枚举"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# TenorType 枚举

| 值 | 含义 | 备注 |
|---|---|---|
| SIGHT | 即期 | 标准现行值 |
| BUYERS_USANCE | 买方远期（UPAS 准远期） | 标准现行值 |
| SELLERS_USANCE | 卖方远期 | 标准现行值 |
| DP / DA | 历史/旧版兼容值 | 本服务目前没有任何功能会产生 DP/DA |

## Source Evidence

- `Balance-Component-DB-Design.txt §5.5 (lines 567-579)`

## Related Knowledge

- DB Design + DB Optimization Analysis Docs
- [[Business-Rule-Index]]
