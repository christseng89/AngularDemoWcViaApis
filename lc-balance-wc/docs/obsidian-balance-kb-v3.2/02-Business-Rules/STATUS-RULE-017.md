---
knowledge_id: STATUS-RULE-017
title: "movement_type 的权威合法值清单来自 BalanceService 的注册表（registry），而非 types.ts"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - status
  - confirmed
---

# STATUS-RULE-017 — movement_type 的权威合法值清单来自 BalanceService 的注册表（registry），而非 types.ts

## 状态
CONFIRMED

## 业务规则
与 instrument_type／status／tenor_type／exposure_nature／contract-status 不同（这些字段都由 types.ts 中真实的 TS 联合类型支撑，并镜像到 schema.ts 的 CHECK 约束中），movement_type 没有联合类型——在 types.ts 中它只是普通的 string。movement_type 合法值的真正权威来源是 BalanceService 自身的 buildMovementTypeRegistry()，并在 createMovement() 中于运行时强制执行；schema.ts 的 MOVEMENT_TYPE_VALUES 数组是通过复制该注册表的键集合写成的，刻意不从 types.ts 派生。

## 条件
新增、移除或审计某个 movement_type 值时。

## 结果
未来任何对合法 movement_type 值的变更，都必须更新 buildMovementTypeRegistry()（并同步更新 schema.ts 的 MOVEMENT_TYPE_VALUES）——仅仅更新 types.ts 并不是正确的查阅或修改来源。

## 示例
CLOSE 作为 A10/B6 的第 15 个合法 movement_type 值被新增，同时加入了 buildMovementTypeRegistry() 的表与 schema.ts 的 MOVEMENT_TYPE_VALUES 数组（两份清单完全一致：ISSUE, CREATE, AMEND_INCREASE, AMEND, AMEND_DECREASE, UTILIZE, HONOUR, ACCEPT, PARTIAL_REDEEM, FULL_REDEEM, REIMBURSE, RECLASSIFY_OUT, PARTIAL_SETTLE, FULL_SETTLE, CLOSE）。

## 验证说明
并排比对了 schema.ts 的 MOVEMENT_TYPE_VALUES 数组与 balanceService.ts 中 movementTypeRegistry 的返回对象——15 个键在完全相同的顺序下逐字节一致。尽管没有专门的测试引用，仍判定为强 CONFIRMED，因为代码本身就是直接且无歧义的证据，且文档注释明确说明了这一权威关系。

## 来源证据

实现：
- `microservices/balance-component/src/db/schema.ts:19-35,57-74 (MOVEMENT_TYPE_VALUES + its own doc comment naming the registry as authority)`
- `microservices/balance-component/src/service/balanceService.ts:232-254 (buildMovementTypeRegistry's return table, keys match exactly)`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Close Eligibility]]
- movementTypeRegistry
- MOVEMENT_TYPE_VALUES
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
