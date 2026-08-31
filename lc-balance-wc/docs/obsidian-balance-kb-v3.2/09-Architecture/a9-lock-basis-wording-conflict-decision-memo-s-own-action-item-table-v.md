---
knowledge_id: a9-lock-basis-wording-conflict-decision-memo-s-own-action-item-table-v
title: "A9 锁定基础表述 CONFLICT——决策备忘录自身行动项表格 vs. 实际交付行为"
domain: Balance
category: Domain Concept
status: CONFLICT
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# A9 锁定基础表述 CONFLICT——决策备忘录自身行动项表格 vs. 实际交付行为

Balance-Component-Business-Rule-Decisions-2026-08-21.md 自身的行动项表格（第 1 项）原文写的是 amountAutoFilledFrom: 'confirmedBalance'，用于 A9 锁定的 Amount 字段，与 A10/B6 自身的核销机制保持一致。同一天，在实现过程中，通过一个具体的实测案例发现这是错误的（SG 已开立 10,000 → A3S 已赎回 2,000，仍为 PENDING → A9 必须赎回剩余的 8,000，而不是 10,000，因为 Confirmed Balance 尚未反映该笔 PENDING 中的预留）。该文档本身依照其自身“时间点记录”的惯例，在文档顶部添加了同日的更正说明，而不是就地修改原文；行动项表格自身的该行也被更新为反映“availableBalance”这一经更正、实际实现的基础字段。A10/B6 正确地使用 confirmedBalance，是因为 closeEligibility.ts 已经保证在 Close 时不存在其他 PENDING 的同级 movement——A9 则没有等价的保证（一笔配对的 A3S 赎回完全可能仍处于 PENDING 状态）。

## 证据来源

- `Balance-Component-Business-Rule-Decisions-2026-08-21.md:4,31,81`
- `Balance-Component-Handoff-Note-2026-08-21.md:22,28`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
