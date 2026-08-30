---
knowledge_id: MAKER-CHECKER-RULE-019
title: "自然键（LC/IB/SG Number）的解析方式依功能形态而异"
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

# MAKER-CHECKER-RULE-019 — 自然键（LC/IB/SG Number）的解析方式依功能形态而异

## 状态
CONFIRMED

## 业务规则
contextLcNumber() 依功能形态不同，从 4 种不同来源读取数值：Parent 选取器（lcNumberFromParent — A6/A8/B3 形态）、自由输入的 naturalKey（创设型、无 parent — A1/B1）、selectedContract 并回退至 searchNaturalKey（双栏位查找 — A7/A9/B5 形态），或单纯依解析出的 selectedContract（平铺目录 Catalog — A2 形态）。contextSecondaryRef()（IB/SG Number）的行为与之相仿，唯一的例外是：即便 LC Number 来自 Parent 选取器，IB/SG Number 也绝不会来自 Parent 选取器，因为 IB/SG Number 即使在 A6/A8 上也始终是由 Maker 自由输入的。

## 适用条件
依 isCreatingMovement / hasParent / usesTwoFieldSearch 的不同组合而异。

## 结果
无论是由哪一种选取器形态产生，最终都会为 Checker Queue 同步与 Look Up 自动填充解析出单一、确定性的 LC/次要参照值。

## 示例
A6 形态（lcNumberFromParent 为 true）：contextLcNumber 读取 selectedParent.naturalKey.lcNumber；contextSecondaryRef 仍读取（人工输入的）naturalKey.ibNumber，而非取自 parent。

## 核实说明
来源单一，测试引用范畴明确，直接覆盖了所声称的分支逻辑。已确认。

## 来源证据

实现代码：
- `src/app/transaction-builder/function-policy.ts:106-129`

测试：
- `src/app/transaction-builder/function-policy.spec.ts:202-309`

## 相关知识
- [[Maker Checker Lifecycle]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
