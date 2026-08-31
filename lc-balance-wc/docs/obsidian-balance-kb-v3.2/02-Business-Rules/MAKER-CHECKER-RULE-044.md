---
knowledge_id: MAKER-CHECKER-RULE-044
title: "checkerAct() 操作分派决策表——依功能形态与当前状态，将同一个复核人操作按钮路由至 4 种不同行为"
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

# MAKER-CHECKER-RULE-044 — checkerAct() 操作分派决策表——依功能形态与当前状态，将同一个复核人操作按钮路由至 4 种不同行为

## 状态
CONFIRMED

## 业务规则
复核队列中同一个操作按钮，会依所选 movement 自身的 FunctionStrategy 形态与当前状态，路由至四种截然不同的实际行为之一：一般的放行/拒绝（默认行为）；针对 deferSettlement 类功能的 acknowledgeArrival()（从不改变 status）；以及针对 settlesDocumentArrival/documentArrivalWithSg/SETTLE 形态的复合放行路径（委派给 checker-actions.service.ts 处理）。

## 条件
参见决策表「checkerAct() dispatch」（元件层级）。

## 结果
参见决策表「checkerAct() dispatch」。

## 示例
在一笔普通的 A3 到单（deferSettlement，movementType 匹配 deferSettlementMovementType）上点击「放行」，会调用 acknowledgeArrival() 而非真正的放行——该 movement 的 status 不会改变，只会写入 acknowledgedBy/acknowledgedAt。

## 验证说明
未引用直接测试。此元件层级的分派逻辑，由 CLAUDE.md 自身对 checkerAct() 的大量决策日志内容佐证（A6/A3S/B4/B5 同会话缺陷修正条目直接引用了这个方法自身的守卫逻辑）。鉴于文档佐证力度充分且有直接的源码位置引用，维持 CONFIRMED，不过若能补上测试引用会更有说服力。

## 来源证据

实现：
- `src/app/transaction-builder/transaction-builder.component.ts:419-468`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- 复合式复核人放行/拒绝路由
- 复核人 release() 依复合提交形态，分派至四条分腿放行链其中之一（服务层级，属于不同层次）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
