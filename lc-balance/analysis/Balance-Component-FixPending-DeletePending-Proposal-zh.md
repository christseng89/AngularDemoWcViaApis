# Balance Component — Fix Pending／Delete Pending 工程建議書（2026-08-27）

> **文件性質**：本文件是工程部門對
> `Balance-Component-Maker-Checker-FixPending-DeletePending-Requirement-zh.md`（BA 需求文件，同目錄）
> §4「BA 交予工程部門的評估問題」的正式回覆，獨立成檔而非附加於原始需求文件末端。**本文件僅為書面
> 建議，尚未動任何程式碼**，待 BA／業務 review 並拍板範圍後才會開始實作。

## 1. 需求背景摘要（詳見原始需求文件）

業務提出的 Maker/Checker 交易處理規則：

```text
Maker Submit
     │
     ▼
   PENDING
     │
     ├── Maker → Fix Pending → Resubmit ─────┐
     ├── Maker → Delete Pending → END        │
     ├── Checker → Approve / Release → APPROVED
     └── Checker → Reject
                       │
                       ▼
                   退回 Maker
                       │
                ┌──────┴──────┐
                ▼             ▼
           Fix Pending    Delete Pending
                │             │
             Resubmit         END
                │
                └────→ PENDING → Checker
```

**重要 Business Rule**：Checker Reject 不代表交易已取消或刪除。被 Reject 的交易必須退回 Maker，並
保留讓 Maker 選擇 Fix Pending 後重新提交，或 Delete Pending 的處理方式。

BA 查證結論（已核對現行程式碼，工程部門重新核對後確認一致，無落差）：

| 規則 | 現況 |
|---|---|
| Submit → PENDING | ✅ 已符合 |
| Approve / Release | ✅ 已符合 |
| Reject 不代表刪除（記錄以 `UPDATE status='REJECTED'` 保留，非 `DELETE`） | ✅ 已符合 |
| PENDING 狀態下 Delete Pending（同一 Maker session 內） | ✅ 已符合，含複合交易的連動清理 |
| **REJECTED 狀態下 Delete Pending** | ❌ 前端 `*ngIf` 只認 `PENDING`，缺口 |
| **Fix Pending（修改後 Resubmit）** | ❌ 完全不存在——無 API、無 UI |
| **Maker 事後查看/處理自己 PENDING／REJECTED 交易的清單畫面** | ❌ 完全不存在（Checker 有 Checker Queue，Maker 沒有對應清單） |

值得一提：後端 `domain/statusTransition.ts` 的合法狀態轉換表已經預留
`PENDING/REJECTED --EDIT--> SUPERSEDED`，`BalanceMovement.supersededMovementId` 欄位也已存在——
這是工程部門過去就預想過的地基，只是從未被任何路由/UI 接上去使用。

## 2. 逐項回覆 BA 的 5 個評估問題

### 2.1 回覆 Q1 — Maker 待處理清單（Maker Queue）

**建議：需要做，且是本次需求能否真正落地的前提**（同意 BA 的判斷）。理由不只是「跨天/跨 session」的
極端情境——即使同一個 Maker、同一個瀏覽器分頁，只要切換一次功能（`selectFunction()`）或重新整理頁面，
`submitResult` 這個記憶體狀態就會被清空，Reject 後想回頭處理就已經找不到了。也就是說這個清單畫面是
「日常會用到」的功能，不是邊角案例。

設計方向：比照既有 `CheckerPanelComponent` 的搜尋＋清單模式（同一套 UI 骨架，不用另外發明一套），新增
`MakerQueueService` + 對應清單畫面，依 `createdBy`（目前系統的固定 demo 帳號如 `maker1`）＋
`status IN (PENDING, REJECTED)` 查詢。後端需要一個新的查詢能力：現有 `GET /balance-movements` 只支援
`businessEventId` 單一查詢參數，需要另外擴充一組 `createdBy` + `status` + 分頁的查詢分支（沿用同一個
路由，不用開新路由）。

### 2.2 回覆 Q2 — Fix Pending 的實作方式

**同意 BA 提出的方向**：採用 `balanceContractStore.ts` 既有的「舊記錄標記 SUPERSEDED＋指向新記錄」
模式，不做原地修改（in-place mutation）。這樣才不會牴觸 `eventSeq`（Design doc §8 冪等鍵，Maker
Submit 當下產生、之後不可變）的既有設計，也符合 `balance_movements` 表本身「append-only，只新增不
修改既有列」的既有原則（`balanceMovementStore.ts` 檔頭本身就有這條原則的註解）。

技術上需要新增的東西：
- 一個新欄位 `superseded_by_movement_id`（正向指標，`supersededMovementId` 目前是反向指標，只有新
  記錄指回舊記錄，沒有舊記錄指向新記錄的欄位——兩個方向都要能查）。
- 一個資料庫 transaction 機制（目前 `BalanceService` 建構子雖然拿得到 `db`，但沒有保留成欄位、也
  沒有任何交易包裝）——「舊記錄標記 SUPERSEDED」與「新記錄寫入」必須是同一個原子操作，否則中途失敗
  會產生「舊記錄已作廢、但新記錄沒建立」的資料不一致狀態。

### 2.3 回覆 Q3 — Fix Pending 可修改的欄位範圍

業務先前已經確認過一次（2026-08-26 口頭確認）：**除了 Primary Key（LC Number）與 2ndary Key（IB/SG
Number）之外，該功能原本 Submit 表單上會出現的欄位皆可修改**——包含 Currency（Currency 不算 Natural
Key 的一部分，因此可改）。若 BA review 後對這個範圍有不同意見，請在此以日期標注方式回覆，工程部門會
依最新確認的範圍調整。

### 2.4 回覆 Q4 — REJECTED 之後的 Delete Pending

同意 BA 自己在原始需求文件 §4.4 提出的方案：把 `maker-panel.component.html` 的
`*ngIf="submitResult?.status === 'PENDING'"` 放寬為 `'PENDING' || 'REJECTED'`。A4 不受影響——A4
本來就是靠 `!selectedFunctionStrategy?.checkerRelease?.releasesExistingMovementInPlace` 這個既有
條件把自己排除在這顆按鈕之外（A4 沒有自己建立的 movement 可以刪除），這個排除邏輯與 PENDING/REJECTED
狀態無關，維持不動即可。

**這一項範圍最小、風險最低，建議可以獨立先做、獨立驗收，不需要等 Maker Queue／Fix Pending 完成**——
即使只有這一項先上線，也已經先滿足「Reject 後至少同一 session 內能 Delete Pending」的部分規則。

### 2.5 回覆 Q5 — 複合功能（A3S／B3-Honour／B4-Usance／B5）的 Reject 連動範圍

**建議本次範圍排除複合功能**，理由有兩個：

1. **業務面**：複合功能其中一腿的金額經常是從另一腿計算出來的（例如 A3S 的 SG Redemption Amount =
   MIN(Bill Amount, SG Outstanding)）。如果 Fix Pending 允許修改 Bill Amount，SG Redemption Amount
   就需要重新計算，且原本兩腿共用的 `businessEventId` 關聯、以及各自的 `contingentAccountEntry` 都要
   一併重新產生——範圍會從「編輯一筆交易」膨脹成「重新設計一次複合交易的建立流程」。
2. **技術面（本次查證新發現，BA 文件未提及）**：`deleteMakerPending()` 目前依賴的是**同一個瀏覽器
   session 記憶體裡**的 `compoundLegs`（如 `arrivalSgRedeemMovementId`）才知道要連動清理哪些關聯腿。
   一旦 Maker 是從 Maker Queue（Q1，跨 session 的清單畫面）叫出一筆複合交易來 Delete Pending，這些
   記憶體狀態根本不存在，現有邏輯無法運作——必須額外用 `businessEventId`／`referencedTransactionId`
   反查關聯腿（做法上可以參考 `checker-actions.service.ts` 裡 A3S/B4 `release()` 已經有的
   `resolveLinkedMovementId()` 手法，但需要另外開發，不是現成可以直接套用的）。

因此建議 Reject 本身維持現狀（只動主分錄，不連動）；Delete Pending／Fix Pending 這兩個新動作**這次先
只支援單腿功能**（A1/A2/A3-單獨/A4/A6*/A7/A8/A9/A10/A11/B1/B2/B3-單獨），複合功能（A3S/B3-Honour 這種
會觸發 B4 的路徑/B4-Usance/B5）的 Fix Pending 與 Reject 後 Delete Pending 列為**下一輪需求**，需要
業務與工程另外討論範圍，不建議塞進本次一起做。

## 3. 建議分階段執行順序

```text
Phase 1（小、獨立可驗收）：REJECTED 狀態開放 Delete Pending（§2.4）——僅前端 1 處條件放寬。
Phase 2（中）：Maker Queue — My Pending/My Rejected 清單畫面（§2.1）——僅單腿功能。
Phase 3（中大）：Fix Pending — 編輯＋重新提交（§2.2/§2.3）——僅單腿功能，依賴 Phase 2 才能跨 session 使用。
Phase 4（範圍外，下一輪）：複合功能（A3S/B3/B4/B5）的 Fix Pending 與 Reject 連動清理（§2.5）。
```

每個 Phase 各自完成、各自測試（單元測試＋三個子專案套件全綠＋瀏覽器實測）、各自送審，不合併成一次
大改動。

## 4. 目前狀態

```text
Status: Engineering proposal submitted (2026-08-27) — awaiting BA/business review and scope
        confirmation before any implementation begins. No code changed as part of this document.
```

---

*本文件由工程部門撰寫，內容為新建文件。日後若有 BA 回覆或範圍異動，請依專案 append-only 慣例以日期
標注方式附加於本文件末端，不要覆寫以上內容。*
