---
knowledge_id: amendment-version-chain-contract-supersession
title: "修改版本链（合约版本替代）"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# 修改版本链（合约版本替代）

说明一次 Amendment 如何生成新的 ACTIVE 合约版本，同时将前一版本标记为 SUPERSEDED，并由部分唯一索引（partial unique index）提供保护。

```mermaid
flowchart TD
  A["针对某个 logical_contract_id 的 Amendment 请求"] --> B["开始事务（Begin transaction）"]
  B --> C["markSuperseded()：将当前 ACTIVE 行的 status 置为 SUPERSEDED，并将 superseded_by_balance_contract_id 设为新行的 id"]
  C --> D["插入新的 balance_contracts 行：contract_version+1，status=ACTIVE，supersedes_balance_contract_id = 旧行的 id"]
  D --> E{"idx_contracts_one_active 部分唯一索引是否满足？"}
  E -- "将出现两个 ACTIVE 行" --> F["插入失败——数据库拒绝写入，不变式得到保证"]
  E -- 满足 --> G["提交事务（Commit transaction）"]
  G --> H["同一个 logical_contract_id 现在解析到新的 ACTIVE 版本；旧版本仍可通过 listVersions() 查询"]
```

## 来源证据

- `Balance-Component-DB-Design.txt §2.4 (lines 93-104), §4.1.1 (lines 211-213), §4.1.2 markSuperseded/listVersions rows (lines 232-246)`

## 相关知识

- DB Design + DB Optimization Analysis Docs
- [[Business-Rule-Index]]
