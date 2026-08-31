---
knowledge_id: MOVEMENT-RULE-014
title: "tenorFamily 目录筛选——未记录 tenorType 的历史遗留合同，在 SIGHT 与 USANCE 两种查询中都会被始终纳入"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-014 — tenorFamily 目录筛选——未记录 tenorType 的历史遗留合同，在 SIGHT 与 USANCE 两种查询中都会被始终纳入

## Status
CONFIRMED

## Business Rule
listCatalog({tenorFamily}) 在服务端进行筛选（而非在分页之后于客户端筛选），因此 page/total 反映的是真正符合条件的集合；SIGHT 匹配 tenor_type='SIGHT' OR tenor_type IS NULL，USANCE 匹配 tenor_type != 'SIGHT' OR tenor_type IS NULL——早于 tenorType 追踪机制存在的历史遗留合同，不会被任一分支排除（并且会同时出现在两个族群下）。

## Conditions
filter.tenorFamily 为 'SIGHT' 或 'USANCE'

## Result
返回结果的某一页会真实反映调用者所需 tenor 族群下符合条件的合同，修复了此前服务端分页原始数据行可能把想要的 tenor 埋在后面页码的缺陷

## Example
U002/U003（Usance tenor）此前落在第 2 页、排在以 Sight 为主的第 1 页之后；服务端筛选修复了这一问题

## Verification Note
已直接阅读具体的 SQL 子句构造；与声明内容完全一致，包括两个分支上都带有的 OR-NULL 子句。

## Source Evidence

实现:
- `microservices/balance-component/src/store/balanceContractStore.ts:83-93,253-258`

测试:
- `microservices/balance-component/test/unit/db/schema.test.ts:179-222`

## Related Knowledge
- [[BalanceMovement]]
- CatalogFilter——分页、子串/精确匹配、tenor 族群，以及 issue-released 资格筛选
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
