---
knowledge_id: post-balance-movements-creation-decision-flow
title: "POST /balance-movements——创建决策流程"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# POST /balance-movements——创建决策流程

创建路由在返回 201/200/400/409 之前端到端做了些什么，依据 routes/balanceMovements.ts 以及在 app.test.ts 中被验证的服务层守卫逻辑整理而成。

```mermaid
flowchart TD
  A[POST /balance-movements] --> B{zod schema 是否有效？<br/>字段是否齐全、MonetaryAmount 格式、<br/>amount>0、货币小数位数}
  B -- 否 --> B1[400 REQUEST_VALIDATION_FAILED]
  B -- 是 --> C{合约能否解析，且<br/>(balanceContractId, eventSeq)<br/>已经存在？}
  C -- 是 --> C1[200 OK，返回原始 Movement<br/>幂等空操作]
  C -- 否 --> D{movementType 是创建类<br/>类型 ISSUE/CREATE，<br/>且自然键已处于 ACTIVE？}
  D -- 是 --> D1[409 NATURAL_KEY_ALREADY_EXISTS]
  D -- 否 --> E{sourceTransactionRef 是否已在<br/>该合约上被使用过？}
  E -- 是 --> E1[400 REQUEST_VALIDATION_FAILED]
  E -- 否 --> F{根合约自身的 ISSUE<br/>尚未 RELEASED，且本次<br/>并非 ISSUE 本身？}
  F -- 是 --> F1[409 ILLEGAL_STATE_TRANSITION]
  F -- 否 --> G{Acceptance：父合约为 Sight，<br/>或 tenorType 不匹配？}
  G -- 是 --> G1[400 REQUEST_VALIDATION_FAILED]
  G -- 否 --> H{领域充足性检查<br/>是否未通过？Utilize/SG-Issue/<br/>AmendDecrease/PresentDocs/Redeem/Close}
  H -- 是 --> H1[409 INSUFFICIENT_AVAILABLE_BALANCE]
  H -- 否 --> I[201 Created<br/>PENDING Movement，<br/>eventSnapshot + contingentAccountEntry
生成并持久化]
```

## Source Evidence

- `src/routes/balanceMovements.ts:10-23`
- `test/unit/app.test.ts:11-2444`

## Related Knowledge

- Express Routes + End-to-End API Behavior
- [[Business-Rule-Index]]
