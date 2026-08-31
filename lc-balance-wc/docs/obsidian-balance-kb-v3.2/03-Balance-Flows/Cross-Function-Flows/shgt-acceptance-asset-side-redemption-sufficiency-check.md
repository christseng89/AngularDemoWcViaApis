---
knowledge_id: shgt-acceptance-asset-side-redemption-sufficiency-check
title: "SHGT/Acceptance/资产侧（Asset-side）赎回充分性检查"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# SHGT/Acceptance/资产侧（Asset-side）赎回充分性检查

每一笔赎回/结算类（redemption/settlement-shaped）movement 都会经过的共享 outstandingCapped 路径，其校验对象是 Available Balance（会净额扣除同一记录上其他仍处于 PENDING 状态的赎回），而非静态的 Confirmed Balance。

```mermaid
flowchart TD
  A[Maker 提交 PARTIAL_REDEEM / FULL_REDEEM /\nPARTIAL_SETTLE / FULL_SETTLE /\nREIMBURSE / RECLASSIFY_OUT] --> B[计算该记录的 Available Balance\n= Confirmed ± 其他 PENDING movements]
  B --> C{redeemAmount (ceilingAmount)\n> Available Balance？}
  C -- Yes --> D[ok:false——\n超过 Available Balance]
  C -- No --> E[ok:true——\n创建 movement，状态为 PENDING]
```

## 证据来源

- `microservices/balance-component/src/domain/shgtRedeem.ts`
- `microservices/balance-component/src/service/balanceService.ts lines 189-198, 247-250`

## 相关知识

- [[Close Eligibility|SHGT/Acceptance 赎回、Amend Decrease、Close 资格]]
- [[Business-Rule-Index]]
