---
knowledge_id: ref-field-resolution-mechanics
title: "*Ref 字段解析机制"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# *Ref 字段解析机制

| Ref 字段 | 出现位置 | 解析为 | 是否需要额外的 HTTP 调用？ | 是否跨重复使用被缓存？ |
|---|---|---|---|---|
| balanceContractIdRef | createMovement.request | captured[ref].response.balanceContractId | 否 | 不适用（每次都重新读取 captured 对象） |
| parentLogicalContractIdRef | createMovement.request | GET .../balance -> logicalContractId | 是，仅首次使用时 | 是——缓存在 captured[ref].logicalContractId 上 |
| referencedTransactionIdRef | createMovement.request | captured[ref].response.movementId | 否 | 不适用 |
| movementRef | release / makerSubmit 步骤 | captured[ref].response.movementId | 否（若缺失则跳过，而非报错） | 不适用 |
| contractRef | snapshot 步骤 | captured[ref].response.balanceContractId | 不适用——该字段本身就是 snapshot 调用的目标 | 不适用 |

## Source Evidence

- `backend/server.js:37-46,75-131`
- `backend/test/server.test.js:140-184`

## Related Knowledge

- Business Case Registry (backend orchestrator) + Business Case Runner UI
- [[Business-Rule-Index]]
