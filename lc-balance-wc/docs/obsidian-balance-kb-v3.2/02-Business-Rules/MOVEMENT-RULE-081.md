---
knowledge_id: MOVEMENT-RULE-081
title: "非 Sight 时 tenorDays 必须 > 0，服务端仅对 IPLC_LC:ISSUE（A1）强制，刻意未扩展至 B1/A6"
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
  - tenor-days
  - a1
---

# MOVEMENT-RULE-081 — 非 Sight 时 tenorDays 必须 > 0，服务端仅对 IPLC_LC:ISSUE（A1）强制，刻意未扩展至 B1/A6

## Status
CONFIRMED

## Business Rule
2026-08-26 用户直接指示（"UI必输栏位 API也是必输栏位 三者一体"）：`assertTenorRequired()` 在完成 [[MOVEMENT-RULE-080]] 的 `tenorType` 必填检查后，额外针对**唯一一组组合** `IPLC_LC:ISSUE`（A1）追加检查：当 `tenorType !== 'SIGHT'` 时，`tenorDays` 必须为大于 0 的数值，否则拒绝。此检查刻意镜像 Angular 客户端 `submit-rules.ts` 自身早已存在、且同样**仅限 `selectedFunction.code === 'A1'`** 的 Submit 时兜底（"Tenor Days must be greater than 0 for Seller's/Buyer's Usance."），以及 `builder-fields.ts` 自身的即时 reactive 表达式（Sight 时归零、Usance 时留给使用者填写）。

**B1（`EPLC_CONFIRMATION:ISSUE`）与 A6（`IPLC_ACCEPTANCE:CREATE`）刻意不受此项 tenorDays 检查约束**——即便两者同样落在 [[MOVEMENT-RULE-080]] 的 `TENOR_TYPE_REQUIRED_PAIRS` 集合中（`tenorType` 本身仍然必填），但服务端并未替 B1/A6 补上等同于 A1 的 `tenorDays > 0` 强制。文件自身的决策脉络说明明确交代原因：B1/A6 目前没有等效的客户端 Submit 时兜底守卫存在，服务端此次修复的定位是「补齐既有客户端规则在服务端的缺口」，而非「发明一条客户端从未真正存在过的新规则」。这与 A1/B1 各自笔记中早已记录的 [[MAKER-CHECKER-RULE-024]]（B1 缺乏对应 Tenor Days 正规化兜底的 CONFLICT）属同一根源问题在服务端的延续，而非新的矛盾——服务端此处选择忠实反映现状（含其不完整之处），而非趁机替 B1 补一条从未经业务确认存在的新规则。

Checker `release()` 端对已持久化的 `contract.tenorType`/`contract.tenorDays` 做同一逻辑复检，同样只在 `pairKey === 'IPLC_LC:ISSUE'` 时才检查 `tenorDays`。

## Conditions
`pairKey === 'IPLC_LC:ISSUE' && req.tenorType !== 'SIGHT' && !(req.tenorDays && req.tenorDays > 0)`（createMovement 端）；同一条件对照 `contract.tenorType`/`contract.tenorDays`（release 端）

## Result
`400 RequestValidationError`："tenorDays must be greater than 0 for ${tenorType}."

## Example
- `IPLC_LC`／`ISSUE`（A1），`tenorType='SELLERS_USANCE'`，未带 `tenorDays`（或 `tenorDays<=0`）→ 拒绝："tenorDays must be greater than 0 for SELLERS_USANCE."
- `IPLC_LC`／`ISSUE`（A1），`tenorType='SIGHT'`，无 `tenorDays`（0 为正确的受保护值，无需填写）→ 通过。
- `EPLC_CONFIRMATION`／`ISSUE`（B1），`tenorType='SELLERS_USANCE'`，未带 `tenorDays` → **仍然通过**（服务端无对应守卫，与客户端现状一致——见 [[MAKER-CHECKER-RULE-024]]）。

## Verification Note
已直接阅读 `balanceService.ts:1554-1563`（`assertTenorRequired()` 上方决策脉络说明，明确交代刻意不扩展到 B1/A6 的理由）与第 1564-1573 行本体第 1571-1572 行的 `pairKey === 'IPLC_LC:ISSUE'` 门控。已核对专门测试 `mandatoryFieldRules.test.ts` 中「rejects IPLC_LC ISSUE with a Usance tenorType but no tenorDays」「passes IPLC_LC ISSUE for Sight with no tenorDays」「B1/A6 have no tenorDays>0 backstop...」三个案例（第 265-303 行），最后一项案例的测试名称本身即直接确认「B1 没有等效于 A1 的 tenorDays>0 兜底，与客户端现状一致（B1 没有对应的 submit-rules.ts 守卫）」——与本条规则声称的范围完全吻合，并核实其对应 release() 复检案例（第 342-357 行）。已核实 Angular 端 `submit-rules.ts:132-137`（`if (selectedFunction?.code === 'A1')` 门控，同样只检查 A1）。

## Source Evidence

实现:
- `microservices/balance-component/src/service/balanceService.ts:1554-1573`（`assertTenorRequired()` 全体，含决策脉络说明与 `pairKey === 'IPLC_LC:ISSUE'` 门控）
- `microservices/balance-component/src/service/balanceService.ts:1775-1776`（release() 复检段）
- `src/app/transaction-builder/submit-rules.ts:130-137`（Angular 端镜像：`if (selectedFunction?.code === 'A1')` 门控）

测试:
- `microservices/balance-component/test/unit/service/mandatoryFieldRules.test.ts:265-278`（"rejects IPLC_LC ISSUE with a Usance tenorType but no tenorDays"）
- `microservices/balance-component/test/unit/service/mandatoryFieldRules.test.ts:280-283`（"passes IPLC_LC ISSUE for Sight with no tenorDays at all"）
- `microservices/balance-component/test/unit/service/mandatoryFieldRules.test.ts:285-303`（"B1/A6 have no tenorDays>0 backstop..."）
- `microservices/balance-component/test/unit/service/mandatoryFieldRules.test.ts:322-341`（release() 对 tenorDays 绕过写库的复检）
- `src/app/transaction-builder/submit-rules.spec.ts:217`（"Tenor Days must be greater than 0 for Seller's/Buyer's Usance." 断言）

## Related Knowledge
- [[MOVEMENT-RULE-080]] — tenorType 按 (instrumentType, movementType) 组合必填（同一函式的第一段检查）
- [[MAKER-CHECKER-RULE-024]] — B1 缺乏 A1 等效的 Tenor Days 正规化兜底（CONFLICT，同一根源问题的客户端表现）
- [[A1-LC-Issue]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
