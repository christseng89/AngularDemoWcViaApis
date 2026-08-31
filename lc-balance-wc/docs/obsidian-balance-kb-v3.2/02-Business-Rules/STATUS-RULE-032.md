---
knowledge_id: STATUS-RULE-032
title: "REOPEN（A11/B7）依合約自身 expiryDate 是否仍在 Release 當下之後，把 CLOSED 合約重啟為 ACTIVE 或 EXPIRED 兩種目標狀態之一"
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

# STATUS-RULE-032 — REOPEN（A11/B7）依合約自身 expiryDate 是否仍在 Release 當下之後，把 CLOSED 合約重啟為 ACTIVE 或 EXPIRED 兩種目標狀態之一

## Status
CONFIRMED

## Business Rule
REOPEN 的 Checker Release 側效應是呼叫 `contracts.reactivate(balanceContractId, targetStatus, releasedAt)`，`targetStatus` 由一行判斷式決定：`contract.expiryDate && contract.expiryDate > releasedAt ? 'ACTIVE' : 'EXPIRED'`。這對應 F1 提案 §9.1/§9.2 描述的兩種情況：
- **情況一（§9.1）**：原 LC 的 `expiryDate` 尚未到期（仍在 Release 當下之後）→ 直接重啟為 `ACTIVE`，Maker/Checker 完成後即可繼續正常動用。
- **情況二（§9.2 選項 A）**：原 LC 的 `expiryDate` 已經過去 → 重啟為 `EXPIRED`（而非 ACTIVE），因為讓一筆到期日已過的合約直接變成 ACTIVE 會與 AUTO EXPIRY 自身的邏輯矛盾；此時必須再提交一次 A2/B2 的 Expiry Extension Amendment（`AMEND_EXPIRY_DATE` 作用於 EXPIRED 合約，見 [[MOVEMENT-RULE-068]]）才能真正回到 ACTIVE。本實作**尚未**提供 F1 提案 §9.2 選項 B 所設想的「REOPEN WITH EXTENSION」單一複合交易——重啟到 EXPIRED 後仍需要兩個獨立的 Maker/Checker 動作。

`reactivate()` 對重啟至 `EXPIRED` 的情形會把 `effective_to` 設為本次 Release 的時間戳（而非留 `NULL`）——這是 v1.24.0（F1 proposal §13.7）修正的一個真實 bug：先前留 `NULL` 會讓 [[STATUS-RULE-033]] 的 Auto Close Grace Period 沒有「這個合約何時變成 EXPIRED」的錨點可用；重啟至 `ACTIVE` 則正常清為 `NULL`（與其他「目前有效」的合約一致）。

## Conditions
`movementType === 'REOPEN'` 且 Release 通過所有資格重檢（[[MOVEMENT-RULE-064]]）

## Result
CLOSED → ACTIVE（`contract.expiryDate > releasedAt`）或 CLOSED → EXPIRED（`contract.expiryDate <= releasedAt`，或 `expiryDate` 缺失）；後者的 `effective_to` 被設為 Release 時間戳。

## Example
一筆 `expiryDate: '2099-01-01'` 的 CLOSED LC 在 2026-08-26 執行 REOPEN → 重啟為 `ACTIVE`。另一筆 `expiryDate: '2025-12-30'` 的 CLOSED LC（先前經 AUTO EXPIRY→AUTO CLOSE 鏈到達 CLOSED）在 2026-01-18 執行 REOPEN → 重啟為 `EXPIRED`（因原到期日早已過去），且 `effective_to` 被設為 2026-01-18，供日後 Auto Close Grace Period 計算依據。

## Verification Note
已直接阅读 `service/balanceService.ts` 第 2075-2078 行的 REOPEN release 分支；已直接阅读 store 層 `reactivate()`（第 388-419 行，含 v1.24.0 修正的完整文件註解）。已由 `test/unit/service/expiryExtensionAndReopen.test.ts:279-331`（重啟至 ACTIVE，原到期日未到）、`:332-370`（重啟至 EXPIRED，路徑 B）、`:376-406`（「reactivates straight to ACTIVE when the original expiryDate is still in the future」）直接核實。

## Source Evidence

实现:
- `microservices/balance-component/src/service/balanceService.ts:2075-2078`
- `microservices/balance-component/src/store/balanceContractStore.ts:388-419`

测试:
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:279-331`
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:332-370`
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:376-406`

## Related Knowledge
- [[MOVEMENT-RULE-064]]
- [[MOVEMENT-RULE-068]]
- [[STATUS-RULE-033]]
- [[A11-LC-Reopen]]
- [[B7-Confirmed-LC-Reopen]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
