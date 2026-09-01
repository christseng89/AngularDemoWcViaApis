# Balance Component Current Behavior

本文件是現行功能的快速基準，更新日期為 2026-09-01。詳細公式以 `balance-business-rules.md`、兩份 OAS 與自動化測試為準；歷史提案和 `docs/plans/` 不覆蓋本文件。

Web Component現況：Angular source由 `<balance-component-app>`重用，具 version 1 DOM contract、
Shadow DOM、instance-local theme、Angular/React/Vue薄 adapters及可驗證 package。權威導覽為
[web-component.md](web-component.md)。Phase 1–6不改 HTTP contract、認證或 Balance business rules。

## Business lifecycle

| Flow                            | Approved prerequisite                            | Downstream function                   |
| ------------------------------- | ------------------------------------------------ | ------------------------------------- |
| Import Sight                    | A3／A3S Checker Approved，UTILIZE 維持 EARMARKED | A4 Sight Settlement                   |
| Import Seller's／Buyer's Usance | A3／A3S Checker Approved，UTILIZE 維持 EARMARKED | A6 Acceptance，之後 A7 Settlement     |
| Export Confirmed LC             | B3 Checker Released，presentation 維持可被消耗   | B4 Honour／Acceptance，Usance 後續 B5 |

A3S、A4、A6、A7、B4、B5 不得繞過 prerequisite eligibility。Business Case Runner 的 Run All 最後以六個 readiness cases 各建立一個母 LC／Confirmation，並在該母契約下保留三筆符合各 Index 狀態條件的子交易：A3S `G01–G03`、A4/A6 `B01–B03`、A7/B5 `IB0001–IB0003`、B4 `E01–E03`。同一母契約可同時擁有多筆 secondary-reference 交易，各筆生命週期狀態獨立。

Transaction Index 只負責呈現候選項。A2–A11／B2–B7 的 API 會重新解析並驗證目前 contract status；A6 另驗證同 LC 的 acknowledged、PENDING、尚未 Maker Submit 的 A3／A3S，B4 另驗證同 Confirmation 的 RELEASED、未消耗且未被其他 pending B4 佔用的 B3。Checker Release 會再以最新狀態驗證；A6 原子 Release 允許來源仍為 PENDING，或已在同一複合動作中先轉為 RELEASED，不能依賴較早的 Index snapshot。

Business Case Runner 每步都檢查 Tight Available Balance。若測試回覆出現負值，Import 會透過既有 API 自動建立及釋放 A02／`AMEND_INCREASE`，Export 會建立及釋放 B02／`AMEND`，再讀取 snapshot 確認已回復非負。Cleanup Database 成功後會清除先前的單一案例、Run All 結果卡及錯誤訊息。

## Tight LC Balance

- Tight Available Balance 不得為負數；Domain calculation 將可用承諾額與未結表外風險一致納入。
- A2／B2 Decrease 必須滿足 `Amount <= Tight Available Balance`。
- A3／A8／B3 使用 Tight Available Balance 進行權威 sufficiency check。
- A3S 的上限為 `Tight Available Balance + selected SG outstanding`，並要求 Document Arrival Amount 足以覆蓋所選 SG redemption。
- UI Submit、Maker Submit API 與 Checker Release 都執行相應檢查；服務端檢查是權威控制。

## Transaction Index

選交易時每頁 10 筆，搜尋、排序和分頁由共享 Index 行為處理。需要 LC 與 Secondary Reference 的功能必須在同一列一次選定，避免先選 LC 後選錯子交易。

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
- Fix Pending 開始、送出及成功回覆時會清除先前的 Maker submit error；成功的 A7 Remarks-only Save 不得繼續顯示舊的 `BAL-UI-UNEXPECTED`。此行為在 Angular host 與 Web Component host 一致。
- 所有已註冊功能（A1、A2、A3、A3S、A4、A6–A11、B1–B7）在 Checker Release 成功後都重設同一 Function 的 Maker／Checker 畫面，清除舊 movement、Maker Result 與 Fix/Delete Pending signals；已 RELEASED 的 movement 不得再次進入 Fix Pending。Angular 與 Web Component host 行為一致；Reject 仍保留 Maker 資料供修正。
- Transaction Processing 的 Maker Submit 成功後，所有已註冊功能均可在同一 session 執行 Delete Pending；這不會改變 Maker Queue／Fix Pending 的獨立流程。
- A1／B1 Confirm Delete Pending 成功後重設為新的 natural-key 輸入；其他 Function 回到各自的 Transaction Index。
- A4 的 Delete Pending 是撤回 Maker Submit，使用 `/withdraw-maker-submit`，不得取消其 A3／A3S source movement。
- 其他 Function 使用 `/cancel`。A3S、B4 依 strategy 先取消 sibling legs、最後取消 primary leg；目前是多次單筆 API 呼叫，**不是原子 batch cancel**。任一步失敗時停止後續呼叫、保留畫面並顯示實際錯誤。

## Inquiry error handling

- Angular host 與 Web Component host 對 GET／HEAD／OPTIONS 的暫時性失敗會自動重試；`.env` 預設 `BALANCE_HTTP_RETRY_COUNT=3`、`BALANCE_HTTP_RETRY_INITIAL_DELAY_MS=250`、`BALANCE_HTTP_RETRY_MAX_DELAY_MS=2000`，採 bounded exponential backoff。
- 自動重試僅適用於 network/status 0、408、429 與 5xx。Submit、Approve、Fix/Delete Pending 等 POST command 絕不自動重送，以避免重複交易或 Account Entries。
- Maker Queue、Inquire Events 與 Inquire Delete Pending 會保留原始 HTTP error status，再交由共用 presenter 分類。
- Maker Submit 同樣保留 raw error cause；Angular 與 Web Component host 對 HTTP 5xx 顯示 `BAL-SVC-HTTP-{status}`，network/status 0 顯示 Balance service unavailable，而非誤標為 `BAL-UI-UNEXPECTED`。
- Maker Submit 的本地 validation 顯示 `Check transaction details`；HTTP 400／422 顯示可安全呈現的 business validation reason，401／403／404 與其他 4xx 各有明確分類。這項共用 policy 適用所有已註冊功能、Angular host 與 Web Component host，複合與單筆 submission 的同步例外也會轉為同一個 failed outcome。
- Network／status `0` 顯示 Balance service unavailable；HTTP `5xx` 顯示 temporarily unavailable，support code 使用 `BAL-SVC-HTTP-{status}`。
- `BAL-UI-UNEXPECTED` 僅保留給沒有可辨識 HTTP status 或技術代碼的 client-side failure。Retry 保留原搜尋條件。

## Service architecture

`BalanceService` 是 routes 的 compatibility façade。讀取、snapshot、contract resolution、request validation、release policy／side effects、lifecycle eligibility／sweep 分別由 `src/service/` 的 focused collaborators 負責；transaction boundary 仍由 `BalanceService`／`UnitOfWork` 控制。

## Verification baseline

截至 2026-09-01：Transaction Index API eligibility 變更後 Balance microservice 為 39 suites／791 tests；coverage statements 98.79%、branches 95.06%、functions 99.75%、lines 99.32%。Web Component host 使用相同 API eligibility。
