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
B3（EPLC_EXAMINATION）事件的凭证对话框永远只显示提示文字，从不显示 Dr/Cr 表格，因为 B3 从不产生 contingentAccountEntry（与上文合并的「EPLC_EXAMINATION 从不产生 contingentAccountEntry」规则一致）。

## 验证说明
本轮未独立重新通读（Angular 模板文件，不在本次采样的微服务领域代码范围内）——依据原始候选引用的单一、明确的证据，且与已独立验证的服务端 EPLC_EXAMINATION contingentAccountEntry 为 null 的行为直接一致（而非矛盾），保留为 CONFIRMED。原始候选未引用任何测试证据，鉴于本项目对该类 UI 行为并无 TestBed 惯例（模板行为通过实际操作验证，而非 Jest），这符合预期。

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
