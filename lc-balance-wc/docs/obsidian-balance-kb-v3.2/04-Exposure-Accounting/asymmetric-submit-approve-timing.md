---
knowledge_id: asymmetric-submit-approve-timing
title: "Submit/Approve 时机非对称 — 增加從嚴，占用從寬"
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

# Submit/Approve 时机非对称 — 增加從嚴，占用從寬

这是一条在每一个具有 PENDING 与 RELEASED 双重维度的指标上都一致适用的统御原则：可用额度的增加会被晚计、严格地计入（唯有真正获准 Approved 之后才计入——"增加從嚴"），而占用／减少则会被早计、宽松地计入（自 Submit 那一刻起即计入——"占用從寬"）。这体现在：Tight Available Balance 对于增加型异动只在 Approval 时才上升，但对于减少型异动则在 Submit 当下就立即下降；一笔独立的 SG 赎回（A9）在真正 Release 之前不会释放 Off-Balance Exposure 额度；以及 B4 对所引用的 B3 提示单据所做的临时净额处理仅止于显示层面，绝不会放宽 B3 自身或 B2-Decrease 自身的严格充分性检查。唯一刻意存在的例外，是与一笔仍处于 PENDING 状态的 UTILIZE 共享同一个 businessEventId 的赎回（即 A3S 匹配的复合配对）——这被当作单一的重分类事件处理，而非独立的增加事件，因为这两条分支永远会一起被释放，或一起被回滚。

## 来源证据

- `Balance-Figures-Calculation-Logic.txt lines 348-441 (§5 Submit vs. Approved — the General Pattern)`
- `Balance-Figures-Calculation-Logic.txt lines 45-141 (banner notes: Formula change 2026-08-20, Off-Balance Exposure basis, Present Docs Earmark basis)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
