---
knowledge_id: STATUS-RULE-015
title: "在每一个枚举类型字段上设置数据库层级的 CHECK 约束，作为超越应用层校验的纵深防御"
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

# STATUS-RULE-015 — 在每一个枚举类型字段上设置数据库层级的 CHECK 约束，作为超越应用层校验的纵深防御

## 状态
CONFIRMED

## 业务规则
balance_contracts 表上的 instrument_type、status、tenor_type，以及 balance_movements 表上的 movement_type、exposure_nature、status，各自都带有一个列出全部合法值的 CHECK IN (...) 约束（tenor_type 额外允许 NULL）——即使某次写入完全绕过了应用层自身的 TypeScript 校验，非法值仍会被拒绝。

## 条件
任何将上述 6 个字段中任一字段设为超出其声明合法值集合的 INSERT/UPDATE 操作。

## 结果
SQLite 会在数据库层抛出「CHECK constraint failed」错误，独立于任何应用层检查、并作为其补充。

## 示例
一条 instrument_type='NOT_A_REAL_TYPE' 的原始 SQL 插入语句会被拒绝，即使它从未经过 BalanceService。

## 验证说明
直接阅读了 schema.ts 的 CREATE TABLE 语句以及 migration 13 的重建脚本——全部 6 个 CHECK 子句均如声明般存在。未降级。

## 来源证据

实现：
- `microservices/balance-component/src/db/schema.ts:80-153`
- `microservices/balance-component/src/db/migrations.ts:160-263`

测试：
- `microservices/balance-component/test/unit/db/checkAndForeignKeyConstraints.test.ts:58-166`

## 相关知识
- [[Close Eligibility]]
- CHECK 约束作为纵深防御
- 枚举值权威来源
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
