---
knowledge_id: STATUS-RULE-022
title: "状态信息透过图标而非仅靠颜色传达（无障碍设计）——statusBadgeIcon() 完全由徽章的 CSS 类名派生"
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

# STATUS-RULE-022 — 状态信息透过图标而非仅靠颜色传达（无障碍设计）——statusBadgeIcon() 完全由徽章的 CSS 类名派生

## 状态
CONFIRMED

## 业务规则
每一个状态徽章除了颜色之外，都带有一个独立的图标。该图标是由 statusBadgeClass() 自身输出的字符串确定性派生而来，从而保证图标与徽章颜色永远不会出现不一致。

## 条件
传入 statusBadgeIcon() 的 badgeClass 参数

## 结果
'--approved'/'--earmark' → 'ok'；'--pending' → 'pending'；'--negative' → 'cross'；其余情况 → 'dash'。

## 示例
statusBadgeIcon(statusBadgeClass('RELEASED','IPLC_LC','CLOSE')) === 'cross'，与 functionActionIcon('A10') === 'cross' 一致。

## 验证说明
直接阅读了 statusBadgeIcon()——4 个分支的映射完全吻合。未降级。

## 来源证据

实现：
- `src/app/transaction-builder/balance-component.model.ts:590-596`

测试：
- `src/app/transaction-builder/balance-component.model.spec.ts:840-856`

## 相关知识
- [[Close Eligibility]]
- [[statusbadgeclass|statusBadgeClass()]]
- [[functionactionicon|functionActionIcon()]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
