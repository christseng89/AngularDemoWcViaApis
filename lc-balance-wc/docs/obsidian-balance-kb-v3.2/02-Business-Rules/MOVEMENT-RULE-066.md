---
knowledge_id: MOVEMENT-RULE-066
title: "動態反轉方向：REVERSAL 與 EXPIRED AMEND_EXPIRY_DATE 皆以 reversalOfMovementId 解析"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance-wc)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-09-03
tags:
  - balance
  - movement
  - f1
  - confirmed
---

# MOVEMENT-RULE-066 — 動態反轉方向：REVERSAL 與 EXPIRED AMEND_EXPIRY_DATE 皆以 reversalOfMovementId 解析

## Status
CONFIRMED

## Business Rule
**2026-09-03 現行規則：** 動態方向機制仍存在，但 Expiry Extension 不再於 Checker Release 另生一筆 REVERSAL。伺服器在 Maker Submit 時把 `reversalOfMovementId` 設於同一筆 PENDING `AMEND_EXPIRY_DATE`，指向最後一筆有效的 RELEASED EXPIRE；CANCELLED／REJECTED 嘗試不參與此判斷。Balance 與 Account Entry 推導都反轉該原始方向。Checker 可先審核，Release 才啟用餘額效果。以下 2026-08-26 所述「Extension Release 另生 REVERSAL」為歷史行為，已被取代。

`REVERSAL` 是 F1 新增的 movementType；它沒有固定方向，必須由 `reversalOfMovementId` 指向的原始 movement 取反。現行 EXPIRED Expiry Extension 重用同一套動態方向推導，但不建立另一筆 `REVERSAL`：Maker Submit 將受保護的 reference、EXPIRE `ceilingAmount` 與反向 Account Entries 寫入 PENDING `AMEND_EXPIRY_DATE`。外部仍不能直接提交 `REVERSAL`；REOPEN 也不使用它（見 [[MOVEMENT-RULE-065]]）。

v1.23.0（2026-08-25，同日）曾修正一個現場重現的真實雙重復原 bug：合約可能經由「真正的 EXPIRE」或「REOPEN 重啟回 EXPIRED」兩種路徑到達 EXPIRED 狀態，而 REOPEN 自 v1.20.0 起直接以自身簽署金額復原、不留下任何 REVERSAL 痕跡——Extension Amendment 原本的復原邏輯仍假設「REOPEN 必留下 REVERSAL」這個舊有不變量，因而反覆找到同一筆未被反轉標記的 EXPIRE 並二次反轉它，造成餘額從 10000 誤增為 20000。現行判定只看「排除本次 Amendment 且排除 CANCELLED／REJECTED 稽核嘗試後，最後一筆 RELEASED movement 是否為 EXPIRE」；若是才復原，若是 REOPEN 等其他有效 movement，表示先前動作已完成復原，不得再重複恢復。

## Conditions
`movementType === 'REVERSAL'`，或 `movementType === 'AMEND_EXPIRY_DATE' && reversalOfMovementId != null`

## Result
只有 EXPIRED Extension 的 PENDING Amendment 帶 `reversalOfMovementId` 與恢復分錄；ACTIVE 到期日修改不帶。Checker Release 啟用同一筆 movement，不另建隱藏 movement。

## Example
合約 A：EXPIRE 沖銷 10000 → EXPIRED；Maker 提交 Extension 時，同一筆 PENDING Amendment 即顯示 10000 的反向 Dr/Cr，餘額仍為 0；Checker Release 後該筆轉 RELEASED、餘額恢復 10000、狀態轉 ACTIVE，事件列表沒有第二筆 REVERSAL。合約 B：ACTIVE 純修改到期日，PENDING Amendment 無 Account Entries，Release 只改日期。

## Verification Note
2026-09-03 已由 `balanceDerivation.ts`、`contingentAccountEntry.ts`、`balanceService.ts`、`movementReleasePolicyService.ts` 與 `movementReleaseSideEffectService.ts` 交叉核實；專屬測試涵蓋 PENDING 分錄可審、Release 才恢復、無額外 REVERSAL，以及防止重複恢復。

## Source Evidence

实现:
- `microservices/balance-component/src/domain/balanceDerivation.ts`（reference-based direction）
- `microservices/balance-component/src/domain/contingentAccountEntry.ts`（ACTIVE-null／EXPIRED voucher）
- `microservices/balance-component/src/service/balanceService.ts`（Submit 只取最後一筆 RELEASED movement）
- `microservices/balance-component/src/service/movementReleasePolicyService.ts`（Checker 複查 restoration basis）

测试:
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts`（同一筆 PENDING Amendment 復原、cancelled retry、stale basis、無 linked REVERSAL）

## Related Knowledge
- [[MOVEMENT-RULE-065]]
- [[MOVEMENT-RULE-064]]
- [[MOVEMENT-RULE-068]]
- [[A11-LC-Reopen]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
