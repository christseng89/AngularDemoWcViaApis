---
knowledge_id: MAKER-CHECKER-RULE-061
title: "acknowledgeArrival()（A3/A3S Checker 确认）同样强制 Maker≠Checker——绕过 applyStatusTransition()，直接调用同一校验函数"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-26
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-061 — acknowledgeArrival()（A3/A3S Checker 确认）同样强制 Maker≠Checker——绕过 applyStatusTransition()，直接调用同一校验函数

## Status
CONFIRMED

## Business Rule
`acknowledgeArrival()`（`service/balanceService.ts`，A3/A3S Document Arrival 自身的 Checker 确认步骤，写入 `acknowledgedBy`/`acknowledgedAt`）是一个真正的 Checker 动作，但它刻意从不触碰 `status` 字段，因此完全不经过 `applyStatusTransition()`——[[MAKER-CHECKER-RULE-060]] 所描述的校验不会自动覆盖到这条路径。为此，业务已确认（2026-08-24）的同一条 4-eyes 规则由 `acknowledgeArrival()` 在其 `guardSecondaryAction()` 的 `validate` 回调中，直接调用与 RELEASE/REJECT 完全相同的 `assertMakerCheckerSeparation(movement.createdBy, acknowledgedBy, 'ACKNOWLEDGE')`——同一函数、同一份判定逻辑、同一个 `MakerCheckerConflictError`，只是调用点不同。该校验在“movement 是否仍为 PENDING”“是否已被确认过”等其余前置检查之前执行（位于 `validate` 回调内，`guardSecondaryAction()` 会先执行 `validate`，再检查 status/alreadyDone）。

## Conditions
`POST /balance-movements/:id/acknowledge`，且该 movement 的 `createdBy === acknowledgedBy`。（前提：该 movement 必须是 IPLC_LC/UTILIZE，否则会先触发另一项与本规则无关的 `RequestValidationError`。）

## Result
抛出 `MakerCheckerConflictError`（409 `MAKER_CHECKER_CONFLICT`），消息形如 `Cannot acknowledge — the Maker (maker1) and Checker cannot be the same user (genuine 4-eyes separation required).`；不写入 `acknowledgedBy`/`acknowledgedAt`。

## Example
Maker `maker1` 创建一笔 A3/A3S 的 IPLC_LC/UTILIZE（`createdBy: 'maker1'`）并完成 Release 后，若同样以 `acknowledgedBy: 'maker1'` 调用 `POST /balance-movements/:id/acknowledge` -> 409 `MAKER_CHECKER_CONFLICT`。改为 `acknowledgedBy: 'checker1'` 则正常写入确认信息，`displayStatus()` 随之显示为 `EARMARKED`。

## Verification Note
已直接阅读 `service/balanceService.ts` 中 `acknowledgeArrival()` 的完整定义（含其 `validate` 回调内对 `assertMakerCheckerSeparation()` 的调用，及紧邻该调用的说明性注释）与对应 HTTP 集成测试，确认该校验确实绕过 `applyStatusTransition()`、直接复用 `domain/statusTransition.ts` 导出的同一函数，行为与描述一致。

## Source Evidence

实现:
- `microservices/balance-component/src/service/balanceService.ts:2169-2189 (acknowledgeArrival()，含 assertMakerCheckerSeparation() 调用点与其上方说明注释)`
- `microservices/balance-component/src/domain/statusTransition.ts:43-56 (assertMakerCheckerSeparation() 本体)`

测试:
- `microservices/balance-component/test/unit/domain/statusTransition.test.ts:49-56 (assertMakerCheckerSeparation() 独立单测，标注 acknowledgeArrival() 为其调用方)`
- `microservices/balance-component/test/unit/app.test.ts:3010-3038 (POST .../acknowledge 409 MAKER_CHECKER_CONFLICT)`

## Related Knowledge
- [[MAKER-CHECKER-RULE-060]]
- [[MAKER-CHECKER-RULE-001]]
- [[Maker Checker Lifecycle]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
