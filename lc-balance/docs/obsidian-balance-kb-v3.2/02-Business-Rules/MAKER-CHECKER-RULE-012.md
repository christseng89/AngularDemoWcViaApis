---
knowledge_id: MAKER-CHECKER-RULE-012
title: "幂等信号的测试重复——经由 app.test.ts 的 NaturalKeyAlreadyExistsError 端对端测试（重复 ISSUE）"
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

# MAKER-CHECKER-RULE-012 — 幂等信号的测试重复——经由 app.test.ts 的 NaturalKeyAlreadyExistsError 端对端测试（重复 ISSUE）

## 状态
CONFIRMED

## 业务规则
针对一个已解析为 ACTIVE 状态 Logical Contract 的自然键，再次提交创设型 movementType（ISSUE/CREATE）会被拒绝，返回 409 NATURAL_KEY_ALREADY_EXISTS，绝不会被静默叠加为第二笔事件。

## 适用条件
instrumentType+naturalKey 已存在一份 ACTIVE 合约，且提交的 movementType 属于创设型（LC/Confirmation 为 ISSUE，Acceptance 为 CREATE）。

## 结果
返回 409 NATURAL_KEY_ALREADY_EXISTS；既有合约的 Confirmed Balance 不受影响。

## 示例
ISSUE LC0001 成功；对 LC0001 再次执行 ISSUE 会返回 409，Confirmed Balance 停留在第一次 Issue 的金额。

## 核实说明
完全被上文合并而成的"重复 ISSUE 防护"规则所涵盖——证据与主张相同。保留本条仅为了保留对这项具体端对端测试的可追溯性；应视为重复条目，而非一项独立事实。

## 来源证据

实现代码：
- `microservices/balance-component/src/errors.ts:58-61`

测试：
- `microservices/balance-component/test/unit/app.test.ts:955-1062`

## 相关知识
- [[Maker Checker Lifecycle]]
- 自然键上的重复 ISSUE 防护
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
