---
knowledge_id: MOVEMENT-RULE-010
title: "重复 sourceTransactionRef 防护 — 同一合同内必须唯一"
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

# MOVEMENT-RULE-010 — 重复 sourceTransactionRef 防护 — 同一合同内必须唯一

## Status
CONFIRMED

## Business Rule
在 createMovement() 中，如果设置了 req.sourceTransactionRef，则该引用不得已被同一 balanceContractId 下的其他任何 movement 使用；若出现重复，将抛出 RequestValidationError（400），并在错误信息中指明冲突的 movementId/eventSeq。校验粒度限定在合同层级——同一引用用在不同合同上是允许的。该规则已在领域模型/OAS 规范层面，以及通过一个路由层端到端（e2e）测试独立得到确认。

## Conditions
req.sourceTransactionRef 已设置，且已被同一 balanceContractId 下的另一个 movement 使用（属于真正的新 eventSeq，而非幂等重放）

## Result
返回 400 REQUEST_VALIDATION_FAILED，并指明重复的引用；不同合同使用相同引用则会成功

## Example
'001-01' 已用于 LC REF-001 的 Amendment #1；同一合同上再次使用相同的 '001-01' 提交第二个 Amendment -> 400；将相同的 '001-01' 用于另一张 LC（REF-002）-> 201

## Verification Note
已直接对照 balanceService.ts 源码确认。已将描述同一规则的 3 个重复候选条目（balance-service-orchestration、routes-api-e2e、api-specs 分组）合并为本条目，并整合了证据。

## Source Evidence

实现:
- `microservices/balance-component/src/service/balanceService.ts:999-1014`

测试:
- `test/unit/app.test.ts:1064-1172`

## Related Knowledge
- [[BalanceMovement]]
- sourceTransactionRef 在合同内的唯一性
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
