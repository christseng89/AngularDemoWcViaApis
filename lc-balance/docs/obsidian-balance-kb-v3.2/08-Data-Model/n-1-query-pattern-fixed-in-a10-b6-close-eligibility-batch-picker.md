---
knowledge_id: n-1-query-pattern-fixed-in-a10-b6-close-eligibility-batch-picker
title: "N+1 查询问题已在 A10/B6 Close 资格批量筛选器中修复"
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

# N+1 查询问题已在 A10/B6 Close 资格批量筛选器中修复

A10/B6 Close 第一步的筛选器原本会先取出最多 200 笔 ACTIVE 候选合约，再对每一笔候选逐一调用 evaluateContractCloseEligibility()（该函数本身每次又要发出 3-4 条查询）——最坏情况下每次运行约需 1+200x4≈800 条查询。修复方式是新增批量存取方法（listByContractIds、listShgtMovementsForParents、listAcceptanceMovementsForParents、listExaminationMovementsForParents），各自用一条 IN 子句查询就取出所有候选合约的子事件，并让 evaluateContractCloseEligibility() 接受一个可选的 preFetched 参数。这样无论候选数量多少，查询次数都能固定在约 5 条左右；createMovement()/release() 内部那些不传入 preFetched 的单笔复核路径，则刻意维持在原本的逐笔查询路径上，不受影响。

## 来源证据

- `Balance-Component-DB-Design.txt §4.2.7 (lines 459-464)`
- `Balance-Component-DB-Optimization-Analysis.txt P2 N+1 row (lines 154-163), §3 table row (lines 178-180)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
