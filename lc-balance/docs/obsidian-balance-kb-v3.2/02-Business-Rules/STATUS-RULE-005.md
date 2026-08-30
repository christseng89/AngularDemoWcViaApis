---
knowledge_id: STATUS-RULE-005
title: "关闭金额必须与当前已确认余额精确相等 —— 在 Submit 与 Release 两个阶段均会重新核验"
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

# STATUS-RULE-005 — 关闭金额必须与当前已确认余额精确相等 —— 在 Submit 与 Release 两个阶段均会重新核验

## 状态
CONFIRMED

## 业务规则
CLOSE 变动记录的 ceilingAmount 必须与合约当前的已确认余额精确相等（而不仅仅是不超过它），该检查会在 Maker 提交时（createMovement 的 closeShaped 检查）执行一次，并在 Checker 释放时，针对彼时最新的已确认余额重新核验一次——一笔变动记录的 ceilingAmount 在 Submit 时即被永久冻结，此后从不重新计算，因此若在 Submit 到 Release 之间发生余额漂移，需要取消并重新提交，而不会被静默地多写或少写。

## 触发条件
在 Submit 阶段：ctx.ceilingAmount != ctx.confirmedBalance。在 Release 阶段：parseMonetaryAmount(movement.ceilingAmount) != current confirmedBalance（『之前』值）。

## 结果
Submit 阶段不匹配 → InsufficientBalanceError。Release 阶段发生漂移 → IllegalStateTransitionError（『Cancel this CLOSE request and re-submit』）。

## 示例
import-case-8/9/10 与 export-case-8/9：关闭操作将剩余全部余额（55,000 / 71,000 / 60,000 / 90,000 / 90,000）精确核销至 0，合约状态转为 CLOSED。closeFunction.test.ts 中的 CLOSE-A10-006：在 Submit 与 Release 之间，一笔不相关的 AMEND_INCREASE 被释放，导致已确认余额发生变动，原先那笔 CLOSE 在 Release 时随即抛出 IllegalStateTransitionError。

## 验证说明
直接阅读了 balanceService.ts 第 200-230 行与第 1159-1182 行——在这两个阶段均确认存在精确相等检查，与候选项的说法逐字相符。已将 4 个描述同一事实、但来自不同证据来源的近似重复候选项（一份泛泛而谈的「三层资格判定」复述、业务用例注册表中的核销示例，以及一份质量整改历史验证文档的复述）合并为本条单一规则，保留最有力（代码+单元测试）的证据作为主证据，其余折叠为佐证性证据，而非另立条目。

## 来源证据

实现:
- `microservices/balance-component/src/service/balanceService.ts:200-230 (closeShaped)`
- `microservices/balance-component/src/service/balanceService.ts:1159-1182 (release() re-check)`

测试:
- `microservices/balance-component/test/unit/service/closeFunction.test.ts:165-222`
- `backend/data/businessCases.js:1008-1024 (import-case-8)`
- `analysis/Balance-Component-New-Test-Cases-Verification-2026-08-21.md`
- `analysis/Balance-Component-Import-Case-12-Verification-2026-08-22.md`
- `analysis/Balance-Component-Export-Case-11-Verification-2026-08-22.md`
- `analysis/balance-component-api.yaml:805-813,953-959 (OAS documents the same Submit+Release re-check)`

## 相关知识
- [[Close Eligibility]]
- closeShaped sufficiency check
- release()'s CLOSE-specific re-check
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
