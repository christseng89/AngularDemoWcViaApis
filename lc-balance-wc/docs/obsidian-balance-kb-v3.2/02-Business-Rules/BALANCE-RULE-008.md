---
knowledge_id: BALANCE-RULE-008
title: "各项余额（已确认／可用／严格可用）始终在查询时由变动记录历史实时推导得出，从不缓存在合约行上；openingBalance 是一个已废弃、恒为 '0' 的遗留字段"
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

# BALANCE-RULE-008 — 各项余额（已确认／可用／严格可用）始终在查询时由变动记录历史实时推导得出，从不缓存在合约行上；openingBalance 是一个已废弃、恒为 '0' 的遗留字段

## 状态
CONFIRMED

## 业务规则
balance_contracts 表中不存在可变更的"当前余额"列——所有余额指标都在每次查询时由 balance_movements 历史重新计算（或者对于历史 Inquire Events 视图，从持久化的 event_snapshot 中读取，而该快照本身也是由同一套 assembleSnapshot() 逻辑写入的）。opening_balance 列在数据库结构中存在，但服务始终将其写为字面字符串 '0'，在实时余额计算中不起任何作用。

## 触发条件
针对任意 balance_contract_id 的余额指标查询

## 结果
余额始终在查询时由所有变动记录重新计算，从不读取过时的缓存总额；在当前实现中 openingBalance 始终为 '0'。

## 示例
microservices/balance-component/src/service/balanceService.ts:1430 在每次创建合约时都硬编码写入 `openingBalance: '0'`；Balance-Component-DB-Design.txt 第 190 行记录了同一事实（"期初余额，目前实作恒为 '0'"）。

## 验证说明
原始候选项只引用了数据库设计文档。独立找到并确认了代码层面的事实（balanceService.ts:1430 始终写入 '0'），这使得文档中的论断从"仅有文档断言"升级为 CONFIRMED——证据等级得到了提升。未发现任何写入非零 openingBalance 的冲突代码路径。

## 来源证据

实现:
- `microservices/balance-component/src/service/balanceService.ts:1430`
- `microservices/balance-component/src/db/schema.ts:99`
- `converted/Balance-Component-DB-Design.txt §2.1 (lines 62-72), line 190`

测试:
- （未引用直接测试证据）

## 相关知识
- [[Balance Derivation Rules]]
- 双层账本模型：合约 vs. 变动记录
- balanceDerivation.ts
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
