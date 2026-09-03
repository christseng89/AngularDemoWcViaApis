---
knowledge_id: MOVEMENT-RULE-067
title: "assertValidAmount() 的「0 合法、負數拒絕」豁免自 F1 起擴及 EXPIRE 與 REOPEN，與既有 CLOSE 豁免共用同一段程式碼"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-09-03
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
既有規則 [[MOVEMENT-RULE-025]] 記載 CLOSE 是 Submit 時通用「Amount > 0」校驗的唯一豁免（0 為合法的核銷值，只拒絕負數）。F1 上線後，`assertValidAmount()` 的這個豁免分支擴大為 `CLOSE`、`EXPIRE`、`REOPEN`。`AMEND_EXPIRY_DATE` 的外部 Maker 請求必須傳 `amount: '0'`。只有目標合約為 EXPIRED 時，伺服器才在合約解析後把 persisted movement 改為受保護的原 EXPIRE 恢復金額，讓 Checker 審核真實分錄；呼叫端不能自行傳入該金額，見 [[EXPOSURE-RULE-030]]。

## Conditions
`movementType` 為 `CLOSE`、`EXPIRE`、或 `REOPEN`（`service/balanceService.ts` 的 `assertValidAmount()`）

## Result
三者的金額皆允許為 0，但拒絕任何負數；`AMEND_EXPIRY_DATE` 的外部請求要求 `'0'`，ACTIVE persisted movement 仍為 0，而 EXPIRED persisted movement 由伺服器改為受保護的恢復金額。

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
