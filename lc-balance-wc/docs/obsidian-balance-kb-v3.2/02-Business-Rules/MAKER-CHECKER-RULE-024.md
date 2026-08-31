---
knowledge_id: MAKER-CHECKER-RULE-024
title: "A1 期限天数 Sight/Usance 正规化兜底机制在提交阶段仅限于代码 'A1' —— B1 并无对应的提交时兜底机制"
domain: Balance
category: Business Rule
status: CONFLICT
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - conflict
---

# MAKER-CHECKER-RULE-024 — A1 期限天数 Sight/Usance 正规化兜底机制在提交阶段仅限于代码 'A1' —— B1 并无对应的提交时兜底机制

## 状态
CONFLICT

## 业务规则
buildFields() 中即时生效的 Formly 表达式，会将「Sight 强制归零 / Usance 要求大于 0」的规则同时套用在 A1 与 B1 两者上（判断条件为 `selectedFunction?.code === 'A1' || selectedFunction?.code === 'B1'`，位于 builder-fields.ts:139）。而 validateSubmit() 在提交时的 BACKSTOP（兜底）逻辑，只对 A1 套用同一套正规化处理（判断条件仅为 `selectedFunction?.code === 'A1'`，位于 submit-rules.ts:100）——B1 在提交阶段并没有对应的客户端兜底机制来执行这项正规化，这是两处判断条件之间的不一致，而非一份有文档记录、双方立场分歧的既定设计。

## 条件
selectedFunction.code === 'B1' 且 tenorType 为 SIGHT（或为 Usance 但 tenorDays 为非正数），并且是经由某种绕过即时 Formly 表达式的路径抵达此状态（例如以程式化方式直接修改 model）。

## 结果
buildFields() 在画面上仍会正确地为 B1 强制/要求期限天数，但 validateSubmit() 自身的守卫链从未针对 B1 检查或修正该字段——与 A1 的兜底机制不一致，且没有直接证据可以证明其中哪一个才是经业务确认的既定行为。

## 示例
B1，tenorType='SIGHT'，透过绕过即时表达式的路径将 tenorDays 输入为 45——validateSubmit() 不会像对待 A1 那样把它修正为 0。

## 冲突说明
> [!warning] 来源存在分歧
> 已透过 grep 直接重新核实：submit-rules.ts:100 只检查 'A1'；builder-fields.ts:139 检查 'A1' || 'B1'。在所引用的行号处，确认存在真实的代码层级不一致——维持为 CONFLICT（两条实现同一名义规则的代码路径在适用范围上互相矛盾），不予降级，因为这个差异是直接可在源码中观察到的，而非推断得出。

## 验证说明
已透过 grep 直接重新核实：submit-rules.ts:100 只检查 'A1'；builder-fields.ts:139 检查 'A1' || 'B1'。在所引用的行号处，确认存在真实的代码层级不一致——维持为 CONFLICT（两条实现同一名义规则的代码路径在适用范围上互相矛盾），不予降级，因为这个差异是直接可在源码中观察到的，而非推断得出。

## 来源证据

实现：
- `src/app/transaction-builder/submit-rules.ts:100`
- `src/app/transaction-builder/builder-fields.ts:60,139`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- 期限类型/天数的携带与锁定 + A1 Sight 正规化
- [[Business-Rule-Index]]
- [[Knowledge-Gaps]]
- [[Balance-Traceability-Matrix]]
