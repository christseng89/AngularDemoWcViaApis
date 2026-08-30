---
knowledge_id: table-rebuild-migration-for-adding-check-fk-constraints-migration-13
title: "透过表重建来新增 CHECK/外键约束的迁移（迁移 13）"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# 透过表重建来新增 CHECK/外键约束的迁移（迁移 13）

SQLite 无法用 ALTER TABLE 为既有字段新增 CHECK 或 REFERENCES 约束，因此迁移 13 在单一事务内使用官方的“重建表”做法。

```mermaid
flowchart TD
  A["SQLite：ALTER TABLE 无法为既有字段新增 CHECK/REFERENCES"] --> B["PRAGMA foreign_keys = OFF"]
  B --> C["BEGIN 事务"]
  C --> D["建立带 CHECK + 外键约束的新表"]
  D --> E["INSERT INTO 新表 SELECT（明确列出字段清单）FROM 旧表"]
  E --> F["DROP 旧表"]
  F --> G["RENAME 新表为原表名"]
  G --> H["在改名后的表上重建所有索引"]
  H --> I{"是否有任一步骤失败？"}
  I -- 是 --> J["ROLLBACK——原表保持不变，不会留下半成品表，可安全重试"]
  I -- 否 --> K["COMMIT"]
  K --> L["PRAGMA foreign_keys = ON"]
```

## 来源证据

- `Balance-Component-DB-Optimization-Analysis.txt P2 CHECK-constraint row (lines 136-149)`

## 相关知识

- DB Design + DB Optimization Analysis Docs
- [[Business-Rule-Index]]
