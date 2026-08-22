# 決策請求：LC/Confirmation 自然到期（EXPIRE），是不是這份合約該做的事？

**發起依據**：`Balance Contract Integration Proposal.md` 的 OAS-GAP-15——外部覆核核對 15 個 `movementType`
枚舉值後發現的開放問題，不是已確認的缺陷。
**請求對象**：業務側 + 架構側
**預期產出**：一個明確答案（見下方「請回答的問題」），不需要事先準備簡報或文件。可與 GAP-09（TF
Solutions 租戶拓撲）併同一次會議討論。

---

## ✅ 已回覆（2026-08-23）

**答案**：自然到期由**外部系統依交易條件批次判斷，透過既有的 A10/B6 Close API（Maker Submit + Checker
Release）觸發**，跟人工在 UI 上操作走同一條路徑，Balance Component 不知道、也不需要知道呼叫方是排程
系統還是真人。

**對照下方表格**：屬於第一列「自然到期是外部批次流程的職責，不經過本 API」的一個精確變體——批次觸發的
決策/排程邏輯確實在外部，但**呼叫的是既有的通用 API**，不是完全繞過 Balance Component。結論相同：
**GAP-15 結案，不需要新增 `movementType` 或事件**（不需要 `LC_EXPIRE`/`CNF_EXPIRE`）。

**釐清的附帶問題**：批次觸發時 Maker Submit／Checker Release 是否需要兩個不同身份，以維持 4-eyes 分離？
——業務回覆：分別呼叫兩次，本來就是 A10/B6 各自獨立的 Maker/Checker API（`POST /balance-movements` 建立
PENDING + `POST .../release` 核准），批次流程沿用既有的兩步驟呼叫形狀，不需要新端點或特殊行為。至於這
兩次呼叫是否用不同身份執行，查證 `domain/statusTransition.ts` 自己的既有設計：「Maker and Checker being
the same person is NOT enforced here... out of scope for this service's own state machine」（2026-08-14
業務指示，已是既定設計）——身份分離是銀行自己的權限政策問題，不是 Balance Component 的狀態機要管的事，
批次觸發沒有引入新的例外。

**Balance Component 因此需要／不需要做的事**：
- 需要：`expiryDate` 欄位存在（Phase 0，已在 `A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md`
  規劃中，且這件事本來就跟 GAP-15 本身無關——供外部批次系統讀取，決定何時觸發）、`close-eligible`
  查詢維持準確（已存在，`GET /balance-contracts/close-eligible`）
- 不需要：新的 `movementType`、排程機制本身、`ExpiryReleasePolicy` 這類設定 schema、對
  `evaluateCloseEligibility()` 的任何修改（**不要**加一條「`expiryDate` 必須已過期」的條件——這會違反
  既有的「cancellation before expiry」設計，A10/B6 本來就允許在 LC 尚未過期時提前結案，這條規則沒有被
  這次決定改變）

**預期會遇到的正常拒絕，不是系統故障**：如果 LC 過期當下 SG 或 Acceptance Balance 還沒歸零，外部系統
呼叫 A10/B6 會被既有的資格條件擋下（`409`）——這是既有行為，不是 bug，不需要 Balance Component 做任何
修改。外部批次系統自己的失敗重試邏輯需要能分辨「這次拒絕是因為子帳未結清（正常，之後重試或交給人工先
用 A9/A7 結清）」還是「真正的系統錯誤」，避免第一次遇到批次呼叫失敗時被誤判成系統故障。

---

## 背景（30 秒版）

A10（Import LC Close）/B6（Export Confirmed LC Close）這兩個功能，設計上明確自比為「cancellation before
expiry」——也就是說，Close 是 Maker/Checker **主動觸發**的提前結案，語意上隱含存在一個對應的、**日期
觸發**的自然到期流程。

但整份合約（15 個 `movementType` 值逐一核對過）裡找不到任何 `EXPIRE` 或等效事件。目前沒有任何一份文件
（OAS、`CLAUDE.md`、Obsidian KB）明講這件事該怎麼處理——**這不代表一定是缺口**，自然到期完全可能本來就
是外部批次流程的職責，不該經過這個 API；但也可能是這個微服務本來就該有、只是還沒排上實作。

## 請回答的問題

**LC/Confirmation 的自然到期，是由外部批次流程處理、完全不經過 Balance Component，還是這個微服務本來
就該有、但目前尚未實作的一塊？**

（如果現階段還沒有明確答案，「目前先假設是外部批次流程的職責，Balance Component 不用管」也是一個可以
接受的明確答案——重點是要有結論，讓 OAS-GAP-15 可以決定要不要變成正式的實作項目，而不是無限期停在
「不確定」。）

## 這個答案會決定什麼

| 回答 | 對 OAS-GAP-15 的影響 | 對應工程範圍 |
|---|---|---|
| 自然到期是外部批次流程的職責，不經過本 API | GAP-15 結案，不需要新增 `movementType` 或事件 | 無——頂多在 OAS 補一句說明「自然到期不在本合約範圍」，避免未來又被問到同一個問題 |
| Balance Component 本來就該處理自然到期，只是還沒實作 | GAP-15 升級為正式待辦項目，需要設計新的 `movementType`（例如 `EXPIRE`）或等效機制 | 真正的新功能設計：日期觸發的排程機制、跟現有 A10/B6 Close 邏輯（eligibility 檢查、write-off 金額公式）的關係要重新釐清，工作量比其他 GAP 項目都大 |
| 不確定，需要評估 | 建議先維持現狀（GAP-15 不升級為正式項目），但在 OAS 留一句「自然到期範圍待確認」的說明，不要假裝這件事已經有答案 | 最低風險的中間路線，日後真的需要時再重新排入規劃 |

## 不在這次決策範圍內的事

這次只需要回答「這是不是本合約該做的事」，不需要當場決定：
- 如果答案是「該做」，`EXPIRE` 機制的具體設計（排程觸發方式、跟 A10/B6 既有 Close 邏輯共用哪些檢查）
  ——這是後續工程設計階段的事
- 如果現有的外部批次流程已經存在，它目前實際上是怎麼運作的——這是另外一個需要找到負責該流程的團隊
  才能回答的問題，跟這次「Balance Component 該不該管」是兩個獨立問題

---

*對應完整分析：`lc-balance/Balance Contract Integration Proposal.md` 的 OAS-GAP-15 小節。*
