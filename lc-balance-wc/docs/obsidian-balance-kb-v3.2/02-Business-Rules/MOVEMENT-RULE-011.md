---
knowledge_id: MOVEMENT-RULE-011
title: "assertValidAmount() —服务端『金额必须 > 0』的兜底校验，在 Submit 与 Release 两处都会检查，并有两个具名例外"
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

# MOVEMENT-RULE-011 — assertValidAmount() —服务端『金额必须 > 0』的兜底校验，在 Submit 与 Release 两处都会检查，并有两个具名例外

## Status
CONFIRMED

## Business Rule
每种 movementType 都要求金额严格为正，唯有以下两个例外：(1) AMEND（仅 B2，方向由金额自身的正负号决定）——仅拒绝金额恰好为 0 的情况，负号是合法的；(2) CLOSE（A10/B6 核销）——仅拒绝负数金额，金额恰好为 0 是合法的（已完全被利用的 LC 会以 0 结清）。该校验在 createMovement() 中于 resolveOrCreateContract() 之前被调用（因此一个被拒绝的 ISSUE/CREATE 请求不会留下孤立的合同记录），并在 release() 中作为纵深防御再次被调用。

## Conditions
参见 businessRule 中关于 AMEND/CLOSE 分支的说明；其余所有 movementType 均要求金额严格 > 0

## Result
针对普通 ISSUE 提交 amount:'0' 或 amount:'-5000' 都会抛出 RequestValidationError；AMEND '0' 抛出异常，AMEND '-5000' 通过；CLOSE '0' 通过，CLOSE '-5000' 抛出异常

## Example
assertValidAmount('AMEND','0') 抛出异常；assertValidAmount('AMEND','-5000') 通过；assertValidAmount('CLOSE','0') 通过；assertValidAmount('CLOSE','-1') 抛出异常；assertValidAmount('UTILIZE','0') 抛出异常

## Verification Note
已直接阅读函数完整实现；每个分支（AMEND 仅零值、CLOSE 仅负值、通用正数校验）均逐字对照声明内容确认，包括两个调用点。

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
