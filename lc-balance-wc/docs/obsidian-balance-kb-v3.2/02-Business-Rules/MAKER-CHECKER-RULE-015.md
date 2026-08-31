---
knowledge_id: MAKER-CHECKER-RULE-015
title: "Checker 放行路由依功能形态而异：原地终结（A4）对比放行前状态不同的复合式来源结算（A6 vs B4）对比延后处理（A3/A3S）"
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

# MAKER-CHECKER-RULE-015 — Checker 放行路由依功能形态而异：原地终结（A4）对比放行前状态不同的复合式来源结算（A6 vs B4）对比延后处理（A3/A3S）

## 状态
CONFIRMED

## 业务规则
A4 是原地终结一笔既有的 movement（不会自己新建任何 movement，releasesExistingMovementInPlace=true）。A6/B4 都是在一次复合式放行中结算一笔来源 Document-Arrival/Present-Docs 记录（settlesDocumentArrival=true），但两者在该来源记录于挑选时是否已经放行这一点上有所不同：A6 的来源（一笔普通的 Document Arrival）此时仍处于 PENDING，会作为放行的第一段一并被放行（sourceAlreadyReleasedBeforePick=false）；B4 的来源（B3 的 Present Docs）在挑选时已独立完成放行，因为 B3 已经过重新设计，会真正独立完成放行，因此 B4 自身的放行会跳过对它的重复放行（sourceAlreadyReleasedBeforePick=true）。A3/A3S 的 Checker 步骤则从不调用真正的 release()（deferSettlement=true）——仅是一项确认（acknowledge-only）操作。

## 适用条件
selectedFunction.code 属于 {A4, A6, B4, A3, A3S}。

## 结果
每个功能代码恰好对应一种 CheckerReleaseStrategy 形态，彼此互斥。

## 示例
A6 会先放行 Document Arrival 这一段，再放行新建的 Acceptance；B4 只放行主段（Honour/Accept，加上资产相关段），因为 B3 自身的记录已经是 RELEASED 状态。

## 核实说明
CLAUDE.md 自身关于 B3 重新设计的决策日志条目独立佐证了为何 B4 的来源在挑选时已是 RELEASED（B3 现在会真正放行），而 A6 的 Document Arrival 来源此时仍是 PENDING。已确认。

## 来源证据

实现代码：
- `src/app/transaction-builder/function-strategy.ts:42-52,118-149`

测试：
- `src/app/transaction-builder/function-strategy.spec.ts:74-93`

## 相关知识
- [[Maker Checker Lifecycle]]
- Maker/Checker Earmark 与 Release 的分离（deferSettlement）
- B3 已重新设计为真正 RELEASE——取代原先仅 acknowledge() 的设计
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
