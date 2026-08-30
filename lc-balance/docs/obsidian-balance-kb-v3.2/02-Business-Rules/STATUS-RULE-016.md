---
knowledge_id: STATUS-RULE-016
title: "替代（supersession）与冲正（reversal）链上的自引用外键完整性"
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

# STATUS-RULE-016 — 替代（supersession）与冲正（reversal）链上的自引用外键完整性

## 状态
CONFIRMED

## 业务规则
balance_contracts.supersedes_balance_contract_id／superseded_by_balance_contract_id，以及 balance_movements.superseded_movement_id／reversal_of_movement_id，各自都必须指向本表中一笔真实存在的行（或为 NULL）——由 migration 13 新增的外键 REFERENCES 强制约束。

## 条件
上述 4 个自引用字段中任一被设为非 NULL 值。

## 结果
悬空引用会抛出 FOREIGN KEY constraint failed 错误；指向一笔真实且已插入的行的引用则会被接受。

## 示例
以 reversal_of_movement_id='no-such-movement' 调用 insertMovement 会抛出异常；同一字段指向一个真实且先前已插入的 movement_id 时则会成功。

## 验证说明
已直接在 migration 13 的 REFERENCES 子句中确认。说明：此外键完整性是真实存在且被强制执行的，但和上面的版本链规则一样，`superseded_movement_id` 与 `supersedes_balance_contract_id` 目前没有任何生产环境的写入方（只有 `reversal_of_movement_id`／CLOSE 相关字段会被真实流程触发）——无论其所保护的每个字段目前是否都被现行代码填充，该约束本身在定义上是正确的且由数据库强制执行。

## 来源证据

实现：
- `microservices/balance-component/src/db/migrations.ts:160-263`

测试：
- `microservices/balance-component/test/unit/db/checkAndForeignKeyConstraints.test.ts:168-208`

## 相关知识
- [[Close Eligibility]]
- 自引用外键字段
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
