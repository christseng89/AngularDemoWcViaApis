---
knowledge_id: STATUS-RULE-033
title: "Auto Close Grace Period：AUTO CLOSE 需等待 effectiveTo 之後 N 個銀行營業日（AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS）才會撿走一筆 EXPIRED 合約"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-26
tags:
  - balance
  - status
  - f1
  - confirmed
---

# STATUS-RULE-033 — Auto Close Grace Period：AUTO CLOSE 需等待 effectiveTo 之後 N 個銀行營業日（AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS）才會撿走一筆 EXPIRED 合約

## Status
CONFIRMED

## Business Rule
F1 proposal §13.5（BA-ratified 2026-08-25）新增「Auto Close Grace Period」：`runAutoCloseSweep()` 除了既有的 `evaluateCloseEligibility()`（SG/Acceptance 餘額歸零、無未結事件）之外，額外要求 `isPastAutoCloseGrace(contract.effectiveTo, AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS, asOf)` 為真——即「Business Date 必須晚於『合約變成 EXPIRED 的那一刻（`effectiveTo`）』加上 N 個**銀行營業日**（`config.ts` 的 `AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS = 2`）」。這刻意獨立於既有的、以日曆天計算的 `mailFloatGraceDays`（後者是 AUTO EXPIRY 自己的閘門，以 `expiryDate` 為錨點）——兩者絕不可混為一談：一個是「LC 何時到期」的日曆天緩衝，一個是「已到期後、正式關閉前」留給人工介入（例如 Expiry Extension Amendment）的營業日緩衝。此規則同時填補了 F1 提案原本記載的 §8.5「已知、接受、刻意延後」缺口：一筆從未動用過（SG/Acceptance 均已是 0）的合約，先前可能在**同一個掃描週期**內先被 AUTO EXPIRY 轉為 EXPIRED、緊接著又被 AUTO CLOSE 直接關閉，完全沒有 Expiry Extension Amendment 的介入視窗——加上 Grace Period 後，該合約至少要等 N 個營業日後才會被 AUTO CLOSE 撿走。

`addBusinessDays()`（`domain/autoCloseGracePeriod.ts`）是刻意的 Phase 1 替代品——只跳過週六/週日，沒有銀行假日曆——文件註解明確記載這是等待未來一個尚未建置的獨立「Standing」微服務（處理銀行假日曆、地區規則）到位前的暫時實作，屆時只需替換這個函式本身的實作，呼叫端與這個常數本身都不需要改動。

## Conditions
`movementType === 'CLOSE'` 且觸發來源為 `runAutoCloseSweep()`（人工 A10/B6 CLOSE **不**受此閘門約束——Grace Period 只影響背景批次，人工 Close 有 Maker/Checker 自己的判斷）

## Result
一筆狀態為 `EXPIRED` 的合約，即使 SG/Acceptance 餘額均為 0 且無未結事件，仍要等到 `effectiveTo + N 個銀行營業日` 之後才會被 AUTO CLOSE 處理；`isRecentlyReopened()`（[[STATUS-RULE-034]]）作為並行的暫時性保護機制被保留，兩者疊加生效（proposal §13.8 的協調說明）。

## Example
一筆合約於週五（2026-01-16）因 AUTO EXPIRY 變成 EXPIRED（`effectiveTo` 即為該時刻），Grace Period 為 2 個銀行營業日——依 `addBusinessDays()` 跳過週末，實際要等到下週二才會通過 Grace 檢查，故 AUTO CLOSE 在週一執行掃描時仍會跳過它，直到週二之後的掃描才會將其真正關閉。

## Verification Note
已直接阅读 `domain/autoCloseGracePeriod.ts` 全文（46 行，含 `addBusinessDays()` 與 `isPastAutoCloseGrace()`）；已直接阅读 `config.ts` 的 `AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS` 常數與其文件註解；已直接阅读 `service/balanceService.ts` 的 `runAutoCloseSweep()`（第 852-859 行）。已由 `test/unit/domain/autoCloseGracePeriod.test.ts:28-61`（含「跨週末」案例）與 `test/unit/service/expiryExtensionAndReopen.test.ts:889-940`（「AUTO CLOSE skips a contract... then processes it once the grace interval has elapsed」，實際驗證 8 天後 Grace Period 已過、AUTO CLOSE 才真正關閉）直接核實。

## Source Evidence

实现:
- `microservices/balance-component/src/domain/autoCloseGracePeriod.ts:1-46`
- `microservices/balance-component/src/config.ts`
- `microservices/balance-component/src/service/balanceService.ts:852-859`

测试:
- `microservices/balance-component/test/unit/domain/autoCloseGracePeriod.test.ts:1-61`
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:889-940`

## Related Knowledge
- [[STATUS-RULE-031]]
- [[STATUS-RULE-032]]
- [[STATUS-RULE-034]]
- [[A11-LC-Reopen]]
- [[auto-expiry-auto-close-background-sweep-and-grace-period]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
