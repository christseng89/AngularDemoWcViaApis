# Balance Component — 未完成事項清單（TODO）

**整理日期**：2026-08-24（更新版，基於 `lc-balance/` 還原到 `LC-Balance-Component-Completed` 區塊1狀態
`e6ee8e7` 之後的內容——2026-08-24 稍早的 `main` 上曾多出約 60 個 commit，含
Tenor Basis/Fixed Maturity Date + `standing-mock` 微服務、Natural-Expiry batch-trigger
業務簽核文件，經 user 審視後判定其中新功能改壞了東西，已於 commit `115f9cd` 整批還原掉，只保留區塊1的
A9 SG Redemption 鎖定、A10/B6 Close 相關收尾——那批被還原的內容仍完整保留在 git 歷史中，未來要找回
隨時可以）
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

- [ ] **A9 Full-Redeem-only 目前只在 Angular UI 層鎖定**（`submit-rules.ts` 硬編碼 `FULL_REDEEM` +
  金額鎖定為 SG Available Balance），微服務自己的 `PARTIAL_REDEEM` movementType 與
  `domain/shgtRedeem.ts` 的 `checkRedeemSufficiency()` 完全沒變——`checkRedeemSufficiency()` 只檢查
  `amount <= availableBalance`，沒有 `businessEventId`/A3S 配對檢查。任何繞過這個 Angular 前端、
  直接呼叫 `POST /balance-movements` 的呼叫者，仍然可以對同一張 SG 做 Partial Redeem。

- [ ] **`Balance-Component-Business-Rule-Decisions-2026-08-21.md` 的 action item 2、3** —
  後端 `businessEventId` 強制檢查（把上面那條 UI-only 落差補成伺服器端真正的控制）、
  `BUYERS_USANCE` 的拒絕/正規化——**user 明確指示這兩項本次範圍不做**，尚未實作。

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

- [ ] `maker-panel.component.scss` 仍超出 Angular `anyComponentStyle` 的 **8kB 警告**門檻
  （目前 11.92kB，超出 3.92kB；未達 12kB 硬錯誤門檻，不會讓 `npm run build` 失敗）。
  2026-08-21 的 Part B 抽離只處理了當時真正卡 build 的 `transaction-builder.component.scss`，
  這個 warning-level 的檔案尚未一併處理。

---

## 備註

- 除以上項目外，`transaction-builder.component.ts`「God Component」(BAL-003) 已於 2026-08-21 正式收尾，
  `Quality-report-balance.md` 記錄「首次沒有任何重量級 Maintainability open finding」。
- 本清單中最關鍵的仍是第 1 節的三個 Gate Conditions（BAL-001/BAL-002/BAL-102），全部需要使用者/業務端
  再次確認才會啟動實際工程，動手前請先與使用者對齊排期與範圍。
- 若之後有新的重審 pass 更新了 `Quality-report-balance.md`/`CLAUDE.md`，應同步回來更新本清單，
  避免與來源文件的「單一事實來源」狀態脫節。
- **2026-08-24 還原記錄**：`main` 上曾出現的 Tenor
  Basis/Fixed Maturity Date + `standing-mock` 微服務、Natural-Expiry batch-trigger 業務簽核文件
  （commit `115f9cd` 之前、`e6ee8e7` 之後的約 60 個 commit）已整批從 `lc-balance/` 還原掉，因為其中
  新功能被判定改壞了東西。這些內容並未從 git 歷史中刪除，仍可透過 `git show <commit>` 或
  `git log e6ee8e7..115f9cd~1` 查閱/挑選回來；若未來要重新評估是否要撿回其中部分功能，
  建議逐項討論，不要整批復原。
- **2026-08-24 發現並修復**：還原後 OAS 全面稽核發現 `currency` 欄位存在一致性驗證缺口——既有合約/父合約
  已存的幣別跟呼叫端傳入的新交易幣別完全沒有比對，錯的值會被原封不動存進交易紀錄。已補上
  `CurrencyMismatchError`（409 `CURRENCY_MISMATCH`），範圍刻意比原本被還原掉的 `ca8472e` 窄——`currency`
  仍維持必填（不像 `ca8472e` 把它改成可省略由伺服器推導），只補了缺少的一致性檢查。OAS 對應章節已從
  「CURRENCY DERIVATION」改寫為「CURRENCY CONSISTENCY」以準確反映目前實作，`CLAUDE.md` 決策日誌已記錄完整
  細節。三套測試全綠（微服務 429/429，含 4 個新測試）。
