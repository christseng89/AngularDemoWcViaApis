---
knowledge_id: EXPOSURE-RULE-024
title: "SG Issue 与 SG 金额增加过账完全相同的 Dr/Cr 配对；不存在独立的 SG 修改/减少/索赔 movementType"
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

# EXPOSURE-RULE-024 — SG Issue 与 SG 金额增加过账完全相同的 Dr/Cr 配对；不存在独立的 SG 修改/减少/索赔 movementType

## 状态
CONFIRMED

## 业务规则
SG Issue（新开）与 SG 金额增加都过账 Dr Customers' Liability under Shipping Guarantees / Cr Shipping Guarantees Outstanding——方向相同、科目相同。Balance Component 完全没有针对 SHGT 的独立 AMEND movementType（已实现的集合仅为 ISSUE/PARTIAL_REDEEM/FULL_REDEEM，这一点已通过 computeOffBalanceExposure() 自身「未预期 movementType 即抛出」的守卫逻辑得到确认，该逻辑只容许 ISSUE/PARTIAL_REDEEM/FULL_REDEEM）；一次真正的额度增加会以另一笔 A8 SG Issue 来实现，而非作为独立的修改事件。真正的金额减少与该 SG 项下的索赔，在 Balance Component 中完全没有对应功能——甚至没有可用的 A8/A9 变通做法。

## 条件
SG 覆盖额度的任何增加。

## 结果
无论是全新开立的 SG，还是对既有 SG 的额度增加，都通过 A8·ISSUE 过账到相同的建立配对；SG 的减少/索赔目前无法由 Balance Component 的任何功能表示。

## 示例
增加既有 SG 的覆盖额度，是通过再开一笔 A8 SG Issue 完成，而非修改；系统没有功能可以记录真正的 SG 金额减少或该 SG 项下的索赔。

## 验证说明
从单一的纯文档引用候选，强化为文档+代码双重佐证的 CONFIRMED——offBalanceExposure.ts 抛出守卫自身的注释（「only ISSUE/PARTIAL_REDEEM/FULL_REDEEM are valid for SHGT」）本轮为验证另一条规则而被独立通读，直接印证了「SHGT 不存在独立 AMEND movementType」这一说法。

## 原始码证据

实现：
- `analysis/contingent-liability-ledger.html Folio 2 建立行, Notes 第 7 项（grep 核实，第 666 行）`
- `microservices/balance-component/src/domain/offBalanceExposure.ts:70-72（已核实：抛出守卫自身的合法集合注释确认，对 SHGT 而言唯一合法值仅为 ISSUE/PARTIAL_REDEEM/FULL_REDEEM）`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
