---
knowledge_id: MOVEMENT-RULE-066
title: "REVERSAL 方向為動態解析（反轉其指向移動的固定方向），現行僅供 Expiry Extension Amendment 自身復原使用，REOPEN 自 2026-08-25 起不再使用"
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

# MOVEMENT-RULE-066 — REVERSAL 方向為動態解析（反轉其指向移動的固定方向），現行僅供 Expiry Extension Amendment 自身復原使用，REOPEN 自 2026-08-25 起不再使用

## Status
CONFIRMED

## Business Rule
`REVERSAL` 是 F1 新增的 movementType，其 `reversalOfMovementId` 欄位早在 schema v1.0.0 就已存在但從未被任何端點真正填入，直至 F1 才第一次被實際使用。與其他 movementType 不同，`REVERSAL` **沒有**固定的 `MOVEMENT_DIRECTION` 表項——其方向是動態解析：取得 `reversalOfMovementId` 指向的原始移動的固定方向後，將其反轉（`domain/contingentAccountEntry.ts` 的 `deriveContingentAccountEntry()` 以 `reversedDirection` 參數接收呼叫端已解析好的原始方向並取負；`domain/balanceDerivation.ts` 的 `signedAmount()` 對餘額計算做相同的動態反轉）。永遠只在服務內部產生，從未有外部呼叫端可直接提交（`reversalShaped` 校驗要求 `reversalOfMovementId` 必須指向同一合約上一筆真實存在、狀態為 RELEASED、且尚未被反轉過的移動，金額必須與被反轉移動的 `ceilingAmount` 完全相等）。目前唯一仍在使用 `REVERSAL` 的業務流程是 **Expiry Extension Amendment**（`AMEND_EXPIRY_DATE` 作用於 EXPIRED 合約時）——Release 時由 `createAndReleaseReversal()` 針對該合約自身最近一筆 RELEASED `EXPIRE` 產生一筆連結的 REVERSAL，恢復被 EXPIRE 沖銷掉的 Confirmed Balance。**REOPEN 不再使用 REVERSAL**（v1.20.0 重新設計後，見 [[MOVEMENT-RULE-065]]），這與 F1 提案文件 §9.3 原始設計（「對當初那筆被沖銷的 CLOSE movement 觸發一筆 REVERSAL」）已不一致——`analysis/Balance-Component-F1-Expire-Proposal-zh.md` 屬提案／決策記錄文件而非即時同步的權威規格，本規則以目前實際程式碼行為（v1.20.0 之後）為準。

v1.23.0（2026-08-25，同日）曾修正一個現場重現的真實雙重復原 bug：合約可能經由「真正的 EXPIRE」或「REOPEN 重啟回 EXPIRED」兩種路徑到達 EXPIRED 狀態，而 REOPEN 自 v1.20.0 起直接以自身簽署金額復原、不留下任何 REVERSAL 痕跡——Extension Amendment 原本的復原邏輯仍假設「REOPEN 必留下 REVERSAL」這個舊有不變量，因而反覆找到同一筆未被反轉標記的 EXPIRE 並二次反轉它，造成餘額從 10000 誤增為 20000（使用者現場回報："這整個有問題 CLOSE時 餘額10000 REOPEN回復10000 為什麼REVERSAL又回復一次 變成20000餘額?"）。修正後的邏輯改為只看「排除本次 Amendment 自身後，合約自己最近一筆移動是否為 RELEASED 的 EXPIRE」——若是，才是唯一真正需要反轉的對象；若是其他移動（最常見是一筆 REOPEN），代表先前的動作已經完成復原，Extension 不再產生任何 REVERSAL。

## Conditions
`movementType === 'REVERSAL'`（`service/balanceService.ts` 的 `reversalShaped` 校驗、`createAndReleaseReversal()` 輔助函式、`release()` 內 `AMEND_EXPIRY_DATE` 對 EXPIRED 合約的分支）

## Result
`REVERSAL` 僅由 `createAndReleaseReversal()` 內部產生，唯一呼叫來源是 Expiry Extension Amendment 的 Release 端；REOPEN 的 Release 端不再呼叫此輔助函式。

## Example
合約 A：真正 EXPIRE 沖銷 10000 → EXPIRED；提交 Expiry Extension Amendment → Release 時偵測到最近一筆移動是 RELEASED EXPIRE → 產生一筆 REVERSAL（金額 10000）→ 恢復餘額、狀態轉 ACTIVE。合約 B：CLOSE 沖銷 10000 → CLOSED；REOPEN 復原 10000（自身簽署金額，無 REVERSAL）→ 若原到期日已過，狀態回到 EXPIRED；此時再提交 Expiry Extension Amendment → Release 時偵測到最近一筆移動是 REOPEN（既非 EXPIRE 也非 CLOSE）→ 不產生任何 REVERSAL，直接恢復 ACTIVE，避免雙重復原。

## Verification Note
已直接阅读 `domain/balanceDerivation.ts` 第 1-16 行的頂部文件註解（明確記載 REVERSAL 方向動態解析的設計理由）；已直接阅读 `service/balanceService.ts` 的 `reversalShaped`（第 424-436 行）、`createAndReleaseReversal()`（第 2085-2110 行，明確記載「REOPEN (§9) no longer uses this helper」）、`AMEND_EXPIRY_DATE` 對 EXPIRED 合約的 Release 分支（第 2010-2073 行，內含 v1.23.0 修正的完整邏輯與註解）。已由專屬測試直接核實：`test/unit/service/expiryExtensionAndReopen.test.ts:738-772`（「Expiry Extension Amendment after A11 Reopen reactivated the contract to EXPIRED does NOT double-restore the balance」）。亦於 `analysis/balance-component-api.yaml` 自身 v1.23.0 變更記錄（第 649-666 行）中有完整記載。

## Source Evidence

实现:
- `microservices/balance-component/src/domain/balanceDerivation.ts:1-16`
- `microservices/balance-component/src/service/balanceService.ts:424-436`
- `microservices/balance-component/src/service/balanceService.ts:2010-2073`
- `microservices/balance-component/src/service/balanceService.ts:2085-2110`

测试:
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:200-224` (Extension 正常路徑的 REVERSAL)
- `microservices/balance-component/test/unit/service/expiryExtensionAndReopen.test.ts:738-772` (v1.23.0 雙重復原修正)

## Related Knowledge
- [[MOVEMENT-RULE-065]]
- [[MOVEMENT-RULE-064]]
- [[MOVEMENT-RULE-068]]
- [[A11-LC-Reopen]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
