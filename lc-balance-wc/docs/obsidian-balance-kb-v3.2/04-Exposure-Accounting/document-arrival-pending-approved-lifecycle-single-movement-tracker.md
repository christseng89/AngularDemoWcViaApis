---
knowledge_id: document-arrival-pending-approved-lifecycle-single-movement-tracker
title: "Document Arrival Pending/Approved 生命周期 — 单笔异动追踪"
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

# Document Arrival Pending/Approved 生命周期 — 单笔异动追踪

单笔 UTILIZE 异动自身的 Pending 金额，只有在 A4/A6 真正将其最终敲定（真正的 Release）之后，才会完全转移为 Approved——绝不会发生在 A3/A3S 自身的 Submit 时刻，也不会发生在 A3 自身 Checker 的"Approve"动作（仅为确认性质，状态仍维持 PENDING）。这两个数字都不能跨异动相加，也不能与任何其他指标相加——每一个都只描述某一笔特定异动自身的生命周期状态，而非累计总额。这是 Present Docs Earmark 在出口侧对应机制的进口侧类比。

## 来源证据

- `Balance-Figures-Calculation-Logic.txt lines 245-263 (Figures #10/#11 and the note that neither is additive)`
- `Balance-Figures-Calculation-Logic.txt lines 403-420 (§5 general-pattern banner on Document Arrival timing)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
