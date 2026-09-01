---
knowledge_id: MAKER-CHECKER-RULE-032
title: '跨会话的关联分腿解析，在当前会话没有内存记录时，会回退为 businessEventId/referencedTransactionId 查找'
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: 'N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]'
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-032 — 跨会话的关联分腿解析，在当前会话没有内存记录时，会回退为 businessEventId/referencedTransactionId 查找

## 状态

CONFIRMED

## 业务规则

当独立 Checker 会话尚未知 A3S/B4 关联 leg id 时，服务会依据选中 movement 的 `businessEventId` 或 `referencedTransactionId` 从服务端解析，而不是只信任 Maker 同一会话内的 `submitResult`。B5 为单一 movement，不需要关联 leg 解析。

## 条件

knownId（该 ctx 字段）为 null，且 ctx.selectedCheckerMovement.businessEventId（或 .referencedTransactionId）已设定。

## 结果

从服务器解析出真正的关联 movementId；若没有可用的 businessEventId/referencedTransactionId，或找不到匹配项，则解析为 null（进而导致一个干净的 'failed' 结果），而不是发生静默的错误放行或未处理的异常。

## 示例

一位在本会话中从未提交过的复核人，搜索 LC U06 上的 B4 Usance 并点击放行：ctx 中的 dueFromIssuingBankMovementId 为 null，因此会先透过 findByBusinessEventId 查找解析出真正的下游分腿，再执行放行。

## 验证说明

2026-09-01 重新核对 Checker action source 与 tests：跨会话关联解析适用于 A3S、A6 与 B4；B5 走普通单腿流程。已确认。

## 来源证据

实现：

- `src/app/transaction-builder/checker-actions.service.ts:233-296`

测试：

- `src/app/transaction-builder/checker-actions.service.spec.ts:80-99,114-166,188-205,256-278,299-323`

## 相关知识

- [[Maker Checker Lifecycle]]
- 透过 businessEventId / referencedTransactionId 实现的跨会话关联分腿解析
- A6/A3S/B4 的关联式复核人放行/拒绝必须支持真正独立的 Checker 会话
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
