---
knowledge_id: TOLERANCE-RULE-003
title: "宽容度（Tolerance）换算的资金变动类型（Movement-Type）适用性门控"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - tolerance
  - confirmed
---

# TOLERANCE-RULE-003 — 宽容度（Tolerance）换算的资金变动类型（Movement-Type）适用性门控

## 状态
CONFIRMED

## 业务规则
即使在宽容度适用的工具类型上，也只有 ISSUE、AMEND_INCREASE、AMEND_DECREASE 与 AMEND 这几个 movementType 会被换算。UTILIZE、HONOUR、ACCEPT 与 CREATE（以及其他任何 movementType），在原本适用宽容度的工具类型上，都会一律原样返回未经换算的面额。

## 条件
movementType ∈ {ISSUE, AMEND_INCREASE, AMEND_DECREASE, AMEND}，且仅在 instrumentType 门控通过之后才会被评估。

## 结果
若 movementType 不在此集合内，无论 tolerancePct 为何，computeCeilingAmount 都会原样返回 faceAmount。

## 示例
amount='50000', tolerancePct='10', movementType='UTILIZE', instrumentType='IPLC_LC' -> ceilingAmount='50000'（不变）；amount='80000', tolerancePct='10', movementType='HONOUR', instrumentType='EPLC_CONFIRMATION' -> ceilingAmount='80000'（不变）

## 验证说明
已直接验证——所引用的三个测试用例均逐字存在，并证实了该声明。未降级。

## 来源证据

实现：
- `microservices/balance-component/src/domain/tolerance.ts:34-39`
- `microservices/balance-component/src/domain/tolerance.ts:59-61`

测试：
- `microservices/balance-component/test/unit/domain/tolerance.test.ts:22-25 (EPLC_CONFIRMATION HONOUR/ACCEPT)`
- `microservices/balance-component/test/unit/domain/tolerance.test.ts:27-29 (UTILIZE)`
- `microservices/balance-component/test/unit/domain/tolerance.test.ts:31-33 (CREATE)`

## 相关知识
- [[Tolerance Processing]]
- TOLERANCE_APPLICABLE_MOVEMENT_TYPES
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
