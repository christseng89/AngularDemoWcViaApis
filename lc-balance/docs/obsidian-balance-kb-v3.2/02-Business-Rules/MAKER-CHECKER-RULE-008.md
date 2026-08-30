---
knowledge_id: MAKER-CHECKER-RULE-008
title: "重复 ISSUE 防护——针对一个已处于 ACTIVE 状态的自然键，再次提交创设型 movementType（ISSUE/CREATE）会被拒绝并返回 409，绝不会被静默叠加"
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

# MAKER-CHECKER-RULE-008 — 重复 ISSUE 防护——针对一个已处于 ACTIVE 状态的自然键，再次提交创设型 movementType（ISSUE/CREATE）会被拒绝并返回 409，绝不会被静默叠加

## 状态
CONFIRMED

## 业务规则
若某个用于建立合约的 movementType（ISSUE/CREATE）被提交、且其对应的自然键已经解析为一份处于 ACTIVE 状态的 Logical Contract，该请求会被拒绝，返回 409 NATURAL_KEY_ALREADY_EXISTS。要变更既有合约金额的正确途径，是 AMEND_INCREASE/AMEND_DECREASE/AMEND，而不是再来一次 ISSUE——这项防护完全在应用层（createMovement()）实现，并非依赖 DB 层的 UNIQUE 约束：idx_contracts_naturalkey 只是一个普通、非 UNIQUE 的索引，因此这项保证完全依赖应用层检查能否正确运作。

## 适用条件
instrumentType+naturalKey 已存在一份 ACTIVE 合约，且提交的 movementType 属于创设型（LC/Confirmation 为 ISSUE，Acceptance 为 CREATE）。

## 结果
返回 409 NATURAL_KEY_ALREADY_EXISTS；既有合约的 Confirmed Balance 不受影响；若应用层检查曾被绕过或存在缺陷，DB 层并无任何后盾可以补救。

## 示例
ISSUE LC0001 成功；对 LC0001 再次执行 ISSUE 会返回 409，Confirmed Balance 停留在第一次 Issue 的金额。在这项防护出现之前，对同一 LC 号码重复 Issue 曾经会静默地在既有 Confirmed Balance 之上再叠加一笔（业务方报告的缺口，2026-08-14）。

## 核实说明
合并了 4 个近乎重复的候选项（errors.ts 类别定义 x2、app.test.ts 端对端测试、OAS 规格的重述），并纳入一个有区别但相关的 DB 设计文件细节（该防护仅在应用层实现，并非 DB 约束，被标注为未来可强化的候选项），将其视为同一规则的一部分，而非另立新规则，因为它直接限定了这项防护实际的稳健程度。直接重新阅读了 errors.ts:48-61，确认该类别及其文件注释所描述的正是这项防护所修复的具体业务缺口。已确认。

## 来源证据

实现代码：
- `microservices/balance-component/src/errors.ts:48-61`

测试：
- `microservices/balance-component/test/unit/app.test.ts:955-1062`

## 相关知识
- [[Maker Checker Lifecycle]]
- NaturalKeyAlreadyExistsError — 针对已处于 ACTIVE 状态自然键的重复 ISSUE 防护
- 自然键与代理键并存
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
