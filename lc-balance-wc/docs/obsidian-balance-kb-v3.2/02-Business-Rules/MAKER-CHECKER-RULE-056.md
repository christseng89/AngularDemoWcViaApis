---
knowledge_id: MAKER-CHECKER-RULE-056
title: "PRAGMA busy_timeout=5000 将锁竞争变为有界排队，而非立即返回 SQLITE_BUSY 失败"
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

# MAKER-CHECKER-RULE-056 — PRAGMA busy_timeout=5000 将锁竞争变为有界排队，而非立即返回 SQLITE_BUSY 失败

## 状态
CONFIRMED

## 业务规则
在无条件设置了 PRAGMA busy_timeout=5000（文件模式与 :memory: 模式两个分支均适用）的情况下，一个无法立即获取 SQLite 写锁的写入方，会等待最多 5000ms 以等待锁释放，而不是立即抛出 SQLITE_BUSY。

## 条件
两次写入在时间上有重叠地针对同一个 SQLite 数据库文件（例如针对同一 LC 的两次近乎同时的提交）。

## 结果
第二个写入方会排队，并在内部重试最多 5 秒钟后才失败，而不是一接触就立即失败——这使实际行为更接近（尽管按上文的并发规则来看仍未完全达到）同一 LC『正确串行化』这一需求的实现程度。

## 示例
一个直接的测试在 createDb() 之后读回 PRAGMA busy_timeout，并断言其值等于 5000。

## 验证说明
已直接再次验证：`db/index.ts:39` 中恰好包含 `db.exec('PRAGMA busy_timeout = 5000')`。已确认（Confirmed）。

## 来源证据

实现：
- `microservices/balance-component/src/db/index.ts:39`

测试：
- `Balance-Component-DB-Optimization-Analysis.txt P0 section (lines 55-69) — 描述了一个断言该数值的新增直接测试`

## 相关知识
- [[Maker Checker Lifecycle]]
- PRAGMA busy_timeout=5000——已于 2026-08-21 修复（P0）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
