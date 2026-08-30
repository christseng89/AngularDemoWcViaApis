---
knowledge_id: MOVEMENT-RULE-001
title: "MOVEMENT_DIRECTION 的正负号，是按 instrument/movementType 组合固定不变的"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-001 — MOVEMENT_DIRECTION 的正负号，是按 instrument/movementType 组合固定不变的

## 状态
CONFIRMED

## 业务规则
每一种 movementType 都只有一个固定的方向（+1 表示增额形态，-1 表示减额形态），并在每一个余额推导函数（computeConfirmedBalance/computeAvailableBalance/computePendingDecreaseTotal/computeFaceAmount）中被统一应用。涵盖 ISSUE/AMEND_INCREASE/AMEND_DECREASE/UTILIZE（LC）、CREATE/PARTIAL_SETTLE/FULL_SETTLE（Acceptance）、PARTIAL_REDEEM/FULL_REDEEM（SHGT）、AMEND/HONOUR/ACCEPT（Confirmation）、REIMBURSE/RECLASSIFY_OUT（资产side账户）、CLOSE（A10/B6）。根据源代码注释，CANCEL、EXPIRE、REVERSAL 被有意排除在该表之外——REVERSAL 需要针对具体 movement 做特殊处理（是将『原始』被引用 movement 的正负号反转，而不是自身拥有一个固定方向），而 CANCEL/EXPIRE 只是在编写该表时从未被实际用到过；对任何未列入表中的 movementType 做查找会直接抛出异常，而不是使用默认值。

## 条件
一张以 movementType 字符串为键的静态查找表。

## 结果
参见源代码中的 MOVEMENT_DIRECTION 表；例如 CLOSE: -1。

## 示例
balanceDerivation.ts 第 17-49 行，已逐字对照源文件验证。

## 验证说明
已直接阅读完整源文件；该表、注释、以及『查找不到键即抛异常』的行为，均已逐字确认与所述一致。已将一条重复的、源自设计文档的复述条目（"MOVEMENT_DIRECTION 固定的 +1/-1 表，按 instrumentType×movementType"，来自 design-docs-figures-mapping 分组）合并入本条目——同一张底层表，没有新增信息。

## 来源证据

实现：
- `microservices/balance-component/src/domain/balanceDerivation.ts:17-49,57-63`

测试：
- （未引用直接测试证据）

## 相关知识
- [[BalanceMovement]]
- MOVEMENT_DIRECTION 查找表
- signedAmount()
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
