---
knowledge_id: MOVEMENT-RULE-036
title: "选取器自身目录的客户端分页，必须运行在已满足条件/已过滤的集合上，而不是原始的服务端抓取结果上"
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

# MOVEMENT-RULE-036 — 选取器自身目录的客户端分页，必须运行在已满足条件/已过滤的集合上，而不是原始的服务端抓取结果上

## Status
CONFIRMED

## Business Rule
每一个 Primary/2ndary Key Index 都只对调用方自身真正满足条件的记录（即经过业务规则过滤之后的记录，例如排除 0 余额）进行分页——CatalogPickerService 会获取一个有上限的批次，并通过调用方自身的 qualifies() 回调重新计算总数，该回调会被调用两次：一次是仅针对合约本身立即调用，另一次是在快照加载完成之后再次调用。

## Conditions
不适用 — 这是一种架构惯例，而非运行时条件

## Result
选取器自身显示的『共 N 条，第 X/Y 页』始终反映真正符合条件的数量，而不是未经过滤的服务端响应大小

## Example
原始 catalog() 调用返回了 12 笔 ACTIVE 的 LC，但只有 4 笔通过了调用方自身的 0 余额排除过滤器——选取器展示的是『共 4 条』，而不是『共 12 条』

## Verification Note
直接阅读了确切的 load() 函数；与声明完全一致，包括两次调用 qualifies() 重新计算的模式。

## Source Evidence

Implementation:
- `src/app/transaction-builder/catalog-picker.service.ts:89-128`

Tests:
- （未引用直接测试证据）

## Related Knowledge
- [[BalanceMovement]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
