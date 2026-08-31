---
knowledge_id: MAKER-CHECKER-RULE-043
title: "经办人操作类挑选器默认要求自然键自身的 ISSUE/CREATE 已经复核放行（requireIssueReleased 的客户端默认值）"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-043 — 经办人操作类挑选器默认要求自然键自身的 ISSUE/CREATE 已经复核放行（requireIssueReleased 的客户端默认值）

## 状态
CONFIRMED

## 业务规则
CatalogPickerService.load() 对每一个经办人操作类挑选器（一般目录、Parent LC、IB/SG 索引），都会将 requireIssueReleased 默认为 true，因此一笔自身建立 movement 尚未通过复核人核准的合约，永远不会被提供出来。对于非经办人操作类的调用方（例如唯读的查询浏览），该值可被覆盖（设为 false 或省略）。

## 条件
args.requireIssueReleased 省略时 -> 默认为 true；明确设为 false 或其他值时 -> 采用该值。

## 结果
除非调用方主动选择跳过，否则服务器端的 catalog() 调用范围会限定为仅包含已复核放行（Issue-Released）的合约。

## 示例
一笔刚经办人提交、尚未放行的 LC，永远不会出现在 A2-A9 自身的 LC 挑选器中，但会出现在一次传入 requireIssueReleased: false 的纯查询浏览中。

## 验证说明
这与已合并进「requireIssueReleased 目录筛选」这条规则（服务器端与客户端两部分）中的默认为真客户端行为，本质上是同一件事。此处之所以仍单独保留，只是因为它是作为一条独立候选证据被提交的——应视为已被涵盖，而非独立的额外证据。

## 来源证据

实现：
- `src/app/transaction-builder/catalog-picker.service.ts:89-128`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
