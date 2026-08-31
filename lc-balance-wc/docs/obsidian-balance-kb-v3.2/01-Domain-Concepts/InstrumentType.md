---
knowledge_id: InstrumentType
title: "InstrumentType"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
  - classification
---

# InstrumentType

每一个 [[BalanceContract]] 都恰好带有一个 `InstrumentType`，取自一组固定的枚举值。这是 Balance Component 中最重要的单一分类字段——它决定了适用哪一条 [[Tolerance Processing|宽容度]] 规则、适用哪一条 [[Off-Balance-Sheet Exposure|风险暴露]] 规则、针对该工具哪些异动类型是合法的（见 [[Maker Checker Lifecycle]]），以及哪一个 UI 业务功能（A1–A9/B1–B5/A10/B6）可以对其操作。

## 枚举值（已对照原始码确认）

- **`IPLC_LC`** —— 进口信用证（开证行一侧）
- **`EPLC_LC`** —— 出口信用证（通知/议付行一侧）
- **`IPLC_ACCEPTANCE`** —— 进口承兑（远期）
- **`EPLC_ACCEPTANCE`** —— 出口承兑（远期）
- **`SHGT`** —— 装运保函（Shipping Guarantee）
- **`EPLC_CONFIRMATION`** —— 出口保兑（Export Confirmation）
- **`EPLC_EXAMINATION`** —— 押单待核对预扣（Present-Docs earmark），精神上属于 `ExposureNature: MEMO_ONLY`（仅作法律事件标记；见 [[Off-Balance-Sheet Exposure]]）
- **`EPLC_DUE_FROM_ISSUING_BANK`**、**`EPLC_ACCEPTANCE_REIMB_RECEIVABLE`**、**`EPLC_EXPORT_BILLS_DISCOUNTED`** —— 一笔保兑（Confirmation）在兑付/承兑（Honour/Accept）时转换而成的资产侧对应项（仅由程式自动建立，从不由 Maker 直接选取）

## 进口侧 vs. 出口侧

`IPLC_*`/`EPLC_*` 前缀惯例（进口/出口）被一致地使用：进口侧功能属于 A 系列（A1–A9、A10 Close），出口侧则属于 B 系列（B1–B5、B6 Close）。作为 child 的 SHGT/承兑/Examination 合约，其「侧别」继承自其 parent root。

## Root-issue-released 防护

针对一个 root 合约（或一个全新的 child 合约）、且其自身的 ISSUE 异动尚未 `RELEASED` 时，任何非 ISSUE 的异动都会被拒绝（409，`assertRootIssueReleased()`）——藉此堵住一个漏洞：若不加此防护，一笔仍处 PENDING 状态的 ISSUE 可能让后续针对它放行的异动，使 Confirmed Balance 变为负数。同样的适格性过滤也应用于选择器层（`CatalogFilter.requireIssueReleased`），但在仅供查询的场景以及 B4 自身的押单（Present Docs）搜索中被刻意排除。

## Related knowledge

- [[BalanceContract]]
- [[BalanceMovement]]
- [[Off-Balance-Sheet Exposure]]
- [[Tolerance Processing]]
- [[Maker Checker Lifecycle]]
- [[Business-Rule-Index]]
