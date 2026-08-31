---
knowledge_id: MAKER-CHECKER-RULE-051
title: "单笔非复合movement的Submit与Approved时序模式（设计文档）——Confirmed／Available／Tight的非对称时序"
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

# MAKER-CHECKER-RULE-051 — 单笔非复合 movement 的 Submit 与 Approved 时序模式（设计文档）——Confirmed／Available／Tight 的非对称时序

## 状态
CONFIRMED

## 业务规则
Confirmed Balance 在 Submit 时不受影响，直到 Approval 才整笔变动。Available Balance 在 Submit 时整笔变动，Approval 时总额保持不变（只是其内部构成发生迁移）。Pending Earmark Total 在 Submit 时变动，在 Approval 时回冲。Tight Available Balance：增额（increase-shaped）movement 在 Submit 时不可见，仅在 Approval 时才提升 Tight；减额（decrease-shaped）movement 则在 Submit 时（通过 Pending Decrease Total）立即降低 Tight，并在 Approval 之前一直维持在这个已降低的数值。

## 条件
单一合约、单一行、无关联子腿（linked legs）。

## 结果
这是设计文档 §6/§7 中每一张按功能划分的表格所遵循的主模式。

## 示例
所审阅的来源证据中未提供具体数值示例。

## 验证说明
CLAUDE.md 自身关于 Tight Available Balance 的 Confirmed Balance 推导方式、以及"增加从严，占用从宽"原则的专门决策日志条目，与该模式自身增／减非对称的特点完全吻合，形成强有力的相互印证。这是一条源自设计文档的规则，但 CLAUDE.md 独立确认它确实已被实现（computePendingDecreaseTotal()，统一应用于全部三项充足性检查）——正是凭借这一独立的代码层印证，才将其保留为 CONFIRMED，而不仅仅是基于设计文档本身。

## 来源证据

实现：
- `analysis/Balance-Figures-Calculation-Logic.txt:348-397`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- Submit/Approve 非对称时序——增加从严，占用从宽
- Tight Available Balance 现在由 Confirmed Balance 推导，而非由 Available Balance 推导
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
