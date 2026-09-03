---
knowledge_id: Tolerance-Processing
title: "容差处理"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance-wc)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-09-03
tags:
  - balance
  - tolerance
  - domain-concept
---

# 容差处理

贸易金融信用证（LC）业务惯例上会允许小额的超装/超支容差（例如"金额 ± 10%"），而不要求信用证的面值金额与实际支取金额完全一致。Issue 的上限公式为：

```
ceilingAmount = amount × (1 + tolerancePct / 100)
```

Monetary Amendment（A2／B2）不得只对本次 delta 套公式，而必须以修改前后整笔合约重算：

```
newFace = currentFace + increase - decrease
oldUpper = round(currentFace × (1 + currentTolerance / 100))
newUpper = round(newFace × (1 + newTolerance / 100))
balanceDelta = newUpper - oldUpper
newLower = round(newFace × (1 - newTolerance / 100))
```

A1／B1 的初始 `tolerancePct` 与 A2／B2 的 `toleranceChangePct` 都只接受非负整数字符串。
A2／B2 的 Maker 可以只输入 Amount、只输入 Tolerance Change，或两者都输入。Tolerance-only 在 API 上正规化为
`amount: "0"`，Request 传 `toleranceChangePct` + `toleranceChangeDirection`；PENDING Movement 的
`tolerancePct` 仍是旧核准值，交易保存两个 change 字段。Checker Release 后 Movement／Contract
`tolerancePct` 才更新为后端算出的最终值。因此 `newFace = currentFace`，但新旧
Upper Limit 的差仍会入账。Amount 为 0 且 Tolerance Change 未输入或为 0 是 no-op，由 UI 与微服务两层拒绝。

SWIFT 边界：MT707 对外字段表达修证后的最终有效 Tolerance，不是 Balance Component change。SWIFT／业务
编排层必须以当前值换算 change 后调用本 API，不得把 MT707 最终值直接当作 `toleranceChangePct`。

旧／新上下限依币别小数位采用 `ROUND_HALF_UP`。Movement 保存 change 及后端算出的最终 Tolerance；Checker Release
成功前 contract 仍保留旧值，Release 时依最新已放行历史重算，避免并发 amendment 使用过期基准。
`AMEND_EXPIRY_DATE` 不接受 Tolerance，也不产生 monetary-amendment delta。ACTIVE 目标是纯日期修改；EXPIRED
目标在 Checker Release 时恢复原 RELEASED EXPIRE 的余额属于 lifecycle restoration，不进入 Tolerance 公式。

Reference UI 先让 Maker 选择 Direction，再从 Index 选择 LC／Confirmation。进入 Transaction Input 后，
已锁定的 LC Number 不重复显示，Direction 下拉选单也替换为醒目的唯读 `Amendment Direction` 标示；
若方向选错，须 Cancel 返回 Selection Screen 重新选择，不能在已绑定 contract 后原地改变 movement type。

Standard Fix Pending 修正 monetary amendment 后，会在同一 DB transaction 立即重算并保存 Event
Snapshot，不等待 Checker Release。Inquire Events 与 Transaction Processing Current Balance 将 amendment 自身的 `ceilingAmount` 显示为
`Pending Amendment Balance Effect`，并把 contract 当前 Tolerance 与 movement 提议 Tolerance 显示成
旧值→新值（原提议例如 `0% → 10%`，Fix Pending 后例如 `0% → 20%`）。同一 LC 有多笔 pending
amendment 时逐笔附 Reference 显示。没有 pending amendment 时，Current Balance 仍显示最新 RELEASED
amendment，并从 RELEASED event history 推导真实旧值（例如 Decrease `20% → 15%`），而不是错误地以
contract 当前 15% 显示成 `15% → 15%`。`Pending Earmark Total` 则仍是全部 PENDING movement 的净额；例如
amendment effect +32,000 与另一笔 UTILIZE −10,000 同时存在时显示 +22,000。

## 适用时机（WHEN）

仅适用于 `IPLC_LC`/`EPLC_LC`（以及 `EPLC_CONFIRMATION`）在 **ISSUE／monetary AMEND** 类 movementType 下的场景——绝不适用于 `AMEND_EXPIRY_DATE`、SHGT 或 Acceptance。该闸门同时检查 **instrumentType 与 movementType 两者**，因为 SHGT 自身的 `ISSUE` movementType 在字面上与 LC 的 `ISSUE` 完全相同——若不做双重检查，Shipping Guarantee 的开立就会被错误地套用容差换算。

## 原因（WHY）

设置 `tolerancePct`/`ceilingAmount` 的目的，是让可用余额/已保兑余额/紧缩可用余额（Tight Available Balance，参见 [[Balance Derivation Rules]]）始终与*真正可用*的上限比较，而非信用证的名义面值金额——一笔实际上落在约定容差区间内的支取，不应仅因其名义上超过信用证所载 `amount` 而被拒绝。基于同样的原因，`amendDecrease.ts` 特意用经容差换算后的 `ceilingAmount`（而非原始 `amount`）与可用余额比较。

## 币别／外汇说明

Balance 组件自身的容差/上限逻辑仅限单一币别（即信用证自身的交易币别）——它本身并不执行跨币别的外汇换算。多币别／小数精度处理位于 `money.ts`（十进制字符串约定，与姊妹 Payment 组件自身的约定保持一致）以及 `CURRENCY_MINOR_UNITS`/`CURRENCY_DECIMALS` 对照表（分别用于前端与后端），并通过 `amountExceedsCurrencyDecimals()` 在每一笔金额输入上强制校验。所有派生上限与下限使用 Decimal `ROUND_HALF_UP`，例如 JPY 0 位、USD 2 位、KWD 3 位。

## UCP／ICC 边界

UCP 600 Article 10 要求 amendment 的外部同意与不得部分接受，属于上游 Trade Finance workflow；本组件
不替代 beneficiary consent 流程，而是在 Checker Release 前不让新的金额／Tolerance 成为有效合约条件。
Article 30(a) 的 amount tolerance 可进入 exposure 上限，Article 30(b) 的 quantity tolerance 不得混入本数值。

## 相关知识

- [[Balance Derivation Rules]]
- [[BalanceContract]]
- [[InstrumentType]]
- [[Off-Balance-Sheet Exposure]]
- [[Business-Rule-Index]]
