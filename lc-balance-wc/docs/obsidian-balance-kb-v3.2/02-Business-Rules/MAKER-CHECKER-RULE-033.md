---
knowledge_id: MAKER-CHECKER-RULE-033
title: "reject() 与 deleteMakerPending() 在解析目标 movementId 时，优先采用 selectedCheckerMovement 而非 submitResult"
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

# MAKER-CHECKER-RULE-033 — reject() 与 deleteMakerPending() 在解析目标 movementId 时，优先采用 selectedCheckerMovement 而非 submitResult

## 状态
CONFIRMED

## 业务规则
reject() 与 deleteMakerPending() 的主要目标，都会将目标 movementId 解析为 ctx.selectedCheckerMovement?.movementId ?? ctx.submitResult?.movementId——真实的服务器数据（真正独立的复核人搜索结果）优先于当前会话自身的经办人提交内存，与 release() 自身的优先顺序一致。

## 条件
ctx.selectedCheckerMovement 是否已设定。

## 结果
若 selectedCheckerMovement.movementId 存在，即使同一 ctx 中也存在过期/不匹配的 submitResult，也会优先使用前者。

## 示例
ctx 中 submitResult.movementId='stale-mv'，而 selectedCheckerMovement.movementId='fresh-mv' -> reject() 会调用 api.reject('fresh-mv', ...)。

## 验证说明
已直接重新阅读第 151-159 行，确认 movementId 解析顺序与所声称的完全一致。已确认。

## 来源证据

实现：
- `src/app/transaction-builder/checker-actions.service.ts:151-159`

测试：
- `src/app/transaction-builder/checker-actions.service.spec.ts:409-437`

## 相关知识
- [[Maker Checker Lifecycle]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
