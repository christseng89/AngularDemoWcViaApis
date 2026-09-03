---
knowledge_id: MOVEMENT-RULE-011
title: "assertValidAmount() 与 monetary amendment no-op 的服务端兜底校验"
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

# MOVEMENT-RULE-011 — assertValidAmount() 与 monetary amendment no-op 的服务端兜底校验

## Status
CONFIRMED

## Business Rule
一般 movementType 要求金额严格为正。Monetary amendment（AMEND_INCREASE／AMEND_DECREASE／AMEND）
允许 0，以支援 Tolerance-only；A2 两个 movementType 拒绝负数，B2 AMEND 保留 signed wire Amount。
`assertMonetaryAmendmentChangesTerms()` 再以当前 contract Tolerance 拒绝 Amount=0 且 Tolerance 未改变的 no-op。
CLOSE／EXPIRE／REOPEN／AMEND_EXPIRY_DATE／REVERSAL 保留各自既有规则。Submit、Fix Pending 与 Release
均有相应服务端复查。

## Conditions
参见上述 monetary amendment 与系统 movementType 例外；其余 movementType 金额严格 > 0。

## Result
普通 ISSUE 的 0／负数拒绝；AMEND 的 0 可进入 Tolerance/no-op 校验、负数合法；AMEND_INCREASE／DECREASE 的 0 合法、负数拒绝。

## Example
`AMEND amount='0', tolerance 20→15` 通过；`AMEND amount='0', tolerance 20→20` 被 no-op 校验拒绝；`UTILIZE amount='0'` 被拒绝。

## Verification Note
已直接阅读 validator 与 BalanceService 调用点，并由 validator、domain 及 service regression tests 核实。

## Source Evidence

实现:
- `microservices/balance-component/src/service/balanceService.ts:952-982 (assertValidAmount)`
- `microservices/balance-component/src/service/balanceService.ts:985-988 (createMovement call site)`
- `microservices/balance-component/src/service/balanceService.ts:1111-1115 (release call site)`

测试:
- `amountValidation.test.ts:30-212`

## Related Knowledge
- [[BalanceMovement]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
