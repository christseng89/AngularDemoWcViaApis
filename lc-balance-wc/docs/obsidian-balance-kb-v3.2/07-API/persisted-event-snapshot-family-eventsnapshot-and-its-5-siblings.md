---
knowledge_id: persisted-event-snapshot-family-eventsnapshot-and-its-5-siblings
title: "持久化 Event Snapshot 家族（eventSnapshot 及其 5 个兄弟字段）"
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

# 持久化 Event Snapshot 家族（eventSnapshot 及其 5 个兄弟字段）

BalanceMovement 携带 6 个在交易发生时即被持久化捕获、而非在查看时重新计算的 BalanceSnapshot 字段：eventSnapshot（本 Movement 自身所属合约的余额，先是 PENDING，之后会被 RELEASED 覆写）、rootEventSnapshot（父级 LC/Confirmation 的余额，仅限子账簿的 Movement）、acceptanceEventSnapshot/sgEventSnapshot（唯一那笔兄弟 Acceptance/SG 合约自身的当前余额，仅当恰好存在一笔时才有值）、以及 finalizeEventSnapshot/finalizeAcceptanceEventSnapshot/finalizeSgEventSnapshot（放行时刻的数值，专用于唯一的特殊场景——Sight 期限的 IPLC_LC UTILIZE finalize——此时 eventSnapshot 本身必须冻结在其创建时的原始值上，而不能被覆写）。

## Source Evidence

- `balance-component-api.yaml lines 1484-1553 (schema field descriptions)`
- `balance-component-api.yaml lines 292-355 (v1.6.0-v1.10.0 changelog)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
