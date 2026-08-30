---
knowledge_id: MAKER-CHECKER-RULE-052
title: "A4/A6 选择器（picker）要求真正的 EARMARKED 状态，而不仅仅是 EARMARKING（设计文档对代码层规则的复述）"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-052 — A4/A6 选择器要求真正的 EARMARKED 状态，而不仅仅是 EARMARKING（设计文档对代码层规则的复述）

## 状态
CONFIRMED

## 业务规则
A4/A6 自身的 Step-1 与 Step-2 选择器列表，要求候选的 UTILIZE 必须已经设置 acknowledgedAt（即已处于 EARMARKED 状态）——一笔已由 Maker 提交但尚未被 Checker 确认（即仍处于 EARMARKING 状态）的记录，在这些选择器中根本不可选。此外，A4 自身的选择器还会排除它自己已经 Maker-Submit 过的那笔 UTILIZE（即 makerSubmittedAt 已设置的记录）。

## 条件
function 属于 {A4, A6}，选择器资格检查。

## 结果
确保单据到单（Document Arrival）在最终定案或转换为 Acceptance 之前，经过真正的四眼（4-eyes）复核；防止针对同一笔正在定案中的 movement 出现重复的 Maker Submit。

## 示例
所审阅的来源证据中未提供具体数值示例。

## 验证说明
已完全被上文合并后的代码层规则"A4/A6 应付 movement 资格要求真正的四眼……"所涵盖（同一论断，本条只是设计文档自身对该论断的复述，已并入该规则的证据集）。仅为可追溯到这一特定文档引用而保留本条目——并非独立增量证据。

## 来源证据

实现：
- `analysis/Balance-Figures-Calculation-Logic.txt:422-438`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- 四眼（4-Eyes）选择器资格关卡——EARMARKED 与 EARMARKING 之分
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
