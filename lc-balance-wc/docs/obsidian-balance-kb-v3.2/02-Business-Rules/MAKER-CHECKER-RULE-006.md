---
knowledge_id: MAKER-CHECKER-RULE-006
title: "requireIssueReleased 目录过滤——Maker 操作类选取器会排除其自身建立 movement 尚未通过 Checker 核准的自然键"
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

# MAKER-CHECKER-RULE-006 — requireIssueReleased 目录过滤——Maker 操作类选取器会排除其自身建立 movement 尚未通过 Checker 核准的自然键

## 状态
CONFIRMED

## 业务规则
listCatalog({requireIssueReleased:true}) 会加上一个 EXISTS 子查询，要求该合约至少存在一笔类型为 ISSUE 或 CREATE 且状态为 RELEASED 的 movement，因此，一份自身的创设性 movement 尚未通过 Checker 核准的合约，无法被选为进一步操作的对象。CatalogPickerService.load()（Angular 端）对每一个 Maker 操作类选取器（平铺目录 Catalog、Parent LC、IB/SG Index）都默认将此旗标设为 true；而仅供查询用途的场景（Look Up Current Balance、Inquire Events）以及 B4 自身的 Present Docs 查找，则刻意省略或覆写此旗标，因为它们本来就合理地需要看到尚未放行的候选项。

## 适用条件
CatalogFilter.requireIssueReleased===true（服务端为选择性启用；客户端针对 Maker 操作类选取器默认为 true）。

## 结果
一份仍处 PENDING 状态 ISSUE/CREATE 的合约，会被排除在所有 Maker 操作类选取器之外，直到其经 Checker 放行为止；仅供查询用途的调用方仍可正常解析到该合约。

## 示例
S10 自身的 ISSUE 仍处 PENDING 状态——在其 ISSUE 被 RELEASED 之前，S10 不得出现在 A4 的选取器中。

## 核实说明
将 DB 层的候选项，与紧密相关的 Angular CatalogPickerService 默认为 true 的候选项合并为一条（同一套 requireIssueReleased 机制的两个层面），因为两者从头到尾描述的是同一个端到端机制。两者均未提供直接测试引用，但 CLAUDE.md 自身关于 assertRootIssueReleased()/CatalogFilter.requireIssueReleased 的决策日志条目给予了佐证。凭借源码位置的直接比对加上文件佐证，维持 CONFIRMED。

## 来源证据

实现代码：
- `microservices/balance-component/src/store/balanceContractStore.ts:98-112,259-264`
- `src/app/transaction-builder/catalog-picker.service.ts:89-128`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- CatalogFilter — 分页、子字串/精确匹配、tenor 家族，以及 issue-released 适格性过滤
- assertRootIssueReleased()（服务端，作为选取器层过滤的后盾）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
