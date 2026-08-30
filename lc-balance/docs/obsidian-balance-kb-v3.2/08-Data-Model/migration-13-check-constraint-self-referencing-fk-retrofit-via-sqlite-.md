---
knowledge_id: migration-13-check-constraint-self-referencing-fk-retrofit-via-sqlite-
title: "迁移 13：透过 SQLite 12 步表重建法，补齐 CHECK 约束与自引用外键"
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

# 迁移 13：透过 SQLite 12 步表重建法，补齐 CHECK 约束与自引用外键

由于 SQLite 的 ALTER TABLE 只能 ADD COLUMN（永远无法为既有字段追加 CHECK 或 REFERENCES 约束），迁移 13 在同一个事务内，从头重建 balance_contracts 与 balance_movements 这两张表（PRAGMA foreign_keys=OFF、BEGIN IMMEDIATE、建立带约束的 CREATE ..._new、以明确列出字段清单的 INSERT...SELECT——绝不使用 SELECT *、DROP 旧表、RENAME 新表就位、重建每一个索引、COMMIT、最后 PRAGMA foreign_keys=ON），并整体包在 try/catch/ROLLBACK 中，确保重建过程中途失败时，绝不会留下一个重建到一半的数据库。写这段迁移之前已针对真实的开发环境数据库做过实测验证（每一笔已持久化的值都已经是合法的 CHECK 成员），因此预期在真实生产数据上同样能成功执行，而不仅仅是对空数据库有效。

## 来源证据

- `microservices/balance-component/src/db/migrations.ts:152-306`
- `microservices/balance-component/test/unit/db/migration13DataPreservation.test.ts:1-267`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
