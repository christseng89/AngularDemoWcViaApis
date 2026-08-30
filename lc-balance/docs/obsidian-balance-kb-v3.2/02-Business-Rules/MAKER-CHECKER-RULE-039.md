---
knowledge_id: MAKER-CHECKER-RULE-039
title: "查询当前余额中，出口保兑 LC 会将 B3（EPLC_EXAMINATION）事件合并进 LC 分页——因其自身并无独立的余额分页"
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

# MAKER-CHECKER-RULE-039 — 查询当前余额中，出口保兑 LC 会将 B3（EPLC_EXAMINATION）事件合并进 LC 分页——因其自身并无独立的余额分页

## 状态
CONFIRMED

## 业务规则
loadSnapshotAndMovements() 的 mergeChildTypes 参数，只有在 EPLC_CONFIRMATION 合约的根 LC 分页上，才会被填入 ['EPLC_EXAMINATION']——因为 B3 自身的到单审核（Present Docs）预留记录（EPLC_EXAMINATION）并没有像进口 LC 的承兑/SG 子项那样拥有独立的余额分页，其事件必须直接并入分页 1 自身的时间轴中。

## 条件
contract.instrumentType === 'EPLC_CONFIRMATION'。

## 结果
LC 分页的事件时间轴同时包含该保兑本身的 movement，以及该 LC 编号下每一笔 EPLC_EXAMINATION 合约的 movement。

## 示例
一笔 B3 到单审核，会内嵌显示在出口保兑 LC 的 LC 分页时间轴中，而不是显示在独立的 B3 专属分页上。

## 验证说明
此项说法未引用直接测试证据，但其机制（mergeChildTypes 的闸门控制）与 CLAUDE.md 自身在查询事件相关决策日志条目中，反复描述且有充分佐证的余额分页设计，在架构上是一致的。凭借与源码的直接匹配，维持 CONFIRMED；若有具体的测试引用会更有说服力。

## 来源证据

实现：
- `src/app/transaction-builder/look-up-panel.service.ts:200-211,281-289`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- [[LookUpPanelService]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
