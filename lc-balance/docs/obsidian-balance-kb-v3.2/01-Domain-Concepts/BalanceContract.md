---
knowledge_id: BalanceContract
title: "BalanceContract"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
  - contract
---

# BalanceContract

**BalanceContract** 是某一笔或有负债（contingent-liability）或表内（on-balance-sheet）风险暴露工具的持久化、可版本化记录——例如一张信用证（LC）、一份装运保函（Shipping Guarantee）、一笔承兑（Acceptance）、一笔出口保兑（Export Confirmation）等等。它是账本中「账户」的一侧；[[BalanceMovement]] 则是「交易」的一侧。每一个 BalanceContract 都恰好对应一种 [[InstrumentType]]、一个生命周期状态 `ContractStatus`，以及（对 LC/Confirmation 类工具而言）一个由宽容度（tolerance）推导出的限额，供 [[Balance Derivation Rules]] 使用。

## ContractStatus

```
ACTIVE | SUPERSEDED | CLOSED | CANCELLED
```

`ACTIVE` 在 Maker 提交（Submit）时即设定（`createContract()`），**早于** Checker 复核放行（Release）——在一次强化修补（`assertRootIssueReleased()`）修补此漏洞之前，一份刚建立、尚未被 Release 的合约在状态上与一份已核准的合约无从区分（参见 Maker-Checker 相关规则）。`CLOSED` 由 A10/进口 或 B6/出口 Close 设定，前提是满足 [[Close Eligibility]] 中的适格性条件——此时合约的风险暴露被冲销为零并予以退休（结案）。`SUPERSEDED`/`CANCELLED` 则涵盖合约层级的替换/撤回路径。

## Root 与 child 合约

一个 BalanceContract 可以是 **root**（例如信用证本身），也可以是针对某个 parent root 建立的 **child**（例如针对某张信用证开立的装运保函、针对一张远期信用证建立的承兑、针对某笔出口保兑建立的 `EPLC_EXAMINATION` 押单待核对（Present-Docs earmark））。多项 Maker/Checker 防护机制正是因这层 parent/child 关系而存在——SG 开立上限、期限一致性检查、以及重复 ISSUE 防护，详见 [[Maker Checker Lifecycle]]。

## 自然键（Natural key）与重复 ISSUE 防护

一个 BalanceContract 是依自然键（实质上是 LC/工具号码 + instrumentType 的组合）查找的。`createMovement()` 的重复 ISSUE 防护机制会在建立型的 `movementType`（例如 `ISSUE`）针对一个已经解析为 ACTIVE 合约的自然键再次尝试建立时，返回 409——藉此防止同一工具被意外重复开立。

## 快照栏位（Snapshot fields）

若干只读的余额数字并非在每次读取时重新计算，而是经由 `assembleSnapshot()` 直接持久化在（或伴随）合约的最新状态上：`eventSnapshot`、`rootEventSnapshot`、`acceptanceEventSnapshot`、`sgEventSnapshot`（各自在该 Event 自身的 Create+Release 时刻冻结，两条写入路径共用同一个组装流程——见 [[Balance Derivation Rules]]），另外还有 `tightAvailableBalance` 以及依工具类型而定的 `offBalanceExposure`/`presentDocsEarmarkPending`/`presentDocsEarmarkApproved`。

## Related knowledge

- [[BalanceMovement]]
- [[InstrumentType]]
- [[Balance Derivation Rules]]
- [[Maker Checker Lifecycle]]
- [[Close Eligibility]]
- [[Business-Rule-Index]]
