---
knowledge_id: STATUS-RULE-024
title: "closingPending 仅在根合约上存在一笔真正仍为 PENDING 状态的 A10/B6 CLOSE 资金变动时才为 true"
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

# STATUS-RULE-024 — closingPending 仅在根合约上存在一笔真正仍为 PENDING 状态的 A10/B6 CLOSE 资金变动时才为 true

## 状态
CONFIRMED

## 业务规则
LC 主档索引推导 closingPending 的方式为：根事件（root events）中存在一笔 movementType==='CLOSE' 且 eventStatus==='PENDING' 的资金变动（仅限根层级，绝不合并子事件，因为 Close 永远发生在根层级）。该值每次加载时都会重新推导，因此 Checker 对 CLOSE 的一次 Reject，会自然地将该行还原为普通的 ACTIVE。

## 条件
root.some(movementType==='CLOSE' && eventStatus==='PENDING')

## 结果
该条件为真时，索引行显示 CLOSING 而非 ACTIVE；在 Release（→CLOSED）或 Reject（→ACTIVE）后会自动还原。

## 示例
一份存在 Maker 已提交、但尚未经 Checker Released 的 CLOSE 的 LC，即使 contract.status 仍为 ACTIVE，也会显示为 CLOSING。

## 验证说明
直接阅读了确切的推导逻辑——root.some(...) 检查完全吻合，且代码注释明确说明『仅检查 root、而非 allEvents 既正确又更省成本』，因为 Close 永远发生在根层级。未降级。

## 来源证据

实现：
- `src/app/transaction-builder/inquire-events.service.ts:402-404`

测试：
- `src/app/transaction-builder/inquire-events.service.spec.ts:395-465`

## 相关知识
- [[Close Eligibility]]
- LcIndexRow.closingPending
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
