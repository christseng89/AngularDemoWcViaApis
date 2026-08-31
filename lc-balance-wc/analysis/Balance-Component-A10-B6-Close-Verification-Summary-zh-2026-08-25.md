# Balance Component — A10/B6 Close 測試案例驗證彙整（2026-08-21～2026-08-22）

> **合併說明（2026-08-25，user 明確指示）**：本文件合併了原本四份獨立的驗證記錄——
> `Balance-Component-New-Test-Cases-Verification-2026-08-21.md`、
> `Balance-Component-Import-Case-12-Verification-2026-08-22.md`、
> `Balance-Component-Export-Case-11-Verification-2026-08-22.md`、
> `Balance-Component-Export-Case-2-4-Tenor-Fix-Verification-2026-08-22.md`。
> 四份記錄的其實是同一條工作主線——把 A10（Import LC Close）／B6（Export Confirmed LC Close）的測試矩陣
> 從「完全沒有覆蓋」補齊到「正向、負向、Import/Export 兩側對稱」的完整狀態，加上一項相關的既有資料修正
> （`export-case-2`／`4` 的 `tenorType` 標籤錯誤）。四份原始英文文件已依指示刪除，內容改寫成繁體中文彙整
> 於本文件，逐節保留原始驗證日期與數字，方便追溯。這是對專案「point-in-time、事後不修改/合併」慣例的
> 明確例外，比照 `Balance-Component-Business-Rule-Decisions-2026-08-21.md` 已建立的先例（有明確理由與
> user 指示，不是隨意修改）。

**驗證方式**：全部案例都是對著真正在跑的 microservice／backend 中台實際打 API（`POST
/api/business-cases/:id/run`），每個步驟都真的走 `POST /balance-movements`（Submit）＋`POST
/balance-movements/:id/release`（Approve）＋`POST /balance-movements/:id/maker-submit` 這組真實 API，
沒有 mock，跟 `REGRESSION-BASELINE.md` §3 是同一套驗證慣例。

---

## 總覽：Registry 案例數量成長軌跡

| 時間點 | 案例總數 | 新增內容 |
|---|---|---|
| 起點（`REGRESSION-BASELINE.md` 基準） | 14 | import-case-1～7、export-case-1～7 |
| 2026-08-21（第一波） | 21 | +7：import-case-8/9/10/11、export-case-8/9/10 |
| 2026-08-22（第二波） | 22 | +1：export-case-11 |
| 2026-08-22（第三波） | 23 | +1：import-case-12 |

`export-case-2`／`export-case-4` 的 `tenorType` 修正（2026-08-22）不涉及案例數量變化，是既有兩案的資料
標籤修正，詳見本文件第 4 節。

## A10／B6 Close 資格門檻矩陣（最終狀態）

| 資格條件 | Import（A10） | Export（B6） |
|---|---|---|
| SG Confirmed Balance ≠ 0 | ✅ `import-case-11`（2026-08-21） | n/a（SG 只存在於 Import 側） |
| Acceptance Confirmed Balance ≠ 0 | ✅ `import-case-12`（2026-08-22） | ✅ `export-case-11`（2026-08-22） |
| 正向路徑（走到終局後成功 Close） | ✅ `import-case-8/9/10` | ✅ `export-case-8/9` |

---

## 第 1 節（2026-08-21）：第一波 7 個新案例

`businessCases.js` 現有 14 案的骨架上補洞，補齊 A10／B6 Close 完全零覆蓋的缺口，另加一個獨立的 B2
（Export Amendment）案例。

### 1.1 結構性測試套件

| 子專案 | 測試結果 | Coverage（Stmts／Branch／Funcs／Lines） | 門檻 |
|---|---|---|---|
| Backend（`businessCases.test.js`、`server.test.js`、`runCase.test.js`） | 34/34 通過，3 個 suite | 97.47% / 95.34% / 97.14% / 98.16% | 95% |

`businessCases.test.js` 做了真正的擴充（不只是重跑）：`EXPECTED_IDS` 列出全部 21 個案例 id、registry 數量
斷言從 14 改成 21、每案的 title 斷言都補齊，`lcNumber` 正則（原本 `^(IMP|EXP)-C\d-\d+-\d+$`）放寬成
`^(IMP|EXP)-C\d+-\d+-\d+$` 以容納兩位數案例編號（`C10`／`C11`）。`server.test.js` 的
`GET /api/business-cases` 清單長度斷言同步從 14 改成 21。其餘結構性檢查（step type 合法性、`*Ref`
解析順序、`Ann`／`Bnn`／`Gnn`／`Enn` 參照編號慣例、跨呼叫決定性）在新案例上原封不動跑過，全部通過，
不需要特殊處理。

### 1.2 即時 API 執行結果——7 個新案例

| 案例 | 情境 | 結果 |
|---|---|---|
| import-case-8 | A1 Issue（Sellers Usance）→ A3（plain）＋A3S（SG 配對）Document Arrival ×2 → A6 Acceptance ×2 → A7 Settlement ×2 → **A10 Close** | PASS——Close 沖銷剩餘 55,000 Confirmed Balance；最終 Confirmed 0，狀態 CLOSED |
| import-case-9 | A1 Issue（Buyer's Usance）→ A3 Document Arrival → A6 Acceptance → A7 Settlement → **A10 Close**（從未開過 SG，天生符合資格） | PASS——沖銷 71,000；最終 Confirmed 0，CLOSED |
| import-case-10 | A1 Issue（Sight）→ A8 SG Issue → A3（未配對）Document Arrival → 真正的 A4 Maker-Submit＋Release → standalone **A9** `FULL_REDEEM` → **A10 Close** | PASS——SG 獨立於 Document Arrival 完成贖回（依 Design doc §6.1「不自動連結」）；Close 沖銷 60,000；最終 Confirmed 0，CLOSED |
| import-case-11 | A1 Issue → A8 SG Issue（從未贖回）→ **在 SG Balance = 30,000 時嘗試 A10 Close** | PASS（負向）——正確回傳 `409 INSUFFICIENT_AVAILABLE_BALANCE`；事後 LC snapshot 確認仍是 Confirmed 100,000／ACTIVE，SG 仍是 30,000——被拒絕的 Close 沒有真的套用 |
| export-case-8 | B1 Confirm（Sight）→ B3 Present Docs → B4 Honour（複合交易，含 Due From Issuing Bank）→ **B6 Close** | PASS——沖銷剩餘 90,000 CONF LIAB；最終 Confirmed 0，CLOSED |
| export-case-9 | B1 Confirm（Sellers Usance）→ B3 Present Docs → B4 Accept（複合，含 Acceptance＋Reimb Receivable）→ B5 Settlement（複合）→ **B6 Close** | PASS——Acceptance／Reimb Receivable 先全數結清；Close 沖銷 90,000；最終 Confirmed 0，CLOSED |
| export-case-10 | B1 Confirm → **B2** Amendment 增額（+20,000）→ **B2** Amendment 減額（−130,000，超過 Tight Available 120,000） | PASS——增額正常套用（120,000）；減額正確被 `checkAmendDecreaseSufficiency` 以 `409 INSUFFICIENT_AVAILABLE_BALANCE` 拒絕；事後 snapshot 確認仍是 120,000，未變 |

**7/7 全部通過；兩個刻意設計的負向案例（import-case-11、export-case-10）完全依設計失敗**——9 條 trace
裡每一個 `createMovement`／`release`／`makerSubmit`／`snapshot` 步驟自己的 `ok` 旗標都跟預期的
`expectError` 完全吻合，沒有任何非預期的步驟結果。

### 1.3 抽查——確認原有 14 案未受影響

重啟 backend 中台以套用新的 registry 後，即時重跑 `import-case-1`（9/9 步驟乾淨）跟 `export-case-7`
（19/19 步驟乾淨）——兩者都是零 `ok:false`，確認這批新增純粹是附加性質，沒有動到任何既有案例的
step-list、natural key 或行為。

---

## 第 2 節（2026-08-22）：`import-case-12`——A10 Close 資格門檻負向路徑（Acceptance 餘額）

`import-case-11`（第 1 節）只涵蓋了「SG 未歸零」這一條負向路徑；`import-case-12` 補上另一半——
「Acceptance 未歸零」——讓 Close 資格矩陣在兩個條件上都有覆蓋。Registry 從 22 案成長到 23 案。

### 2.1 新增內容

`backend/data/businessCases.js` 新增 `importCase12(lc, ib)`，註冊在 `importCase11` 後面。路徑：
`A1 Issue（Sellers Usance）→ A3 Document Arrival → A6 Acceptance（Liability 50,000，從未結清）→ 在
Acceptance Liability 仍未歸零時嘗試 A10 Close`。`businessCases.test.js` 的 `EXPECTED_IDS` 相應延伸，
registry 數量斷言 22→23，補上 `import-case-12` 的 title 斷言；`server.test.js` 的清單長度斷言同步
22→23。

### 2.2 結構性測試

34/34 通過，3 個 suite，coverage 97.52%／95.34%／97.29%／98.19%（`businessCases.js` 本身四項指標
均為 100%）。

### 2.3 即時 API 執行結果

即時跑完整個 `import-case-12`，每一個 snapshot 都跟自己預先寫好的註解逐字吻合，沒有任何需要修正的地方：

| 步驟 | 預期（註解） | 實際 |
|---|---|---|
| Accept 後的 LC Balance | 50,000 | `confirmed: 50000` |
| Close 前的 Acceptance Liability | 50,000 | `confirmed: 50000` |
| A10 Close 嘗試 | 409 資格不符錯誤 | `409 INSUFFICIENT_AVAILABLE_BALANCE` |
| 被拒絕的 Close 之後，LC Balance | 仍是 50,000，ACTIVE | `confirmed: 50000` |
| 被拒絕的 Close 之後，Acceptance Liability | 仍是 50,000 | `confirmed: 50000` |

確切的拒絕訊息：

```
Cannot Close IPLC_LC IMP-C12-... — Acceptance Balance must be 0 (currently 50000) —
settle the Acceptance first (A7/B5).
```

**抽查兩個既有案例確認未受影響**：`export-case-11`（12/12 步驟乾淨，自己的負向路徑依然照設計失敗）、
`import-case-7`（24/24 步驟乾淨）——確認這次新增純粹是附加性質。

---

## 第 3 節（2026-08-22）：`export-case-11`——B6 Close 資格門檻負向路徑（Acceptance 餘額）

補上 A10／B6 Close 資格門檻裡，`import-case-11`（SG 餘額路徑）跟 `export-case-8`／`export-case-9`
（正向路徑）都沒測到的那一個角度：**在 Confirmation 自己的 Acceptance Liability 仍未歸零（B5 Settlement
從未執行）時嘗試 B6 Close**。`domain/closeEligibility.ts` 的 `acceptanceMovements` 檢查在 Import／Export
兩側都無條件生效（不像 SG 檢查只限 `IPLC_LC`），這是第一個真正踩到這條 Export 側分支的案例。
Registry 從 21 案成長到 22 案。

### 3.1 新增內容

`backend/data/businessCases.js` 新增 `exportCase11(lc, ib)`，註冊為 `buildRegistry()` 的最後一筆。
路徑：`B1 Confirm（Sellers Usance）→ B3 Present Docs → B4 Accept（複合，含 Acceptance Liability
CREATE）→ 在 Acceptance Liability 仍是 10,000、從未結清時嘗試 B6 Close`。`businessCases.test.js` 的
`EXPECTED_IDS` 相應延伸，registry 數量斷言 21→22，補上 title 斷言；`lcNumber` 正則（2026-08-21 那波
已經放寬到能容納兩位數編號）不需要再改；`server.test.js` 的清單長度斷言同步 21→22。

### 3.2 結構性測試

34/34 通過，3 個 suite，coverage 97.5%／95.34%／97.22%／98.18%（`businessCases.js` 本身四項指標均為
100%）。

### 3.3 即時 API 執行結果

重啟 backend 中台後，先用 `export-case-1` 做暖身呼叫確認中台↔microservice 連線正常，才跑新案例
（避開下方第 4 節提到過的「重啟後暫時性 fetch failed」情況）。`export-case-11` 全程即時跑完，每個步驟
都符合預期，含確切的拒絕訊息：

```
[ERROR(expected)] createMovement - B6 Close attempted while Acceptance Liability = 10,000 (not 0)
  movementType=INSUFFICIENT_AVAILABLE_BALANCE status=409
  msg=Cannot Close EPLC_CONFIRMATION EXP-C11-... — Acceptance Balance must be 0 (currently 10000) —
      settle the Acceptance first (A7/B5).
```

事後兩個 snapshot 都確認被拒絕的 Close 沒有真的套用：CONF LIAB 仍是 Confirmed 90,000（狀態 ACTIVE，
不是 CLOSED），Acceptance Liability 仍是 10,000。

**抽查兩個既有案例確認未受影響**：`export-case-9`（22/22 步驟乾淨）、`import-case-11`（7/7 步驟乾淨，
自己的 SG 餘額負向路徑依然照設計失敗）——確認這次新增純粹是附加性質。

---

## 第 4 節（2026-08-22）：`export-case-2`／`export-case-4` 的 `tenorType` 修正

這項不是新增測試覆蓋，而是既有資料的標籤修正，對應
`Balance-Component-Business-Rule-Decisions-2026-08-21.md` 的行動項目 4（該備忘錄六項行動裡最後一項
需要動手的）。

### 4.1 改了什麼

`backend/data/businessCases.js`——剛好兩行，都是 `tenorType: 'BUYERS_USANCE'` 改成
`tenorType: 'SELLERS_USANCE'`：

| 案例 | 步驟 | 修正前行號 |
|---|---|---|
| `export-case-2` | "Confirm LC 100,000, Tolerance 10%"（`EPLC_CONFIRMATION` ISSUE） | 1368 |
| `export-case-4` | "LC Issue 100,000, Tolerance 10% (reference only)"（`EPLC_LC` ISSUE） | 1550 |

**確認範圍外、正確地維持不動**：`import-case-2`、`import-case-9` 也宣告 `tenorType: 'BUYERS_USANCE'`
（156、1047 行）——這兩個是真正的 Import 側 Buyer's Usance 案例，這個 tenor 本來就該出現在這裡（依
決策備忘錄的決策 2：「Buyer's Usance 只存在於 Import 側」）。

### 4.2 為什麼改成 `SELLERS_USANCE`，不是 `SIGHT`

依決策備忘錄行動項目 4 的原文分析：如果改成 `SIGHT`，這兩個案例會退化成跟 `export-case-1`／`6`
重複的情境，失去這兩案原本想測的 B4 `ACCEPT`／Acceptance 複合流程價值。`balance-component.model.ts`
的 `EXPORT_TENOR_OPTIONS`（261-264 行）證實這正是真實 UI 已經在做的事——Export 端的「Usance」選項在
線上本來就是送 `SELLERS_USANCE`（label 顯示成單純的「Usance」，因為 Buyer's／Seller's Usance 是
Import 側的內部融資結構區分，Export 端的保兌行看不到這個區別）。這兩個 `businessCases.js` 案例先前
跟真實 UI 的實際行為脫節了——改成 `SELLERS_USANCE` 是把測試資料修回跟真實 UI 一致，不是引入新的
設計決策。

### 4.3 結構性測試

34/34 通過，3 個 suite，coverage 97.47%／95.34%／97.14%／98.16%（跟修正前完全一樣）。核對過
`businessCases.test.js`／`server.test.js` 對這兩個案例只斷言 `id`／`title`（兩個 title 都用泛用的
"Usance" 字樣，不是 "Buyer's"／"Seller's"）——兩個檔案都不需要改動。

### 4.4 即時 API 執行結果——兩案都走真實 Submit／Approve

| 案例 | 結果 |
|---|---|
| `export-case-2` | PASS——"Present Docs 80,000" 步驟依然解析成 `movementType: ACCEPT`（不是 `HONOUR`），`Acceptance` `CREATE` 依然是 `exposureNature: ACTUAL`。所有餘額都跟案例自己原本的註解一致：Accept 後 CONF LIAB 41,000，Acceptance Liability 80,000，Settlement 後歸零 |
| `export-case-4` | PASS——"Issuing Bank Accept" 步驟依然解析成 `movementType: CREATE`、`exposureNature: MEMO`（未保兌——沒有 Export Bank 自己的負債）。餘額都跟原本的註解一致：MEMO 追蹤 80,000，Settlement 後歸零 |

**兩案都零非預期步驟結果通過——不涉及負向／錯誤路徑（跟 `import-case-11`／`export-case-10` 不同，
這兩案本來就不是設計來失敗的）。** 只有產生出來的 `BalanceContract` 自己的 `tenorType` 值改變
（`SELLERS_USANCE` 取代 `BUYERS_USANCE`）；每一個 movementType、exposureNature、餘額數字都跟修正前
逐位元組相同——證實這純粹是標籤誤植的修正，不是行為變更。

一個暫時性狀況：backend 中台剛重啟後的第一次即時嘗試，兩個案例都回傳 `fetch failed`（中台自己對
microservice 的 `fetch()` 呼叫）——但 microservice 自己的 `/healthz` 跟直接 catalog 查詢在同一時刻用
`curl` 都正常回應，且另一個沒改動過的案例（`export-case-1`）在下一次呼叫就成功了。重跑
`export-case-2`／`-4` 就順利通過。判讀為中台剛重啟後的暖身競態，不是這次改動本身的缺陷——之後兩案
都沒有再出現這個錯誤。

### 4.5 清理

這次跑產生的測試資料（`EXP-C2-*`／`EXP-C4-*` naturalKey 樣式，7 筆合約列）事後都清除了。驗證：
54 筆參考資料合約在跑前跑後逐位元組不變。

---

## 如何重現——本文件涵蓋的全部案例

```bash
# Backend 結構性測試
cd lc-balance/backend && npm test

# 即時 API 執行（需要三個開發程序都在跑 — npm run dev:all）
curl -X POST http://localhost:4300/api/business-cases/import-case-8/run
curl -X POST http://localhost:4300/api/business-cases/import-case-9/run
curl -X POST http://localhost:4300/api/business-cases/import-case-10/run
curl -X POST http://localhost:4300/api/business-cases/import-case-11/run
curl -X POST http://localhost:4300/api/business-cases/import-case-12/run
curl -X POST http://localhost:4300/api/business-cases/export-case-2/run
curl -X POST http://localhost:4300/api/business-cases/export-case-4/run
curl -X POST http://localhost:4300/api/business-cases/export-case-8/run
curl -X POST http://localhost:4300/api/business-cases/export-case-9/run
curl -X POST http://localhost:4300/api/business-cases/export-case-10/run
curl -X POST http://localhost:4300/api/business-cases/export-case-11/run
# 事後清理：DELETE balance_movements/balance_contracts WHERE lc_number LIKE 'IMP-C%' OR 'EXP-C%'
```

---

## 附註：截至 2026-08-25 仍未落地的相關項目

依 `Balance-Component-Business-Rule-Decisions-2026-08-21.md` 自己的行動項目表：

- ✅ 行動項目 1（A9 前端鎖定）——已完成（2026-08-21）
- ✅ 行動項目 2（後端 `businessEventId` 配對檢查）——已完成（2026-08-24）
- ⬜ **行動項目 3**（`EPLC_CONFIRMATION` 拒絕／正規化 `BUYERS_USANCE`）——**仍未實作**，見 `TODO.md`
- ✅ 行動項目 4（`export-case-2`／`4` 的 `tenorType` 修正）——已完成（本文件第 4 節）
- ⬜ **行動項目 5**（Mapping workbook Rule #1 文字補強）——**仍未完成**，BA 待辦，見 `TODO.md`
- ✅ 行動項目 6（新增測試案例）——已完成（本文件第 1～3 節）

---

*Point-in-time 驗證記錄，比照 `REGRESSION-BASELINE.md` 的慣例——各節內容保留原始撰寫當下的事實描述，
不因後續進展而回頭改寫本文內容；本文件結尾這份「附註」段落例外，用來避免讀者誤判已完成項目為尚未處理
（比照 `Balance-Component-Business-Rule-Decisions-2026-08-21.md` 已建立的附加註記慣例）。日後若又有
新案例加入，建議另立新的日期戳記文件，或依 user 指示再次合併進本文件，不要靜默覆寫既有節次內容。*
