---
knowledge_id: MOVEMENT-RULE-079
title: "指定 movementType 强制要求 sourceTransactionRef——SECONDARY_REF_REQUIRED_MOVEMENT_TYPES 服务端镜像表"
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
  - source-transaction-ref
  - maker-checker
---

# MOVEMENT-RULE-079 — 指定 movementType 强制要求 sourceTransactionRef——SECONDARY_REF_REQUIRED_MOVEMENT_TYPES 服务端镜像表

## Status
CONFIRMED

## Business Rule
2026-08-26 用户直接指示（"UI必输栏位 API也是必输栏位 三者一体... API包括 MAKER CHECKER"）：`assertSecondaryRefRequired()` 镜像 Angular 客户端 `submit-rules.ts` 自身的 `ctx.dynamicSecondaryRefLabel && !model.secondaryRef` 守卫（提交时字段名为 `secondaryRef`，送上线时序列化为 `sourceTransactionRef`）。凡 `req.movementType` 落在集合 `SECONDARY_REF_REQUIRED_MOVEMENT_TYPES` 中，且 `req.sourceTransactionRef` 缺失，服务端一律拒绝。该集合精确对应 Angular 端每个 `TransactionFunction` 自身设有 `secondaryRefLabel` 的那些功能：

- `AMEND_INCREASE` / `AMEND_DECREASE`（A2／对应 Amendment No.）
- `AMEND`（B2）
- `AMEND_EXPIRY_DATE`（B2 自身的第三种选项，F1 新增的 Expiry Date 修改路径）
- `UTILIZE`（A3／A3S，对应 IB/EB Number）
- `HONOUR`（B4，对应 IB/EB Number）
- `ACCEPT`

**刻意不是**每一个「可以携带 `sourceTransactionRef`」的 movementType 都被列入此集合——`ISSUE`/`CREATE`/`PARTIAL_REDEEM`/`FULL_REDEEM`/`PARTIAL_SETTLE`/`FULL_SETTLE`/`CLOSE`/`EXPIRE`/`REOPEN`/`REVERSAL` 都用各自不同的方式解析身份（自然键栏位、LC+IB/SG 两栏位搜寻、或 `reasonCode`），在本次修复前后都维持 `sourceTransactionRef` 选填，未被纳入此集合。

Checker `release()` 端同样对**已持久化的 `movement.sourceTransactionRef`** 做复检——注意这里复检的对象与 [[MOVEMENT-RULE-077]]／[[MOVEMENT-RULE-078]]／[[MOVEMENT-RULE-080]] 三条规则不同：那三条复检的是「合约」层面的字段（`contract.naturalKey`/`contract.tenorType`，因创设当下即固定不再变动），而本规则复检的是「movement」本身的字段（`movement.sourceTransactionRef`）——因为 `sourceTransactionRef` 是逐笔 movement 各自携带的栏位，非合约层级的固定属性，且并非仅限于「创设型」movementType 才检查（`AMEND_INCREASE`/`UTILIZE`/`HONOUR` 等本身都不是创设型 movementType，但仍各自需要这项复检）。

## Conditions
`SECONDARY_REF_REQUIRED_MOVEMENT_TYPES.has(req.movementType) && !req.sourceTransactionRef`（createMovement 端）；`SECONDARY_REF_REQUIRED_MOVEMENT_TYPES.has(movement.movementType) && !movement.sourceTransactionRef`（release 端，对照已持久化 movement）

## Result
`400 RequestValidationError`："sourceTransactionRef is required for ${movementType}."

## Example
- `IPLC_LC`／`AMEND_INCREASE`（A2），未带 `sourceTransactionRef` → 拒绝。
- `EPLC_CONFIRMATION`／`AMEND`（B2），未带 `sourceTransactionRef` → 拒绝。
- `IPLC_LC`／`ISSUE`（A1）——不在此集合中，`sourceTransactionRef` 维持选填。
- 一笔已建立的 `AMEND_INCREASE` movement 经直接写库产生（未走 `createMovement()`）并缺失 `sourceTransactionRef`，Checker 对其 `release()` 时同样拒绝。

## Verification Note
已直接阅读 `balanceService.ts:137-153`（`SECONDARY_REF_REQUIRED_MOVEMENT_TYPES` 常量定义与其上方决策脉络说明，逐一核对集合内 7 个 movementType 及未列入集合的对照清单）与第 1550-1554 行的 `assertSecondaryRefRequired()` 本体；已完整核对专门测试 `mandatoryFieldRules.test.ts` 中「sourceTransactionRef mandatory (rule 4)」describe 区块的全部 5 个案例，含 `test.each` 参数化覆盖 AMEND_INCREASE/AMEND_DECREASE/UTILIZE 三种、AMEND（B2）单独案例、「不适用于 ISSUE/CLOSE/REOPEN/EXPIRE」的反向案例，以及针对 movement 本身（非合约）做直接写库绕过的 release() 复检案例。已核实 Angular 端 `submit-rules.ts:110-111` 的镜像守卫。

## Source Evidence

实现:
- `microservices/balance-component/src/service/balanceService.ts:137-153`（`SECONDARY_REF_REQUIRED_MOVEMENT_TYPES` 常量定义）
- `microservices/balance-component/src/service/balanceService.ts:1550-1554`（`assertSecondaryRefRequired()`）
- `microservices/balance-component/src/service/balanceService.ts:1752-1754`（release() 复检段，对照 movement 本身而非合约）
- `src/app/transaction-builder/submit-rules.ts:110-111`（Angular 端镜像）

测试:
- `microservices/balance-component/test/unit/service/mandatoryFieldRules.test.ts:143-215`（"sourceTransactionRef mandatory (rule 4)" 全部案例）
- `src/app/transaction-builder/submit-rules.spec.ts:121`（"Amendment No. is mandatory for A1." 断言，供对照 `dynamicSecondaryRefLabel` 依功能而异的标签文案）

## Related Knowledge
- [[MOVEMENT-RULE-077]] — naturalKey.lcNumber 无条件必填（同批次姐妹规则，复检对象为合约而非 movement）
- [[MOVEMENT-RULE-080]] — tenorType 按 (instrumentType, movementType) 组合必填
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
