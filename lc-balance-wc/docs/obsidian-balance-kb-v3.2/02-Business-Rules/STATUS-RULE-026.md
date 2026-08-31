---
knowledge_id: STATUS-RULE-026
title: "AccountEntriesDialogComponent 的状态显示会透传自身的 `phase` 输入，因此『finalize』记录行绝不会被误标为 EARMARKED"
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

# STATUS-RULE-026 — AccountEntriesDialogComponent 的状态显示会透传自身的 `phase` 输入，因此『finalize』记录行绝不会被误标为 EARMARKED

## 状态
CONFIRMED

## 业务规则
displayStatus()/statusBadgeClass() 会将 this.phase 透传给以 isEarmarkFunction() 为基础的共享分类器，而不是在本地重新推导状态显示，因此该对话框与『事件状态显示映射』规则保持一致，并能正确地将『finalize』阶段的记录行排除在显示为 EARMARKED 之外。

## 条件
phase='finalize' 与 'create'/'primary' 的对比

## 结果
『finalize』记录行显示为 PENDING/APPROVED，绝不会是 EARMARKING/EARMARKED。

## 示例
即期 UTILIZE 的『finalize』凭证在被释放（released）后显示为 APPROVED，而不是 EARMARKED。

## 验证说明
直接阅读了该组件——displayStatus()/statusBadgeClass() 方法将 this.phase 透传给共享规则函数，与声明完全一致。仅凭代码证据即判定为 CONFIRMED；虽未引用专门的测试代码行，但源码中的委托逻辑是明确无歧义的。

## 来源证据

实现：
- `src/app/transaction-builder/account-entries-dialog.component.ts:43,50-57`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Close Eligibility]]
- AccountEntriesDialogComponent
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
