---
knowledge_id: balance-movements-router-endpoint-surface
title: "Balance Movements Router 端点介面"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-30
tags:
  - balance
  - domain-concept
---

# Balance Movements Router 端点介面

> [!info] 2026-08-30 更新
> 本页原先的 8 端点清单是历史快照。现行微服务 OAS v1.41.0 包含 compound submit/release、edit、cancel 与 withdraw-maker-submit；本次仅补充生命周期语义，没有新增 operation。完整表面以 `analysis/balance-component-api.yaml` 为准。

routes/balanceMovements.ts 在一个 Express Router 下注册了 8 个端点：POST /balance-movements（创建）、POST /balance-movements/:id/release、GET /balance-movements/:id/balance-as-of、GET /balance-movements?businessEventId=、POST /balance-movements/:id/reject、POST /balance-movements/:id/cancel、POST /balance-movements/:id/acknowledge、POST /balance-movements/:id/maker-submit。每个路由在委派给对应的 BalanceService 方法之前，只做自身所需字段是否存在的校验（校验失败抛出 RequestValidationError，400）；POST /balance-movements 还会额外先完整执行 zod 的 createMovementRequestSchema 校验。当创建了一笔新的 movement 时返回 201，当是一次幂等的重复提交、返回既有记录时则返回 200。

## Source Evidence

- `src/routes/balanceMovements.ts:1-85`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
- [[BalanceService Facade Architecture]]
- [[Freshness-Update-Log-2026-08-30]]
