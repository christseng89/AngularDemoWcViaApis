---
knowledge_id: a10-b6-close-write-off-and-contract-retirement
title: "A10/B6 Close — 冲销与合约终止"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# A10/B6 Close — 冲销与合约终止

CLOSE（仅限 IPLC_LC/EPLC_LC/EPLC_CONFIRMATION）会将剩余的 Confirmed Balance 全数冲销，并在获准（Approved）后，把该逻辑合约（Logical Contract）终止为 ContractStatus.CLOSED（此状态自最初设计以来即已保留，但先前从未真正可达）。方向系数为 −1（与其他任何递减型异动的形状相同）。金额在 Submit 时必须精确等于当下的 Confirmed Balance（可以为零，但绝不可为负），且从不由 Maker 手动输入——而是从 Confirmed Balance 自动带入并锁定。资格条件（尚未 Closed；SG／Acceptance 的 Confirmed Balance 为零；整棵事件树中不存在任何未结的 Event，包括一笔已 RELEASED 但尚未被消耗的 B3 提示单据）会在 Submit 与 Approve 两个时点都进行检查，因为在两者之间该条件是有可能不再成立的。

## 来源证据

- `Balance-Figures-Calculation-Logic.txt lines 1260-1306 (B6's own section)`
- `Balance-Figures-Calculation-Logic.txt lines 128-141 (banner: A10/B6 Close added)`
- `Balance-Figures-Calculation-Logic.txt lines 925-974 (A10's own section)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
