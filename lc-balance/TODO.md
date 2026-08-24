# Balance Component — 未完成事項清單（TODO）

**整理日期**：2026-08-24（更新版，基於 `lc-balance/` 還原到 `LC-Balance-Component-Completed` 區塊1狀態
`e6ee8e7` 之後的內容，只保留區塊1的 A9 SG Redemption 鎖定、A10/B6 Close 相關收尾）
**依據**：`CLAUDE.md` 決策日誌（截至區塊1最後一筆 `Balance-Component-Test-Case-Proposal.md §4` 條目）、
`Quality-report-balance.md`（截至 2026-08-21 重審）、`analysis/Balance-Component-DB-Optimization-Analysis.md`（2026-08-21）

本清單只收錄「已知、已記錄、但尚未真正動手解決」的事項；已修復並在上述文件中標註 **Fixed/已完成** 的項目不重複列出。

---

## 1. 生產部署前的硬性阻擋項（Gate Conditions）

三項皆為**已決策延後**（deferred, user-confirmed），不是遺漏，但只要專案要處理真實交易金融資料或真實使用者身份，
三項都必須先解決，且是本清單中優先級最高、工程量最大的部分。

- [ ] **BAL-001**（🔴 Blocker）— 微服務完全沒有身份驗證/授權
  `createdBy`/`releasedBy` 等欄位目前直接信任 request body 內容；需要改成從已驗證身份在伺服器端推導，
  而非由呼叫端自行宣稱。

- [ ] **BAL-002**（🟠 Critical）— Angular 生產依賴 8 個 High 等級 CVE，卡在 17.3.x 版本線
  需要一次 major 版本升級（17 → 22）才能脫離受影響版本；本身是有真實破壞性風險的大工程，故延後。

- [ ] **BAL-102**（🟡 Major）— SQLite 全檔案鎖，無法達成「同一 LC 序列化、不同 LC 互不阻塞」的行級鎖需求
  須換成 PostgreSQL（`SELECT ... FOR UPDATE` 鎖在 `balance_contract_id` 上）或同等引擎才能真正驗證此需求；
  目前沙盒環境沒有 PostgreSQL 實例可開發/測試。

---

## 2. 次要但仍開著的項目

- [ ] **BAL-129**（🔵 Minor，Test Gap）— BAL-117 修的「泛用 500 handler 不外洩內部錯誤訊息」本身沒有測試覆蓋
  若未來不小心讓這個行為 regress，目前的測試套件不會抓到。

- [ ] **BAL-120**（⚪ Info，已確認延後）— 冪等性衝突偵測仍靠字串比對 SQLite driver 的錯誤文字
  卡在 `node:sqlite`（Node 內建 `DatabaseSync`）目前沒有穩定的 constraint-violation 錯誤碼可用，
  非擱置不做，而是等上游能力補齊。

- [ ] **`ContractVersionConflictError`（⚪ Info，單向落差，2026-08-24 稽核發現）** — `errors.ts` 定義了這個
  409 `CONTRACT_VERSION_CONFLICT` 錯誤類別，但整個 `src/` 沒有任何地方真的拋出它（死碼），OAS 的
  `Error.code` enum 也完全沒列這個代碼。影響很小（目前用不到），但屬於 OAS 全面稽核時發現、尚未處理的項目。

---

## 3. A9（SG Redemption）鎖定的已揭露 trade-off / 明確排除範圍

區塊1新引入的功能，非疏漏但**尚未收尾**，記錄於此供未來評估：

- [x] ~~A9 Full-Redeem-only 只在 Angular UI 層鎖定~~ — **已修復（2026-08-24）**。
  `buildMovementTypeRegistry()`（Maker/Submit）跟 `release()`（Checker/Release，防禦性複查）現在都會
  擋下「standalone（無 `businessEventId`）的 SHGT `PARTIAL_REDEEM`」，回 409。判斷依據是
  `businessEventId` 是否存在（A3S 配對贖回一定會帶，且其 MIN(Bill, SG Outstanding) 配對本來就可能剛好
  等於全額，不能只看 movementType 字串），不是 movementType 本身——A3S 自己的配對贖回、standalone
  `FULL_REDEEM` 都不受影響。OAS 已 bump 到 v1.18.0。新增 5 個測試（Maker 拒絕/接受、Checker 複查），
  三套測試全綠（微服務 442/442、Angular 1067/1067、backend 34/34）。

- [x] ~~`Balance-Component-Business-Rule-Decisions-2026-08-21.md` 的 action item 2（後端
  `businessEventId` 強制檢查）~~ — **已完成（2026-08-24）**，就是上面那項 A9 Full-Redeem-only
  伺服器端修復本身；先前記錄「本次範圍不做」是指更早一次 pass，這次 user 明確要求後已補上。

- [ ] **`Balance-Component-Business-Rule-Decisions-2026-08-21.md` 的 action item 3**
  （`BUYERS_USANCE` 的拒絕/正規化）——仍然尚未實作，範圍外。

- [ ] **`Balance-Component-Business-Rule-Decisions-2026-08-21.md` 的 action item 5**
  （Mapping workbook Rule #1 補充「Matched Amount ≠ Redeemed Amount」與 A3S 例外的措辭）——
  純文件性質，屬於 BA 待辦（`analysis/TF_Balance_Component_Mapping-en.xlsx`／`-zh.xlsx`），不是程式碼
  改動，不在這個 repo 的動手範圍內；記錄於此避免被遺忘。詳見該決策文件本身的說明與舉例。

---

## 4. DB 優化 — 規劃與 PostgreSQL 遷移一併處理

- [ ] **`movement_actions`/`movement_snapshots` 正規化**
  `balance_movements` 表目前已 47 欄，`xxx_by`/`xxx_at`（released/acknowledged/maker_submitted/
  present_docs_consumed/cancelled）與 7 個 JSON snapshot 欄位持續用 `ALTER TABLE` 加欄位吸收新需求，
  是典型「該正規化成歷史/事件表卻攤平成稀疏欄位」訊號。建議屆時拆成：
  - `movement_actions(movement_id, action_type, actor, occurred_at)`
  - `movement_snapshots(movement_id, snapshot_type, payload_json)`

  現有 snapshot-on-write 設計本身是刻意取捨（換取讀取時不必重算），不是設計錯誤——只是值得跟
  SQLite→PostgreSQL 遷移一起做，屆時反正要重新設計表結構，一次到位成本較低。（與上方 BAL-102 為同一次
  遷移工程的一部分。）

---

## 5. 刻意不做（記錄理由，非疏漏，暫不排入待辦）

以下兩項經過評估後**明確決定不做**，列在此處僅供未來重新評估時參考，不需主動排期：

- **LIKE 前導萬用字元查詢改前綴比對 / FTS5** — `listCatalog()` 的 `lc_number LIKE '%q%'` 用不到索引，
  但改成前綴比對會拿掉使用者「查中間/尾碼字串也能搜到」的能力，是使用者搜尋行為的限縮，不能單方面決定；
  未來若真的變成效能痛點，應優先導入 FTS5（保留子字串搜尋），而非改前綴比對。
- **OFFSET 分頁改 keyset/cursor 分頁** — 現有資料量不需要，且會動到 API 介面。

---

## 6. 其他已知小殘留（不影響測試門檻）

- [x] ~~`maker-panel.component.scss` 超出 Angular `anyComponentStyle` 的 8kB 警告門檻~~ —
  **已修復（2026-08-24）**。根因：2026-08-21 從 `transaction-builder.component.scss` 整份複製
  過來時，複製了全部規則而非只複製這個元件真正用到的子集，導致約一半（997 行中的 473 行）是
  死碼——`.tb-page`/`.tb-workspace`/`.tb-function-chip*`（頁面外殼/功能選擇 chips）、
  `.tb-tabs`/`.tb-table--lookup-timeline`/`.tb-status-badge*`（Look Up 分頁跟 Event Timeline
  表格，屬於其他元件）等，逐一 grep 驗證零使用後刪除（同一套之前清 `.tb-quick-pick*`/
  `.tb-result*`/`.tb-row-sub` 死碼用的技法），檔案從 997 行降到 511 行。`ng build --configuration
  production` 確認警告完全消失，Angular 1067/1067 測試全綠。

---

## 備註

- 除以上項目外，`transaction-builder.component.ts`「God Component」(BAL-003) 已於 2026-08-21 正式收尾，
  `Quality-report-balance.md` 記錄「首次沒有任何重量級 Maintainability open finding」。
- 本清單中最關鍵的仍是第 1 節的三個 Gate Conditions（BAL-001/BAL-002/BAL-102），全部需要使用者/業務端
  再次確認才會啟動實際工程，動手前請先與使用者對齊排期與範圍。
- 若之後有新的重審 pass 更新了 `Quality-report-balance.md`/`CLAUDE.md`，應同步回來更新本清單，
  避免與來源文件的「單一事實來源」狀態脫節。
- **2026-08-24 發現並修復**：還原後 OAS 全面稽核發現 `currency` 欄位存在一致性驗證缺口——既有合約/父合約
  已存的幣別跟呼叫端傳入的新交易幣別完全沒有比對，錯的值會被原封不動存進交易紀錄。已補上
  `CurrencyMismatchError`（409 `CURRENCY_MISMATCH`），範圍刻意比原本被還原掉的 `ca8472e` 窄——`currency`
  仍維持必填（不像 `ca8472e` 把它改成可省略由伺服器推導），只補了缺少的一致性檢查。OAS 對應章節已從
  「CURRENCY DERIVATION」改寫為「CURRENCY CONSISTENCY」以準確反映目前實作，`CLAUDE.md` 決策日誌已記錄完整
  細節。三套測試全綠（微服務 429/429，含 4 個新測試）。
