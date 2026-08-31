---
knowledge_id: MAKER-CHECKER-RULE-058
title: "AUTO EXPIRY/AUTO CLOSE 以 BATCH_MAKER_ACTOR/BATCH_CHECKER_ACTOR 兩個相異系統身份分飾 Maker/Checker，套用既有、完全未修改的 assertMakerCheckerSeparation()，四眼原則不被繞過"
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

# MAKER-CHECKER-RULE-058 — AUTO EXPIRY/AUTO CLOSE 以 BATCH_MAKER_ACTOR/BATCH_CHECKER_ACTOR 兩個相異系統身份分飾 Maker/Checker，套用既有、完全未修改的 assertMakerCheckerSeparation()，四眼原則不被繞過

## Status
CONFIRMED

## Business Rule
AUTO EXPIRY（`runAutoExpirySweep()`）與 AUTO CLOSE（`runAutoCloseSweep()`）兩個背景批次都透過 `processSweepCandidate()` 呼叫既有、完全未經修改的 `createMovement()`/`release()` 路徑——沒有引入任何「系統繞過」旗標或特殊分支去跳過既有的 `assertMakerCheckerSeparation()`（業務確認 2026-08-24 的「Maker 與 Checker 不可為同一人」四眼原則檢查）。做法是設定兩個**刻意不同**的固定系統身份字串：`BATCH_MAKER_ACTOR = 'BATCH_MAKER'` 作為 `createMovement()` 的 `createdBy`、`BATCH_CHECKER_ACTOR = 'BATCH_CHECKER'` 作為 `release()` 的 `releasedBy`——`assertMakerCheckerSeparation()` 只檢查 `createdBy === actingUser` 是否成立，兩者只要是不同字串即可通過，完全不需要知道呼叫端是人類還是批次程式。`config.ts` 自身的頂部文件註解明確記載這個設計動機：讓四眼原則「無需任何系統繞過的特例」即可被滿足。

## Conditions
`processSweepCandidate()`（`service/balanceService.ts`，被 `runAutoExpirySweep()`/`runAutoCloseSweep()` 呼叫）建立並釋放一筆 `EXPIRE` 或 `CLOSE` movement

## Result
每一筆由背景批次產生的 `EXPIRE`/`CLOSE` movement，其 `createdBy` 恆為 `'BATCH_MAKER'`、`releasedBy` 恆為 `'BATCH_CHECKER'`；`assertMakerCheckerSeparation()` 對兩者的比對永遠通過（不相等），與人工 A10/B6 走的是完全相同一段程式碼、完全相同的檢查邏輯，僅呼叫端提供的身份字串不同。

## Example
一筆 ACTIVE LC 到期，AUTO EXPIRY 建立一筆 `createdBy: 'BATCH_MAKER'` 的 `EXPIRE` movement，隨即以 `releasedBy: 'BATCH_CHECKER'` 呼叫 `release()`——`assertMakerCheckerSeparation('BATCH_MAKER', 'BATCH_CHECKER', 'RELEASE')` 判斷 `'BATCH_MAKER' !== 'BATCH_CHECKER'`，通過，Release 正常完成。

## Verification Note
已直接阅读 `microservices/balance-component/src/config.ts` 的 `BATCH_MAKER_ACTOR`/`BATCH_CHECKER_ACTOR` 常數與其文件註解；已直接阅读 `domain/statusTransition.ts` 的 `assertMakerCheckerSeparation()`（第 45-52 行）確認其未因 F1 上線而新增任何「系統呼叫端」特例分支，簽名與邏輯與 F1 上線前完全相同；已直接阅读 `service/balanceService.ts` 的 `processSweepCandidate()`（第 767-793 行）確認其固定傳入這兩個常數作為 `createdBy`/`releasedBy`。`test/unit/service/autoExpirySweep.test.ts` 全數測試（如第 82-311 行的多個案例）均以真實呼叫 `release()` 完成，若 `BATCH_MAKER_ACTOR`/`BATCH_CHECKER_ACTOR` 兩者相等，這些測試會全數因 `MakerCheckerConflictError` 而失敗——測試套件整體通過即是這條規則成立的間接但有力佐證；本輪未見專屬於「刻意驗證兩個常數字串不相等」的獨立斷言，屬於透過既有測試套件通過與否間接驗證，而非一則獨立、直接針對此規則命名的測試案例。

## Source Evidence

实现:
- `microservices/balance-component/src/config.ts`
- `microservices/balance-component/src/domain/statusTransition.ts:45-52`
- `microservices/balance-component/src/service/balanceService.ts:767-793`

测试:
- `microservices/balance-component/test/unit/service/autoExpirySweep.test.ts:82-311` (间接：全套测试皆真实呼叫 release()，若两常数相等将全数因 MakerCheckerConflictError 失败)

## Related Knowledge
- [[MAKER-CHECKER-RULE-059]]
- [[STATUS-RULE-031]]
- [[STATUS-RULE-034]]
- [[auto-expiry-auto-close-background-sweep-and-grace-period]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
