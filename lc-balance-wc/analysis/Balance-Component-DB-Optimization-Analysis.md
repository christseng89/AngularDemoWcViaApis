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

**缺少 `PRAGMA busy_timeout`**（`index.ts` `createDb()`）

SQLite 拿不到寫鎖時，預設行為是立刻丟出 `SQLITE_BUSY` 錯誤，而不是排隊等待。設計文件 §6 要求「同一張 LC 底下的多筆同時申請會被正確序列化」，但沒有 `busy_timeout` 的話，現況其實是「第二筆並發寫入直接失敗」，並非真正的序列化排隊。

建議修法：
```ts
db.exec('PRAGMA busy_timeout = 5000');
```
在 SQLite 仍是主力儲存的這段期間，這個問題比「換資料庫」更急迫——因為現有實作連自己宣稱的行為都還沒真正兌現。

### P1 — 結構性：寬表持續用 ALTER TABLE 長胖

**`balance_movements` 表持續用「加欄位」模式吸收新業務需求**

`migrations.ts` 11 筆遷移中，至少 5 筆（id 1、4、10、11，加上原始 schema 的 `released_by`/`released_at`）都是同一個模式：每次有新的角色動作（acknowledged、maker_submitted、present_docs_consumed、cancelled），就再加一組 `xxx_by`/`xxx_at` 欄位。加上另外 7 個 JSON snapshot 欄位（`event_snapshot`、`root_event_snapshot`、`acceptance_event_snapshot`、`sg_event_snapshot`、`finalize_event_snapshot`、`finalize_acceptance_event_snapshot`、`finalize_sg_event_snapshot`），這張表目前已有 47 欄，且成長模式看起來會持續下去。

這是典型的「該正規化成歷史/事件表卻攤平成稀疏欄位」訊號。建議拆成：

- `movement_actions(movement_id, action_type, actor, occurred_at)` —— 把 released / acknowledged / maker_submitted / present_docs_consumed / cancelled 等「誰在何時做了什麼」統一收斂，新增動作類型只需多一列資料，不必再 `ALTER TABLE`。
- `movement_snapshots(movement_id, snapshot_type, payload_json)` —— 用 `snapshot_type` 判別欄位收斂 7 個 snapshot 欄位，未來新增 snapshot 種類同樣不必動 schema。

註：現有的 snapshot-on-write 設計本身是刻意的取捨（換取讀取時不必重算），且專案本身標注為 single-process prototype，這不是「設計錯誤」，而是「值得跟 SQLite→PostgreSQL 遷移一起做」的正規化時機——屆時反正要重新設計表結構，一次到位成本較低。

**自我參照欄位缺少真正的 FK 約束**

`supersedes_balance_contract_id` / `superseded_by_balance_contract_id`（`schema.ts` 30-31 行，指回 `balance_contracts.balance_contract_id`）與 `superseded_movement_id` / `reversal_of_movement_id`（84-85 行，指回 `balance_movements.movement_id`），內容其實就是各自表的 PK，但目前只是裸的 `TEXT` 欄位，沒有 `REFERENCES` 宣告。`PRAGMA foreign_keys = ON` 已經開啟，這幾個是可以、也應該補上真正 FK 約束的地方——現在是「開了執行引擎卻沒把約束寫全」的純粹缺口。

### P2 — 查詢與索引層優化（現有資料量下不急，但值得記錄）

| 項目 | 位置 | 說明 |
|---|---|---|
| 前導萬用字元 LIKE | `balanceContractStore.ts` `listCatalog()` 222-223 行 | `lc_number LIKE '%q%'` 無法使用任何 B-tree 索引，會退化成 `instrument_type` 篩選後的全掃描。資料量變大或搜尋頻繁時，可改前綴比對（`LIKE @q || '%'`，索引可用）或導入 FTS5。 |
| OFFSET 分頁 | 同上 250 行 `LIMIT ... OFFSET` | 深分頁時需先掃過並丟棄前面的 offset 筆，資料量大會線性變慢。未來可考慮改 keyset/cursor pagination。 |
| 複合索引缺口 | `schema.ts` 63-64 行 `idx_contracts_parent` | 目前僅索引 `parent_logical_contract_id` 單欄，但實際查詢（`balanceMovementStore.ts` 259/276 行）是 `instrument_type = ? AND parent_logical_contract_id = ?` 兩個等值條件並用，複合索引 `(parent_logical_contract_id, instrument_type)` 可省去命中索引後再回表比對 instrument_type 的動作。 |
| 缺少 CHECK 約束 | `schema.ts` 全檔 | `status`/`instrument_type`/`movement_type`/`exposure_nature`/`tenor_type` 等列舉型欄位完全沒有 CHECK 約束，型別安全完全依賴 TS 層（`types.ts`）。建議補上 `CHECK (status IN (...))` 作為最後一道防線。 |
| 金額欄位用 TEXT 儲存 | `schema.ts` 多處 | 這是正確決定（SQLite 無原生 DECIMAL、REAL 有浮點誤差風險），但代表這些欄位無法在 SQL 層直接 `SUM` 或做數值排序；現有程式碼本來就都在 TS 層計算，一致，僅提醒未來若有人想直接對 DB 寫報表查詢須留意此限制。 |

---

## 3. 哪些能在 SQLite 上原地做，哪些非換 DB 不可

### 可以在 SQLite 上原地完成

| 項目 | 實作方式 | 工程量 |
|---|---|---|
| `busy_timeout` | 加一行 `PRAGMA` | 極小 |
| 複合索引 `idx_contracts_parent` | 普通 `CREATE INDEX` | 極小 |
| LIKE 前綴比對 / FTS5 | 純查詢層改寫，SQLite 內建 FTS5 虛擬表 | 小 |
| OFFSET → keyset 分頁 | 純查詢層改寫 | 小 |
| 正規化 `movement_actions`/`movement_snapshots` | 建新表、搬資料、改寫 store 層查詢 | 中～大，但與資料庫引擎無關 |
| 補 FK 約束 | SQLite 的 `ALTER TABLE` 只能 `ADD COLUMN`，無法對既有欄位事後補 `REFERENCES`；須走官方建議的「重建表」流程（關 FK 檢查 → 建新表 → 搬資料 → 刪舊表 → 改名 → 重建索引 → 開回 FK 檢查） | 中，技術上完全在 SQLite 能力範圍內 |
| 補 CHECK 約束 | 同上，需走「重建表」流程 | 中 |

### SQLite 架構本身解決不了、非換不可

| 項目 | 原因 |
|---|---|
| 同一 LC 序列化、不同 LC 互不阻塞的行級鎖需求 | SQLite 即使開了 WAL，也永遠是整個資料庫檔案級別的單一寫入者，跟 schema 設計或索引無關，本質是「一次只能有一個人在寫，不管寫的是哪張 LC」。正式環境須換 PostgreSQL（`SELECT ... FOR UPDATE` 鎖在 `balance_contract_id` 上）或 MySQL/InnoDB 才能真正驗證此需求。 |

---

## 4. 建議優先順序總結

1. **立即可做**：補 `PRAGMA busy_timeout`（P0，一行修改，行為缺口明確）。
2. **短期可做，低風險**：複合索引、LIKE 前綴比對、keyset 分頁（P2 中不涉及 schema 變更的項目）。
3. **中期規劃**：補 FK/CHECK 約束（需要重建表流程，建議集中排一次 migration 做完，而非逐項零散進行）。
4. **與 PostgreSQL 遷移一併處理**：`movement_actions`/`movement_snapshots` 正規化——屆時反正要重新設計表結構，一次到位成本最低。
5. **架構性、必須換 DB 才能達成**：行級鎖 / 跨 LC 並行寫入需求，繼續依 `schema.ts` 既有文件的方向規劃 PostgreSQL 遷移。
