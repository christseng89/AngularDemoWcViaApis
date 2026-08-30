---
knowledge_id: MOVEMENT-RULE-075
title: "A1/B1 ISSUE 的 Expiry Date 由选填改为强制必填（三层防线：Angular 表单/Submit 守卫/服务端 assertExpiryDateRequired）"
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
  - expiry-date
  - a1
  - b1
---

# MOVEMENT-RULE-075 — A1/B1 ISSUE 的 Expiry Date 由选填改为强制必填（三层防线：Angular 表单/Submit 守卫/服务端 assertExpiryDateRequired）

## Status
CONFIRMED

## Business Rule
2026-08-26 用户直接指示（"A1 B1 Expiry Date 是必输栏位... 不然AUTO EXPIRY无法处理"）：对根层 instrumentType（`IPLC_LC`/`EPLC_LC`/`EPLC_CONFIRMATION`）执行 `ISSUE`（即 A1/B1）时，Expiry Date（UCP 600 Art.6(d)）从原本的选填栏位改为强制必填。动机是 AUTO EXPIRY 批次扫描（`runAutoExpirySweep()`）只会挑选 `expiry_date IS NOT NULL` 的 ACTIVE 合约作为候选——若允许 ISSUE 时不填，该合约将永远无法被自动到期扫描处理。三层各自独立实现，互为镜像但不共享代码（Angular app 与微服务是两个独立部署单元）：
1. **Angular 即时表单层**（`builder-fields.ts:145`）：`expiryDate` 栏位的 `required` 绑定到 `showsExpiryDateInput`（`selectedFunction?.code === 'A1' || selectedFunction?.code === 'B1'`），且仅在 A1/B1 时才 `!hide` 显示该栏位。
2. **Angular Submit 时兜底守卫**（`submit-rules.ts:82-84`）：`validateSubmit()` 中若 `selectedFunction.code` 为 A1 或 B1 且 `model.expiryDate` 为空，直接 `fail('Expiry Date is mandatory for ${code}.')`，阻止提交（因为 `submit()` 本身不依赖 `form.valid` 把关，需要独立的运行时兜底）。
3. **服务端权威校验**（`BalanceService.assertExpiryDateRequired()`）：`req.movementType === 'ISSUE' && ROOT_INSTRUMENT_TYPES.has(req.instrumentType) && !req.expiryDate` 时抛出 400 `RequestValidationError`。此为唯一真正具强制力的一层，在 `createMovement()` 中于 `resolveOrCreateContract()`（会建立合约）**之前**执行，避免留下没有 Expiry Date 的孤儿合约。

范围严格限定于「对根层 instrumentType 执行 ISSUE」——非根层的子合约（如 SHGT/Acceptance）即使调用端传入了 `expiryDate`，`createContract()` 也会无条件将其归零（`expiryDate: isRoot ? (req.expiryDate ?? null) : null`），故对子合约完全没有校验的意义，`assertExpiryDateRequired()` 也不检查它们。

**一个值得留意的非对称之处**：与本次一并新增的另外 4 条必填规则（naturalKey.lcNumber/ibNumber/sgNumber、sourceTransactionRef、tenorType/tenorDays——见 [[MOVEMENT-RULE-077]] 至 [[MOVEMENT-RULE-081]]）不同，`release()`（Checker）**没有**对「Expiry Date 是否存在」做独立的纵深防御复检——它只在 `contract.expiryDate` 为真值时才去检查其是否为营业日（见 [[MOVEMENT-RULE-076]]），若该值经由绕过 `createMovement()` 的路径（例如直接写库）被清空为 `null`/空字串，`release()` 的这段 `if (movement.movementType === 'ISSUE' && contract.expiryDate)` 判断式会直接跳过，Release 仍会成功。其余 4 条规则的 release() 复检都是「只要是创设型 movementType 就无条件检查该字段是否存在」，而本规则的 release() 复检是「只有该字段已存在时才检查其内容合法性」——两种复检姿态不同。这不影响 Maker 端 `createMovement()` 本身的强制力，但构成 release() 侧纵深防御覆盖面上的一个真实缺口，予以如实记录。

## Conditions
`req.movementType === 'ISSUE' && ROOT_INSTRUMENT_TYPES.has(req.instrumentType) && !req.expiryDate`（`ROOT_INSTRUMENT_TYPES = {IPLC_LC, EPLC_LC, EPLC_CONFIRMATION}`）

## Result
`createMovement()` 抛出 `400 RequestValidationError`："expiryDate is required for ISSUE against ${instrumentType}."；Angular 端在 Submit 前已先行阻挡，错误文案为 "Expiry Date is mandatory for A1."／"...for B1."

## Example
- `IPLC_LC` / `ISSUE`（A1）请求未带 `expiryDate` → 服务端拒绝，"expiryDate is required for ISSUE against IPLC_LC."（`autoExpirySweep.test.ts` "omitted expiryDate is rejected at ISSUE for a root instrumentType"）。
- `EPLC_CONFIRMATION` / `ISSUE`（B1）同理会被拒绝。
- `SHGT` / `ISSUE`（A8，子合约）即使带 `expiryDate` 也不受此规则约束（该栏位对子合约本就结构性无效）。

## Verification Note
已直接阅读 `balanceService.ts:1494-1507`（`assertExpiryDateRequired()` 本体与其上方的完整决策脉络说明）及其在 `createMovement()` 中的调用顺序（先于 `resolveOrCreateContract()`）；已核实 `ROOT_INSTRUMENT_TYPES`（`balanceService.ts:114`）与 `createContract()` 对非根层强制清空 `expiryDate` 的逻辑（`balanceService.ts:2285`，`expiryDate: isRoot ? (req.expiryDate ?? null) : null`）。已核实 Angular 端 `builder-fields.ts:74-75,143-146`（`showsExpiryDateInput` 门控）与 `submit-rules.ts:79-84`。release() 内未见对应「必填性」复检，已核实 `balanceService.ts:1779-1786` 该段判断式的确以 `contract.expiryDate` 为真值门控——上方「一个值得留意的非对称之处」已如实记录此缺口，非猜测。

## Source Evidence

实现:
- `microservices/balance-component/src/service/balanceService.ts:1494-1507`（`assertExpiryDateRequired()`）
- `microservices/balance-component/src/service/balanceService.ts:1587-1588`（`createMovement()` 内的调用顺序）
- `microservices/balance-component/src/service/balanceService.ts:1779-1786`（release() 对 Expiry Date 的复检范围，仅业务日合法性，非必填性）
- `src/app/transaction-builder/builder-fields.ts:74-75,143-146`（`showsExpiryDateInput`／`required`）
- `src/app/transaction-builder/submit-rules.ts:79-84`（Submit 时兜底守卫）

测试:
- `microservices/balance-component/test/unit/service/autoExpirySweep.test.ts:52-58`（"omitted expiryDate is rejected at ISSUE for a root instrumentType"）
- `src/app/transaction-builder/builder-fields.spec.ts:265-274`（"expiryDate is shown and mandatory only for A1/B1..."）
- `src/app/transaction-builder/submit-rules.spec.ts:693,713`（A1/B1 各自的 "Expiry Date is mandatory for ..." 断言）

## Related Knowledge
- [[MOVEMENT-RULE-076]] — Expiry Date 必须是真实本国营业日（同一 Maker+Checker 校验点的下一步检查）
- [[A1-LC-Issue]]
- [[B1-Confirm-LC]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
