---
knowledge_id: 4-eyes-maker-checker-principle-applied-to-document-arrival-earmark-the
title: "适用于 Document Arrival 先预留（earmark）后终结（finalize）生命周期的 4-eyes Maker/Checker 原则"
domain: Balance
category: Domain Concept
status: INFERRED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 适用于 Document Arrival 先预留后终结生命周期的 4-eyes Maker/Checker 原则

EARMARKING → EARMARKED →（由另一个独立功能最终完成）这一状态演进，针对同一个底层 UTILIZE 事件，强制实施跨越两组 Maker/Checker 的真正职责分离：A3/A3S 自身的 Maker+Checker 只负责预留（earmark）该笔交易（Checker 的 acknowledge 是一个真实的、已持久化的 4-eyes 动作，但从不释放该笔 movement）；而 A4/A6 自身、独立于前者且时间上更晚的 Maker+Checker 组合，才真正完成终结/释放（release）。一笔候选交易必须同时通过这两组各自的 4-eyes 关卡，才算真正可用——这体现了贸易金融的标准控制惯例：单证提示审核与付款/终结审批被刻意设计为两条互相独立的审批链。

## Source Evidence

- `CLAUDE.md decision log entries on A4/A6 EARMARKED requirement and A3/A3S acknowledgment restoration`
- `checker-panel.component.ts:232-264 (doc comment cites the business instructions directly)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
