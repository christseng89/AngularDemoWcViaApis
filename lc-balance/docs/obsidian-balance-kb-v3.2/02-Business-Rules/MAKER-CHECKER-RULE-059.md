---
knowledge_id: MAKER-CHECKER-RULE-059
title: "CLOSE／REOPEN 的人工 Maker Submit 強制要求 reasonCode（400 拒絕空值），AUTO CLOSE 以固定內部值 NATURAL_EXPIRY_ALL_BALANCES_CLEARED 滿足此要求"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-26
tags:
  - balance
  - maker-checker
  - f1
  - confirmed
---

# MAKER-CHECKER-RULE-059 — CLOSE／REOPEN 的人工 Maker Submit 強制要求 reasonCode（400 拒絕空值），AUTO CLOSE 以固定內部值 NATURAL_EXPIRY_ALL_BALANCES_CLEARED 滿足此要求

## Status
CONFIRMED

## Business Rule
F1 proposal §13.1 item 4（CLOSE）／item 3(a)（REOPEN），BA-ratified 2026-08-25：`assertReasonCodeRequired()` 要求 `movementType` 為 `CLOSE` 或 `REOPEN` 時，`reasonCode` 不得為空（`null`/`undefined`/空字串），否則拋 `RequestValidationError`（400）。此檢查在 `createMovement()` 一開始就執行（先於合約解析），對人工 A10/B6/A11/B7 一視同仁。AUTO CLOSE（`processSweepCandidate()` 呼叫）**不是**被排除在此檢查之外，而是**主動滿足**它——固定傳入 `config.ts` 的 `AUTO_CLOSE_REASON_CODE = 'NATURAL_EXPIRY_ALL_BALANCES_CLEARED'`（`runAutoCloseSweep()` 呼叫 `processSweepCandidate()` 時的第五個參數）。AUTO EXPIRY 產生的 `EXPIRE` movement 則不受此檢查約束——`reasonCode` 對 `EXPIRE` 仍是選填／被動傳遞，未強制要求（規則僅覆蓋 `CLOSE`/`REOPEN` 兩者）。

Angular 端有對應的鏡像檢查：`submit-rules.ts` 的 `(selectedFunction?.requiresCloseEligibility || selectedFunction?.requiresReopenEligibility) && !model.reasonCode` 會在 Submit 前於前端擋下（顯示「Reason Code is mandatory for {code}」），`builder-fields.ts` 的 `reasonCode` 欄位僅在 `requiresReasonCode`（即 A10/B6/A11/B7 四者）時顯示且標記必填——AUTO CLOSE 因為從不經過這個 UI 入口，不需要任何前端豁免。

## Conditions
`movementType` 為 `CLOSE` 或 `REOPEN`（`service/balanceService.ts` 的 `assertReasonCodeRequired()`，於 `createMovement()` 一開始即呼叫）

## Result
`reasonCode` 為空 → 拒絕（400，訊息符合 `reasonCode is required for {movementType}`）；AUTO CLOSE 一律附帶固定值 `NATURAL_EXPIRY_ALL_BALANCES_CLEARED`，永遠通過此檢查；人工 A10/B6/A11/B7 必須自行提供有意義的 `reasonCode`。

## Example
人工 Maker 提交 A11 REOPEN 但未填寫 Reason Code → Angular 前端先攔下（「Reason Code is mandatory for A11」）；即使繞過前端直接呼叫 API，微服務端 `assertReasonCodeRequired()` 一樣會以 400 拒絕。AUTO CLOSE 對一筆已通過所有資格與 Grace Period 檢查的 EXPIRED 合約發起 CLOSE，`reasonCode` 固定為 `'NATURAL_EXPIRY_ALL_BALANCES_CLEARED'`，正常通過並被建立與釋放。

## Verification Note
已直接阅读 `service/balanceService.ts` 的 `assertReasonCodeRequired()`（第 1488-1492 行）與其呼叫點（`createMovement()` 開頭，緊接在 `assertValidAmount()` 之後）；已直接阅读 `config.ts` 的 `AUTO_CLOSE_REASON_CODE` 常數與文件註解；已直接阅读 `service/balanceService.ts` 的 `runAutoCloseSweep()`（第 858 行，`AUTO_CLOSE_REASON_CODE` 作為第五參數傳入 `processSweepCandidate()`）。已直接阅读 Angular 端 `submit-rules.ts` 第 71-78 行、`builder-fields.ts` 第 71、148-158 行。已由 `test/unit/service/expiryExtensionAndReopen.test.ts:455-491`（REOPEN 缺 reasonCode 拒絕）與 `test/unit/service/mandatoryFieldRules.test.ts`（CLOSE 側的等價案例，含 AUTO CLOSE 固定值案例，檔案內含 REOPEN/CLOSE reasonCode 相關測試群組）直接核實。

## Source Evidence

实现:
- `microservices/balance-component/src/service/balanceService.ts:1488-1492`
- `microservices/balance-component/src/service/balanceService.ts:852-859`
- `microservices/balance-component/src/config.ts`
- `src/app/transaction-builder/submit-rules.ts:71-78`
- `src/app/transaction-builder/builder-fields.ts:71,148-158`

测试:
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:455-491`
- `microservices/balance-component/test/unit/service/mandatoryFieldRules.test.ts`

## Related Knowledge
- [[MAKER-CHECKER-RULE-058]]
- [[MOVEMENT-RULE-053]]
- [[STATUS-RULE-030]]
- [[A11-LC-Reopen]]
- [[B7-Confirmed-LC-Reopen]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
