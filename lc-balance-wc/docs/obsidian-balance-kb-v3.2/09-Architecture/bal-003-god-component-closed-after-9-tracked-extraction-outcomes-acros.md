---
knowledge_id: bal-003-god-component-closed-after-9-tracked-extraction-outcomes-acros
title: "BAL-003 God Component——历经 9 次可追踪的抽取重构成果后结案，净变更约 2,500 行"
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

# BAL-003 God Component——历经 9 次可追踪的抽取重构成果后结案，净变更约 2,500 行

这是本报告持续时间最长的一项发现（最早在报告的第一个版本中就已记录），追踪 transaction-builder.component.ts 从峰值 2,923 行，经由九次不同的抽取成果，逐步降至 436 行：对 Checker release/reject/cancel 链路做 DRY 化处理、拆分 submit()、统一分页选择器状态（PagedListState）、通过依赖反转抽取出 CheckerActionsService、抽取出 MakerSubmitService、以纯类形式抽取出 LookUpPanelService、抽取出 CatalogPickerService，以及最后一次“功能组件 + Facade”试点，产出了真正的 Angular 子组件（CheckerPanelComponent、MakerPanelComponent）。第十次、也是较晚的一次成果（InquireEventsComponent/BalanceSnapshotBoxComponent）并不是 BAL-003 的重新开启，而是一次独立的后续工作，其副作用还顺带修复了一个与之无关的 anyComponentStyle 生产构建预算超标问题。

## 证据来源

- `Quality-report-balance.md:553-1015`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
