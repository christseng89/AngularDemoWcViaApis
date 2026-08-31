---
knowledge_id: STATUS-RULE-021
title: "CLOSE 资金变动（A10/B6）始终以红色徽章显示为 CLOSING/CLOSED，会覆盖普通状态与预留状态两条显示轨道"
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

# STATUS-RULE-021 — CLOSE 资金变动（A10/B6）始终以红色徽章显示为 CLOSING/CLOSED，会覆盖普通状态与预留状态两条显示轨道

## 状态
CONFIRMED

## 业务规则
任何 movementType==='CLOSE' 的资金变动，都会在普通的 PENDING/APPROVED 逻辑或 EARMARKING/EARMARKED 逻辑运行之前，被短路导向其自身专属的显示轨道，因此一笔 Close 绝不会在被标记为红色徽章的同时又被误读为具有正面含义的『APPROVED』。一次被 REJECTED/CANCELLED 的 Close 尝试则会原样落入普通状态处理流程（本就是红色，正确地读作『此操作失败』）。

## 条件
movementType === 'CLOSE' 且 status 为 'PENDING' 或 'RELEASED'

## 结果
PENDING → 'CLOSING'/tb-status-badge--negative；RELEASED → 'CLOSED'/tb-status-badge--negative。

## 示例
displayStatus('RELEASED','IPLC_LC','CLOSE') → 'CLOSED'；displayStatus('REJECTED','IPLC_LC','CLOSE') → 'REJECTED'（不变）。

## 验证说明
直接阅读了两个函数——完全吻合，包括 REJECTED/CANCELLED 的直落（fall-through）行为。未降级。

## 来源证据

实现：
- `src/app/transaction-builder/balance-component.model.ts:551-560 (displayStatus CLOSE branch)`
- `src/app/transaction-builder/balance-component.model.ts:613-631 (isCloseMovement + statusBadgeClass CLOSE branch)`

测试：
- `src/app/transaction-builder/balance-component.model.spec.ts:811-845`

## 相关知识
- [[Close Eligibility]]
- [[isclosemovement|isCloseMovement()]]
- [[displaystatus|displayStatus()]]
- [[statusbadgeclass|statusBadgeClass()]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
