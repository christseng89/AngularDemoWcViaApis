---
knowledge_id: event-snapshot-column-write-semantics-coalesce-preserve-vs-explicit-in
title: "事件快照列的写入语义：COALESCE 保留 vs. 显式的 'in params' 空值写入"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 事件快照列的写入语义：COALESCE 保留 vs. 显式的 'in params' 空值写入

updateStatus() 在其各个快照列上使用了两种不同的空值处理策略。eventSnapshot/rootEventSnapshot/finalizeEventSnapshot/finalizeAcceptanceEventSnapshot/finalizeSgEventSnapshot 使用 COALESCE(@param, column)——一旦绑定，省略/undefined 与显式 null 是无法区分的，因此当非 release 类调用方（reject/cancel）省略该键时，现有值会保持不变。acceptanceEventSnapshot/sgEventSnapshot 则改用显式的 CASE WHEN @hasXSnapshot=1 THEN @param ELSE column END 标志（由 params 中是否存在 'key' 推导而来），因为 release() 每次调用都会无条件地重新计算这些值，而一个刚重新计算出来的值完全有可能合法地为 null（例如同级数量存在歧义的情况）——单纯使用 COALESCE 会错误地保留一个过期的、Create 时写入的非空值。

## 2026-08-26 补充——reason_code 曾是这批列中唯一的例外：一处真正的 Bug，release() 会静默把它清空，现已修复

本笔记描述的 COALESCE 保留模式，此前并未覆盖到 `reason_code` 这一列——它此前用的是与 `status`/`released_by`/`released_at`/`balance_before`/`balance_after` 相同的**普通覆盖**写法（`reason_code = @reasonCode`），而不是本笔记所述的 `COALESCE(@param, column)`。这本身就是一处真正的 Bug（reviewer 报告，2026-08-26）：`release()` 自身从不传入 `reasonCode`（CLOSE/REOPEN 的必填 Reason Code 是在 `createMovement()` 时就已捕获、写入的，`release()` 无需也不会重新提供），于是每一次 Release 都会把参数位上的 `undefined`/`null` 绑定进去，把 Maker 当初输入的 Reason Code 静默清空——`reject()`/`cancel()` 不受影响，因为两者调用 `updateStatus()` 时始终会传入自己真实的、非空的 `reasonCode`。

修复方式：与本笔记所述的其余快照列保持一致，改为 `reason_code = COALESCE(@reasonCode, reason_code)`——省略/undefined 时保留原值，仅当调用方真正传入非空值时才覆盖。

已知遗留数据现象：本次分析快照中的既有演示数据（LC `S01` 的 CLOSE/REOPEN 记录）是在此修复之前生成的，其 Reason Code 目前仍显示为空——这是修复前遗留下来的数据现象，不可逆，并不代表修复本身不完整。

## Source Evidence（补充）

- `microservices/balance-component/src/store/balanceMovementStore.ts:381-397 (reasonCode 参数上的文档注释，说明 Bug 成因), 453 (COALESCE(@reasonCode, reason_code) 修复后的 SQL)`
- `microservices/balance-component/test/unit/service/closeFunction.test.ts:51-87 (直接验证 CLOSE 的 reasonCode 在 release() 前后保持不变，且经由 listMovements() 的持久化读路径重新核实)`
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:279-329 (直接验证同一条 REOPEN-A-001 链路上，CLOSE 与 REOPEN 各自的 reasonCode 都在各自 release() 之后保持不变)`

## 来源证据

- `microservices/balance-component/src/store/balanceMovementStore.ts:367-466`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
