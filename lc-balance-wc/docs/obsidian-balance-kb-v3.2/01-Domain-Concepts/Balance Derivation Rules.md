---
knowledge_id: Balance-Derivation-Rules
title: "Balance Derivation Rules"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
  - derivation
---

# Balance Derivation Rules

`domain/balanceDerivation.ts` 回答了所有其他模块都依赖的问题：**给定一份针对某合约的异动（movement）清单，其当前余额是多少？** 由此衍生出四个数字，各自代表不同含义：

## Confirmed Balance（已确认余额）

每一笔状态为 **RELEASED** 的异动在限额（ceiling）层面上的影响之和，依 `MOVEMENT_DIRECTION`（见下文）取正负号加总。这是「真实、已核准」的风险暴露——尚处 PENDING 状态的异动永远不计入其中。

## Available Balance（可用余额）

`Confirmed Balance ± Σ PENDING 异动`（呈增加型态的 PENDING 异动并不会提高该数值——详见下文的 Tight Available 说明——但呈减少型态的 PENDING 异动会立即占用额度：「增加从严，占用从宽」）。这是三个限额数字中最宽松的一个。

## Tight Available Balance（严格可用余额）

由 **Confirmed Balance** 而非 Available Balance 推导而来——业务规则为：「只有 APPROVED 才可以动用」。仍处 PENDING 状态的增加型异动（ISSUE/AMEND_INCREASE/B1/B2-Increase）在真正被 Release 之前**不会**提高 Tight 数值；而仍处 PENDING 状态的减少型异动则会经由 `computePendingDecreaseTotal()` 立即占用额度，与 Available Balance 相同的不对称从严逻辑。对于 LC/Confirmation 类型的工具，Tight Available 还会额外扣抵尚未结清的表外风险暴露（`IPLC_LC`/`EPLC_LC` 对应 SHGT，`EPLC_CONFIRMATION` 对应 Present Docs Earmark）——详见 [[Off-Balance-Sheet Exposure]]。这是每一次实际的充足性检查（`checkUtilizeSufficiency`/`checkShgtIssueSufficiency`/`checkPresentDocsIssueSufficiency`/`checkAmendDecreaseSufficiency`）真正比对的基准数字。

## Face Amount（面额）

与上述限额数字**各自独立**追踪——取自原始 ISSUE 的原始 `amount`，而非经宽容度（tolerance）换算后的 `ceilingAmount`（见 [[Tolerance Processing]]）。Face Amount 回答的是「这张信用证/工具名义上载明的金额是多少」，而 Confirmed/Available/Tight Available 回答的则是「当前实际可动用的额度还剩多少」。

## MOVEMENT_DIRECTION

一张按工具类型区分的对照表，将每个 `movementType` 在限额层面映射为 `+1`（增加型态）或 `−1`（减少型态）——仅适用于 RELEASED 状态。这张表，加上宽容度换算与 [[Off-Balance-Sheet Exposure]] 中的扣抵规则，正是 [[Business-Rule-Index|BALANCE-RULE]] 条目引用作为证据的依据。`resolveSnapshotWriteTarget()`/`captureSnapshotBundle()`（属于 BAL-141 registry 重构的一部分）会针对每一笔异动，决定该合约多个持久化快照栏位（`eventSnapshot`/`rootEventSnapshot`/`acceptanceEventSnapshot`/`sgEventSnapshot`）中哪一个应在 Create+Release 时经由同一个共用的 `assembleSnapshot()` 调用写入。

## Related knowledge

- [[BalanceContract]]
- [[BalanceMovement]]
- [[Tolerance Processing]]
- [[Off-Balance-Sheet Exposure]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
