---
knowledge_id: MAKER-CHECKER-RULE-007
title: "POST /balance-movements 请求验证：6 个恒必填栏位（zod schema），其余栏位放行不做验证"
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

# MAKER-CHECKER-RULE-007 — POST /balance-movements 请求验证：6 个恒必填栏位（zod schema），其余栏位放行不做验证

## 状态
CONFIRMED

## 业务规则
createMovementRequestSchema 要求 instrumentType、movementType、eventSeq（数字，0 也是合法值）、amount、currency、createdBy 这 6 个栏位必须存在且非空；实际请求结构中的其余所有栏位都放行不做验证（.passthrough()）——这是蓄意地与它所取代的先前手写检查（BAL-116）保持相同范畴，而非扩大或缩小验证范围。

## 适用条件
POST /balance-movements 的请求体依 createMovementRequestSchema 解析。

## 结果
缺少这 6 个必填栏位中的任何一个，或 eventSeq 非数字，都会验证失败；一个格式错误的 amount 只会被报告一次（模式检查会在数值精度检查执行之前就先行短路）；eventSeq:0 会被当作真实数值接受，不会被误判为缺失或视同 falsy。

## 示例
eventSeq:0 会被接受；amount:'abc' 只会被报告一次，作为一次模式违规，绝不会连同数值精度违规一起重复报告。

## 核实说明
来源清晰单一（schema 档案加上对应的单元测试），并有 CLAUDE.md 自身关于 BAL-116 的决策日志条目佐证（"手写的请求验证已改为 zod schema，使用 .passthrough() 以避免剥除可选栏位"）。已确认。

## 来源证据

实现代码：
- `microservices/balance-component/src/validation/requestSchema.ts:21-47`

测试：
- `microservices/balance-component/test/unit/validation/requestSchema.test.ts:17-89`

## 相关知识
- [[Maker Checker Lifecycle]]
- requestSchema.ts — POST /balance-movements 的 zod schema
- BAL-116
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
