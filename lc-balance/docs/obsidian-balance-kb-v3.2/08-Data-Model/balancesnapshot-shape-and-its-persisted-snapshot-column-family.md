---
knowledge_id: balancesnapshot-shape-and-its-persisted-snapshot-column-family
title: "BalanceSnapshot 的结构及其持久化快照列族"
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

# BalanceSnapshot 的结构及其持久化快照列族

BalanceSnapshot（字段包括 balanceContractId、logicalContractId、currency、confirmedBalance、availableBalance、pendingEarmarkTotal、offBalanceExposure、tightAvailableBalance、presentDocsEarmarkPending/Approved、asOf）会被原样捕获并持久化（以 JSON 字符串形式）到 7 个不同的流水列中（event_snapshot、root_event_snapshot、acceptance_event_snapshot、sg_event_snapshot、finalize_event_snapshot、finalize_acceptance_event_snapshot、finalize_sg_event_snapshot），而不是在每次查询读取时重新计算——types.ts 中每一列各自的文档注释都详细说明了具体是哪些流水类型/时机会写入该列，以及原因（关于这背后的业务历史，可参见 CLAUDE.md 中"Event Snapshot must reflect true current status"相关的决策日志条目）。

## 来源证据

- `microservices/balance-component/src/db/schema.ts:189-233`
- `microservices/balance-component/src/types.ts:230-347`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
