# Balance Component Current Behavior

本文件是現行功能的快速基準，更新日期為 2026-08-30。詳細公式以 `balance-business-rules.md`、兩份 OAS 與自動化測試為準；歷史提案和 `docs/plans/` 不覆蓋本文件。

## Business lifecycle

| Flow | Approved prerequisite | Downstream function |
| --- | --- | --- |
| Import Sight | A3／A3S Checker Approved，UTILIZE 維持 EARMARKED | A4 Sight Settlement |
| Import Seller's／Buyer's Usance | A3／A3S Checker Approved，UTILIZE 維持 EARMARKED | A6 Acceptance，之後 A7 Settlement |
| Export Confirmed LC | B3 Checker Released，presentation 維持可被消耗 | B4 Honour／Acceptance，Usance 後續 B5 |

A4、A6、B4 不得繞過 prerequisite eligibility。Business Case Runner 的 Run All 最後會額外建立並保留一筆 A4-ready、一筆 A6-ready 與一筆 B4-ready 記錄，供人工測試。

## Tight LC Balance

- Tight Available Balance 不得為負數；Domain calculation 將可用承諾額與未結表外風險一致納入。
- A2／B2 Decrease 必須滿足 `Amount <= Tight Available Balance`。
- A3／A8／B3 使用 Tight Available Balance 進行權威 sufficiency check。
- A3S 的上限為 `Tight Available Balance + selected SG outstanding`，並要求 Document Arrival Amount 足以覆蓋所選 SG redemption。
- UI Submit、Maker Submit API 與 Checker Release 都執行相應檢查；服務端檢查是權威控制。

## Transaction Index

選交易時每頁 10 筆，搜尋、排序和分頁由共享 Index 行為處理。需要 LC 與 Secondary Reference 的功能必須在同一列一次選定，避免先選 LC 後選錯子交易。

| Function | Index identity | Amount column |
| --- | --- | --- |
| A3S | LC Number + SG Number | SG Amount |
| A6 | LC Number + IB Number | IB Amount |
| B4 | LC Number + EB Number | EB Amount |
| A4／A7 | LC Number + IB Number | Existing transaction amount |
| B5 | LC Number + EB Number | Existing transaction amount |
| A2、A3、A8、A10、A11、B2、B3、B6、B7 | LC Number | Tight LC Balance |

當 Transaction Processing 尚未選取 Function 時，不顯示 Maker、Checker 或 Look Up panels。

## Maker／Checker and compound events

- Maker／Checker separation、狀態轉換、金額與 eligibility 都由微服務重新驗證。
- A3S、A6、B4、B5 等多腿事件使用 `/balance-movements/compound*`，由 SQLite transaction 保證全部成功或全部回滾。
- Fix Pending 修改原 movement 並保留 audit。A4、A6、A7、A9、B4、B5 採 Remarks-only：只能修改 Remark，不得改變金額、Balance、Account Entries 或 compound sibling。
- Cancel／Delete Pending 必須同步處理同一 compound business event 的相關 legs。

## Service architecture

`BalanceService` 是 routes 的 compatibility façade。讀取、snapshot、contract resolution、request validation、release policy／side effects、lifecycle eligibility／sweep 分別由 `src/service/` 的 focused collaborators 負責；transaction boundary 仍由 `BalanceService`／`UnitOfWork` 控制。

## Verification baseline

截至 2026-08-30：Angular 1,625、Backend Runner 57、Balance microservice 784，共 2,466 tests 通過；Angular production build 成功。這是文件同步時的基準，不代表未來變更可以省略重新驗證。
