---
knowledge_id: EXPOSURE-RULE-010
title: "未识别的 movementType 在两个领域模块中都会被防御性处理，但处理方式不同——contingentAccountEntry 静默返回 null，offBalanceExposure/sumExaminationCreates 则抛出 Error"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 分析快照中没有 .git 历史记录，参见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - confirmed
---

# EXPOSURE-RULE-010 — 未识别的 movementType 在两个领域模块中都会被防御性处理，但处理方式不同——contingentAccountEntry 静默返回 null，offBalanceExposure/sumExaminationCreates 则抛出 Error

## 状态
CONFIRMED

## 业务规则
deriveContingentAccountEntry() 对于不在 MOVEMENT_DIRECTION 中的 movementType 会返回 null（而非报错），因此未映射的 movementType 会静默地不产生任何账目分录。相反，computeOffBalanceExposure() 与 sumExaminationCreates()（被全部 3 个 Present Docs 圈存函数使用）在遇到意外的 movementType 时会直接 THROW，因为调用方理应已预先过滤出该工具唯一合法的 movementType 集合。

## 条件
contingentAccountEntry：MOVEMENT_DIRECTION[movementType] === undefined。offBalanceExposure：movementType 超出调用方对该工具承诺保证的合法集合范围。

## 结果
contingentAccountEntry → null（静默）。offBalanceExposure/sumExaminationCreates → 抛出命名了该意外 movementType 的 Error。

## 示例
deriveContingentAccountEntry({instrumentType:'IPLC_LC', movementType:'NOT_A_REAL_MOVEMENT_TYPE', ...}) → null。computeOffBalanceExposure([{movementType:'AMEND',...}]) → 抛出 /unexpected SHGT movementType "AMEND"/。

## 验证说明
单一候选，无重复。这是一种防御性守卫惯例，原始候选中正确指出「本身并非严格意义上的业务规则」——但因其记录了真实且经测试验证的代码行为，仍保留为 CONFIRMED。

## 原始码证据

实现：
- `microservices/balance-component/src/domain/contingentAccountEntry.ts:129-130 (verified read)`
- `microservices/balance-component/src/domain/offBalanceExposure.ts:65-73, 123-128 (verified read)`

测试：
- `microservices/balance-component/test/unit/domain/contingentAccountEntry.test.ts:184-186`
- `microservices/balance-component/test/unit/domain/offBalanceExposure.test.ts:43-46, 76-79`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
