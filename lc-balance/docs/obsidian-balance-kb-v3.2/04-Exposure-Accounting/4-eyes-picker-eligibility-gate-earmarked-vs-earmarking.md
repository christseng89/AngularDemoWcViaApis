---
knowledge_id: 4-eyes-picker-eligibility-gate-earmarked-vs-earmarking
title: "4-Eyes 选择器资格闸门 — EARMARKED 与 EARMARKING 的区分"
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

# 4-Eyes 选择器资格闸门 — EARMARKED 与 EARMARKING 的区分

A4/A6 自身的选择器（无论是 LC 层级的 Step-1 清单，还是具体记录层级的 Step-2 清单）都要求候选 UTILIZE 必须已处于 EARMARKED 状态（即已由 A3/A3S 自身的 Checker 设置 acknowledgedAt）——仍处于 EARMARKING 状态者（Maker 已 Submit 但尚未被确认）在该处完全不可选取，从而堵上一个真正的 4-eyes（双人复核）缺口。A4 自身的 Checker Search 与此呼应，只显示 EARMARKED 的候选项，并排除 A4 自己已经以 Maker 身份 Submit 过的项目（即已设置 makerSubmittedAt 者）；A3/A3S 自身的 Checker Search 则恰好相反——排除已处于 EARMARKED 状态的项目，因为对其自身 Checker 而言，该项目已经没有可处理的事了。

## 来源证据

- `Balance-Figures-Calculation-Logic.txt lines 422-438 (§5 general-pattern banner: 'Genuine 4-eyes gate added the same day')`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
