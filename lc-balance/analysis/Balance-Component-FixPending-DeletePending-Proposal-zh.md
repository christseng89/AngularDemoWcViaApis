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


## 5. BA Review（2026-08-27，複查本工程建議書）

依專案「不盲目採信，逐項對照真實程式碼複查」慣例，對本文件 §1-§2 的每一項技術主張重新查證。結論：
**建議書的技術方向正確、可以核准動工，Phase 1 可立即開始；但有一項需要業務書面確認才能鎖定的範圍
（§2.3 的口頭確認）、一項對「既有模式」成熟度的認知需要修正、以及一個與上週才上線的 Inquire Events
排序功能之間的新互動缺口，建議在拍板前一併處理或至少正式記錄。**

### 5.1 複查通過的項目

- `supersededMovementId`／`superseded_movement_id` 欄位確實已存在於 `types.ts:164`／`schema.ts:164`，
  且核對 `balanceMovementStore.ts` 後確認**只在 `createMovement()` 建立新記錄時可寫入（反向指標，
  新記錄指回舊記錄），`balanceService.ts` 目前沒有任何呼叫點真正傳入非 null 值**——建議書「地基已經
  預留、但從未接上路由/UI」的描述核對屬實，也修正了 BA 自己原始需求文件 §2.2 只查了狀態機表格、
  沒查到這個欄位其實已經存在的疏漏（原文件的結論「完全沒有實作」在「動作」層面是對的，但在「資料
  欄位」層面應該更精確地說「欄位已預留，動作/UI 完全未接上」——特此在此更正）。
- `BalanceService` 建構子確實不保留 `db` 成自己的欄位（`balanceService.ts:266-274`，`db` 只轉手交給
  `BalanceContractStore`/`BalanceMovementStore` 建構）——核對屬實，目前這個 service 類別本身確實沒有
  能力自己開一個涵蓋兩個 store 的 `db.transaction()`。
- `balanceMovementStore.ts` 檔頭的 append-only 註解（line 1-12）核對屬實，且明確列出目前唯一允許
  UPDATE 的欄位集合（status/released_*/reason_code/present_docs_consumed_*/acknowledged_*/
  cancelled_*）——**不包含** `superseded_movement_id`，確認這個欄位目前確實只能在 INSERT 當下寫入，
  這點建議書沒有明講但對後續設計很重要，補充於此。
- `GET /balance-movements` 目前僅支援 `businessEventId` 單一查詢參數（`routes/balanceMovements.ts:
  42-46`）——核對屬實，Maker Queue 需要新增 `createdBy`＋`status`＋分頁的查詢分支這件事成立。
- A4 排除邏輯（`!selectedFunctionStrategy?.checkerRelease?.releasesExistingMovementInPlace`）核對
  `maker-panel.component.html:804` 屬實，與 PENDING/REJECTED 狀態無關，Phase 1 不需要額外處理 A4。
- `deleteMakerPending()`（`checker-actions.service.ts:166-221`）核對屬實：所有複合功能分支
  （A3S／B3-Honour／B4-Usance／B5）確實都是直接讀 `ctx.arrivalSgRedeemMovementId` 等**同一 session
  記憶體內的 Context 欄位**，完全沒有呼叫 `resolveLinkedMovementId()`——建議書「Maker Queue 情境下
  現有連動清理邏輯無法運作」的判斷成立。
- SUPERSEDED 狀態對 Balance 計算引擎「零額外工作」：核對 `domain/balanceDerivation.ts:101/110/130`
  的三個計算函式全部用 `status === 'RELEASED'`／`status === 'PENDING'` 精確相等比對——一旦 Fix
  Pending 把舊記錄改成 `SUPERSEDED`，會自動被這三個函式排除，跟 `CANCELLED` today 的處理方式一樣，
  不需要為 SUPERSEDED 另外加條件。**這點兩份文件都沒有明講，補充確認供工程部門安心。**

### 5.2 需要修正的認知——「既有、已驗證的模式」其實也是從未被使用過的地基

建議書 §2.2 說 Fix Pending 應該「採用 `balanceContractStore.ts` 既有的『舊記錄標記 SUPERSEDED＋指向
新記錄』模式」，語氣上暗示這是一個已經在跑、比較有把握的既有機制。**查證後發現並非如此**：

- `balanceContractStore.ts:350`（`markSuperseded()`）——全庫搜尋，**這個方法從未被任何 service 呼叫
  過**（`grep -rn "markSuperseded" src/` 只找到定義本身跟它自己的 doc comment）。
- 這個方法自己的 doc comment 寫著「caller wraps this + the new insert() in one `db.transaction()`」
  ——但既然根本沒有 caller，這句話裡承諾的 `db.transaction()` 包裝**也從未被實作或測試過**。
- 換句話說，Contract 版本層級的「SUPERSEDED＋指向新版」模式，跟 Movement 層級的 `EDIT →
  SUPERSEDED` 狀態轉換一樣，都是**從建立以來就沒有被實際使用過的預留骨架**，不是一個已經跑過
  真實流量、值得信賴的既有機制。

**這不代表建議書的技術方向錯誤**——「新記錄＋舊記錄標記 SUPERSEDED＋交易包裝」仍然是正確的設計
方向，跟 append-only 的既有原則一致，BA 自己原始文件也是這樣建議的。但工程部門在規劃 Phase 3
（Fix Pending）的測試範圍時，應該把「這是本專案第一次真正跑這一整套機制」當成前提，而不是「重用
一個已驗證過的模式」——**建議 Phase 3 的驗收標準明確要求：新的 `db.transaction()` 包裝要有專門的
單元測試覆蓋（含中途失敗時舊記錄/新記錄狀態一致性的測試），不能只靠既有機制的名聲背書。**

### 5.3 新發現的缺口——Fix Pending 與上週才上線的 Inquire Events 排序功能會互動，兩份文件都沒提到

`inquire-events.service.ts`（2026-08-26 剛上線，見 `Balance-Component-InquireEvents-EventSeq-
Effective-Order-Proposal-zh.md`）的 `effectiveEventTime(movement) = movement.releasedAt ??
movement.cancelledAt ?? movement.createdAt` 完全沒有涵蓋 SUPERSEDED 這個新狀態。一筆被 Fix Pending
取代的舊記錄，`releasedAt`／`cancelledAt` 都不會被設定（它從頭到尾都是 PENDING 或 REJECTED，直接被
標記 SUPERSEDED，不經過 release/cancel 這兩個既有動作），排序鍵會落回 `createdAt`——也就是說：

1. **這筆已經作廢的舊記錄，會繼續以它原本的 Submit 時間，跟其他真實有效的事件混在同一個 Inquire
   Events 時間軸裡顯示**，除非額外在 UI 加上「SUPERSEDED」的視覺標示（現有的 `.tb-status-badge`
   系統應該可以直接複用，比照 §6.3 當時對 PENDING/APPROVED 的處理方式），使用者才能分辨這是「已被
   修正取代」的歷史記錄，而不是一筆獨立的有效交易。
2. 如果之後要讓排序更精確，`effectiveEventTime()` 可能需要再加一個 `supersededAt` 時間戳（目前
   schema 沒有這個欄位，只有 `superseded_movement_id` 這個指標欄位，沒有對應的時間戳）——但這是
   「錦上添花」而非阻擋項，**視覺標示（1）才是 Phase 3 上線前必須做的最低限度**，否則使用者查
   Inquire Events 時會被舊的、已作廢的記錄誤導。

建議把這一點正式加入 Phase 3（Fix Pending）的驗收範圍。

### 5.4 需要業務書面確認，不建議僅憑口頭記錄拍板——§2.3 可修改欄位範圍

§2.3 提到「業務先前已經確認過一次（2026-08-26 口頭確認）：除了 Primary Key／2ndary Key 之外皆可
修改，包含 Currency」——**這是一個口頭對話的轉述，BA 無法對照程式碼或任何書面紀錄查證其真實性**，
跟本專案一貫「重要規則一律落成文字」的紀律不一致（對照：業務本次與上次的需求都是先落成文字訊息才
轉交查證，唯獨這一條範圍是用「口頭確認」帶過）。尤其 Currency 是否真的可以在 Fix Pending 時修改，
影響層面不小（`ceilingAmount`/`contingentAccountEntry`/GL 分錄幣別都跟著變動），建議：

- 請業務針對「除 Primary/2ndary Key 外皆可修改（含 Currency）」這句話正式書面確認一次（哪怕只是
  一則訊息也好），比照本次與上次需求文件的處理方式，附加於此文件或原始需求文件末端，再拍板納入
  Phase 3 的正式範圍——不建議僅憑轉述的口頭確認就鎖定範圍。

### 5.5 次要補充：新增 `superseded_by_movement_id` 欄位的實作成本，比單純「加一欄」略高

`db/migrations.ts:154` 自己的既有註解說明：SQLite 的 `ALTER TABLE` 只能 `ADD COLUMN`，**不能**對既有
欄位事後補上 `CHECK`/`REFERENCES` 約束；2026-08-21 那次遷移就是為了幫 `superseded_movement_id`／
`reversal_of_movement_id` 補上 `REFERENCES` 約束，才需要走一次完整的「12 步驟」重建表格流程。如果
`superseded_by_movement_id` 這個新欄位也要跟現有的自我參照欄位一樣有 `REFERENCES
balance_movements(movement_id)` 約束（維持風格一致），就不是單純一行 `ALTER TABLE ADD COLUMN`，
而是需要比照 2026-08-21 那次遷移的規模——建議工程部門在估工時把這點算進去，或者評估這個新欄位是否
可以先不加 `REFERENCES` 約束（只在應用層保證正確性），日後再視需要一併補上，降低這次遷移的複雜度。

### 5.6 總結建議

| 項目 | 結論 |
|---|---|
| 整體方向 | ✅ 同意，可核准動工 |
| Phase 1（REJECTED 開放 Delete Pending） | ✅ 立即可做，風險最低，查證無誤 |
| Phase 2（Maker Queue） | ✅ 方向正確，`GET /balance-movements` 需擴充查詢分支的判斷成立 |
| Phase 3（Fix Pending） | ⚠️ 方向正確，但驗收範圍建議加兩項：(a) 新 `db.transaction()` 包裝要有專門
測試（§5.2，不是重用已驗證機制，是本專案第一次真正使用）；(b) Inquire Events 對 SUPERSEDED 記錄的
視覺標示（§5.3） |
| Phase 3 範圍鎖定前置條件 | ⚠️ §2.3 可修改欄位範圍需要業務書面確認，不建議僅憑口頭轉述拍板（§5.4） |
| Phase 4（複合功能，下一輪） | ✅ 同意延後，理由（業務面金額連動＋技術面 session 記憶體依賴）查證屬實 |
| 資料庫遷移成本 | ℹ️ 提醒：若新欄位要維持 REFERENCES 約束一致性，成本比單純加欄位高（§5.5） |

**建議答覆給工程部門**：Phase 1 立即核准動工；Phase 2 核准規劃；Phase 3 請先取得業務對可修改欄位
範圍的書面確認，並把 §5.2／§5.3 兩項補進驗收標準後即可動工；Phase 4 維持延後、下一輪再議。

---

## 6. 工程部門修正回覆（2026-08-27，回應 §5 BA Review）

依專案「不盲目採信，逐項對照真實程式碼複查」慣例，重新核對 §5 引用的每一項程式碼斷言
（`markSuperseded()` 零呼叫點、`BalanceService` 建構子未保留 `db`、`balanceMovementStore.ts` 檔頭
append-only 清單不含 `superseded_movement_id`、`GET /balance-movements` 僅支援
`businessEventId`、`maker-panel.component.html:804` 的 A4 排除條件、`balanceDerivation.ts` 三個計算
函式的精確字串比對）——**全部屬實，無查證落差**。以下依 §5 的建議修正本建議書。

### 6.1 修正 §2.2 — 不再稱 SUPERSEDED 為「既有、已驗證的模式」

同意 §5.2 的指正：`markSuperseded()`（Contract 版本層級）與 Movement 層級的 `EDIT → SUPERSEDED`
狀態轉換一樣，都是從建立以來從未被真正呼叫過的預留骨架，不是已經跑過真實流量的機制。**技術方向不
變**（新記錄＋舊記錄標記 SUPERSEDED＋交易包裝，仍是正確、與 append-only 原則一致的設計），但
**修正定位**：Phase 3 應視為「本專案第一次真正啟用這一整套機制」，而非「重用一個已驗證過的模式」。

**新增 Phase 3 驗收標準**（納入 §3 的階段規劃）：新的 `db.transaction()` 包裝必須有專門的單元測試
覆蓋，至少包含一組「中途失敗（例如新記錄 insert 失敗）時，舊記錄仍維持原狀態、不會停留在半成品
（舊記錄已標記 SUPERSEDED 但新記錄不存在）」的測試，不能只靠既有機制的名聲背書。

### 6.2 修正 §2.2 — Inquire Events 與 SUPERSEDED 的互動缺口

同意 §5.3 的發現：`effectiveEventTime()`（`inquire-events.service.ts`，2026-08-26 才上線）沒有涵蓋
SUPERSEDED——一筆被 Fix Pending 取代的舊記錄，`releasedAt`/`cancelledAt` 皆為 null（它從未經過
release/cancel，是直接被標記 SUPERSEDED），排序鍵會落回 `createdAt`，與其他真實有效事件混在同一
時間軸顯示，且沒有「已作廢」的視覺區分。

**新增 Phase 3 驗收標準**：SUPERSEDED 記錄在 Inquire Events／Look Up 的 Event Timeline 上，必須有
明確的視覺標示（複用既有 `.tb-status-badge`/`statusBadgeClass()` 系統即可，`SUPERSEDED` 已經有對應
的 `tb-status-badge--neutral` 樣式，只是目前沒有任何真實資料會產生這個狀態值，需要補上讀取路徑）。
`supersededAt` 時間戳（§5.3 提到的「錦上添花」項）**不納入本次範圍**，留待日後有實際需要再議。

### 6.3 修正 §2.3 — 可修改欄位範圍改為「待業務書面確認」，不再視為已拍板

同意 §5.4：口頭轉述不應作為鎖定範圍的依據，與本專案「重要規則一律落成文字」的一貫做法不一致。
**§2.3 原文的「業務先前已經確認過一次（口頭確認）」這句話，狀態改為「待業務書面確認」**——在取得
業務對「除 Primary/2ndary Key 外皆可修改（含 Currency）」的書面回覆之前，這條範圍**不視為已拍板**，
Phase 3 不應以此為前提開始實作 Currency 相關的欄位邏輯。

### 6.4 補充 §2.2 — 資料庫遷移成本的取捨（回應 §5.5）

同意 §5.5 的提醒：若 `superseded_by_movement_id` 要維持與現有自我參照欄位一致的 `REFERENCES
balance_movements(movement_id)` 約束，需要比照 2026-08-21 那次遷移的「12 步驟」重建表格規模，而非
單純一行 `ALTER TABLE ADD COLUMN`。**建議 Phase 3 先不加 `REFERENCES` 約束**（只在應用層／service
方法保證正確性），降低這次遷移的複雜度與風險；是否日後比照既有欄位補上約束，留待下一輪視需要再評估
——這個決定不影響功能本身是否正確運作，純粹是遷移工作量與一致性之間的取捨。

### 6.5 修正後的階段規劃（取代原 §3）

```text
Phase 1（立即可動工）：REJECTED 狀態開放 Delete Pending——不受本次修正影響，原評估維持不變。
Phase 2（核准規劃，可動工）：Maker Queue——不受本次修正影響，原評估維持不變。
Phase 3（暫緩，需先滿足以下前置條件才能開始）：
  (a) 取得業務對可修改欄位範圍（含 Currency）的書面確認（§6.3）；
  (b) db.transaction() 包裝的中途失敗一致性測試，納入正式驗收標準（§6.1）；
  (c) Inquire Events 對 SUPERSEDED 記錄的視覺標示，納入正式驗收標準（§6.2）；
  (d) 新欄位遷移暫不加 REFERENCES 約束，降低本階段遷移複雜度（§6.4）。
Phase 4（維持延後，下一輪再議）：複合功能（A3S/B3/B4/B5）的 Fix Pending 與 Reject 連動清理——不受
  本次修正影響，原評估維持不變。
```

### 6.6 目前狀態（更新）

```text
Status: Engineering proposal revised (2026-08-27) per BA Review §5 — all cited code claims re-verified
        true. Phase 1/2 approved to proceed as originally scoped. Phase 3 held pending: (a) written
        business confirmation of the editable-field scope, (b) transaction-consistency test coverage
        added to its acceptance criteria, (c) SUPERSEDED visual indicator in Inquire Events added to
        its acceptance criteria. Phase 4 remains deferred. No code changed as part of this revision.
```


## 7. BA Review（2026-08-27，複查 §6 修正回覆）

依專案慣例逐項複查 §6 的修正內容。結論：**§6.1／§6.3／§6.4 三項修正核實無誤，可以接受；但 §6.2
（Inquire Events 對 SUPERSEDED 的視覺標示）的問題判斷有誤——工程部門說「需要補上讀取路徑」，實際
查證後發現這條顯示鏈路（抓取→狀態欄位→徽章樣式→徽章圖示→文字標籤）全部早已接好，SUPERSEDED 今天
就已經能正確顯示，不需要新增任何程式碼。這對工程部門是好消息：Phase 3 的前置條件可以少一項。**

### 7.1 複查通過的項目

- §6.1（`markSuperseded()` 從未被呼叫、新增 transaction 一致性測試）：與 §5.2 的查證一致，接受。
- §6.3（可修改欄位範圍改為「待業務書面確認」）：這是流程修正，不涉及程式碼查證，直接接受——這正是
  §5.4 要求的修正方式。
- §6.4（新欄位暫不加 `REFERENCES` 約束，降低遷移複雜度）：這是一個工程判斷取捨，不涉及既有程式碼
  事實查證，方向合理（風險與工作量都下降，功能正確性不受影響），接受。

### 7.2 §6.2 的問題判斷有誤——SUPERSEDED 的顯示鏈路其實早已完整接好，不需要新增讀取路徑

§6.2 說「`SUPERSEDED` 已經有對應的 `tb-status-badge--neutral` 樣式，只是目前沒有任何真實資料會產生
這個狀態值，需要補上讀取路徑」——**前半句對，後半句（需要補讀取路徑）查證後不成立**。逐一核對整條
顯示鏈路：

1. **資料抓取無過濾**：`balanceMovementStore.ts:256-260`（`listByContract()`，`GET
   /balance-contracts/:id/movements` 背後呼叫的方法）SQL 只有 `WHERE balance_contract_id = ?`，
   **沒有任何 status 過濾條件**——SUPERSEDED 記錄跟其他狀態一樣，會被正常抓回來，不會被漏掉。
2. **狀態欄位即時反映，非凍結值**：`InquiredEvent.eventStatus` 本來就是 `movement.status` 本身
   （`inquire-events.service.ts` 自己的 doc comment："`eventStatus` is always the movement's real
   current status"）——一旦 DB 裡的 `status` 變成 `SUPERSEDED`，這裡自動就是 `SUPERSEDED`，不需要
   額外程式碼去讀取或轉換。
3. **徽章樣式已經處理**：`balance-component.model.ts:759`（`statusBadgeClass()`）：
   `if (status === 'SUPERSEDED') return 'tb-status-badge--neutral';`——已存在且會被正確命中（前面
   PENDING/RELEASED/REJECTED/CANCELLED 的判斷式都用精確相等比對，不會誤攔截 SUPERSEDED）。
4. **CSS 樣式已經定義**：`inquire-events.component.scss:450`／`transaction-builder.component.scss:829`
   都有 `&--neutral` 的實際樣式規則（灰色，與同檔案既有註解「SUPERSEDED is gray」一致），不是空的
   class name。
5. **徽章圖示已經處理**：`statusBadgeIcon()`（`balance-component.model.ts:666-671`）對
   `tb-status-badge--neutral` 這個 class 會落到最後的 `return 'dash'`——是一個真實定義好的圖示，
   不是空白/未定義。
6. **文字標籤已經處理**：`displayStatus()`（同檔案 line 611-631）沒有專門處理 SUPERSEDED 的分支，
   但最後 `return status;` 的兜底邏輯會直接顯示字面上的 `"SUPERSEDED"`，跟其他狀態標籤（PENDING／
   APPROVED 等大寫字樣）風格一致，不會顯示空白或 `undefined`。
7. **兩個畫面都已經接上同一套函式**：`inquire-events.component.html:221-222`／
   `transaction-builder.component.html:399-400` 都是透過 `[ngClass]="statusBadgeClass(...)"` 呼叫
   同一套共用函式，不是各自獨立實作，所以兩個畫面會一致正確顯示。

**結論**：從資料抓取到畫面呈現，SUPERSEDED 的完整顯示鏈路今天就已經 100% 存在且能正確運作，只是
從來沒有真實資料觸發過（跟 §5.2 指出的 `markSuperseded()`／`EDIT` 動作「地基已建好、從未被使用」是
同一種情況，只是這次地基剛好是完整的，不需要再建）。**Phase 3 不需要「新增視覺標示」這項工作**，
只需要**新增一筆驗證測試**（例如 `inquire-events.service.spec.ts` 裡加一個 SUPERSEDED 狀態的
`makeMovement()` 案例，斷言 `statusBadgeClass()` 回傳 `'tb-status-badge--neutral'`、畫面確實顯示
"SUPERSEDED"），確認這條從未被真實資料測試過的既有鏈路，在 Fix Pending 真正寫入 SUPERSEDED 之後
還是如預期運作——這是一個小很多的任務，不是新開發。

### 7.3 修正後的 Phase 3 前置條件

```text
Phase 3（暫緩，需先滿足以下前置條件才能開始）：
  (a) 取得業務對可修改欄位範圍（含 Currency）的書面確認 — 維持，§6.3 已正確處理。
  (b) db.transaction() 包裝的中途失敗一致性測試，納入正式驗收標準 — 維持，§6.1 已正確處理。
  (c) [修正] Inquire Events 對 SUPERSEDED 記錄的顯示——不需要新增視覺標示程式碼（顯示鏈路已完整
      存在，見 §7.2），改為新增一筆端對端驗證測試，確認既有鏈路對 SUPERSEDED 也正確運作即可。
  (d) 新欄位遷移暫不加 REFERENCES 約束，降低本階段遷移複雜度 — 維持，§6.4 已正確處理。
```

### 7.4 總結建議

**核准**：Phase 1、Phase 2 維持原判斷，可以立即答覆工程隊開始動工。Phase 3 的四項前置條件裡，
(a)(b)(d) 工程隊的修正回覆已經正確處理，可以接受；(c) 工程隊判斷有誤（以為要新增功能，實際上功能
早就存在），已在此修正為「補一筆驗證測試」，工作量比原本認知的小——這對 Phase 3 整體是好消息，
除了業務書面確認（前置條件 a）之外，其餘準備工作都比原本估計的輕。Phase 4 維持延後，無異議。

**建議答覆給工程部門**：本次修正回覆整體正確、可以核准；唯一需要更正的一點是 §6.2——SUPERSEDED
的顯示鏈路不需要新開發，只需要補一筆驗證測試，工作量請據此下修。待業務書面確認可修改欄位範圍
（前置條件 a）到位後，Phase 3 即可開始動工。

---

## 8. 工程部門回覆（2026-08-27，接受 §7 的修正）

獨立重新核對 §7.2 引用的七項程式碼事實（`listByContract()` 的 SQL 確實只有
`WHERE balance_contract_id = ?`，無 status 過濾；`eventStatus` 確實直接讀 `movement.status`；
`statusBadgeClass()` 的 SUPERSEDED 分支確實存在且不會被前面的判斷式誤攔截；
`inquire-events.component.scss`／`transaction-builder.component.scss` 兩處的 `&--neutral`
規則確實都是實際定義好的灰色樣式，不是空 class；`statusBadgeIcon()` 確實會落到 `'dash'`；
`displayStatus()` 的兜底邏輯確實會回傳字面 `"SUPERSEDED"`）——**全部屬實，§7 的判斷正確，接受
修正**。

**確認**：§6.2 原本判斷「需要補上讀取路徑」是錯的——這條顯示鏈路（資料抓取→狀態欄位→徽章樣式→
徽章圖示→文字標籤）從頭到尾都是用「精確比對已知狀態、其餘一律落到通用兜底」的寫法實作，本來就
不需要為每一個新狀態值個別開發顯示邏輯，SUPERSEDED 只是眾多從未被真實資料觸發過、但兜底邏輯早已
覆蓋到的狀態值之一。Phase 3 前置條件 (c) 依 §7.3 修正為「新增一筆驗證測試」，不再視為新開發項目。

**採用 §7.3 修正後的 Phase 3 前置條件與 §7.4 的答覆建議，兩者取代本文件 §6.5 對應段落**：

```text
Phase 1（立即可動工）：REJECTED 狀態開放 Delete Pending——維持核准，未受影響。
Phase 2（核准規劃，可動工）：Maker Queue——維持核准，未受影響。
Phase 3（暫緩，僅餘 1 項前置條件未到位）：
  (a) [唯一尚待辦]取得業務對可修改欄位範圍（含 Currency）的書面確認。
  (b) db.transaction() 中途失敗一致性測試，納入驗收標準——已確認為正確方向，待 Phase 3 動工時落實。
  (c) 新增一筆 SUPERSEDED 顯示的驗證測試（非新開發），納入驗收標準——已確認為正確方向，待 Phase 3
      動工時落實。
  (d) 新欄位遷移暫不加 REFERENCES 約束——已確認為正確方向，待 Phase 3 動工時落實。
Phase 4（維持延後，下一輪再議）：複合功能的 Fix Pending 與 Reject 連動清理——未受影響。
```

**目前狀態（最終）**：

```text
Status: Engineering proposal finalized (2026-08-27) after two rounds of BA review. Phase 1 and Phase 2
        approved to begin implementation immediately. Phase 3 approved in principle; blocked on a
        single remaining precondition — written business confirmation of the editable-field scope
        (§2.3) — with three acceptance-criteria additions already agreed and ready to apply once Phase
        3 starts (transaction-consistency test, SUPERSEDED display verification test — not new
        development per §7.2 — and deferring the REFERENCES constraint on the new column). Phase 4
        remains deferred to a future round. No application code changed as part of this document or
        its review rounds.
```

---

## 9. Phase 1/2 實作完成 + 使用者追加需求：Delete Pending 後 A1/B1 的 LC Number 必須可重複使用（2026-08-27）

使用者確認 Phase 1（REJECTED 開放 Delete Pending）與 Phase 2（Maker Queue）可以動工後實作完成；實作
過程中使用者進一步發現並確認一項追加需求：**A1/B1 執行 Delete Pending 後，同一個 LC Number 必須可以
重新拿來 Submit**。

### 9.1 Phase 1（REJECTED 開放 Delete Pending）

`maker-panel.component.html`／`transaction-builder.component.ts` 的 Delete Pending 按鈕/guard 從
`status === 'PENDING'` 放寬為 `'PENDING' || 'REJECTED'`（A4 排除邏輯不變）。

### 9.2 Phase 2（Maker Queue）

新增 `GET /balance-movements?createdBy=&status=&page=&pageSize=` 查詢分支
（`BalanceService.listMyMovements()` / `BalanceMovementStore.listByCreatedByAndStatus()`），Angular
新增 `MakerQueueService`/`MakerQueueComponent`，掛在新的頂層「Maker Queue」分頁。`isCompoundShape()`
（判斷 A3S/B4/B5 這類複合提交、依 §2.5 排除 Delete Pending）改用 `movement.businessEventId` 是否有值
判斷，而非原計畫的 `resolveFunctionForMovement()` Strategy 查表——後者對 `IPLC_LC`/`UTILIZE` 這種
情況永遠先解析成單腿的 A3（registry 裡第一個相符的項目），不會是 A3S，屬於已知的既有限制
（`function-strategy.ts` 自己的 doc comment 也明講這點），改用 `businessEventId` 更直接可靠。

### 9.3 追加發現與修復：A1/B1 Delete Pending 後合約本身沒有被釋放

**查證**：A1/B1 的 ISSUE 除了建立 movement，也會同時建立一筆全新的 `balance_contracts` 合約列
（`createContract()`，`status: 'ACTIVE'`，與其 movement 的命運完全獨立）。既有 `cancel()`
（`balanceService.ts`）只 `UPDATE` movement 的 `status`，從不觸碰 `balance_contracts`——導致 Delete
Pending 後，這張 LC 合約永遠停留在 `ACTIVE`，之後同一個 LC Number 再次 Submit 會被既有的 re-ISSUE
guard（`resolveOrCreateContract()`／`findActiveByNaturalKey()`）擋下（409
`NaturalKeyAlreadyExistsError`）。

**修法**：`ContractStatus` 這個 enum 本來就有 `CANCELLED` 這個值，跟 §5.2 發現的 Movement 層級
`SUPERSEDED` 一樣，屬於「保留但從未真正被設過」的既有狀態。新增
`BalanceContractStore.markCancelled()`（沿用 `markClosed()`/`markExpired()`同樣的形狀），並在
`BalanceService.cancel()` 裡：當被取消的 movement 本身是 `ISSUE`、且其合約是 root 類型
（`IPLC_LC`/`EPLC_LC`/`EPLC_CONFIRMATION`，也就是 A1/B1）時，順便把合約也標成 `CANCELLED`。

**安全性依據**：`assertRootIssueReleased()` 既有邏輯保證 root 合約的 ISSUE 尚未 Release 前，不可能有
任何其他 movement 存在——因此「取消一筆 root ISSUE」在邏輯上等同「這張合約從頭到尾只有這一筆、從未
生效」，可以安全退場，不會誤傷任何真實資料。標成 CANCELLED 後，`findActiveByNaturalKey()`
自然找不到它，同一個 LC Number 即可重新 Submit——會建立一張全新、獨立的合約（新
`balanceContractId`/`logicalContractId`），不是復用舊的。

**範圍**：僅限 A1/B1（root ISSUE）。A6/A7/A8/B3 這類建立子合約的 CREATE/ISSUE（Acceptance/SG/Present
Docs）**不在本次範圍內**——是否有一樣「取消時保證是唯一 movement」的前提成立尚未查證，留待需要時
另外評估。特別驗證了 SHGT（A8）也用同一個 `'ISSUE'` 字串當 movementType，但因為不是 root 類型，
`cancel()` 正確地不會去動它的合約。

**測試**：微服務新增 5 筆 `BalanceService.cancel` 測試（PENDING/REJECTED 的 A1 各一、B1 一筆、
非-ISSUE 動作不受影響一筆、SHGT 子合約不受影響一筆）；三套件全綠（Angular 1210/1210、backend
39/39、microservice 597/597）。**即時驗證**：先用 curl 完整跑過 Submit→Delete Pending→確認合約變
CANCELLED（`GET /balance-contracts` 404）→同 LC Number 重新 Submit 成功；再到瀏覽器上重複一次完整
UI 流程（A1 Submit「REUSE-BROWSER-01」→ Delete Pending → 重新選 A1、輸入同一個 LC Number 並用新金額
Submit → 成功變成 PENDING，Inquire Events 的 LC Index 上同時看到一筆 CANCELLED 與一筆 ACTIVE 的
「REUSE-BROWSER-01」），全程 Console 無錯誤。

**UI 順序調整**：使用者要求把頂層分頁順序從「Transaction Processing / Inquire Events / Maker Queue」
改為「Transaction Processing / Maker Queue / Inquire Events」——純 DOM 順序調整，無邏輯變更。

```text
Status: Phase 1 + Phase 2 implemented and live-verified (2026-08-27), including the user-directed
        follow-up (A1/B1 Delete Pending frees the LC Number for reuse via a new contract-level
        CANCELLED status). All changes currently UNCOMMITTED per explicit user instruction — awaiting
        a separate "commit and push" instruction before this lands on main.
```

---

## 10. BA & 業務追加需求：Delete Pending Audit Table（涵蓋 A1–A11/B1–B7 全部功能）（2026-08-27）

**BA & 業務需求原文重點**：同一筆 Business Event 可能經歷多次「Pending → Delete Pending → Resubmit」循環
（不只限於 A1/B1，涵蓋 A1–A11/B1–B7 所有功能），每一次 Delete Pending 都必須留下獨立稽核紀錄
（操作人員、操作時間、Event Seq、交易參考號、刪除原因、相關狀態），**不可覆蓋前一次的紀錄**。

### 10.1 現況查證

- `statusTransition.ts` 的 `CANCELLED` 是終態（`CANCELLED: {}`），單一 movement 列一旦被 Delete Pending
  就不可能再被 Delete Pending 第二次——append-only 設計下，每一次 Delete Pending 對應的那一列本身的資料
  永久保留，不會被覆蓋。
- 但「同一個 Business Event」跨越多次 Delete Pending → Resubmit 循環時，是分散在多筆**獨立的** movement
  列上（每次 Resubmit 都是全新的 `movementId`），今天**沒有任何機制把這一串 Delete Pending 紀錄關聯起來**
  ——`businessEventId` 只用於複合提交（A3S/B4/B5）的同批次多腿關聯，不是為了串連「同一個自然鍵的歷史
  重試鏈」而設計的。

### 10.2 兩個方案的權衡

- **方案 A（輕量）**：擴充既有 `businessEventId` 關聯機制，不新增資料表。
- **方案 B（BA 本身提出）**：新增一張獨立的 `delete_pending_audit` 表，每次 Delete Pending 都
  INSERT 一筆，不依賴/不修改任何既有欄位或關聯機制。

使用者選擇**方案 B**。

### 10.3 實作內容

- **新表 `delete_pending_audit`**（`src/db/schema.ts` 新建 DB 用；`src/db/migrations.ts` migration
  `id: 18` 補現有 DB 用）：`audit_id`（PK）、`movement_id`、`balance_contract_id`、`event_seq`、
  `movement_type`、`source_transaction_ref`、`status_before`（CHECK IN
  `('PENDING','REJECTED')`）、`cancelled_by`、`cancelled_at`、`reason_code`、`remarks`，另建
  `movement_id`/`balance_contract_id` 兩個索引。純 append-only——`DeletePendingAuditStore`
  （新檔 `src/store/deletePendingAuditStore.ts`）只有 `insert()`/`listByMovement()`/
  `listByContract()`，沒有任何 update/delete 方法，比既有 `balanceMovementStore.ts` 的
  「只 insert 新列、只 update 狀態欄位」更進一步——這張表連狀態欄位都不允許被改。
- **掛載點**：`BalanceService.cancel()` 這一個共用方法——不論是 A1–A11/B1–B7 哪一個功能呼叫 Delete
  Pending，或是複合提交（A3S/B4/B5）自己的逐腿 cascade（`deleteMakerPending()` 對每一條腿各呼叫一次
  `api.cancel()`），最終都會經過這唯一入口，因此新增一次 audit insert 就自然涵蓋全部 18 個功能與所有
  複合腿情境，不需要在任何呼叫端另外加程式碼。
- **`DeletePendingAuditRecord`**（`src/types.ts`）：與資料表逐欄位對應的介面。

### 10.4 測試與驗證

- 微服務新增 4 筆測試（`test/unit/service/balanceService.test.ts`，`describe('BalanceService.cancel —
  delete_pending_audit ...')`）：單次 Delete Pending 寫入一筆稽核列且欄位正確、REJECTED 狀態下
  Delete Pending 同樣寫入（`status_before: 'REJECTED'`）、`reasonCode`/`remarks` 缺省時落地為
  `null` 而非拋錯、複合功能自己的逐腿 cascade（`cancel()` 每腿各呼叫一次）各自寫入一筆獨立稽核列
  （驗證兩筆 `audit_id` 不同、各自的 `movement_id` 對應到各自的腿）。
- 三套件全綠：Angular 1210/1210、backend 39/39、microservice 601/601
  （整體覆蓋率 98.72%/95.22%/98.94%/99.31%，四項指標皆高於 95% 門檻；`deletePendingAuditStore.ts`
  本身的 `listByMovement()`/`listByContract()` 目前僅被測試直接以 SQL 查詢繞過驗證，尚未有專屬單元
  測試呼叫這兩個方法本身，但不影響整體覆蓋率門檻，`insert()`——唯一在生產路徑上真正被呼叫的方法——
  已有完整覆蓋）。
- **即時驗證**（直接對執行中的微服務 curl + 直接查詢 SQLite 檔案，因為此表目前尚無對應的 HTTP
  查詢路由）：Submit 一筆 A1 ISSUE（LC `AUDIT-LIVE-001`）→ Delete Pending →
  直接查詢 `balance-component.sqlite` 的 `delete_pending_audit` 表，確認寫入一筆
  `status_before: 'PENDING'`、`cancelled_by`/`cancelled_at`/`reason_code`/`remarks` 皆正確落地的紀錄；
  同時確認 §9.3 的 LC Number 重複使用行為未受影響（同一個 LC Number 重新 Submit 成功，取得全新
  `balanceContractId`），`cancel()` 對外的 HTTP 回應形狀也完全沒有變化（純伺服器端旁路寫入）。

```text
Status: Option B (delete_pending_audit table) implemented and live-verified (2026-08-27), covering all
        18 functions (A1-A11/B1-B7) via the single shared cancel() entry point, including independent
        per-leg audit rows for compound-submission cascades. All changes currently UNCOMMITTED per
        explicit user instruction — awaiting a separate "commit and push" instruction before this lands
        on main. No HTTP route yet exposes this table's contents — read access (e.g. a Maker/Checker-
        facing "Delete Pending history" view) is not yet requested and out of scope for this pass.
```

---

## 11. BA & 業務建議：新增獨立的「INQUIRE DELETE PENDING」稽核查詢功能（2026-08-27）——工程可行性回覆，尚未動工

**BA & 業務原提案重點**：Delete Pending 後的紀錄不進 Inquire Events；另建一個獨立、只查 Delete Pending
操作本身的稽核查詢畫面（不混入 Resubmit/Fix/Approve/Reject），直接讀 §10 的 `delete_pending_audit`
表（不即時算），查詢條件（LC Number/Function/Secondary Reference/Deleted By/Delete DateTime
From–To）、結果欄位（LC Number/Function/Secondary Reference/Event Seq/Delete Sequence/Deleted
By/Delete DateTime/Delete Reason/Previous Status/Audit ID）、固定排序（LC Number, Secondary
Reference, Delete DateTime, Audit ID）、支援 View 開原始交易畫面唯讀重現。

### 11.1 逐欄位可行性查證（對照 §10 的 `delete_pending_audit` 表 + 既有程式碼）

| 建議欄位 | 可行性 | 來源 |
|---|---|---|
| LC Number | ✅ 免改表 | JOIN `balance_contracts.lc_number`（用 `delete_pending_audit.balance_contract_id`）|
| Function（A1–A11/B1–B7）| ✅ 免改表 | 沿用既有 `resolveFunctionForMovement(contract.instrumentType, movement_type)`（`function-strategy.ts`，Inquire Events/Maker Queue 都已在用同一套）|
| Secondary Reference | ✅ 免改表，但要合併兩個既有來源（見 11.2）| `balance_contracts.ib_number`/`sg_number`（子合約類功能）或 `delete_pending_audit.source_transaction_ref`（同合約 Amendment/Utilize 類功能，本來就存在稽核列本身）|
| Event Seq | ✅ 已有欄位 | `delete_pending_audit.event_seq` |
| Delete Sequence | ✅ 可算，但分組鍵需要業務確認（見 11.2）| 需 group by 自然鍵，見下 |
| Deleted By | ✅ 已有欄位 | `delete_pending_audit.cancelled_by` |
| Delete DateTime | ✅ 已有欄位 | `delete_pending_audit.cancelled_at` |
| Delete Reason | ✅ 已有欄位 | `delete_pending_audit.reason_code`（/`remarks`）|
| Previous Status | ✅ 已有欄位 | `delete_pending_audit.status_before` |
| Audit ID | ✅ 已有欄位（PK）| `delete_pending_audit.audit_id` |
| 查詢即使原合約後來 Resubmit/Approve/Close 仍完整保留 | ✅ 天然成立 | `balance_contracts` 本身也是 append-only、從不物理刪除，即使狀態變成 CANCELLED/CLOSED/SUPERSEDED，JOIN 永遠找得到那一列原始資料 |
| View 開原始交易畫面（唯讀，重現「當時刪的是什麼」）| ✅ 免新建路由 | movement 本身的欄位值從建立那刻起就凍結不變（CANCELLED 是終態，沒有人事後改內容）——用既有 `GET /balance-contracts/:id/movements` 撈出該合約全部 movement，配合既有 `reconstructOriginalModel(movement, contract)`（Inquire Events Original Transaction Screen 已在用）就能 100% 重現，不需要新的單筆 movement GET 路由 |

**結論：完全不需要修改 `delete_pending_audit` 這張表本身**——§10 已有的欄位涵蓋所有需求，只需要新增一個查詢層（新 API + 新 Angular 畫面）。

### 11.2 三個需要業務確認的設計點（不是技術限制，是行為定義）

**(a) Delete Sequence 的分組鍵，應該用「自然鍵」而不是 `balance_contract_id`**

原因：A1/B1（root ISSUE）因為 §9.3 的 LC 重複使用修法，每次 Resubmit 都會產生一張**全新**的
`balance_contract_id`（新合約列），但 LC Number 不變；A2–A11/B2–B7（非 root）Delete Pending 後
Resubmit，走的是同一張既有合約，`balance_contract_id` 不變。也就是說如果直接用
`balance_contract_id` 分組計算「第幾次」，A1/B1 的多次 Resubmit 鏈永遠只會各自顯示「Delete #1」
（因為每次都是不同合約 ID），沒辦法呈現您畫面範例裡「LC001 → 連續 Delete #1/#2/#3」那種效果。

**建議**：Delete Sequence 改用**自然鍵**分組——`(instrument_type, lc_number, ib_number,
sg_number)`——同一個 LC/IB/SG 組合不論中間換過幾張合約列，都算同一條鏈，按 `cancelled_at` 排序給
序號。這樣 A1/B1、A2–A11/B2–B7 都能正確呈現連續的 Delete #1/#2/#3。

**待確認**：以上「自然鍵分組」是否就是您畫面範例真正想要的定義？（範例本身只示範了子合約類情境
LC001/IB001/SG001，沒有涵蓋 A1/B1 這種會換合約 ID 的情況，所以特別點出來確認。）

**(b) Secondary Reference 要合併兩個既有來源，不是單一欄位**

現有 `secondaryReferenceForEvent()`（Inquire Events 共用）目前只處理 SHGT（`sg_number`）跟
`EPLC_EXAMINATION`（`ib_number`）兩種子合約類型，其他功能（A2 Amendment No、A3/A4 IB
Number、B4/B5 EB Number 等）回傳固定的 `'—'`——因為那些場景的「Secondary Reference」其實是存在
`sourceTransactionRef`（movement 自己的欄位，§10 的 `delete_pending_audit.source_transaction_ref`
本來就有存），不是合約的自然鍵欄位。這個新畫面要把兩種來源合併成一個統一的顯示邏輯（子合約類用
`ib_number`/`sg_number`，其餘用 `source_transaction_ref`），是**新的、比現有 Inquire Events 更完整**
的呈現，不是既有 bug，但需要新寫一個函式，不能直接複用 `secondaryReferenceForEvent()`。

**(c) Function 篩選條件是前端計算，不是伺服器端真篩選**

Function（A1–A11/B1–B7）本身沒有存在任何資料表欄位裡，是既有 `resolveFunctionForMovement()` 這個
Angular 端的純函式，依 `instrumentType`+`movementType` 查表算出來的顯示層概念（跟 Inquire
Events/Maker Queue 完全同一套邏輯）。**建議**：新 API 只依 LC Number/Deleted By/Delete DateTime
區間做伺服器端篩選+分頁（配合 JOIN `balance_contracts` 取得 LC Number 才能篩），Function 篩選在
Angular 端對已抓回的那一頁結果再過濾一次——跟本專案既有 `CatalogPickerService`「抓一批、前端再篩」
的既定慣例一致。**取捨**：如果某個 LC 的 Delete Pending 歷史筆數很多、又剛好篩選的 Function
在該頁裡佔比很低，畫面上一頁可能顯示筆數偏少——考量稽核查詢通常先用 LC Number 縮小範圍，且單一 LC
的 Delete Pending 歷史筆數在實務上不會很大，這個取捨可接受，但先點出來確認。

### 11.3 建議的技術設計（供確認，尚未動工）

- **新 microservice 路由**：`GET /delete-pending-audit?lcNumber=&deletedBy=&from=&to=&page=&pageSize=`
  ——`DeletePendingAuditStore` 新增一個 JOIN 查詢方法（`delete_pending_audit` JOIN
  `balance_contracts`），一次回傳稽核列 + 該列需要的合約欄位（`instrumentType`/`lcNumber`/
  `ibNumber`/`sgNumber`），伺服器端排序固定為 `lc_number, (ib_number 或 sg_number), cancelled_at,
  audit_id`（對應您要求的排序）。
- **Angular 新增**：`InquireDeletePendingService`（比照 `MakerQueueService`/`InquireEventsService`
  的既有慣例，plain class）+ `InquireDeletePendingComponent`，掛在新的頂層分頁（獨立於 Inquire
  Events/Maker Queue，符合您「不用出現在 Inquire Events 裡、獨立功能」的定位）。
- **View 動作**：沿用既有 `GET /balance-contracts/:id/movements` + `reconstructOriginalModel()` +
  `resolveFunctionForMovement()`，開一個唯讀的 Original Transaction Screen（跟 Inquire Events 現有
  的完全同一套元件/邏輯，只是進入點不同）。

```text
Status: Engineering feasibility review complete (2026-08-27) — every proposed field/behavior is
        achievable with ZERO changes to the delete_pending_audit table itself; only a new query API +
        new Angular screen are needed. Three business-meaning design points flagged for confirmation
        before implementation starts: (a) Delete Sequence's grouping key (recommend natural key
        instrument_type+lcNumber+ibNumber+sgNumber, not balance_contract_id, so A1/B1's multi-contract
        Resubmit chains display correctly), (b) Secondary Reference must merge two existing sources
        (contract natural key vs. the audit row's own source_transaction_ref) — new derivation logic,
        not a reuse of the existing secondaryReferenceForEvent(), (c) Function filtering is
        client-side-after-fetch, matching this project's existing CatalogPickerService convention, not a
        true server-side filter. No application code changed yet — awaiting confirmation on (a)/(b)/(c)
        before implementation begins.
```

### 11.4 業務回覆與實作（2026-08-27）——(a) Delete Sequence 確認為系統自動生成、持久化欄位

**業務回覆原文**：「delete seq系統自動生成的ID」——確認 Delete Sequence 是系統自動產生的識別碼，不是
查詢當下才算出來的暫時值，而是**寫入時就由伺服器計算好、存成正式欄位**（跟 §11.1 原本設想的「查詢時
用 window function 動態算排名」不同，屬於更明確的實作方向）。

**與 §11.1 原可行性結論的差異**：這一點使 §11.1「完全不需要修改 `delete_pending_audit` 這張表本身」
的結論需要修正——既然要「持久化」，就需要在這張表新增一個真實欄位，不能只在查詢時用 SQL 動態算。

**實作內容**：

- `delete_pending_audit` 新增 `delete_seq INTEGER NOT NULL` 欄位（`schema.ts` 新建 DB 用；因為這張表
  本身在 git 上還沒有任何 commit，屬於同一個尚未發布的功能，所以直接修改既有的 migration
  `id: 18`，而不是另外疊加一個 migration 19——沒有「不可更動既有已發布 migration」的顧慮）。
- `DeletePendingAuditStore` 新增 `nextDeleteSeq(instrumentType, lcNumber, ibNumber, sgNumber)`：用
  `delete_pending_audit JOIN balance_contracts` 依**自然鍵**（`instrument_type`/`lc_number`/
  `ib_number`/`sg_number`，`ib_number`/`sg_number` 用 `COALESCE(..., '')` 比對讓兩個 NULL 視為相同，
  避開 SQL 的 NULL 比較永遠不相等的陷阱）取目前最大值 `+1`——維持 §11.2(a) 原本的分組建議：分組鍵是
  自然鍵，不是 `balance_contract_id`，這樣 A1/B1 每次 Resubmit 換一張新合約列時，Delete Sequence
  仍然能正確接續（1、2、3...），不會因為換了合約 ID 就重新從 1 起算。
- `BalanceService.cancel()`：在寫入稽核列之前，先用移動本身的 `balanceContractId` 查出合約（沿用
  既有 `NotFoundError` 慣例），取得自然鍵欄位算出 `deleteSeq`，一併寫入 `delete_pending_audit`。

**測試**：微服務新增 3 筆測試——(1) 同一自然鍵連續 3 次 Delete Pending→Resubmit（含 A1 換合約 ID 的
情境）確認 `delete_seq` 正確接續 1/2/3；(2) 兩個不同自然鍵（不同 LC Number）各自獨立從 1 起算，互不
干擾；(3) `DeletePendingAuditStore.listByMovement()`/`listByContract()` 這兩個公開讀取方法本身補上
直接呼叫的測試（原本只被測試繞過去直接下 SQL 驗證，從未真正呼叫過這兩個方法，屬於 §10 就已知的覆蓋率
缺口，這次一併補齊）。三套件全綠：Angular 1210/1210、backend 39/39、microservice
**605/605**（覆蓋率 99.02%/95.14%/100%/99.74%，四項皆過 95% 門檻；`deletePendingAuditStore.ts`
本身覆蓋率補到 100%/83.33%/100%/100%）。

**即時驗證**：對執行中的微服務 curl 建立一筆 A1 ISSUE（LC `SEQ-LIVE-001`）→ Delete Pending →
同一個 LC Number 重新 Submit（取得全新 `balanceContractId`，印證 §9.3 的 LC 重複使用機制確實生效）
→ 再次 Delete Pending → 直接查詢 SQLite 確認兩筆稽核列 `lc_number` 相同、`balance_contract_id`
不同、`delete_seq` 正確為 1 與 2。驗證完畢後透過 Cleanup Database Tables 清除測試資料（同時再次確認
該按鈕本身的外鍵修復仍然正常運作）。

**(b)/(c) 仍待業務確認**——Secondary Reference 合併邏輯、Function 篩選為前端過濾兩點，業務尚未回覆，
維持待確認狀態，尚未動工。

```text
Status: (a) confirmed and implemented (2026-08-27) — delete_seq is now a real, persisted column on
        delete_pending_audit, computed server-side at cancel()-time via a natural-key-grouped query
        (DeletePendingAuditStore.nextDeleteSeq()), NOT derived transiently at read time as §11.1
        originally assumed. This required editing the (still-uncommitted) migration 18 in place, since
        the table has never shipped. 3 new microservice tests, all three suites green (Angular
        1210/1210, backend 39/39, microservice 605/605, all four coverage metrics above 95%), live
        curl-verified against the running dev microservice (two Delete Pending cycles on the same LC
        Number, across two different balanceContractIds, correctly sequenced 1 then 2). (b) Secondary
        Reference merge logic and (c) Function client-side-filter convention remain UNCONFIRMED — the
        rest of the Inquire Delete Pending screen (query API, Angular component) has not started.
```


## 12. BA Review（2026-08-27，複查 §9／§10／§11.4 的實作）

依專案慣例，逐項對照真實程式碼複查已完成的部分（Phase 1、Phase 2、A1/B1 LC 重複使用修法、
`delete_pending_audit` 稽核表、`delete_seq` 持久化欄位）。**結論：核對下來全部屬實，這幾項的安全性
論證都站得住腳，可以視為完成，沒有發現需要修正的錯誤**——與前兩輪（§7 對 SUPERSEDED 顯示的判斷有誤、
§6.2 對「既有模式」成熟度的誤判）不同，這一輪沒有找到類似的認知落差，只有幾點次要觀察供參考。

### 12.1 Phase 1／Phase 2 複查

- `maker-panel.component.html:813` 確認 Delete Pending 按鈕的 `*ngIf` 已改為
  `(submitResult?.status === 'PENDING' || submitResult?.status === 'REJECTED')`，A4 排除條件不變——
  屬實。旁邊 line 786「Go to the Checker section... Release or Reject」提示文字仍只在 PENDING
  顯示——**這是正確行為，不是遺漏**：一筆已經 REJECTED 的交易，叫使用者「去 Release 或 Reject
  它」沒有意義（已經 Reject 過了），維持 PENDING-only 是對的。
- `balanceMovementStore.ts:262`（`listByCreatedByAndStatus()`）、`balanceService.ts:1304`
  （`listMyMovements()`）、`routes/balanceMovements.ts:62` 三層都確實存在——Maker Queue 的後端查詢
  分支核實無誤。

### 12.2 A1/B1 LC Number 重複使用修法——安全性論證逐一核實成立

這是本輪風險最高的一項變更（觸及合約生命週期狀態），逐一核對支撐論證：

- `assertRootIssueReleased()`（`balanceService.ts:1350-1357`）確認：任何非-ISSUE 動作要套用到一個
  root 合約（`ROOT_INSTRUMENT_TYPES = {IPLC_LC, EPLC_LC, EPLC_CONFIRMATION}`），都必須先通過這個
  ISSUE 已經 RELEASED 的檢查（`resolveOrCreateContract()` line 1406-1408 呼叫點，對「用
  `balanceContractId` 直接指定」與「用自然鍵解析」兩種路徑都適用，不是只擋自然鍵路徑）——確認
  「root 合約的 ISSUE 未 Release 前，不可能有其他 movement 存在」這個安全前提站得住腳，REJECTED
  狀態的 ISSUE（`status !== 'RELEASED'`）同樣被這個檢查涵蓋，不只是 PENDING。
- `markCancelled()`（`balanceContractStore.ts:464-469`）是單純 `UPDATE status='CANCELLED',
  effective_to=...`，跟既有 `markClosed()`/`markExpired()` 同一種形狀——核實屬實。
- `findActiveByNaturalKey()`（`balanceContractStore.ts:202-212`）確認 `WHERE status = 'ACTIVE'`——
  一旦舊合約被標記 CANCELLED，這個查詢自然找不到它，`resolveOrCreateContract()` 的 re-ISSUE guard
  不會再誤擋，新 ISSUE 能夠成立——核實屬實。
- **額外查證（兩份文件都沒提到，但屬於審慎覆核範圍）**：`idx_contracts_one_active`
  （`schema.ts:121-123`，`UNIQUE INDEX ... WHERE status = 'ACTIVE'`）是綁在
  `logical_contract_id` 上，不是自然鍵欄位——新 Submit 產生的是全新、獨立的
  `logicalContractId`，不會跟舊的（已 CANCELLED）合約在這個唯一索引上衝突。確認這個修法不會在
  重複使用同一個 LC Number 時撞到任何既有的資料庫唯一性約束。

**結論**：這項修法的安全論證是紮實的，不是想當然爾——查證下來三層防護（ISSUE-未 Release 前無法
附掛其他 movement、`markCancelled()` 正確排除舊合約、唯一索引不會衝突）環環相扣，沒有發現漏洞。

### 12.3 `delete_pending_audit` 表與 `delete_seq` 複查

- `schema.ts:280-309` 的欄位定義（`audit_id` PK、`delete_seq INTEGER NOT NULL`、兩個 FK 參照、
  `status_before` 的 CHECK 限制在 `('PENDING','REJECTED')`、兩個索引）與 §10/§11.4 描述逐欄位核對
  一致。
- `nextDeleteSeq()`（`deletePendingAuditStore.ts:71-84`）：`COALESCE(MAX(delete_seq), 0) + 1`，
  JOIN `balance_contracts` 依自然鍵分組，`COALESCE(c.ib_number, '') = COALESCE(@ibNumber, '')`
  正確迴避了 SQL `NULL = NULL` 恆為假的陷阱——核實屬實，寫法正確。
- **額外查證（審慎覆核）**：`nextDeleteSeq()` 的 SELECT 與後續 `insert()` 是否有並發競態風險（例如
  兩個 Delete Pending 幾乎同時發生，各自算出同一個 `delete_seq`）？查證後**沒有這個風險**——本專案
  全程使用 `better-sqlite3`（同步驅動），加上 Node.js 單執行緒模型，`cancel()` 這整個方法（含
  `nextDeleteSeq()` 的 SELECT 跟 `insert()` 的 INSERT）在同一個呼叫堆疊內同步執行完畢，中途不會有
  其他請求插入執行——不需要額外的交易包裝或鎖，這點與 §5.2/§6.1 提到「Fix Pending 那個
  `db.transaction()` 才需要」是不同情境（那邊需要是因為橫跨兩個 store 的寫入需要原子性，不是為了
  防併發競態；這裡的 `nextDeleteSeq()`+`insert()` 本來就同步無競態）。
- 測試核對：`test/unit/service/balanceService.test.ts:1391` 起確實有對應的
  `describe('BalanceService.cancel — delete_pending_audit ...')` 區塊，`delete_seq` 遞增
  （line 1540-1572）與跨自然鍵獨立計數（line 1575-1629）兩個關鍵情境都有對應斷言，不是空講——核實
  屬實。

### 12.4 次要觀察（不影響核准，供參考）

- §10 自己揭露的覆蓋率缺口（`listByMovement()`/`listByContract()` 原本沒有專屬單元測試，只被
  SQL 直接繞過驗證）已經在 §11.4 這一輪一併補齊——這是好的紀律，值得肯定。
- 本文件所有實作都明確標註「UNCOMMITTED，等候另外的 commit and push 指示」——這是正確的作法，
  但提醒一下：目前這些變更只存在於工作目錄，尚未進版控，若這台機器/環境有任何意外都可能遺失，
  建議確認範圍都滿意後儘快 commit（不需要現在就 push，但至少先 commit 留一個復原點）。

### 12.5 尚未完成、待業務回覆的部分（現況提醒，非新發現）

- §11(b) Secondary Reference 合併邏輯、§11(c) Function 篩選為前端過濾——業務尚未回覆，「INQUIRE
  DELETE PENDING」查詢畫面本身（新 API + 新 Angular 元件）尚未開始動工，這點文件本身已誠實揭露，
  複查後確認現況描述準確，沒有言過其實。

### 12.6 總結

**核准**：Phase 1、Phase 2、A1/B1 LC 重複使用修法、`delete_pending_audit` 表、`delete_seq`
持久化欄位——五項複查全數通過，安全性與正確性論證站得住腳，測試覆蓋對應到位，可以視為這幾項
正式完成。建議：(1) 儘快 commit 這批變更留一個復原點；(2) §11(b)/(c) 等業務回覆後再繼續「INQUIRE
DELETE PENDING」畫面本身的開發，目前暫緩狀態正確，不需要催促。

---

## 13. 「INQUIRE DELETE PENDING」畫面正式實作完成（2026-08-27）——業務回覆 §11(b)/(c) + 追加 UI 需求

業務對 §11.2 的三個設計點依序回覆並追加需求：(a) Delete Sequence 系統自動生成、持久化欄位（已於
§10 補充實作）；(b) Secondary Reference「用第一個方案」（採用 §11.2(b) 提出的合併邏輯）；(c) Function
篩選同意前端過濾。隨後業務再追加三項 UI 需求：整體操作方式應與 INQUIRE EVENTS 一致（Import/Export →
LC Catalog → 選 LC → 該 LC 的 Delete Pending 記錄）；LC Catalog 只顯示「曾經被 Delete Pending 過」的
LC；樣式表比照 INQUIRE EVENTS。

### 13.1 實作內容

**微服務**：
- `BalanceContractStore.listWithDeletePendingHistory()`（新方法）——LC Catalog 的資料來源改為直接查
  `delete_pending_audit`（JOIN `balance_contracts`），用 `SELECT DISTINCT` + 相關子查詢確保：(1) 每個
  LC Number 只出現一次，即使被 Delete Pending 過好幾次、或像 A1/B1 那樣每次 Resubmit 都換一張新
  `balance_contract_id`（§9.3 LC 重複使用機制）；(2) 代表列取「最近一次 Delete Pending」對應的那張
  合約，讓 Tenor Type/Currency/Face Amount 反映最新狀態。新路由
  `GET /delete-pending-audit/lc-catalog?instrumentType=&q=&page=&pageSize=`，回傳格式與既有 `catalog()`
  的 `CatalogPage` 完全相同，方便前端共用同一套分頁元件。

**Angular（SOLID / 避免重複）**：
- 新增 `LcCatalogIndexService`（單一職責：Import/Export 切換 + LC Catalog 搜尋/分頁），
  `fetchPage`/`decorate` 兩個建構子參數讓它可以同時服務「查全部合約」（一般用途，預設行為）跟
  「只查有 Delete Pending 記錄的合約」（Inquire Delete Pending 專用，`fetchPage` 換成新的
  `catalogWithDeletePendingHistory()`）兩種資料來源，不需要為 Inquire Delete Pending 另外複製一份
  side/search/paging 邏輯。
- 把 `InquireEventsService.loadIndex()`原本內嵌的私有方法 `loadIndexRow()`（計算每列的 Tenor
  Type/Currency/Face Amount/Last Event Date）抽成模組層級的匯出函式 `computeLcIndexRow()`——純程式碼
  搬移，行為完全不變（`inquire-events.service.spec.ts` 80 個測試原封不動全過）——`InquireDeletePendingService`
  的 `LcCatalogIndexService` 把這個函式當 `decorate` 使用，兩邊共用同一份計算邏輯，不是各自維護一份
  幾乎一樣的程式碼。**`InquireEventsService` 本身沒有在這次一併改成使用 `LcCatalogIndexService`**——
  它自己的 `indexRows`/`indexSearch` 等欄位名稱已經被 `inquire-events.component.html`
  直接綁定、也被~80個既有測試覆蓋，重新命名/搬遷屬於另一個獨立、有自己風險的重構，不是這次新畫面的
  附帶工作，先記錄下來作為後續建議項目。
- `InquireDeletePendingComponent`/`.scss` 改成跟 `InquireEventsComponent` 完全相同的版面結構
  （`.tb-workspace.tb-workspace--single > .tb-main`）與樣式定義（`.tb-tabs`/`.tb-tab`/`.tb-btn--nav-back`/
  `.tb-hint--ok` 等，全部從 `inquire-events.component.scss` 逐一複製過來，同一套「disclosed, deliberate
  copy」慣例）。
- LC Catalog 表格欄位依業務指示定案為：LC Number / Tenor Type / Currency / LC Amount / Last Event
  Date/Time——**沒有 Status、沒有 Available Balance**（這兩欄是 Inquire Events 自己的欄位，Inquire
  Delete Pending 不需要即時餘額資訊）。

### 13.2 過程中發現並修復的一個真實 UI bug

使用者實測發現：切換 Function 篩選下拉選單時，先前開著的「View」原始交易畫面沒有跟著關閉，會顯示
過期資料。原因是 `[(ngModel)]="service.functionFilter"` 只更新篩選值本身，沒有連帶清除
`service.viewing`。修法：改用展開語法 `[ngModel]="service.functionFilter"
(ngModelChange)="service.functionFilter = $event; service.closeView()"`，切換篩選時一併關閉 View。
純模板變更，依本專案慣例透過 `ng build` 嚴格模板檢查 + 實際瀏覽器操作驗證（Jest 不會渲染模板）。

### 13.3 測試與驗證

- 微服務新增 6 筆 HTTP 整合測試（`GET /delete-pending-audit/lc-catalog`）：`instrumentType` 缺漏
  400、從未 Delete Pending 過的 LC 不出現、Delete Pending 一次的 LC 剛好出現一次、Delete Pending
  多次（跨多張合約）的 LC 仍只出現一次且代表列是最新一次、`instrumentType` 篩選正確區分 Import/Export、
  分頁與 LC Number 排序正確。
- Angular 新增 `lc-catalog-index.service.spec.ts`（12 筆，含預設/自訂 `fetchPage`/`decorate`、
  `excludeCancelled` 透傳、`selectSide`/分頁/錯誤處理）與擴充
  `inquire-delete-pending.service.spec.ts`（+9 筆，涵蓋 `catalogIndex` 的 `fetchPage`/`decorate`
  接線、`selectLcFromIndex()`/`backToIndex()` 的狀態轉換）。
- 三套件全綠：Angular **1254/1254**（覆蓋率 98.68%/96.45%/97%/99%）、backend **39/39**、
  microservice **619/619**（覆蓋率 98.99%/95.08%/100%/99.67%）——`lc-catalog-index.service.ts` 本身
  100%/100%/100%/100%，`inquire-delete-pending.service.ts` 98.92%/86.2%/100%/100%。
- **Live 驗證**：直接 curl `GET /delete-pending-audit/lc-catalog?instrumentType=IPLC_LC` 確認 12 個
  曾經 Delete Pending 過的 LC 各自只出現一次（含 S01、S02 這種被刪過好幾次的舊資料）；瀏覽器完整走一次
  「Inquire Delete Pending → Import LC → 點 RVDP-ROOT-A1 → 顯示 6 筆該 LC 的 Delete Pending 記錄
  （A2/A3×2/A3S/A7/A6，Delete Sequence 依自然鍵正確分組為 1-4 與各自獨立的 1）→ 點 View 開啟原始
  交易畫面 → 切換 Function 篩選為 A3 確認表格正確篩選且 View 面板自動關閉」全程無 Console 錯誤。

```text
Status: Inquire Delete Pending screen (§11's own UI, business-directed 2026-08-27) fully implemented —
        two-layer Import/Export → LC Catalog (scoped to only LC Numbers with delete-pending history,
        DISTINCT-deduplicated even across A1/B1's multi-contract Resubmit chains) → drill-down flow,
        matching Inquire Events' own navigation/stylesheet. One real UI bug found and fixed live
        (Function filter change didn't clear the open View panel). All three suites green (Angular
        1254/1254, backend 39/39, microservice 619/619), live-verified via curl + full browser
        walkthrough. All changes in this section remain UNCOMMITTED per the standing "不要COMMIT"
        instruction.
```

### 13.4 追加調整：View 按鈕改為點擊整列（業務指示，2026-08-27）

移除稽核記錄表格的「Action」欄位/「View」按鈕，改成跟 Inquire Events 自己的 Events 表格一樣的
「Row-click 取代逐列按鈕」慣例（`<tr (click)="service.view(row)">`）——純模板變更，`.tb-table`
既有的 `tbody tr { cursor: pointer; ... }` 樣式（從 Inquire Events 複製過來的同一份）已經內建
hover/pointer 視覺效果，不需要額外補樣式。

### 13.5 過程中發現並修復第二個真實 bug——`describeApiError()` 對連線層級錯誤顯示「[object Object]」

Live 測試 LC Catalog 載入時偶發顯示一個沒有意義的錯誤訊息「[object Object]」。查證：這不是這次新
功能本身的邏輯錯誤（該次載入的全部 49 個 HTTP 請求實際上都回 200），而是這個橫跨全專案共用的
`describeApiError()`（`api-error.ts`）既有的一個缺口——它原本只認得伺服器回傳的 JSON 錯誤格式
（`err.error.message`），遇到連線層級的失敗（伺服器一時連不上、CORS、DNS 等）時，Angular 的
`HttpErrorResponse.error` 是一個 `ProgressEvent`，沒有 `.message`，退回 `String(err)` 就印出
`[object Object]`（`HttpErrorResponse` 沒有覆寫 `toString()`）。修法：在 `String(err)`
之前多檢查一層 `err.message`——`HttpErrorResponse` 本身就有一個現成的、人類看得懂的 `.message`
欄位（例如「Http failure response for http://localhost:4200/...: 0 Unknown Error」），原本一直
沒被用到。新增 `api-error.spec.ts`（5 筆測試，這個共用函式先前完全沒有專屬測試），Angular
1259/1259 全綠（`api-error.ts` 覆蓋率 100%），無既有測試受影響（全部既有呼叫端都用
`err.error.message` 這個形狀，沒有依賴舊的 `String(err)` 兜底行為）。**這是一個橫跨全專案的共用
函式修復，不是 Inquire Delete Pending 專屬的**——`CheckerActionsService`、`MakerQueueService`
等所有既有呼叫端都受益。


## 14. BA Review（2026-08-27，複查 §13「INQUIRE DELETE PENDING」畫面實作）

依專案慣例逐項對照真實程式碼複查 §13 宣稱完成的實作。**結論：核對下來全部屬實，這項新畫面可以視為
完成，沒有發現需要修正的錯誤。**這也是使用者要求的「A/B（Delete Pending 相關的新增功能，含本次
Inquire Delete Pending 畫面）最終複查」的範圍。

### 14.1 微服務複查

- 路由 `GET /delete-pending-audit/lc-catalog?instrumentType=&q=&page=&pageSize=`（`routes/
  deletePendingAudit.ts:14`）確認存在，`instrumentType` 缺漏會擲出 `RequestValidationError`——核對
  屬實。
- `BalanceContractStore.listWithDeletePendingHistory()`（`balanceContractStore.ts:377-408`）逐行核對
  SQL：外層 `SELECT DISTINCT c.*` 加上 `c.balance_contract_id = (相關子查詢 ORDER BY d2.cancelled_at
  DESC, d2.audit_id DESC LIMIT 1)`，確保同一個 LC Number（即使像 A1/B1 那樣橫跨多張
  `balance_contract_id`）只回傳一列，且該列固定是「最近一次 Delete Pending」對應的那張合約——邏輯
  正確，`COUNT(DISTINCT c.lc_number)` 與分頁查詢的過濾條件（`instrument_type`/`q`）也一致，沒有
  發現會導致總數與實際回傳筆數對不上的邊界情況。

### 14.2 Angular 複查

- `LcCatalogIndexService`（新檔案，97 行）核對其 `fetchPage`/`decorate` 兩個建構子參數確實可替換，
  `InquireDeletePendingService` 建構子（line 71-78）正確傳入 `catalogWithDeletePendingHistory()` 作為
  自訂 `fetchPage`、`computeLcIndexRow()` 作為 `decorate`——與 §13.1 描述一致。
- `computeLcIndexRow()`／`LcIndexRow`（`inquire-events.service.ts:174/238`）確認為模組層級匯出函式，
  原本的私有方法 `loadIndexRow()` 已不存在（`grep` 找不到殘留）——確認是乾淨的搬移，不是留下重複的
  兩份邏輯。
- `InquireEventsService` 本身核對確實沒有被一併改成使用 `LcCatalogIndexService`——與 §13.1 誠實揭露
  的範圍一致，屬於刻意保留的後續建議項目，不是遺漏。
- §13.2 UI bug 修法：`inquire-delete-pending.component.html:94` 確認
  `[ngModel]="service.functionFilter" (ngModelChange)="service.functionFilter = $event;
  service.closeView()"`——核對屬實，切換 Function 篩選會正確關閉已開啟的 View。
- §13.4 Row-click 修法：`inquire-delete-pending.component.html:140` 確認
  `<tr *ngFor="let row of service.filteredItems" (click)="service.view(row)">`，Action 欄位/按鈕已
  移除——核對屬實。
- §13.5 `describeApiError()` 修法：`api-error.ts:16-19` 確認 `shaped?.error?.message ??
  shaped?.message ?? String(err)`，在退回 `String(err)` 之前多檢查一層 `HttpErrorResponse` 自帶的
  `.message`——核對屬實，且這是橫跨全專案共用的函式，`CheckerActionsService`/`MakerQueueService`
  等既有呼叫端會一併受益，不會有既有測試因為呼叫形狀改變而壞掉（原本都是用
  `err.error.message` 這個形狀）。

### 14.3 測試複查

- 微服務 `test/unit/app.test.ts:3841` 起確認存在
  `describe('HTTP integration — GET /delete-pending-audit/lc-catalog ...')` 區塊，逐一核對 6 個
  情境（400 缺 instrumentType、從未 Delete Pending 過不出現、單次出現一次、跨合約多次仍只出現一次、
  Import/Export 分流、分頁）與 §13.3 描述完全一致。
- Angular `api-error.spec.ts`（5 筆）、`lc-catalog-index.service.spec.ts`（12 筆）、
  `inquire-delete-pending.service.spec.ts`（現有 29 筆，與「+9」的說法量級相符，惟因未取得變更前的
  基準行數，無法逐一核對新增的確切 9 筆是哪幾筆，只能確認測試檔案存在且涵蓋範圍與描述相符）——
  與 §13.3 描述一致。
- **一點工具限制，非程式碼缺陷**：本次嘗試直接在裝置端 shell 執行 `jest`（微服務端）驗證測試實際
  通過，遇到 `Preset ts-jest not found relative to rootDir` 的環境錯誤（`node_modules/ts-jest`
  確實存在，研判是這台橋接用 Linux VM 掛載檔案系統對 `node_modules` 內符號連結解析方式的既有限制，
  非本次程式碼的問題）。因此本輪對測試「確實會通過」這一點，改採**逐行核對測試案例內容與程式邏輯是否
  吻合**的方式查證（如上），而非重新執行整個套件取得通過筆數；§13.3 宣稱的三套件全綠（Angular
  1259/1259、backend 39/39、microservice 619/619）本身無法在本輪由 BA 這端獨立重新執行驗證，
  記錄於此供留意，但不影響上述逐項程式碼核對的結論。

### 14.4 總結

**核准**：§13「INQUIRE DELETE PENDING」畫面（LC Catalog 層＋稽核記錄層＋View 原始交易畫面）、
連同 §13.2/§13.4/§13.5 三個過程中發現並修復的 UI/共用函式 bug，逐項核對程式碼後**沒有發現問題**。
至此，Delete Pending 相關的整個功能族群（Phase 1 REJECTED Delete Pending、Phase 2 Maker Queue、
A1/B1 LC 重複使用修法、`delete_pending_audit` 稽核表與 `delete_seq`、Inquire Delete Pending 查詢
畫面）皆已複查完成、全數核准，可以視為這一輪需求的完整交付。

---

**業務詢問（2026-08-27）：「如果沒問題 可以讓工程隊做C項 (FIX PENDING) 了嗎?」——BA 答覆：暫時還不行。**

Delete Pending 全部項目（A/B）核准完成，但 Fix Pending（Phase 3，本文件裡的「C項」）**還有一個從
§5.4 第一次提出、§6.3／§7.4／§8 每一輪都重複確認、至今仍未解除的前置條件尚未滿足**：

> Phase 3 前置條件 (a)：取得業務對「除 Primary/2ndary Key（LC Number／IB-SG Number）之外皆可修改，
> 包含 Currency」這句可修改欄位範圍的**書面確認**——§2.3 原文引用的是「2026-08-26 業務口頭確認」，
> 這件事從 §5.4 起就被標記為「無法對照書面紀錄查證，不建議僅憑口頭轉述拍板」，工程部門在 §6.3 也已
> 接受把這條範圍改列為「待業務書面確認」，但複查至 §13 為止，本文件中**沒有出現過這句書面確認**。

其餘三項前置條件（(b) `db.transaction()` 中途失敗一致性測試、(c) Inquire Events 對 SUPERSEDED 記錄
的顯示驗證測試——已在 §7.2 更正為「只需補測試，不需新增顯示程式碼」、(d) 新欄位暫不加 REFERENCES
約束）都已在 §6-§8 之間確認為工程部門的既定共識，不是問題。

**建議做法**：請業務針對「Fix Pending 可修改欄位範圍＝除 LC Number／IB-SG Number 外皆可修改，
包含 Currency」這句話，用文字（哪怕只是一則訊息）正式確認一次，附加於此文件或原始需求文件末端；
確認到位後，Phase 3（Fix Pending / C項）即可請工程隊動工，其餘技術面前置條件已經備妥。


## 15. 業務書面確認：Fix Pending 可修改欄位範圍——排除 Currency（2026-08-27）

業務對 Phase 3 前置條件 (a)（§5.4 提出、§6.3/§7.4/§8/§14 每輪覆核都標記為「唯一尚待書面確認」）
正式回覆，**修正了 §2.3 原先「含 Currency」的口頭轉述**：

> 「Currency 的 FIX PENDING 不許修改。A1、A2 要修改 [Currency]，先 Delete Pending 重新輸入。」

### 15.1 BA 解讀與確認範圍

逐字對照業務原文，正式規則定義為：

- **Currency 全面排除在 Fix Pending 可修改欄位範圍之外**——不論哪一個功能（不只 A1/A2，業務是舉
  Import LC 的 Issue／Amendment 為例，但規則本身是針對「Currency 這個欄位」，不是針對特定功能代碼
  才排除，其餘會出現 Currency 欄位的功能同樣適用）。
- 若一筆 PENDING／REJECTED 交易的 Currency 真的需要修正，**正確路徑是 Delete Pending 該筆交易後
  重新 Submit（等同重新輸入一次）**，而不是透過 Fix Pending 就地編輯。
- 除 Currency 之外，§2.3 原先「除 Primary/2ndary Key（LC Number／IB-SG Number）之外皆可修改」的
  範圍維持不變——**這次修正只縮小了範圍（拿掉 Currency），沒有再放寬其他欄位**。

### 15.2 BA 複查——這個決定同時解掉了 §5.3／§5.4 當初的風險提示

回顧 §5.4：BA 當時就指出「Currency 是否真的可以在 Fix Pending 時修改，影響層面不小
（`ceilingAmount`/`contingentAccountEntry`/GL 分錄幣別都跟著變動）」，建議業務書面確認、不要僅憑
口頭轉述拍板。**業務這次的書面決定，實質上是把最高風險的那個欄位直接排除在 Fix Pending 範圍外**，
連帶結果：

- Fix Pending 的欄位驗證邏輯不需要處理「Currency 改變後，`ceilingAmount`/`contingentAccountEntry`/
  GL 分錄幣別要不要跟著連動」這個原本最複雜的分支——因為 Currency 根本不會透過這個路徑改變，範圍
  比原本規劃的還單純。
- Currency 真的要改時走「Delete Pending＋重新 Submit」，等同於這筆交易從未存在過、重新走一次完整
  的 Maker Submit 流程——所有跟 Currency 相關的欄位（ceilingAmount 等）自然會用新的 Currency 從頭
  正確計算，不存在「半套」風險。

**結論**：業務這次的書面確認不只是「補齊前置條件 (a)」，還實質降低了 Phase 3 的技術風險與工作量。
沒有發現與既有程式碼/設計衝突之處。

### 15.3 Phase 3 前置條件——全部解除，C 項（Fix Pending）可以請工程隊動工

```text
Phase 3 前置條件最終狀態：
  (a) [已解除，2026-08-27] 業務書面確認可修改欄位範圍 = 除 LC Number／IB-SG Number／Currency
      外皆可修改；Currency 如需修正，走 Delete Pending＋重新 Submit，不走 Fix Pending。
  (b) [已於 §6.1 確認] db.transaction() 包裝的中途失敗一致性測試，納入正式驗收標準。
  (c) [已於 §7.2 修正並確認] Inquire Events 對 SUPERSEDED 記錄的顯示——顯示鏈路已存在，只需新增
      一筆驗證測試，不需新增顯示程式碼。
  (d) [已於 §6.4 確認] 新增 superseded_by_movement_id 欄位暫不加 REFERENCES 約束，降低本階段
      遷移複雜度。
```

四項前置條件全部解除。**BA 答覆：可以請工程隊開始動工 Phase 3（Fix Pending，即業務所稱的「C項」）**，
請工程隊依 §2.2（技術做法：新記錄＋舊記錄標記 SUPERSEDED＋db.transaction() 包裝）與本節最終確認的
欄位範圍（排除 LC Number／IB-SG Number／Currency，其餘欄位皆可修改）進行實作，驗收標準比照
(b)(c)(d) 三項納入正式測試範圍。


## 16. BA 覆核 TODO.md §10 更新 + 方向指示（2026-08-27）——OAS 文件版本 bump 與「下一步做什麼」

### 16.1 複查 TODO.md §10 這次的更新內容

逐項對照真實檔案，核實如下：

- `analysis/balance-component-api.yaml:785`／`analysis/balance-component-channel-api.yaml:160`
  ——`version` 欄位確認分別為 `"1.28.0"`／`"1.6.0"`，與回報一致。
- 用 Python `yaml.safe_load()` 獨立重新驗證兩份 YAML（不依賴回報所稱的 `js-yaml` 驗證結果），
  **兩份皆能正確解析，沒有語法錯誤**。
- `analysis/balance-component-api.yaml:1630`（`/delete-pending-audit`）、`:1679`
  （`/delete-pending-audit/lc-catalog`）、`:2274`（`DeletePendingAuditRecord` schema）、`:890`
  （`excludeCancelled` 參數）——確認新增的路徑/schema 都真的存在於文件裡，不是空頭支票。
- `commit 9242f0c` 的部分——**這一項本輪 BA 無法從目前可存取的環境獨立查證**：這個掛載路徑下沒有
  `.git` 目錄（`git status`/`git log` 皆回報 "not a git repository"），推測是這個掛載點本身不包含
  版控後設資料（例如是使用者手動同步出來的一份工作副本，而不是完整 clone）。**不是質疑這句話不實**，
  只是誠實記錄「這一點目前無法由 BA 這端驗證，需要信任工程隊自己的 git 操作紀錄」，比照本專案一貫
  「凡是無法查證的都要明講」的紀律。

**結論**：TODO.md §10 這次的更新內容核對下來屬實（除了 commit hash 這點因環境限制無法查證），可以
接受。

### 16.2 業務詢問「OAS/TODO 文檔改動要不要 commit」——BA 建議：可以 commit，但請由您（業務/PM）
親自下達「commit and push」指示

這批改動是純文件（TODO.md + 兩份 OAS YAML），內容已經過本節重新驗證語法正確、內容與程式碼路由/
schema 相符，風險低，沒有理由不 commit。**但本文件從 §9 開始就白紙黑字記著「不要 COMMIT」是
使用者本人的明確指示，「等候另外的 commit and push 指示」——這件事的性質是專案流程控管，不是程式碼
正確性判斷，不屬於 BA 職權範圍內可以代為拍板的事項。**

**BA 建議**：內容沒問題，可以 commit；但請您本人明確說一聲「commit and push」，而不是由 BA 這端
自行解讀「沒問題」就等於「可以 commit」。

### 16.3 業務詢問「可以繼續推進 Fix Pending 完整編輯功能嗎，要用哪一份計畫？」——BA 指示：以本文件
§1–§15 為唯一依據，`structured-coalescing-quasar.md` 不採用

查證後發現：全 repo（含 git 歷史，雖然本掛載點沒有 `.git`，但 `find` 遍歷工作目錄）都找不到名為
`structured-coalescing-quasar.md` 的檔案——這類「形容詞-形容詞-名詞」風格的檔名，是 Claude
Code/Agent 工具自動產生的暫存草稿檔常見命名方式，研判是**另一個 session 的暫存草稿**，從未進入這個
repo、從未經過這一連串 BA↔工程 的複查與修正流程，不是本文件正式追蹤的交付物。

**即使那份草稿本身內容合理，也不應該作為 Fix Pending 實作的依據**，理由：

1. 它是「Option B（`delete_pending_audit`）之前的設計討論產物」——時間點早於本文件 §5-§8 那一連串
   BA↔工程往返修正（包含：拆穿「既有已驗證模式」其實是從未使用過的地基／SUPERSEDED 顯示鏈路其實
   已經完整存在不需新增程式碼／`superseded_by_movement_id` 遷移成本的提醒），這些修正沒有機會反映
   進那份草稿。
2. **最關鍵**：它必然沒有反映 §15 業務剛剛才拍板的欄位範圍最終定案——**Currency 排除在 Fix Pending
   可修改範圍外**。如果工程隊照舊草稿實作，很可能會做出允許修改 Currency 的版本，之後還要再改一次。

**BA 正式指示**：Fix Pending（C項）的實作**唯一依據**是
`analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md` 本文件的 §2.2（技術做法：
新記錄＋舊記錄標記 SUPERSEDED＋`db.transaction()` 包裝）與 §15（最終欄位範圍：排除 LC Number／
IB-SG Number／Currency，其餘皆可修改；Currency 如需修正走 Delete Pending＋重新 Submit），驗收標準
納入 §6.1／§7.2 訂出的兩項測試要求（`db.transaction()` 中途失敗一致性測試、SUPERSEDED 顯示驗證
測試）。`structured-coalescing-quasar.md` 那份草稿**不採用**，若其中有任何工程隊認為值得保留的
技術細節，請重新提出、走一次跟本文件同樣的 BA 複查流程，不要直接搬用未經覆核的舊草稿內容。
