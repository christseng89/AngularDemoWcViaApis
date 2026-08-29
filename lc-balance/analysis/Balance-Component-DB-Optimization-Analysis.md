# Balance Component — DB 優化分析

**範圍**：`microservices/balance-component/src/db/schema.ts`、`migrations.ts`、`index.ts`，以及 `src/store/balanceContractStore.ts`、`balanceMovementStore.ts` 的實際查詢寫法
**角色**：專業 DBA 視角的架構檢視（僅提供建議，未變更任何原始碼）
**日期**：2026-08-21

---

## 1. 現況：做得對的地方

在提出改善建議之前，先明確指出現有設計中值得保留、且不是隨便通過的部分：

| 項目 | 位置 | 說明 |
|---|---|---|
| Partial unique index | `schema.ts` 50-52 行 `idx_contracts_one_active` | 用 `WHERE status = 'ACTIVE'` 的 partial index，在 DB 層直接鎖死「同一 logical_contract_id 最多一個 ACTIVE 版本」這個業務不變量，比 app 層 check-then-insert 可靠。 |
| Idempotency key | `schema.ts` 167-168 行 `idx_movements_idempotency` | `UNIQUE(balance_contract_id, event_seq)`，把冪等性鍵鎖在 DB 層而非僅靠 app 邏輯檢查。 |
| WAL 模式正確界定範圍 | `index.ts` 28-38 行 | 只在檔案型 DB 開啟 WAL，`:memory:`（測試用）略過，因為 WAL 本身就需要實體檔案。 |
| 外鍵檢查明確開啟 | `index.ts` 33 行 `PRAGMA foreign_keys = ON` | SQLite 預設是關閉的，很多專案會漏掉；這裡有明確開啟。 |
| 自我揭露已知限制 | `schema.ts` 1-17 行 doc comment | 明確記載 SQLite 全域寫鎖限制，並已標注正式環境須換 PostgreSQL/MySQL 才能驗證「同 LC 序列化、不同 LC 不互相阻塞」的需求——在 prototype 專案中這種誠實度並不常見。 |

---

## 2. 建議清單（依優先級）

### P0 — 現有限制之外的具體漏洞

**~~缺少 `PRAGMA busy_timeout`~~ — 已修復（2026-08-21）**（`index.ts` `createDb()`）

SQLite 拿不到寫鎖時，預設行為是立刻丟出 `SQLITE_BUSY` 錯誤，而不是排隊等待。設計文件 §6 要求「同一張 LC 底下的多筆同時申請會被正確序列化」，但沒有 `busy_timeout` 的話，現況其實是「第二筆並發寫入直接失敗」，並非真正的序列化排隊。

已加上：
```ts
db.exec('PRAGMA busy_timeout = 5000');
```
無條件套用在 file 跟 `:memory:` 兩種分支（不像 WAL 只在 file 分支開），並新增 `test/unit/db/index.test.ts` 的直接驗證（`PRAGMA busy_timeout` 回讀確認為 5000）。全套 397 個 microservice 測試、`tsc --noEmit` 皆綠燈。

### P1 — 結構性：寬表持續用 ALTER TABLE 長胖

**`balance_movements` 表持續用「加欄位」模式吸收新業務需求**

`migrations.ts` 11 筆遷移中，至少 5 筆（id 1、4、10、11，加上原始 schema 的 `released_by`/`released_at`）都是同一個模式：每次有新的角色動作（acknowledged、maker_submitted、present_docs_consumed、cancelled），就再加一組 `xxx_by`/`xxx_at` 欄位。加上另外 7 個 JSON snapshot 欄位（`event_snapshot`、`root_event_snapshot`、`acceptance_event_snapshot`、`sg_event_snapshot`、`finalize_event_snapshot`、`finalize_acceptance_event_snapshot`、`finalize_sg_event_snapshot`），這張表目前已有 47 欄，且成長模式看起來會持續下去。

這是典型的「該正規化成歷史/事件表卻攤平成稀疏欄位」訊號。建議拆成：

- `movement_actions(movement_id, action_type, actor, occurred_at)` —— 把 released / acknowledged / maker_submitted / present_docs_consumed / cancelled 等「誰在何時做了什麼」統一收斂，新增動作類型只需多一列資料，不必再 `ALTER TABLE`。
- `movement_snapshots(movement_id, snapshot_type, payload_json)` —— 用 `snapshot_type` 判別欄位收斂 7 個 snapshot 欄位，未來新增 snapshot 種類同樣不必動 schema。

註：現有的 snapshot-on-write 設計本身是刻意的取捨（換取讀取時不必重算），且專案本身標注為 single-process prototype，這不是「設計錯誤」，而是「值得跟 SQLite→PostgreSQL 遷移一起做」的正規化時機——屆時反正要重新設計表結構，一次到位成本較低。

**~~自我參照欄位缺少真正的 FK 約束~~ — 已修復（2026-08-21，與 CHECK 約束一起做，見 P2 條目）**

當時的 4 個自參照欄位（`supersedes_balance_contract_id` / `superseded_by_balance_contract_id`，指回 `balance_contracts.balance_contract_id`；`superseded_movement_id` / `reversal_of_movement_id`，指回 `balance_movements.movement_id`），內容其實就是各自表的 PK，原本只是裸的 `TEXT` 欄位，沒有 `REFERENCES` 宣告。已補上真正 FK 約束——細節見下方 P2「缺少 CHECK 約束」條目（FK 跟 CHECK 是同一次「重建表」遷移一起做的，寫在同一處說明，避免拆成兩段各講一半）。**2026-08-29 更新**：其中 3 個欄位（連同各自從未被觸發/寫入的機制）已在後續清理中連同各自的 FK 約束一併從 schema 移除（migrations 13/15 重建時直接排除，見 CLAUDE.md 對應決策日誌）；`reversal_of_movement_id` 不受影響，仍保留。

### P2 — 查詢與索引層優化（現有資料量下不急，但值得記錄）

| 項目 | 位置 | 說明 |
|---|---|---|
| 前導萬用字元 LIKE | `balanceContractStore.ts` `listCatalog()` 222-223 行 | `lc_number LIKE '%q%'` 無法使用任何 B-tree 索引，會退化成 `instrument_type` 篩選後的全掃描。資料量變大或搜尋頻繁時，可改前綴比對（`LIKE @q || '%'`，索引可用）或導入 FTS5。 |
| OFFSET 分頁 | 同上 250 行 `LIMIT ... OFFSET` | 深分頁時需先掃過並丟棄前面的 offset 筆，資料量大會線性變慢。未來可考慮改 keyset/cursor pagination。 |
| ~~複合索引缺口~~ — **已修復（2026-08-21）** | `schema.ts` `idx_contracts_parent` | 原本僅索引 `parent_logical_contract_id` 單欄，但實際查詢（`balanceMovementStore.ts` 259/276/295 行——原分析漏列了 295 行的 Acceptance 查詢，同一模式共 3 個呼叫點）是 `instrument_type = ? AND parent_logical_contract_id = ?` 兩個等值條件並用。已改為複合索引 `(parent_logical_contract_id, instrument_type)`；`schema.ts` 直接改新定義（涵蓋全新 DB），並新增 `migrations.ts` migration 12（`DROP INDEX IF EXISTS` + 重建）處理既有 on-disk DB 檔案仍是舊單欄定義的情況（`CREATE INDEX IF NOT EXISTS` 只認索引名稱、不會自動升級既有定義）。新增 `test/unit/db/index.test.ts` 直接驗證：手動建立帶舊版單欄索引的檔案，經 `createDb()` 重新開啟後 `PRAGMA index_info` 確認已升級為複合索引。 |
| ~~缺少 CHECK 約束（+ 自參照 FK，一起做）~~ — **已修復（2026-08-21）** | `schema.ts`、`migrations.ts` migration 13 | 原本 `status`/`instrument_type`/`movement_type`/`exposure_nature`/`tenor_type` 等列舉型欄位完全沒有 CHECK 約束，4 個自參照欄位（`supersedes_balance_contract_id`/`superseded_by_balance_contract_id`/`superseded_movement_id`/`reversal_of_movement_id`）也沒有 FK。**合法值來源，兩種權威分開處理**：`instrument_type`/`status`/`tenor_type`/`movement_status`/`exposure_nature` 這 5 個直接對照 `types.ts` 自己的 union type（該檔本來就是這幾個的唯一權威）；`movement_type` 在 `types.ts` 裡只是 plain `string`，沒有對應 union——真正的權威是 `BalanceService` 自己的 `movementTypeRegistry`（`createMovement()` 已經在跑時強制執行，未知值直接丟 `Unrecognized movementType`），CHECK 清單改抄這份。**動手前先對照真實資料**：對 live dev DB 每個欄位跑一次 `SELECT DISTINCT ... GROUP BY`，確認目前所有既有資料都已經是合法值的子集，沒有需要清理的髒資料，也沒有 `types.ts` 遺漏的合法值——確認過才動手，不是先加約束才發現炸資料。SQLite `ALTER TABLE` 沒法對既有欄位事後補 CHECK/REFERENCES，兩者一起走官方「重建表」流程（`PRAGMA foreign_keys=OFF` → `BEGIN` → 建新表（帶約束）→ 顯式欄位清單 `INSERT ... SELECT`（不用 `SELECT *`，欄位對不上會直接炸而不是悄悄錯位）→ 刪舊表 → 改名 → 重建全部索引 → `COMMIT`/失敗則 `ROLLBACK` → `PRAGMA foreign_keys=ON`），整個包在一個交易裡，中途失敗不會留下半殘表。nullable 欄位（`tenor_type`）的 CHECK 寫成 `CHECK (col IS NULL OR col IN (...))`，不是裸 `CHECK (col IN (...))`——雖然 SQLite 對兩種寫法在 NULL 上的實際放行結果一樣，但寫法本身要留下明確的「這欄允許 NULL」訊號，避免以後複製這個 pattern 到不該允許 NULL 的欄位。**驗證方式**：新增 `test/unit/db/migration13DataPreservation.test.ts`（遷移前後逐欄逐列比對，含同批次互相自參照的列，證明 `PRAGMA foreign_keys=OFF` 真的讓重建過程不受插入順序影響）、`checkAndForeignKeyConstraints.test.ts`（對每個列舉值一一測試合法值全部放行、非法值全部擋下，4 個 FK 欄位分別測「指到不存在的 row 會被擋」跟「指到真實存在的 row 會放行」）、`git stash` 回舊 schema 直接證明這 10 種非法輸入舊版全部靜默放行、`stash pop` 回新版證實全部被擋（合法輸入前後都通過，零回歸）；另外針對「重建表中途失敗」補了一個測試：塞一筆真的違反 CHECK 的髒資料，證明 migration 13 會整個 `ROLLBACK`、不留半殘的 `_new` 表、資料表跟資料都原封不動，而且下次重跑會正確重試（不會被誤判成「已完成」而永遠跳過）。也對照 live dev DB（51 筆 `balance_contracts`）實際重開一次 `createDb()`，確認遷移後筆數不變、CHECK/FK 都在、SQLite 自動把自參照 FK 的表名從暫存的 `_new` 正確改寫回正式表名。全套 425 個 microservice 測試（新增 22 個）、`tsc --noEmit`、Angular 1049 個、backend 34 個皆綠燈。 |
| 金額欄位用 TEXT 儲存 | `schema.ts` 多處 | 這是正確決定（SQLite 無原生 DECIMAL、REAL 有浮點誤差風險），但代表這些欄位無法在 SQL 層直接 `SUM` 或做數值排序；現有程式碼本來就都在 TS 層計算，一致，僅提醒未來若有人想直接對 DB 寫報表查詢須留意此限制。 |
| ~~N+1（2026-08-21 補充，原分析範圍外）~~ — **已修復（2026-08-21）** | `service/balanceService.ts` `listCloseEligibleContracts()`/`evaluateContractCloseEligibility()` | 原分析範圍只寫明 `store/` 兩個檔案的查詢寫法，沒涵蓋 service 層的呼叫模式。A10/B6 Close 的 Step-1 picker 原本先撈最多 200 筆 ACTIVE contract，再對**每一筆**呼叫 `evaluateContractCloseEligibility()`（該函式本身又對每筆候選發 3～4 個查詢），worst case 約 1 + 200×4 ≈ 800 次查詢跑一次。已改為批次：新增 `balanceMovementStore.ts` 的 `listByContractIds()`/`listShgtMovementsForParents()`/`listAcceptanceMovementsForParents()`/`listExaminationMovementsForParents()`，一次 IN-clause 查詢撈完整批候選的所有子事件（依 IPLC_LC/EPLC_CONFIRMATION 條件性略過不需要的批次），`evaluateContractCloseEligibility()` 新增可選的 `preFetched` 參數接住這批資料；`createMovement()`/`release()` 自己的單筆重新檢查（未傳 `preFetched`）完全不受影響，繼續走原本的逐筆查詢路徑。查詢數從 1+4N 降到固定 ~5 次，與候選筆數無關。**驗證方式**：新增 `test/unit/service/closeEligibleContractsBatch.test.ts`，涵蓋（a）5 種候選情境（own-PENDING/SG-PENDING/SG-RELEASED 非零/Acceptance-PENDING/Examination 已核准未消化）加上兩個乾淨案例的完整行為等價測試，先在 `git stash` 回舊實作上跑過確認通過、再 `stash pop` 回新實作重跑同一份測試確認結果完全一致（不只是「測試綠燈」，是實際數值/清單一致）；（b）用 `jest.spyOn` 直接證明批次方法各只呼叫一次、逐筆方法完全不再從這條路徑被呼叫；（c）另外驗證 `createMovement()`/`release()` 的單筆路徑仍走原本方法、從未觸及新的批次方法。 |

---

## 3. 哪些能在 SQLite 上原地做，哪些非換 DB 不可

### 可以在 SQLite 上原地完成

| 項目 | 實作方式 | 工程量 |
|---|---|---|
| ~~`busy_timeout`~~ | 加一行 `PRAGMA` | 極小 — **已完成** |
| ~~複合索引 `idx_contracts_parent`~~ | 普通 `CREATE INDEX` + 一筆 migration | 極小 — **已完成** |
| ~~`listCloseEligibleContracts()` 的 N+1~~ | store 層加 4 個批次查詢方法，service 層改用 `preFetched` | 中 — **已完成** |
| LIKE 前綴比對 / FTS5 | 純查詢層改寫，SQLite 內建 FTS5 虛擬表 | 小 |
| OFFSET → keyset 分頁 | 純查詢層改寫 | 小 |
| 正規化 `movement_actions`/`movement_snapshots` | 建新表、搬資料、改寫 store 層查詢 | 中～大，但與資料庫引擎無關 |
| ~~補 FK 約束~~ | 「重建表」流程（關 FK 檢查 → 建新表 → 搬資料 → 刪舊表 → 改名 → 重建索引 → 開回 FK 檢查） | 中 — **已完成，與 CHECK 約束合併一次做** |
| ~~補 CHECK 約束~~ | 同上，需走「重建表」流程 | 中 — **已完成** |

### SQLite 架構本身解決不了、非換不可

| 項目 | 原因 |
|---|---|
| 同一 LC 序列化、不同 LC 互不阻塞的行級鎖需求 | SQLite 即使開了 WAL，也永遠是整個資料庫檔案級別的單一寫入者，跟 schema 設計或索引無關，本質是「一次只能有一個人在寫，不管寫的是哪張 LC」。正式環境須換 PostgreSQL（`SELECT ... FOR UPDATE` 鎖在 `balance_contract_id` 上）或 MySQL/InnoDB 才能真正驗證此需求。 |

---

## 4. 建議優先順序總結

1. ~~**立即可做**：補 `PRAGMA busy_timeout`~~ — **已完成（2026-08-21）**。
2. ~~**短期可做，低風險**：複合索引、`listCloseEligibleContracts()` 的 N+1~~ — **已完成（2026-08-21，A+B 一起做）**。**LIKE 前綴比對維持不做**——這不是純技術決定：Maker/Checker 查 LC 常用尾碼/中間字串，收斂成前綴比對會拿掉現有的「打中間/尾碼也能查到」能力，是使用者搜尋行為的限縮，不能單方面替使用者決定。之後資料量真的變成效能痛點時，優先考慮 FTS5（保留子字串搜尋），而非前綴比對。**keyset 分頁維持不做**——現有資料量不需要，且會動到 API 介面。
3. ~~**中期規劃（獨立排期，不與 A/B 同批）**：補 FK/CHECK 約束~~ — **已完成（2026-08-21，D+E，獨立於 A+B 那次驗收）**。
4. **與 PostgreSQL 遷移一併處理**：`movement_actions`/`movement_snapshots` 正規化——屆時反正要重新設計表結構，一次到位成本最低。
5. **架構性、必須換 DB 才能達成**：行級鎖 / 跨 LC 並行寫入需求，繼續依 `schema.ts` 既有文件的方向規劃 PostgreSQL 遷移。
