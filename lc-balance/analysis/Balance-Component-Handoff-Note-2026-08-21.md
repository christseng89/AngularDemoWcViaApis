# Balance Component 交接說明（Handoff Note）
**日期**：2026-08-21　**性質**：點時間戳記的交接紀錄（比照 `REGRESSION-BASELINE.md`／決策備忘錄慣例，事後不修改本檔內容反映新工作；後續若有變動另立新的日期戳記文件）
**交接對象**：程式員
**交接範圍**：本輪 SG Redemption／Buyer's Usance／EBL 三項業務規則決議，以及對應的測試案例矩陣與驗證結果，共三份文件

---

## 1. 三份文件的關係與閱讀順序

| 順序 | 文件 | 性質 |
|---|---|---|
| 1 | `Balance-Component-Business-Rule-Decisions-2026-08-21.md` | **先讀這份**——決策備忘錄，記錄三項業務規則決議的依據與定案內容，後面兩份都是依這份決議延伸出來的工作 |
| 2 | `Balance-Component-Test-Case-Proposal.md` | 依決議定案後的測試矩陣提案：現有 14 案覆蓋盤點、缺口分析、新增 7 案的設計 |
| 3 | `Balance-Component-New-Test-Cases-Verification-2026-08-21.md` | 上述 7 個新案例（import-case-8～11、export-case-8～10）的實跑驗證紀錄，7/7 PASS——**這份是完成紀錄，不是待辦** |

## 2. 決策備忘錄內容摘要

- **決策 1**：SG Redemption 原則上限「整筆贖回」，不支援任意金額的 Partial Redemption；A3S（Document Arrival w/ Shipping Gtee）因為有明確可追溯的到單配對，維持現況允許部分贖回，是唯一例外。
- **決策 2**：Buyer's Usance 是開證行對買方的融資安排，只存在 Import 側；Export／保兌一律視同 Sight 處理，`EPLC_CONFIRMATION` 不應接受 `tenorType: 'BUYERS_USANCE'`。
- **決策 3**：EBL 融資不在 Balance Component 範疇內，測試矩陣不需要涵蓋。

> 文件開頭有一段「同日訂正」：決策 1 原本誤寫 A9 該鎖定 Confirmed Balance，正確應為 **Available Balance**（理由：需要淨掉同一張 SG 上已存在的 PENDING 贖回，例如 A3S 配對贖回還在 PENDING 時，Confirmed Balance 不會反映；已訂正並反映在下方行動項目表）。

## 3. 行動項目現況

| # | 項目 | 優先級 | 狀態 |
|---|---|---|---|
| 1 | A9 Amount 欄位鎖定為 SG **Available Balance**，只產生 FULL_REDEEM | VERY HIGH | ✅ 已實作 |
| 2 | 後端補 SHGT PARTIAL_REDEEM 必須配對 `businessEventId`／UTILIZE 的檢查，否則拒絕 | VERY HIGH | **暫緩**（2026-08-21 拍板先只做測試案例，尚未排期） |
| 3 | `EPLC_CONFIRMATION` 拒絕或正規化 `tenorType: 'BUYERS_USANCE'` | VERY HIGH | **暫緩**（同上） |
| 4 | `export-case-2`／`export-case-4` 重新檢視測試意圖並修正 `tenorType`（很可能該改 `SELLERS_USANCE`，不是單純換成 `SIGHT`——理由見決策備忘錄決策 2） | HIGH | **待程式員與 BA 共同確認修正方向**，非程式員可單方定案 |
| 5 | Mapping workbook Rule #1 補充「Matched Amount ≠ Redeemed Amount」與 A3S 例外的措辭 | MEDIUM | 待 BA 自行處理，不需要程式員 |
| 6 | 新增 Import/Export 測試案例（A10／B6 Close、B2 獨立案例） | MEDIUM | ✅ 已完成並實跑驗證（見第 3 份文件） |

**程式員接下來要處理的，只有項目 2、3、4**——項目 2、3 已知暫緩、不急；項目 4 需要先跟 BA 對齊方向再動手。

## 4. 過程中產生但已捨棄的檔案

`analysis/businessCases-new-cases-draft.js` 是本輪工作過程中 AI 助理端產出的一份新案例草稿，設計金額（如 import-case-10 的 Document Arrival 70,000／SG 30,000）跟實際整合進 `backend/data/businessCases.js` 並已實跑驗證的版本（見第 3 份文件的 import-case-10：SG 60,000 相關設計）不同、也從未實際跑過 API 驗證。已確認非採用版本，已從 `analysis/` 移除——若在版本歷史或本機殘留檔案中看到，不需要參考，以 `backend/data/businessCases.js` 裡實際的程式碼與《Balance-Component-New-Test-Cases-Verification-2026-08-21.md》記錄的版本為準。

---

*本文件為交接當下的定案紀錄。若日後有新的交接需求，另立新的日期戳記文件，不回頭修改本檔。*
