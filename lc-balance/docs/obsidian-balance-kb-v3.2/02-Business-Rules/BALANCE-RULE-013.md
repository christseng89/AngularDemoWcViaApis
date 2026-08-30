---
knowledge_id: BALANCE-RULE-013
title: "为使 B3/A8 能够正常显示共享的余额信息框/预警，selectedContract 被别名指向 selectedParent"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - balance
  - confirmed
---

# BALANCE-RULE-013 — 为使 B3/A8 能够正常显示共享的余额信息框/预警，selectedContract 被别名指向 selectedParent

## 状态
CONFIRMED

## 业务规则
B3 和 A8 会在选定的父合约下直接新建一个子合约，二者自身并没有第二步的选择器（Step-2 picker）。由于余额信息框/预警模板块是以 `selectedContract`（而非 `selectedParent`）作为条件渲染的，onSelectParent() 会将 `selectedContract = selectedParent` 进行别名绑定并加载其快照——这一处理仅针对这一种场景；否则这两个功能在触发 409 之前完全不会显示任何实时余额反馈。

## 触发条件
isCreatingMovement 且 非 usesTwoFieldSearch 且 非 settlesDocumentArrival 且 非 usesSettleableBalanceIndex 且 selectedParent 已设置。

## 结果
selectedContract 被设置为父合约，并且拉取其快照的唯一目的是驱动共享的余额信息框模板——B3/A8 自身的提交/自然键逻辑仍然继续读取 `selectedParent`，从不读取 `selectedContract`。

## 示例
在此项修复之前，针对一笔已被完全占用的 LC 键入 B3 金额 20000，不会显示任何预警——整个余额信息框模板块根本不会渲染。

## 验证说明
单一来源，直接重新阅读（onSelectParent() 及其确切的 if 条件，第 983-992 行）；与该候选项所陈述的条件与机制逐字一致。未降级。

## 来源证据

实现:
- `src/app/transaction-builder/maker-panel.component.ts:941-992`

测试:
- （未引用直接测试证据）

## 相关知识
- [[Balance Derivation Rules]]
- checksAgainstTightAvailable getter
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
