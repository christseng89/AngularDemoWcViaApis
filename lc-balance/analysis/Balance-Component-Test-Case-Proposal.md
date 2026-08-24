# Balance Component 測試案例提案
### Import LC（Sight / Seller's Usance / Buyer's Usance，A1–A10）＋ Export Confirmed LC（Sight / Usance，B1–B6）

**文件性質**：提案（Proposal），本已於 2026-08-21～2026-08-22 全數落地為正式的 Business Case Registry 條目，見下方「2026-08-25 完成狀態」。

**2026-08-21 更新**：第 3 節原本的兩個待確認範疇問題已定案，詳見同日期的《Balance-Component-Business-Rule-Decisions-2026-08-21.md》決策備忘錄；本文件第 3、4 節已依決議同步修訂。

---

## ✅ 2026-08-25 完成狀態

本提案第 4 節提出的 7 個新案例（import-case-8～11、export-case-8～10）已**全數實作並 live-verified 通過**，另外還多加了 2 個對稱補完案例：`import-case-12`（A10 Close 資格門檻負向路徑——Acceptance 餘額未歸零）、`export-case-11`（B6 對應的同一條負向路徑）——兩者一起讓 A10／B6 Close 資格矩陣在 Import／Export 兩側完全對稱（見下方「Gate condition」對照表）。Registry 總數從提案當時的 14 個成長到 **23 個**。

第 6 節列的三個前置行動項目（A9 前端鎖定、後端 `businessEventId` 配對檢查、`BUYERS_USANCE` 於 Export 的拒絕/正規化）目前 **2/3 已完成**：
- ✅ A9 前端鎖定（2026-08-21）+ 後端 `businessEventId` 配對檢查（2026-08-24，見 `Balance-Component-Business-Rule-Decisions-2026-08-21.md` 自己的狀態更新段落）
- ⬜ `BUYERS_USANCE` 於 Export 的拒絕/正規化——**仍未實作**，見 `TODO.md`

驗證記錄原本分散在四份獨立的日期戳記文件，2026-08-25 已依 user 指示合併為一份中文彙整文件（本文件本身
不記錄驗證細節，維持「提案」定位）：
- `Balance-Component-A10-B6-Close-Verification-Summary-zh-2026-08-25.md`——涵蓋全部 9 個新案例
  （import-case-8/9/10/11/12、export-case-8/9/10/11）＋ `export-case-2`／`4` 的 `tenorType` 修正

**API 操作模式**：全程比照現有 `import_lc_test.sh` / `export_lc_test.sh` / Business Case Registry 的既有慣例 —— 用 `POST /balance-movements`（Maker Submit / Create）＋ `POST /balance-movements/:id/release`（Checker Release / Approve）這組 Submit＋Approve API 組合來驅動每一筆交易；Sight A4 額外需要真正的 `POST /balance-movements/:id/maker-submit` 步驟（詳見下方第 2 節）。

---

## 1. 現有測試覆蓋盤點

專案裡已經有相當成熟的自動化測試骨架，這份提案是在這個骨架上「補洞」，不是從零開始：

| 既有資產 | 內容 |
|---|---|
| Business Case Registry（`backend/data/businessCases.js`） | 14 個宣告式 step-list 案例（import-case-1～7、export-case-1～7），透過 `POST /api/business-cases/:id/run` 執行，`REGRESSION-BASELINE.md` 記錄 2026-08-19 基準下 14/14 全數 PASS |
| `import_lc_test.sh` | 直接 curl 打 microservice（`localhost:4100`），涵蓋 Import Sight（S01）＋ Seller's Usance（U02） |
| `export_lc_test.sh` | 直接 curl 打 microservice，涵蓋 Export Sight（S01）＋ Seller's Usance（U01，腳本註解標示為「U02」但實際重現的是 U01 的真實資料） |

### 1.1 Import 現況（依 function code 對照）

| Function | 名稱 | Sight | Seller's Usance | Buyer's Usance |
|---|---|---|---|---|
| A1 | LC Issue | ✅ import-case-1/3/4/6、shell 腳本 S01 | ✅ import-case-7 標題為「A1 Usance」 | ✅ import-case-2（`tenorType: 'BUYERS_USANCE'`） |
| A2 | Amendment（增額/減額） | ✅ import-case-1（增額）、import-case-5（減額，故意觸發 409 的負向案例） | 未見獨立案例 | 未見獨立案例 |
| A3 / A3S | Document Arrival（含／不含 SG 對沖） | ✅ import-case-1/3/4/6（含 A3S 全額/部分沖銷情境） | 未見 | 未見 |
| A4 | Sight Settlement（真 Maker-Submit＋Checker Release） | ✅ import-case-3/4/6、shell 腳本 | n/a（Usance 不走 A4） | n/a |
| A6 | Usance Acceptance | 未見於 Sight 案例（本來就不適用） | ✅ import-case-7、shell 腳本（刻意不做 A7，Acceptance 保持 OPEN） | 未見獨立案例 |
| A7 | Usance Settlement | n/a | ✅ import-case-7 | 未見獨立案例 |
| A8 | Shipping Guarantee Issue | ✅ import-case-3/4/6 | 未見 | 未見 |
| A9 | SG Redemption（**2026-08-21 決議：僅限全額**，見決策備忘錄決策 1） | ✅ import-case-3（全額，符合新規則） | 未見 | 未見 |
| A10 | Close | ~~完全沒有覆蓋~~ → ✅ **已覆蓋（2026-08-21/22）**：import-case-10（正向）、import-case-11（SG 未歸零負向） | ✅ import-case-8 | ~~完全沒有覆蓋~~ → ✅ import-case-9、import-case-12（Acceptance 未歸零負向） |

### 1.2 Export Confirmed LC 現況

| Function | 名稱 | Sight | Usance |
|---|---|---|---|
| B1 | Confirm LC | ✅ export-case-1/6、shell 腳本 S01 | ✅ export-case-3/7（Seller's Usance）、shell 腳本 U01。export-case-2/4 原用 `tenorType: 'BUYERS_USANCE'`，~~2026-08-21 決議：Export 沒有 Buyer's Usance，需修正~~ → ✅ **已修正為 `SELLERS_USANCE`（2026-08-22）**，見 `Balance-Component-A10-B6-Close-Verification-Summary-zh-2026-08-25.md` 第 4 節 |
| B2 | Amendment | 原只以 `AMEND_INCREASE` 步驟穿插在複合案例裡，~~沒有獨立的 B2 案例~~ → ✅ **已補上（export-case-10，2026-08-21）**：正向增額＋負向減額超額（`expectError: true`） |
| B3 | Present Docs | ✅ export-case-6/7、shell 腳本（2026-08-18 改版後已是真正自行 Release，不再用已移除的 `acknowledge` step） |
| B4 | Honour（Sight）／Accept（Usance），複合交易 | ✅ export-case-6、shell 腳本（Honour＋Due From Issuing Bank CREATE） | ✅ export-case-7、shell 腳本（Accept＋Acceptance Liability CREATE＋Acceptance Reimb Receivable CREATE） |
| B5 | Settlement，複合交易 | n/a（Sight 沒有獨立 B5，資金動作在 Loan Component） | ✅ export-case-7、shell 腳本（Acceptance FULL_SETTLE＋Reimb Receivable REIMBURSE） |
| B6 | Close | ~~完全沒有覆蓋~~ → ✅ export-case-8 | ~~完全沒有覆蓋~~ → ✅ export-case-9、export-case-11（Acceptance 未歸零負向，2026-08-22） |

---

## 2. 兩個已知的 API 行為細節（提案矩陣會依此設計）

1. **Sight A4 的 4-eyes 強制 Maker Submit 閘門**：只要 LC 在 Issue 時宣告 `tenorType: 'SIGHT'`，其 Document Arrival（UTILIZE）要 Release 前，必須先真正呼叫一次 `POST /balance-movements/:id/maker-submit`，否則直接被拒絕（`isSightUtilizeFinalize`，2026-08-19 BAL-123 修復）。Usance 不受此限，A6 的 Release 是靠 `referencedTransactionId` 的複合關聯直接完成，不經過 maker-submit 閘門。
2. **A10／B6 Close 的資格條件**（`domain/closeEligibility.ts`）：SG 餘額＝0、Acceptance 餘額＝0、樹狀結構內沒有任何未結束的 Event，且合約本身尚未是 CLOSED 狀態，三者同時成立才能 Close。這代表 A10／B6 測試案例必須先把該 LC 的所有子交易（SG、Document Arrival、Acceptance…）走到終局狀態，才能呼叫 Close，不能像 A1 那樣是個獨立的最小案例。

---

## 3. 業務範疇問題（2026-08-21 已定案）

原本兩個待確認的範疇問題，已經跟 BA 確認定案，完整依據見《Balance-Component-Business-Rule-Decisions-2026-08-21.md》：

**(a) Export 沒有 Buyer's Usance。** `businessCases.js` 裡 `export-case-2`／`export-case-4` 目前是 `tenorType: 'BUYERS_USANCE'`，但 Buyer's Usance 是開證行對買方的融資安排，只存在 Import 側；Export／保兌一律視同 Sight 處理（B4 應走 HONOUR，不應走 ACCEPT）。**結論：Export 的 Usance 測試矩陣只有 Seller's Usance 一支，不需要跟 Import 一樣拆 Seller's／Buyer's 兩條分支**；`export-case-2`／`4` 屬於既有資料需要修正的項目，不是本提案矩陣要擴充的方向。

**(b) EBL／Confirmed 軸不需要涵蓋進矩陣。** BA 確認：「出口所有的 B1–B6 都是針對保兌處理，EBL 不在此 Balance Component 範疇之中」。EBL 融資是 Loan Component 資產交易，不產生 Balance Component API 呼叫，`export-case-3`／`5` 裡的 EBL 步驟本來就只是 `note` type，維持現狀即可，不需要另外測試。

以下第 4 節的矩陣依此定案版本編排，聚焦在把 A1–A10／B1–B6 每個 function code 的真實 API 呼叫覆蓋補齊。

---

## 4. 提案的測試矩陣（新增案例）

沿用 Business Case Registry 既有慣例（`createMovement` / `release` / `makerSubmit` / `snapshot` / `note` 這幾種 step type），每個新案例會以獨立 `case-id` 註冊、可經 `POST /api/business-cases/:id/run` 個別執行，並沿用既有的「用當下時間戳記產生唯一 LC Number，避免撞到 S01–S11／U01／U02 這批既有參考資料」的作法。

### 4.1 Import 新增案例

| 提案 ID | 標題（暫定） | 目的 | 涵蓋 function code |
|---|---|---|---|
| import-case-8 | Seller's Usance 完整生命週期到 Close | 目前 import-case-7 到 A7 就結束，Acceptance 已 FULL_SETTLE 但 LC 本身沒有真正 Close 過。新增：A1（Seller's Usance）→A3→A6→A7（沿用 import-case-7 的路徑）→確認 SG／Acceptance 餘額歸零→A10 Close | A1, A3, A6, A7, **A10** |
| import-case-9 | Buyer's Usance 完整生命週期到 Close | import-case-2 目前只到 Acceptance／Settlement，同樣補上 Close 收尾 | A1, A3, A6, A7, **A10** |
| import-case-10 | Sight 完整生命週期到 Close | 以 import-case-3／6 的路徑為基礎（A1→A8 SG→A3/A3S→A4 真 Maker-Submit＋Release→A9 SG 全額贖回），SG 與 Document Arrival 都走到終局後呼叫 A10 | A1, A3, A4, A8, A9, **A10** |
| import-case-11（提案時標為可選，**實際採用**） | A10 Close 資格門檻負向案例（SG 未歸零） | 刻意在 SG 尚未歸零時呼叫 Close，預期回傳資格不符錯誤（比照 import-case-5 的 `expectError: true` 慣例），驗證三個 Close 前置條件真的有被 enforce | **A10**（負向路徑） |

> 註：A2（Amendment）與 A7（Usance Settlement）本身已有既有覆蓋（import-case-1／5、import-case-7），本提案不重複新增，只在 import-case-8/9 裡順帶再次經過，作為 Close 前置的自然鋪陳。

> **✅ 後續補充（2026-08-22，超出本提案原範圍）**：import-case-11 只涵蓋了「SG 未歸零」這條負向路徑，Close 前置條件的另一半——「Acceptance 未歸零」——當時沒有對應案例。新增 `import-case-12`（A1 Sellers Usance → A3 → A6 Acceptance 50,000 從未 Settle → A10 Close 嘗試，預期 409）補上這條路徑，讓 Close 資格矩陣在兩個條件、Import／Export 兩側都對稱完整。詳見 `Balance-Component-A10-B6-Close-Verification-Summary-zh-2026-08-25.md` 第 2 節。

### 4.2 Export 新增案例

Export Usance 矩陣只涵蓋 Seller's Usance（見第 3 節決議），不再對稱補 Buyer's Usance 分支：

| 提案 ID | 標題（暫定） | 目的 | 涵蓋 function code |
|---|---|---|---|
| export-case-8 | Sight 完整生命週期到 Close | 以 export-case-6 的路徑為基礎（B1→B3→B4 Honour＋Due From Issuing Bank），待所有 Present Docs 均已 Honour 後呼叫 B6 | B1, B3, B4, **B6** |
| export-case-9 | Seller's Usance 完整生命週期到 Close | 以 export-case-7 的路徑為基礎（B1→B3→B4 Accept→B5 Settlement），Acceptance 全數 FULL_SETTLE 後呼叫 B6 | B1, B3, B4, B5, **B6** |
| export-case-10 | 獨立 B2 Amendment 案例（含負向） | 目前 B2 只穿插在複合案例裡，沒有像 import-case-5 那樣單獨測試「減額超過可用餘額應被拒絕」。新增一個聚焦於 B2 增額（正向）＋減額超額（負向 409）的獨立案例，比照 import-case-5 的 `expectError: true` 慣例 | **B2**（正向＋負向） |

> 修正項目（非新增覆蓋，屬既有資料修正）：~~`export-case-2`／`export-case-4` 目前用 `tenorType: 'BUYERS_USANCE'`，需依決策備忘錄決策 2 修正...建議與程式員一起重新檢視這兩案的真實測試意圖（很可能應該改成 `SELLERS_USANCE`）~~ → ✅ **已完成（2026-08-22）**：兩案改為 `SELLERS_USANCE`，正是原本推測的方向——保留了 B4 ACCEPT 複合流程的測試價值，不與 export-case-1／6 重複，行為（movementType/exposureNature/餘額）逐位元組核對跟修正前一致，純粹是標籤修正。詳見 `Balance-Component-A10-B6-Close-Verification-Summary-zh-2026-08-25.md` 第 4 節。

> **✅ 後續補充（2026-08-22，超出本提案原範圍）**：比照 Import 側 import-case-12 的補完邏輯，新增 `export-case-11`（B6 Close 資格門檻負向路徑——Acceptance 餘額未歸零），讓 Close 資格矩陣在 Import／Export 兩側完全對稱。詳見 `Balance-Component-A10-B6-Close-Verification-Summary-zh-2026-08-25.md` 第 3 節。

---

## 5. 實作方式建議

- 沿用 `businessCases.js` 現有的 step-list 慣例與 helper（`createAndRelease()`、`lcNumberFor()`、`MAKER`/`CHECKER` 常數），新案例會是同一個檔案裡新增的函式，不另起爐灶。
- Sight 相關案例務必包含真正的 `makerSubmit` step（對應 A4 的 4-eyes 閘門），不能用假資料繞過。
- Close 相關案例（A10／B10=B6）在呼叫 Close 前，一律先用 `snapshot` step 印出 SG／Acceptance 餘額，作為「確實歸零才 Close」的可視化證據，也方便日後除錯。
- 負向案例（A10 資格不符、B2 減額超額）沿用 `expectError: true` 的既有慣例，避免和 import-case-5 的模式不一致。
- 新案例完成後，`REGRESSION-BASELINE.md` 不會被直接修改（該檔案已明確標示「非活文件」）；待新案例跑過驗證後，會另外建立一份新的、有日期戳記的比對報告，記錄「14 個既有案例＋N 個新案例」的完整基準。

---

## 6. 下一步（原文，供對照）～現況見下方 2026-08-25 收尾

1. ~~第 3 節的範疇問題已定案（見上），第 4 節矩陣已依此收斂為 import-case-8～11、export-case-8～10 共 7 個新案例，另加 `export-case-2`／`4` 一項修正待辦。~~ → ✅ 全數完成，另加 2 個對稱補完案例（import-case-12、export-case-11），見上方完成狀態。
2. ~~《Balance-Component-Business-Rule-Decisions-2026-08-21.md》裡的行動項目 1–3（A9 前端鎖定、後端 businessEventId 配對檢查、`BUYERS_USANCE` 於 Export 的拒絕／正規化）需要先落地，新案例的正確性才有意義~~ → ✅ 行動項目 1、2 已完成（2026-08-21、2026-08-24）；⬜ 項目 3（`BUYERS_USANCE`）仍未落地，見 `TODO.md`。
3. ~~確認後，我會依此矩陣產出正式的 `businessCases.js` step-list 程式碼...~~ → ✅ 已產出並直接寫入 `backend/data/businessCases.js`（7 個提案案例 + 2 個對稱補完案例），非草稿階段。

### 收尾（2026-08-25）

本提案已完成其階段性目的，新增測試矩陣的規劃/落地/驗證循環結束。往後若 A10／B6 Close 矩陣或 Business Case Registry 需要再擴充，建議另立新的日期戳記提案文件，不回頭修改本檔——比照 `Balance-Component-Business-Rule-Decisions-2026-08-21.md`／各驗證報告已經建立的慣例。唯一仍待處理的後續項目（`BUYERS_USANCE` 於 Export 的拒絕／正規化）已記錄在 `TODO.md`，不需要在本文件裡繼續追蹤。
