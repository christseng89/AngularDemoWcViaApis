---
knowledge_id: commitment-control-philosophy-available-tight-available-basis-over-sta
title: "Commitment-control philosophy: Available/Tight-Available basis over static Confirmed Balance"
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

# Commitment-control philosophy: Available/Tight-Available basis over static Confirmed Balance

这是一项跨模块的设计原则，在 shgtRedeem.ts 与 amendDecrease.ts 中一致体现（并可推及其他地方的 checkUtilizeSufficiency）：凡是用来把关一笔呈减少型态或占用额度型态异动的充足性检查，始终会将该记录上其他仍处 PENDING 状态的异动一并扣抵（即以 Available/Tight Available 为基准），而绝不会仅以静态、仅计入 RELEASED 状态的 Confirmed Balance 数字为基准。这项设计专门用来防止两笔并发的 PENDING 交易各自独立地通过针对同一笔尚未预留额度的检查——若两者日后都被核准，将导致总承诺金额超出真实额度。

## Source Evidence

- `microservices/balance-component/src/domain/amendDecrease.ts lines 16-24`
- `microservices/balance-component/src/domain/shgtRedeem.ts lines 16-24`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
