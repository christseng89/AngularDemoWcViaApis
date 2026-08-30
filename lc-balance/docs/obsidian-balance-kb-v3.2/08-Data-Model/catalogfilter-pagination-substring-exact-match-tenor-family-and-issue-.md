---
knowledge_id: catalogfilter-pagination-substring-exact-match-tenor-family-and-issue-
title: "CatalogFilter ——分页、子字符串/精确匹配、期限族群与“已放单”资格过滤"
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

# CatalogFilter ——分页、子字符串/精确匹配、期限族群与“已放单”资格过滤

listCatalog() 根据 CatalogFilter 动态构建 WHERE 子句：instrumentType（必填）、status（可选，省略则表示所有状态）、q（对 lc_number 做大小写不敏感的子字符串匹配，用于输入联想 typeahead）、lcNumber（精确匹配，用于 LC->IB/SG Index 级联选择器——刻意不采用子字符串匹配，以避免“001”同时匹配到“2001”）、tenorFamily（SIGHT 分支包含 tenor_type 为 NULL 的记录；USANCE 分支同样包含 NULL——v0.9 之前遗留的、未记录 tenorType 的旧合约不会被任一分支排除）、以及 requireIssueReleased（一个 EXISTS 子查询，要求该合约存在一笔 RELEASED 状态的 ISSUE/CREATE 流水——这是可选启用项，供 Maker-ACTION 选择器使用，但不用于仅查询场景或 B4 自身的 Present Docs 搜索）。分页始终在服务端对已过滤的结果集执行（page 默认为 1，pageSize 默认为 10），total 反映的是过滤后的计数，而不是原始表的总行数。

## 来源证据

- `microservices/balance-component/src/store/balanceContractStore.ts:67-279`
- `microservices/balance-component/test/unit/db/schema.test.ts:91-222`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
