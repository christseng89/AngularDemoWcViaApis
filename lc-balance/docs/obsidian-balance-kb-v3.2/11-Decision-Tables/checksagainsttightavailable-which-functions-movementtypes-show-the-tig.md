---
knowledge_id: checksagainsttightavailable-which-functions-movementtypes-show-the-tig
title: "checksAgainstTightAvailable——哪些功能／movementType 会实时显示紧口径可用余额警告"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# checksAgainstTightAvailable——哪些功能／movementType 会实时显示紧口径可用余额警告

| movementType | isAmendDecreaseDirection | selectedContract.instrumentType | hasParent | 结果 |
|---|---|---|---|---|
| UTILIZE | - | - | - | true |
| HONOUR | - | - | - | true |
| ACCEPT | - | - | - | true |
| 任意值（含 AMEND） | true | - | - | true |
| CREATE | false | EPLC_CONFIRMATION（B3，带别名） | - | true |
| ISSUE | false | - | true（A8，带别名） | true |
| 其他任意情况 | false | 非 EPLC_CONFIRMATION | false | false |

## 来源证据

- `maker-panel.component.ts:358-386`

## 相关知识

- Angular Maker Panel + Submit Orchestration
- [[Business-Rule-Index]]
