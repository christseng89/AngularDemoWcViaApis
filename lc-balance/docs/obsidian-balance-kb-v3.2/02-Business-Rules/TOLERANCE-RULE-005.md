---
knowledge_id: TOLERANCE-RULE-005
title: "tolerancePct 为 null／undefined 时，换算等同于恒等变换"
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

# TOLERANCE-RULE-005 — tolerancePct 为 null／undefined 时，换算等同于恒等变换

## 状态
CONFIRMED

## 业务规则
一份完全不带宽容度的合约（tolerancePct 为 null 或 undefined），无论 instrumentType 与 movementType 门控是否本可放行换算，始终会得到 ceilingAmount === faceAmount。

## 条件
instrumentType 与 movementType 均通过各自的门控，且 tolerancePct === null 或 tolerancePct === undefined。

## 结果
原样返回 faceAmount。

## 示例
amount='100000', tolerancePct=null, movementType='ISSUE', instrumentType='IPLC_LC' -> ceilingAmount='100000'；amount='100000', tolerancePct=undefined, movementType='AMEND_INCREASE', instrumentType='IPLC_LC' -> ceilingAmount='100000'

## 验证说明
已直接验证。未降级——这是一个清晰的单分支检查，null 与 undefined 两种情况均有直接测试覆盖。

## 来源证据

实现：
- `microservices/balance-component/src/domain/tolerance.ts:62-64`

测试：
- `microservices/balance-component/test/unit/domain/tolerance.test.ts:35-38 (verified verbatim, both null and undefined cases)`

## 相关知识
- [[Tolerance Processing]]
- [[computeceilingamount|computeCeilingAmount()]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
