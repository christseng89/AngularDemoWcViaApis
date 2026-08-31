---
knowledge_id: Close-Eligibility
title: "Close Eligibility"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - status
  - lifecycle
---

# Close Eligibility

**A10（进口）/ B6（出口）Close** 会冲销剩余的 Confirmed Balance 并将一张信用证/保兑合约退休（结案）——处理方式与自然到期完全相同，差别只在于本次是由 Maker/Checker 触发（依领域说明文件的论述，可类比为「到期前取消」）。`domain/closeEligibility.ts` 是被三道各自独立的防护层共用的唯一适格性检查：

## 适格性检查本身

- SG 余额 = 0
- 承兑（Acceptance）余额 = 0
- 整个合约树中没有任何未结事件（open Event）——包括状态为 RELEASED 但尚未 `presentDocsConsumedAt` 的 B3 押单（Present Docs）（见 [[Off-Balance-Sheet Exposure]]）
- 尚未处于 `CLOSED` 状态

## 三道防护层，一个共用函数

1. Step-1 选择器自身、由服务端计算出的提示集合（`GET /balance-contracts/close-eligible`——不同于选择器层中其他逐笔候选的提示，这是单一次的聚合查询）
2. `createMovement()` 自身在提交（Submit）时的充足性检查
3. `release()` 自身在将 `ContractStatus` 翻转为 `CLOSED` 之前的再次检查

## 冲销金额从不可手动输入

`amountAutoFilledFrom`（一个 `FunctionStrategy` 维度）会带入 Confirmed Balance 的金额并锁定该栏位——这与 A9/B5 自身的 `amountVsAvailableDerivation` 有本质差异，后者仍允许 Maker 输入一个数值以与 Available 进行比对。该金额必须与当前的 Confirmed Balance 完全相等，且在提交（Submit）与放行（Release）**两个时点**都会再次核实——若两者之间发生了余额变动，则会强制重新提交，而不会悄悄地多冲或少冲（异动一经建立即不可变，Close 在此不变量上没有任何特殊豁免）。

## 建置过程中发现的一个缺陷——自我否决的放行

放行（Release）时刻的适格性再次检查，原本会把正在放行的这笔 CLOSE 异动本身也算作阻挡其自身的「未结事件」之一（因为在那一刻它自己仍处于 PENDING 状态）——导致每一次 Close 都会自我否决。已透过在 `evaluateContractCloseEligibility()` 上新增一个 `excludeMovementId` 参数修复。

## Related knowledge

- [[BalanceContract]]
- [[Off-Balance-Sheet Exposure]]
- [[Maker Checker Lifecycle]]
- [[Balance Derivation Rules]]
- [[Business-Rule-Index]]
