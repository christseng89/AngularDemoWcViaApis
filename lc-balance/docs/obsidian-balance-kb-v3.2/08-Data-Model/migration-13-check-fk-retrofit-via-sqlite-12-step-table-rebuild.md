---
knowledge_id: migration-13-check-fk-retrofit-via-sqlite-12-step-table-rebuild
title: "迁移 13——透过 SQLite 12 步表重建法补齐 CHECK/外键约束"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# 迁移 13——透过 SQLite 12 步表重建法补齐 CHECK/外键约束

说明一个已存在于磁盘上的数据库，如何被升级为带有 CHECK 约束与自引用外键——这两种约束是 SQLite 的 ALTER TABLE 无法追加到既有字段上的；同时说明重建过程中途失败时，如何保证绝不会留下一个迁移到一半的数据库。

```mermaid
flowchart TD
  A["迁移 13 up(db)"] --> B["PRAGMA foreign_keys = OFF"]
  B --> C["BEGIN IMMEDIATE"]
  C --> D["建立 balance_contracts_new\n（带 CHECK + 外键约束）"]
  D --> E["INSERT INTO balance_contracts_new\nSELECT <明确列出字段> FROM balance_contracts"]
  E --> F["DROP TABLE balance_contracts"]
  F --> G["RENAME balance_contracts_new -> balance_contracts"]
  G --> H["重建 balance_contracts 的所有索引"]
  H --> I["建立 balance_movements_new\n（带 CHECK + 外键约束）"]
  I --> J["INSERT INTO balance_movements_new\nSELECT <明确列出字段> FROM balance_movements"]
  J --> K["DROP TABLE balance_movements"]
  K --> L["RENAME balance_movements_new -> balance_movements"]
  L --> M["重建 balance_movements 的所有索引"]
  M --> N["COMMIT"]
  N --> O["PRAGMA foreign_keys = ON（finally 区块）"]
  C -.->|"任一步骤抛出异常"| P["ROLLBACK"]
  P --> O
  O --> Q["重新抛出原始错误"]
```

## 来源证据

- `microservices/balance-component/src/db/migrations.ts:152-306`
- `microservices/balance-component/test/unit/db/migrations.test.ts:78-116`

## 相关知识

- Data Model — DB Schema, Migrations, Stores, Types/Money/Errors
- [[Business-Rule-Index]]
