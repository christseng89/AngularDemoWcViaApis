---
knowledge_id: STATUS-RULE-018
title: "reject()／cancel() 仅在 PENDING 状态下合法"
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

# STATUS-RULE-018 — reject()／cancel() 仅在 PENDING 状态下合法

## 状态
CONFIRMED

## 业务规则
无论是 Checker 的 reject()，还是 Maker 的 cancel()（EC），都只有在资金变动（movement）当前处于 PENDING 状态时才合法；对一笔已经 RELEASED 的资金变动执行其中任一操作，都会硬性触发 409 ILLEGAL_STATE_TRANSITION。

## 条件
目标 movement.status !== PENDING。

## 结果
409 ILLEGAL_STATE_TRANSITION。

## 示例
一笔已经 Released 的 AMEND_INCREASE → 调用 reject() 会返回 409（「对一笔已 RELEASED 的资金变动执行拒绝 → 409，非法状态转换」）；另一笔已经 Released 的 AMEND_INCREASE → 调用 cancel() 同样会返回 409（「Maker 无法对 Checker 已经终结的事项执行 EC（撤销）」）。

## 验证说明
直接阅读了两个 HTTP 层级的测试用例——两者均如声明般断言返回 409、错误码为 ILLEGAL_STATE_TRANSITION，这实际上正是 statusTransition.ts 中 LEGAL_TRANSITIONS 表（RELEASED: {}）在 HTTP 层的表现，此前已由上文第 3 条规则独立确认过。未降级。

## 来源证据

实现：
- `microservices/balance-component/src/service/balanceService.ts (release()/reject()/cancel() delegate to applyStatusTransition())`

测试：
- `microservices/balance-component/test/unit/app.test.ts (reject-already-released and cancel-already-released describe blocks)`

## 相关知识
- [[Close Eligibility]]
- POST /balance-movements/:id/reject
- POST /balance-movements/:id/cancel
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
