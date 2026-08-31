# Balance Component Current Behavior

本文件是現行功能的快速基準，更新日期為 2026-08-31。詳細公式以 `balance-business-rules.md`、兩份 OAS 與自動化測試為準；歷史提案和 `docs/plans/` 不覆蓋本文件。

Web Component現況：Angular source由 `<balance-component-app>`重用，具 version 1 DOM contract、
Shadow DOM、instance-local theme、Angular/React/Vue薄 adapters及可驗證 package。權威導覽為
[web-component.md](web-component.md)。Phase 1–6不改 HTTP contract、認證或 Balance business rules。

## Business lifecycle

| Flow                            | Approved prerequisite                            | Downstream function                   |
| ------------------------------- | ------------------------------------------------ | ------------------------------------- |
| Import Sight                    | A3／A3S Checker Approved，UTILIZE 維持 EARMARKED | A4 Sight Settlement                   |
| Import Seller's／Buyer's Usance | A3／A3S Checker Approved，UTILIZE 維持 EARMARKED | A6 Acceptance，之後 A7 Settlement     |
| Export Confirmed LC             | B3 Checker Released，presentation 維持可被消耗   | B4 Honour／Acceptance，Usance 後續 B5 |

A4、A6、B4 不得繞過 prerequisite eligibility。Business Case Runner 的 Run All 最後會額外建立並保留一筆 A4-ready、一筆 A6-ready 與一筆 B4-ready 記錄，供人工測試。

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
- A3S、A6、B4、B5 等多腿事件的建立／Release 使用 `/balance-movements/compound*`，由 SQLite transaction 保證全部成功或全部回滾。
- Fix Pending 修改原 movement 並保留 audit。A4、A6、A7、A9、B4、B5 採 Remarks-only：只能修改 Remark，不得改變金額、Balance、Account Entries 或 compound sibling。
- Fix Pending 開始、送出及成功回覆時會清除先前的 Maker submit error；成功的 A7 Remarks-only Save 不得繼續顯示舊的 `BAL-UI-UNEXPECTED`。此行為在 Angular host 與 Web Component host 一致。
- 所有 A1-A11／B1-B7 在 Checker Release 成功後都重設同一 Function 的 Maker／Checker 畫面，清除舊 movement、Maker Result 與 Fix/Delete Pending signals；已 RELEASED 的 movement 不得再次進入 Fix Pending。Angular 與 Web Component host 行為一致；Reject 仍保留 Maker 資料供修正。
- Transaction Processing 的 Maker Submit 成功後，A1-A11／B1-B7 均可在同一 session 執行 Delete Pending；這不會改變 Maker Queue／Fix Pending 的獨立流程。
- A1／B1 Confirm Delete Pending 成功後重設為新的 natural-key 輸入；其他 Function 回到各自的 Transaction Index。
- A4 的 Delete Pending 是撤回 Maker Submit，使用 `/withdraw-maker-submit`，不得取消其 A3／A3S source movement。
- 其他 Function 使用 `/cancel`。A3S、B4、B5 依 strategy 先取消 sibling legs、最後取消 primary leg；目前是多次單筆 API 呼叫，**不是原子 batch cancel**。任一步失敗時停止後續呼叫、保留畫面並顯示實際錯誤。

## Inquiry error handling

- Angular host 與 Web Component host 對 GET／HEAD／OPTIONS 的暫時性失敗會自動重試；`.env` 預設 `BALANCE_HTTP_RETRY_COUNT=3`、`BALANCE_HTTP_RETRY_INITIAL_DELAY_MS=250`、`BALANCE_HTTP_RETRY_MAX_DELAY_MS=2000`，採 bounded exponential backoff。
- 自動重試僅適用於 network/status 0、408、429 與 5xx。Submit、Approve、Fix/Delete Pending 等 POST command 絕不自動重送，以避免重複交易或 Account Entries。
- Maker Queue、Inquire Events 與 Inquire Delete Pending 會保留原始 HTTP error status，再交由共用 presenter 分類。
- Maker Submit 同樣保留 raw error cause；Angular 與 Web Component host 對 HTTP 5xx 顯示 `BAL-SVC-HTTP-{status}`，network/status 0 顯示 Balance service unavailable，而非誤標為 `BAL-UI-UNEXPECTED`。
- Maker Submit 的本地 validation 顯示 `Check transaction details`；HTTP 400／422 顯示可安全呈現的 business validation reason，401／403／404 與其他 4xx 各有明確分類。這項共用 policy 適用 A1-A11／B1-B7、Angular host 與 Web Component host，複合與單筆 submission 的同步例外也會轉為同一個 failed outcome。
- Network／status `0` 顯示 Balance service unavailable；HTTP `5xx` 顯示 temporarily unavailable，support code 使用 `BAL-SVC-HTTP-{status}`。
- `BAL-UI-UNEXPECTED` 僅保留給沒有可辨識 HTTP status 或技術代碼的 client-side failure。Retry 保留原搜尋條件。

## Service architecture

`BalanceService` 是 routes 的 compatibility façade。讀取、snapshot、contract resolution、request validation、release policy／side effects、lifecycle eligibility／sweep 分別由 `src/service/` 的 focused collaborators 負責；transaction boundary 仍由 `BalanceService`／`UnitOfWork` 控制。

## Verification baseline

截至 2026-08-31：Checker Release reset 變更後 WC 驗證為 63 suites／1,781 tests，coverage 97.85%／95.10%／96.36%／98.31%。OAS wire 與 Web Component DOM contract 均未變。Backend Runner 57 與 Balance microservice 784 是前次 2026-08-30 基準，本次未重新執行。
