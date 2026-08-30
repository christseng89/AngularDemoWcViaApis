---
knowledge_id: EXPOSURE-RULE-025
title: "B5 Settlement 无论是持有至到期还是提前贴现，都反转完全相同的影子配对"
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

# EXPOSURE-RULE-025 — B5 Settlement 无论是持有至到期还是提前贴现，都反转完全相同的影子配对

## 状态
CONFIRMED

## 业务规则
源规格书为持有至到期结算与到期前贴现分别给出了独立的算例（§7.6 Step 2a 对 Step 2b），因为两者的表内处理方式不同（一笔已贴现的债权是重分类，而非现金结清）。Balance Component 的 B5 并不区分这两者——两者都映射到 FULL_SETTLE/PARTIAL_SETTLE——但所展示的或有范畴内反转（Folio 5 Release）在两种情形下都是相同且正确的，因为两者的差异完全落在不在范畴内的表内处理部分。

## 条件
Function = B5，任一结算方式。

## 结果
无论是持有至到期还是提前贴现，每一笔 B5 结算都过账相同的 Folio-5 影子备忘反转。

## 示例
一笔 B5 FULL_SETTLE 会将 Confirmed Acceptances & DPU — Outstanding (memo) 反转为 Customers' Liability (memo)，无论该笔债权是提前贴现还是持有至到期。

## 验证说明
已直接对照 ledger.html 源文件 grep 核实——Notes 第 13 项文字确认与候选的转述高度吻合。单一来源、仅限文档，本轮采样中未找到代码/测试佐证，但引用具体且为直接引述，因此无需从 CONFIRMED 下调。

## 原始码证据

实现：
- `analysis/contingent-liability-ledger.html Folio 5 release 行, Notes 第 13 项（grep 核实，第 672 行：「Held-to-maturity and pre-maturity discounting reverse the identical shadow-memo pair」）`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
