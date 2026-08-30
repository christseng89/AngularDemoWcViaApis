---
knowledge_id: TOLERANCE-RULE-001
title: "上限金额（Ceiling Amount）公式：ceilingAmount = faceAmount × (1 + tolerancePct/100)"
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

# TOLERANCE-RULE-001 — 上限金额（Ceiling Amount）公式：ceilingAmount = faceAmount × (1 + tolerancePct/100)

## 状态
CONFIRMED

## 业务规则
当宽容度（tolerance）换算适用时（即工具类型门控与资金变动类型门控均通过，且 tolerancePct 非空），Maker 输入的面额（Face Amount）会被换算为实际应用于已确认余额（Confirmed Balance）、并用于 AMEND_DECREASE 充足性检查的上限金额：ceilingAmount = faceAmount × (1 + tolerancePct/100)。Face Amount 本身会被独立跟踪，绝不会被覆盖。

## 条件
instrumentType ∈ {IPLC_LC, EPLC_LC, EPLC_CONFIRMATION} 且 movementType ∈ {ISSUE, AMEND_INCREASE, AMEND_DECREASE, AMEND} 且 tolerancePct 不为 null/undefined。

## 结果
Decimal = faceAmount.times(1 + tolerancePct/100)

## 示例
amount='100000', tolerancePct='10', movementType='ISSUE', instrumentType='IPLC_LC' -> ceilingAmount='110000'

## 验证说明
合并了三个近似重复的候选规则（源自代码的『Ceiling Amount 公式』，以及两个源自文档、分别来自 balance-component-api.yaml 与 Balance-Component-DB-Design.txt、描述同一公式的重复项）。直接验证了 tolerance.ts 与测试文件——每一行代码与每一个测试用例都与声明完全吻合。基于主要的代码与测试证据保持 CONFIRMED。已留意但未视为 CONFLICT 的一点：api.yaml schema 自身的 ceilingAmount 字段描述（已检查第 1368-1385 行）仅列出『IPLC_LC/EPLC_LC 的 ISSUE/AMEND_INCREASE/AMEND_DECREASE』，遗漏了 EPLC_CONFIRMATION/AMEND，尽管代码本身（以及该 yaml 自身 v0.3.0 变更日志的部分内容、tolerance.ts 文档注释的完整内容）都明确包含 EPLC_CONFIRMATION 自身的 AMEND——这属于规格文档的不完整／漂移，而非矛盾，依证据优先级，代码是具有约束力的来源。

## 来源证据

实现：
- `microservices/balance-component/src/domain/tolerance.ts:53-68 (function body, verified verbatim)`
- `analysis/balance-component-api.yaml:93-101 (v0.3.0 changelog, corroborating)`
- `analysis/balance-component-api.yaml:1372-1381 (BalanceMovement.ceilingAmount schema description, corroborating)`

测试：
- `microservices/balance-component/test/unit/domain/tolerance.test.ts:4-11 (test.each ISSUE/AMEND_INCREASE/AMEND_DECREASE on IPLC_LC — verified content matches exactly)`

## 相关知识
- [[Tolerance Processing]]
- [[computeceilingamount|computeCeilingAmount()]]
- 以最大风险敞口为基础计算的上限负债
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
