---
knowledge_id: MAKER-CHECKER-RULE-042
title: "B4 的跨合约候选项必须已真正放行（当 Strategy 要求时），且尚未被到单流程消耗"
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

# MAKER-CHECKER-RULE-042 — B4 的跨合约候选项必须已真正放行（当 Strategy 要求时），且尚未被到单流程消耗

## 状态
CONFIRMED

## 业务规则
B4 自身的应付类 movement 搜索，在结构上与 A4/A6 不同：它浏览的是同一 LC 编号下某个子 instrumentType（例如 EPLC_EXAMINATION）自身的合约，而不是当前合约本身；并且只要 checkerRelease.sourceAlreadyReleasedBeforePick 有设定，就要求候选项自身的建立 movement 必须已经是 RELEASED（因为 B3 本来就会自行真正放行），而不只是 PENDING——此外该候选项也不能已被更早的一笔 B4 消耗过。

## 条件
movementType === 目标 movementType，且 status ===（若 sourceAlreadyReleasedBeforePick 为真则为 'RELEASED'，否则为 'PENDING'），并且 presentDocsConsumedAt 为 null。

## 结果
候选项被纳入 B4 的 payableMovements / catalogChildPayableIbs 提示映射中。

## 示例
一笔已 RELEASED 且尚未被另一笔 B4 消耗的 B3 EPLC_EXAMINATION CREATE，会显示为可供承兑/付款挑选的候选项；一笔仍为 PENDING、或已被消耗的，则不会。

## 验证说明
已由 CLAUDE.md 自身关于 B4 挑选器这项结构上不同判定条件的决策日志条目佐证（“B4's own criterion is structurally different: a child EPLC_EXAMINATION's CREATE must be RELEASED and not yet presentDocsConsumedAt”）。未引用直接测试；凭借源码匹配加上文档佐证，维持 CONFIRMED。

## 来源证据

实现：
- `src/app/transaction-builder/picker-selection.service.ts:355-410`
- `src/app/transaction-builder/document-arrival-hints.service.ts:90-129`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
