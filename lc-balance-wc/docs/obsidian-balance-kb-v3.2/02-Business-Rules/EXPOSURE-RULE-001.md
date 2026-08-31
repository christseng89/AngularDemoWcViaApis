---
knowledge_id: EXPOSURE-RULE-001
title: "SHGT 表外风险敞口 = Σ(RELEASED/PENDING 状态的 ISSUE) − Σ(RELEASED 状态的赎回，加上匹配到同一 LC 上仍处于 PENDING 状态的 UTILIZE 的 businessEventId 的 PENDING 状态赎回)"
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

# EXPOSURE-RULE-001 — SHGT 表外风险敞口 = Σ(RELEASED/PENDING 状态的 ISSUE) − Σ(RELEASED 状态的赎回，加上匹配到同一 LC 上仍处于 PENDING 状态的 UTILIZE 的 businessEventId 的 PENDING 状态赎回)

## 状态
CONFIRMED

## 业务规则
computeOffBalanceExposure() 将某个 SHGT 合约自身的变动记录筛选为：任何 RELEASED 状态的变动记录（ISSUE 或 PARTIAL_REDEEM/FULL_REDEEM）；任何 PENDING 状态的 ISSUE（自 Submit 起即占用额度——"占用从宽"）；以及任何 businessEventId 属于调用方传入的 matchedPendingUtilizeBusinessEventIds 集合（默认为空，意味着赎回默认严格按"仅 RELEASED 才抵扣"处理——"增加从严"）的 PENDING 状态赎回。CANCELLED/REJECTED/SUPERSEDED 状态的变动记录以及未匹配的独立 PENDING 状态赎回均被排除在外。ISSUE 贡献 +ceilingAmount，赎回贡献 −ceilingAmount。无法识别的 movementType 会抛出异常。

## 触发条件
变动记录属于某个与该 LC 共享同一 parentLogicalContractId 的 SHGT 合约；调用方已预先筛选出该 SHGT 自身的变动记录。

## 结果
单一 Decimal 数值 = 针对父 LC 的净未偿 SG 风险敞口，供 A3/A3S 的 UTILIZE 与 A8 新建 SG Issue 的充足性检查以及持久化的 BalanceSnapshot.offBalanceExposure 字段使用。

## 示例
ISSUE 100000 RELEASED + PARTIAL_REDEEM 30000 RELEASED + ISSUE 10000 PENDING → 风险敞口 = 80000。S02/G02：LC 10,000，SG 未偿余额 8,000，A3S 的 Bill Amount 为 10,000 → 该 SG 自身的 FULL/PARTIAL_REDEEM（8,000，PENDING，已匹配 businessEventId）立即抵扣，因此 LC 的 UTILIZE 只需吸收增量部分的 2,000。

## 验证说明
合并了四个相互重叠的候选项（基础公式、A3S 提前抵扣的例外情形、独立的 A9 在 Release 之前不作反应的文档图示规则，以及 v1.15.0 OAS 更新日志规则）为一条 CONFIRMED 规则——四者都在描述来自代码、测试、服务调用点与 OAS/设计文档的同一个 computeOffBalanceExposure() 行为，彼此之间没有分歧。直接阅读了完整的源文件以及 balanceService.ts 中的调用代码（而非仅信任行号范围），以确认此次合并忠实准确。

## 来源证据

实现:
- `microservices/balance-component/src/domain/offBalanceExposure.ts:54-74 (verified read in full)`
- `microservices/balance-component/src/service/balanceService.ts:601-606 (assembleSnapshot's automatic businessEventId derivation, verified read)`
- `microservices/balance-component/src/service/balanceService.ts:286-307 (checkUtilizeShapedSufficiency's own matched-set construction, verified read)`

测试:
- `microservices/balance-component/test/unit/domain/offBalanceExposure.test.ts:17-46 (file line count confirmed 298 lines total, range plausible)`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- [[Off-Balance-Sheet Exposure|表外风险敞口（SHGT vs. 进口/出口 LC）]]
- 非对称抵扣规则：SG Issue 自 Submit 起即占用额度，SG Redemption 只有在 Released 之后才释放额度，唯一的例外是那一条 A3S 匹配 businessEventId 的情形
- v1.15.0 OAS 更新日志记录了同一条规则
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
