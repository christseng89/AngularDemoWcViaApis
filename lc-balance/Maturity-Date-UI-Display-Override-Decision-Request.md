# 決策請求：A6/B4 Calculated Maturity Date 的 UI 唯讀顯示與手動覆寫怎麼做

> **v17（修正第四輪業務覆核指出的兩個小問題，純本文件內部修正，主文件無需同步改版）**：第四輪覆核肯定 v16 已解決前三輪的主要問題（整體評 9.8／10），指出兩個型別／用詞層級的小問題：(1) 「建議資料模型」的 TypeScript 宣告把 `calculatedOperationalPaymentDate`／`effectiveOperationalPaymentDate` 寫成必填的 `string`，但下面的計算公式明確允許回傳 `undefined`——型別與公式互相矛盾，本版改為 `?: string`（optional）；(2) 日期欄位對照表把 `contractualMaturityDate` 描述成「正式合約到期日」，但 `PENDING_APPROVAL` 階段這個值其實還沒正式生效，只有 `APPROVED` 後才算——本版修正描述用詞，並新增一份依 `maturityDateStatus` 三種狀態對應不同 UI 標籤的建議表（`PENDING_BASE_DATE` → Estimated；`PENDING_APPROVAL` → Calculated...Pending Approval；`APPROVED` → Approved），同步更新「建議 UI 顯示欄位」裡 Contractual Maturity Date 那一列的說明。
>
> **v16（修正第三輪業務覆核指出的兩處新舊敘述不一致）**：第三輪覆核肯定 v15 已正確納入 UI 顯示需求並區分預估／正式日期，但指出兩處未同步更新的舊敘述：(1) 「三層顯示與驗算控制標準」Layer 1 那一列沿用了新增 Estimated 概念之前的舊講法「不能顯示一個可能是錯的日期」，跟後面新增的「`PENDING_BASE_DATE` 期間可顯示 Estimated 日期」字面矛盾——本版改成依「有沒有可用的 Estimated Base Date」分兩種情況描述；(2) 「建議資料模型」與「這個答案會決定什麼」仍殘留「若問題一選 (b)」的假設性描述，問題一已核定選 (a)，本版移除或標註為「業務已不採納，僅供對照」。另外新增一份 Estimated／Confirmed／Calculated／Override／Effective 完整欄位對照表，統一日期欄位命名與業務意義，並把 `effectiveOperationalPaymentDate` 的計算式明確加上 `maturityDateStatus = APPROVED` 前提。主文件同步改版至 v33，版本號交叉引用一併更新。
>
> **v15（回應第二輪業務覆核的兩項追問）**：第二輪覆核肯定 v14 整體方向，但指出兩項需要釐清的地方：(1) 問題一標示的「業務已核定」，指的是使用者在文件協作過程中以業務／BA 角色明確同意，跟一頁業務確認摘要「確認記錄」表格所代表的、由實際 TF Business／Ops 具名的正式簽核是兩個不同層級，後者目前仍是空白——本版在問題一新增這項澄清，並提醒正式定案前仍須完成一頁摘要的確認記錄；(2) 補充 Estimated（試算）日期如何與 `PENDING_BASE_DATE` 並存而不矛盾——新增「Estimated 與正式生效日期的欄位區分」段落（三層顯示與驗算控制標準之後），明確 `PENDING_BASE_DATE` 只禁止正式生效的日期、不禁止僅供顯示的估算值，並在「建議資料模型」新增對應欄位建議、在「建議 UI 顯示欄位」表格標註 Estimated 版本欄位。主文件同步改版至 v32，版本號交叉引用一併更新。
>
> **v14（業務覆核修正 v13，問題一由「業務初步方向」升級為「業務已核定」）**：業務覆核指出一項重要概念需要修正並已採納——`fixedMaturityDate` 不是 Base Date，不適用相同的修正機制（Base Date 是計算 Contractual Maturity Date 的輸入，`fixedMaturityDate` 本身就是條款指定的到期日，修正須走正式 LC Amendment／Contractual Date Correction，不呼叫 `computeSourceDate()`）；新增分類表區分兩者。另外正式核定「已 `APPROVED` 後修正 Base Date」的規則（獨立 Correction Event、核准前舊值繼續有效、**新增**：Settlement 已完成須改走正式 Correction／Reversal／Exception）；新增「Base Date 在不同階段的修改控制」表（Maker 未 Submit／已 Submit 未核准／已 `APPROVED`／Settlement 已完成）；新增 `AFTER_ACCEPTANCE` 情境下承兌日未確認前應標示為「Estimated Contractual Maturity Date」的顯示用詞規則；把「給 BA 與工程師的建議回覆」升級為「最終業務決議」六點。主文件同步改版至 v31，版本號交叉引用一併更新；一頁業務確認摘要問題一同步更新。
>
> **v13（本版新增，回應使用者以 BA 角色提出的業務決議草案）**：問題一新增「業務初步方向」——選 (a) 不允許直接覆寫 Contractual Maturity Date，並具體給出 Base Date 修正機制：Base Date（Acceptance Date／`sightDate`／`blDate`／`invoiceDate`／`shipmentDate`，及類推適用的 `fixedMaturityDate`）本身允許修正，須走 Maker／Checker 核准並保留異動紀錄；修正後系統重新計算 Contractual Maturity Date，再送 Standing 重新算 Operational Payment Date；所有新日期須經核准才正式生效。這個方向目前是草案，尚未經業務正式簽核，帶去確認時仍需當面覆核。同步在「建議 UI 顯示欄位」新增三個核心欄位（Base Date／Contractual Maturity Date／Operational Payment Date）各自是否可修改的對照表與範例；主文件同步新增 4.4 節，改版至 v30，版本號交叉引用一併更新；一頁業務確認摘要同步更新問題一。
>
> **v12（本版新增，回應使用者提議）**：新增「三層顯示與驗算控制標準」一節——把已核定的 `MaturityDateStatus` 三段生命週期（Layer 1 試算／Layer 2 待核准／Layer 3 正式生效再驗算一次）對應到「畫面什麼時候該顯示什麼」的具體規則，回應使用者提出的「輸入日期就該顯示在頁面，Submit／Approve 各自再做一次驗算」；同時把「Layer 1／2 顯示的是預覽值，會不會被誤認成正式答案」這個風險，列為建議跟五題一起請業務當面確認的項目，並附上三點延伸建議（Layer 3 驗算不過的畫面呈現、Layer 1 即時重算、歷史查詢畫面套用同一套標示邏輯）供業務參考；已同步更新到一頁業務確認摘要。
>
> **v11（純同步更新，無內容變動）**：主文件改版至 v29（收斂審查對 v28 的兩項意見：明確 `CALENDAR_SNAPSHOT_UNAVAILABLE` 是例外代碼、不是 `MaturityDateStatus` 第四種狀態，且不得自動改回 `PENDING_*`；新增查證依據標示慣例說明），這兩項修正屬於主文件第八節的 Snapshot 例外處理與全文查證用詞慣例，跟本文件的 UI／覆寫問題無直接關聯，僅同步版本號交叉引用從 v28 改為 v29，內容本身無需修改。
>
> **v10（純同步更新＋一處查證出處修正）**：主文件改版至 v28（收斂審查對 v27 的 Calendar Snapshot 遺失處理、Checker Release 用詞精確度兩項意見，另加一輪本版自行發起的程式碼複查，細節見主文件版本記錄），這兩項修正屬於主文件第五、八節的 Snapshot／Release 機制細節，跟本文件的 UI／覆寫問題無直接關聯，僅同步版本號交叉引用從 v27 改為 v28；另外把下方「發起依據」段落裡「Angular `BalanceContract`／`BalanceMovement` interface 未宣告這個結果欄位」的講法，比照主文件同一輪的修正，改標註為依 `CLAUDE.md` 記錄判斷、本次查證範圍不含 Angular 原始碼，非直接核對 interface 得出。
>
> **v9（本版新增，回應審查意見）**：主文件改版至 v27，為兩步驗算補上 `FIXED_MATURITY_DATE` 例外、日期角色辨識、`calendarSnapshotId` 一致性三處補強。本文件問題二新增一段，明確主文件「CREATE 時未經驗算 `maturityDate` 必須相符」的規則不適用於這裡的 Operational Payment Date 覆寫流程（核准後的覆寫值本來就允許不等於 Standing 原始計算結果），避免兩份文件被誤讀成矛盾；版本號交叉引用同步從 v26 改為 v27。
>
> **v8（純同步更新，無內容變動）**：主文件改版至 v26（使用者提議補上：完整驗證方案先前只驗算 Base Date＋Tenor Days 這一半，沒有驗算假日／週末調整那一半，本版拆成兩步驗證），這項修正不影響本文件內容，僅同步版本號交叉引用從 v25 改為 v26。
>
> **v7（本版查證新增，比純同步更新更進一步——更正一個延續自 v6 之前所有版本的錯誤前提）**：主文件改版至 v25，查證發現 `FIXED_MATURITY_DATE` 賴以當「唯一例外」的 `fixedMaturityDate` 欄位，跟 `tenorBasis` 一樣完全不存在於 `types.ts`／`db/schema.ts`——先前版本（含本文件 v6 引用的主文件 v24）都誤以為這是既有欄位。修正後：六種 `tenorBasis` 現階段一視同仁，都沒有可用的例外路徑（見上方發起依據段落的更正）；本文件版本號交叉引用同步從 v24 改為 v25。
>
> **v6（純同步更新，無內容變動）**：主文件改版至 v24（v23 把「呼叫端提供的 `maturityDate`」一律標成 `PENDING_APPROVAL`，跟第四節 `PENDING_APPROVAL` 自身定義「基準日已確認、已算出日期」矛盾，本版改為未經驗算一律拒絕，`FIXED_MATURITY_DATE` 例外），本文件版本號交叉引用同步從 v23 改為 v24，內容本身無需修改。
>
> **v5（純同步更新，無內容變動）**：主文件改版至 v23（修正 v22 自己引入的「一律要求呼叫端提供 `maturityDate`」止血方案本身不安全的問題），本文件內所有版本號交叉引用同步從 v22 改為 v23，內容本身無需修改（審查對本文件本輪評分 9.9／10，未要求變更）。
>
> **v4（本版修正，回應審查意見與使用者提問）**：把 v3 對 Base Date 限制的描述再修正得更準確——`Maturity-Date-Tenor-Basis-Decision-Review.md` v22 進一步查證確認，「Base Date＝建檔當天」不是一個「已確認正確、可以信任」的支援情境，只是目前唯一被拿去 live 測試過的巧合輸入：`sightDate`／`blDate`／`invoiceDate`／`shipmentDate` 這幾個欄位全部不存在，`AFTER_ACCEPTANCE` 的操作定義也未定，代表六種 `tenorBasis` 裡，現階段沒有一種能被正式確認「今天」是正確答案。UI 唯讀顯示與正式上線的區別因此更明確：畫面開發不受影響，但正式對使用者開放顯示日期，必須等後端至少有一種 `tenorBasis` 的 Base Date 來源被正式接上；本版同步修正「開發」與「上線」混用的地方，並加入 Feature Flag 的建議。
>
> **v3**：修正一句技術上不夠精確的敘述（Standing 呼叫失敗時，不是「固定回傳」`contractualDateChanged: false`，是根本沒有回應可用）；問題二新增 Override 日期仍須經過行事曆／營業日檢查、不能直接繞過 Standing 判斷的要求；修正問題五選項 (a) 「取代系統算出的值」這個容易被誤實作成直接覆蓋的用詞，改成明確的「提出覆寫值，原始計算值保留，核准後才切換生效值」；新增「建議預設方向總覽」表格，方便業務快速掃過每個問題的建議答案。
>
> **v2**：把原本混在同一個問題底下的「覆寫權限」「原因記錄」「發生時機」拆成三個獨立問題；新增「Contractual Maturity Date 能不能被直接覆寫」這個更根本、應該優先回答的問題；修正一個容易誤導的例子（「提前撥款」不是 Operational Payment Date 的覆寫，是另一筆獨立業務事件）；新增覆寫功能若核准後的建議資料模型（原值／覆寫值／生效值三欄，不得直接覆蓋原始運算結果）與建議 UI 顯示欄位，供業務判斷時參考影響範圍，也供前端後續設計參考。
>
> **以下所有問題仍然是開放問題，本文件不代替業務/工程做最終決定**——凡標「建議預設方向」的地方，都是本文件認為風險較低、若業務暫時沒有明確偏好可以先採用的暫定答案，不是既定結論。

**發起依據**：`Maturity-Date-Tenor-Basis-Decision-Review.md`（v33）查證
`analysis/A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md` §2/§3 A6/B4 兩列「✅ 決策已定案，待實作」這個狀態標記時發現：**Base Date＋Tenor Days 的純運算邏輯、以及呼叫 Standing 做假日調整這兩段程式碼本身已經完成並 live 驗證，但用來驗證的 Base Date 輸入是寫死的「建檔當天」，不是依 `tenorBasis` 從正確來源讀來的**（`routes/balanceMovements.ts` 第 51 行目前不論 `tenorBasis` 一律傳入 `service.getBusinessDate()`；本次以 Business Case Runner 驗證的 90 天案例算出 2026-11-23、60 天案例算出 2026-10-22，用的都是「今天」，與 `CLAUDE.md` 既有記錄一致）。**這不代表「Base Date＝建檔當天」是一個已確認可信任的情境，只是目前唯一被拿去測試過的輸入**——`sightDate`／`blDate`／`invoiceDate`／`shipmentDate` 這幾個欄位目前都不存在於 `types.ts`，`AFTER_ACCEPTANCE` 的操作定義也還沒確認，六種 `tenorBasis` 現階段沒有一種的 Base Date 來源被正式驗證過——**含 `FIXED_MATURITY_DATE` 在內**：這個 `tenorBasis` 概念上不需要 Base Date＋Tenor Days 運算，原本以為可以當唯一例外，但主文件本輪查證發現它所需的 `fixedMaturityDate` 欄位本身也完全不存在於資料模型（跟 `tenorBasis` 一樣需要新增），所以現階段一樣沒有可用的例外路徑，詳見主文件 v33 第四、八節新增的 P0。但**UI 唯讀顯示與手動覆寫完全未開始**（依 `CLAUDE.md` 記錄，Angular UI wiring——含 A6/B4 唯讀顯示與 `maturityDateOverrideReason` 覆寫欄位——仍是尚未開始的獨立工作項目；本次查證範圍不含 Angular 原始碼，無法直接核對 `BalanceContract`／`BalanceMovement` interface 宣告，`maturityDateOverrideReason` 全專案零筆存在，只出現在規劃文件裡）。這不是已確認的缺陷，是開始實作這半段時會撞到的開放問題——Revision-Spec §6.1 原規劃只寫了「UI 唯讀顯示，Maker 勾選『手動調整』+ 填寫理由才可覆寫」一句話，覆寫涉及哪個欄位、權限、流程、生效時機都還沒有具體定案。

**請求對象**：TF Business／Ops（覆寫範圍與流程），可能也需要前端團隊確認 UI 呈現細節
**預期產出**：對下方問題的明確答案，不需要事先準備簡報或文件。

---

## 背景（1 分鐘版）

`Maturity-Date-Tenor-Basis-Decision-Review.md` 第一節已經確立一個既有立場：**Contractual Maturity Date（合約到期日本身）跟 Operational Payment Date（實際撥款/處理日）是兩個不同層次的日期**——前者由信用狀條款（Tenor Basis／Tenor Days／Base Date／`FIXED_MATURITY_DATE`）決定；Standing 微服務**呼叫成功時**固定回傳 `contractualDateChanged: false`，代表 Contractual Maturity Date 本身理論上不因假日調整而改變（若呼叫失敗，根本沒有回應可用，Contractual Maturity Date 不得自行改動，Operational Payment Date 依既有錯誤處理與重試政策處理，見主文件第六節，不是「固定回傳」這句話字面上暗示的兩種情況都有結果可用）；後者才是「哪一天實際撥款」會因為遇到假日而順延/提前的欄位。第四節也已經把系統算出來的值定案為 `MaturityDateStatus`（`PENDING_BASE_DATE`／`PENDING_APPROVAL`／`APPROVED`）三段生命週期，只有 `APPROVED` 可供下游引用。

**這裡有一個重要的前置限制需要先說明**：上面這套邏輯目前只用「建檔當天」這個輸入被 live 驗證過（見上方發起依據），**而且這不是因為業務已經確認「建檔當天」對某個 `tenorBasis` 就是正確答案，純粹是測試案例剛好這樣輸入**——`AFTER_SIGHT`、`AFTER_BL_DATE`、`AFTER_INVOICE_DATE`、`AFTER_SHIPMENT_DATE` 需要的 `sightDate`／`blDate`／`invoiceDate`／`shipmentDate` 都不存在，`AFTER_ACCEPTANCE` 需要的「Acceptance Date」操作定義也未定。這代表**UI 唯讀顯示規劃時，不能假設「只要工程把畫面接上現有的計算結果就一定正確」，也不能假設有任何一種 `tenorBasis` 目前是安全的**——顯示邏輯（畫面、欄位、狀態標示）本身可以先開發，但在後端至少完成一種 `tenorBasis` 的 Base Date 正確來源接入之前，不應該把顯示出來的日期當作對使用者正式可信的結果開放使用；正式上線前，畫面需要能因應「這個 Tenor Basis 的 Base Date 尚未支援」這種情況（例如顯示 `PENDING_BASE_DATE` 狀態，而不是顯示一個可能錯誤的日期）。這個限制本身不是本文件的決策範圍（屬於主文件 v33 第四、八節的 P0），這裡只是提醒：UI 顯示的範圍規劃與正式上線時程，需要跟後端這項修正對齊，不能只看「畫面做完了」就上線。

但 Revision-Spec §6.1 另外規劃的**人工覆寫**功能（`maturityDateOverrideReason`），目前完全沒有把上面這個既有立場套進去：覆寫的到底是 Contractual 還是 Operational、誰可以覆寫、覆寫要不要走額外核准、覆寫在哪個時間點發生——這幾個問題不回答，前端／後端都無法開始設計。UI 唯讀顯示本身規則相對單純（不涉及覆寫），但因為兩者常被寫在同一個 Revision-Spec 條目底下，容易被一起卡住，不確定能不能先單獨上線。

## 請回答的問題

### 問題一（建議優先回答）：Contractual Maturity Date 能不能被人工直接覆寫？

這是最根本的問題，會決定下面所有問題的討論範圍。

**業務已核定（本版更新）**：選 **(a) 不允許**，並且已經把「Base Date 本身要怎麼被修正」這個先前留白的問題一併給出具體機制——見主文件 4.4 節「Base Date 修正機制」與下方摘要。業務覆核時同時修正了 v13 一個不夠精確的地方：`fixedMaturityDate` **不是** Base Date，不適用相同的修正機制，見下方「重要業務概念修正」。

**關於「業務已核定」的說明（v15 新增，回應第二輪業務覆核；v16 補上建議的替代講法）**：這裡的「業務已核定」代表使用者在本文件協作過程中以業務／BA 決策角色明確表達同意，跟由實際 TF Business／Ops 人員具名完成的正式書面／口頭簽核是兩個不同層級——後者的正式紀錄以一頁業務確認摘要（`Maturity-Date-UI-Override-Business-Confirmation-Summary.md`）文末的「確認記錄」表格為準，目前仍是空白。這不代表下面的方向有疑慮，只是提醒：拿去跟實際業務人員當面／口頭確認並回填那張表，仍是正式定案前的必要一步。若要更精確表達目前的狀態，也可以讀作：**設計方向已確認，待 TF Business／Ops 正式簽核**——這句話跟「業務已核定」指的是同一件事，只是用詞更明確區分「內容方向沒有疑義」跟「正式簽核程序尚未完成」兩件事；一旦取得正式簽核並回填一頁摘要的確認記錄，本文件才算真正達到完全定案的狀態（這一點在「決策狀態總表」也已改列為 Go-Live Blocker，見主文件第十節）。

| 選項 | 說明 |
|---|---|
| **(a) 不允許——業務已核定** | Contractual Maturity Date 由信用狀條款（Tenor Basis／Tenor Days／Base Date）決定，不應該用一般 UI Override 直接改掉這個結果；如果算出來的日期錯誤，應該回頭修正真正的來源（Base Date），修正後系統重新計算，而不是直接改結果值。理由：若允許直接覆寫，例如條款是「見票後 90 天」、系統算出 2026-11-30，但被人工直接改成 2026-12-10，日期跟「見票後 90 天」這個條款文字本身就會脫節，形成資料矛盾——除非同時也修改了 Tenor Days，否則沒有人能從畫面上看出這個矛盾 |
| (b) 允許，但需要特殊權限與強制理由 | 業務已不採納這個選項 |

**Base Date 修正機制摘要（主文件 4.4 節）**：`AFTER_ACCEPTANCE` 的 Acceptance Date、`sightDate`、`blDate`、`invoiceDate`、`shipmentDate` 本身允許修正——`AFTER_ACCEPTANCE` 情境下正式承兌前的日期可能只是預估值，實際承兌日確認後應可更新；其他情境若原始輸入本身輸入錯誤，也應允許依正確資料訂正。修正須保留異動紀錄（原值／新值／修改原因／修改人），並走 Maker／Checker 雙人控制（依階段有不同控制方式，見下方）。**Contractual Maturity Date 本身仍然不允許直接覆寫**——Base Date 修正後，系統依 Tenor Basis／Tenor Days／新 Base Date 重新計算 Contractual Maturity Date，再送 Standing 微服務重新算 Operational Payment Date，所有新日期須經核准才正式生效：

```text
Tenor：90 days after acceptance

原預估 Acceptance Date：2026-09-01
原 Contractual Maturity Date：2026-11-30

實際 Acceptance Date：2026-09-03
重新計算 Contractual Maturity Date：2026-12-02

再由 Standing 微服務計算 Operational Payment Date。
```

核心原則一句話：**允許修改正確的日期來源，不允許直接修改系統依條款計算的合約到期日。**

**重要業務概念修正（v14 依業務覆核意見更正，取代 v13 原本「`fixedMaturityDate` 類推適用」的講法）**：`fixedMaturityDate` **不是** Base Date，不應該套用相同的修正機制——Acceptance Date 等 Base Date 是計算 Contractual Maturity Date 用的**輸入**，修正它是更正計算基準；`fixedMaturityDate` 本身**就是**條款直接指定的合約到期日，修改它實質上是修改合約條款本身。正確分類：

| 日期 | 是否屬於 Base Date | 修正方式 |
|---|---:|---|
| Acceptance Date／Sight Date／BL Date／Invoice Date／Shipment Date | 是 | Base Date Correction |
| `fixedMaturityDate` | **不是** | 正式 LC Amendment／Contractual Date Correction，不呼叫 `computeSourceDate()`，但同樣要送 Standing 重算 Operational Payment Date |

**Base Date 在不同階段的修改控制（本版新增）**：

| 階段 | 建議控制 |
|---|---|
| Maker 尚未 Submit | 可在輸入畫面直接修改，草稿階段不需要各自產生正式 Amendment |
| 已 Submit、尚未核准 | 退回／取消原 Submit，修正後重新 Submit |
| 已 `APPROVED` | 建立獨立的 Base Date Correction Event；舊日期在新修正核准前繼續有效 |
| Settlement 已完成 | 不允許一般修正，須改走正式 Correction／Reversal／Exception 流程 |

**已 `APPROVED` 後修正 Base Date（業務已核定，回應問題五的延伸情境）**：建立獨立 Correction／Amendment Event；核准前原已生效日期繼續有效，不得先把 `maturityDateStatus` 撥回 `PENDING_*`；Checker 核准後新值才生效；保留原日期、新日期、原因、Maker、Checker 及核准時間；**若已完成 Settlement，不得走一般修正，須改走正式 Correction／Reversal／Exception 流程**。

**`AFTER_ACCEPTANCE` 的顯示用詞（業務已核定，本版新增）**：實際承兌日尚未確定前，畫面上算出的到期日只能標示為 **Estimated Contractual Maturity Date**（估計合約到期日），不得視為正式到期日；實際承兌日確認並經核准後，才形成正式生效的 Contractual Maturity Date。

**給 BA 與工程師的最終業務決議（可直接引用）**：

> 1. Acceptance Date、Sight Date、BL Date、Invoice Date 及 Shipment Date 均屬 Base Date，可以依正確業務資料修正。
> 2. Base Date 修正後，系統必須重新計算 Contractual Maturity Date，並呼叫 Standing 重新計算 Operational Payment Date。
> 3. Contractual Maturity Date 不允許直接人工覆寫。
> 4. `fixedMaturityDate` 不是 Base Date；如需修改，必須走正式 Amendment／Contractual Date Correction，不執行 `computeSourceDate()`。
> 5. 已核准的 Acceptance 如需修正 Base Date，必須建立獨立 Correction Event；新修正核准前，原已生效日期繼續有效，不得把 `maturityDateStatus` 自動改回 `PENDING_*`。
> 6. Contractual 及 Operational 兩個計算日期都必須顯示在頁面；正式生效前須清楚標示為 Estimated／Pending Approval，不得讓使用者誤認為正式到期日。

### 問題二：Operational Payment Date 覆寫的正確使用情境是什麼？

**需要先排除一個容易混淆的情境**：受益人／出口商要求提前拿到款項（押匯、貼現、預付），這是一筆**獨立的業務事件**（Discount／Negotiation／Prepayment），不是把 Operational Payment Date 改成提早的那一天——原到期日（不論 Contractual 或 Operational）應該維持不變，提前撥付的是另一筆融資款項，不是把「到期日」本身往前搬。這兩者若在系統或文件裡混為一談，會讓「到期日」這個概念失去意義。

真正可能需要 Operational Payment Date 覆寫的情境（供參考，非本文件窮舉）：Standing 回傳的行事曆判定本身有誤（例如遺漏了某個臨時公告的休市日）；某個清算系統臨時停止作業；銀行依既有授權書面指示採用某個例外的處理日期。

| 選項 | 說明 |
|---|---|
| **(a) 允許，但須受控——建議預設方向** | 保留覆寫能力，但比照下面問題三～五的權限／記錄／時機規則，不是自由欄位 |
| **(b) 不允許覆寫，遇到例外一律走人工/離線處理** | 系統完全不提供覆寫功能，例外情況發生時由銀行內部另外用既有的人工作業流程處理，不記錄在這個欄位上 |

**若選 (a)，建議覆寫日期預設仍須通過跟原本計算一樣的行事曆／營業日檢查，不能直接繞過 Standing 判斷**：現有的雙行事曆設計（第五節）跟 Standing 的 Business-Day Adjustment 邏輯，目的就是確保 Operational Payment Date 落在真正的營業日上；如果 Override 功能允許填入任意日期、完全不檢查，等於讓人工覆寫直接繞過這整套既有控制。建議預設方向：Override 提出的日期，系統仍呼叫 Standing 或既有行事曆邏輯確認是否為營業日，非營業日預設拒絕；若業務確實需要「明知是非營業日、但基於特殊授權仍要指定」這種例外（例如銀行內部書面核准的特殊處理日期），應該要求額外的特殊授權標記與理由，並讓系統清楚記錄「這是一筆跳過一般營業日檢查的例外」，不要讓一般 Maker 就能無條件填入非營業日。

**跟主文件的分工要說清楚，避免兩份文件被誤讀成互相矛盾（本版新增，回應審查意見）**：主文件 v33 第八節「Base Date 依 `tenorBasis` 差異化讀取」新增的兩步驗算，要求 Acceptance CREATE 時未經驗算的 `maturityDate` 必須等於系統重新算出的結果，否則拒絕——**這條規則只管 CREATE 時來路不明的 passthrough，不適用於這裡的 Operational Payment Date 覆寫**：覆寫走的是上面這個獨立的 Maker 提出／Checker 核准流程，核准後的覆寫值本來就允許不等於 Standing 算出的 `calculatedOperationalPaymentDate`（這正是「覆寫」的意義），不是驗算失敗，不應該被主文件那條「必須相符」的規則擋下；覆寫要通過的是這裡定義的營業日檢查、權限、理由與 Maker／Checker 核准，不是重新驗算相符。

### 問題三：覆寫的權限模型？

| 選項 | 說明 |
|---|---|
| **(a) 沿用一般 Maker Submit → Checker Release 流程** | 提出覆寫的 Maker／核准覆寫的 Checker 跟一般交易的 Maker／Checker 是同一組人、同一套權限 |
| **(b) 限定具備 Maturity Override 專屬權限的角色** | 只有特定授權的 Maker／Checker 可以提出或核准覆寫，需要新增角色／權限判斷 |

### 問題四：覆寫的原因記錄要求？（與問題三的答案可以任意組合，不是互斥選項）

| 選項 | 說明 |
|---|---|
| **(a) 只需自由文字理由** | `maturityDateOverrideReason` 自由文字必填，不需要額外分類 |
| **(b) 理由分類（Reason Code）必填，自由文字選填** | 新增一個列舉欄位（例如 `maturityDateOverrideReasonCode`），方便後續報表統計覆寫原因分布；列舉值清單本身需要業務另外定義 |
| **(c) 理由分類與自由文字都必填** | 兩者都要，兼顧統計與個案說明 |

### 問題五：覆寫的發生時機，跟第四節已定案的 `MaturityDateStatus` 生命週期怎麼接？

| 選項 | 說明 |
|---|---|
| **(a) Acceptance CREATE Submit 階段即可覆寫——建議預設方向** | Maker 在 Submit 當下提出 `overrideOperationalPaymentDate`，系統仍保留 Standing 算出的 `calculatedOperationalPaymentDate`（不覆蓋、不丟棄，見下方建議資料模型）；Checker Release 後，由核准的覆寫值成為 `effectiveOperationalPaymentDate`，沿用既有的 `MaturityDateStatus`（`PENDING_APPROVAL` → `APPROVED`），跟未覆寫的情況走同一套狀態機，不需要新狀態 |
| **(b) Acceptance 已經 `APPROVED` 之後，才能另外發起一筆獨立的覆寫申請** | 系統算出的值必須先正式生效過，才能再被覆寫；**建議這種情況走獨立的 `MaturityDateOverride` Event／狀態機（`PENDING` → `APPROVED`／`REJECTED`），不要把已經生效的 `maturityDateStatus` 直接從 `APPROVED` 撥回 `PENDING_APPROVAL`**——因為下游（A7 到期付款、報表、逾期判斷）可能已經依賴這筆 Acceptance 目前是 `APPROVED` 這件事，貿然撥回去可能造成下游誤判「這筆到期日還沒生效」；覆寫申請在核准前，原本已生效的日期應該繼續有效 |
| **(c) 兩者都允許，各自用不同流程** | Submit 階段跟 Approved 之後都可以覆寫，但走 (a)／(b) 各自的流程，不共用同一套邏輯 |

**若選 (a) 或 (c) 包含 Submit 階段覆寫**：這個情境下的覆寫，事實上就是「Maker 提出的候選值」，前面第四節既有的 `PENDING_APPROVAL` 狀態本身已經隱含「還沒 Checker Release 前都是預覽」，不需要額外設計。

## 三層顯示與驗算控制標準（本版新增，回應使用者提議：「輸入的日期就該顯示在頁面，Submit／Approve 各自再驗算一次」）

這不是新增決策，是把第四節已經核定的 `MaturityDateStatus` 三段生命週期，跟主文件第八節已經核定的兩步驗算／Checker Release 再確認邏輯，用「畫面什麼時候該顯示什麼、系統什麼時候該再驗算一次」的角度重新整理成一張表，方便業務跟前端對齊，不需要另外設計新狀態或新流程：

| 層級 | 對應 `MaturityDateStatus` | 觸發時機 | 系統動作 | UI 顯示規則 |
|---|---|---|---|---|
| **Layer 1：輸入／試算** | `PENDING_BASE_DATE`（基準日未確認）或已算出但尚未 Submit 的暫時值 | Maker 在畫面上輸入資料，或系統依 `tenorBasis` 自動試算當下 | 執行第一次兩步驗算（Base Date＋Tenor Days／假日調整，主文件第八節）；若這個 `tenorBasis` 目前沒有可用的 Base Date 來源（見上方背景說明的 P0 缺口），停在 `PENDING_BASE_DATE`，不產生日期 | **依有沒有可用的 Estimated Base Date 分兩種情況（v16 修正，避免跟下方「Estimated 與正式生效日期的欄位區分」互相矛盾）**：完全沒有可用日期來源時，不顯示日期，或顯示「待確認」狀態；已有 Estimated Base Date（例如 `AFTER_ACCEPTANCE` 的預估承兌日）時，可以顯示算出的 Estimated Contractual／Operational Payment Date，但必須明顯標示「Estimated，僅供參考，尚未生效」，不得讓使用者誤認成正式答案；不論哪種情況，`maturityDateStatus` 都維持 `PENDING_BASE_DATE`，不因為顯示了 Estimated 值就被誤判成已進入下一層 |
| **Layer 2：Submit（待核准）** | `PENDING_APPROVAL` | Maker 完成 Submit | 系統算出的 `calculatedXxxDate` 與 Maker 提出的 `overrideXxxDate`（若有覆寫）都保留，不互相覆蓋 | 兩個值都要顯示，讓 Checker 能直接看出差異；明顯標示「待核准」，不能讓使用者誤認成正式生效值 |
| **Layer 3：Approve／Release（正式生效，再驗算一次）** | `APPROVED` | Checker Release 當下 | **再做一次驗算**：確認 Submit 時的計算輸入（`tenorBasis`／`tenorDays`／`sightDate`／適用行事曆）在 Submit 到 Release 之間沒有被變更，或 Calendar Snapshot 是否仍可用（查不到時走 `CALENDAR_SNAPSHOT_UNAVAILABLE`，主文件第八節已定案的例外流程，轉人工覆核，不自動判定對錯） | 只有這一步通過，`effectiveXxxDate` 才正式生效，才可供 A7／B5／報表／逾期判斷引用；畫面上要能清楚區分「還在 Layer 2 的預覽值」跟「Layer 3 已生效的正式值」 |

**這張表唯一需要業務額外確認的一點（建議跟五題一起問）**：Layer 1／Layer 2 顯示的是「試算值」「待核准值」，不是正式到期日——分行／客服人員如果在畫面上看到一個日期，會不會直接當成正式答案回覆客戶，而忽略旁邊的狀態標示？如果這個誤用風險業務評估偏高，可以考慮 Layer 1／2 用更明顯的視覺區隔（例如整排用不同底色或斜體字），不只是一個小小的狀態文字標籤。

**延伸建議（BA 額外提出，非必答，供業務參考）**：
1. **Layer 3 驗算不過時的畫面呈現**：如果 Checker Release 時發現 Submit 輸入已改變、或 Calendar Snapshot 查不到，建議畫面明確擋下 Release 並顯示具體原因（`CALENDAR_SNAPSHOT_UNAVAILABLE` 等 reasonCode），不要讓 Checker 自己猜為什麼不能核准。
2. **Layer 1 即時重算**：如果 Maker 在 Submit 前又修改了輸入（例如改了 `tenorDays`），畫面應該即時重新試算並更新顯示，不要留著舊的試算值，避免 Maker 看到的是過期的預覽。
3. **歷史查詢畫面比照辦理**：Look Up Current Balance／Inquire Events／Event Timeline 等既有查詢畫面若也顯示到期日相關欄位，建議套用同一套三層狀態標示邏輯，不要各自定義一套，避免同一筆交易在不同畫面顯示方式不一致（呼應上方「建議 UI 顯示欄位」段落已經提過的一致性原則）。

## Estimated 與正式生效日期的欄位區分（v15 新增，回應第二輪業務覆核追問「Estimated 日期如何與 `PENDING_BASE_DATE` 並存」）

上面 Layer 1 已經定案「試算值可以直接顯示」，主文件 4.4 節也已定案 `AFTER_ACCEPTANCE` 情境要標示為「Estimated Contractual Maturity Date」——但這裡還沒有回答一個更底層的問題：`PENDING_BASE_DATE` 的既有定義是「基準日尚未確認，不得計算 Contractual/Operational Maturity Date」，這句話跟「可以顯示一個試算出來的 Estimated 日期」乍看矛盾，需要說清楚兩者其實並存：

`PENDING_BASE_DATE` 禁止的是產生**正式生效**的日期，不禁止產生**僅供顯示**的估算值。資料層面必須把兩組欄位分開，不能共用：

| 資料 | `maturityDateStatus = PENDING_BASE_DATE` 時是否允許存在 |
|---|---|
| Estimated Base Date | 可以 |
| Estimated Contractual Maturity Date | 可以，僅供畫面試算顯示 |
| Estimated Operational Payment Date | 可以，僅供畫面試算顯示 |
| 正式生效的 Contractual／Operational Maturity Date | 不允許——這正是 `PENDING_BASE_DATE` 要擋的對象 |

**必須明確禁止**：Estimated 值不得供 Settlement、報表正式到期日、逾期判斷或任何正式客戶通知使用，僅能作為畫面上「先讓 Maker／Checker 有個概念」的參考值，且畫面上要用跟 Layer 1 一致的標示方式呈現，不能讓使用者誤認成正式答案。詳細範例與資料模型建議見主文件 4.4 節。

## 建議資料模型（若核准 Operational Payment Date 允許覆寫，供工程參考，非本次業務決策範圍）

**日期欄位命名統一對照表（v16 新增，回應第三輪業務覆核：主文件 4.4 節的 Estimated／Confirmed 欄位，跟這裡的 Calculated／Override／Effective 欄位分別回答兩個不同階段的問題——前者是「Base Date 還沒確認時可以顯示什麼」，後者是「Base Date 確認、系統算出結果之後，覆寫機制怎麼運作」——這裡統一整理成一張表，避免兩組欄位名稱看起來像是互相獨立、彼此矛盾）**：

| 欄位 | 業務意義 | 對應階段 |
|---|---|---|
| `estimatedBaseDate` | 預估起算日（例如 `AFTER_ACCEPTANCE` 尚未確認的預估承兌日） | `PENDING_BASE_DATE`，僅供顯示 |
| `confirmedBaseDate` | 已確認的起算日 | Base Date 確認後 |
| `estimatedContractualMaturityDate` | 依預估起算日試算的合約到期日 | `PENDING_BASE_DATE`，僅供顯示，不得用於 Settlement／報表／逾期判斷 |
| `contractualMaturityDate` | 依 Confirmed Base Date（或 `fixedMaturityDate`）計算的 Contractual Maturity Date；`PENDING_APPROVAL` 階段屬於待核准的計算結果，**不是**正式生效的答案，只有 `APPROVED` 後才正式生效（v17 修正，回應第四輪業務覆核：避免 `PENDING_APPROVAL` 的值被誤讀成已經正式生效） | `PENDING_APPROVAL`（待核准）／`APPROVED`（正式生效），唯讀、系統計算，不接受直接覆寫 |
| `estimatedOperationalPaymentDate` | 預估作業付款日 | `PENDING_BASE_DATE`，僅供顯示 |
| `calculatedOperationalPaymentDate` | Standing 微服務依已確認 Base Date 算出的作業付款日，永遠保留、不被覆蓋 | Base Date 確認後 |
| `overrideOperationalPaymentDate` | 經 Maker 提出、Checker 核准的人工調整付款日；沒有覆寫時為空 | 問題二覆寫機制（若核准） |
| `effectiveOperationalPaymentDate` | 下游（A7／報表／逾期判斷）實際引用的最終生效付款日 | 只有 `maturityDateStatus = APPROVED` 才可能有值 |

**Contractual Maturity Date 依狀態對應的 UI 標籤建議（v17 新增，回應第四輪業務覆核）**：避免 `PENDING_APPROVAL` 階段的計算結果被誤讀成「正式生效」，畫面標籤建議依 `maturityDateStatus` 分三種狀態顯示，跟上面三層顯示與驗算控制標準的 Layer 1／2／3 一一對應：

| `maturityDateStatus` | 建議 UI 標籤 |
|---|---|
| `PENDING_BASE_DATE` | Estimated Contractual Maturity Date |
| `PENDING_APPROVAL` | Calculated Contractual Maturity Date — Pending Approval |
| `APPROVED` | Contractual Maturity Date — Approved |

不論最終選哪個選項，**覆寫都不應該直接覆蓋系統算出的原始值**——需要同時保留「系統算出的值」「人工提出的覆寫值」「核准後實際生效的值」三者，否則稽核時無法回答「這筆到期日原本算出來是哪一天、被誰改成哪一天、為什麼改」：

```typescript
calculatedOperationalPaymentDate?: string;        // Standing 算出來的原始值，永遠保留、不被覆蓋；PENDING_BASE_DATE 階段 Base Date 尚未確認時可能還不存在
overrideOperationalPaymentDate?: string | null;   // 人工提出的覆寫值（尚未核准時是預覽）
effectiveOperationalPaymentDate?: string;         // 下游實際引用的值（v17 修正為 optional，回應第四輪業務覆核：型別必須跟下面公式的 undefined 分支一致）
// effectiveOperationalPaymentDate 只在 maturityDateStatus === 'APPROVED' 時才可能有值（v16 明確補上這個前提，
// 回應第三輪業務覆核：未核准的覆寫提案不能先取代原本已生效的日期，也不能在 Base Date 都還沒確認前就產生 effective 值）：
// effectiveOperationalPaymentDate =
//   maturityDateStatus === 'APPROVED'
//     ? (已核准的 override 存在 ? overrideOperationalPaymentDate : calculatedOperationalPaymentDate)
//     : undefined  // PENDING_BASE_DATE／PENDING_APPROVAL 階段沒有 effective 值，只有 Estimated／Calculated 的預覽值
```

若問題五選 (b)（Approved 之後才發起覆寫），完整的覆寫記錄建議至少包含：

```typescript
interface MaturityDateOverride {
  overrideId: string;
  acceptanceContractId: string;
  field: 'OPERATIONAL_PAYMENT_DATE';   // 問題一已業務核定選 (a)，Contractual Maturity Date 不進入覆寫範圍，這裡不需要 'CONTRACTUAL_MATURITY_DATE'（v16 移除殘留假設，見下方「這個答案會決定什麼」的對應修正）
  originalValue: string;
  proposedValue: string;
  reasonCode?: string;                 // 依問題四的答案決定是否必填
  reasonText: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  submittedBy: string;
  submittedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  sourceCalculationId: string;         // 對應原本的 standingCalculationId，可追溯回原始計算
  sourceCalendarSnapshotId: string;
}
```

## 建議 UI 顯示欄位（供前端設計參考，非本次業務決策範圍）

A6／B4 Acceptance 畫面建議至少顯示：Tenor Basis／Tenor Days／Base Date／Base Date Source／Contractual Maturity Date／Calculated Operational Payment Date／Effective Operational Payment Date／Business-Day Convention／`Maturity Date Status`（建議明顯標示，不要只顯示日期不顯示狀態，避免使用者把 `PENDING_BASE_DATE`／`PENDING_APPROVAL` 的預覽值誤認成正式到期日）／Override Indicator（是否有覆寫）／Override Reason（有覆寫時顯示）／Calendar Snapshot／Calculation ID（可放在詳細資料或稽核畫面）。

**核心欄位是否可修改（依問題一的業務已核定方向，主文件 4.4 節）**：

| 欄位 | 說明 | 是否可修改 |
|---|---|---|
| Base Date | 例如 Acceptance Date、Sight Date、BL Date、Invoice Date、Shipment Date | 可以依正確業務日期修正，須走 Maker／Checker 核准並保留異動紀錄 |
| `fixedMaturityDate`（`FIXED_MATURITY_DATE` 專屬，不屬於 Base Date） | 條款直接指定的合約到期日 | 可以修正，但須走正式 LC Amendment／Contractual Date Correction，不是 Base Date Correction |
| Contractual Maturity Date | 依 Base Date 與 Tenor 計算的合約到期日 | 唯讀，由系統計算，不接受直接輸入；依 `maturityDateStatus` 顯示不同標籤（v17 統一：`PENDING_BASE_DATE` → Estimated Contractual Maturity Date；`PENDING_APPROVAL` → Calculated Contractual Maturity Date — Pending Approval；`APPROVED` → Contractual Maturity Date — Approved，見上方「日期欄位命名統一對照表」下方的標籤建議） |
| Operational Payment Date | 經 Standing 檢查週末及假日後的實際作業日 | 原則上由系統計算；如允許人工調整（問題二），須經理由及 Maker／Checker 核准；`PENDING_BASE_DATE` 期間若有 Estimated Operational Payment Date，僅供顯示，不得作為正式撥款日 |

範例：

```text
Tenor Basis：AFTER_ACCEPTANCE
Tenor Days：90
Base Date：2026-09-01
Contractual Maturity Date：2026-11-30
Operational Payment Date：2026-12-01
```

若修改 Base Date：

```text
Base Date：2026-09-03
Contractual Maturity Date：重新計算
Operational Payment Date：Standing 重新檢查行事曆並計算
```

除了 A6／B4 輸入畫面本身，Look Up Current Balance／Inquire Events／Event Timeline Drill-Down／Current Event Snapshot／Acceptance Balance Details／A7-B5 Settlement 選擇畫面等其他既有查詢畫面，若同時顯示到期日相關欄位，應該保持同一份資料來源、同一份核准快照——歷史 Event Drill-Down 顯示的應該是該筆事件當下的日期快照，不是目前最新的 Effective Date，避免同一筆交易在不同畫面看到不一致的到期日。

## 這個答案會決定什麼

| 回答 | 對落地的影響 |
|---|---|
| 問題一（**業務已核定選 (a)**） | Contractual Maturity Date 完全不進入覆寫功能的設計範圍，覆寫功能只需要處理 Operational Payment Date 一個欄位，範圍最小 |
| 問題三選 (a)＋問題五選 (a) | 覆寫可以直接套用本文件已定案的 `MaturityDateStatus` 生命週期與既有 Maker/Checker 流程，不需要新狀態機或新角色，工程範圍最小 |
| 問題三選 (b)，或問題五選 (b)／(c) | 需要新增角色／權限判斷，或新增獨立的 `MaturityDateOverride` 狀態機，前端與後端範圍都會擴大，需要重新評估交付時程 |
| UI 唯讀顯示（不受上述問題影響） | **開發**可以立刻排入下一輪、不必等覆寫規則定案；但**正式上線**必須先完成主文件 v33 第八節的 Production Readiness Gate（Base Date 依 `tenorBasis` 差異化讀取、Contractual／Operational 分欄持久化、Calendar Snapshot），不能因為畫面做完了就繞過這些後端 Release Blocker——開發跟上線是兩件事，見下方問題六 |

## 建議預設方向總覽（若業務暫時沒有明確偏好，可先採用；仍須正式確認，不是既定結論）

| 問題 | 建議預設方向 |
|---|---|
| 問題一：Contractual Maturity Date 能否直接覆寫 | **不允許（業務已核定）**——錯了回頭修正 Base Date（Acceptance Date／Sight Date／BL Date／Invoice Date／Shipment Date），系統重新計算；`fixedMaturityDate` 不是 Base Date，修正須走正式 Amendment（見上方問題一與主文件 4.4 節） |
| 問題二：Operational Payment Date 能否覆寫 | 允許，但受控，且仍須通過行事曆／營業日檢查，例外需要特殊授權標記 |
| 問題三：覆寫的權限模型 | 沿用一般 Maker Submit → Checker Release 流程，不另設專屬角色 |
| 問題四：覆寫的原因記錄要求 | Reason Code 必填＋自由文字必填，兩者都要 |
| 問題五：覆寫的發生時機 | Acceptance CREATE Submit 階段可提出，沿用既有 `MaturityDateStatus` 生命週期；若業務另外需要 Approved 之後才覆寫，走獨立 `MaturityDateOverride` Event，不撥回 `maturityDateStatus` |
| 問題六：UI 唯讀顯示是否可獨立先上線 | **開發**可以獨立先做，不受覆寫規則影響；**正式上線**不能繞過主文件的 Production Readiness Gate（Base Date 差異化讀取等 P0 未解決前，即使畫面做完了也不能正式開放給使用者看，因為顯示的日期本身可能是錯的）；若業務要求提前部署 UI 做內部驗證，建議用 Feature Flag 限制在已完成後端驗證的範圍內，不對一般使用者開放 |

## 不在這次決策範圍內的事

- Standing 呼叫與 Maturity Date 運算邏輯本身（純運算＋呼叫 Standing 這兩段程式碼）——已完成並 live 驗證，但測試用的 Base Date 輸入本身沒有業務意義上的正確性保證，見上方背景說明
- Base Date 依 `tenorBasis` 差異化讀取（新增 `sightDate`／`blDate`／`invoiceDate`／`shipmentDate` 等欄位，或確認 `AFTER_ACCEPTANCE` 的操作定義）——`Maturity-Date-Tenor-Basis-Decision-Review.md` v33 第四、八節新增的 P0，是後端工程與業務要另外處理的缺口，不是本文件要回答的問題，但影響 UI 顯示範圍規劃（見上方背景說明）
- `assertAcceptanceSettlementAllowed()` 的 `referencedTransactionId` 來源動用 Release 檢查（含 movementType 白名單）——`Maturity-Date-Tenor-Basis-Decision-Review.md` v33 第 4.1／4.3 節的獨立議題，跟這裡的 UI／覆寫問題無關
- 假日曆資料來源／維護方式——已在 `Maturity-Date-Business-Day-Convention-Decision-Request.md` 決議由外部 Standing 微服務負責，這裡不重複討論
- Discount／Negotiation／Prepayment 等提前融資業務本身的欄位設計與核准流程——這是獨立於到期日覆寫之外的另一組業務功能，不在本文件範圍內

---

*對應規格：`analysis/A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md` §2（A6）/§3（B4）第 99、113 行的狀態標記；`Maturity-Date-Business-Day-Convention-Decision-Request.md`（同一組 A6/B4 條目，前一個已回覆的決策請求）；`Maturity-Date-Tenor-Basis-Decision-Review.md` v33 第一、四、八、十節（Contractual／Operational 分離的既有立場、`MaturityDateStatus` 生命週期、Base Date 尚未依 `tenorBasis` 差異化的 P0、本次查證發現與建議的狀態標記拆分）。*
