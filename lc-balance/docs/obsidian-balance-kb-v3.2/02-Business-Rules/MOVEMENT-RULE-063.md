---
knowledge_id: MOVEMENT-RULE-063
title: "EXPIRE（AUTO EXPIRY）资格判定刻意不比照 CLOSE 的 SG/Acceptance 余额归零条件"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-26
tags:
  - balance
  - movement
  - f1
  - confirmed
---

# MOVEMENT-RULE-063 — EXPIRE（AUTO EXPIRY）资格判定刻意不比照 CLOSE 的 SG/Acceptance 余额归零条件

## Status
CONFIRMED

## Business Rule
F1（external BA review，`analysis/Balance-Component-F1-Expire-Proposal-zh.md` §7.2）新增的 `EXPIRE` movementType（IPLC_LC/EPLC_LC/EPLC_CONFIRMATION 专用，仅由背景批次 AUTO EXPIRY 触发，从未有人工 UI 入口）拥有自己独立的资格判定函式 `evaluateExpiryEligibility()`（`domain/expiryEligibility.ts`），刻意**不**复用 A10/B6 CLOSE 专用的 `evaluateCloseEligibility()`。两者共享同一个 `hasOpenEvents`（整棵事件树无未结事件）并发安全检查，但 CLOSE 额外要求 SG Confirmed Balance = 0 且 Acceptance Confirmed Balance = 0，EXPIRE 则完全没有这两个条件——一笔仍有未清偿 SG 或 Acceptance 余额的 LC/Confirmation，只要状态仍是 ACTIVE 且事件树无未结事件，到期后依然必须自动到期，不能因为业务上还有未了结的子曝险就被挡下。`domain/expiryEligibility.ts` 自身的顶部文件注解明确指出：套用 CLOSE 的条件会让 EXPIRE 在「LC 已过期但仍有未清偿 SG 或 Acceptance」这个最需要它触发的情境下反而无法触发。

## Conditions
`movementType === 'EXPIRE'`（`domain/expiryEligibility.ts` 的 `evaluateExpiryEligibility()`，`microservices/balance-component/src/service/balanceService.ts` 内 `expireShaped` 校验分支）

## Result
资格判定只检查两项：合约当前状态是否为 `ACTIVE`（非 ACTIVE 一律拒绝，错误讯息回显目前实际状态）、整棵事件树是否无未结事件；不检查 SG/Acceptance 余额是否归零，即使两者皆非零也不阻挡 EXPIRE。

## Example
一笔 IPLC_LC 于 `EXPIRE-001` 已发行一笔金额 3000 的 SHGT（SG Confirmed Balance = 3000，非零），LC 本身状态仍是 ACTIVE、到期日已过 + 邮递缓冲天数（mailFloatGraceDays）、且事件树无未结事件 —— AUTO EXPIRY 依然正常触发，将 LC 自身的 Confirmed Balance 沖销为 0、状态转为 `EXPIRED`，完全不受这笔仍未清偿的 SG 影响（对照：同一情境下若改用 A10 CLOSE，会被拒绝 `409 INSUFFICIENT_AVAILABLE_BALANCE`，要求先用 A9 赎回 SG）。

## Verification Note
已直接阅读 `domain/expiryEligibility.ts` 全文（56 行）及其与 `domain/closeEligibility.ts` 的对照说明；已直接阅读 `microservices/balance-component/src/service/balanceService.ts` 内 `expireShaped`（第 368-388 行）与 `evaluateContractExpiryEligibility()`（第 730-734 行），确认其未读取 `sgConfirmedBalance`/`acceptanceConfirmedBalance` 中任一值。已由专属单元测试直接核实：`test/unit/domain/expiryEligibility.test.ts:30`（"has no SG/Acceptance-balance condition — an ACTIVE contract with no open Events is eligible regardless of any outstanding child balance"）与 `test/unit/service/autoExpirySweep.test.ts:82-116`（"happy path... REGARDLESS of outstanding SG/Acceptance (BA §7.2)"，测试内明确先发行一笔 3000 的 SHGT 再验证 EXPIRE 仍正常通过）。

## Source Evidence

实现:
- `microservices/balance-component/src/domain/expiryEligibility.ts:1-34`
- `microservices/balance-component/src/service/balanceService.ts:368-388` (expireShaped)
- `microservices/balance-component/src/service/balanceService.ts:730-734` (evaluateContractExpiryEligibility)

测试:
- `microservices/balance-component/test/unit/domain/expiryEligibility.test.ts:30-35`
- `microservices/balance-component/test/unit/service/autoExpirySweep.test.ts:82-116`

## Related Knowledge
- [[STATUS-RULE-004]]
- [[STATUS-RULE-031]]
- [[A11-LC-Reopen]]
- [[B7-Confirmed-LC-Reopen]]
- [[auto-expiry-auto-close-background-sweep-and-grace-period]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
