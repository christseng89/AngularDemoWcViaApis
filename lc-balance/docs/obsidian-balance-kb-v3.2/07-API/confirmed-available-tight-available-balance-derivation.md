---
knowledge_id: confirmed-available-tight-available-balance-derivation
title: "Confirmed / Available / Tight Available Balance 的推导逻辑"
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

# Confirmed / Available / Tight Available Balance 的推导逻辑

Confirmed Balance = 在 ceiling 层级上所有已 RELEASED movement 的加总。Available Balance = Confirmed Balance 加减目前处于 PENDING 状态的 earmark 净额。Tight Available Balance（v1.13.0 至今的公式）= confirmedBalance 减去 Pending Decrease Total（该合约上仍处于 PENDING 状态、方向为减少的 movement 自身的 ceilingAmount）再减去 offBalanceExposure（进口，Import）或 presentDocsEarmarkPending 与 presentDocsEarmarkApproved 之和（出口，Export）。一笔仍处于 PENDING 状态的增加，在真正被放行（Released）之前，对 Tight Available 是不可见的（"增加从严"）；而一笔仍处于 PENDING 状态的减少，则在 Submit 时就立即占用额度（"占用从宽"）。这就是该服务中每一个硬性的 409 充足性检查所依据的门槛值。

## Source Evidence

- `balance-component-api.yaml lines 1662-1688 (tightAvailableBalance field description)`
- `balance-component-api.yaml lines 672-681 (balance endpoint description)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
