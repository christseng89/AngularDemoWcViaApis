---
knowledge_id: BALANCE-RULE-012
title: "tightAvailableBalanceForWarning 会为 A3S（已匹配的 SG 赎回）与 B4（针对某笔交单 Present Docs 呈现的 HONOUR/ACCEPT）放宽客户端实时检查的阈值"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - balance
  - confirmed
---

# BALANCE-RULE-012 — tightAvailableBalanceForWarning 会为 A3S（已匹配的 SG 赎回）与 B4（针对某笔交单 Present Docs 呈现的 HONOUR/ACCEPT）放宽客户端实时检查的阈值

## 状态
CONFIRMED

## 业务规则
向 Maker 展示的实时严格可用余额上限，在两种场景下会超出持久化快照中的原始数值，因为在这两种场景下服务端的实际检查会抵扣一部分快照尚未反映出来的额度：A3S 会按所选 SG 自身的 confirmedBalance（Outstanding）放宽；B4 会按所选可支付变动记录（即被引用的 B3 记录）自身的 ceilingAmount 放宽。

## 触发条件
documentArrivalWithSg 场景下已选择某个 SG（arrivalSgSnapshot 存在）；或者 movementType 为 HONOUR/ACCEPT 且已选择某笔可支付变动记录（selectedPayMovement 存在）。

## 结果
放宽后的阈值 = 原始 tightAvailableBalance + 所选 SG 的 confirmedBalance（A3S 场景），或 + 所选可支付变动记录的 ceilingAmount（B4 场景）。其他情况下退回到原始数值。

## 示例
S01/G01：严格可用余额 24，SG Outstanding 10——在 A3S 上键入 Bill Amount 34，此前会错误地提示"超出严格可用余额（24）"，即便服务端实际上会接受该请求（真实上限为 24+10=34）；此项放宽逻辑修复了这一问题。

## 验证说明
单一来源，直接重新阅读；该 getter 的实现与该论断精确一致（A3S 使用 arrivalSgSnapshot.confirmedBalance，B4 使用 selectedPayMovement.ceilingAmount）。未降级。

## 来源证据

实现:
- `src/app/transaction-builder/maker-panel.component.ts:774-808`

测试:
- （未引用直接测试证据）

## 相关知识
- [[Balance Derivation Rules]]
- tightAvailableBalanceForWarning getter
- checksAgainstTightAvailable
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
