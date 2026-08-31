---
knowledge_id: computeceilingamount
title: "computeCeilingAmount()"
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

# computeCeilingAmount()

domain/tolerance.ts 中的纯函数，将 Maker 输入的面值级金额换算为实际用于比较可保兑余额（Confirmed Balance）的上限（Ceiling）级数值。函数签名：(amount: string, tolerancePct: string|null|undefined, movementType: string, instrumentType: InstrumentType) => Decimal。先通过 parseMonetaryAmount()（money.ts 共用的线上字符串金额入口函数）解析 amount，再依次通过三段式闸门（先 instrumentType，再 movementType，最后判断 tolerancePct 是否存在）过滤，通过后才乘以容差系数。

## 来源证据

- `src/domain/tolerance.ts:53-68`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
