---
knowledge_id: MAKER-CHECKER-RULE-026
title: "主分腿调用失败时永不写入 submitResult（F-08 修正）——借此保持 formLocked 的正确性"
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

# MAKER-CHECKER-RULE-026 — 主分腿调用失败时永不写入 submitResult（F-08 修正）——借此保持 formLocked 的正确性

## 状态
CONFIRMED

## 业务规则
只有当调用方自身主要（第一）分腿（涵盖全部 5 种提交形态）成功时，才允许后续 outcome 写入 `result`。主分腿本身的每一条失败路径，都会使 `result` 完全维持缺失/未定义状态；只有当次要（secondary）或第三层（tertiary）分腿自身失败时，才会将已成功的主分腿回应带入并写作 `result`。MakerPanelComponent.formLocked 读取的是 `!!this.submitResult`，因此正是这一区分，防止了提交失败时被误当作提交成功而锁定表单。

## 条件
需判断复合式（或单纯的单一）提交中，究竟是哪一条分腿失败。

## 结果
主分腿调用失败 -> result 缺失。次要/第三层分腿失败 -> result = 已成功的主分腿回应。

## 示例
B4 Usance：Accept 成功（accept-3），负债 CREATE 成功（liability-3），应收款 CREATE 失败 -> outcome.result.movementId 仍为 'accept-3'（并非缺失），且 secondary.acceptanceMovementId 仍为 'liability-3'。

## 验证说明
已由 CLAUDE.md 自身描述这一精确的 F-08 缺陷与修正方式的决策日志条目逐字佐证。已确认。

## 来源证据

实现：
- `src/app/transaction-builder/maker-submit.service.ts:9-23,51-60`

测试：
- `src/app/transaction-builder/maker-submit.service.spec.ts:413-433,477-492,494-512,530-543`

## 相关知识
- [[Maker Checker Lifecycle]]
- MakerSubmitOutcome 判别式联合类型（discriminated union）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
