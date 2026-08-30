---
knowledge_id: Tolerance-Processing
title: "容差处理"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - tolerance
  - domain-concept
---

# 容差处理

贸易金融信用证（LC）业务惯例上会允许小额的超装/超支容差（例如"金额 ± 10%"），而不要求信用证的面值金额与实际支取金额完全一致。`domain/tolerance.ts` 将此规则实现为单一公式：

```
ceilingAmount = amount × (1 + tolerancePct / 100)
```

## 适用时机（WHEN）

仅适用于 `IPLC_LC`/`EPLC_LC`（以及 `EPLC_CONFIRMATION`）在 **ISSUE/AMEND\*** 类 movementType 下的场景——绝不适用于 SHGT 或 Acceptance。该闸门同时检查 **instrumentType 与 movementType 两者**，因为 SHGT 自身的 `ISSUE` movementType 在字面上与 LC 的 `ISSUE` 完全相同——若不做双重检查，Shipping Guarantee 的开立就会被错误地套用容差换算。

## 原因（WHY）

设置 `tolerancePct`/`ceilingAmount` 的目的，是让可用余额/已保兑余额/紧缩可用余额（Tight Available Balance，参见 [[Balance Derivation Rules]]）始终与*真正可用*的上限比较，而非信用证的名义面值金额——一笔实际上落在约定容差区间内的支取，不应仅因其名义上超过信用证所载 `amount` 而被拒绝。基于同样的原因，`amendDecrease.ts` 特意用经容差换算后的 `ceilingAmount`（而非原始 `amount`）与可用余额比较。

## 币别／外汇说明

Balance 组件自身的容差/上限逻辑仅限单一币别（即信用证自身的交易币别）——它本身并不执行跨币别的外汇换算。多币别／小数精度处理位于 `money.ts`（十进制字符串约定，与姊妹 Payment 组件自身的约定保持一致）以及 `CURRENCY_MINOR_UNITS`/`CURRENCY_DECIMALS` 对照表（分别用于前端与后端），并通过 `amountExceedsCurrencyDecimals()` 在每一笔金额输入上强制校验。

## 相关知识

- [[Balance Derivation Rules]]
- [[BalanceContract]]
- [[InstrumentType]]
- [[Off-Balance-Sheet Exposure]]
- [[Business-Rule-Index]]
