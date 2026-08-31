---
knowledge_id: MAKER-CHECKER-RULE-004
title: "幂等键（balanceContractId, eventSeq）——重复提交在各层（应用层检查、DB 竞态防护、HTTP 路由）都只是空操作，直接返回原始记录"
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

# MAKER-CHECKER-RULE-004 — 幂等键（balanceContractId, eventSeq）——重复提交在各层（应用层检查、DB 竞态防护、HTTP 路由）都只是空操作，直接返回原始记录

## 状态
CONFIRMED

## 业务规则
在建立一笔新 movement 之前，createMovement() 会先透过 findByContractAndEventSeq() 依 (contract.balanceContractId, req.eventSeq) 查找是否已存在对应的 movement；若已存在，则返回 {created:false, existing}，而不是另外新建一笔重复记录。第二层防护则位于 BalanceMovementStore.insert()——在内存中的对象构建完成之后再次检查，储存层自身在 (balance_contract_id, event_seq) 上的 UNIQUE 约束会捕捉到并发情形下的重复插入，其结果同样是 {created:false, existing}，而不是抛出错误。HTTP 路由（POST /balance-movements）会将这一情形对外呈现为 200 OK，且响应体是最初、未经修改的那笔 movement——重复提交请求中任何有差异的栏位（例如不同的金额）都会被静默忽略，绝不会被套用，也不会新建任何记录。

## 适用条件
一笔建立 movement 的请求重复使用了先前某次成功建立操作已经用过的 (balanceContractId, eventSeq) 组合——或经由 naturalKey+eventSeq 解析后等价的组合。

## 结果
返回 200 OK，响应体为最初的那笔 movement（而非重复提交中的数值）；不会新建任何记录；并发的竞态重复插入同样会经由 DB 的 UNIQUE 约束以相同方式被吸收。

## 示例
eventSeq 3 的 UTILIZE 50000 已建立；以相同合约重新提交 eventSeq 3、金额改为 999999，仍然返回金额 '50000'，movementId 保持不变。

## 核实说明
合并了从不同层面描述同一规则的 5 个高度重复的候选项（服务层预检查、储存层竞态防护、路由层/HTTP 端对端测试，加上两份 OAS/数据库设计文件的重述）为同一条。直接重新阅读了 balanceMovementStore.ts:122-211 与 balanceService.ts:992-993/1100-1102，确认两层实现与主张完全一致。确实为 CONFIRMED——多条独立的代码路径以及一个通过的端对端测试均相互印证。

## 来源证据

实现代码：
- `microservices/balance-component/src/service/balanceService.ts:992-993,1100-1102`
- `microservices/balance-component/src/store/balanceMovementStore.ts:122-211`
- `microservices/balance-component/src/routes/balanceMovements.ts:11-23`

测试：
- `microservices/balance-component/test/unit/db/schema.test.ts:79-89`
- `microservices/balance-component/test/unit/app.test.ts:87-102`

## 相关知识
- [[Maker Checker Lifecycle]]
- 幂等键：UNIQUE(balance_contract_id, event_seq)
- 依 (contract, eventSeq) 实现的 movement 幂等建立
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
