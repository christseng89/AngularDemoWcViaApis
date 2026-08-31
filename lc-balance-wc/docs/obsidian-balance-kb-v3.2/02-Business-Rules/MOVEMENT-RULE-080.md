---
knowledge_id: MOVEMENT-RULE-080
title: "A1/B1/A6 三组 (instrumentType, movementType) 组合强制要求 tenorType——TENOR_TYPE_REQUIRED_PAIRS 服务端镜像"
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
  - tenor-type
  - a1
  - b1
  - a6
  - maker-checker
---

# MOVEMENT-RULE-080 — A1/B1/A6 三组 (instrumentType, movementType) 组合强制要求 tenorType——TENOR_TYPE_REQUIRED_PAIRS 服务端镜像

## Status
CONFIRMED

## Business Rule
2026-08-26 用户直接指示（"UI必输栏位 API也是必输栏位 三者一体"）：`assertTenorRequired()` 镜像 Angular 客户端 `builder-fields.ts` 自身的 `required: !!selectedFunction?.tenorTypeOptions?.length` 表达式——即 Tenor Type 选择器实际显示出来的那些功能。以 `${instrumentType}:${movementType}` 组成的复合键精确对应 Angular 客户端**真正会直接提交** Tenor Type 选择器的 3 组组合，存于集合 `TENOR_TYPE_REQUIRED_PAIRS`：

- `IPLC_LC:ISSUE`（A1）
- `EPLC_CONFIRMATION:ISSUE`（B1）
- `IPLC_ACCEPTANCE:CREATE`（A6）

**B4（`EPLC_ACCEPTANCE` 的内部 leg）刻意不在此集合中**——B4 自身的 `EPLC_ACCEPTANCE` 分腿的 tenorType 是服务端从其母层 Confirmation 的 tenorType 自动推导而来，从来不是客户端独立提交的栏位，因此没有对应的「必填」意义。落在集合中的组合，若请求未带 `tenorType`，一律拒绝，不因其余栏位而异。

## Conditions
`TENOR_TYPE_REQUIRED_PAIRS.has(\`${req.instrumentType}:${req.movementType}\`) && !req.tenorType`（createMovement 端）；同一组合键对照已持久化的 `contract.tenorType`（release 端）

## Result
`400 RequestValidationError`："tenorType is required for ${movementType} against ${instrumentType}."

## Example
- `IPLC_LC`／`ISSUE`（A1），未带 `tenorType` → 拒绝："tenorType is required for ISSUE against IPLC_LC."
- `EPLC_CONFIRMATION`／`ISSUE`（B1），未带 `tenorType` → 拒绝。
- `IPLC_ACCEPTANCE`／`CREATE`（A6），未带 `tenorType` → 拒绝。
- `IPLC_ACCEPTANCE`／`HONOUR`（A7，非 CREATE）——不在集合中，不受本规则约束。

## Verification Note
已直接阅读 `balanceService.ts:155-163`（`TENOR_TYPE_REQUIRED_PAIRS` 常量定义与其上方决策脉络说明，明确记载 B4 内部 leg 为何被刻意排除）与第 1564-1573 行 `assertTenorRequired()` 本体（该函式同时也是 [[MOVEMENT-RULE-081]] tenorDays 检查的所在，两条规则共享同一函式但适用范围不同，已分别核实各自的门控条件）。已核对专门测试 `mandatoryFieldRules.test.ts` 中「tenorType/tenorDays mandatory (rule 5)」describe 区块内针对 tenorType 本身的 3 个案例（IPLC_LC/EPLC_CONFIRMATION/IPLC_ACCEPTANCE 各自缺 tenorType）及对应 release() 绕过写库复检案例。已核实 Angular 端 `builder-fields.ts:181` 的镜像表达式与 `submit-rules.ts:127-128` 的 Submit 时兜底守卫。

## Source Evidence

实现:
- `microservices/balance-component/src/service/balanceService.ts:155-163`（`TENOR_TYPE_REQUIRED_PAIRS` 常量定义）
- `microservices/balance-component/src/service/balanceService.ts:1564-1573`（`assertTenorRequired()`，tenorType 检查段）
- `microservices/balance-component/src/service/balanceService.ts:1770-1774`（release() 复检段）
- `src/app/transaction-builder/builder-fields.ts:181`（`required: !!selectedFunction?.tenorTypeOptions?.length`）
- `src/app/transaction-builder/submit-rules.ts:127-128`（Angular 端 Submit 时兜底守卫）

测试:
- `microservices/balance-component/test/unit/service/mandatoryFieldRules.test.ts:218-263`（IPLC_LC/EPLC_CONFIRMATION/IPLC_ACCEPTANCE 三案例）
- `microservices/balance-component/test/unit/service/mandatoryFieldRules.test.ts:305-320`（release() 对 tenorType 绕过写库的复检）
- `src/app/transaction-builder/submit-rules.spec.ts:188`（"Tenor Type is mandatory for A6." 断言）

## Related Knowledge
- [[MOVEMENT-RULE-081]] — tenorDays > 0 要求（同一函式，但仅限 A1 一组）
- [[MOVEMENT-RULE-012]] — Acceptance Tenor 一致性服务端强制校验（A6 相关的姐妹规则）
- [[A1-LC-Issue]]
- [[B1-Confirm-LC]]
- [[A6-Acceptance-Usance]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
