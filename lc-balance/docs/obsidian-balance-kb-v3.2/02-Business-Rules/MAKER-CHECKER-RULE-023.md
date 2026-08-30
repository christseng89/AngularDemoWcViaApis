---
knowledge_id: MAKER-CHECKER-RULE-023
title: "hasEligibleTargetSelected 根据 Strategy 字段重新推导各功能所需的目标形态，独立于字段值校验"
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

# MAKER-CHECKER-RULE-023 — hasEligibleTargetSelected 根据 Strategy 字段重新推导各功能所需的目标形态，独立于字段值校验

## 状态
CONFIRMED

## 业务规则
A1/B1 无条件豁免（属于全新建立合约，无标的可挑选）。除此之外的每个功能，在其自身特定的目标形态被满足之前都会保持锁定：已挑选 Parent（lcNumberFromParent 形态）；已挑选特定的 PENDING/RELEASED 记录（releasesExistingMovementInPlace 或 settlesDocumentArrival）；已挑选 SG 并解析出快照（documentArrivalWithSg）；快照已解析完成（REDEEM/SETTLE 推导形态）；或已选定通用的 selectedContract（其余所有非建立类功能）。

## 条件
selectedFunction 不为空（non-null）。

## 结果
参见决策表「hasEligibleTargetSelected per Function Shape」——每种 Strategy 形态各自对应一条独立的目标可用性判定条件。

## 示例
A6：未挑选任何内容时为 false，仅挑选 selectedParent 时仍为 false，只有在同时挑选 selectedPayMovement 之后才为 true。

## 验证说明
已由 CLAUDE.md 自身关于此次需求验证轮次的决策日志条目所佐证。已确认。

## 来源证据

实现：
- `src/app/transaction-builder/submit-rules.ts:219-249`

测试：
- `src/app/transaction-builder/submit-rules.spec.ts:652-742`

## 相关知识
- [[Maker Checker Lifecycle]]
- “无可用记录”提交锁定闸门（hasEligibleTargetSelected）
- 需求验证轮次：无可用记录锁定、提交按钮启用条件
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
