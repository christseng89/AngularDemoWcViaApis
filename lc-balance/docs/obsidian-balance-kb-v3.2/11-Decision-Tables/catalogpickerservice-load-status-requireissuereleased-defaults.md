---
knowledge_id: catalogpickerservice-load-status-requireissuereleased-defaults
title: "CatalogPickerService.load() 的 status/requireIssueReleased 默认值"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# CatalogPickerService.load() 的 status/requireIssueReleased 默认值

| 参数 | 调用方省略该参数时 | 调用方显式传值时 |
|---|---|---|
| status | 默认为 'ACTIVE' | null → 不做状态过滤（传给 api.catalog() 的是 undefined）；任意字符串 → 原样使用 |
| requireIssueReleased | 默认为 true | 完全按传入值使用（对于非 Maker 操作／仅查询的调用方通常传 false） |

## 来源证据

- `catalog-picker.service.ts:97-114`

## 相关知识

- Angular Pickers, Eligibility Hints, Orchestrating Shell
- [[Business-Rule-Index]]
