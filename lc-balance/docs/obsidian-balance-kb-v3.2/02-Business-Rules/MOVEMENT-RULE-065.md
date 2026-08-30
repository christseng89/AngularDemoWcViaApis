---
knowledge_id: MOVEMENT-RULE-065
title: "MOVEMENT_DIRECTION.REOPEN = 1：REOPEN 自 2026-08-25 起直接以自身簽署金額建立餘額，不再產生任何 REVERSAL 副作用"
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

# MOVEMENT-RULE-065 — MOVEMENT_DIRECTION.REOPEN = 1：REOPEN 自 2026-08-25 起直接以自身簽署金額建立餘額，不再產生任何 REVERSAL 副作用

## Status
CONFIRMED

## Business Rule
REOPEN（A11/B7）原始設計（F1 提案 v1.19.0，2026-08-25 當日已被取代）是零金額移動（`MOVEMENT_DIRECTION.REOPEN` 曾是 `0`），真正的餘額復原透過 Checker Release 時另外產生一筆或多筆獨立的 `REVERSAL` 移動作為副作用。現場 UAT（"REOPEN Submit 出 Account Entries (Pending)... 不應該有兩筆"）發現這讓 Checker 核准當下看不到真實影響，且 Inquire Events/Look Up 對「概念上同一個業務事件」顯示成兩筆記錄。v1.20.0（同日）將 REOPEN 重新設計為直接攜帶自己真實、正數的復原金額（[[MOVEMENT-RULE-064]]），`MOVEMENT_DIRECTION.REOPEN` 同步由 `0` 改為 `1`（與 `ISSUE`/`AMEND_INCREASE` 相同的「建立/增加」方向）。自此 REOPEN 的 Release 端**不再產生任何 REVERSAL 移動**——`release()` 對 REOPEN 的處理僅剩「重新驗證資格與金額」+「呼叫 `reactivate()` 轉換合約狀態」兩步，沒有 `createAndReleaseReversal()` 呼叫。`REVERSAL` movementType 本身並未被移除，僅是不再被 REOPEN 使用（現行僅供 Expiry Extension Amendment 使用，見 [[MOVEMENT-RULE-066]]）。

## Conditions
`movementType === 'REOPEN'`（`domain/balanceDerivation.ts` 的 `MOVEMENT_DIRECTION` 表；`service/balanceService.ts` 的 `release()` 內 `movement.movementType === 'REOPEN'` 分支）

## Result
REOPEN 移動本身即是一筆帶有真實、正數金額的移動，直接以 `+1` 方向計入 Confirmed Balance；Inquire Events/Look Up 對一次 Reopen 只顯示一筆記錄，不再有配對的 REVERSAL 記錄。

## Example
一筆合約沖銷鏈總額為 10000 的 REOPEN Submit 後，`reopen.movement.ceilingAmount` 為 `'10000'`；Release 後查詢該合約的全部移動，`movements.filter(m => m.movementType === 'REVERSAL')` 長度為 0——沒有任何 REVERSAL 記錄，10000 這個復原金額完全由 REOPEN 自己這一筆承載。

## Verification Note
已直接阅读 `domain/balanceDerivation.ts` 第 52-56 行（`REOPEN: 1` 及其上方文件註解，明確記載「no longer a 0-effect movement paired with a separate linked REVERSAL leg」）；已直接阅读 `service/balanceService.ts` 第 2075-2078 行的 REOPEN release 分支（僅呼叫 `reactivate()`，附近註解明確記載「no separate REVERSAL leg(s) to generate any more」）；已直接阅读 `domain/reopenRestoration.ts` 頂部文件註解完整記述此次重新設計的前因後果。已由 `test/unit/service/expiryExtensionAndReopen.test.ts:364-366` 直接核實（`expect(movementsAfter.filter((m) => m.movementType === 'REVERSAL')).toHaveLength(0)`）。亦於 `analysis/balance-component-api.yaml` 自身 v1.20.0 變更記錄（第 603-627 行）中有完整記載。

## Source Evidence

实现:
- `microservices/balance-component/src/domain/balanceDerivation.ts:52-56`
- `microservices/balance-component/src/service/balanceService.ts:2075-2078`
- `microservices/balance-component/src/domain/reopenRestoration.ts:1-22`

测试:
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:332-370` (行 364-366 為關鍵斷言)

## Related Knowledge
- [[MOVEMENT-RULE-064]]
- [[MOVEMENT-RULE-066]]
- [[A11-LC-Reopen]]
- [[B7-Confirmed-LC-Reopen]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
