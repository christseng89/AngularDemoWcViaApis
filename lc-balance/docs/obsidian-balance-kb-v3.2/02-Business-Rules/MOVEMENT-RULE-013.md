---
knowledge_id: MOVEMENT-RULE-013
title: "AMEND（B2 共用的 movementType）——方向由金额自身正负号决定，充足性检查仅在真正减少时才运行"
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

# MOVEMENT-RULE-013 — AMEND（B2 共用的 movementType）——方向由金额自身正负号决定，充足性检查仅在真正减少时才运行

## Status
CONFIRMED

## Business Rule
movementTypeRegistry 中 'AMEND' 条目的 checkSufficiency（amendShaped）只有在 ctx.ceilingAmount.isNegative() 为真时才会调用 checkDecreaseShapedSufficiency——增加或恰好为零则完全不运行任何充足性检查（与 AMEND_INCREASE 相同）。这是 B2 唯一的 movementType；与 A2/A7 不同，Export Amendment/Confirmation 并没有单独的 AMEND_INCREASE/AMEND_DECREASE 拆分。该规则已在领域注册表层面，以及通过真实业务用例测试数据（export-case-10）两方面独立确认。

## Conditions
movementType === 'AMEND'；具体走哪个分支由 ctx.ceilingAmount.isNegative() 决定

## Result
金额为负的 B2 AMEND 会运行 Tight-Available 充足性检查；金额为正或为零则不运行任何充足性检查

## Example
export-case-10：AMEND +20,000（增加）无检查直接通过；AMEND -130,000，在 Tight Available 为 120,000 的情况下被拒绝，返回 409

## Verification Note
已直接对照源码确认。已将近乎相同的候选条目——'B2 的方向取决于金额本身的正负号，而非独立的 movementType'（来自 business-case-registry）合并入本条目，并整合了证据。

## Source Evidence

实现:
- `microservices/balance-component/src/service/balanceService.ts:179-186`
- `backend/data/businessCases.js:2260-2315`

测试:
- `amountValidation.test.ts:136-166`
- `backend/test/businessCases.test.js:80-83`

## Related Knowledge
- [[BalanceMovement]]
- EXPOSURE-RULE（checkDecreaseShapedSufficiency）
- amendDirection SubChoice
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
