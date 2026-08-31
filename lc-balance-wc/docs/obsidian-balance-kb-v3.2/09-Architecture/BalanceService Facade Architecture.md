---
knowledge_id: BalanceService-Facade-Architecture
title: "BalanceService Façade 架构"
aliases:
  - "BalanceService SOLID 架构"
domain: Balance
category: Architecture
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "3917866"
snapshot_date: 2026-08-30
tags:
  - balance
  - architecture
  - solid
  - facade
---

# BalanceService Façade 架构

`BalanceService` 是路由层的稳定 application façade，不再承载所有领域计算、movement 建立、查询、状态转换及 compound transaction 细节。外部调用介面保持稳定，内部职责按 SOLID 原则分离。

| 职责 | 主要协作者 |
|---|---|
| movement 建立与规则分派 | movement factory／movement type registry |
| Maker／Checker 状态动作 | transition helpers／release policy |
| A3S、A6、B4 等多腿动作 | compound movement service |
| 余额与目录查询 | query helpers／repositories |
| 持久化与交易边界 | repositories 与 SQLite transaction |

多腿业务动作必须在单一数据库交易内原子成功或回滚。Facade 只编排 use case，不复制 Domain policy；新增功能优先通过 registry、policy、strategy 或组合扩展。

## 来源证据

- `microservices/balance-component/src/service/balanceService.ts`
- `microservices/balance-component/src/service/`
- `docs/decisions/2026-08-30-balance-service-facade-and-atomic-compound-events.md`
- `analysis/balance-component-api.yaml` v1.37.0

## 相关知识

- [[Balance Architecture]]
- [[compound-submission-linked-legs]]
- [[movementtyperegistry-strategy-type-object-registry-for-movementtype-cl]]
- [[BalanceMovement]]

