# Balance Component Current Behavior

本文件是現行功能的快速基準，更新日期為 2026-09-03。詳細公式以 `balance-business-rules.md`、兩份 OAS 與自動化測試為準；歷史提案和 `docs/plans/` 不覆蓋本文件。

Web Component現況：Angular source由 `<balance-component-app>`重用，具 version 1 DOM contract、
Shadow DOM、instance-local theme、Angular/React/Vue薄 adapters及可驗證 package。權威導覽為
[web-component.md](web-component.md)。Phase 1–6不改 HTTP contract、認證或 Balance business rules。

Balance Account Number 是獨立 Angular 與 WC 的第一個 view。11 組固定 Product／Risk Class 路由各自維護 Account A/B；SQLite 為執行期真實來源，JSON 只 seed 空資料庫。新 movement 將當時的科目號、說明與 mapping version 寫入 immutable `contingentAccountEntry`，後續配置變更不追溯歷史 voucher。格式由 `.env` regex 與 min/max length 控制，MIN=MAX 代表固定長度。詳見 [Balance Account Number 維護與 API](balance-account-number-maintenance.md)。

## Business lifecycle

| Flow                            | Approved prerequisite                            | Downstream function                   |
| ------------------------------- | ------------------------------------------------ | ------------------------------------- |
| Import Sight                    | A3／A3S Checker Approved，UTILIZE 維持 EARMARKED | A4 Sight Settlement                   |
| Import Seller's／Buyer's Usance | A3／A3S Checker Approved，UTILIZE 維持 EARMARKED | A6 Acceptance，之後 A7 Settlement     |
| Export Confirmed LC             | B3 Checker Released，presentation 維持可被消耗   | B4 Honour／Acceptance，Usance 後續 B5 |

A3S、A4、A6、A7、B4、B5 不得繞過 prerequisite eligibility。Business Case Runner 的 Run All 最後以六個 readiness cases 各建立一個母 LC／Confirmation，並在該母契約下保留三筆符合各 Index 狀態條件的子交易：A3S `G01–G03`、A4/A6 `B01–B03`、A7/B5 `IB0001–IB0003`、B4 `E01–E03`。同一母契約可同時擁有多筆 secondary-reference 交易，各筆生命週期狀態獨立。

Transaction Index 只負責呈現候選項。A2–A11／B2–B7 的 API 會重新解析並驗證目前 contract status；A6 另驗證同 LC 的 acknowledged、PENDING、尚未 Maker Submit 的 A3／A3S，B4 另驗證同 Confirmation 的 RELEASED、未消耗且未被其他 pending B4 佔用的 B3。Checker Release 會再以最新狀態驗證；A6 原子 Release 允許來源仍為 PENDING，或已在同一複合動作中先轉為 RELEASED，不能依賴較早的 Index snapshot。

B3（`EPLC_EXAMINATION/CREATE`）在建立時持久化內部 memo voucher：Dr `Export Bills — Received, Under Examination (memo)`／Cr `Export Bills — Contra (memo)`。Maker Submit 後顯示 `EARMARKING`，Checker Release 後顯示 `EARMARKED`，Maker、Checker 與 Inquiry 均可檢視同一份 immutable `contingentAccountEntry`。B3 的 `exposureNature=MEMO`，因此外送會計 payload `accountEntries` 固定為 `null`；虛帳不送 Accounting，也不建立 reversal。

Business Case Runner 每步都檢查 Tight Available Balance。若測試回覆出現負值，Import 會透過既有 API 自動建立及釋放 A02／`AMEND_INCREASE`，Export 會建立及釋放 B02／`AMEND`，再讀取 snapshot 確認已回復非負。Cleanup Database 成功後會清除先前的單一案例、Run All 結果卡及錯誤訊息，並以預設每 2 秒一次、最多 15 次的低頻 GET 檢查等待 backend 恢復；等待期間操作按鈕停用，恢復後自動重載 case index。Cleanup POST 不會自動重送。Browser Refresh 只檢查 backend 一次，失敗後由使用者按 `Try again`，不進入自動 polling。

## Tight LC Balance

- Tight Available Balance 的操作目標不得為負數；Domain calculation 將可用承諾額與未結表外風險一致納入，
  但 snapshot 可暫時保留負值作為 over-commit 診斷並觸發 A02／B02 修復。
- A2／B2 Decrease 必須滿足 `Amount <= Tight Available Balance`。
- A3／A8／B3 使用 Tight Available Balance 進行權威 sufficiency check。
- A3S 的上限為 `Tight Available Balance + selected SG outstanding`，並要求 Document Arrival Amount 足以覆蓋所選 SG redemption。
- UI Submit、Maker Submit API 與 Checker Release 都執行相應檢查；服務端檢查是權威控制。

## Amendment Amount／Tolerance

- A1／B1 的初始 Tolerance 與 A2／B2 的 Tolerance Change 都必須是非負整數，Angular 與 API 使用相同拒絕規則。
- A2／B2 同時支援 Amount Increase／Decrease 與 Tolerance Increase／Decrease；Request 使用
  `toleranceChangePct` + `toleranceChangeDirection`。PENDING Response 的 `tolerancePct` 是舊核准值；交易本身保存 change，
  Checker Release 後 Movement／Contract `tolerancePct` 才是後端計算的最終值。
- A2／B2 可只改 Amount、只改 Tolerance，或兩者同時修改。畫面上的 Amount 因此為 optional；只改
  Tolerance 時 API 仍傳必填 decimal string `amount: "0"`。Amount 為 0 且 Tolerance Change 未輸入或為 0
  屬 no-op，UI 與微服務都拒絕。
- MT707 的 Tolerance 是修證後最終值；它由上游 SWIFT／業務編排層換算成 Balance Component change，
  不可直接當作 `toleranceChangePct`。
- 每次 monetary amendment 都以完整合約重算：`新面額 = 舊面額 + Increase - Decrease`，
  `新上限 = round(新面額 × (1 + 新Tolerance/100))`，實際 Balance／Account Entry 金額是
  `新上限 - 舊上限`。因此名義 Increase 在 Tolerance 大幅下降時也可能降低 exposure，反之亦然。
- 舊上限與新上限各自依交易幣別小數位採 `ROUND_HALF_UP` 後才相減；JPY 0 位、USD 2 位、KWD 3 位。
- Maker Submit 時新的 Tolerance 只保存在 movement，合約仍保留舊值；Checker Release 依最新 RELEASED history
  重新計算，若基準已被另一筆 amendment 改變便拒絕 stale movement。Release 成功後才把新 Tolerance 寫入 contract。
- `AMEND_EXPIRY_DATE` 不顯示／接受 Tolerance，也不改變合約 Tolerance。外部 Maker request 的
  `amount` 固定為 `"0"`；ACTIVE 合約仍是零金額純日期事件。EXPIRED 合約則由伺服器尋找最後一筆
  RELEASED EXPIRE，將其受保護的恢復金額、reference 與 Account Entries 寫入同一筆 PENDING Amendment；
  CANCELLED／REJECTED 的舊嘗試不參與判斷。PENDING 不恢復餘額，Checker Release 後才恢復
  Confirmed／Tight Available Balance 並轉回 ACTIVE，不另建隱藏 REVERSAL。
- A2／B2 選取 Direction 與 LC 後，Transaction Input 不再重複顯示 LC Number，也不再顯示可修改的
  Direction 下拉選單；改以醒目的 `Amendment Direction — Increase／Decrease／Expiry Date` 唯讀標示
  保留上下文。若選錯方向，使用 Cancel 回到 Selection Screen 重新選擇。
- UCP 600 Article 10 的修改同意流程屬上游 Trade Finance workflow；Balance Component 的責任是 Maker／Checker
  放行前不讓新金額／Tolerance 生效。Article 30 的 amount tolerance 與 quantity tolerance 不混用。
- 為配合既有測試修復流程，Snapshot 仍保留負的 Tight Balance 作為 over-commit 診斷；負值不是可用額，
  Business Case Runner 會依既有規則產生 A02／B02 修復交易。

## Amount shorthand input

- 所有可編輯 Amount 欄位可輸入大小寫 `h`（百）、`k`（千）與 `m`（百萬），多段採相加：
  `20.5h = 2050`、`3h2h = 500`、`1m2k3h = 1002300`、`40k2k = 42000`、
  `1.5m2.5k = 1502500`、`1m500 = 1000500`、`1h.25 = 100.25`、`1k.25 = 1000.25`。
- A1 與所有其他可輸入金額的功能使用完全相同的 `formatted-amount` 元件、驗證及 Submit-before-blur
  正規化；目前涵蓋 A1、A2 Increase／Decrease、A3、A3S、A7 Partial Settle、A8、B1、B2
  Increase／Decrease、B3、B5 Partial Settle。系統帶入的唯讀金額不視為輸入欄位。
- `t`、負數、逗號、科學記號、空白與 malformed decimal 會在欄位層被拒絕；系統帶入／protected Amount 不解析 shorthand。
- Blur 後以 decimal-string exact arithmetic 展開，再交給既有 Currency decimal-place、rounding、Balance 與 Submit 檢查；API/OAS 仍只接收標準 MonetaryAmount decimal string。
- 輸入期間的 Available／Tight Available 警告也先使用同一個 parser：例如 `500k` 會以 `500000`
  比較，不會因 JavaScript `Number('500k')` 是 `NaN` 而誤報超額；無效 shorthand 只顯示欄位驗證錯誤。
- Available／Tight Available 是「用戶可輸入 Amount」的即時提示。由索引交易或服務端帶入的
  protected Amount 不再顯示 `Typed amount` 警告；例如 A4 的金額取自已選 Document Arrival，該筆
  earmark 由 release 規則結算，不會因目前 Available 已為 `0` 而在 Angular 畫面誤報。

## Transaction Index

選交易時每頁 10 筆，搜尋、排序和分頁由共享 Index 行為處理。需要 LC 與 Secondary Reference 的功能必須在同一列一次選定，避免先選 LC 後選錯子交易。共用 Index Picker 的 Ref 欄位比 Catalog／Status 寬，四欄與五欄 layout 各有 responsive grid 比例；若寬度仍不足而縮略，滑鼠移入 Ref 可透過 native tooltip 讀取完整值。

| Function                             | Index identity        | Amount column               |
| ------------------------------------ | --------------------- | --------------------------- |
| A3S                                  | LC Number + SG Number | SG Amount                   |
| A6                                   | LC Number + IB Number | IB Amount                   |
| B4                                   | LC Number + EB Number | EB Amount                   |
| A4／A7                               | LC Number + IB Number | Existing transaction amount |
| B5                                   | LC Number + EB Number | Existing transaction amount |
| A2、A3、A8、A10、A11、B2、B3、B6、B7 | LC Number             | Tight LC Balance            |

當 Transaction Processing 尚未選取 Function 時，不顯示 Maker、Checker 或 Look Up panels。

## Maker／Checker and compound events

- Maker／Checker separation、狀態轉換、金額與 eligibility 都由微服務重新驗證。
- A3S、A6、B4 等多腿事件的建立／Release 使用 `/balance-movements/compound*`，由 SQLite transaction 保證全部成功或全部回滾。B5 只結算所選 Acceptance。
- Fix Pending 修改原 movement 並保留 audit。A4、A6、A7、A9、B4、B5 採 Remarks-only：只能修改 Remark，不得改變金額、Balance、Account Entries 或 compound sibling。
- Action Bar 的 workflow mode 優先於 Function 的專用 Submit mode。A4 進入 Fix Pending 時只顯示 `Save Fix Pending`／`Cancel`，進入 Delete Pending review 時只顯示 Confirm／Cancel；不得殘留已 disabled 的 `Submit A4`。同一規則以 Function Registry 矩陣覆蓋全部 A1–A11／B1–B7。
- Standard Fix Pending 成功時會在同一個 DB transaction 重新計算並覆寫 movement 的 Event／Root／Sibling snapshots；Inquire Events 立即顯示修正後的 PENDING Balance，不必等 Checker Release。Inquire Events 與 Transaction Processing Current Balance 的 A2／B2 都額外顯示 Amendment 自己的 tolerance-adjusted Balance Effect 及 `Amendment Tolerance` 的歷史生效值→交易值；PENDING 顯示 `Pending Amendment Balance Effect`，RELEASED 則顯示 `Amendment Balance Effect`（例如 Decrease `20% → 15%`）。同一 LC 有多筆 pending amendment 時逐筆依 Reference 顯示，不任意合併。`Pending Earmark Total` 仍是同一合約全部 PENDING movement 的淨額。
- Fix Pending 開始、送出及成功回覆時會清除先前的 Maker submit error；成功的 A7 Remarks-only Save 不得繼續顯示舊的 `BAL-UI-UNEXPECTED`。此行為在 Angular host 與 Web Component host 一致。
- 所有已註冊功能（A1、A2、A3、A3S、A4、A6–A11、B1–B7）在 Checker Release 成功後都重設同一 Function 的 Maker／Checker 畫面，清除舊 movement、Maker Result 與 Fix/Delete Pending signals；已 RELEASED 的 movement 不得再次進入 Fix Pending。Angular 與 Web Component host 行為一致；Reject 仍保留 Maker 資料供修正。
- Transaction Processing 的 Maker Submit 成功後，所有已註冊功能均可在同一 session 執行 Delete Pending；這不會改變 Maker Queue／Fix Pending 的獨立流程。
- A1／B1 Confirm Delete Pending 成功後重設為新的 natural-key 輸入；其他 Function 回到各自的 Transaction Index。
- A4 的 Delete Pending 是撤回 Maker Submit，使用 `/withdraw-maker-submit`，不得取消其 A3／A3S source movement。
- 其他 Function 使用 `/cancel`。A3S、B4 依 strategy 先取消 sibling legs、最後取消 primary leg；目前是多次單筆 API 呼叫，**不是原子 batch cancel**。任一步失敗時停止後續呼叫、保留畫面並顯示實際錯誤。

## Inquiry error handling

- Inquire Events 的目前選取列以持續的藍色邊框／背景與 `aria-selected` 標示，讓使用者能直接對照下方 Detail。列 identity 使用 `movementId + phase`，避免 A4 共用 movement 的 create/finalize 兩列同時被標示；滑鼠、Enter 與 Space 都可選取。
- Angular host 與 Web Component host 對 GET／HEAD／OPTIONS 的暫時性失敗會自動重試；`.env` 預設 `BALANCE_HTTP_RETRY_COUNT=3`、`BALANCE_HTTP_RETRY_INITIAL_DELAY_MS=250`、`BALANCE_HTTP_RETRY_MAX_DELAY_MS=2000`，採 bounded exponential backoff。
- 自動重試僅適用於 network/status 0、408、429 與 5xx。Submit、Approve、Fix/Delete Pending 等 POST command 絕不自動重送，以避免重複交易或 Account Entries。
- Maker Queue、Inquire Events 與 Inquire Delete Pending 會保留原始 HTTP error status，再交由共用 presenter 分類。
- Maker Queue、Inquire Events 與 Inquire Delete Pending 的正常無資料狀態共用 `FeedbackMessageComponent` 藍色資訊卡；只有使用者輸入搜尋條件後無匹配資料才顯示 warning，transport/service error 仍顯示 error。
- Maker Submit 同樣保留 raw error cause；Angular 與 Web Component host 對 HTTP 5xx 顯示 `BAL-SVC-HTTP-{status}`，network/status 0 顯示 Balance service unavailable，而非誤標為 `BAL-UI-UNEXPECTED`。
- Checker Approve／Release／Reject 也保留原始 HTTP status、business code 與 cause；plain A1–A11／B1–B7
  及 A3S／A6／B4 compound orchestration 都交由共用 feedback policy 分類。服務重建造成的 status 0、
  backend 5xx 與 409 stale transaction 不再因先轉為字串而誤標 `BAL-UI-UNEXPECTED`；本地 A4
  「尚未 Maker Submit」gate 則顯示 validation warning，不冒充 API failure。
- Maker Submit 的本地 validation 顯示 `Check transaction details`；HTTP 400／422 顯示可安全呈現的 business validation reason，401／403／404 與其他 4xx 各有明確分類。這項共用 policy 適用所有已註冊功能、Angular host 與 Web Component host，複合與單筆 submission 的同步例外也會轉為同一個 failed outcome。
- Network／status `0` 顯示 Balance service unavailable；HTTP `5xx` 顯示 temporarily unavailable，support code 使用 `BAL-SVC-HTTP-{status}`。
- `BAL-UI-UNEXPECTED` 僅保留給沒有可辨識 HTTP status 或技術代碼的 client-side failure。Retry 保留原搜尋條件。

## Service architecture

`BalanceService` 是 routes 的 compatibility façade。讀取、snapshot、contract resolution、request validation、release policy／side effects、lifecycle eligibility／sweep 分別由 `src/service/` 的 focused collaborators 負責；transaction boundary 仍由 `BalanceService`／`UnitOfWork` 控制。

## Verification baseline

截至 2026-09-03：Balance microservice 為 40 suites／837 tests；coverage statements 98.18%、branches 95.03%、functions 99.32%、lines 98.92%。Web Component host 使用相同 API eligibility。

2026-09-02：`lc-balance-wc` 是目前唯一維護中的 Balance UI repository；舊 `lc-balance` folder 已移除。Standalone Angular 的 root route 使用 `pathMatch: 'full'`，因此 `/business-cases` 不再被空路徑的 Transaction Builder route 攔截；Web Component 仍以內部 view state 導覽三個 views。

2026-09-03：新增同一 LC／Confirmation 上連續四種 Amount × Tolerance amendment 組合的
`import-case-16`／`export-case-15`，並補上 currency-scale、Expiry-only、Maker／Checker 生效時點與 stale-release regression。
EXPIRED Expiry Date retry 另覆蓋「先前 CANCELLED Amendment 不得遮蔽 RELEASED EXPIRE」與
「Checker Release 前恢復依據被改動時拒絕」兩個回歸案例。
