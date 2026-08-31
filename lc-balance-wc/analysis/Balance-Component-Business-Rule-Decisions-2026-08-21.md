# Balance Component 業務規則決策備忘錄
**日期**：2026-08-21　**性質**：點時間戳記的決策紀錄（比照 `REGRESSION-BASELINE.md` 慣例，事後不修改本檔內容反映新工作；後續若有變動另立新的日期戳記文件）

> **同日訂正（2026-08-21，實作階段發現）**：決策 1 原文寫「A9 改為 `amountAutoFilledFrom: 'confirmedBalance'`」，**這個欄位選錯了，正確應為 `availableBalance`**。程式員在實作時舉了具體反例（S8 案例）：`SG Issue G01 10,000` → `A3S Document Arrival w/ SG G01 2,000`（此時該筆 PARTIAL_REDEEM 若還 PENDING，SG 的 Confirmed Balance 仍是 10,000，但 Available Balance 已經是 8,000）→ 此時若 A9 要贖回，正確金額是**剩餘的 8,000**，不是 10,000——因為那 2,000 已經被 A3S 佔用/預留了。用 `confirmedBalance` 會把 Amount 鎖定成 10,000，送出後會被 `checkRedeemSufficiency`（比對 sgAvailableBalance）擋下來，導致 A9 在有並存 PENDING 贖回時完全卡住，不是單純顯示錯誤而已。這跟 A10/B6 Close 用 `confirmedBalance` 的理由不同——Close 依賴 `closeEligibility.ts` 已經保證沒有其他 PENDING 子交易，A9 沒有這層保證（A3S 的配對贖回本來就可能還在 PENDING）。多數情況下（沒有並存 PENDING 交易）兩個欄位數值相同，這是為什麼一開始沒有立即被抓出來。下方決策 1 原文保留不動（維持稽核軌跡），正確依據以本訂正為準；行動項目表已同步更新。
**觸發**：`analysis/TF_Balance_Component_Mapping-en.xlsx`（及 zh 版）與 `microservices/balance-component` 原始碼同步檢查時發現的業務規則衝突，經 BA 確認後定案。
**適用範圍**：Balance Component（Angular 前端 `src/app/transaction-builder`、microservice `microservices/balance-component/src`、Business Case Registry `backend/data/businessCases.js`）

---

## 決策 1（VERY HIGH priority）：SG Redemption 原則上限「整筆贖回」，不支援任意金額的 Partial Redemption

### 規則文字（供程式規格引用）

> SG Redemption does NOT support partial redemption by arbitrary amount. Once the corresponding original Bill of Lading is received and the Shipping Guarantee is redeemed/released by the carrier, the entire outstanding amount of that SG shall be redeemed in one FULL_REDEEM movement. The one narrow exception is a redemption that is part of a document-matched compound submission (A3S — "Document Arrival w/ Shipping Gtee"), where the redeemed amount is tied to a specific, identifiable set of arrived documents rather than an arbitrarily typed figure.

### 依據

- **Mapping workbook**（BA 維護、專案治理上定位為 build 依據）README「Three rules that must not be configured away」第 1 條：*"SG discharge is instrument-based, not amount-based — L1_Event_Catalogue (SG_REDEEMABLE is STATUS_ONLY; SG_RELEASE is full), tests T3, T4."*；`L1_Event_Catalogue` SG_RELEASE 列：*"FULL amount, no residual. Test T4."*；`Test_Scenarios` T4：*"Contingent goes to 0. No 5,000 residual."*
- **業界慣例**（BA 提供、已逐一查證原文）：
  - DBS *Shipping Guarantee & Airway Bill Endorsement* 產品說明：*"The indemnity will be cancelled only when the original BL or AWB is surrendered to the transport company for redemption."*
  - 中國銀行台灣「擔保提貨」說明：*"進口商向我行辦理付款贖單，然後憑正本提單向船公司（或其它承運人）換取先前出具的提貨擔保並交還我行。"*
  - UOB、Standard Chartered 公開資料亦描述同一機制——SG／Letter of Indemnity 是銀行對承運人的單一 undertaking，其解除取決於承運人是否以銀行滿意的方式釋放該筆責任，不是單據到齊比例。
- **與現行系統的衝突**：`shgtRedeem.ts` 檔頭註解（"business-confirmed 2026-08-14, Import LC Case 4"）與 `maker-submit.service.ts` 的 `submitDocumentArrivalWithSg()`（`sgRedeemAmount = Math.min(Document Amount, SG Outstanding)`）目前允許依到單金額做 Partial Redemption，與上述規則牴觸。

### 定案的處理方式

「到單金額」（Document Amount／Matched Amount）與「SG 實際解除金額」（SG Redemption Amount）是兩件事，不應混為一談。系統內對這件事有兩條路徑，處理方式不同：

| 路徑 | 現況 | 決議 |
|---|---|---|
| **A9**（獨立、Maker 自行輸入金額的 SG Redemption 畫面） | `function-strategy.ts`：`amountVsAvailableDerivation: 'REDEEM'`，Amount 自由輸入，依 Amount vs. Available 自動判定 FULL_REDEEM／PARTIAL_REDEEM | **改為 `amountAutoFilledFrom: 'confirmedBalance'`**（比照 A10/B6 Close 的既有模式）：Amount 不給打字，直接帶入並鎖定該 SG 當下 Confirmed Balance，只產生 FULL_REDEEM |
| **A3S**（Document Arrival w/ Shipping Gtee，到單與 SG 配對的複合提交） | `maker-submit.service.ts` `submitDocumentArrivalWithSg()`：`Math.min(Document Amount, SG Outstanding)` 自動算、自動選 FULL/PARTIAL_REDEEM | **維持現況不變**——這裡的部分金額有明確、可追溯的到單文件對應（同一個 `businessEventId` 綁定 SG 的 REDEEM 與 LC 的 UTILIZE），屬於 document-matched，不是 amount-based 的任意輸入，跟 Rule #1 要防的情境性質不同 |

**額外必要動作（後端強制，前端鎖定只是 UX，不構成真正的控制）**：目前 `balanceService.ts`（第 198 行）對 SHGT 的 PARTIAL_REDEEM／FULL_REDEEM **唯一**的檢查是 `checkRedeemSufficiency`（金額不超過 Available Balance），完全沒有檢查這筆 PARTIAL_REDEEM 是否真的帶有跟某筆 IPLC_LC UTILIZE 共用的 `businessEventId`。任何人繞過 Angular 畫面直接呼叫 API，今天仍然可以送出一筆跟任何到單都無關的獨立 PARTIAL_REDEEM。**需要在後端（`shgtRedeem.ts` 或 `balanceService.ts` 的 SHGT REDEEM 檢查路徑）補一道規則：SHGT 的 PARTIAL_REDEEM 只有在帶有跟某筆 PENDING/RELEASED IPLC_LC UTILIZE 共用的 `businessEventId` 時才允許，否則一律拒絕、要求改用 FULL_REDEEM。**

### 對既有測試資產的影響

檢查過 `backend/data/businessCases.js` 現有 14 案：import-case-3／4／6 的 SG PARTIAL_REDEEM／FULL_REDEEM 步驟全部都帶有跟對應 UTILIZE 共用的 `businessEventId`（A3S 的合法配對模式），**符合新規則，不需要重寫**。新規則實際影響的是「未來若有人透過 A9 或直接呼叫 API 做無配對的任意金額部分贖回」這條路徑，屬於防呆補強，不是既有回歸案例的破壞性變更。

---

## 決策 2（VERY HIGH priority）：Buyer's Usance 是開證行對買方的融資安排，只存在 Import 側；Export／保兌一律視同 Sight 處理

### 規則文字

> A Buyer's Usance tenor represents financing the Issuing Bank extends to the Applicant (buyer) on the Import side; the Issuing Bank still settles with the Beneficiary/Negotiating Bank promptly. From the Export/Confirming Bank's own balance-sheet perspective, a Buyer's Usance LC carries no deferred-payment exposure of its own and MUST be processed identically to a Sight LC (B4 routes to HONOUR, never ACCEPT). `tenorType: 'BUYERS_USANCE'` is not a valid declaration for an `EPLC_CONFIRMATION` contract.

### 依據與現行系統的衝突

- `submit-rules.ts`（第 128–136 行，Design doc §7 Tenor Type Routing v0.7）明文：*"SELLERS_USANCE and BUYERS_USANCE drive IDENTICAL Balance +/- mechanics... it exists purely so the distinction survives for audit... the two is out of Balance Component's own scope."* ——這是先前有意識做的簡化決定，但其後果是：Export 側一旦宣告 `BUYERS_USANCE`，B4 會依 `derivesMovementTypeFromTenor` 邏輯（非 SIGHT 一律走 ACCEPT）錯誤地建立 Acceptance Liability／Reimbursement Receivable，而這筆曝險實際上不該存在於 Export／保兌行的帳上。
- `checkAcceptanceTenorConsistency()`（`tenorRouting.ts`）目前也沒有任何機制阻擋 `EPLC_CONFIRMATION` 宣告 `BUYERS_USANCE`。

### 定案的處理方式

1. **Export Usance 測試矩陣只涵蓋 Seller's Usance**，不需要對稱補「Buyer's Usance for Export」這條分支。
2. **`EPLC_CONFIRMATION`（B1 Confirm LC）的 `tenorType` 應拒絕 `BUYERS_USANCE`**，或至少在 Export 側自動正規化為 `SIGHT` 處理（走 HONOUR，不建立 Acceptance）——實作選項留給程式員與 BA 進一步討論，取決於前台／中台是否仍需要保留「這筆 LC 對買方是 Buyer's Usance」這個標記供 MT700 對照／報表使用。
3. **`export-case-2`／`export-case-4`（`tenorType: 'BUYERS_USANCE'`）需要修正**，但不是單純把 `tenorType` 換成 `SIGHT` 就結束——這兩個案例目前是刻意設計來測試 B4 的 ACCEPT／Acceptance 複合流程，若改成 SIGHT，情境會退化成跟 export-case-1／6 重複，等於失去這兩案原本想涵蓋的測試價值。**建議程式員與 BA 一起重新檢視這兩個案例的真實測試意圖**：如果原意是要測「Unconfirmed＋Usance」這種情境，正確的修正可能是把 `tenorType` 改成 `SELLERS_USANCE`（Export 唯一合法的 Usance 分支），而不是改成 `SIGHT`。此項列為待雙方確認的行動項目，非本備忘錄可單方定案。

---

## 決策 3：EBL（Export Bills Discounted／early financing）不在 Balance Component 範疇內

### 規則文字

> EBL financing is a Loan Component asset transaction (early payment to the exporter before the Issuing Bank settles). It never produces a Balance Component API call and is out of scope for this test suite entirely.

### 依據

BA 直接確認：「出口所有的 B1–B6 都是針對保兌處理，EBL 不在此 Balance Component 範疇之中」。現行 `export-case-3`／`export-case-5` 裡跟 EBL 相關的步驟本就只是 `note` type（無 API 呼叫），與此決議一致，不需修改。

### 對測試矩陣的影響

新提案的測試矩陣不需要為 EBL／No EBL 增加獨立測試維度；現有 `export-case-2～5` 若涉及 EBL 的 `note` 步驟維持現狀即可。

---

## 行動項目彙總

> **狀態更新（2026-08-24，代碼檢查後附加，不覆寫原文）**：本表下方「狀態」欄位維持 2026-08-21 決策當下原文不動；以下用附加註記的方式記錄後續進度，同一份文件內「事後不修改本檔內容」的慣例僅適用於決策本文，狀態欄位本來就設計為可追蹤——比照本文件開頭「同日訂正」段落已經建立的「附加、不刪除」模式。項目 2、4、6 已於 2026-08-21～2026-08-24 陸續完成，逐一核對程式碼確認：
> - **項目 2**（後端 businessEventId 配對檢查）：**已完成（2026-08-24）**——`service/balanceService.ts` 的 `outstandingCapped` sufficiency check（Maker/Submit）與 `release()`（Checker/Release 複查）都已補上；判斷依據正是本文件決策 1 講的「Matched Amount ≠ Redeemed Amount」區分（有無 `businessEventId`，不是看 movementType 字串）。5 個新測試，三套測試全綠。詳見 `CLAUDE.md` 決策日誌對應條目、OAS v1.18.0 changelog。
> - **項目 4**（`export-case-2`／`export-case-4` `tenorType` 修正）：**已完成**——`backend/data/businessCases.js` 兩案的 `tenorType` 已改為 `SELLERS_USANCE`（1466、1648 行核對確認）。
> - **項目 6**（新增測試案例）：**已完成（2026-08-21）**——見 `Balance-Component-Test-Case-Proposal.md` §4，import-case-8～12、export-case-8～11 共 7 案新增，7/7 live-verified。
>
> 項目 3（`BUYERS_USANCE` 拒絕/正規化）、項目 5（Mapping workbook Rule #1 文字補強，BA 待辦）**仍維持原狀未完成**，核對程式碼與 workbook 皆確認尚未動手。

| # | 項目 | 檔案 | 優先級 | 狀態（2026-08-21 決策當下原文） |
|---|---|---|---|---|
| 1 | A9 Amount 欄位改為鎖定帶入 SG **Available Balance**（同日訂正，原文誤寫 Confirmed Balance），只產生 FULL_REDEEM | `src/app/transaction-builder/function-strategy.ts` | VERY HIGH | ✅ 程式員已實作（同日發現並訂正上述欄位選擇） |
| 2 | 後端補 SHGT PARTIAL_REDEEM 必須配對 businessEventId／UTILIZE 的檢查，否則拒絕 | `microservices/balance-component/src/domain/shgtRedeem.ts` 或 `service/balanceService.ts` | VERY HIGH | ~~暫緩~~——2026-08-21 拍板先只做測試案例，此項與行動項目 3 一起延後 → **見上方 2026-08-24 狀態更新：已完成** |
| 3 | `EPLC_CONFIRMATION` 拒絕或正規化 `tenorType: 'BUYERS_USANCE'` | `microservices/balance-component/src/domain/tenorRouting.ts`、`service/balanceService.ts` | VERY HIGH | **暫緩**——同上（仍未完成） |
| 4 | `export-case-2`／`export-case-4` 重新檢視測試意圖並修正 `tenorType` | `backend/data/businessCases.js` | HIGH | ~~待程式員與 BA 共同確認修正方向~~ → **見上方 2026-08-24 狀態更新：已完成** |
| 5 | Mapping workbook Rule #1 補充「Matched Amount ≠ Redeemed Amount」與 A3S 例外的措辭 | `analysis/TF_Balance_Component_Mapping-en.xlsx`／`-zh.xlsx`（README、L1_Event_Catalogue） | MEDIUM | 待 BA 更新 workbook（仍未完成） |
| 6 | 新增 Import/Export 測試案例（A10／B6 Close、B2 獨立案例等） | `backend/data/businessCases.js` | MEDIUM | ~~見 `Balance-Component-Test-Case-Proposal.md`~~ → **見上方 2026-08-24 狀態更新：已完成** |

---

*本文件為決策當下的定案紀錄。若日後規則有變動，另立新的日期戳記文件，不回頭修改本檔——本次僅以附加註記方式記錄行動項目狀態進度，決策本文（規則文字、依據、定案處理方式）逐字未動。*
