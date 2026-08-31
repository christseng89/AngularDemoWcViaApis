---
knowledge_id: STATUS-RULE-008
title: "根合约自身的 ISSUE 必须先被 RELEASED，才能进行其他任何动作（assertRootIssueReleased）"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - status
  - confirmed
---

# STATUS-RULE-008 — 根合约自身的 ISSUE 必须先被 RELEASED，才能进行其他任何动作（assertRootIssueReleased）

## 状态
CONFIRMED

## 业务规则
对于一个已存在的根合约（IPLC_LC/EPLC_LC/EPLC_CONFIRMATION），除非该合约自身的 ISSUE 变动记录已处于 RELEASED 状态，否则任何其他 movementType 都会被以 IllegalStateTransitionError 拒绝。同一守卫也会阻止在其自身 ISSUE 尚未 Released 的父合约之下，创建全新的子合约（SHGT/Acceptance/EPLC_EXAMINATION）。其依据在于：根合约在 Maker 提交时（早于 Checker 释放之前）即被置为 ACTIVE，因此若无此守卫，一笔 UTILIZE 有可能针对一个仍处于 PENDING 状态的 ISSUE 完成释放，从而使已确认余额变为负数。

## 触发条件
目标根合约的 ISSUE 缺失、或状态不等于 RELEASED，且传入的 movementType ≠ ISSUE（或正在此类父合约之下创建新的子合约）。

## 结果
返回 409 IllegalStateTransitionError，提示「Release the Issue first.」

## 示例
一笔 LC ISSUE 仍处于 PENDING 状态；针对它发起后续的 UTILIZE/AMEND_DECREASE 会持续返回 409，直到该 ISSUE 被 Checker 释放为止；在同一未释放父合约之下创建新的子项 SG ISSUE，同样会返回 409。

## 验证说明
直接阅读了 assertRootIssueReleased 以及两处调用点，另有一项引用同一修复的实盘 HTTP 测试。已将近似重复的 routes-api-e2e 候选项（同一规则，来自端到端证据）合并进本条单一条目，而非另立一条「根合约自身的 ISSUE 必须被释放」的独立规则。

## 来源证据

实现:
- `microservices/balance-component/src/service/balanceService.ts:852-861 (assertRootIssueReleased)`
- `microservices/balance-component/src/service/balanceService.ts:894-900 (existing-contract call site)`
- `microservices/balance-component/src/service/balanceService.ts:909-917 (new-child-contract call site)`

测试:
- `microservices/balance-component/test/unit/service/balanceService.test.ts:644-782`
- `microservices/balance-component/test/unit/app.test.ts:~2965-2980 (HTTP-level, references the same fix by name)`

## 相关知识
- [[Close Eligibility]]
- ROOT_INSTRUMENT_TYPES
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
