---
knowledge_id: createdb-initialization-sequence
title: "createDb() 初始化流程"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# createDb() 初始化流程

展示从打开 DatabaseSync 句柄到得到一个就绪、已完成迁移的 Db 对象的完整启动路径，说明文件模式与 :memory: 模式的分支、以及迁移执行器，相对于固定的 PRAGMA 执行顺序分别处于什么位置。

```mermaid
flowchart TD
  A["createDb(filePath)"] --> B["new DatabaseSync(filePath)"]
  B --> C{"filePath === ':memory:' ?"}
  C -- 否 --> D["PRAGMA journal_mode = WAL"]
  C -- 是 --> E["跳过 WAL 设置"]
  D --> F["PRAGMA foreign_keys = ON"]
  E --> F
  F --> G["PRAGMA busy_timeout = 5000"]
  G --> H["exec(SCHEMA_SQL)\nCREATE TABLE/INDEX IF NOT EXISTS"]
  H --> I["runMigrations(db)"]
  I --> J{"schema_migrations 表是否已存在？"}
  J -- 否 --> K["CREATE TABLE schema_migrations"]
  J -- 是 --> L["读取已应用的 migration id"]
  K --> L
  L --> M["按 id 顺序遍历 MIGRATIONS 中的每个 Migration"]
  M --> N{"该 id 是否已应用？"}
  N -- 是 --> M
  N -- 否 --> O["migration.up(db)"]
  O --> P["INSERT INTO schema_migrations(id, applied_at)"]
  P --> M
  M --> Q["return Db"]
```

## 来源证据

- `microservices/balance-component/src/db/index.ts:28-44`
- `microservices/balance-component/src/db/migrations.ts:309-325`

## 相关知识

- Data Model — DB Schema, Migrations, Stores, Types/Money/Errors
- [[Business-Rule-Index]]
