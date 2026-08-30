---
knowledge_id: snapshot-on-write-for-inquire-events
title: "Inquire 事件的写入时快照（Snapshot-on-write）"
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

# Inquire 事件的写入时快照（Snapshot-on-write）

event_snapshot / root_event_snapshot / acceptance_event_snapshot / sg_event_snapshot 这些 JSON 字段，会在 createMovement()/release() 执行的当下，立即捕捉相关合约的完整余额快照并持久化，而不是等到读取时才重新计算。这使得 Inquire 事件能够呈现“当时那一刻所看到的余额”，不会受到之后交易的影响而失真。之所以另外存在一组平行的 finalize_* 字段家族，是专门为了让 A4（Sight Settlement，最终结清 A3 既有的 UTILIZE）能够冻结 A3 自身原本的快照，而不会被 A4 的 Release 覆盖掉。

## 来源证据

- `Balance-Component-DB-Design.txt §2.5 (lines 106-117), §4.2.5 (lines 382-409)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
