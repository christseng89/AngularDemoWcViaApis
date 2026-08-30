---
knowledge_id: check-constraints-are-defense-in-depth-against-non-app-writers-not-jus
title: "CHECK 约束是针对非应用层写入者的纵深防御，而不仅是应用层校验"
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

# CHECK 约束是针对非应用层写入者的纵深防御，而不仅是应用层校验

checkAndForeignKeyConstraints.test.ts 明确说明了自身的设计理由：该测试文件中的每一次插入都通过原始 SQL 完成，刻意绕过 BalanceService/仓储层的 TS 层校验，因为数据库层 CHECK/外键约束的意义就在于防范那些并非经过应用自身已验证 API 表面的调用者（例如一次有问题的迁移、一个手工修复脚本、未来向同一数据库写入的第二个服务）。如果只有应用层校验能阻止一个非法值，那么数据库约束就毫无意义。

## 来源证据

- `microservices/balance-component/test/unit/db/checkAndForeignKeyConstraints.test.ts:1-10`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
