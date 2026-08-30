---
knowledge_id: strategy-pattern-in-name-only-the-14-function-registry-s-flag-bag-desi
title: "徒有其名的策略模式——14 功能注册表的“标志位口袋”设计（F-01）"
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

# 徒有其名的策略模式——14 功能注册表的“标志位口袋”设计（F-01）

一次独立的 OOD/SOLID 审查（desiger-comments.md）发现，TransactionFunction 携带了 11 个布尔标志位（payExistingUtilize、settlesDocumentArrival、deferSettlement、autoRedeemType 等），这些标志位在 HTTP 边界两侧的 5 个文件、共 54 处地方被各自独立地重新解读——真正的策略模式应当把行为放在策略对象本身，而这套设计却让每一个消费方都要从标志位的读取结果中重新拼凑出行为。该问题被认定为不止一个已经排查过的 bug 的可追溯根因（A4 与 tenor-type 交互问题、B3 与 B4 动账关联的 bug）。CLAUDE.md 自身的决策日志记录了此问题后续通过 function-strategy.ts（FunctionStrategy 接口 + FUNCTION_STRATEGIES）得到了处理，分 5 个 PR 完成（特征化测试、策略投影、A 系列/B 系列迁移、标志位移除）。

## Source Evidence

- `CLAUDE.md F-01 decision-log entry`
- `desiger-comments.md:66-79`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
