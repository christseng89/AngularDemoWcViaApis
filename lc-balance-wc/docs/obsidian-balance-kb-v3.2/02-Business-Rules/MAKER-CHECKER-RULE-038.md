---
knowledge_id: MAKER-CHECKER-RULE-038
title: "单一子合约的 listMovements()/catalog() 失败会被吞掉，从不影响更大范围的合并结果"
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

# MAKER-CHECKER-RULE-038 — 单一子合约的 listMovements()/catalog() 失败会被吞掉，从不影响更大范围的合并结果

## 状态
CONFIRMED

## 业务规则
movementsOf$() 与 childMovementsOf$() 都各自对自身的 HTTP 失败调用 catchError()，将其转为空的 InquiredEvent[]/Observable，而不是向外抛出错误，因此某一个子合约状况不佳，或某一次 catalog() 调用出现网络抖动，只会使该单一子合约对合并结果的贡献退化为 []，而根合约自身（以及其余每个子合约）的 movement 仍能正常返回。

## 条件
合并过程中，某一子合约的 listMovements() 或 catalog() 抛出异常/出错。

## 结果
该合约贡献零个事件；合并过程的其余部分照常进行，不会向用户显示错误。

## 示例
SHGT 的 catalog() 调用失败，而根 LC 自身的 movement 仍正常载入——search() 仍会成功，只是不包含 SG 事件。

## 验证说明
来源单一且明确，并有匹配的测试引用。已确认。

## 来源证据

实现：
- `src/app/transaction-builder/inquire-events.service.ts:102,116`

测试：
- `src/app/transaction-builder/inquire-events.service.spec.ts:240-270`

## 相关知识
- [[Maker Checker Lifecycle]]
- movementsOf$() / childMovementsOf$() ——合并时间轴的建构
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
