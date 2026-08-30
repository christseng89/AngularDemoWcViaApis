---
knowledge_id: money-amounts-stored-as-text-decimal-strings-never-native-numeric-type
title: "金额一律以 TEXT 十进制字符串存储，绝不使用原生数值类型"
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

# 金额一律以 TEXT 十进制字符串存储，绝不使用原生数值类型

amount、ceiling_amount、balance_before、balance_after 等金额相关字段一律以 TEXT 存储十进制字符串，与 money.ts 的十进制字符串约定保持一致——SQLite 没有原生的 DECIMAL 类型，而 REAL 类型存在浮点数舍入风险。这样做的代价是这些字段无法在 SQL 中直接 SUM 或做数值排序；所有算术运算都发生在 TypeScript 层，评审记录中指出这本来就是既有的既定模式，因此是一致的，只是未来若要写直接查询数据库做报表，需要留意这一点。

## 来源证据

- `Balance-Component-DB-Design.txt §4.2.2 (lines 297-317)`
- `Balance-Component-DB-Optimization-Analysis.txt P2 TEXT-amount row (lines 151-152)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
