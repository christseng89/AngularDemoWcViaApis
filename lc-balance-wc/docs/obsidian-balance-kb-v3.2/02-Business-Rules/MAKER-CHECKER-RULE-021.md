---
knowledge_id: MAKER-CHECKER-RULE-021
title: "A6/B4 必须转换一笔具体的、仍处 PENDING 状态（对 B4 而言，则是已 RELEASED）的来源记录——绝不能是一笔无所依附的全新 Acceptance/Honour"
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

# MAKER-CHECKER-RULE-021 — A6/B4 必须转换一笔具体的、仍处 PENDING 状态（对 B4 而言，则是已 RELEASED）的来源记录——绝不能是一笔无所依附的全新 Acceptance/Honour

## 状态
CONFIRMED

## 业务规则
任何具有 checkerRelease.settlesDocumentArrival 的功能，在 Submit 之前都必须先挑选一笔 selectedPayMovement——错误讯息会引用该功能自身的 pendingItemLabel（未设置时默认为 'Document Arrival'）。

## 适用条件
strategy.checkerRelease.settlesDocumentArrival === true。

## 结果
!selectedPayMovement -> 失败（"请先挑选仍处 PENDING 状态的 {pendingItemLabel}（2ndary Index）以进行转换。"）

## 示例
A6 在 selectedPayMovement=null 时 -> "请先挑选仍处 PENDING 状态的 Document Arrival（2ndary Index）以进行转换。"

## 核实说明
来源单一，测试引用直接对应。已确认。

## 来源证据

实现代码：
- `src/app/transaction-builder/submit-rules.ts:107-110`

测试：
- `src/app/transaction-builder/submit-rules.spec.ts:236-269`

## 相关知识
- [[Maker Checker Lifecycle]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
