---
knowledge_id: EXPOSURE-RULE-030
title: "AMEND_EXPIRY_DATE 明確回傳 null 的 contingentAccountEntry（與 EPLC_EXAMINATION/CREATE 相同待遇），無論作用於 ACTIVE 或 EXPIRED 合約"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-26
tags:
  - balance
  - exposure
  - f1
  - confirmed
---

# EXPOSURE-RULE-030 — AMEND_EXPIRY_DATE 明確回傳 null 的 contingentAccountEntry（與 EPLC_EXAMINATION/CREATE 相同待遇），無論作用於 ACTIVE 或 EXPIRED 合約

## Status
CONFIRMED

## Business Rule
`deriveContingentAccountEntry()`（`domain/contingentAccountEntry.ts`）對 `movementType === 'AMEND_EXPIRY_DATE'` 有一個明確的早期 `return null` 分支——這是 v1.22.0（2026-08-25，同日，使用者回報「A2 B2 extension不牽涉金額 不需要出ACCOUNT ENTRIES」）修正的一個真實 bug：修正前，`MOVEMENT_DIRECTION` 表對 `AMEND_EXPIRY_DATE` 給的固定方向是 `0`，這個通用推導邏輯會產生一組零金額的 Dr/Cr 配對，而非真正的 `null`——文件註解明確記載這是「泛用推導邏輯的副作用（artifact），而非刻意的設計選擇」。修正後與 `EPLC_EXAMINATION`／`CREATE`（B3 Present Docs，Design Principle D3「只有法律事件才會影響餘額」）採用完全相同的待遇：兩者都是明確、刻意的 `null`，而非零金額佔位配對。此規則對 `AMEND_EXPIRY_DATE` 的**兩種模式**（作用於 ACTIVE 的純欄位修改、作用於 EXPIRED 的 Expiry Extension Amendment，見 [[MOVEMENT-RULE-068]]）**一視同仁**——不論哪一種模式，`AMEND_EXPIRY_DATE` 這筆移動本身永遠沒有真實的帳戶分錄；Expiry Extension Amendment 真正的餘額復原分錄，屬於它額外產生的那筆獨立 `REVERSAL` 移動自己的 `contingentAccountEntry`，與 `AMEND_EXPIRY_DATE` 自身完全脫鉤。

這與 [[MOVEMENT-RULE-064]] 描述的 REOPEN 形成鮮明對照——REOPEN 自 v1.20.0 重新設計後，反而是**唯一**一個「零 Amount 輸入卻產生真實帳戶分錄」的反例：Amount 由伺服端計算，但 `contingentAccountEntry` 是真實、非 null 的（因為 `MOVEMENT_DIRECTION.REOPEN` 是固定的 `1`，未落入此函式對 `AMEND_EXPIRY_DATE`／`REVERSAL` 的特殊分支）。

## Conditions
`movementType === 'AMEND_EXPIRY_DATE'`（`domain/contingentAccountEntry.ts` 的 `deriveContingentAccountEntry()`）

## Result
回傳值恆為 `null`，不論 `instrumentType` 為何（`IPLC_LC`/`EPLC_LC`/`EPLC_CONFIRMATION`）、不論目標合約當下狀態是 ACTIVE 還是 EXPIRED。

## Example
`deriveContingentAccountEntry({ instrumentType: 'IPLC_LC', movementType: 'AMEND_EXPIRY_DATE', amount: '0', currency: 'USD' })` 回傳 `null`；`deriveContingentAccountEntry({ instrumentType: 'EPLC_CONFIRMATION', movementType: 'AMEND_EXPIRY_DATE', amount: '0', currency: 'USD' })` 同樣回傳 `null`（Export 側行為一致）。

## Verification Note
已直接阅读 `domain/contingentAccountEntry.ts` 全文，`AMEND_EXPIRY_DATE` 的 `return null` 分支位於第 142 行，其上方文件註解（第 137-141 行）完整記載 v1.22.0 修正的前因後果。已由 `test/unit/domain/contingentAccountEntry.test.ts:174-186`（「AMEND_EXPIRY_DATE (A2/B2 third subChoice option) — never posts a real account-entry pair」測試群組，含 IPLC_LC 與 EPLC_CONFIRMATION 兩側各自的獨立斷言）直接核實。亦於 `analysis/balance-component-api.yaml` 自身 v1.22.0 變更記錄中有完整記載。

## Source Evidence

实现:
- `microservices/balance-component/src/domain/contingentAccountEntry.ts:1-25` (模組頂部文件註解，列出 null 的三種情形)
- `microservices/balance-component/src/domain/contingentAccountEntry.ts:137-142`

测试:
- `microservices/balance-component/test/unit/domain/contingentAccountEntry.test.ts:174-186`

## Related Knowledge
- [[MOVEMENT-RULE-068]]
- [[MOVEMENT-RULE-064]]
- [[MOVEMENT-RULE-067]]
- [[A11-LC-Reopen]]
- [[B7-Confirmed-LC-Reopen]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
