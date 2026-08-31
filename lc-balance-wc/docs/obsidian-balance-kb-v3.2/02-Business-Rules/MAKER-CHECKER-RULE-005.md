---
knowledge_id: MAKER-CHECKER-RULE-005
title: "UNIQUE 违例的判定方式是对错误讯息做字串比对，而非依赖稳定的错误代码（已知的局限，BAL-120）"
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

# MAKER-CHECKER-RULE-005 — UNIQUE 违例的判定方式是对错误讯息做字串比对，而非依赖稳定的错误代码（已知的局限，BAL-120）

## 状态
CONFIRMED

## 业务规则
由于 node:sqlite 并未提供稳定的约束违例错误代码（且本专案先前在 ts-jest 环境下的排错经验显示，它抛出的错误已知无法通过 `err instanceof Error` 检查），insert() 中用于判定幂等冲突的逻辑，是将抛出错误的 .message 与 /UNIQUE constraint failed/ 做比对，而非依赖某个具类型的错误代码。除此之外的其他任何错误讯息（例如 FOREIGN KEY constraint failed）都会原样重新抛出，绝不会被误判为一次重复提交。

## 适用条件
对 balance_movements 的任何一次 INSERT 抛出错误。

## 结果
只有讯息符合 /UNIQUE constraint failed/ 的情形，才会被视为重复提交并转换为 {created:false, existing}；其余所有错误都会以真实错误的形式向外传播。

## 示例
使用一个伪造的 balanceContractId 调用 insert() 会抛出 'FOREIGN KEY constraint failed'，该错误会以真实错误的形式向外传播，而不是被静默地转换为 {created:false}。

## 核实说明
CLAUDE.md 自身的决策日志独立佐证了这一点（"BAL-120（幂等冲突判定维持以讯息文字比对的方式，因为 node:sqlite 没有稳定的约束错误代码——属于延后处理，而非疏漏）"）。已确认为一项真实、已披露的局限，而非疏忽。

## 来源证据

实现代码：
- `microservices/balance-component/src/store/balanceMovementStore.ts:193-211`

测试：
- `microservices/balance-component/test/unit/db/schema.test.ts:292-299`

## 相关知识
- [[Maker Checker Lifecycle]]
- 幂等键：UNIQUE(balance_contract_id, event_seq)，重复提交返回原始记录
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
