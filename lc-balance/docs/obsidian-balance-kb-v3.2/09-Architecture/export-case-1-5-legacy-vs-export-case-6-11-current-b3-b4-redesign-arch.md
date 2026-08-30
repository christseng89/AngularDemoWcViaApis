---
knowledge_id: export-case-1-5-legacy-vs-export-case-6-11-current-b3-b4-redesign-arch
title: "出口案例 #1-#5（旧版）与出口案例 #6-#11（当前 B3/B4 重设计版）的架构分野"
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

# 出口案例 #1-#5（旧版）与出口案例 #6-#11（当前 B3/B4 重设计版）的架构分野

出口案例 #1-#5 将“Present Docs（交单）”建模为直接创建 Confirmation 自身的 HONOUR/ACCEPT 动账，中间没有独立的备忘挂账（earmark）步骤——这是在 B3（备忘挂账）/B4（统一法律事件）重设计之前的模式。依据明确的“只增不改（ADD, not replace）”指示，这些案例被刻意保持原样（自成一体、内部逻辑一致），而不是被重写；案例 #6 及之后的案例则是从真实的 S01/U01 数据库运行记录转录而来，用以验证当前架构。两个案例族在注册表中永久共存，是文档中记录在案、有意保留差异的示例。

## Source Evidence

- `backend/data/businessCases.js:1759-1770`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
