---
knowledge_id: MOVEMENT-RULE-061
title: "修改减少（Amendment Decrease）在 Maker 提交时即刻过账 —— 未实现受益人同意关卡（相对 UCP 600 第 10 条已记录的差距）"
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

# MOVEMENT-RULE-061 — 修改减少（Amendment Decrease）在 Maker 提交时即刻过账 —— 未实现受益人同意关卡（相对 UCP 600 第 10 条已记录的差距）

## 状态
CONFIRMED

## 业务规则
源规格要求修改减少（Amendment Decrease）须以受益人同意为前提条件（UCP 600 第 10(a)/(c) 条）——在同意被记录之前不应发生任何余额变动。而 Balance Component 自身的 AMEND_DECREASE 变动记录（以及 B2 带负数增减额的 AMEND）却是在 Maker 提交时即刻过账，完全没有同意流程关卡；账户对本身并不受这一缺口影响。本轮已独立核实：CreateMovementRequest 以及本轮所阅读的 AMEND_DECREASE/AMEND 代码路径中，任何地方都不存在同意/审批记录字段。

## 触发条件
Function = A2 AMEND_DECREASE，或 B2 AMEND（负数增减额）

## 结果
Folio 1/Folio 4 的释放分录（在经过正常 Maker/Checker 释放流程后）会直接过账，而不记录任何受益人同意步骤

## 示例
一笔 A2 修改减少的 Maker 提交，会按正常的 PENDING→RELEASED 生命周期推进，整个流程中不存在任何同意记录字段或关卡

## 验证说明
本轮已直接阅读了准确的 Implementation Notes 段落原文。交叉核实：amendDecrease.ts/balanceService.ts（本轮均已完整阅读）均不包含任何形式的同意/审批字段，印证了该缺口的说法。

## 来源证据

实现:
- `analysis/contingent-liability-ledger.html — Implementation Notes, 'Amendment Decrease is gated on beneficiary consent' paragraph`

测试:
- （未引用直接测试证据）

## 相关知识
- [[BalanceMovement]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
