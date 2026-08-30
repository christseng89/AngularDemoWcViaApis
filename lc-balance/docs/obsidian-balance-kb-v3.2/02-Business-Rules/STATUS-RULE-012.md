---
knowledge_id: STATUS-RULE-012
title: "balance_movements 是仅追加（append-only）的 —— 状态转换只会触及一组固定的、有名字的字段"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - status
  - confirmed
---

# STATUS-RULE-012 — balance_movements 是仅追加（append-only）的 —— 状态转换只会触及一组固定的、有名字的字段

## 状态
CONFIRMED

## 业务规则
balance_movements 中的记录永远不会被物理删除或整行改写；每一次生命周期转换（release/reject/cancel/acknowledge/maker-submit/present-docs-consume）都通过一个专用存储方法所执行的定向 UPDATE 来表达，且只触及该方法自身特定的字段，从而在单独一行记录中保留完整的 Maker/Checker 审计轨迹。

## 触发条件
updateStatus() 触及 status/released*/balanceBefore/After/*snapshot*/cancelled*；markPresentDocsConsumed() 只触及 present_docs_consumed_by/at；submitByMaker() 只触及 maker_submitted_by/at；acknowledge() 只触及 acknowledged_by/at。

## 结果
完整的审计历史始终可以从每笔变动记录的单独一行中重新还原——无需单独的审计表。

## 示例
acknowledge() 从不触及 status，因此一笔变动记录可以在 status='PENDING' 的同时已设置了 acknowledged_at——这是一个真实存在、可查询的中间状态（以 UI 术语来说即为 EARMARKED）。

## 验证说明
直接阅读了 updateStatus() 自身的签名/COALESCE 逻辑——与描述一致。已将描述同一事实的近似重复的 db-design-docs 候选项（来自 Balance-Component-DB-Design.txt §2.2/§4.2.4）合并进本条目，作为佐证性的设计文档证据，而非另立一条规则。

## 来源证据

实现:
- `microservices/balance-component/src/store/balanceMovementStore.ts:1-13,367-508`

测试:
- `microservices/balance-component/test/unit/db/schema.test.ts:301-318`

## 相关知识
- [[Close Eligibility]]
- [[BalanceMovement|BalanceMovementStore]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
