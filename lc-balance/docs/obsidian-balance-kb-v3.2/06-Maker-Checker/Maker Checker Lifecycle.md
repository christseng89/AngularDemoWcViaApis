---
knowledge_id: Maker-Checker-Lifecycle
title: 'Maker Checker 生命周期'
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: 'N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]'
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - domain-concept
---

# Maker Checker 生命周期

Balance Component 强制实施真正的 **4-eyes** 控制：Maker 提交一笔 [[BalanceMovement]]（状态为 `PENDING`），必须经过一个*不同的* Checker 动作（`release()`/`reject()`）才能使其生效。本笔记是这一生命周期中每一道守卫（guard）、关卡（gate）与 UI 后果的枢纽——各项守卫本身以 `service/balanceService.ts` 中的具体条目存在，记录为 [[Business-Rule-Index|MAKER-CHECKER-RULE]] 条目；本页说明的是每一条守卫"为什么"存在。

## 为什么 4-eyes 在这里特别重要

业务指示："交易流程規定 4 EYES. 所以 PENDING 或 EARMARKING 狀態的交易不得出現在下一個交易中"——一笔仅经 Maker 提交（Maker-Submitted）的 movement，在一个真正独立的 Checker 批准之前，不得被选作下游功能的*输入*。这一点在选取器（picker）层（A4/A6 要求状态为 `EARMARKED`，而非仅仅 `EARMARKING`）以及服务层都有强制实施。

## 服务端守卫（`service/balanceService.ts`）

- **重复 ISSUE 守卫** —— 对一个已经是 `ACTIVE` 状态的自然键（natural key）再次执行创建型 `movementType`，返回 409。
- **Root-Issue-Released 守卫**（`assertRootIssueReleased()`）—— 任何针对根/新建子合约的非 ISSUE movement，只要该合约自身的 ISSUE 尚未 `RELEASED`，一律拒绝。
- **Tenor 流程控制** —— Sight LC 不会产生 Acceptance；Acceptance 自身的 `tenorType` 必须与其父级一致。
- **SG Issue 上限** —— 在为新的 SG 调用 `createContract()` 之前，先校验父 LC 的 Tight Available（已扣减既有 SG 敞口）。
- **重复 `sourceTransactionRef` 守卫** —— 按合约维度校验。
- **Maker EC/Cancel** —— `PENDING → CANCELLED`，与 Checker 的 `reject()` 是两个性质截然不同的动作。
- **幂等键（Idempotency key）** —— `(balanceContractId, eventSeq)`，唯一约束（UNIQUE constraint）。
- **`assertValidAmount()`** —— Amount 必须 > 0（或在合法的 CLOSE 相关场景下恰好为 0），在 Submit 与 Release 两个环节都会校验，作为纵深防御（defense-in-depth）的兜底，而不仅仅是客户端校验。
- **Sight-tenor UTILIZE Maker-Submit 关卡** —— 若某笔 Sight 的 `IPLC_LC`/`UTILIZE` 尚无先前的 Maker Submit（`makerSubmittedAt`），`release()` 本身会返回 409；该限制的作用范围经过界定，不会影响经由另一条流程释放的 Usance UTILIZE。

## A3/A3S 的 acknowledgment 环节

A3/A3S（Document Arrival）有其自身独立的两阶段确认：`POST .../acknowledge`（由早先仅供 B3 使用的路由改造而来）会写入 `acknowledgedBy`/`acknowledgedAt`——这是一个与该 movement 自身最终 `release()` 截然不同的 _Checker_ acknowledgment。一旦 acknowledged，`displayStatus()` 会显示为 `EARMARKED`（而非 `EARMARKING`），Checker Queue 也会隐藏该项——"A3 A3S 交易 Approve 過後 不要再顯示."

## 跨会话的组合/关联 movement 关联关系

A3S 与 B4 通过 `businessEventId` 识别 compound legs；A6 通过 `referencedTransactionId` 关联既有 Document Arrival。Checker 可从服务端重新解析关联关系，不依赖 Maker 同一浏览器会话的内存结果。B5 是 plain 单一 movement，独立 Checker 直接处理所选 settlement。

## 按功能划分的 Checker Queue 范围

由于多个 `InstrumentType` 会被不止一个业务功能共用（例如 `IPLC_LC` 会被 A1/A2/A3/A3S/A4 操作），Checker Queue 被限定为只显示某个给定功能*自己有可能产生*的 movement（`movementTypeMatchesFunction()`）——"各功能 RELEASE 自己產生的 PENDING 或 EARMARKING 交易."

## 2026-08-26 补充——Maker≠Checker 现在是真正强制的 4-eyes 分离（业务反转，取代此前"交由银行外部政策处理"的立场）

本笔记开篇所写的"Balance Component 强制实施真正的 4-eyes 控制"这句话，此前实际上只覆盖了"PENDING 必须经 Checker 处理才能生效"这一层——并未涵盖"Checker 是否真的是与 Maker 不同的人"。业务方已于 2026-08-24 把这一层也补上了：

- **RELEASE / REJECT**——`applyStatusTransition()` 在查表判定合法迁移之前，先调用新增的 `assertMakerCheckerSeparation(createdBy, actingUser, action)`：若该笔 movement 的创建者（`createdBy`）与实际操作者（`releasedBy`）相同，抛出新增的 `MakerCheckerConflictError`（HTTP 409 `MAKER_CHECKER_CONFLICT`）。见 [[MAKER-CHECKER-RULE-060]]。
- **A3/A3S 的 acknowledge（Checker 确认）**——`acknowledgeArrival()` 本身从不触碰 `status`，因此并不经过 `applyStatusTransition()`；它在自己的校验回调里直接调用同一个 `assertMakerCheckerSeparation()`，对 `acknowledgedBy` 做同样的比较。见 [[MAKER-CHECKER-RULE-061]]。
- **CANCEL / EDIT 不受影响**——CANCEL 是 Maker 对自己名下仍处于 PENDING 状态记录的 Error Correction（错误更正），`createdBy === actingUser` 在这里正是预期中的正常情形，不是冲突，因此这两个动作没有加上述校验。

本笔记上方"服务端守卫"一节所列的既有守卫、"A3/A3S 的 acknowledgment 环节"一节的描述均未过时，此处新增的是一层此前完全没有的、额外的身份比较守卫，附加在这些既有机制之上，而不是取代它们。

本次反转同时也更正了 [[fixed-demo-maker-checker-identities-no-real-auth-modeled]] 与本仓另外两条领域概念笔记（movementaction-applystatustransition-state-machine、maker-checker-4-eyes-movement-lifecycle）此前记载的"不强制校验"立场——各笔记均已就地追加对应的 2026-08-26 更正说明，原文保留未删除。

## Related knowledge

- [[BalanceMovement]]
- [[BalanceContract]]
- [[Off-Balance-Sheet Exposure]]
- [[Close Eligibility]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
