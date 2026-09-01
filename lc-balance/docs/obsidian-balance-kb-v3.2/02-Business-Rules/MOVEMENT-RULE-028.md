---
knowledge_id: MOVEMENT-RULE-028
title: 'MakerSubmitService 分发逻辑——5 种提交形态，按第一个匹配项优先路由，并优雅回退为普通单腿提交'
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: 'N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]'
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-028 — MakerSubmitService 分发逻辑——5 种提交形态，按第一个匹配项优先路由，并优雅回退为普通单腿提交

## Status

CONFIRMED

## Business Rule

submit() 会根据所选功能的 FunctionStrategy.compoundSubmission.possibleShapes/movementDerivation.amountVsAvailableDerivation 以及当前的实时选择状态，按固定的优先顺序检查，并精确路由到 5 种形态中的一种；若某种形态所需的选择状态缺失，则会继续检查下一项，最终默认回退为一次普通的 createMovement 调用。

## Conditions

参见决策表『MakerSubmitService.submit() 分发路由』

## Result

以下之一：`submitDocumentArrivalWithSg`（A3S）、`submitConfirmationHonourWithReceivable`（B4 Sight）、`submitConfirmationAcceptWithReceivable`（B4 Usance）或 `submitPlain`（默认，包含 B5）。

## Example

A3S 尚未选择任何 SG（selectedArrivalSg/arrivalSgSnapshot 均为 null）时会回退为 submitPlain——仅一次 createMovement 调用，而非两次

## Verification Note

2026-09-01 已重新核对 `maker-submit.service.ts` 与 tests：B5 使用 plain 单一 settlement，不再执行 Receivable lookup／REIMBURSE；维持 CONFIRMED。

## Source Evidence

实现:

- `src/app/transaction-builder/maker-submit.service.ts:66-85`

测试:

- `maker-submit.service.spec.ts:104-192`

## Related Knowledge

- [[BalanceMovement]]
- [[MakerSubmitService]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
