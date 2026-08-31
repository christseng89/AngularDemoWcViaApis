---
knowledge_id: MOVEMENT-RULE-078
title: "按 instrumentType 强制要求 naturalKey.ibNumber 或 sgNumber——NATURAL_KEY_FIELDS_BY_INSTRUMENT 服务端镜像表"
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
  - natural-key
  - maker-checker
---

# MOVEMENT-RULE-078 — 按 instrumentType 强制要求 naturalKey.ibNumber 或 sgNumber——NATURAL_KEY_FIELDS_BY_INSTRUMENT 服务端镜像表

## Status
CONFIRMED

## Business Rule
2026-08-26 用户直接指示（"UI必输栏位 API也是必输栏位 三者一体"）：在 [[MOVEMENT-RULE-077]]「`lcNumber` 无条件必填」的基础上，`assertNaturalKeyFieldsRequired()` 接着依 `req.instrumentType` 查表 `NATURAL_KEY_FIELDS_BY_INSTRUMENT`，逐一要求表中列出的额外自然键栏位非空。此表是 Angular 客户端自身 `NATURAL_KEY_FIELDS_BY_INSTRUMENT`（`balance-component.model.ts`，`requiredNaturalKeyFields()` 读取）的服务端镜像，两处各自独立维护但内容必须一致：

| instrumentType | 额外必填栏位 |
|---|---|
| `IPLC_LC` / `EPLC_LC` / `EPLC_CONFIRMATION` | 无（仅 `lcNumber`） |
| `SHGT` | `sgNumber` |
| `IPLC_ACCEPTANCE` / `EPLC_ACCEPTANCE` / `EPLC_DUE_FROM_ISSUING_BANK` / `EPLC_ACCEPTANCE_REIMB_RECEIVABLE` / `EPLC_EXPORT_BILLS_DISCOUNTED` / `EPLC_EXAMINATION` | `ibNumber` |

同样只在该 movementType 属于「创设型」（`isCreating`）且请求带有 `naturalKey` 时才触发；已存在合约、经 `balanceContractId` 定位的请求不受影响。IB Number 属 Maker 自由输入栏位，即使 LC Number 是经 Parent 选取器带入（如 A6/B4/A8），IB/SG Number 也绝不会跟着从 Parent 自动带入——这是既有规则（[[MAKER-CHECKER-RULE-019]]）已确立的行为，本规则只是把「必填」这一约束从纯前端补强到服务端。

Checker `release()` 端同样对**已持久化在合约上**的 `contract.naturalKey[field]` 做一次性复检（依 `contract.instrumentType` 查同一张表），触发条件与 [[MOVEMENT-RULE-077]] 的 release() 复检完全相同——仅在该合约的创设 movementType 自己被 Release 时执行一次，非每次其他 movementType 的 release() 都重复检查。

## Conditions
`this.movementTypeRegistry[req.movementType]?.isCreating === true && req.naturalKey` 存在，且对 `NATURAL_KEY_FIELDS_BY_INSTRUMENT[req.instrumentType]` 中任一栏位 `field`，`!req.naturalKey[field]`

## Result
`400 RequestValidationError`："naturalKey.${field} is required for ${movementType} against ${instrumentType}."（`field` 为 `ibNumber` 或 `sgNumber`）

## Example
- `SHGT`／`ISSUE`（A8），`naturalKey: { lcNumber: 'LC001' }`（未带 `sgNumber`）→ 拒绝："naturalKey.sgNumber is required for ISSUE against SHGT."
- `IPLC_ACCEPTANCE`／`CREATE`（A6），未带 `ibNumber` → 拒绝："naturalKey.ibNumber is required for CREATE against IPLC_ACCEPTANCE."
- `IPLC_LC`／`ISSUE`（A1）——表中无额外栏位，只要 `lcNumber` 非空即通过，无需 `ibNumber`/`sgNumber`。

## Verification Note
已直接阅读 `balanceService.ts:115-135`（`NATURAL_KEY_FIELDS_BY_INSTRUMENT` 常量定义与其上方决策脉络说明，逐一核对 10 个 instrumentType 各自的映射）与第 1536-1541 行的查表迭代逻辑；已完整核对专门测试 `mandatoryFieldRules.test.ts` 中 SHGT／IPLC_ACCEPTANCE 两个具体案例（第 49-77 行）及对应的 release() 绕过复检案例（第 122-141 行）。已核实 Angular 端 `submit-rules.ts:113,124-125` 的镜像守卫（SG Number／IB Number 各自独立判断式）。

## Source Evidence

实现:
- `microservices/balance-component/src/service/balanceService.ts:115-135`（`NATURAL_KEY_FIELDS_BY_INSTRUMENT` 常量定义）
- `microservices/balance-component/src/service/balanceService.ts:1524-1543`（`assertNaturalKeyFieldsRequired()`，含查表迭代于第 1536-1541 行）
- `microservices/balance-component/src/service/balanceService.ts:1765-1769`（release() 复检段）
- `src/app/transaction-builder/submit-rules.ts:113,124-125`（Angular 端镜像：SG Number／IB Number）

测试:
- `microservices/balance-component/test/unit/service/mandatoryFieldRules.test.ts:49-64`（SHGT 缺 sgNumber）
- `microservices/balance-component/test/unit/service/mandatoryFieldRules.test.ts:66-79`（IPLC_ACCEPTANCE 缺 ibNumber）
- `microservices/balance-component/test/unit/service/mandatoryFieldRules.test.ts:122-141`（release() 对 ibNumber 绕过写库的复检）
- `src/app/transaction-builder/submit-rules.spec.ts:128`（"SG Number is mandatory when issuing a Shipping Guarantee." 断言）
- `src/app/transaction-builder/submit-rules.spec.ts:169`（"IB Number is mandatory." 断言）

## Related Knowledge
- [[MOVEMENT-RULE-077]] — naturalKey.lcNumber 无条件必填（同一函式的第一段检查）
- [[MAKER-CHECKER-RULE-019]] — 自然键解析依功能形态而异（IB/SG Number 从不随 Parent 自动带入）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
