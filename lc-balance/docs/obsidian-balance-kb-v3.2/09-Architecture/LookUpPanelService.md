---
knowledge_id: lookuppanelservice
title: "LookUpPanelService"
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

# LookUpPanelService

普通的 @Injectable() 类（并非 @Component——受限于项目“不使用 TestBed”的测试惯例），状态按组件实例各自持有。负责“Look Up Current Balance”只读面板：搜索条件、最多 3 个标签页（LC、Acceptance、SG），每个标签页都拥有自己的快照 + InquiredEvent[] 时间线（通过与 InquireEventsService 相同的 movementsOf$/toEventRows()/childMovementsOf$ 构建），以及 syncFrom()/runLookup() 编排逻辑。对于 Export Confirmed LC，LC 标签页还会额外合并来自其各自 EB-Number 子合约的 EPLC_EXAMINATION（B3）事件，因为 B3 并没有属于自己的专属 Balance Tab（不同于 Import LC 的 SG/Acceptance 子项）。

## 证据来源

- `look-up-panel.service.ts:200-230 runLookup()`
- `look-up-panel.service.ts:9-32 class doc comment`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
