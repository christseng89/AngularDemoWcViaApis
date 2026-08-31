---
knowledge_id: functionactionicon
title: "functionActionIcon()"
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

# functionActionIcon()

纯函数，通过 4 个显式的 ReadonlySet 查找，将每个业务功能代码（A1-A10/B1-B6）归入 5 类操作类型图标分组之一（issue/amend/utilize/redeem/cross），并为前 4 个集合都未涵盖的任何代码（A7/A9/B5，以及任何无法识别的代码，如防御性测试输入 'NOPE'）提供隐含的 'redeem' 兜底分组。

## 来源证据

- `balance-component.model.spec.ts:781-809`
- `balance-component.model.ts:562-588`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
