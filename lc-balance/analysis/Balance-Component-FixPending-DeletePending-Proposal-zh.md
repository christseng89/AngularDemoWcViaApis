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
