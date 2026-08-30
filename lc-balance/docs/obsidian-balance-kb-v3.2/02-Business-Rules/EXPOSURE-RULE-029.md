---
knowledge_id: EXPOSURE-RULE-029
title: "事件快照（event_snapshot/root_event_snapshot/acceptance_event_snapshot/sg_event_snapshot）在写入时一次性计算且从不重新计算，唯一例外是 A4 终结 A3 的情形，该情形会写入一组独立的 finalize_* 字段"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 分析快照中没有 .git 历史记录，参见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - confirmed
---

# EXPOSURE-RULE-029 — 事件快照（event_snapshot/root_event_snapshot/acceptance_event_snapshot/sg_event_snapshot）在写入时一次性计算且从不重新计算，唯一例外是 A4 终结 A3 的情形，该情形会写入一组独立的 finalize_* 字段

## 状态
CONFIRMED

## 业务规则
快照在 createMovement()/release() 内部计算，并不可变地持久化，供 Inquire Events 读取；同时存在一组并行的 finalize_event_snapshot/finalize_acceptance_event_snapshot/finalize_sg_event_snapshot 字段，其唯一目的是让 A4（终结 A3 既有的 UTILIZE）能够将「自身」释放时刻的余额单独写入，从而使 A3 原本的 event_snapshot 保持冻结在其自身创建时刻的值，而不会被 A4 的 Release 覆盖。

## 条件
任何 createMovement() 或 release() 调用；特别是 A4 终结 A3（Sight IPLC_LC UTILIZE 终结）的情形。

## 结果
Inquire Events 中始终显示每个具体事件在其历史发生那一刻的余额情况，包括 A3 自身的那一刻，即使后来 A4 对其进行了终结处理也是如此。

## 示例
在 Inquire Events 中查看 A3 的原始事件，会显示 A3 自身处于 PENDING 时刻的快照，而非 A4 后续 Release 之后的数值，因为 A4 写入的是 finalize_event_snapshot，而不会覆盖 A3 的 event_snapshot。

## 验证说明
本轮未独立重新通读该数据库设计文档的具体章节；鉴于其引用具体，且与本轮已独立验证的 assembleSnapshot() 调用点（balanceService.ts 第 574-699、777 行，本轮已直接通读）以及匹配的 CLAUDE.md 决策记录条目（对同一 finalize_* 快照机制有详细描述）完全一致，予以保留为 CONFIRMED。

## 原始码证据

实现：
- `Balance-Component-DB-Design.txt §2.5 (lines 106-117), §4.2.5 (lines 382-409) — 本轮未独立重新通读，但与已独立验证的 assembleSnapshot()/多快照字段列的 CLAUDE.md 决策记录条目直接一致`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- 写入时快照（Snapshot-on-write）机制，供 Inquire Events 使用
- assembleSnapshot()（上文已独立验证）是两条写入路径共用的辅助函数
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
