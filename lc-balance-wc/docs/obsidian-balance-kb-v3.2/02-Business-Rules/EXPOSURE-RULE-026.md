---
knowledge_id: EXPOSURE-RULE-026
title: "MEMO 类型的 exposureNature 会强制 accountEntries 为 null（服务端强制执行，API 响应与数据库设计层面均如此）"
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

# EXPOSURE-RULE-026 — MEMO 类型的 exposureNature 会强制 accountEntries 为 null（服务端强制执行，API 响应与数据库设计层面均如此）

## 状态
CONFIRMED

## 业务规则
只要 exposureNature 为 MEMO（未保兑 LC 中 Issuing Bank 一侧的义务，或永远为 MEMO 的 EPLC_EXAMINATION），服务端就会强制将 BalanceMovement.accountEntries 设为 null，因为一笔备忘性圈存永远不会过账 GL，与调用方传入的任何值无关。

## 条件
exposureNature === 'MEMO'。

## 结果
这类异动的 accountEntries 始终为 null。

## 示例
一张未保兑出口 LC 的 Accepted Amount 被作为 MEMO 追踪——仅用于应收/到期日追踪，因为这属于开证行的义务，而非本行自身的义务。

## 验证说明
2026-09-03 以现行 `balanceService.ts` 重新验证：`exposureNature === 'MEMO'` 时，外送字段 `accountEntries` 强制为 null。此规则不等于 `contingentAccountEntry` 为 null；B3 会保留内部 memo voucher 供 UI／稽核显示。

## 原始码证据

实现：
- `analysis/balance-component-api.yaml lines 1240-1254, 1284-1291（本轮未独立重新通读）`
- `microservices/balance-component/src/service/balanceService.ts`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- Contingent Account Entry 与传递型 Account Entry 的区别（GL 归属边界）
- EPLC_EXAMINATION 从不产生 contingentAccountEntry（本一般性 MEMO 规则中，经代码验证的具体案例）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
