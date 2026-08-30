---
knowledge_id: TOLERANCE-RULE-007
title: "EPLC_LC 与 IPLC_LC 同样适用 Tolerance"
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

# TOLERANCE-RULE-007 — EPLC_LC 与 IPLC_LC 同样适用 Tolerance

## Status
CONFIRMED

## Business Rule
出口侧 LC 工具（EPLC_LC，依 Confirmation 边界说明仅作参考用途）在 Tolerance 计算上适用与进口侧 IPLC_LC 完全相同的公式与门槛判断——这两个 LC 方向在此项计算上不存在任何不对称之处。

## Conditions
instrumentType='EPLC_LC'，movementType='ISSUE'（或其他适用的 movementType），tolerancePct 非空。

## Result
ceilingAmount = faceAmount × (1 + tolerancePct/100)，公式与行为与 IPLC_LC 完全一致。

## Example
amount='100000', tolerancePct='10', movementType='ISSUE', instrumentType='EPLC_LC' -> ceilingAmount='110000'

## Verification Note
已直接验证。未降级。

## Source Evidence

Implementation:
- `microservices/balance-component/src/domain/tolerance.ts:32`

Tests:
- `microservices/balance-component/test/unit/domain/tolerance.test.ts:13-15 (verified verbatim)`

## Related Knowledge
- [[Tolerance Processing]]
- TOLERANCE_APPLICABLE_INSTRUMENT_TYPES
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
