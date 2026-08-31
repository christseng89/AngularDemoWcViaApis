---
knowledge_id: STATUS-RULE-004
title: "A10/B6 关闭资格判定 —— SG=0、Acceptance=0、整棵树中无任何未结事件、且尚未处于 Closed 状态"
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

# STATUS-RULE-004 — A10/B6 关闭资格判定 —— SG=0、Acceptance=0、整棵树中无任何未结事件、且尚未处于 Closed 状态

## 状态
CONFIRMED

## 业务规则
根合约（LC/Confirmation）只有在同时满足以下条件时才具备关闭（Close）资格：尚未处于 CLOSED 状态；SHGT 子项的已确认余额合计恰好为 0；Acceptance 子项的已确认余额合计恰好为 0；以及其整棵树（根合约自身的变动记录，加上每一个 SG/Acceptance/Examination 子项）中不存在任何仍处于未结状态的事件——包括一笔已 RELEASED 但尚未被 presentDocsConsumedAt 消耗的 B3 交单（出口侧）。rootConfirmedBalance 本身从不构成阻断条件。任何未满足的条件都会一并报告。

## 触发条件
参见 evaluateCloseEligibility()/evaluateContractCloseEligibility() 的 4 项检查。

## 结果
{eligible:false, reasons:[...]}，列出每一项被违反的条件（各自附带说明信息，例如「Shipping Guarantee Balance must be 0 (currently X) — redeem the Shipping Guarantee first (A9).」）；或者 {eligible:true, reasons:[]}。

## 示例
import-case-11：SG 余额为 30,000（非零）→ CLOSE 被拒绝，返回 409，LC/SG 快照保持不变。import-case-12：Acceptance 余额为 50,000（非零）→ 同样被拒绝。export-case-11 在出口侧对相同的 Acceptance 轴检查进行了验证。

## 验证说明
直接阅读了 closeEligibility.ts 与 balanceService.ts 的 evaluateContractCloseEligibility()——所推送的 4 项 reasons 与描述完全一致；已确认整棵树的扫描范围（根合约 + SG + Acceptance + Examination 子项），包括 presentDocsConsumedAt 这一细节。已将原始的「无未结事件覆盖整棵树」候选项（近似重复）作为补充说明合并进本条规则，而非另立条目，并将实盘验证证据（业务用例候选项「只要任一子账簿余额非零，A10/B6 关闭即被阻断」）折叠为佐证性的测试证据，而非单独的规则。

## 来源证据

实现:
- `microservices/balance-component/src/domain/closeEligibility.ts:47-64`
- `microservices/balance-component/src/service/balanceService.ts:431-464 (evaluateContractCloseEligibility, whole-tree scan)`

测试:
- `microservices/balance-component/test/unit/domain/closeEligibility.test.ts:14-59`
- `microservices/balance-component/test/unit/service/closeFunction.test.ts:103-163 (whole-tree PENDING-event blocking)`
- `analysis/Balance-Component-Import-Case-12-Verification-2026-08-22.md`
- `analysis/Balance-Component-Export-Case-11-Verification-2026-08-22.md`

## 相关知识
- [[Close Eligibility]]
- evaluateCloseEligibility()
- evaluateContractCloseEligibility()
- closeEligibility.ts
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
