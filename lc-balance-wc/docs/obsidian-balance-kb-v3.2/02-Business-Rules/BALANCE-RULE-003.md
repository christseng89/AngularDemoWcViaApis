---
knowledge_id: BALANCE-RULE-003
title: "待处理占用总额（Pending Earmark Total）= 可用余额 − 已确认余额（一个真实持久化的字段，而非仅存在于设计文档中的概念）"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - balance
  - confirmed
---

# BALANCE-RULE-003 — 待处理占用总额（Pending Earmark Total）= 可用余额 − 已确认余额（一个真实持久化的字段，而非仅存在于设计文档中的概念）

## 状态
CONFIRMED

## 业务规则
待处理占用总额是某合约上 PENDING 状态变动记录的净签名差额；它并非独立累加得出，而是由可用余额减去已确认余额推导而来。它是真实计算并持久化为 BalanceSnapshot.pendingEarmarkTotal 的字段。

## 触发条件
派生得出，而非独立累加

## 结果
pendingEarmarkTotal = available.minus(confirmed)；一旦该合约上所有 PENDING 状态的变动记录都已结清，该值会恢复到 Submit 之前的数值

## 示例
参见 balanceService.ts 第 640 行：`pendingEarmarkTotal: available.minus(confirmed).toFixed()`

## 验证说明
原始候选项仅引用了设计文档（Figure #3），没有代码证据。独立找到了真实实现（balanceService.ts:640、types.ts:323），确认 pendingEarmarkTotal 确实是一个真实存在、与论断精确匹配的持久化字段——证据基础得到了提升而非降级，状态维持 CONFIRMED，但现在建立在更坚实的基础之上（可执行代码，而非仅仅是文字描述）。

## 来源证据

实现:
- `microservices/balance-component/src/service/balanceService.ts:640`
- `microservices/balance-component/src/types.ts:323`
- `analysis/Balance-Figures-Calculation-Logic.md (Figure #3)`

测试:
- （未引用直接测试证据）

## 相关知识
- [[Balance Derivation Rules]]
- 五大核心余额指标（Five Core Balance Figures）
- BalanceSnapshot
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
