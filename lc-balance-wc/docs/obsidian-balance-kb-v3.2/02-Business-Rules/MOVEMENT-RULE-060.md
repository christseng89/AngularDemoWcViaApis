---
knowledge_id: MOVEMENT-RULE-060
title: "B4 Usance 承兑是一个横跨 Folio 4 与 Folio 5 的复合「释放+建立」操作，与 A6 相同的『一次释放完成两件事』模式相符"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-060 — B4 Usance 承兑是一个横跨 Folio 4 与 Folio 5 的复合「释放+建立」操作，与 A6 相同的『一次释放完成两件事』模式相符

## 状态
CONFIRMED

## 业务规则
B4 的 Usance 分支（ACCEPT）会在同一次 Checker Release 中，同时释放 Folio 4 的保兑或有负债账户对，并建立 Folio 5 的影子备忘录承兑账户对。

## 触发条件
Function = B4，且 tenorType ≠ SIGHT（即 ACCEPT 分支）

## 结果
单次 B4 ACCEPT 的 Checker Release 事件，会同时生成 Folio-4 的释放分录与 Folio-5 的建立分录

## 示例
对一笔 Usance 已确认信用证执行 B4 ACCEPT，两笔分录会一并过账

## 验证说明
本轮已直接阅读了准确的 Implementation Notes 段落，并直接核实了 businessCases.js 中对应的实际释放序列（第 1953-1963 行）——设计文档的描述与实际业务用例数据一致。

## 来源证据

实现:
- `analysis/contingent-liability-ledger.html — Implementation Notes, 'Usance Accept is the same compound action as Folio 5's own Create row' paragraph`

测试:
- `backend/data/businessCases.js:1953-1963 (export-case-9's own accept/acceptance/reimbReceivable release sequence and snapshots, directly verified in this pass)`

## 相关知识
- [[BalanceMovement]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
