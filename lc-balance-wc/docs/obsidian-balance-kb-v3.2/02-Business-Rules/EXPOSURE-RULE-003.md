---
knowledge_id: EXPOSURE-RULE-003
title: "SG Issue（A8）的上限为父 LC 的严格可用余额，并扣除既有的 SG 风险敞口，在合约创建之前完成检查"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - confirmed
---

# EXPOSURE-RULE-003 — SG Issue（A8）的上限为父 LC 的严格可用余额，并扣除既有的 SG 风险敞口，在合约创建之前完成检查

## 状态
CONFIRMED

## 业务规则
一笔新建 SG 请求的 ceiling 金额不得超过 parentConfirmedBalance − parentPendingDecreaseTotal − existingShgtExposure（existingShgtExposure 通过前述合并后的表外风险敞口规则，针对父 LC 上其他未偿的 SG 变动记录计算得出）。checkNewShgtSufficiency() 会先解析出父 LC，计算出该数值，并在 createContract() 运行之前抛出 InsufficientBalanceError，因此一笔被拒绝的 SG Issue 永远不会留下孤立的 BalanceContract 行。

## 触发条件
requestedAmount > tightAvailable，其中 tightAvailable = parentConfirmedBalance − parentPendingDecreaseTotal − existingShgtExposure。

## 结果
409 InsufficientBalanceError，其中会指明确切的严格可用额度及其三个组成部分；被拒绝时不会留下孤立的合约行。

## 示例
parentConfirmedBalance=100000，existingShgtExposure=90000（第一笔 SG 已未偿），requestedAmount=90000（第二笔 SG）→ tightAvailable=10000 → 被拒绝。

## 验证说明
合并了四个近乎重复的候选项（风险敞口域的 checkShgtIssueSufficiency、balance-service-orchestration 的"SG Issue 上限……在合约创建之前"、api-specs 的"SG Issue 上限为 Tight Available"，以及 design-docs-figures-mapping 的"checkShgtIssueSufficiency 对 A8 设限"）为一条规则。通过直接阅读该领域函数及其在 balanceService.ts 中的调用点得到验证——四个候选项描述的是同一机制/公式，彼此没有矛盾；design-docs-figures-mapping 候选项还额外确认了这并非从早前"Available Balance"措辞发生的行为变更，与代码始终基于 Tight 的做法一致。

## 来源证据

实现:
- `microservices/balance-component/src/domain/offBalanceExposure.ts:88-107 (verified read)`
- `microservices/balance-component/src/service/balanceService.ts:331-359 (checkNewShgtSufficiency, verified read: parent resolution, confirmed/pendingDecreaseTotal, existingShgtExposure, sequenced BEFORE contract creation per the registry dispatch at line 326)`

测试:
- `microservices/balance-component/test/unit/domain/offBalanceExposure.test.ts:180-247`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- checkShgtIssueSufficiency
- newContractSufficiencyRegistry（SHGT:ISSUE 分派）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
