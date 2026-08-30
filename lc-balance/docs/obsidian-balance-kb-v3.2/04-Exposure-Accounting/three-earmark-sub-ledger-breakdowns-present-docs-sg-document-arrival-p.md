---
knowledge_id: three-earmark-sub-ledger-breakdowns-present-docs-sg-document-arrival-p
title: "三种圈存/子账拆分——单据提示、SG、单据到达（Pending/Approved）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，参见 [[Source-to-Knowledge-Map|来源知识对照表]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 三种圈存/子账拆分——单据提示、SG、单据到达（Pending/Approved）

单据提示圈存（Pending/Approved）是仅存在于 EPLC_CONFIRMATION 上、真正持久化的 API 字段（presentDocsEarmarkPending/Approved）。而 SG（Pending/Approved）与单据到达（Pending/Approved）根本不是真实的 API 字段——它们是本文档自行对真正的 offBalanceExposure 与 pendingEarmarkTotal/confirmedBalance 字段所做的派生拆解，依动作状态切分，采用完全相同的底层公式。它们存在的唯一目的，是回答"该合计数字中，有多少来自某一笔特定的 SG 或单据到达，且目前是仍处于 Pending 还是已经 Approved"——这正是事件时间轴上 EARMARKING/EARMARKED 标签，针对某一笔具体动作所回答的同一个问题。

## Source Evidence

- `Balance-Figures-Calculation-Logic.txt lines 209-263 (§2 The Three Earmark / Sub-Ledger Breakdowns)`
- `Balance-Figures-Calculation-Logic.txt lines 25-43 (banner: 'Real API fields vs. derived breakdowns')`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
