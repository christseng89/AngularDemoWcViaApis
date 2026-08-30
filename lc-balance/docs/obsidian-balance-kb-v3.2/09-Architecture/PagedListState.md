---
knowledge_id: pagedliststate
title: "PagedListState"
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

# PagedListState

一个极小的有状态类（page、total、pageSize），只负责一个分页选择器的页码/总数边界运算——totalPages = ceil(total/pageSize)，下限为 1，prevTarget()/nextTarget() 返回目标页码，若已到边界则返回 null。刻意不做任何自身的数据获取——由调用方决定何时、如何重新加载。引入此类是为了取代此前三份近乎相同的重复记账逻辑（Catalog LC Index、Parent LC picker、IB/SG Index）。

## 证据来源

- `paged-list-state.ts:1-33`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
