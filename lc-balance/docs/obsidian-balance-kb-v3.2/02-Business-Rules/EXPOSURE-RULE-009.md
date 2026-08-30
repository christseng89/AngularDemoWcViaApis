---
knowledge_id: EXPOSURE-RULE-009
title: "方向（Direction）到 Dr/Cr 的对应规则，以及 EPLC_CONFIRMATION AMEND 的正负号折叠"
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

# EXPOSURE-RULE-009 — 方向（Direction）到 Dr/Cr 的对应规则，以及 EPLC_CONFIRMATION AMEND 的正负号折叠

## 状态
CONFIRMED

## 业务规则
netDirection（+1 = 建立敞口，-1 = 释放敞口）决定哪个科目族属于 Dr、哪个属于 Cr：+1 → Dr=establishDr/Cr=establishCr；-1 → 两者互换。netDirection 通常等于 MOVEMENT_DIRECTION[movementType]，唯一例外是当提交金额本身为负数时，基础方向会反转——这仅用于 EPLC_CONFIRMATION 唯一的 AMEND movementType（B2），因为它没有独立的 AMEND_INCREASE/AMEND_DECREASE，而是靠金额本身的正负号来携带方向信息。分录中的 amount 字段永远以绝对值输出。

## 条件
signedAmount.isNegative() 会翻转 baseDirection；否则 netDirection = baseDirection。

## 结果
在 EPLC_CONFIRMATION 上以 amount=-10000 执行 AMEND，会以 10000（绝对值）过账「释放方向」的配对（Dr=Confirmation Undertakings Outstanding，Cr=Issuing Bank Confirmation Exposure）。

## 示例
AMEND amount='-2500.50' → entry.amount === '2500.5'（绝对值，且经 Decimal.toFixed() 去除尾随零）。

## 验证说明
单一候选，无重复。已直接通读完整函数主体——与描述完全一致。

## 原始码证据

实现：
- `microservices/balance-component/src/domain/contingentAccountEntry.ts:129-151 (verified read)`

测试：
- `microservices/balance-component/test/unit/domain/contingentAccountEntry.test.ts:112-153, 188-196`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- EPLC_CONFIRMATION AMEND 的正负号折叠
- B2 自身的 AMEND 显示去符号化处理（displayMovementType/displayMovementAmount，参见 CLAUDE.md 决策记录）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
