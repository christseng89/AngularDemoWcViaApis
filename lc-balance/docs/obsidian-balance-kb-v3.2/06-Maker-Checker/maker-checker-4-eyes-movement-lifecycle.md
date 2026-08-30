---
knowledge_id: maker-checker-4-eyes-movement-lifecycle
title: "Maker/Checker（四眼原则）资金变动生命周期"
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

# Maker/Checker（四眼原则）资金变动生命周期

一条 BalanceMovement 记录由 Maker 创建时状态为 PENDING，之后必须由 Checker（或对于 CANCEL/EDIT，由 Maker 本人对自己的记录）通过 RELEASE、REJECT、CANCEL 或 EDIT 之一进行处理——任何未出现在 LEGAL_TRANSITIONS 表中的状态迁移都会被判定为非法并直接抛出异常，而不是静默地不做任何操作。系统本身并不强制校验 Maker 与 Checker 是否为不同使用者，这一点留给银行自身的外部角色/权限策略去约束。

## Source Evidence

- `microservices/balance-component/src/domain/statusTransition.ts lines 1-16`
- `microservices/balance-component/test/unit/domain/statusTransition.test.ts line 16-18`

## 2026-08-26 补充更正——「系统本身并不强制校验 Maker 与 Checker 是否为不同使用者」已不再完全成立

> [!warning] 本笔记原文对强制校验的定性已部分过时
> 本笔记正文所写「系统本身并不强制校验 Maker 与 Checker 是否为不同使用者，这一点留给银行自身的外部角色/权限策略去约束」，对应的是 2026-08-14 的原始设计。**业务方已于 2026-08-24 反转此立场，实现了真正的 4-eyes 分离**：RELEASE、REJECT 两个动作（经 `applyStatusTransition()`）以及 A3/A3S 的 Checker 确认动作（`acknowledgeArrival()`，绕过 `applyStatusTransition()` 直接调用同一校验函数）现在都会比较 `createdBy` 与实际操作者，相同则抛出 `MakerCheckerConflictError`（HTTP 409 `MAKER_CHECKER_CONFLICT`）。
>
> 「或对于 CANCEL/EDIT，由 Maker 本人对自己的记录」这一句在原文中已经准确描述了 CANCEL 的正常情形，且这部分未受影响——CANCEL 依旧被明确排除在新校验之外，`cancelledBy === createdBy` 仍是预期中的正常情形。完整规则见新增的 [[MAKER-CHECKER-RULE-060]]（RELEASE/REJECT）与 [[MAKER-CHECKER-RULE-061]]（acknowledgeArrival()）。

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
