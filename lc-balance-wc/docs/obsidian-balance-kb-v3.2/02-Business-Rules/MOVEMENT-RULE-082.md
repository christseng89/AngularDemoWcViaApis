---
knowledge_id: MOVEMENT-RULE-082
title: "货币一致性现由服务端强制校验——currency 与已解析合约（或新建子合约的父合约）自身货币不一致时抛出 CurrencyMismatchError"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-26
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-082 — 货币一致性现由服务端强制校验——currency 与已解析合约（或新建子合约的父合约）自身货币不一致时抛出 CurrencyMismatchError

## Status
CONFIRMED

## Business Rule
一份 Logical Contract 的 `currency` 在 ISSUE 时即固定，此后其自身及其名下任何 movement 的生命周期内都不再改变。`currency` 本身仍是请求体的必填字段（未采纳、且已撤回的 OAS-GAP-16“派生/省略”设计——调用方依旧必须自行提供 `currency`），本次新增的只是对该值的一致性校验，在 `resolveOrCreateContract()`（`service/balanceService.ts`）中新增两处守卫：(1) 当请求依 `balanceContractId` 或 `naturalKey` 解析到一份*已存在*的合约时，若调用方提供的 `currency` 与该合约自身存储的 `currency` 不一致，抛出 `CurrencyMismatchError`；(2) 当请求携带 `parentLogicalContractId`、正在为其创建一个*新的子合约*（如 A6/A7 Acceptance、A8 SG Issue、B3 Present Docs）时，若调用方提供的 `currency` 与该父合约自身的 `currency` 不一致，同样抛出 `CurrencyMismatchError`。一笔真正全新的根级 Logical Contract（既未解析到已存在合约，也没有 `parentLogicalContractId`）不受此限制——其 `currency` 就是新合约本身即将采用的值。

## Conditions
(1) `contract` 已通过 `balanceContractId`/`naturalKey` 解析成功，且 `req.currency !== contract.currency`；或
(2) `req.parentLogicalContractId` 已解析出一个 ACTIVE 的父合约，且 `req.currency !== parentForIssueCheck.currency`。

## Result
抛出 `CurrencyMismatchError`（HTTP 409，`code: 'CURRENCY_MISMATCH'`），不创建/不修改任何 movement 或 contract。

## Example
情形 (1)：一份 IPLC_LC 以 `currency: 'USD'` ISSUE 并 RELEASE 后，对同一 `balanceContractId` 提交 `movementType: 'AMEND_INCREASE'` 且 `currency: 'EUR'` -> 409 `CURRENCY_MISMATCH`；改为 `currency: 'USD'` 则正常创建。情形 (2)：该 USD 的 IPLC_LC 名下发起一笔 SHGT ISSUE（`parentLogicalContractId` 指向该 LC）且 `currency: 'GBP'` -> 409 `CURRENCY_MISMATCH`；改为 `currency: 'USD'`（与父 LC 一致）则正常创建。

## Verification Note
已直接阅读 `errors.ts` 中 `CurrencyMismatchError` 的定义与其上方文档注释，以及 `resolveOrCreateContract()` 中两处守卫的完整实现（含各自的错误消息文本），并核对了覆盖两种情形（已存在合约不一致/一致、新建子合约与父合约不一致/一致，各两个用例共四个测试）的单元测试。与本条目描述完全一致。

## Source Evidence

实现:
- `microservices/balance-component/src/errors.ts:57-68 (CurrencyMismatchError 定义与文档注释)`
- `microservices/balance-component/src/service/balanceService.ts:1349-1360 (已存在合约的一致性守卫)`
- `microservices/balance-component/src/service/balanceService.ts:1371-1385 (新建子合约与父合约的一致性守卫)`

测试:
- `microservices/balance-component/test/unit/service/balanceService.test.ts:114-243 (describe('BalanceService.createMovement — currency consistency (CurrencyMismatchError)')，四个用例：已存在合约不一致/一致、新建子合约与父合约不一致/一致)`

## Related Knowledge
- [[BalanceContract]]
- currency-carry-and-protect-rule
- resolveorcreatecontract-contract-resolution-creation-preamble
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
