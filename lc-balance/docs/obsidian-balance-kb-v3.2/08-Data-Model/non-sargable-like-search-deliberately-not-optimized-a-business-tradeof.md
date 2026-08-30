---
knowledge_id: non-sargable-like-search-deliberately-not-optimized-a-business-tradeof
title: "非可优化（non-sargable）的 LIKE 搜索刻意不做优化——这是业务取舍，不是技术缺口"
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

# 非可优化（non-sargable）的 LIKE 搜索刻意不做优化——这是业务取舍，不是技术缺口

listCatalog() 中 lc_number LIKE '%q%' 这类查询无法使用任何 B-tree 索引，在 instrument_type 过滤之后会退化为全表扫描。评审明确拒绝把它改成前缀匹配（LIKE @q||'%'），原因是 Maker/Checker 用户经常是以 LC Number 的中间片段或后缀进行搜索，若把搜索范围收窄为仅支持前缀匹配，会实质性地削减现有的搜索能力——这被定性为一项用户搜索行为层面的决策，而不是可以单方面为了性能就擅自更动的事。如果日后这真的成为性能瓶颈，建议的路径是 FTS5（可以保留子字符串搜索能力），而不是改为前缀匹配。

## 来源证据

- `Balance-Component-DB-Optimization-Analysis.txt P2 LIKE row (lines 125-127), §4 item 2 rationale (lines 218-221)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
