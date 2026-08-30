---
knowledge_id: MAKER-CHECKER-RULE-014
title: "A10/B6 Close：Amount 栏位从不由人工输入——自动填入并锁定为 Confirmed Balance"
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

# MAKER-CHECKER-RULE-014 — A10/B6 Close：Amount 栏位从不由人工输入——自动填入并锁定为 Confirmed Balance

## 状态
CONFIRMED

## 业务规则
amountAutoFilledFrom 与 amountVsAvailableDerivation 确实是两个不同的维度（A9/B5 仍允许 Maker 手动输入一个用于比较的数值）——A10/B6 的 Amount 完全由系统依据当前的 Confirmed Balance 推导而来，并处于禁用状态，将 LC/Confirmation 冲销为 0。冲销金额必须与当前 Confirmed Balance 完全一致，且此项在 Submit 与 Release 两个时点都会重新核实。

## 适用条件
strategy.movementDerivation.amountAutoFilledFrom === 'confirmedBalance'（即 A10 或 B6）且 selectedContractSnapshot 已解析完成。

## 结果
Amount 栏位处于禁用状态，来源为 Confirmed Balance，不设上限（是完全锁定，而非仅仅设置上限）；若在 Submit 与 Release 之间余额发生变化，会强制要求重新提交，而不是多写或少写。

## 示例
A10 在快照尚未解析完成前 -> 可编辑，显示一般的面额层级标签；一旦解析完成 -> 禁用，改为 Close 专属标签，显示冲销金额。

## 核实说明
CLAUDE.md 自身关于 A10/B6 Close 的决策日志条目描述了这一确切机制，并阐明其与 A9/B5 的 amountVsAvailableDerivation 的区别，给予了佐证。已确认。

## 来源证据

实现代码：
- `src/app/transaction-builder/function-strategy.ts:135-139,157-161`
- `src/app/transaction-builder/builder-fields.ts:50-55,83-84`

测试：
- `src/app/transaction-builder/builder-fields.spec.ts:142-166`

## 相关知识
- [[Maker Checker Lifecycle]]
- Amount 栏位锁定优先级链（builder-fields.ts）
- [[Close Eligibility|A10/B6 Close 适格性判断（domain/closeEligibility.ts）]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
