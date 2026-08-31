---
knowledge_id: post-balance-movements-currency-derivation-and-sufficiency-check-decis
title: "POST /balance-movements——货币推导与充足性检查决策流程"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# POST /balance-movements——货币推导与充足性检查决策流程

展示微服务如何把一个新到的创建请求解析为「对应到既有合约」「由父合约派生的子合约」或「全新的根 Logical Contract」，以及每一个硬性拒绝（409/400）具体在哪一步触发。

```mermaid
flowchart TD
  A[POST /balance-movements] --> B{是否能解析到一个<br/>既有的 ACTIVE 合约？}
  B -- 是 --> C[currency = 既有合约自身存储的币种]
  C --> D{调用方提供了 currency，<br/>且与之不一致？}
  D -- 是 --> E[409 CURRENCY_MISMATCH]
  D -- 否 --> F{movementType 是创建类<br/>类型 ISSUE/CREATE？}
  F -- 是 --> G[409 NATURAL_KEY_ALREADY_EXISTS]
  F -- 否 --> H[进入充足性检查]
  B -- 否 --> I{movementType 为创建类，<br/>且提供了 parentLogicalContractId？}
  I -- 是 --> J[currency 从父合约自身的 currency 推导；<br/>需一致或省略]
  J --> K[在父合约下创建新的子合约 v1 ACTIVE]
  I -- 否 --> L{确实是真正的根级创建类<br/>movementType，且无父合约，<br/>例如 IPLC_LC/EPLC_CONFIRMATION ISSUE}
  L -- 是 --> M[currency 由调用方必填提供；<br/>成为新 Logical Contract 的永久币种]
  M --> N[创建新的根 Logical Contract v1 ACTIVE]
  L -- 否 --> O[400 REQUEST_VALIDATION_FAILED]
  H --> P{针对该 instrumentType/movementType<br/>的充足性检查，<br/>例如 UTILIZE 对比 Tight Available、<br/>SG Issue 上限、AMEND_DECREASE 对比 Tight}
  N --> Q[201 PENDING Movement 创建成功；<br/>eventSnapshot 已捕获]
  K --> Q
  P -- 余额不足 --> R[409 INSUFFICIENT_AVAILABLE_BALANCE——<br/>不创建任何记录]
  P -- 通过 --> Q
```

## Source Evidence

- `balance-component-api.yaml lines 52-81, 730-839`

## Related Knowledge

- OpenAPI Specs — Microservice + Channel API
- [[Business-Rule-Index]]
