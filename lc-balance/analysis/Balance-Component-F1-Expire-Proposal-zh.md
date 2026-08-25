# Balance Component — F1（到期 / UCP 600 第16(f)條自動釋放）實作提案

**日期**：2026-08-25　**狀態**：待 BA 核准（尚未動手實作）
**觸發**：外部 BA 專家評審 `analysis/TF-Balance-Component-BA-Review-{en,zh}.docx` F1（高嚴重度）——
微服務目前完全沒有到期觸發的自動釋放機制，只有人工、Maker/Checker 觸發的 `CLOSE`（A10/B6）。
**適用範圍**：`microservices/balance-component/`（新增 `EXPIRE` movement type 與背景排程）、
`src/app/transaction-builder/`（A1/B1 新增到期日輸入、A2/B2 新增修改到期日的選項）、
`analysis/balance-component-api.yaml`（OAS 版本 bump）。

本文件是**提案**，記錄本 session 內部已經討論定案、但尚未經正式 BA 簽署的技術設計，供 BA 審閱核准後
才動手實作。完整、逐檔案的實作計畫另存於 Claude Code 內部 plan 檔（本文件是給 BA 看的精簡版）。

---

## 一、問題陳述

一筆到期卻沒人記得手動關閉的 LC，會無限期停留在賬上，虛增表外風險敞口——這是貿易融資賬本歷史上最
常見的缺陷模式之一，也是本次 BA 評審中唯一的高嚴重度未撤回發現。系統目前只有 `CLOSE`
（A10 Import／B6 Export）這一條路徑可以關閉一筆 LC/Confirmation，而 `CLOSE` 完全依賴人為判斷與
Maker/Checker 兩人主動操作，跟「到期即應釋放」這件事在法律性質上是兩碼事——UCP 600 第16(f)條講的是
「拒付推定經過即視為承兌」，本質上是時間到了、規則自動生效，不是誰主動決定關閉。

## 二、提案方案總覽

### 2.1 新增獨立的 `EXPIRE` movement type

與現有 `CLOSE` 完全獨立、互不干擾的第二條關閉路徑，在 `到期日 + 郵遞緩衝天數` 這個時間點自動觸發，
沖銷方式（寫掉剩餘 Confirmed Balance、把合約狀態改成終態）跟 `CLOSE` 一致，只是**誰／什麼時候**
觸發不同。

### 2.2 觸發機制——微服務內建的背景排程

目前整個 repo（前後端、微服務三個子專案）完全沒有任何 timer/cron 基礎設施，也沒有任何「非人為觸發」
的先例。提案在微服務 process 內加入一個真正會定期執行的背景排程，掃描所有已過期、且符合資格
（SG/Acceptance 餘額均為 0、整棵事件樹沒有未結案事件——沿用 `CLOSE` 既有的資格判斷邏輯）的 LC/
Confirmation，逐筆自動處理。

排程間隔做成可配置，**支援秒/分/時/天**四種單位（demo 環境可以設成每幾秒跑一次方便驗證，正式環境
只需要把這一個設定值改成「每天一次」，不用改程式碼）。

### 2.3 Maker/Checker——用「批次角色身份」保留四眼原則，不繞過既有機制

系統目前**每一種**movementType，毫無例外，都是真正的雙人 Maker/Checker（兩個不同的人各自送出/
放行）。若讓 EXPIRE 完全繞過這個機制（一步到位、不經過任何角色檢查），會破壞這個系統從頭到尾唯一
沒有例外的核心不變量。

提案做法：排程仍然走**現有、完全不修改**的兩段式流程（先建立 PENDING movement，再放行成
RELEASED），只是這兩步驟的操作者改用**兩個不同的、寫在 config 裡的系統角色身份字串**（例如
`BATCH_MAKER` / `BATCH_CHECKER`），取代真人的姓名。因為這兩個字串本來就不同，系統既有的「同一人不能
自己送出又自己放行」檢查會自然滿足，**完全不需要在核心程式碼裡開一個「系統可以繞過四眼原則」的例外
口子**——四眼原則本身保留，只是其中兩隻眼睛換成系統的兩個角色。

### 2.4 `mail_float_grace_days`（郵遞緩衝天數）——進出口分開設定、寫入 config、在開證當下鎖定到合約上

- 郵遞緩衝天數**不是**UCP 600 第14(c)條講的21天交單期限（那是另一條規則、管另一件事），是銀行內部
  為郵遞/快遞傳遞時間預留的作業緩衝期，各通匯行/國家本來就可能不同。
- **進口與出口分開配置**，寫在微服務的 config 檔裡，不寫死在程式邏輯中。
- 為避免日後調整這個 config 預設值，回頭影響到已經在賬上的舊 LC 的到期釋放時點，提案把「開證當下
  生效的數值」直接記錄到該筆合約自己身上（跟現有 `tolerancePct` 欄位是同一套慣例：呼叫端可覆寫，
  否則用當時的 config 預設值，記錄後不可再變）。

### 2.5 到期日（`expiry_date`）——新增獨立欄位，開證時輸入、可透過修改功能異動

- 資料庫目前沒有 `expiry_date` 欄位；有一個現存但從未被任何業務邏輯讀取過的 `maturity_date`
  欄位（純呼叫端帶入、原樣存回）。兩者在貿易融資裡是不同概念——LC 本身的效期／到期日（UCP 600
  第6(d)條）跟 Usance/Acceptance 自己的到期日不是同一件事，混用容易在未來造成誤解。**提案新增獨立
  的 `expiry_date` 欄位**，`maturity_date` 維持現狀不動。
- **輸入位置**：A1（LC Issue）／B1（Confirm LC）開證當下新增到期日輸入欄位。
- **修改途徑**：A2（LC Amendment）／B2（Confirm LC Amendment）既有的修改選項（目前是
  Increase／Decrease 金額方向）新增第三個選項，可以單獨修改到期日（不影響餘額）。

### 2.6 合約狀態——新增獨立的 `EXPIRED`，跟 `CLOSED` 分開

自動釋放後，合約狀態寫成一個新的、獨立的 `EXPIRED` 值，不沿用現有的 `CLOSED`。理由：審計/報表上
需要能一眼分辨「人為主動關閉」（CLOSED）跟「到期自動釋放」（EXPIRED）——這兩件事法律性質不同，
是本次 BA 評審 F1 自己指出的重點，狀態值分開才不會在未來的稽核/報表需求上被迫回頭補救。

---

## 三、需要 BA 正式核准的事項

以下六點是本提案的核心設計選擇，本 session 內部已經逐項討論並形成傾向，但**尚未經 BA 正式簽署**，
在動手實作前需要明確核准：

| # | 事項 | 本提案傾向 |
|---|---|---|
| 1 | 觸發機制 | 微服務內建真正的背景排程（node-cron / setInterval），非外部呼叫觸發 |
| 2 | Maker/Checker | 保留兩段式四眼流程，用 `BATCH_MAKER`/`BATCH_CHECKER` 兩個系統角色身份取代真人 |
| 3 | 排程間隔 | 可配置，支援秒/分/時/天單位 |
| 4 | 郵遞緩衝天數 | 進出口分開配置，開證當下鎖定到合約上（比照 `tolerancePct`） |
| 5 | 到期日欄位 | 新增獨立 `expiry_date`（不沿用 `maturity_date`），A1/B1 輸入、A2/B2 可修改 |
| 6 | 合約終態狀態值 | 新增獨立 `EXPIRED`，跟 `CLOSED` 分開 |

## 四、技術實作範圍（概要）

1. **Schema**：`balance_contracts` 新增 `expiry_date`／`mail_float_grace_days` 欄位；`ContractStatus`
   新增 `EXPIRED`；`movementType` 新增 `EXPIRE`。
2. **Domain 邏輯**：重用 `CLOSE` 既有的資格判斷（SG/Acceptance 餘額歸零、無未結案事件），加上到期日
   ＋緩衝天數的日期閘門。
3. **Service 層**：新增排程掃描方法，逐筆呼叫現有、不修改的 `createMovement()`/`release()`；新增
   `expiry_date` 專用的修改路徑（A2/B2 第三個選項）。
4. **OAS**：版本 bump，比照 `CLOSE` 當初上線時的 changelog 寫法記錄。
5. **Angular**：A1/B1 新增到期日輸入欄位；A2/B2 新增修改到期日的選項；Look Up Current Balance／
   Inquire Events 顯示層讓 `EXPIRE`/`EXPIRED` 有自己的圖示與狀態文字（比照 `CLOSE` 既有的做法）。
   EXPIRE 本身不會出現在任何人可挑選的功能清單裡——它永遠是系統自動觸發，不需要新的 Maker/Checker
   畫面。
6. **測試**：微服務、Angular、backend 三套測試都要維持既有的 95% 覆蓋率門檻。

## 五、驗證計畫

- 微服務單元測試：資格判斷/日期閘門的邊界案例（剛好到期、差一天未到、差一天已過）；排程方法的
  整合測試（符合資格的真的被處理、不符合的不會、進出口不同天數設定各自被尊重、重複執行要冪等）。
- Angular 測試：A1/B1 新欄位、A2/B2 新選項的單元測試。
- 手動煙霧測試：開一筆快到期的 LC，等排程間隔過去，確認自動出現一筆 `EXPIRE` movement 且合約狀態
  變成 `EXPIRED`。

---

## 六、簽署

- [ ] BA 核准第三節六項核心設計選擇
- [ ] 核准後排入實作


---

## 七、BA 審閱意見與修正指示（2026-08-25）

本節為外部 BA 針對本提案第二、三、四節的正式審閱意見。第六節簽署清單維持原樣不動（記錄提案方最初的
自我評估），以下是逐項核准／修正結論，作為本提案動工前的最終定案依據。BA 已對照
`microservices/balance-component/src/domain/closeEligibility.ts`、`domain/balanceDerivation.ts`
（`MOVEMENT_DIRECTION` 對照表）、`types.ts`（`ContractStatus`）等實際原始碼逐一核對，非僅憑書面描述判斷。

### 7.1　第三節六項核心設計選擇 —— 逐項核准

| # | 事項 | BA 結論 |
|---|---|---|
| 1 | 觸發機制：微服務內建背景排程 | 核准 |
| 2 | Maker/Checker：`BATCH_MAKER`/`BATCH_CHECKER` 系統角色身份取代真人 | 核准——保留四眼原則、不開特例後門，做法正確 |
| 3 | 排程間隔可配置（秒/分/時/天） | 核准 |
| 4 | `mail_float_grace_days` 進出口分開配置、開證當下鎖定到合約 | 核准 |
| 5 | 新增獨立 `expiry_date` 欄位（不沿用 `maturity_date`） | 核准 |
| 6 | 新增獨立終態 `EXPIRED`，跟 `CLOSED` 分開 | 核准 |

### 7.2　§2.2 / §四.2 資格判斷邏輯 —— 需修正，不得沿用 CLOSE 的餘額歸零條件

原文「掃描所有已過期、且符合資格（SG/Acceptance 餘額均為 0、整棵事件樹沒有未結案事件——沿用 CLOSE
既有的資格判斷邏輯）的 LC/Confirmation」中，「SG/Acceptance 餘額均為 0」這個條件**方向是反的，不能照搬**。

`closeEligibility.ts` 目前的 `evaluateCloseEligibility()` 有四個條件：未重複關閉、SG Confirmed
Balance = 0、Acceptance Confirmed Balance = 0、`hasOpenEvents` 為否（整棵事件樹沒有 PENDING 中的事件）。
這四個條件是為**人工 CLOSE**（一切業務已結清、只是沒人手動按）這個語意設計的，直接套用在 EXPIRE 上會讓
EXPIRE 在它最需要觸發的那些案例（到期時 SG 或 Acceptance 仍有未清餘額）上永遠無法觸發，形同虛設。

**修正後的 EXPIRE 資格判斷**：只需要（a）`expiry_date + mail_float_grace_days` 已過、（b）合約狀態為
`ACTIVE`、（c）`hasOpenEvents` 為否（沿用既有函式本身，不修改邏輯，僅代表「沒有人正在對這棵事件樹做
其他操作」的並發安全檢查）。**不需要、也不應該**檢查 SG/Acceptance 的 Confirmed Balance 是否歸零。

### 7.3　原提案遺漏：EXPIRED 之後如何走到 CLOSED —— 需新增 AUTO CLOSE 作為獨立第二批次

原提案只描述到「合約狀態變成 EXPIRED」為止，沒有說明之後如何、何時真正 Close。BA 建議新增
**AUTO CLOSE** 作為與 AUTO EXPIRE 平行、獨立的第二個批次動作：掃描狀態為 `EXPIRED` 的合約，直接沿用
今天現成、完全不需修改的 `evaluateCloseEligibility()`（SG/Acceptance 餘額歸零、無未結案事件），符合
就寫入 `CLOSE` movement、狀態改為 `CLOSED`。這一段不需要新的資格判斷邏輯，只需要讓排程也能呼叫既有
函式，不再限於人工 A10/B6。

兩個批次（AUTO EXPIRY／AUTO CLOSE）可以放在同一個 sweep job 裡依序執行（先跑 EXPIRY 段、再跑 CLOSE
段），讓從未被動用過的 LC（SG/Acceptance 本來就是 0）能在同一次掃描週期內直接從 ACTIVE 走到 CLOSED。
但建議上線時仍用**兩個獨立的 feature flag** 分開控管、分階段開啟：先開 AUTO EXPIRE、觀察一段時間確認
沖銷金額與時點正確後，再開 AUTO CLOSE——因為 EXPIRE 直接影響或有負債金額，屬於有真實會計/監理影響的
變更；CLOSE 只是狀態收尾，不影響金額。風險等級不同，分階段上線較穩妥。

### 7.4　`EXPIRED` 狀態應在動用入口顯式檢查，不能只靠餘額隱含擋住

`EXPIRE` 把 Confirmed Balance 沖銷為 0 之後，新的 `UTILIZE`／新開 SG／`Document Arrival` 確實會因為
sufficiency check 過不了而自然被擋下，但建議**額外**在這幾個進入點明確加一道「合約狀態必須是 ACTIVE」
的檢查，狀態是 `EXPIRED` 時直接給出清楚訊息（例如「此信用證已到期」），而非讓經辦人員看到含糊的
「餘額不足」錯誤——也避免未來若有新的動用類型漏做餘額檢查而意外繞過。

### 7.5　用詞校正：EXPIRE 沖銷的是 Confirmed Balance，不是 Available Balance

`domain/balanceDerivation.ts` 裡 `Available Balance`（`computeAvailableBalance()`）另有精確定義
（= Confirmed Balance ± Σ 尚在 PENDING 的 movements），跟 `CLOSE`/`EXPIRE` 實際沖銷的
`Confirmed Balance`（`computeConfirmedBalance()`，Σ RELEASED movements）是兩個不同的數字。提案內文
（§2.1）用詞已經是正確的「Confirmed Balance」，僅提醒後續文件/溝通中一律沿用這個精確用詞，避免與
`Available Balance` 混淆。

### 7.6　最終結論

以上 7.2–7.5 修正／補充納入設計後，BA 正式核准整份提案動工實作，第六節「BA 核准第三節六項核心設計
選擇」視為已由本節取代並擴充為七項（新增 7.2 資格判斷邏輯修正）；7.3（AUTO CLOSE）、7.4（狀態顯式
檢查）、7.5（用詞校正）為必須一併納入實作範圍的修正事項，非另待決的business問題，動工前不需要再等
BA 進一步確認。

對照文件：`analysis/TF-Balance-Component-BA-Review-en.docx` / `analysis/TF-Balance-Component-BA-Review-zh.docx`
F1 建議欄（2026-08-25 版本）已同步更新為本節結論。


### 7.7　AUTO EXPIRY／AUTO CLOSE 各自呼叫哪個既有機制（使用者提問後確認，2026-08-25）

BA 核對 `service/balanceService.ts` 與 `analysis/balance-component-api.yaml` 後確認：balance-component
微服務本身**沒有**分開的「A10 API」「B6 API」，只有一個通用的 movement 端點
（`POST /balance-contracts/{balanceContractId}/movements` 建立＋對應的 release 核准端點），
`movementType` 是請求體裡的自由字串欄位，OAS 文件本身明講「this service does not itself enforce a
per-instrumentType allowlist server-side; that legality mapping is owned by the caller」——「A10 Import
LC Close」「B6 Export Confirmed LC Close」只是**業務功能層（Channel API／前端）的名稱標籤**，翻譯成
`movementType: 'CLOSE'` 後呼叫的是同一個通用端點，微服務這一層本身並不認得「A10/B6」這個概念。

據此明確兩個批次各自該呼叫什麼：

- **AUTO EXPIRY** 呼叫同一個通用 movement 端點，傳 `movementType: 'EXPIRE'`（全新值，需新增至
  `domain/balanceDerivation.ts` 的 `MOVEMENT_DIRECTION` 對照表，並新增 §7.2 定義的專屬資格判斷邏輯）。
  **不得**傳 `movementType: 'CLOSE'`——EXPIRE 與 CLOSE 是兩個結構上獨立的 movementType 值，而非同一
  支 API 的兩種呼叫方式，AUTO EXPIRY 因此不會、也不能觸及 A10/B6（CLOSE）的語意。
- **AUTO CLOSE** 呼叫同一個通用端點，傳 `movementType: 'CLOSE'`——與人工 A10/B6 是同一個值、同一條
  `createMovement()`/`release()`/`evaluateCloseEligibility()` 程式碼路徑，差別僅在 `createdBy` 使用
  `BATCH_MAKER`/`BATCH_CHECKER` 系統身份而非真人使用者 ID。這是刻意的設計（AUTO CLOSE 的目的正是
  「自動執行今日人工 A10/B6 會做的事」），不是需要避免的重疊。

兩個批次皆略過 Channel API 供真人操作用的業務功能畫面包裝，直接呼叫 balance-component 微服務自身的
通用端點；不需要新增 REST 端點，僅需在 domain 層新增 `EXPIRE` 這個 movementType 自己的方向與資格
判斷邏輯。


### 7.8　EXPIRED 之後 A2/B2、A3/A3S、A8、B3 一律封鎖（含 AMEND_EXPIRY_DATE）——BA 確認，2026-08-25

BA 核對 `store/balanceContractStore.ts` 確認：`findActiveByNaturalKey()`（A2/B2 解析自身合約用）與
`findActiveByLogicalContractId()`（A3/A3S、A8、B3 這幾個 hasParent 功能解析母合約用）兩者的 SQL 皆寫死
`WHERE status = 'ACTIVE'`——與今日系統已經在用、用來擋掉「對已 CLOSED 合約再送 A2/A3/A8/B3」的機制完全
相同。因此只要 `EXPIRED` 被實作為與 `ACTIVE`互斥的獨立狀態值，A2、B2、A3、A3S、A8、B3 這六個功能代碼
在合約轉為 EXPIRED 之後即自動解析不到目標/母合約而失敗，**不需要額外新增顯式狀態檢查**——這是狀態機
本身自然帶出的效果，前一版 §7.4 建議的「新增顯式狀態守門」可視為已被此既有機制涵蓋，非必須新增之項目。

此封鎖只在合約**真正轉為 EXPIRED**（即 `expiry_date + mail_float_grace_days` 已過）後才生效；在到期日
已過但仍在緩衝期內（合約狀態仍是 ACTIVE）的期間，A3/A3S/B3 應維持可正常受理，這正是
`mail_float_grace_days` 存在的目的。

BA 確認：此一封鎖**包含**§2.5 新增的 `AMEND_EXPIRY_DATE`（A2/B2 第三個選項）——EXPIRED 之後不提供任何
方式透過正常修改流程延長或更正到期日，EXPIRED 對交易處理而言視為終態（與 CLOSED 一致的不可逆語意），
不另外設計重啟/例外路徑。


---

## 八、EXPIRED 狀態的重啟機制 —— Expiry Extension Amendment（2026-08-25，取代 §7.8 的「不可逆」結論）

**本節修正 §7.8 的結論。** §7.8 原先記錄「EXPIRED 對交易處理視為終態，不設計重啟路徑」，經 BA 進一步確認，
此結論已被本節取代：EXPIRED 狀態下可透過正式的 `Expiry Extension Amendment`（A2/B2 的一種）重新啟用，
`AMEND_EXPIRY_DATE` 本身即為此重啟機制的入口，§7.8 提到「不提供任何方式延長或更正到期日」的部分不再成立；
§7.8 其餘部分（A3/A3S/A8/B3 靠既有 ACTIVE-only 解析機制自動封鎖、封鎖僅在真正 EXPIRED 後才生效）維持有效。

### 8.1　流程與規格（BA 確認）

`EXPIRED → Extension Amendment → Checker Approval → ACTIVE + 恢復未使用 LC Balance → 繼續其他交易`

- 信用證處於 `EXPIRED` 狀態時，可透過正式的 `Expiry Extension Amendment` 延長到期日。經 Checker 核准後，
  LC 狀態恢復為 `ACTIVE`，並重新計算及恢復原有未使用的 LC Balance，之後才能繼續辦理其他交易。
- Maker Submit 階段：狀態仍是 `EXPIRED`、Available Balance 仍是 0，Amendment 本身處於 PENDING，尚未生效。
- Checker Release 階段：驗證新 `Expiry Date > Business Date`，狀態改為 `ACTIVE`、Available Balance 恢復。
- 核准後可繼續辦理其他交易（Document Arrival 等），也可以與 `Increase Amendment` 同時辦理，在恢復的餘額
  基礎上再疊加新增的金額。

### 8.2　範例

```text
Original LC Amount           = USD 100,000
Utilized Amount              = USD  60,000
Unused LC Balance            = USD  40,000
```

`AUTO EXPIRY` 執行後：

```text
LC Status                    = EXPIRED
LC Available Balance         = USD 0
Expired / Released Balance   = USD 40,000
```

`Expiry Extension Amendment` — Maker Submit：

```text
LC Status                    = EXPIRED
LC Available Balance         = USD 0
Amendment Status              = PENDING
```

`Expiry Extension Amendment` — Checker Approval：

```text
New Expiry Date              > Business Date
LC Status                    = ACTIVE
LC Available Balance         = USD 40,000
Amendment Status              = RELEASED
```

核准後可繼續其他交易，例如 Document Arrival USD 20,000 → Remaining LC Balance USD 20,000；若同時辦理
Increase Amendment（+10,000），則 New LC Available Balance = USD 50,000。

（用詞校正：範例原文寫 Amendment Status = APPROVED，本系統既有 movement 狀態詞彙是
`PENDING`/`RELEASED`，非 `APPROVED`，實作時建議沿用既有詞彙，避免新增一套平行狀態命名。）

### 8.3　技術機制：透過既有的 `REVERSAL` movementType 恢復餘額，而非直接改欄位

`domain/balanceDerivation.ts` 檔案開頭註解已預留 `REVERSAL` 這個 movementType，定義為「其效果是原始
movement 正負號相反」。Extension Amendment 恢復餘額的正確做法，是在 Checker 核准當下，對「當初那筆
`EXPIRE` movement」觸發一筆 `REVERSAL`，透過 `businessEventId` 綁定兩者（比照 A3S 兩腿配對、B4 複合腿
的既有模式），而非單純把狀態與餘額欄位直接改寫——後者無法在稽核軌跡上追溯「這筆恢復的金額對應哪一筆
被沖銷的 EXPIRE」。

### 8.4　控制條件 —— 逐項核對，均與既有機制吻合，不需新邏輯

| 控制條件 | 核對結論 |
|---|---|
| Checker 核准前不得恢復額度／不得改為 ACTIVE | 既有 PENDING/RELEASED 語意本來就保證（PENDING 從不影響 Confirmed Balance），無需新邏輯 |
| SG/Acceptance 維持既有餘額，不重複恢復 | EXPIRE 從未動過 SG/Acceptance（獨立生命週期），本來就沒有東西需要恢復 |
| 新 Expiry Date 必須 > Business Date | 建議 Maker Submit 與 Checker Release 兩處都各驗一次，避免 Submit 到 Release 跨天使新日期變成過去式仍被放行（沿用本專案既有的「Submit/Release 各自重新檢查」慣例） |
| 只恢復符合銀行授信及風險控制條件的餘額 | 屬 Checker 人工核准時的業務判斷範疇，非自動化系統規則，不需另建自動檢查 |
| CLOSED 不得直接 EXTEND，除非另有正式 REOPEN 機制 | 正確——CLOSED 維持真正終態，重啟能力僅限 EXPIRED；「不可逆的那個點」是 AUTO CLOSE 真正觸發的那一刻，不是 AUTO EXPIRY |

### 8.5　⚠️ 與 AUTO CLOSE 排程時序的衝突，需要決定

前面（§7.3）建議 AUTO EXPIRY 與 AUTO CLOSE 可放在同一個 sweep job 依序執行，讓 SG/Acceptance 本來就是
0 的「乾淨」LC 能在同一次掃描週期內直接從 ACTIVE 走到 CLOSED。現在 Extension Amendment 成為合法的
重啟管道後，這個設計會產生衝突：這類乾淨 LC 完全沒有重啟窗口，會在同一輪掃描內瞬間 EXPIRED→CLOSED，
業務還來不及送 Extension Amendment 就已經進入不可逆的 CLOSED。

**建議修正**：同一次 sweep 執行內，本輪才剛轉為 EXPIRED 的合約，不應在同一輪被 AUTO CLOSE 一併處理——
AUTO CLOSE 只掃描「上一輪或更早」就已經是 EXPIRED 的合約，確保每一筆 LC 至少有一個完整 sweep interval
的最低重啟窗口。此點待與工程team確認排程實作方式後定案。

### 8.6　技術缺口補充：Extension Amendment 需要專屬解析路徑（2026-08-25 review 補充）

`AMEND_EXPIRY_DATE` 不能沿用一般 A2/B2 走的 `findActiveByNaturalKey()`（§7.8 已確認該函式 SQL 寫死
`WHERE status = 'ACTIVE'`，找不到 EXPIRED 合約）——需要新增一條**專屬於 Extension Amendment**、能明確
以 natural key 找到 `EXPIRED` 狀態合約的解析路徑，跟一般 A2/B2 用的路徑分開，僅供這個特定情境使用。

另外確認一點：Extension Amendment 在 Maker Submit 之後、Checker 核准之前，會在主合約自己的歷史上留一筆
PENDING movement——這代表 AUTO CLOSE 沿用的既有 `hasOpenEvents` 檢查會自然擋住「Extension 還在審核中
時 AUTO CLOSE 搶先把合約關掉」這個競爭情況，不需要額外邏輯。

### 8.7　開放問題：`Expiry Extension Amendment` 是否需要受益人／相關方同意（2026-08-25 review 補充）

**本點先前只在對話中提過，未曾寫入文件，這裡正式補上。** `Expiry Extension Amendment` 不只是「更正一個
日期打字錯誤」，而是能讓一筆已經沖銷掉的或有負債重新產生曝險（見 §8.3 的 `REVERSAL` 機制）——UCP 600
第10條對信用證修改本來就要求開證申請人與受益人雙方合意，這跟 BA 評審原始發現 **F4**（`No
beneficiary-consent gate before AMEND_DECREASE`，UCP 600 第10(a)/(c)條，MEDIUM）是同一類問題：
今天系統對一般 `AMEND_DECREASE` 都還沒有 consent 把關機制，`AMEND_EXPIRY_DATE` 若被賦予「重啟已釋放
曝險」這麼重的效果，同樣的缺口只會更明顯。是否要在核准 Extension Amendment 前要求捕捉 consent 佐證
（比照 F4 建議的 consent-reference／waiver-capture 欄位），**待 BA 正式決議，非本次動工的阻擋項**，但
建議跟 F4 一併處理，不要各自分開修。

### 8.8　技術缺口補充：Extension Amendment 自己的資格判斷應明確要求 `hasOpenEvents` 為否（2026-08-25 review 補充）

§7.2 把 `hasOpenEvents` 為否（整棵事件樹沒有 PENDING 中的事件）列為 `EXPIRE` 的正式資格條件之一，但
§8.4 的控制條件只講了「Checker 核准前不得恢復額度」——這只保證 Extension **自己**的兩階段流程正確，
沒有明確要求「若同一筆合約底下還有其他 PENDING 中的事件（例如另一筆並發提交的 Extension，或其他
尚未核准的事件），應擋住本次 Extension」。因為 §8.6 講的專屬解析路徑是全新機制，不會自動繼承既有
函式的任何保護，這條並發安全檢查必須**明確**寫進 Extension 自己的資格判斷（沿用既有 `hasOpenEvents`
函式本身），不能預設它自然存在。


---

## 九、CLOSED 狀態的重啟機制 —— LC Reopen（2026-08-25，補齊 §8.4 提到的「除非另有正式 REOPEN 機制」）

`CLOSED` 狀態不能直接辦理 `EXTEND`，應先透過正式的 `LC Reopen` 流程重新開啟，再依需要辦理延期及恢復
餘額。建議流程：

```text
CLOSED → REOPEN → EXPIRED 或 ACTIVE → EXTEND → ACTIVE → 恢復 LC Balance
```

### 9.1　情況一：原 LC Expiry Date 尚未到期

```text
Original LC Amount     = USD 100,000
Approved Utilization   = USD  60,000
Closed LC Balance      = USD  40,000
LC Expiry Date         = 2026-12-31
Business Date          = 2026-10-01
LC Status              = CLOSED
```

辦理 `LC Reopen` 並經核准後：

```text
LC Status              = ACTIVE
Restored LC Balance    = USD 40,000
```

因為原到期日尚未屆滿，不需要另外辦理 `EXTEND`，即可繼續符合條件的交易。

### 9.2　情況二：原 LC Expiry Date 已經到期

```text
Original LC Amount     = USD 100,000
Approved Utilization   = USD  60,000
Closed LC Balance      = USD  40,000
LC Expiry Date         = 2026-08-31
Business Date          = 2026-09-15
LC Status              = CLOSED
```

**方式 A：分成兩筆交易**——第一筆 `LC Reopen`（CLOSED→EXPIRED，Available Balance 仍是 0），第二筆
`Expiry Extension Amendment`（依第八節既有機制，EXPIRED→ACTIVE、恢復餘額）。稽核軌跡與交易責任較清楚。

**方式 B：同一筆交易 `REOPEN WITH EXTENSION`**，一次完成 CLOSED→ACTIVE、延期、恢復餘額。操作較簡單，
但需要系統明確支援複合交易與完整審批——**這不需要另外設計新框架**：系統已有現成的複合腿（compound
leg）交易基礎設施（A3S 的 SG 贖回+文件到單兩腿、B4 的承付/承兌多腿，皆以同一個 `businessEventId` 綁定
多腿），方式 B 可直接比照這個既有模式，把 REOPEN 腿與 EXTEND 腿用同一個 `businessEventId` 綁定。

### 9.3　技術機制：REOPEN 恢復餘額，同樣透過 `REVERSAL` 完成

與 §8.3 的 Extension Amendment 完全同一套邏輯——REOPEN 核准當下，對「當初那筆被沖銷的 `CLOSE`
movement」觸發一筆 `REVERSAL`，透過 `businessEventId` 綁定，而非直接改寫欄位，確保稽核軌跡可追溯
「這筆恢復的金額對應哪一筆被沖銷的 CLOSE」。

### 9.4　控制條件

| 控制項目 | 建議要求 | BA 查證備註 |
|---|---|---|
| 關閉原因 | 必須確認原 LC 是否因自然到期、人工關閉、取消、錯誤關閉或其他原因而關閉 | **需求缺口**：`BalanceMovement` 已有 `reasonCode` 欄位（`types.ts`/`schema.ts`），但目前只有 `reject()`/`cancel()` 強制要求填寫，一般 `CLOSE`（A10/B6）建立時不強制帶入原因代碼——REOPEN 資格判斷若要查閱關閉原因，`CLOSE`（含未來的 AUTO CLOSE）本身也應改為要求填寫 `reasonCode`，否則舊資料無從查起 |
| 是否允許 Reopen | 依銀行政策及原關閉原因判斷，不應預設所有 CLOSED LC 都可重開 | 業務政策範疇，不需新程式邏輯 |
| 授信額度 | 重新檢查客戶授信額度及風險敞口是否足以支援恢復的餘額 | balance-component 微服務範圍內未見任何授信/風險額度邏輯，屬跨系統整合依賴，非本服務自建功能 |
| LC Balance | 只恢復經重新計算且核准的未使用餘額，不得直接恢復原始 LC Amount | 與 §9.3 的 REVERSAL 機制一致——恢復的是被 CLOSE 沖銷掉的 Confirmed Balance，非重新 ISSUE |
| Expiry Date | 原到期日已過時，必須先或同步辦理延期，才能恢復 ACTIVE 和可用額度 | 對應 9.2 的方式 A／B |
| SG / Acceptance | 確認原有責任已結清；不得透過 Reopen 自動重建已結清的 SG 或 Acceptance Balance | 既有 `evaluateCloseEligibility()` 本來就要求 CLOSE 當下 SG/Acceptance 已歸零，REOPEN 不會、也不應觸碰這兩者的 balance_contracts |
| 法律與當事人同意 | 依信用證條款、適用規則及銀行政策，確認是否需要申請人、受益人、開證行、保兌行或其他相關方同意 | 與 §8.7 提過的 AMEND_EXPIRY_DATE／F4 consent 缺口同一類問題，REOPEN 風險等級更高，同樣需要 BA 評估是否需要 consent 把關 |
| Maker / Checker | 必須執行四眼原則，Maker 與 Checker 不得為同一人 | 與既有機制一致 |
| 稽核軌跡 | 完整記錄 Reopen 原因、原關閉事件、恢復金額、新到期日及核准人 | 由 §9.3 的 `businessEventId`/`REVERSAL` 連結機制天然滿足 |
| 非例行處理 | 建議限制為具特殊權限的人工交易，不納入一般 AUTO EXPIRY 或 AUTO CLOSE 批次 | **待確認**：本系統目前只看到 Maker≠Checker 四眼原則，未見角色型權限（RBAC）機制證據——若 REOPEN 要求比一般 A2 更高的權限門檻，建議獨立於 A2 之外另立具名業務功能（比照 A1-A10 編號），而非塞進 A2 的 `movementTypeChoice` 選項清單；若已有現成權限分級機制可掛在 A2 特定選項上，則可維持塞入 A2，需 BA/工程team共同確認（**此列已於 §10.1 定案為獨立具名功能 A11/B7，不再塞入 A2**） |

**特別注意（法律與系統的邊界）**：系統上的 Reopen 不等於信用證法律效力自動恢復。如果信用證已正式取消、
相關各方已解除義務，或原承諾依法已不存在，應評估是否必須重新開立新 LC，而不是單純重新啟用舊案件。

### 9.5　建議業務規則

> `CLOSED` 狀態的 LC 如需重新啟動，必須透過正式的 `LC Reopen` 交易，並完成授信審查、Maker／Checker
> 核准及完整稽核記錄。如原 Expiry Date 尚未到期，核准後可恢復為 `ACTIVE` 並恢復符合條件的未使用 LC
> Balance；如原 Expiry Date 已過期，應先或同步辦理 `Expiry Extension`，待核准後才能恢復為 `ACTIVE`
> 並重新啟用可用餘額。

### 9.6　技術缺口補充：REOPEN 需要專屬解析路徑（2026-08-25 review 補充）

同 §8.6 的道理——`A11`/`B7`（REOPEN）需要一條**專屬於 REOPEN**、能明確以 natural key 找到 `CLOSED`
狀態合約的解析路徑，一般 A2/B2/A3/A3S/A8/B3 沿用的 ACTIVE-only 解析路徑找不到已 CLOSED 的合約，這是
REOPEN 這個新功能能不能運作的前提，非附加項。

### 9.7　技術缺口補充：REOPEN 要反轉的可能是一整條沖銷鏈，不是只有最後一筆 CLOSE（2026-08-25 review 補充）

§9.3 原文「對當初那筆被沖銷的 `CLOSE` movement 觸發一筆 `REVERSAL`」對某些案例不夠——`CLOSED` 有兩條
不同的到達路徑，反轉方式不同：

- **路徑 A：從未經過 `EXPIRED`**，人工 `A10`/`B6` 直接對一筆 `ACTIVE` 合約 CLOSE（`EXPIRE` 與 `CLOSE`
  本來就是兩條互不干擾的獨立路徑，見 §2.1，人工隨時可直接 CLOSE，不論是否已過期）。此時那筆 `CLOSE`
  movement 自己就沖銷了全部剩餘 Confirmed Balance，REOPEN 只需反轉這一筆即可。
- **路徑 B：先經過 `EXPIRED`**（`AUTO EXPIRY` 已沖銷剩餘 Confirmed Balance），之後才被 `AUTO CLOSE`
  接手轉為 `CLOSED`。此時 `AUTO CLOSE` 觸發當下，`rootConfirmedBalance` 已經被更早那筆 `EXPIRE` 沖成
  0（`closeEligibility.ts` 沖銷的是「當下」的剩餘 Confirmed Balance），這筆 `CLOSE` 自己的沖銷金額
  是 **0**，真正的餘額是被更早的 `EXPIRE` 沖掉的。**只反轉 CLOSE 只會恢復 0，不會恢復 §9.1/§9.2 範例
  裡的 40,000**。

**修正**：REOPEN 恢復餘額時，應該反轉這筆合約自己歷史上**完整的沖銷鏈**（依序反轉所有尚未被反轉過的
`EXPIRE`/`CLOSE` movement，而非只反轉最後一筆），或等效地，直接以「這筆合約當初被沖銷前最後一次的
Confirmed Balance」為目標重新計算應恢復的金額，而非假設某一筆固定的 movement 就代表全部應恢復的數字。
此點需要工程team在設計 REOPEN 的 `REVERSAL` 邏輯時特別注意，§9.1/§9.2 的範例數字本身不受影響（範例本
身只呈現輸入輸出狀態，未特別指定合約是走路徑 A 還是 B）。

### 9.8　技術缺口補充：REOPEN 自己的資格判斷同樣應明確要求 `hasOpenEvents` 為否（2026-08-25 review 補充）

同 §8.8 的道理——REOPEN（`A11`/`B7`）的資格判斷目前（§9.4）也沒有明確要求「無 PENDING 中的其他事件」
這個並發安全檢查。REOPEN 涉及觸發 §9.7 講的整條沖銷鏈 `REVERSAL`，比 Extension 更複雜，若合約底下
還有其他 PENDING 事件在途時允許 REOPEN 通過，風險更高。建議明確要求 REOPEN 資格判斷也沿用既有
`hasOpenEvents` 函式本身，不能預設它自然存在。


---

## 十、進出口對稱性 + REOPEN 具名功能代碼定案（2026-08-25）

### 10.1　REOPEN 定案：獨立於 A2/B2 之外的具名業務功能

BA 確認：REOPEN 不塞進 A2/B2 的 `movementTypeChoice` 選項清單，改為獨立、比照 A1-A10／B1-B6 編號慣例
新增具名業務功能：

- **A11 — Import LC Reopen**（對應 `IPLC_LC`）
- **B7 — Export Confirmed LC Reopen**（對應 `EPLC_CONFIRMATION`——見 §10.1a 查證備註）

理由同 §9.4 的待確認備註：REOPEN 屬「非例行、特殊權限」交易，跟 A2/B2 一般 Maker/Checker 即可操作的
Increase/Decrease/Extend 風險等級不同，獨立編號才能在權限管控上真正分開。方式 B（`REOPEN WITH
EXTENSION` 複合交易，見 §9.2）比照這個新代碼，走複合腿模式與 `EXTEND` 腿綁定。

### 10.1a　查證備註：`EPLC_LC` 在目前系統裡從未被實際建立過（2026-08-25 review 補充）

`src/app/transaction-builder/balance-component.model.ts` 的 `EXPORT_FUNCTIONS` 模組開頭明確寫著：
「Export Confirmed side ONLY models Confirmed Export LC...`EPLC_LC` stays valid but no function here
creates one」——`EPLC_LC` 雖然在 `types.ts` 的 `InstrumentType` 型別裡合法存在，但目前**沒有任何一個
具名業務功能會真的建立一筆 `EPLC_LC` 合約**（B1 建立的是 `EPLC_CONFIRMATION`，不是 `EPLC_LC`；純通知、
未保兌的出口信用證不產生或有負債，本來就不在 Balance Component 範圍內，是刻意的設計）。因此本節前文
（及 §10.2 表格）原本寫「`B7` 對應 `EPLC_LC`／`EPLC_CONFIRMATION`」不夠精確——`EPLC_LC` 目前沒有實際
存在的合約可供 `EXPIRE`／`CLOSE`／`EXTEND`／`REOPEN` 作用，`B7`（以及既有的 `B6`）在實務上只會遇到
`EPLC_CONFIRMATION`。若日後 Export 範圍擴大到涵蓋未保兌 LC（`EPLC_LC` 真正被建立），屆時需要重新
檢視 B7 的 instrumentType 範圍，非本次提案需要處理的項目。

### 10.2　進出口對稱性 —— EXTEND 與 REOPEN 皆須進出口兩側都設計

前面章節部分敘述以 Import 側（LC／A 系列）為主要例子，在此明確定案：本提案第八節（Expiry Extension
Amendment）與第九節（LC Reopen）皆為**進出口兩側對稱設計**，適用範圍與既有 `EXPIRE`／`CLOSE` 一致，
涵蓋 `IPLC_LC`（Import）、`EPLC_CONFIRMATION`（Export，見 §10.1a）：

| 機制 | Import | Export |
|---|---|---|
| Expiry Extension（第八節） | A2 第三選項（延長到期日） | B2 第三選項（延長到期日） |
| LC/Confirmation Reopen（第九節，新代碼） | **A11** | **B7** |

第八節、第九節既有的範例、控制條件、`REVERSAL`/複合腿技術機制，Import／Export 兩側邏輯完全對稱套用，
不需要各自另外設計一套規則；差異只在具名功能代碼與對應的 instrumentType。

### 10.3　實作提醒：functionCode 列舉值務必全面同步更新

BA 查證發現 `analysis/balance-component-channel-api.yaml` 第 592、712 行的 `functionCode`/`code`
enum 目前是 `[A1, A2, A3, A3S, A4, A6, A7, A8, A9, B1, B2, B3, B4, B5]`——**A10／B6（CLOSE）當初
上線時未被補進這兩處列舉值**，是既有、尚未處理的小缺口。提醒工程team：新增 `A11`／`B7`（REOPEN）時，
務必確認 yaml 內**所有**出現 functionCode enum 的位置都同步更新，避免重蹈 A10/B6 的覆轍。


---

## 十一、文件總覽、範圍更新與待決事項清單（2026-08-25，BA 結構性review）

本節彙整第一節「適用範圍」、第四節「技術實作範圍」、第五節「驗證計畫」在第七至十節新增內容後已經
過時的部分，以及全文所有仍待拍板的開放問題，供動工前最後核對，不逐條回頭改寫原文。

### 11.1　適用範圍更新（補充第一頁「適用範圍」）

除原文列出的範圍外，另需納入：新增 `REVERSAL` movementType（見 §11.2）；新增具名業務功能
`A11`（Import LC Reopen）／`B7`（Export Confirmed LC Reopen）；`analysis/balance-component-channel-api.yaml`
除 OAS 版本 bump 外，需同步更新所有出現 `functionCode` enum 的位置（見 §10.3，注意勿重蹈 A10/B6
當初漏補的覆轍）；Angular 端除 A1/B1/A2/B2 既有異動外，另需為 `Expiry Extension Amendment` 與
`A11`/`B7` REOPEN 新增對應的 Maker/Checker 畫面。

### 11.2　技術實作範圍補充（補充第四節）

| # | 補充項目 | 依據 |
|---|---|---|
| 7 | 新增 `REVERSAL` movementType —— **非重用既有機制，是全新開發**。目前僅在 `balanceDerivation.ts` 註解中被預留名稱，KB 自身的 Knowledge-Gaps 也將其列為未解疑點（"REVERSAL 是否真的有被使用？邏輯實現在哪裡？"）。其方向並非固定 ±1，須動態讀取所指向的原始 movement 方向後取反；`computeConfirmedBalance`/`computeAvailableBalance`/`computePendingDecreaseTotal` 三個函式目前對未知 movementType 會直接拋錯，均需擴充 | §8.3／§9.3／KB Knowledge-Gaps |
| 8 | `Expiry Extension Amendment` 需要專屬於 EXPIRED 合約的 natural-key 解析路徑，獨立於 `findActiveByNaturalKey()` | §8.6 |
| 9 | `A11`／`B7`（REOPEN）需要專屬於 CLOSED 合約的 natural-key 解析路徑，獨立於一般解析路徑 | §9.6 |
| 10 | `CLOSE`（含 A10/B6 與未來 AUTO CLOSE）建立時應改為**強制**要求 `reasonCode`，否則 REOPEN 資格判斷時無從查閱原關閉原因（**建議採用，待正式核准**，見 §11.4 第4項） | §9.4 |
| 11 | Sweep 排程需依 §8.5 的建議調整：AUTO CLOSE 只掃描「上一輪或更早」已是 EXPIRED 的合約，不可與本輪才剛 EXPIRE 的合約同輪處理 | §8.5（**仍待與工程team定案，非已核准項**） |
| 12 | REOPEN 恢復餘額須反轉合約自己歷史上完整的 EXPIRE／CLOSE 沖銷鏈，不能假設只有最後一筆 CLOSE | §9.7 |
| 13 | Extension Amendment、REOPEN 自己的資格判斷都應明確要求 `hasOpenEvents` 為否，不能預設既有機制自然涵蓋（兩者都是全新解析路徑，不會自動繼承保護） | §8.8／§9.8 |

### 11.3　驗證計畫補充（補充第五節）

- `REVERSAL` 的方向計算單元測試（對不同原始 movementType 的 REVERSAL 各自方向正確）。
- Extension Amendment／REOPEN 的資格判斷邊界案例（EXPIRED/CLOSED 專屬解析路徑找得到／找不到目標合約）。
- AUTO CLOSE 與 PENDING 中 Extension Amendment 的並發案例（驗證 `hasOpenEvents` 確實擋下 AUTO CLOSE，見 §8.6）。
- `reasonCode` 未填寫時 REOPEN 資格判斷的行為（應視為關閉原因不明，交由 §9.4「是否允許 Reopen」政策判斷，而非系統直接放行或拒絕）。
- §8.5 的 sweep 分輪測試（同一輪 EXPIRE 的合約，本輪不得被 AUTO CLOSE 處理）。
- REOPEN 反轉沖銷鏈的測試：分別驗證路徑 A（直接 CLOSE，反轉 1 筆）與路徑 B（EXPIRE 後 AUTO CLOSE，反轉 2 筆）兩種案例，恢復金額均正確（見 §9.7）。
- Extension／REOPEN 各自的並發案例：合約底下有其他 PENDING 事件在途時，Extension／REOPEN 均應被擋下（見 §8.8／§9.8）。

### 11.4　全文待決事項一覽（尚未拍板，需 BA／工程team逐項確認）

| # | 議題 | 出處 | 現況 |
|---|---|---|---|
| 1 | AUTO EXPIRY／AUTO CLOSE 排程是否需分輪執行，保留最低重啟窗口 | §8.5 | 待與工程team確認排程實作方式 |
| 2 | `Expiry Extension Amendment` 是否需要受益人／相關方 consent 把關（同 F4 缺口） | §8.7 | 待 BA 評估，非阻擋項 |
| 3 | `A11`／`B7` REOPEN 是否需要受益人／相關方 consent 把關（風險等級高於 Extension） | §9.4 | 待 BA 評估 |
| 4 | `CLOSE` 是否強制要求 `reasonCode` | §9.4／§11.2 第10項 | 建議採用，待正式列入核准範圍 |

### 11.5　已核准、無需再等待的事項（彙整第七至十節結論，供快速核對）

AUTO EXPIRY／AUTO CLOSE 兩機制與其資格判斷（§7）、EXPIRED 後 A2/B2/A3/A3S/A8/B3 自動封鎖（§7.8）、
`Expiry Extension Amendment` 作為 EXPIRED 重啟機制（§8）、`A11`／`B7` LC Reopen 作為 CLOSED 重啟機制
（§9-10）、進出口對稱設計（§10.2）——以上均已經 BA 核准，可直接排入實作，僅 §11.4 列出的四項仍待拍板。

### 11.6　已查證、確認不影響本提案的項目（2026-08-25 review 補充）

- **`ContractStatus.SUPERSEDED` 與合約版本化機制**：`store/balanceContractStore.ts` 有完整的
  `markSuperseded()` 函式（把舊版合約標記 SUPERSEDED、指向新版 `superseded_by_balance_contract_id`，
  Design doc §7.3），但 `service/balanceService.ts` 裡**沒有任何呼叫者**——與 `REVERSAL` 同一類「有
  基礎設施但從未被任何業務功能觸發」的情況。今天系統不會有任何合約真的進入 `SUPERSEDED` 狀態，本提案
  §7.2／§7.8／§8.6／§9.6 講的 ACTIVE-only 解析路徑假設（一個 natural key 對應一筆 ACTIVE 合約）不受
  影響，無需額外處理。

## 十二、程式碼審閱結果（2026-08-25，對照 §一–十一 逐項核對）

工程team已完成 F1 全部項目的實作並交付覆核。以下是 BA 對照本文件 §一–十一 逐項核對「實際程式碼」的結果，
非再次審閱提案文字本身。

### 12.1　核對結果一覽

| 覆核項目 | 依據 | 結果 |
|---|---|---|
| EXPIRE 資格判斷不可誤用 SG/Acceptance=0 | §7.2 | 通過。獨立新檔 `domain/expiryEligibility.ts`，只判斷 ACTIVE + hasOpenEvents，程式註解明確引用 §7.2 並說明為何不可重用 `evaluateCloseEligibility()` |
| AUTO CLOSE 第二批次 | §7.3 | 通過。`service/balanceService.ts` 的 `runAutoCloseSweep()` 獨立存在，正確重用 `evaluateCloseEligibility()`（AUTO CLOSE 本就該沿用 CLOSE 的資格條件） |
| REVERSAL 方向動態計算 | §8.3／§9.3／§11.2 第7項 | 通過。非固定表項；`domain/balanceDerivation.ts` 的 `signedAmount()` 動態讀取 `reversalOfMovementId` 指向的原始 movement 方向後取反。`computeConfirmedBalance`/`computeAvailableBalance`/`computePendingDecreaseTotal` 已擴充支援 `REOPEN`（固定 0）與 `AMEND_EXPIRY_DATE`（固定 0），不會再對未知 movementType 拋錯 |
| EXPIRED 專屬 natural-key 解析路徑 | §8.6 | 通過。`store/balanceContractStore.ts` 新增 `findExpiredByNaturalKey()`，刻意窄化，只供 Extension Amendment 自己使用 |
| CLOSED 專屬 natural-key 解析路徑 | §9.6 | 通過。同檔新增 `findClosedByNaturalKey()`，只供 REOPEN 自己使用 |
| Extension／REOPEN 各自要求 hasOpenEvents=false | §8.8／§9.8 | 通過。兩者的 `release()` 分支都各自重新呼叫 `gatherEventTree()` 做 re-check，不依賴繼承既有機制的保護 |
| REOPEN 須反轉完整 EXPIRE+CLOSE 沖銷鏈，不能只反轉最後一筆 CLOSE | §9.7（最關鍵的一項） | 通過。REOPEN 的 `release()` 邏輯掃出這筆合約歷史上「所有尚未被反轉」的 EXPIRE/CLOSE movement（`toReverse`），逐筆建立並釋放對應的 REVERSAL，覆蓋路徑A（直接 CLOSE，反轉1筆）與路徑B（EXPIRE 後 AUTO CLOSE，反轉2筆）兩種情境 |
| B7 限縮在 `EPLC_CONFIRMATION`，不誤觸從未被實例化的 `EPLC_LC` | §10.1a | 通過。`EPLC_LC` 的合法 movementType 清單中沒有 `REOPEN`，只有 `EPLC_CONFIRMATION` 有 |
| `functionCode` enum 所有出現位置同步更新 | §10.3 | 通過，且範圍超出原本要求。`analysis/balance-component-channel-api.yaml` 三處 enum 都補了 `A11`/`B7`；工程team並主動一併補上了 §10.3 提醒但原本屬於歷史遺留的 `A10`/`B6` 漏補問題（v1.16.0 就該加卻沒加），非本次要求範圍但值得肯定 |
| §11.4 四項待決事項是否被實作團隊自行拍板 | §11.4 | 通過，全部正確維持「未決」狀態，未被程式碼繞過或預設實作：第1項（sweep 分輪時機）在 `runAutoCloseSweep()` 的程式註解中明確記錄「刻意延後、非漏做」，並引用本文件 §11.4 第1項；第2、3項（Extension／REOPEN 的 consent-gate）程式碼中完全沒有任何 consent 相關邏輯，即「還沒做，等 BA 決定」；第4項（CLOSE 的 `reasonCode`）仍是選填，未被強制 |

### 12.2　新發現的落差（非提案原有範圍，建議列入下一輪工程待辦）

**Inquire Events／Lookup 收合顯示未實作。** REOPEN／Extension Amendment 釋放時建立的 REVERSAL leg，
與其對應的 REOPEN／AMEND_EXPIRY_DATE 主 movement 雖然共用同一個 `businessEventId`（後端也有現成的
`findByBusinessEventId()` API 可用），但前端 `inquire-events.service.ts` 的 `InquiredEvent` 目前仍是
與 `BalanceMovement` 一對一，沒有依 `businessEventId` 收合成一列的邏輯（A4 的 create/finalize 分拆是
「同一筆 movement 拆兩列」的特例，方向相反，不是這裡需要的「多筆合併一列」）。

實際影響：REOPEN 走路徑B（先 EXPIRE 後被 AUTO CLOSE，兩筆都要沖銷）時，Approve 後會產生 1 筆 REOPEN
＋ 2 筆 REVERSAL，Inquire Events／Lookup 目前會顯示 3 列，而非使用者期待的 1 列（2026-08-25 對話中提出
的需求）。建議工程team在前端新增收合邏輯：預設清單過濾掉 `movementType==='REVERSAL'` 的列，改為併入
其對應的 REOPEN／Extension 主列（可展開查看沖銷明細）。

### 12.3　尚未驗證項目

透過裝置橋接嘗試執行 `microservices/balance-component` 的 `npm test`（尤其 `autoExpirySweep.test.ts`
與 REOPEN 相關測項）時，`jest` 的 `ts-jest` preset 解析失敗，研判是遠端掛載磁碟對 node_modules
symlink 解析不友善所致，非程式碼本身問題。**建議工程team／使用者自行在本機環境跑一次完整測試套件**，
尤其確認 REVERSAL 方向計算、REOPEN 路徑A（反轉1筆）／路徑B（反轉2筆）沖銷鏈金額是否正確。

### 12.4　結論

除 §12.2 的 Inquire Events／Lookup 收合顯示屬於新發現、建議另立待辦外，本次交付的程式碼與
§一–十一 核准內容**逐項核對一致**，包含最容易出錯的 §9.7 完整沖銷鏈邏輯與 §7.2 EXPIRE 資格判斷，
均正確實作；§11.4 四項待決事項也都正確維持未決、未被實作團隊自行拍板。可視為 F1 提案的實作階段
已完成，僅待：(1) §11.4 四項待決事項由 BA／工程team正式拍板，(2) §12.2 的畫面收合缺口排入下一輪，
(3) §12.3 的測試套件由本機環境完整跑過一次確認。

## 十三、§11.4 四項待決事項正式拍板（2026-08-25，BA／業務專家決議，取代 §11.4 的「待決」狀態）

本節記錄業務專家對 §11.4 四項待決事項的正式決議，以及 BA 對照現有程式碼核對後的可行性結論。
§11.4 原表格保留不刪，本節為正式拍板紀錄，兩者並存供稽核追溯。

### 13.1　決議總表

| # | 議題 | 正式決議 | 實作要求 | 可行性核對 |
|---|---|---|---|---|
| 1 | AUTO EXPIRY／AUTO CLOSE 時間間隔 | **必須保留重啟窗口** | 新增可配置的 `Auto Close Grace Period = N 個適用日`；AUTO CLOSE 只能處理 `expiredDate + N < Business Date` 且所有相關餘額為零的 LC，不採用「隔一輪」 | 可行。`balance_contracts.effective_to` 已在 EXPIRE 時寫入，日期基準判斷不需額外欄位。**「N個適用日」是否需排除假日／週末，尚待澄清（見13.3）——已於 §13.5 確定為銀行營業日，由 Standing 微服務負責計算** |
| 2 | Expiry Extension Consent | **Balance Component 不直接判斷 Consent，但必須接收上游確認結果** | Amendment Workflow／Trade Finance 主系統負責確認所需同意及授權；Balance Component 只有收到已核准的 Extension Amendment，才把 `EXPIRED → ACTIVE` 並恢復餘額。輸入：`amendmentApproved`、`amendmentEffective`、`consentStatus`（`NOT_REQUIRED`／`OBTAINED`） | 可行，且與 §7.7 既有架構原則（合法性判斷在 Channel API／呼叫端，非 microservice 自己判斷）一致。Request Schema 已用 `.passthrough()`，新增欄位不會撞既有結構，但驗證邏輯需全新開發 |
| 3 | A11/B7 REOPEN Consent | **必須採取更高層級控制** | REOPEN 不應是一般交易。須有特別權限、Maker／Checker、強制 Reason、重新授信檢查及上游合規／相關方確認。若原信用證法律義務已終止，應開立新 LC，不能只做系統 Reopen | 部分可行、部分超出本 microservice 範圍（見13.2） |
| 4 | CLOSE Reason Code | **強制必填** | A10、B6及人工 CLOSE 必須有 `reasonCode`；AUTO CLOSE 由系統自動填入 `NATURAL_EXPIRY_ALL_BALANCES_CLEARED` | 可行，`reasonCode` 現為自由字串欄位，無枚舉相容性問題，四項中改動量最小 |

### 13.2　第3項細部拆解（REOPEN 高風險特權交易）

- **強制 `reasonCode`**：可行，同第4項做法。
- **不同 Maker／Checker**：**已存在，無需新開發**。2026-08-24 業務決策已將「Maker≠Checker」做成程式碼強制檢查（`statusTransition.ts` 的 `assertMakerCheckerSeparation()`），適用於所有 RELEASE 動作，REOPEN 自動繼承。
- **特別操作權限（角色/權限限制誰能做REOPEN）**：**現有系統做不到，且屬於刻意的設計邊界**——`statusTransition.ts` 明確記載「leaving this to a bank's own role/entitlement policy, out of scope for this service」。兩種可行路徑，工作量差異大，**尚待澄清（見13.3）——已於 §13.5 確定採 (b)：由上游 Channel API／銀行 IAM／Entitlement 系統控制**：(a) 在 balance-component 內新增角色欄位＋權限檢查，屬於新範圍；(b) 明訂由上游 Channel API／IAM 層控管，balance-component 不管，與第2項 Consent 的切分邏輯一致，工作量小很多。
- **重新檢查授信**：屬跨系統依賴，balance-component 拿不到信用額度資料，**非本 microservice 可實作項目**，記為上游前置條件。
- **法律義務已終止應開新LC，不能只REOPEN**：屬人工判斷／作業程序，系統無對應欄位可據以自動判斷，**定位為作業程序／教育訓練規範，不列入工程team技術需求**。

### 13.3　尚待澄清的兩個子決策（不影響四項政策本身已定案，但影響實作細節）

| # | 子決策 | 選項 | 影響 |
|---|---|---|---|
| A | 第1項「N個適用日」的計算基準 | (a) 日曆日，沿用 `mail_float_grace_days` 現有算法；(b) 銀行營業日，排除假日／週末 | 選(b)需新建假日曆／營業日判斷邏輯，屬全新基礎建設；選(a)則與既有 `isPastExpiryGrace()` 同一套 pattern，改動很小 |
| B | 第3項「特別操作權限」的落地位置 | (a) balance-component 內建角色欄位＋權限檢查；(b) 明訂由上游 Channel API／IAM 層控管 | 選(a)工作量大、且與 microservice 現有設計邊界（角色管理 out of scope）相衝突；選(b)與現有架構原則一致，工作量小，但需在跨系統合約中明確載明 |

以上兩點暫未拍板，建議正式排入工程前由 BA／工程team快速確認，不阻擋其餘決議項目先行排入開發。

### 13.4　給工程team的正式結論

> 1. AUTO EXPIRY 與 AUTO CLOSE 不得在沒有時間間隔保護的情況下連續完成。新增可配置的 Auto Close
>    Grace Period，以 N 個適用日計算；不採用不確定的「隔一輪」作為唯一控制。（「適用日」計算基準見
>    §13.3 子決策A，待最終確認——已於 §13.5 確定為銀行營業日，由 Standing 微服務負責）
> 2. Expiry Extension 所需的 Consent 由上游 Trade Finance Amendment Workflow 控制。Balance
>    Component 不自行判斷 Consent，但只有在收到已核准且已生效的 Amendment 後，才能將 LC 從
>    EXPIRED 恢復為 ACTIVE 並恢復經核准的未使用餘額。
> 3. A11/B7 REOPEN 屬於高風險特權交易，必須執行強制 Reason、Maker/Checker（已有）、授信複核
>    （上游前置條件，非本 microservice 實作項）及上游合規／Consent 控制；特別操作權限的落地位置見
>    §13.3 子決策B，待最終確認——已於 §13.5 確定由 Channel API／銀行 IAM 控制。法律義務已經終止的 LC 不得僅通過系統 Reopen 恢復，應重新開立
>    LC——此點為作業程序規範，非系統技術需求。
> 4. 所有 CLOSE 必須提供 `reasonCode`。人工 A10/B6 由使用者選擇；AUTO CLOSE 由系統寫入
>    `NATURAL_EXPIRY_ALL_BALANCES_CLEARED`。

因此，四項中第1項和第4項需要改程式；第2項和第3項雖然 Consent／授信判斷不放在 Balance Component，
但仍需要定義並驗證上游傳入的審批／生效狀態，不能永久維持完全無控制。第1項與第3項另有各一個實作
細節子決策（§13.3）待最終確認——**兩項均已於 §13.5 正式確定**，其餘可直接排入下一輪工程。

### 13.5　子決策 A／B 正式確定（2026-08-25，取代 13.3 的「待澄清」狀態）

**子決策 A（適用日計算基準）確定為：銀行營業日，且由 Standing 微服務負責，Balance Component 不自建假日曆。**

架構原則：Balance Component 只負責餘額、狀態與交易控制；銀行營業日曆（WEEKEND／HOLIDAY BY
COUNTRY）由 Standing 微服務提供服務，Balance Component 呼叫（現階段為 MOCK）該服務取得「是否為
適用日／下N個適用日」，不在自己內部維護假日曆邏輯。分階段：

- Phase 1：Standing 微服務尚未就緒前，Balance Component 內建一個可替換的 MOCK 實作（例如固定規則
  ——週六日非適用日，無實際國別假日表），介面先定義好，之後直接替換成真正呼叫 Standing 微服務。
- Phase 2：正式改接 Standing 微服務的 WEEKEND／HOLIDAY BY COUNTRY 服務。

Grace Period 判斷條件維持 `Business Date > Expiry Date + N 個銀行營業日`，`N` 為可配置參數。
AUTO CLOSE 使用哪一本日曆：以處理該 LC 的銀行／分行自己的營業日曆為準，不預設同時檢查對手行日曆
（除非銀行政策另有要求）。

**需特別註記：本項與既有已核准的 `mail_float_grace_days`（§2.4，UCP 600 Art. 16(f) 的 AUTO EXPIRY
觸發條件）是兩個不同機制，互不影響。** `mail_float_grace_days` 目前仍是純日曆日運算
（`isPastExpiryGrace()`），本次決議只針對 AUTO CLOSE 新增的 Grace Period，未要求連動修改
`mail_float_grace_days`；如兩者未來要統一改為銀行營業日計算，需另案決議，非本次範圍。

**子決策 B（REOPEN 特別操作權限落地位置）確定為：Channel API／銀行 IAM／Entitlement 系統控制，
Balance Component 不建角色模型。**

責任分工採用你提供的分工表（見對話紀錄），Balance Component 承擔的部分維持：REOPEN Reason 必填、
Maker／Checker 分離（已存在）、LC 必須為 CLOSED 狀態（已存在）、原 Close/Expire 事件與交易歷史可
追溯（已存在，movement history 天然具備）、恢復餘額規則正確（已存在，§9.7 完整沖銷鏈邏輯）。

**BA 核對發現一項現有落差，直接對應你自己提出的警語「Balance Component 不管理角色，不代表 REOPEN
API 可以完全不受保護」：** 目前 `microservices/balance-component/src/app.ts` 的 middleware 只有
`helmet()`（安全標頭）與 `express-rate-limit`（限流），**完全沒有任何驗證呼叫方身分的機制**（無
API Key、無 JWT、無 mTLS）。也就是說，現狀下任何能連到這個 microservice HTTP port 的人，都可以繞過
Channel API 直接呼叫 REOPEN（或任何其他建立 movement 的端點）。這不是本次四項決議新增的缺口，而是
這個 microservice 從一開始就存在、之前沒被特別點出來的落差——但因為子決策B明確要求「只接受已授權
上游系統的請求」，這個缺口現在變成子決策B能否真正落地的前提，建議一併排入工程待辦：至少加上
service-to-service 層級的呼叫方驗證（API Key 或 mTLS 皆可），否則角色/權限管控完全放在上游，等於
沒有任何一層真正擋住直接繞過 Channel API 的請求。

流程圖（沿用你提供的版本）：
```text
使用者
→ Channel API
→ IAM 確認具有 REOPEN 權限
→ 上游 Workflow 完成授信／合規確認
→ Balance Component 建立 REOPEN（需先驗證呼叫方是已授權的 Channel API，見上方缺口）
→ 不同 Checker 核准
→ 狀態及餘額正式更新
```

### 13.6　與 `lc-balance-new` 資料夾的關係說明（2026-08-25，BA 確認）

工程team參考另一份 `lc-balance-new` 資料夾（含業務需求分析與 weekend/holiday mock server）時，BA 特別
釐清如下，避免工程team誤用其中已知有問題的部分：

- **`lc-balance-new` 裡的 `Natural-Expiry-Scope-Decision-Request.md`（OAS-GAP-15，2026-08-23已回覆）
  與 A6/B4 Maturity Date 的 Standing 整合（`src/clients/standingClient.ts` 接進
  `microservices/balance-component/`），兩者都是錯誤決策，且是同一個根本問題（誤將日期/日曆計算職責
  劃進 Balance Component）造成的——這正是 `lc-balance-new` 被移出、不再作為主要工作目錄的原因。**F1
  本文件採用的方向（新增 `EXPIRE`／`EXPIRED`／`AMEND_EXPIRY_DATE`／`REOPEN`／`REVERSAL`）維持不變，
  不需要對齊或改採 GAP-15「外部批次直接呼叫既有 A10/B6、不新增 movementType」的方案。**
- **`lc-balance-new` 裡唯一確認可用的部分：`microservices/standing-mock` 這個 weekend/holiday mock
  server 本身的機制**（`POST /business-days/adjust` 的請求／回應格式、`data/calendars.json` 的
  國別週末／假日測試資料結構）。工程team做 §13.5 的 Auto Close Grace Period（子決策A）時，可以參考
  這個 mock server 的實作方式，但**不要**照抄它被接進 A6/B4 Maturity Date 功能的那條錯誤路徑——
  Maturity Date 計算不屬於 Balance Component 的職責，應由另一個負責票據／承兌生命週期的 Business
  Component 負責；Balance Component 只在自己的 Auto Close Grace Period 場景下，獨立呼叫（或現階段
  MOCK）Standing 的營業日曆服務，兩者互不相關，不要合併成同一條整合路徑。
- 承 §13.5：目前這個 mock 只實作 `POST /business-days/adjust`（調整到最近營業日），沒有
  `POST /business-days/add`（往後數N個營業日）——Auto Close Grace Period 需要的是後者，工程team需要
  自行擴充 mock 或改用多次呼叫 `/adjust` 湊出N個營業日，不能直接套用現成端點。

### 13.7　REOPEN 恢復 EXPIRED 時 `effective_to` 未正確重設（2026-08-25，程式碼核對新發現，列入工程待辦）

BA 覆核 §9 REOPEN 邏輯時，對照 §13.5 即將新增的 Auto Close Grace Period 機制，發現一個現有的落差：
`store/balanceContractStore.ts` 的 `reactivate()` 函式，在 REOPEN 把 CLOSED 合約救回 EXPIRED（§9.2
情況二，原到期日已過，REOPEN 後 `targetStatus = 'EXPIRED'`）時，執行的是：

```sql
UPDATE balance_contracts SET status = @newStatus, effective_to = NULL WHERE ...
```

`effective_to` 被清成 `NULL`，而不是重新蓋上這次 REOPEN 核准當下的時間點。§13.5 規劃的 Auto Close
Grace Period（`expiredDate + N 個適用日 < Business Date`）需要靠 `effective_to` 當作「這個合約幾時
變 EXPIRED」的起算點——一個經 REOPEN 救回又變回 EXPIRED 的合約，`effective_to` 會是 `NULL`，若
Grace Period 邏輯沒有特別處理 `NULL` 的情況，可能被誤判為立刻符合 AUTO CLOSE 資格，完全沒有給人辦
Expiry Extension Amendment 的窗口——跟 §8.5／§13 決議1本來要防的問題一樣。

**工程要求：** REOPEN 的 `release()` 邏輯呼叫 `reactivate()` 把合約標回 `EXPIRED` 時，需要傳入這次
REOPEN 核准的時間點，重新蓋上 `effective_to`，讓該合約重新進入完整的 Grace Period 保護窗口，不能沿用
清成 `NULL` 的現狀。這一項與 §13.5 的 Auto Close Grace Period 是同一批工程改動，建議一併排入。

### 13.8　AUTO EXPIRY／AUTO CLOSE 排除 REOPEN 狀態交易——查證結果：PENDING 期間已天然排除，無需額外程式碼（2026-08-25，BA 確認）

業務要求「AUTO EXPIRY／AUTO CLOSE要排除REOPEN狀態交易」，BA 對照程式碼查證如下，拆成兩種情境：

- **REOPEN 尚在 PENDING（Maker已Submit、Checker還沒Release）：** 合約狀態在這段期間**仍然是
  `CLOSED`**——REOPEN 對狀態／餘額的實際變動，是在 `release()`（Checker Approve）當下才發生（見
  §9.3），Submit 當下完全不動狀態。而 `runAutoExpirySweep()` 只掃 `status = 'ACTIVE'` 的合約
  （`listActiveExpirable()`），`runAutoCloseSweep()` 只掃 `status = 'EXPIRED'` 的合約
  （`listExpiredContracts()`）——兩者的 SQL 條件都不包含 `CLOSED`。**因此一張合約只要還有 PENDING
  中的 REOPEN，就結構性地不可能被這兩個批次撿到，不需要額外新增排除邏輯。**
- **REOPEN 已 RELEASED（真正恢復狀態之後）：** 若恢復到 `ACTIVE`，AUTO EXPIRY 之後仍會按正常
  `expiryDate + mail_float_grace_days` 規則運作，不算「REOPEN造成的例外」，不需特殊處理；若恢復到
  `EXPIRED`（原到期日已過的情境），則是 §13.7 記錄的 `effective_to` 被清成 `NULL` 的問題——這才是
  真正需要修的地方，不是「排除」的問題，而是「重新給它完整 Grace Period」的問題。

**結論：業務這項要求，實際上已經被 §13.7 的修正完整涵蓋**（PENDING 期間天然安全，RELEASED 後回到
EXPIRED 的情境靠 §13.7 補上 `effective_to`），不需要在 AUTO EXPIRY／AUTO CLOSE 的候選清單查詢邏輯
裡另外新增「排除 REOPEN」的條件，避免工程team誤解成需要重複做一次已經天然成立的保護。
