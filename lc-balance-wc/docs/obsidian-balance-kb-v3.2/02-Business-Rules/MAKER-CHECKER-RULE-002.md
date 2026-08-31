---
knowledge_id: MAKER-CHECKER-RULE-002
title: "Close 适格性判断的三层防线——选取器提示、提交与放行共用同一项检查"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-002 — Close 适格性判断的三层防线——选取器提示、提交与放行共用同一项检查

## 状态
CONFIRMED

## 业务规则
由单一共用的适格性判断函数（evaluateContractCloseEligibility）同时支撑三个独立的调用点：第一步目录选取器（catalog-picker）的提示逻辑（listCloseEligibleContracts）、createMovement() 在 Maker 提交（Submit）时的充分性检查，以及 release() 在 Checker 核准（Approve）时的二次检查——因此，一个候选合约若在这些阶段之间的任何两处失去了适格资格，都会被捕捉到，而不仅仅是那些从一开始就不符合条件的候选合约。

## 适用条件
不适用——本条为结构性/架构性规则。

## 结果
在选取器展示、Submit 与 Release 三处，适格性判断的执行结果保持一致。

## 示例
listCloseEligibleContracts() 会将不适格（SG 余额非零）的 LC 及已经 Closed 的 LC 排除在选取器提示之外；createMovement() 会针对相同条件独立阻止一次 Submit 尝试；若条件在 Submit 之后发生变化，release() 也会独立地再次阻止放行。

## 核实说明
CLAUDE.md 决策日志中关于 A10/B6 Close 的条目独立佐证了同一套三层防线架构（选取器提示／createMovement 充分性检查／release 借助 excludeMovementId 进行二次检查）。已确认。

## 来源证据

实现代码：
- `microservices/balance-component/src/service/balanceService.ts:413-430`

测试：
- `microservices/balance-component/test/unit/service/closeFunction.test.ts:438-486`

## 相关知识
- [[Maker Checker Lifecycle]]
- evaluateContractCloseEligibility()（私有服务方法，共 3 个调用点）
- listCloseEligibleContracts() — 第一步选取器提示，采用 N+1 批量抓取
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
