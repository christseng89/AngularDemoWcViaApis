---
knowledge_id: MAKER-CHECKER-RULE-037
title: "跨合约合并时间轴按真实的事件日期/时间（eventTime）排序，从不使用 eventSeq"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-037 — 跨合约合并时间轴按真实的事件日期/时间（eventTime）排序，从不使用 eventSeq

## 状态
CONFIRMED

## 业务规则
loadEvents()（InquireEventsService）与 loadSnapshotAndMovements()（LookUpPanelService）都会将合并后的跨合约 InquiredEvent[] 按 new Date(a.eventTime).getTime() 排序，明确不使用 eventSeq——因为 eventSeq 只在单一合约内部才有意义，若用它来排序来自多个合约的合并列表，会造成错误的交错顺序。

## 条件
任何跨合约合并的时间轴（根合约 + 子合约，或 LC + B3 EPLC_EXAMINATION 合并）。

## 结果
一律按时间顺序（createdAt/releasedAt）跨合约排序，从不按 eventSeq 排序。

## 示例
A1（LC 的 eventSeq 为 1）发生于 11:30:08，A3-create（LC 的 eventSeq 为 2）发生于 11:30:35，A8（SG 的 eventSeq 为 1）发生于 11:31:01，A4-finalize（同一笔 LC movement，releasedAt）发生于 15:37:08——完全依这些时间戳排序。

## 验证说明
来源单一且明确，并有匹配的测试引用。已确认。

## 来源证据

实现：
- `src/app/transaction-builder/inquire-events.service.ts:350`
- `src/app/transaction-builder/look-up-panel.service.ts:288,307`

测试：
- `src/app/transaction-builder/inquire-events.service.spec.ts:142-197`

## 相关知识
- [[Maker Checker Lifecycle]]
- movementsOf$() / childMovementsOf$() ——合并时间轴的建构
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
