---
knowledge_id: MAKER-CHECKER-RULE-053
title: "幂等键：重复的 (contract, event_seq) 提交会返回既有记录，而不是报错或产生重复记录（数据库设计文档复述）"
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

# MAKER-CHECKER-RULE-053 — 幂等键：重复的 (contract, event_seq) 提交会返回既有记录，而不是报错或产生重复记录（数据库设计文档复述）

## 状态
CONFIRMED

## 业务规则
balance_movements 在数据库层强制执行 UNIQUE(balance_contract_id, event_seq)，实现了源代码注释中所引用的、内部尚未纳入版本控制的『设计文档 §8』幂等键方案。

## 条件
某个调用方以与此前某次已插入的请求相同的 (balance_contract_id, event_seq) 组合，重新提交一次 movement 创建请求。

## 结果
BalanceMovementStore.insert() 捕获该 UNIQUE 约束冲突，查出既有记录，并返回 {created:false, existing}，使调用方可以正常返回 200，而不会误报错误或造成 movement 被重复过账。

## 示例
一次重发相同 Maker Submit 请求的网络重试会被安全吸收，而不会为同一事件创建第二条 PENDING 状态的 movement。

## 验证说明
已完全被上文合并后的代码层幂等性规则所涵盖——这份数据库设计文档来源描述的正是同一套 UNIQUE(balance_contract_id, event_seq) 机制，已在 balanceMovementStore.ts 中被直接验证过。请注意，这与 TF_Balance_Component_Spec/Mapping 中描述的另一套、未实现的 (entity, source_system, source_ref, semantic_key) 方案是『同一套』(balanceContractId, eventSeq) 方案——不应混淆；那是两份不同的设计文档，描述了两个互不调和的不同幂等性概念，其中只有这一套（本条所述）真正被实现了。

## 来源证据

实现：
- `Balance-Component-DB-Design.txt §2.3 (lines 83-91)`
- `Balance-Component-DB-Design.txt §4.2.6-4.2.7 (lines 416-417,430-432)`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- 幂等键：UNIQUE(balance_contract_id, event_seq)
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
