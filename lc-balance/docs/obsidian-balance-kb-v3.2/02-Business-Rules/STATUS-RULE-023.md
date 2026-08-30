---
knowledge_id: STATUS-RULE-023
title: "合约层级的状态徽章配色——ACTIVE 为绿色，CLOSED/CANCELLED 为红色，SUPERSEDED 为灰色，并存在 CLOSING 覆盖规则"
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

# STATUS-RULE-023 — 合约层级的状态徽章配色——ACTIVE 为绿色，CLOSED/CANCELLED 为红色，SUPERSEDED 为灰色，并存在 CLOSING 覆盖规则

## 状态
CONFIRMED

## 业务规则
LC／保兑（Confirmation）主档索引对 ContractStatus 的配色，沿用了 statusBadgeClass() 已经确立的绿色=approved／红色=negative／灰色=neutral 的语义体系。一份 ACTIVE 状态的合约，若其上存在一笔 Maker 已提交但尚未被 Checker Released 的 CLOSE（closingPending），即使 ContractStatus 在 Release 之前实际仍保持 ACTIVE，也会被标记为红色／'CLOSING'。任何无法识别的状态都会防御性地回退为灰色，绝不会呈现无样式的空类。

## 条件
ContractStatus 的取值，加上一个可选的 closingPending 布尔值。

## 结果
ACTIVE（无 closingPending）→ 绿色/'ACTIVE'；ACTIVE+closingPending → 红色/'CLOSING'；CLOSED → 红色/'CLOSED'；CANCELLED → 红色/'CANCELLED'；SUPERSEDED → 灰色/'SUPERSEDED'；无法识别 → 灰色。

## 示例
contractStatusBadgeClass('ACTIVE', true) → 'tb-status-badge--negative'；contractStatusLabel('ACTIVE', true) → 'CLOSING'。

## 验证说明
直接阅读了两个函数——每一个分支都完全吻合，包括防御性的灰色回退。未降级。

## 来源证据

实现：
- `src/app/transaction-builder/balance-component.model.ts:650-663`

测试：
- `src/app/transaction-builder/balance-component.model.spec.ts:858-895`

## 相关知识
- [[Close Eligibility]]
- [[statusbadgeclass|contractStatusBadgeClass()]]
- [[statusbadgeclass|statusBadgeClass()]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
