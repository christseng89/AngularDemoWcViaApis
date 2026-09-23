# Task 10.1 — A3S 回退前改動備查

日期：2026-09-23  
分支：`OVERDRAWN`  
用途：保存本次回退前的 A3S 實作方向，僅供稽核、差異追查及問題復盤；本文件不是有效業務規格，也不得作為執行邏輯。

## 有效基準

- 唯一業務基準：`信用證超押處理業務需求_v11.15_V4_BA_REVIEW_FIXED_V2.docx`。
- A3S Shipping Guarantee Redemption、Available Balance 與 Account Entries 沿用 `main` 既有行為。
- 本 Change 只在既有 A3S 行為之上加入 V2 Covered／Excess 判定。
- A8／A9 及 A3S SG Redemption 的行為變更不屬於本 Change。

## 回退前曾加入的 A3S 設計

下列內容會從有效執行路徑撤除，但留在此處備查：

1. `A3SCapacityInput` 曾使用：
   - `selectedSgEligibleCapacityOwner`
   - `residualParentTightAvailableOwner`
2. 曾新增 `SgCapacityStore` 與 `sg_capacity_events`，嘗試自行管理 SG capacity 的 reserve、redeem、replace 與 outstanding。
3. A8 Checker Release 曾初始化上述 SG capacity ledger。
4. A3S Maker Submit／legacy submit 曾建立 SG capacity reservation。
5. A3S Checker Acknowledge 曾額外 redeem 該 reservation。
6. Fix Pending 曾反向及重建 SG capacity reservation。
7. Re-select Eligible SG 曾依上述新 store 計算候選 capacity。

這套模型會重複介入 `main` 已有的 SG lifecycle，可能造成 SG capacity、LC movement 或 redemption 被重複計算，因此不再作為 V2 實作。

## V2 取代契約

```text
Base Parent Tight Available
  = 已正規化且排除本筆 A3S 自身 SG redemption／LC UTILIZE 影響的 parent Tight

Current SG Redemption Amount
  = main 既有 A3S 流程為本筆實際產生的 SG redemption amount

Effective Capacity
  = max(0, Base Parent Tight Available)
  + max(0, Current SG Redemption Amount)

Covered = min(Arrival Amount, Effective Capacity)
Excess  = max(0, Arrival Amount - Covered)
```

驗算：

```text
Base Parent Tight Available = 4,000
Current SG Redemption       = 6,000
Arrival Amount              = 10,200

Effective Capacity          = 10,000
Covered                     = 10,000
Excess                      =    200

SG movement                 = -6,000   (main)
LC UTILIZE movement         = -10,000  (main)
Parent signed net effect    = -4,000
```

## 受影響程式位置（回退／重構清單）

- `src/domain/excessFunctionStrategy.ts`
- `src/service/balanceService.ts`
- `src/store/sgCapacityStore.ts`
- `src/routes/balanceMovements.ts`
- `src/db/schema.ts`
- `src/db/migrations.ts`
- 對應 A3S／SG capacity unit、API、migration 與 regression tests

## 保留與撤除原則

- 保留：`main` A3S compound movement、SG redemption、Acknowledge 與 Account Entries 行為。
- 保留：V2 所需的 Legal／Covered／Excess facts、FX、allowance、Maker／Checker 與 zero-write 規則。
- 撤除：所有僅為新 SG capacity ledger、A8 attribution 或 A3S SG lifecycle 重寫而新增的執行邏輯。
- 資料庫相容性若要求保留既有 migration，僅可視為歷史 schema 相容，不得再被 A3S V2 執行路徑讀寫。

## TDD 證據

回退前第一個 RED 已建立於 `test/unit/domain/excessFunctionStrategy.test.ts`：測試改用 V2 欄位
`baseParentTightAvailableOwner` 與 `currentSgRedemptionAmountOwner`，現行 production type 因仍使用舊欄位而編譯失敗。後續以此 RED 進入 Green，再補 main-equivalence regression。
