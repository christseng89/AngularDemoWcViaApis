---
knowledge_id: MOVEMENT-RULE-065
title: "MOVEMENT_DIRECTION.REOPEN = 1：REOPEN 自 2026-08-25 起直接以自身簽署金額建立餘額，不再產生任何 REVERSAL 副作用"
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

# MOVEMENT-RULE-065 — MOVEMENT_DIRECTION.REOPEN = 1：REOPEN 自 2026-08-25 起直接以自身簽署金額建立餘額，不再產生任何 REVERSAL 副作用

## Status
CONFIRMED

## Business Rule
REOPEN（A11/B7）原始設計（F1 提案 v1.19.0，2026-08-25 當日已被取代）是零金額移動，真正的餘額復原透過 Checker Release 時另外產生 REVERSAL。現場 UAT 發現 Checker 核准前看不到真實影響，且同一事件顯示兩筆記錄。v1.20.0 將 REOPEN 改為直接攜帶伺服器計算的復原金額與 Account Entries，`MOVEMENT_DIRECTION.REOPEN` 由 `0` 改為 `1`；Release 只重新驗證並 `reactivate()`，不另建 REVERSAL。EXPIRED Expiry Extension 現在也採相同的「單筆先審」原則：不另建 REVERSAL，而在同一筆 PENDING `AMEND_EXPIRY_DATE` 上使用 `reversalOfMovementId` 推導方向，見 [[MOVEMENT-RULE-066]]。

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
