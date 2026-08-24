# 決策請求：自然到期外部批次觸發 A10/B6 的落地細節（寬限期、容錯與帳號政策、租戶拓撲現況）

**發起依據**：`Natural-Expiry-Scope-Decision-Request.md`（OAS-GAP-15）已於 2026-08-23 回覆結案——自然到期
由外部系統批次判斷，透過既有的 A10/B6 Maker/Checker API（`POST /balance-movements` + `POST .../release`）
觸發，Balance Component 不需要新增 `movementType` 或事件。但那次決策的範圍**明確排除**了「這個答案落地時
實際怎麼運作」的問題（見該文件「不在這次決策範圍內的事」一節），這份文件把那些被排除、但落地前終究要有
答案的問題正式提出。

> **2026-08-24 範圍收斂**：初稿原本列了較大範圍的 SLA／分工介面問題，逐條核對
> `microservices/balance-component/src` 實際程式碼後，發現多數其實已經有現成答案（見下方「已核對程式碼、
> 確認不需要問業務的項目」一節），不需要拿去問業務。真正還需要業務決定的，收斂為以下三題，範圍比初稿窄
> 很多。

> **✅ 已回覆（2026-08-24）**：問題 A、B1、B2 三題都已回覆並核定，完整工程規格與業務／BA 回覆原文見
> `Natural-Expiry-Batch-Trigger-Engineering-Requirements.md`。摘要：A——寬限期由外部批次系統依自訂
> 配置（`gracePeriodDays`/`dayType`/`calendar`，A10／B6 可分別設定）計算後代入 `expiredBefore`，Balance
> Component 不變。B1——技術性瞬時錯誤（連線失敗/逾時/5xx）與 `409` 業務拒絕分開處理，前者依配置重試，
> 後者不立即重試、留給下一輪批次重新評估。B2——**Maker ≠ Checker 業務已核定為全系統要求，不是只限自然
> 到期批次**，`release()` 須新增後端驗證；本文件下方 B2 小節原本「這件事可以先限縮在批次範圍內回答」的
> 框架已被業務撤回，範圍以此回覆為準。以下原始問題與選項保留作為決策過程的歷史記錄。

**請求對象**：業務側（問題 B2 可能也需要 IT 安全政策側一起確認）
**預期產出**：三個各自獨立的明確答案（見下方「請回答的問題」A/B/C），可與其他決策請求併同一次會議討論，
不需要事先準備簡報或文件。

---

## 涉及的業務功能（Function 代碼對照）

這份文件討論的「既有 A10/B6 API」不是抽象概念，就是 Transaction Builder／Maker Panel 畫面上業務同仁已經
在用的這兩個既有功能——外部批次系統呼叫的，跟真人 Maker/Checker 在畫面上手動操作的是**同一個** API，
差別只在呼叫方是排程系統還是真人：

| Function 代碼 | 業務名稱 | Side | 對應商品（Instrument） | 這次決策跟它的關係 |
|---|---|---|---|---|
| **A10** | LC Close（進口信用狀結案） | Import | `IPLC_LC`（進口信用狀） | 外部批次系統到期後實際呼叫的目標功能——沖銷剩餘 Confirmed Balance、把 LC 結案退場 |
| **B6** | Confirmed LC Close（出口保兌信用狀結案） | Export | `EPLC_CONFIRMATION`（出口保兌） | A10 的出口對應版本，自然到期殘值釋放同樣經由這個既有功能觸發 |

**A10/B6 目前既有的觸發前提（`closeEligibility.ts`，本次決策不變動）**：
- A10（LC Close）：SG（提貨擔保）Balance = 0、Acceptance（承兌）Balance = 0，且整棵合約樹（含 SG/Acceptance
  子合約）沒有任何未結 Event，才會出現在可結案清單裡；否則呼叫會被 `409` 擋下——這正是問題 A／B 裡提到
  「批次系統要能分辨的正常業務拒絕」的實際來源，不是新規則，只是把它跟具體 Function 對上號。
- B6（Confirmed LC Close）：Acceptance Balance = 0，且沒有任何未結 Event（包含已 Release 但 B4 尚未
  Honour/Accept 的 B3 提示文件），邏輯與 A10 對稱。

`GET /balance-contracts/close-eligible` 這支既有的 A10/B6 專用可結案清單查詢，本身已經支援 `expiredBefore`
參數（見下一節），所以外部系統怎麼知道「哪些合約到期可結案」這件事已經有答案了，不是開放問題。下面
問題 A、B 問的，是這支查詢已經蓋好之後，落地時還缺的操作參數（寬限期怎麼算）與治理政策（容錯策略、帳號
身份），不是泛指某個抽象的「外部整合要怎麼設計」。

---

## 已核對程式碼、確認不需要問業務的項目

初稿原本假設「外部系統怎麼發現到期合約」「重複觸發會不會有問題」「稽核能不能分辨批次操作」這些都是
開放問題，逐條核對 `microservices/balance-component/src` 之後，確認以下五項其實已經有現成答案，**不需要
拿去問業務**：

1. **偵測機制已經存在**：`GET /balance-contracts/close-eligible` 支援 `expiredBefore` 參數
   （`routes/balanceContracts.ts` 第 60-82 行、`service/balanceService.ts` `listCloseEligibleContracts()`
   第 641-682 行，2026-08-23 隨 GAP-15 discovery-query 一起加上）——外部系統直接查「哪些合約既符合 Close
   資格、又已經過了這個日期」即可，這個查詢介面已經存在，不需要自己撈全部 close-eligible 清單再比對。
2. **不會拿到過期的 `expiryDate` 快照**：這支查詢每次都即時讀合約當下的 `expiryDate`（`expiredBefore ?
   eligible.filter(c => c.expiryDate != null && c.expiryDate < opts.expiredBefore)`，`balanceService.ts`
   第 678 行），不是快取值；外部系統只要每次觸發前重新呼叫，天然拿到最新值，A2/B2 事後延期 Expiry 不會
   造成用到舊日期的風險。
3. **重複觸發是安全的**：`evaluateCloseEligibility()` 把 `alreadyClosed: contract.status === 'CLOSED'`
   算進資格判斷（`domain/closeEligibility.ts` 第 22-25、50-52 行，`balanceService.ts` 第 614 行）——一筆
   合約 Close 成功後就不會再出現在 close-eligible 清單裡，外部系統不需要自己另外做防重複邏輯。
4. **Submit 到 Release 之間的狀態變化會被自動擋下**：`release()` 核准當下重新呼叫同一套資格檢查
   （`balanceService.ts` 第 1587-1601 行），資格或 Confirmed Balance 若已改變，直接拒絕並要求「取消這次
   CLOSE、重新 Submit」——不會有過時的 Close 被誤核准，容錯已經是系統既有行為。
5. **稽核標記已經有**：Maker Submit（`POST /balance-movements`）時可以帶 `triggeredByExpiry: true`
   （`types.ts` 第 262-265 行），標記這筆交易是批次觸發、不是人工操作，純稽核用途、不影響任何資格判斷，
   Inquire Events／稽核追蹤可以直接讀這個欄位，不需要另外設計標記機制。

**順帶發現一處程式碼與自身文件不一致，屬於工程技術債，不是業務問題**：`balanceService.ts` 第 216 行的
doc comment 宣稱「Checker 端也有對應的 `ReleaseMovementRequest` 可以設定 `triggeredByExpiry`」，但這個
型別在 `types.ts` 全文中並不存在，`release()` 本身（第 1532 行）也只接受 `(movementId, releasedBy:
string)` 兩個參數，Checker 核准時無法再設定這個標記。程式碼本身的行為沒有問題（觸發來源本來就該在建立
當下定案，Checker 核准時不該能改寫）——只是那句 doc comment 指向一個不存在的型別，會誤導以後的人去找。
建議請工程師順手修掉這句註解，不需要納入本次業務決策。

---

## 背景（1 分鐘版）

GAP-15 決策解決的是**範圍問題**：「自然到期算不算 Balance Component 該管的事」——答案是「算，但透過既有
API，不需要新機制」。這份文件要問的是**下一層、操作面的問題**：既然決定要透過既有 A10/B6 API 落地，實際
運作起來，誰在什麼時候做什麼事、失敗了誰負責，目前完全沒有定義。

這不是重新打開 GAP-15，範圍問題已經結案，也不是重新打開「外部系統怎麼發現到期合約」——那個機制已經蓋好
（見上一節）。這裡剩下的三個問題，問的是機制之外、程式碼不會幫你決定的**業務政策參數**：寬限期怎麼算、
容錯策略是什麼、帳號身份怎麼管。三個問題彼此獨立，答案不互相依賴，可以分開回覆。

---

## 問題 A：自然到期的寬限期（Grace Period）怎麼算

> **✅ 已回覆（2026-08-24）**：外部批次系統依自訂配置計算，見
> `Natural-Expiry-Batch-Trigger-Engineering-Requirements.md` 第 1、2 節。

### 背景

`GET /balance-contracts/close-eligible` 的 `expiredBefore` 參數，本身只是單純的日期比較
（`c.expiryDate < opts.expiredBefore`）——**完全不含寬限期概念**，外部系統傳什麼日期進來，Balance
Component 就用那個日期比。這個「傳什麼日期進來」的計算，完全發生在 Balance Component 外面，程式碼不會
幫忙算，也算不出來（微服務本身沒有假日曆，這是 GAP-15 既有分工——見 `lc-balance/CLAUDE.md`「A6/B4
Calculated Maturity Date」段落）。

輪詢頻率（外部系統多久呼叫一次這支查詢）純粹是外部系統自己的排程設計，不涉及 Balance Component 任何
現有機制或效能考量（`expiredBefore` 查詢本身就是即時讀取，見上一節第 2 點），這次**不需要**問業務。

### 請回答的問題

1. 外部系統呼叫 `expiredBefore` 時，這個日期具體怎麼算——就是 `expiryDate` 當天，還是要加計寬限天數
   （例如「到期後 N 個銀行營業日才視為可觸發」）？
2. 如果要加計寬限天數，這個天數是全行統一的固定值，還是依到期地點/遞交管道/客戶而不同（比照 §1.1
   `mail_float_grace` 當初的討論方向，但注意：GAP-15 已經確認這個政策**不會**變成 Balance Component
   自己維護的 `ExpiryReleasePolicy` schema——無論答案是什麼，都是外部系統自己內部的計算邏輯，只影響它
   傳給 `expiredBefore` 的值，不影響 Balance Component 任何欄位或行為）。

### 這個答案會決定什麼

| 回答方向 | 對應影響 |
|---|---|
| 到期當天即可觸發，不加寬限期 | 外部系統直接把 `expiryDate` 傳進 `expiredBefore`（或當天日期），無需額外邏輯 |
| 統一寬限天數（例如 N 個日曆日/營業日） | 外部系統自己在呼叫前加算這個天數，Balance Component 端不需要任何改動 |
| 依情境不同（到期地點/遞交管道/客戶分層） | 外部系統需要自己維護一份對照規則，Balance Component 端同樣不需要任何改動——這純粹是外部系統內部的政策計算，不會回頭變成本專案的需求 |

---

## 問題 B：外部系統呼叫失敗時的容錯與帳號身份政策

### 背景

`Natural-Expiry-Scope-Decision-Request.md` 已經講清楚：子帳未結清被 `409` 擋下是正常業務拒絕，不是系統
故障。但「正常拒絕之後怎麼辦」跟「用什麼身份呼叫」，Balance Component **沒有、也不會有**任何內建機制——
這完全是外部批次系統自己的責任範圍，程式碼端不提供技術強制力，需要業務／IT 政策決定該怎麼運作。

### B1．不合格時的容錯策略

> **✅ 已回覆（2026-08-24）**：技術性瞬時錯誤與 `409` 業務拒絕分開處理，見
> `Natural-Expiry-Batch-Trigger-Engineering-Requirements.md` 第 5 節。

一筆合約到期了，但呼叫 A10/B6 被 `409` 擋下（SG／Acceptance 還沒清、或還有未結 Event）——外部系統要
重試幾次、間隔多久、多久之後轉人工處理（例如提示 Ops 先用 A9/A7 手動結清）、誰要收到告警？這些 Balance
Component 完全不管，也不會幫忙重試，需要業務／Ops 自己定義。

### B2．Maker/Checker 帳號身份政策

> **✅ 已回覆並核定（2026-08-24）**：Maker ≠ Checker 業務已核定為**全系統要求**，不是只限自然到期批次
> 觸發——下面這段原始背景把它框成「批次觸發要用什麼帳號」的局部問題，這個框架已被業務明確撤回。詳見
> `Natural-Expiry-Batch-Trigger-Engineering-Requirements.md` 第 4 節與文末「業務／BA 回覆記錄」。範圍
> 變大後另外衍生兩項工程提醒（`domain/statusTransition.ts` doc comment 需同步更新、`reject()` 是否
> 一併適用待工程師向業務確認）與一項測試提醒（`import_lc_test.sh`／`export_lc_test.sh` 可能有既有測試
> 共用 Maker/Checker 帳號），同樣記在該文件裡，不重複列在此處。

`createdBy`／`releasedBy` 在程式碼裡是完全自由的字串，沒有任何格式或身分驗證，同一個字串理論上可以同時
當這筆交易的 Maker 又當 Checker（`domain/statusTransition.ts` 本身的 doc comment 明講：「Maker and
Checker being the same person is NOT enforced here...a bank's own role/entitlement policy, out of
scope for this service's own state machine」——這句話本身也已經因為這次核定而過時，見上方提醒）。批次
觸發要用什麼帳號送出 Maker Submit／Checker Release、要不要規定兩次呼叫必須是不同帳號以維持 4-eyes
分離，純屬業務／IT 安全政策，程式碼端不提供任何技術強制力（這個問題不需要等
`Auth-And-Tenant-Isolation-Decision-Request.md`／OAS-GAP-01 的整體認證機制定案才能回答——帳號身份
「政策」本身可以先確定，實際怎麼技術落地才需要等那份決策）。

### 請回答的問題

1. （B1）外部系統對 `409` 業務拒絕的重試次數、間隔、轉人工的時機與告警對象，業務／Ops 有沒有既定規則？
   如果沒有，是否需要現在定一個最低限度的標準？
2. （B2）批次觸發的 Maker Submit／Checker Release，是否要求使用兩個不同的帳號（維持 4-eyes 分離）？

### 這個答案會決定什麼

| 回答方向 | 對應影響 |
|---|---|
| B1：已有既定重試/告警規則 | 直接沿用，Balance Component 端不需要任何改動——`triggeredByExpiry` 稽核標記已經存在，事後可用來追查批次觸發的交易 |
| B1：目前沒有規則 | 建議至少先定一個最低限度標準（例如「重試 3 次、間隔遞增，仍失敗則轉 Ops」），避免卡住的合約無人察覺 |
| B2：要求不同帳號 | 外部批次系統需要準備兩個服務帳號分別執行 Submit／Release；Balance Component 端不需要任何改動（`createdBy`/`releasedBy` 本來就各自接受任意字串） |
| B2：允許同一帳號 | 沿用現狀即可，跟真人操作允許（但不建議）同一人身兼 Maker/Checker 是同一個既有政策空間，不需要新規則 |

---

## 問題 C：GAP-09 租戶拓撲——現況說明，不重複提問

`Balance Contract Integration Proposal.md` 建議落地順序第 0 步裡的 OAS-GAP-09（TF Solutions 租戶拓撲：
單一機構 vs 多機構）**已經有自己獨立的決策請求文件在跑**：`TF-Solutions-Tenant-Topology-Decision-Request.md`。
這個問題跟本文件的 A、B 兩題性質不同——它問的是「要不要對接多家分行/多家銀行」，會決定 OAS-GAP-01
（認證）+ 租戶隔離模型要不要一起設計，範圍比自然到期批次整合大得多，也不是 GAP-15 衍生出來的問題。

放進本文件只是為了完整交代前次分析提到的「三項需要業務投入的暫緩項目」全貌，**不是要在這裡重複提問**——
這一項的進度請直接去看 `TF-Solutions-Tenant-Topology-Decision-Request.md` 本身是否已有回覆，不需要在
本文件的會議上重新討論。

---

## 不在這次決策範圍內的事

- GAP-15 本身「自然到期算不算 Balance Component 該管」——已結案，不重新討論。
- 外部系統怎麼發現到期合約（discovery 機制本身）——已經有現成答案（`expiredBefore` 查詢），不重新討論，
  見上方「已核對程式碼、確認不需要問業務的項目」。
- OAS-GAP-09 租戶拓撲問題本身——見上方問題 C，屬於 `TF-Solutions-Tenant-Topology-Decision-Request.md`
  自己的範圍。
- 外部批次系統掃描/輪詢的頻率——純屬外部系統自己的排程設計，不涉及 Balance Component，不需要在這裡決定。
- B2 已核定為全系統要求後，實際的帳號憑證管理／認證技術落地方式——這件事會跟
  `Auth-And-Tenant-Isolation-Decision-Request.md`（OAS-GAP-01）的認證機制決策連動，本次核定只確認了
  「Maker≠Checker 這條政策本身、且範圍是全系統」，技術怎麼做（憑證管理、Session/Token 綁定帳號等）留到
  那份決策定案後再處理。
- `balanceService.ts` 第 216 行 doc comment 指向不存在的 `ReleaseMovementRequest` 型別、以及
  `domain/statusTransition.ts` 「Maker≠Checker 不強制」那句 doc comment——都已標記為工程技術債／需同步
  更新項目，見 `Natural-Expiry-Batch-Trigger-Engineering-Requirements.md`，不需要在這裡進一步決定。
- `reject()` 是否也要套用 Maker≠Checker 驗證——業務已提醒工程師需要另外確認，尚未在本次核定範圍內拍板，
  見上述工程需求文件文末「業務／BA 回覆記錄」。

---

*對應背景分析：`lc-balance/analysis/LC-Expiry-Acceptance-Maturity-Control-Review.md` §9／§10（2026-08-23
更新註記）；`Natural-Expiry-Scope-Decision-Request.md`「不在這次決策範圍內的事」一節列出的三項後續問題。
對應回覆與完整工程規格：`Natural-Expiry-Batch-Trigger-Engineering-Requirements.md`（2026-08-24）。*
