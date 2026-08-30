---
knowledge_id: movementaction-applystatustransition-state-machine
title: "MovementAction / applyStatusTransition() 状态机"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，详见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# MovementAction / applyStatusTransition() 状态机

statusTransition.ts 是一个纯函数（不涉及任何 I/O），接收 {currentStatus, action, createdBy, actingUser} 作为入参，返回新的 MovementStatus；当 LEGAL_TRANSITIONS[currentStatus][action] 为 undefined 时，则抛出 IllegalStateTransitionError。共有四种动作：RELEASE、REJECT、CANCEL、EDIT。createdBy/actingUser 仅作为审计元数据使用，并不用于资格校验——Maker 与 Checker 是否为同一人，明确不在该函数的处理范畴之内。

## Source Evidence

- `microservices/balance-component/src/domain/statusTransition.ts (full file)`
- `microservices/balance-component/test/unit/domain/statusTransition.test.ts line 16-18`

## 2026-08-26 补充更正——「Maker 与 Checker 是否为同一人，明确不在该函数的处理范畴之内」已不再完全成立

> [!warning] 本笔记原文对 createdBy/actingUser 的定性已部分过时
> 本笔记正文所写「createdBy/actingUser 仅作为审计元数据使用，并不用于资格校验——Maker 与 Checker 是否为同一人，明确不在该函数的处理范畴之内」，对应的是 2026-08-14 的原始设计。**业务方已于 2026-08-24 反转此立场**：`applyStatusTransition()` 现在会对 RELEASE/REJECT 两个动作，在查表判定合法迁移之前，先调用新增的 `assertMakerCheckerSeparation(createdBy, actingUser, action)`——两者相同即抛出 `MakerCheckerConflictError`（HTTP 409 `MAKER_CHECKER_CONFLICT`），因此 `createdBy`/`actingUser` 对 RELEASE/REJECT 而言不再是「仅审计元数据」。
>
> CANCEL/EDIT 两个动作则确实如本笔记原文所说，`createdBy`/`actingUser` 依旧只是审计元数据，不参与资格校验——这部分描述未受影响。详见新增的 [[MAKER-CHECKER-RULE-060]]（RELEASE/REJECT）与 [[MAKER-CHECKER-RULE-061]]（acknowledgeArrival() 对同一函数的独立调用）。

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
