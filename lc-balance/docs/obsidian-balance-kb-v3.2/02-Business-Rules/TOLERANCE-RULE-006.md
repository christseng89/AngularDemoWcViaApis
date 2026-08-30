---
knowledge_id: TOLERANCE-RULE-006
title: "tolerancePct 为 0 也是一种恒等转换"
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

# TOLERANCE-RULE-006 — tolerancePct 为 0 也是一种恒等转换

## Status
CONFIRMED

## Business Rule
tolerancePct 为 '0'（合约明确声明零容差，区别于 null/无容差的情形）时，仍会得到 ceilingAmount === faceAmount，因为乘数 (1 + 0/100) = 1。这是公式本身的自然推论，且已作为独立测试场景明确覆盖。

## Conditions
instrumentType 与 movementType 均通过各自的门槛判断，且 tolerancePct === '0'。

## Result
ceilingAmount = faceAmount × 1 = faceAmount。

## Example
amount='100000', tolerancePct='0', movementType='ISSUE', instrumentType='IPLC_LC' -> ceilingAmount='100000'

## Verification Note
已直接验证。未降级——从算式角度看，这本质上是主公式规则的必然推论，但确实由独立测试单独覆盖，因此值得作为独立条目保留。

## Source Evidence

Implementation:
- `microservices/balance-component/src/domain/tolerance.ts:66-67`

Tests:
- `microservices/balance-component/test/unit/domain/tolerance.test.ts:40-42 (verified verbatim)`

## Related Knowledge
- [[Tolerance Processing]]
- Ceiling Amount 公式
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
