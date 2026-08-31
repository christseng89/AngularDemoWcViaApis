---
knowledge_id: MAKER-CHECKER-RULE-020
title: "适格性规则的 0 余额排除，在 Catalog/IB-Index 选取器中受 movementType 限定，但在 Parent 选取器中无条件适用（既有的不对称现象，被蓄意保留）"
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

# MAKER-CHECKER-RULE-020 — 适格性规则的 0 余额排除，在 Catalog/IB-Index 选取器中受 movementType 限定，但在 Parent 选取器中无条件适用（既有的不对称现象，被蓄意保留）

## 状态
CONFIRMED

## 业务规则
共用的 genericFallback 适格性规则，会排除 Available Balance 为 0 的候选项——但仅当 gatedByMovementType 为 true、且 movementType 属于 DECREASING_MOVEMENT_TYPES（即 Catalog/IB-Index 选取器的调用方）时才适用；而 Parent 选取器的调用方则套用相同的 0 余额排除规则，完全不受 movementType 限定。这项不对称现象早在 eligibility-rule.ts 抽取之前就已存在，是被蓄意保留而非予以调和——Phase 3 的统一化工作发现，若将三个末端回退逻辑合并在同一限定条件之下，会悄悄改变 A8 自身一贯无条件的 0 余额排除行为，因此这项不对称被蓄意维持。

## 适用条件
rule.kind === 'genericFallback'。

## 结果
gatedByMovementType=true 时：仅在 movementType 属于递减型时才排除 0 余额候选项。gatedByMovementType=false 时：无条件排除 0 余额候选项。

## 示例
A2（Catalog 选取器）在 AMEND_INCREASE 时：一份 0 余额的 LC 仍会显示。A6 自身的 Parent 选取器：一份 0 Available Balance 的 parent LC 会被排除，无论 movementType 为何，除非它带有一项基于 hintSet 的豁免。

## 核实说明
CLAUDE.md 自身关于 Phase 3 的书面记录给予了佐证（"在此也捕捉到一个真实缺陷：将三个末端回退逻辑合并在同一限定条件之下，会悄悄改变 A8 自身一贯无条件的 0 余额排除行为"），独立确认了这项不对称现象确实被发现并被蓄意保留。规则本身未提供直接测试引用，但文件佐证加上直接源码比对，已足以维持 CONFIRMED。

## 来源证据

实现代码：
- `src/app/transaction-builder/eligibility-rule.ts:28-60`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- 适格性规则统一化（eligibility-rule.ts）
- BAL-003 Phase 3 —— 在合并三个选取器的回退逻辑时捕捉到的一个真实缺陷
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
