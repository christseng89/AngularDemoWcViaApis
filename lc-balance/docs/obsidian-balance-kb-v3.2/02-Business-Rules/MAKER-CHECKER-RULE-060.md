---
knowledge_id: MAKER-CHECKER-RULE-060
title: "RELEASE/REJECT 现在强制校验 Maker≠Checker——真正的 4-eyes 分离，业务已确认的反转"
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

# MAKER-CHECKER-RULE-060 — RELEASE/REJECT 现在强制校验 Maker≠Checker——真正的 4-eyes 分离，业务已确认的反转

## Status
CONFIRMED

## Business Rule
业务已确认（2026-08-24）：对同一笔 BalanceMovement，创建它的 Maker（`createdBy`）不能再对其执行 Release 或 Reject——真正的 4-eyes 职责分离，不再像此前那样把这件事完全交给发起银行自身的外部角色/权限系统去处理。这是对 [[MAKER-CHECKER-RULE-001]]（以及 `domain/statusTransition.ts` 自身 2026-08-14 版本头部注释所记载的原始立场）的直接反转。新增的导出函数 `assertMakerCheckerSeparation(createdBy, actingUser, action)` 在 `applyStatusTransition()` 内部，仅针对 RELEASE/REJECT 两个动作被调用；CANCEL/EDIT 不受影响——CANCEL 是 Maker 对自己名下仍处于 PENDING 状态记录的 Error Correction（错误更正），`createdBy === actingUser` 在那里正是预期中的正常情形，而非冲突。校验在“是否为合法状态迁移”检查之前执行，因此即便针对一笔已经 RELEASED 的记录再次以同一使用者身份发起 RELEASE，报出的仍是 `MAKER_CHECKER_CONFLICT`，而不是容易误导人的“非法状态迁移”。违反时抛出新增的 `MakerCheckerConflictError`（HTTP 409，`code: 'MAKER_CHECKER_CONFLICT'`）。acknowledgeArrival()（A3/A3S 的 Checker 确认步骤）对同一函数的调用另见 [[MAKER-CHECKER-RULE-061]]。

## Conditions
`action === 'RELEASE' || action === 'REJECT'`，且 `movement.createdBy === actingUser`（即请求体中的 `releasedBy`）。

## Result
抛出 `MakerCheckerConflictError`（409 `MAKER_CHECKER_CONFLICT`），消息形如 `Cannot release — the Maker (alice) and Checker cannot be the same user (genuine 4-eyes separation required).`；不写入任何状态变更。

## Example
Maker `alice` 创建一笔 AMEND_INCREASE（`createdBy: 'alice'`），随后同样以 `releasedBy: 'alice'` 调用 `POST /balance-movements/:id/release` -> 409 `MAKER_CHECKER_CONFLICT`。若改为 `releasedBy: 'checker1'`（不同使用者）则正常放行。同一场景下改为 `POST .../reject` 也会得到同样的 409。若该记录当前已是 RELEASED 状态，同一 Maker 再次以自己身份发起 RELEASE，仍报 `MAKER_CHECKER_CONFLICT`（而不是 `ILLEGAL_STATE_TRANSITION`），因为该项校验先于合法迁移表被检查。

## Verification Note
已直接阅读 `domain/statusTransition.ts` 全文（含其头部文档注释、`assertMakerCheckerSeparation()` 与 `applyStatusTransition()` 两个导出函数）与对应单元测试，确认：(1) 仅 RELEASE/REJECT 触发该校验，CANCEL/EDIT 不受影响；(2) 校验顺序确实在合法迁移表查找之前；(3) HTTP 层集成测试直接验证了 409 `MAKER_CHECKER_CONFLICT` 响应体。与本条目描述完全一致。

## Source Evidence

实现:
- `microservices/balance-component/src/domain/statusTransition.ts:1-19 (头部文档注释), 43-56 (assertMakerCheckerSeparation), 58-77 (applyStatusTransition 调用点)`
- `microservices/balance-component/src/errors.ts:70-78 (MakerCheckerConflictError)`

测试:
- `microservices/balance-component/test/unit/domain/statusTransition.test.ts:16-40 (同一使用者对 RELEASE/REJECT 均被拒绝；校验顺序先于合法迁移表)`
- `microservices/balance-component/test/unit/app.test.ts:2162-2180 (POST .../reject 409 MAKER_CHECKER_CONFLICT)`
- `microservices/balance-component/test/unit/app.test.ts:2183-2199 (POST .../release 409 MAKER_CHECKER_CONFLICT)`

## Related Knowledge
- [[MAKER-CHECKER-RULE-001]]
- [[MAKER-CHECKER-RULE-061]]
- [[Maker Checker Lifecycle]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
