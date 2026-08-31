---
knowledge_id: STATUS-RULE-019
title: "事件状态显示映射——预留（Earmark）功能（A3/A3S、B3）与其他所有功能的区别"
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

# STATUS-RULE-019 — 事件状态显示映射——预留（Earmark）功能（A3/A3S、B3）与其他所有功能的区别

## 状态
CONFIRMED

## 业务规则
进口单据到单（Import Document Arrival，A3/A3S，IPLC_LC/UTILIZE）与出口交单（Export Present Docs，B3，EPLC_EXAMINATION/CREATE）属于 D3「实体事件」预留（earmark），其显示状态为 EARMARKING/EARMARKED，而不是其他功能通用的 PENDING/APPROVED。「Released」仅代表该笔资金变动自身的 status==='RELEASED'，绝不会从同层级事件或快照推断得出。

## 条件
isEarmarkFunction(instrumentType, movementType, phase) 为 true，且 phase !== 'finalize'

## 结果
status 为 PENDING 时：若 acknowledgedAt 已设置则显示为 'EARMARKED'，否则显示为 'EARMARKING'；status 为 RELEASED 时显示为 'EARMARKED'。其他所有功能：PENDING→'PENDING'，RELEASED→'APPROVED'。

## 示例
displayStatus('PENDING','IPLC_LC','UTILIZE') 在没有 acknowledgedAt 时 → 'EARMARKING'；设置了 acknowledgedAt 时 → 'EARMARKED'。

## 验证说明
直接阅读了 isEarmarkFunction()／displayStatus()——完全吻合，包括由 acknowledgedAt 驱动的 EARMARKING/EARMARKED 区分逻辑。未降级。

## 来源证据

实现：
- `src/app/transaction-builder/balance-component.model.ts:534-560 (isEarmarkFunction + displayStatus)`

测试：
- `src/app/transaction-builder/balance-component.model.spec.ts:638-679`

## 相关知识
- [[Close Eligibility]]
- [[isearmarkfunction|isEarmarkFunction()]]
- [[displaystatus|displayStatus()]]
- [[statusbadgeclass|statusBadgeClass()]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
