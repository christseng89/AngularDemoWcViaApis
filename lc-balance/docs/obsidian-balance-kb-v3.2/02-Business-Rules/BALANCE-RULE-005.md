---
knowledge_id: BALANCE-RULE-005
title: "面值金额（Face Amount）只追踪 RELEASED 状态的 ISSUE/AMEND_INCREASE/AMEND_DECREASE 金额，使用原始 amount 而非 ceilingAmount"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - balance
  - confirmed
---

# BALANCE-RULE-005 — 面值金额（Face Amount）只追踪 RELEASED 状态的 ISSUE/AMEND_INCREASE/AMEND_DECREASE 金额，使用原始 amount 而非 ceilingAmount

## 状态
CONFIRMED

## 业务规则
面值金额的计算独立于已确认余额：它汇总的是仅限 RELEASED 状态、且 movementType 为 ISSUE、AMEND_INCREASE 或 AMEND_DECREASE 的变动记录的原始 `amount` 字段（未经容差换算，非 ceilingAmount）。UTILIZE 及其他任何 movementType 都不会出现在这个集合中。

## 触发条件
movement.status === 'RELEASED' 且 movementType ∈ {ISSUE, AMEND_INCREASE, AMEND_DECREASE}

## 结果
面值金额 = Σ(amount × 方向)（符合条件的 RELEASED 变动记录之和）

## 示例
ISSUE（RELEASED，amount 100000）+ AMEND_INCREASE（RELEASED，amount 10000）+ UTILIZE（RELEASED，amount 50000，被排除）=> 面值金额 = 110000

## 验证说明
单一来源，直接重新阅读；代码与测试与该论断完全一致。未降级。

## 来源证据

实现:
- `microservices/balance-component/src/domain/balanceDerivation.ts:54-55,101-117`

测试:
- `microservices/balance-component/test/unit/domain/balanceDerivation.test.ts:35-44`

## 相关知识
- [[Balance Derivation Rules]]
- [[computefaceamount|computeFaceAmount()]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
