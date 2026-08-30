---
knowledge_id: MOVEMENT-RULE-006
title: "AMEND_DECREASE 的充足性检查以经过 Tolerance 换算后的 ceilingAmount 为准，绝不会使用原始的、面值层面的金额"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-006 — AMEND_DECREASE 的充足性检查以经过 Tolerance 换算后的 ceilingAmount 为准，绝不会使用原始的、面值层面的金额

## 状态
CONFIRMED

## 业务规则
checkAmendDecreaseSufficiency 始终比较的是已经经过 Tolerance 换算的 ceilingAmount（amount × (1+tolerancePct/100)）与 Tight Available Balance——而不是直接使用调用方输入的、面值层面的金额。错误信息会将两个数值并列显示，以便区分。

## 条件
ceilingAmount > tightAvailableBalance

## 结果
若超出则拒绝，错误信息中同时显示原始面值金额与经过换算后的 ceilingAmount；否则接受。

## 示例
参见 amendDecrease.ts 自身文档注释中的数值示例（U01：Confirmed 为 100，offBalanceExposure 为 10，Tight Available 为 90，减少 95 会被拒绝）。

## 验证说明
已直接对照源代码确认——函数主体、参数、以及错误信息均完全一致。

## 来源证据

实现：
- `microservices/balance-component/src/domain/amendDecrease.ts:39-62`

测试：
- （未引用直接测试证据）

## 相关知识
- [[BalanceMovement]]
- [[checkamenddecreasesufficiency|checkAmendDecreaseSufficiency()]]
- AmendDecreaseCheckResult
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
