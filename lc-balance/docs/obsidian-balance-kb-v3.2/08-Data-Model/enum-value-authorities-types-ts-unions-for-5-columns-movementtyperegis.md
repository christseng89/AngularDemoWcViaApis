---
knowledge_id: enum-value-authorities-types-ts-unions-for-5-columns-movementtyperegis
title: "枚举值权威来源：5 个列由 types.ts 联合类型定义，第 6 个由 movementTypeRegistry 定义"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 枚举值权威来源：5 个列由 types.ts 联合类型定义，第 6 个由 movementTypeRegistry 定义

schema.ts 导出了 INSTRUMENT_TYPE_VALUES/CONTRACT_STATUS_VALUES/TENOR_TYPE_VALUES/MOVEMENT_STATUS_VALUES/EXPOSURE_NATURE_VALUES，它们逐字镜像了 src/types.ts 自身的联合类型（这五者的唯一权威来源）。MOVEMENT_TYPE_VALUES 在 types.ts 中没有对应的联合类型——movementType 在 BalanceMovement 上被定义为普通 string 类型——它真正的权威来源是 BalanceService 自身的 movementTypeRegistry（不在本次文件范围内），由 createMovement() 在运行时强制校验；CHECK 约束的取值列表是该注册表键集合的手工镜像副本。

## 来源证据

- `microservices/balance-component/src/db/schema.ts:19-74`
- `microservices/balance-component/src/types.ts:27-58`
- `microservices/balance-component/test/unit/db/checkAndForeignKeyConstraints.test.ts:120-166`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
