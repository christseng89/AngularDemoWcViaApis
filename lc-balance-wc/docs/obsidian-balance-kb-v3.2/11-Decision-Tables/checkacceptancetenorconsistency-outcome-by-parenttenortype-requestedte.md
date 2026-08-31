---
knowledge_id: checkacceptancetenorconsistency-outcome-by-parenttenortype-requestedte
title: "checkAcceptanceTenorConsistency() 按 (parentTenorType, requestedTenorType) 的判定结果"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# checkAcceptanceTenorConsistency() 按 (parentTenorType, requestedTenorType) 的判定结果

| parentTenorType（父级期限） | requestedTenorType（请求期限） | 结果 | 原因 |
|---|---|---|---|
| SIGHT（即期） | 任意值（含 undefined） | ok:false | 即期 LC 直接阻止承兑 CREATE，此判断在期限匹配比较之前就已执行 |
| 非 SIGHT 且已设置（如 BUYERS_USANCE） | 与 parentTenorType 一致 | ok:true | 期限一致 |
| 非 SIGHT 且已设置 | 与 parentTenorType 不一致 | ok:false | 承兑与其父级之间期限不匹配 |
| 非 SIGHT 且已设置 | undefined（未提供） | ok:true | 无可比对的对象 |
| null/undefined（历史遗留，未声明期限） | 任意值 | ok:true | 无可比对的对象 |

## 来源证据

- `microservices/balance-component/src/domain/tenorRouting.ts (full file)`
- `microservices/balance-component/test/unit/domain/tenorRouting.test.ts (full file)`

## 相关知识

- Balance Derivation, Status Transition, Tenor Routing
- [[Business-Rule-Index]]
