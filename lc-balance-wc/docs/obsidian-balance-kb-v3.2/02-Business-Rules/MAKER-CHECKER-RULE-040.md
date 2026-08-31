---
knowledge_id: MAKER-CHECKER-RULE-040
title: "查询当前余额也能解析出 CLOSED 合约——属于纯查询用途，并未限定为仅 ACTIVE"
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

# MAKER-CHECKER-RULE-040 — 查询当前余额也能解析出 CLOSED 合约——属于纯查询用途，并未限定为仅 ACTIVE

## 状态
CONFIRMED

## 业务规则
LookUpPanelService.runLookup() 会明确以 includeAnyStatus=true 调用 resolveContract(...)，因为这是一项只读查询（并非会建立交易的动作），一笔 CLOSED 的 LC（A10/B6）仍必须能被解析，好让它包含 CLOSE 事件在内的完整历史依然可见。应用中其他每一个会建立交易的调用方，都不会带上这个旗标，仍然只限定于 ACTIVE，因此一笔已关闭的 LC，对于任何会建立新 movement 的功能而言仍然无法被选取。

## 条件
查询当前余额搜索，不限合约状态。

## 结果
CLOSED 合约在此处能够成功解析；它们不会经由经办人各功能所用的、仅限 ACTIVE 的路径解析出来。

## 示例
一笔已关闭的 LC，在查询当前余额中，仍会返回包含 CLOSE movement 在内的完整事件时间轴。

## 验证说明
已由 CLAUDE.md 自身描述这项确切的 includeAnyStatus 修正与业务方所反映缺口的 A10/B6 关闭相关决策日志条目逐字佐证。虽未引用直接测试，但鉴于文档佐证力度充分，仍确认为 CONFIRMED。

## 来源证据

实现：
- `src/app/transaction-builder/look-up-panel.service.ts:195-198`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- [[LookUpPanelService]]
- A10/B6 关闭 —— 新增 GET /balance-contracts?includeAnyStatus=
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
