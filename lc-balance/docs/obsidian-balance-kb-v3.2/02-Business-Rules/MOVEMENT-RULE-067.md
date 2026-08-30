---
knowledge_id: MOVEMENT-RULE-067
title: "assertValidAmount() 的「0 合法、負數拒絕」豁免自 F1 起擴及 EXPIRE 與 REOPEN，與既有 CLOSE 豁免共用同一段程式碼"
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

# MOVEMENT-RULE-067 — assertValidAmount() 的「0 合法、負數拒絕」豁免自 F1 起擴及 EXPIRE 與 REOPEN，與既有 CLOSE 豁免共用同一段程式碼

## Status
CONFIRMED

## Business Rule
既有規則 [[MOVEMENT-RULE-025]] 記載 CLOSE 是 Submit 時通用「Amount > 0」校驗的唯一豁免（0 為合法的核銷值，只拒絕負數）。F1 上線後，`assertValidAmount()` 的這個豁免分支擴大為同時涵蓋 `CLOSE`、`EXPIRE`、`REOPEN` 三者，共用同一段程式碼與同一個判斷式（`if (movementType === 'CLOSE' || movementType === 'EXPIRE' || movementType === 'REOPEN') { if (amt.isNegative()) throw ...; return; }`）。三者的「0 合法」各有不同的業務含意：CLOSE 的 0 代表核銷一筆已經完全動用完畢的 LC；EXPIRE 的 0 代表一筆已到期、且早已完全動用完畢的 LC 到期時沒有餘額可沖銷；REOPEN 的 0 則代表重啟一筆「其自身沖銷鏈的沖銷金額本來就是 0」的合約（例如 EXPIRE→AUTO CLOSE 鏈中 AUTO CLOSE 那一筆的沖銷金額已因 EXPIRE 先行沖銷而歸零，REOPEN 若只反轉這最後一筆會合法地算出 0，但實務上這種情形不會單獨發生——真正會出現 REOPEN 金額為 0 的情境，是整條沖銷鏈本身加總即為 0）。另新增 `AMEND_EXPIRY_DATE` 專屬分支：其金額必須「恰好等於 0」（而非「非負」），因為該 movementType 從不承載任何真實金額，見 [[EXPOSURE-RULE-030]]。

## Conditions
`movementType` 為 `CLOSE`、`EXPIRE`、或 `REOPEN`（`service/balanceService.ts` 的 `assertValidAmount()`）

## Result
三者的金額皆允許為 0，但拒絕任何負數；`AMEND_EXPIRY_DATE` 則要求金額必須恰好為 `'0'`（非零一律拒絕）；`REVERSAL` 另有自己的分支，同樣只拒絕負數（金額是否精確等於被反轉移動的 `ceilingAmount` 由 `reversalShaped` 另行校驗，不在 `assertValidAmount()` 職責範圍）。

## Example
一筆已完全動用完畢（Confirmed Balance = 0）的 LC 到期，AUTO EXPIRY 提交 `amount: '0'` 的 EXPIRE → 通過；提交 `amount: '-100'` 的 EXPIRE → 拒絕（不論金額來源為系統批次或人工繞過）。

## Verification Note
已直接阅读 `service/balanceService.ts` 的 `assertValidAmount()`（第 1444-1467 行），確認 EXPIRE/REOPEN 分支（第 1450-1461 行）與既有 CLOSE 分支共用同一個 `if` 條件、同一段程式碼路徑，非另行複製。已由 `test/unit/service/autoExpirySweep.test.ts:195-224`（「zero-amount EXPIRE is accepted」）直接核實 EXPIRE 的 0 合法性；REOPEN 的 0/非負合法性由其自身 Submit 前先經 `computeReopenRestoreAmount()` 覆寫再呼叫此函式的流程間接保證（`balanceService.ts:1603-1608`），本輪未見刻意測試「REOPEN 沖銷鏈加總為 0」這個邊界情境的專屬案例（`test/unit/service/expiryExtensionAndReopen.test.ts:849-887` 測試的是「無真實 EXPIRE/CLOSE 歷史（原生 SQL 繞過）時 REOPEN 復原 0，非錯誤」，性質相近但情境不同——該測試針對合約沒有任何沖銷歷史的防禦性案例，非「沖銷鏈加總恰為 0」）。既有 [[MOVEMENT-RULE-025]] 對 CLOSE 分支本身的驗證維持不變。

## Source Evidence

实现:
- `microservices/balance-component/src/service/balanceService.ts:1444-1467`

测试:
- `microservices/balance-component/test/unit/service/autoExpirySweep.test.ts:195-224`
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:849-887`

## Related Knowledge
- [[MOVEMENT-RULE-025]]
- [[MOVEMENT-RULE-064]]
- [[EXPOSURE-RULE-030]]
- [[A11-LC-Reopen]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
