---
knowledge_id: contractstatusbadgeclass-contractstatuslabel-contractstatus-to-badge
title: "contractStatusBadgeClass() / contractStatusLabel()——ContractStatus 到徽章样式的映射"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# contractStatusBadgeClass() / contractStatusLabel()——ContractStatus 到徽章样式的映射

| ContractStatus | closingPending | 徽章样式类 | 显示标签 |
|---|---|---|---|
| ACTIVE | false／省略 | tb-status-badge--approved | ACTIVE |
| ACTIVE | true | tb-status-badge--negative | CLOSING |
| CLOSED | true 或 false | tb-status-badge--negative | CLOSED |
| CANCELLED | true 或 false | tb-status-badge--negative | CANCELLED |
| SUPERSEDED | true 或 false | tb-status-badge--neutral | SUPERSEDED |
| 无法识别的值 | 不适用 | tb-status-badge--neutral | （原样保留，即原始字符串） |

## 来源证据

- `balance-component.model.ts:650-663`
- `balance-component.model.spec.ts:858-895`

## 相关知识

- Angular Domain Model (balance-component.model.ts)
- [[Business-Rule-Index]]
