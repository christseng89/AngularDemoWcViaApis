---
knowledge_id: MAKER-CHECKER-RULE-027
title: "提交就绪闸门——同时要求已挑选可用标的、字段校验通过，以及一律适用的金额大于 0"
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

# MAKER-CHECKER-RULE-027 — 提交就绪闸门——同时要求已挑选可用标的、字段校验通过，以及一律适用的金额大于 0

## 状态
CONFIRMED

## 业务规则
isSubmitReady 要求同时满足：真正可用的目标记录已被挑选（hasEligibleTargetSelected，依功能形态而定），并且 validateSubmitRules() 返回无错误（该函数本身即在其他规则之外，强制执行一条一律适用的金额大于 0 校验）。requiresEligibleTarget = 已设定 selectedFunction 且 NOT（isCreatingMovement 且 NOT hasParent）——也就是说，除了全新的顶层建立（不含 Parent 的 A1/B1/A8/B3 类型 CREATE）以外，每个功能都要求先挑选一笔既有的可用记录。

## 条件
不限——适用于每个功能自身的提交按钮。

## 结果
isSubmitReady = hasEligibleTargetSelected && validateSubmitRules(...).error === null。

## 示例
A2-A9/B2-B5 在真正可用的目标记录被挑选之前，会锁定自身的提交按钮与输入字段；包含 A1/B1 在内的所有功能，都额外要求金额大于 0。

## 验证说明
已由 CLAUDE.md 自身关于此次需求验证轮次的决策日志条目所佐证。虽未针对 maker-panel.component.ts 本身给出直接测试引用，但来源位置与文档佐证相互一致；维持 CONFIRMED。

## 来源证据

实现：
- `src/app/transaction-builder/maker-panel.component.ts:1090-1119`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- [[MakerPanelComponent]]
- 需求验证轮次：无可用记录锁定、提交按钮启用条件
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
