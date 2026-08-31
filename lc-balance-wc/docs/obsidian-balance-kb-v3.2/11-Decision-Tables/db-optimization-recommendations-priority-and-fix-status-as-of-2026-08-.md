---
knowledge_id: db-optimization-recommendations-priority-and-fix-status-as-of-2026-08-
title: "数据库优化建议——优先级与修复状态（截至 2026-08-21）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 数据库优化建议——优先级与修复状态（截至 2026-08-21）

| 优先级 | 条目 | 状态 |
|---|---|---|
| P0 | 缺少 PRAGMA busy_timeout——写入方立即失败而非排队等待 | 已于 2026-08-21 修复（busy_timeout=5000，文件库与 :memory: 均已设置） |
| P1 | balance_movements 因新增 xxx_by/xxx_at 角色字段不断通过 ALTER TABLE 扩张（已有 47 列，仍在增长） | 未修复——刻意推迟至未来迁移至 PostgreSQL 时处理（拟议对 movement_actions/movement_snapshots 做规范化拆分） |
| P1（与 P2 一并处理） | 自引用 ID 字段缺少真正的外键约束 | 已于 2026-08-21 修复，与 P2 的 CHECK 约束迁移一并完成 |
| P2 | 前缀通配符 LIKE '%q%' 搜索无法使用 B-tree 索引 | 刻意不予修复——保留子字符串搜索是经过权衡的用户行为决策；若日后重新评估，建议采用 FTS5 |
| P2 | OFFSET 分页在深页时性能下降 | 刻意不予修复——当前数据量尚不需要处理；且会波及 API 接口层 |
| P2 | idx_contracts_parent 原为单列索引，但实际查询为双列相等匹配 | 已于 2026-08-21 修复（复合索引 + migration 12） |
| P2 | 6 个枚举类字段缺少 CHECK 约束；4 个自引用字段缺少外键 | 已于 2026-08-21 修复（migration 13，全表重建） |
| P2 | 金额字段以 TEXT 存储（无原生 DECIMAL 类型） | 已确认为既有设计中正确的决策，并非缺陷——仅作为未来直接 SQL 报表查询时需注意的约束条件标注 |
| P2（超出原定范围时发现） | A10/B6 关闭资格批量选取器中的 N+1 查询模式（最坏情况约 800 次查询） | 已于 2026-08-21 修复（批量 IN 子句存取方法、preFetched 参数） |

## 来源证据

- `Balance-Component-DB-Optimization-Analysis.txt §2 (lines 46-164), §4 (lines 211-230)`

## 相关知识

- DB Design + DB Optimization Analysis Docs
- [[Business-Rule-Index]]
