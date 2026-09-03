---
knowledge_id: EXPOSURE-RULE-012
title: "View Voucher 对话框对每笔异动只显示单一、不可变的 Dr/Cr 配对——从不重新计算"
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

# EXPOSURE-RULE-012 — View Voucher 对话框对每笔异动只显示单一、不可变的 Dr/Cr 配对——从不重新计算

## 状态
CONFIRMED

## 业务规则
AccountEntriesDialogComponent 精确渲染该异动自身已持久化的 contingentAccountEntry（drAccount/crAccount/currency/amount），呈现为一行 Dr 与一行 Cr（币种与金额相同——是一笔平衡的单一币种或有分录，而非多腿式总账过账）。若 contingentAccountEntry 为 null，对话框会显示「No voucher entries recorded for this event.」。模板自身的提示文字说明这些记录是历史性的，从不重新计算。

## 条件
movement.contingentAccountEntry 存在与否。

## 结果
显示 Dr/Cr 表格，或显示「no voucher entries」提示。

## 示例
B3（EPLC_EXAMINATION）事件的凭证对话框会显示内部 memo Dr/Cr 表格；Maker Submit 后与 Checker Review 均读取同一份已持久化的 `contingentAccountEntry`。由于 `accountEntries=null`，该显示不代表已外送 Accounting。

## 验证说明
2026-09-03 已按现行源码与 HTTP 回归测试重新验证：EPLC_EXAMINATION/CREATE 的 `contingentAccountEntry` 在 PENDING 与 RELEASED response 中均存在；Angular Account Entries dialog 直接读取该持久化字段。`accountEntries` 仍为 null。

## 原始码证据

实现：
- `src/app/transaction-builder/account-entries-dialog.component.html:17-50`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- AccountEntriesDialogComponent（「View Voucher」）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
