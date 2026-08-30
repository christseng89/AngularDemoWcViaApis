---
knowledge_id: MAKER-CHECKER-RULE-035
title: "deleteMakerPending() 在任何撤销动作之前，都要求 createdBy 已知（BAL-132 的运行期防护，而非非空断言）"
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

# MAKER-CHECKER-RULE-035 — deleteMakerPending() 在任何撤销动作之前，都要求 createdBy 已知（BAL-132 的运行期防护，而非非空断言）

## 状态
CONFIRMED

## 业务规则
deleteMakerPending() 会先检查 ctx.createdBy，若其为 null/undefined，会直接返回一个干净的 'failed' 结果，而不调用任何 API——这是一道运行期防护，而不是非空断言，因为按设计 submit() 理应在任何可撤销的经办人提交存在之前，就已经填入 createdBy。

## 条件
ctx.createdBy 为 null 或 undefined。

## 结果
立即返回 'failed' 结果，api.cancel 从不被调用。

## 示例
即使存在一个有效的 submitResult.movementId，只要 ctx.createdBy=null，仍会干净地失败，证明这道防护是被真正检查的，而不是被想当然地假设成立。

## 验证说明
已由 CLAUDE.md 自身的 BAL-132 决策日志条目所佐证（“a ctx.createdBy! assertion replaced with a runtime guard”）。已确认。

## 来源证据

实现：
- `src/app/transaction-builder/checker-actions.service.ts:166-170`

测试：
- `src/app/transaction-builder/checker-actions.service.spec.ts:439-464`

## 相关知识
- [[Maker Checker Lifecycle]]
- deleteMakerPending()（经办人撤销）按建立顺序反向撤销关联分腿
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
