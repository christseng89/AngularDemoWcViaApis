---
knowledge_id: BALANCE-RULE-014
title: "LC Master Records Index 的面值金额列（deriveLcAmount）镜像了微服务端已废弃不用的 computeFaceAmount()，仅用于展示，且有直接的单元测试覆盖"
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

# BALANCE-RULE-014 — LC Master Records Index 的面值金额列（deriveLcAmount）镜像了微服务端已废弃不用的 computeFaceAmount()，仅用于展示，且有直接的单元测试覆盖

## 状态
CONFIRMED

## 业务规则
对于 IPLC_LC/EPLC_LC：汇总 RELEASED 状态的根事件金额，ISSUE/AMEND_INCREASE 记为 (+amount)，AMEND_DECREASE 记为 (-amount)；PENDING 变动记录不作任何贡献。对于 EPLC_CONFIRMATION：汇总 RELEASED 状态的 ISSUE（+amount）与 AMEND（+amount，已经是带符号值）。此处使用普通的 JS Number 运算（可以接受，因为该指标仅用于展示，从不参与任何影响余额的计算）。

## 触发条件
eventStatus === 'RELEASED'；movementType 属于 {ISSUE, AMEND_INCREASE, AMEND_DECREASE, AMEND}

## 结果
展示在 Index 行上的 lcAmount 字符串

## 示例
在 A1(ISSUE 100,RELEASED)+A2(AMEND_INCREASE 20,PENDING) 之后的根事件：lcAmount = 100（PENDING 状态的 amend 被排除）。

## 验证说明
单一来源，直接重新阅读了实现代码与两处引用的规范文本；switch 语句与测试期望值与该论断完全一致（分别为 110000 与 105000）。未降级。

## 来源证据

实现:
- `src/app/transaction-builder/inquire-events.service.ts:144-173`

测试:
- `src/app/transaction-builder/inquire-events.service.spec.ts:282-328 (Import lcAmount sum)`
- `src/app/transaction-builder/inquire-events.service.spec.ts:335-354 (Export signed AMEND sum)`

## 相关知识
- [[Balance Derivation Rules]]
- deriveLcAmount()
- [[computefaceamount|computeFaceAmount()（服务端，已未被使用）]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
