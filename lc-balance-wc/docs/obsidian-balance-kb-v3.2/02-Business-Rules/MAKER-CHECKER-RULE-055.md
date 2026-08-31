---
knowledge_id: MAKER-CHECKER-RULE-055
title: "生产环境上线前必须替换：真正的按 LC 并发需要 PostgreSQL 行级锁"
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

# MAKER-CHECKER-RULE-055 — 生产环境上线前必须替换：真正的按 LC 并发需要 PostgreSQL 行级锁

## 状态
CONFIRMED

## 业务规则
业务需求是：针对同一 LC 的并发提交必须正确串行化，而针对不同 LC 的提交彼此之间绝不应互相阻塞。SQLite（node:sqlite，DatabaseSync）即便启用了 WAL 模式，也只能在『整个数据库文件』这一级别加锁——无论触及的是哪一份逻辑合约，每一次写入都会在全局范围内串行化，因此需求中『不同 LC 互不阻塞』这一半在该引擎上是结构性地无法验证的。已记录为一项硬性的『生产环境上线前必须替换』事项：迁移到 PostgreSQL（将 SELECT...FOR UPDATE 限定在 balance_contract_id 范围内）或 MySQL/InnoDB 的行级锁。

## 条件
针对该服务的任何生产环境部署（相对于当前的单进程原型而言）。

## 结果
2026-08-21 的各项优化修复（busy_timeout、复合索引、CHECK/FK 约束、N+1 批处理）均未解决这一限制——这是唯一明确需要更换数据库引擎、而非在 SQLite 一侧修复即可解决的事项。

## 示例
不适用——这是架构层面的限制，而非某次请求的具体示例。

## 验证说明
与 CLAUDE.md 自身『已知限制（Known limitation）』条目（位于数据库层小节下）逐字相符，并直接再次确认该数据库使用的是 node:sqlite（db/index.ts）。请注意，这主要是一项基础设施／可扩展性方面的发现，而非严格意义上的 Maker/Checker 工作流规则——按原样保留在本前缀下，因为它关系到跨不同合约的并发 Maker/Checker 操作能否被信任为互不干扰，但在此标注为与本批次核心的四眼（4-eyes）工作流规则相比属于边缘性内容。

## 来源证据

实现：
- `Balance-Component-DB-Design.txt §1.1 (lines 47-58)`
- `Balance-Component-DB-Design.txt §8.1 (lines 767-774)`

测试：
- `Balance-Component-DB-Optimization-Analysis.txt §3 SQLite-cannot-fix table (lines 198-207)`
- `Balance-Component-DB-Optimization-Analysis.txt §4 item 5 (lines 229-230)`

## 相关知识
- [[Maker Checker Lifecycle]]
- SQLite 整文件级加锁无法展现真正的按单据（per-instrument）并发
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
