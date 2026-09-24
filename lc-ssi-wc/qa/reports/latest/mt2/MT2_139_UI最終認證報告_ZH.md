# MT2 139 案瀏覽器 UI 全量測試報告

## 結論

- 執行政策：單一乾淨 Browser Context、一次不中斷執行全部 139 案；不拼接局部重跑。
- 執行通道：Playwright 操作 localhost UI 的 Preview Resolution；由瀏覽器送出每案受控 request，curl/API runner 不作為替代結果。
- 執行結果：139/139 通過；產品／環境失敗 0；規格阻擋 0。
- 驗收狀態：PASS。
- 中斷狀態：無。

## UI 控制驗證

- ✅ Portal startup health check returned HTTP 2xx
- ✅ Bank Service startup health check returned HTTP 200
- ✅ Payment Message Index startup health check returned HTTP 200
- ✅ MT200 appears in Payment Message Index
- ✅ MT201 appears in Payment Message Index
- ✅ MT202 appears in Payment Message Index
- ✅ MT202COV appears in Payment Message Index
- ✅ MT203 appears in Payment Message Index
- ✅ MT204 appears in Payment Message Index
- ✅ MT205 appears in Payment Message Index
- ✅ MT205COV appears in Payment Message Index
- ✅ MT210 appears in Payment Message Index
- ✅ CREDIT_ONE_OF_SEVERAL_AT_57A is a separate Message Scenario Index option
- ✅ CREDIT_ONE_OF_SEVERAL_AT_57A exposes governed control Own credit account
- ✅ CREDIT_ONE_OF_SEVERAL_AT_57A exposes governed control Account With Institution
- ✅ CREDIT_ONE_OF_SEVERAL_AT_57A Account With Institution is selected or read-only, never manual BIC input
- ✅ BOOK_TRANSFER_SAME_RECEIVER is a separate Message Scenario Index option
- ✅ BOOK_TRANSFER_SAME_RECEIVER exposes governed control Own debit account
- ✅ BOOK_TRANSFER_SAME_RECEIVER exposes governed control Own credit account
- ✅ BOOK_TRANSFER_SAME_RECEIVER exposes governed control Receiver Bank
- ✅ BOOK_TRANSFER_SAME_RECEIVER Receiver Bank is selected or read-only, never manual BIC input
- ✅ SENDER_BENEFICIARY_DIRECT_DEBIT is a separate Message Scenario Index option
- ✅ SENDER_BENEFICIARY_DIRECT_DEBIT exposes governed control Direct Debit mandate
- ✅ SENDER_BENEFICIARY_DIRECT_DEBIT exposes governed control Sender BIC
- ✅ INITIAL_MT200_201_EQUIVALENCE is a separate Message Scenario Index option
- ✅ INITIAL_MT200_201_EQUIVALENCE exposes governed control Previous MT200/201 context
- ✅ INITIAL_MT200_201_EQUIVALENCE exposes governed control 52a Ordering Institution
- ✅ INITIAL_MT200_201_EQUIVALENCE 52a Ordering Institution is selected or read-only, never manual BIC input
- ✅ INITIAL_MT200_201_EQUIVALENCE exposes governed control 58a Beneficiary Institution
- ✅ INITIAL_MT200_201_EQUIVALENCE 58a Beneficiary Institution is selected or read-only, never manual BIC input
- ✅ Bank Service returned selectable identities
- ✅ Counterparty BIC is selected through Bank Service
- ✅ Counterparty selector submits bankServiceId rather than raw BIC
- ✅ No editable BIC input is exposed

## 失敗／阻擋案例

| Test Case | 類型 | 差異 |
| --- | --- | --- |
| — | 無 | — |

## 可稽核證據

- Machine-readable report：`qa/reports/latest/mt2/mt2-139-ui-final-results.json`
- Workbook SHA-256：`49a0b3b82d5c0ce5b6fe791b30e6122e7b1838070ab7e153b2bee49c2db50ea7`
- 每案包含 request hash、HTTP status、MT/MX expected/actual、UI decision、UI error notice、MT/MX 畫面 preview 與控制項選取結果。
- 失敗案例另存 full-page screenshot。
