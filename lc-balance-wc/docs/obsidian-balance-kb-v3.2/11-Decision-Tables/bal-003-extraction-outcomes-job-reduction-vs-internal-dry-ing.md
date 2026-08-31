---
knowledge_id: bal-003-extraction-outcomes-job-reduction-vs-internal-dry-ing
title: "BAL-003 拆分历程——「减少职责数量」与「内部去重（DRY）」的区别"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# BAL-003 拆分历程——「减少职责数量」与「内部去重（DRY）」的区别

| 第几次拆分 | 迁出了什么 | 是否减少了该类所承担的职责种类数？ | 拆分后的组件行数 |
|---|---|---|---|
| 第 1 次 | 通过 finishCheckerAction()/failCheckerAction() 对 Checker 的 release/reject/cancel 链路做去重 | 否——仍是同一职责，只是减少了内部重复 | 2,778 |
| 第 2 次 | submit() 拆分为 validateSubmit()/buildSubmitRequest()/4 个复合方法/submitPlain() | 否 | 2,850 |
| 第 3 次 | 分页选取器的分页状态统一整合进 PagedListState | 否 | 2,888 |
| 第 4 次 | Checker Actions 抽取为 CheckerActionsService（依赖反转） | 是——首次真正意义上的职责减少 | 2,684（A4 重新设计前）／A4 重新设计后回增至 2,923 |
| 第 5 次 | Maker Submit 抽取为 MakerSubmitService（依赖反转） | 是 | 2,684 |
| 第 6 次 | Look Up 面板抽取为 LookUpPanelService（普通类，非 @Component） | 是——第三个也是最后一个「职责过多」候选项被关闭 | 2,438 |
| 第 7 次 | CatalogPickerService——仅负责分页／取数簿记，范围由使用方收窄 | 否（选取处理逻辑仍留在组件内——确实与 Maker 流程深度耦合） | 2,304 |
| 第 8 次 | function-policy.ts/builder-fields.ts/submit-rules.ts 拆分为纯函数 | 部分——迁出了状态推导／字段构建逻辑，并发现了 BAL-135/BAL-136 | 2,024 |
| 第 9 次 | 「Feature Components + Facade」第二次试点——真正的子组件（CheckerPanelComponent、MakerPanelComponent）、eligibility-rule.ts、PickerSelectionService | 是——问题正式关闭；剩余的类只承担一项真正的编排职责 | 436——BAL-003 标记为已修复 |

## 来源证据

- `Quality-report-balance.md:553-1015`

## 相关知识

- Quality/Remediation History Docs
- [[Business-Rule-Index]]
