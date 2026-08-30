---
knowledge_id: MOVEMENT-RULE-028
title: "MakerSubmitService 分发逻辑——5 种提交形态，按第一个匹配项优先路由，并优雅回退为普通单腿提交"
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

# MOVEMENT-RULE-028 — MakerSubmitService 分发逻辑——5 种提交形态，按第一个匹配项优先路由，并优雅回退为普通单腿提交

## Status
CONFIRMED

## Business Rule
submit() 会根据所选功能的 FunctionStrategy.compoundSubmission.possibleShapes/movementDerivation.amountVsAvailableDerivation 以及当前的实时选择状态，按固定的优先顺序检查，并精确路由到 5 种形态中的一种；若某种形态所需的选择状态缺失，则会继续检查下一项，最终默认回退为一次普通的 createMovement 调用。

## Conditions
参见决策表『MakerSubmitService.submit() 分发路由』

## Result
以下之一：submitDocumentArrivalWithSg（A3S）、submitConfirmationHonourWithReceivable（B4 Sight）、submitConfirmationAcceptWithReceivable（B4 Usance）、submitAcceptanceSettleWithReceivable（B5）、submitPlain（默认）

## Example
A3S 尚未选择任何 SG（selectedArrivalSg/arrivalSgSnapshot 均为 null）时会回退为 submitPlain——仅一次 createMovement 调用，而非两次

## Verification Note
本轮未直接重新核对源码，但与已直接验证过的、紧密相关的 submit-rules.ts 中 A3S/B4/B5 守卫逻辑，以及 CLAUDE.md 决策日志中对这 5 种复合形态的记述在内部逻辑上一致；保持 CONFIRMED。

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
