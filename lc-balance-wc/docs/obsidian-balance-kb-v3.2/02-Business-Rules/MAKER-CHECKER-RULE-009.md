---
knowledge_id: MAKER-CHECKER-RULE-009
title: "依 (balanceContractId, eventSeq) 实现的幂等建立——HTTP 层行为"
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

# MAKER-CHECKER-RULE-009 — 依 (balanceContractId, eventSeq) 实现的幂等建立——HTTP 层行为

## 状态
CONFIRMED

## 业务规则
以相同的 contract + eventSeq 重复提交 POST /balance-movements，会返回 200，且响应体为最初、未经修改的那笔 movement——重复提交内容中任何有差异的金额或其他栏位，都会被静默忽略，不会被套用。

## 适用条件
balanceContractId（或经由 naturalKey 解析得到）+ eventSeq 已存在于先前的某笔 movement 上。

## 结果
返回 200 OK，响应体为最初的那笔 movement（而非重复提交中的数值）；不会新建任何记录。

## 示例
eventSeq 3 的 UTILIZE 50000 已建立；重新提交 eventSeq 3、金额改为 999999，仍然返回金额 '50000'。

## 核实说明
本条与上文合并而成的"幂等键（balanceContractId, eventSeq）——重复提交是空操作"规则重复（引用同一路由/测试）。之所以保留为独立条目，仅是为了保留对这项具体 HTTP 层端对端测试的可追溯性；应视为已被该规则涵盖，而非一项独立事实。

## 来源证据

实现代码：
- `microservices/balance-component/src/routes/balanceMovements.ts:11-23`

测试：
- `microservices/balance-component/test/unit/app.test.ts:87-102`

## 相关知识
- [[Maker Checker Lifecycle]]
- 依 (contract, eventSeq) 实现的 movement 幂等建立
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
