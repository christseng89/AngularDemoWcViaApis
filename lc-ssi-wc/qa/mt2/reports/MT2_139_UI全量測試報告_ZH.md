# MT2 139 案瀏覽器 UI 全量測試報告

## 結論

- 執行政策：單一乾淨 Browser Context、一次不中斷執行全部 139 案；不拼接局部重跑。
- 執行通道：Playwright 操作 localhost UI 的 Preview Resolution；由瀏覽器送出每案受控 request，curl/API runner 不作為替代結果。
- 執行結果：139/139 通過；產品／環境失敗 0；規格阻擋 0。
- Payment SSI Index：4/4 支援電文可由畫面選取並開啟 COUNTERPARTY_SSI panel；5/5 非本 domain 電文不顯示。
- Message Scenario Index：四欄、四種可用情境、固定順序、MT／ISO 20022 target 與 business service 均納入 gate。
- Bank Service：SSI-referenced 正常解析、inactive／unknown 不可選、directory-only 可識別但須 fail-closed，且 request 不得帶 raw BIC 欄位。
- 驗收狀態：PASS。
- 中斷狀態：無。

## UI 控制驗證

- ✅ Portal startup health check returned HTTP 2xx
- ✅ Bank Service startup health check returned HTTP 200
- ✅ Payment Message Index startup health check returned HTTP 200
- ✅ Payment SSI Index contains exactly four Counterparty SSI messages
- ✅ MT200 is absent from the Payment SSI Index
- ✅ MT201 is absent from the Payment SSI Index
- ✅ MT203 is absent from the Payment SSI Index
- ✅ MT204 is absent from the Payment SSI Index
- ✅ MT210 is absent from the Payment SSI Index
- ✅ MT202 selects the Counterparty SSI panel
- ✅ MT202COV selects the Counterparty SSI panel
- ✅ MT205 selects the Counterparty SSI panel
- ✅ MT205COV selects the Counterparty SSI panel
- ✅ Message Scenario Index exposes the governed four-column contract
- ✅ Message Scenario Index preserves the governed scenario order
- ✅ BOOK_TRANSFER_SAME_RECEIVER is a separate Message Scenario Index option
- ✅ BOOK_TRANSFER_SAME_RECEIVER exposes governed control Own debit account
- ✅ BOOK_TRANSFER_SAME_RECEIVER exposes governed control Own credit account
- ✅ BOOK_TRANSFER_SAME_RECEIVER exposes governed control Receiver Bank
- ✅ BOOK_TRANSFER_SAME_RECEIVER Receiver Bank is selected or read-only, never manual BIC input
- ✅ BOOK_TRANSFER_SAME_RECEIVER preserves its message, ISO target, business service, and SSI domain
- ✅ CREDIT_ONE_OF_SEVERAL_AT_57A is a separate Message Scenario Index option
- ✅ CREDIT_ONE_OF_SEVERAL_AT_57A exposes governed control Own debit account at Receiver
- ✅ CREDIT_ONE_OF_SEVERAL_AT_57A exposes governed control Own credit account at 57A
- ✅ CREDIT_ONE_OF_SEVERAL_AT_57A exposes governed control Receiver Bank
- ✅ CREDIT_ONE_OF_SEVERAL_AT_57A Receiver Bank is selected or read-only, never manual BIC input
- ✅ CREDIT_ONE_OF_SEVERAL_AT_57A preserves its message, ISO target, business service, and SSI domain
- ✅ INITIAL_MT200_201_EQUIVALENCE is a separate Message Scenario Index option
- ✅ INITIAL_MT200_201_EQUIVALENCE exposes governed control Previous MT200/201 context
- ✅ INITIAL_MT200_201_EQUIVALENCE exposes governed control 52a Ordering Institution
- ✅ INITIAL_MT200_201_EQUIVALENCE 52a Ordering Institution is selected or read-only, never manual BIC input
- ✅ INITIAL_MT200_201_EQUIVALENCE exposes governed control 58a Beneficiary Institution
- ✅ INITIAL_MT200_201_EQUIVALENCE 58a Beneficiary Institution is selected or read-only, never manual BIC input
- ✅ INITIAL_MT200_201_EQUIVALENCE preserves its message, ISO target, business service, and SSI domain
- ✅ NO_MT200_201_EQUIVALENCE is a separate Message Scenario Index option
- ✅ NO_MT200_201_EQUIVALENCE exposes governed control Previous COV context
- ✅ NO_MT200_201_EQUIVALENCE exposes governed control A.52a Ordering Institution
- ✅ NO_MT200_201_EQUIVALENCE A.52a Ordering Institution is selected or read-only, never manual BIC input
- ✅ NO_MT200_201_EQUIVALENCE exposes governed control A.58a Beneficiary Institution
- ✅ NO_MT200_201_EQUIVALENCE A.58a Beneficiary Institution is selected or read-only, never manual BIC input
- ✅ NO_MT200_201_EQUIVALENCE preserves its message, ISO target, business service, and SSI domain
- ✅ SENDER_BENEFICIARY_DIRECT_DEBIT is a separate Message Scenario Index option
- ✅ SENDER_BENEFICIARY_DIRECT_DEBIT exposes governed control Direct Debit mandate
- ✅ SENDER_BENEFICIARY_DIRECT_DEBIT exposes governed control Sender BIC
- ✅ SENDER_BENEFICIARY_DIRECT_DEBIT preserves its message, ISO target, business service, and SSI domain
- ✅ Bank Service returned selectable identities
- ✅ Counterparty BIC is selected through Bank Service
- ✅ Counterparty selector submits bankServiceId rather than raw BIC
- ✅ Normal SSI-referenced Bank Service identity is selectable
- ✅ Directory-only Bank Service identity is selectable without inventing SSI coverage
- ✅ Inactive and unknown Bank Service identities are not selectable
- ✅ No editable BIC input is exposed
- ✅ BANK-SVC-BARCGB22 follows the governed Bank Service resolution path
- ✅ BANK-SVC-NSSIGB2X follows the governed Bank Service resolution path

## 失敗／阻擋案例

| Test Case | 類型 | 差異 |
| --- | --- | --- |
| — | 無 | — |

## 可稽核證據

- Machine-readable report：`qa/mt2/reports/mt2-139-ui-results.json`
- Workbook SHA-256：`2f60f8013f7292a32ef4d7e2716a16d7a060f1781dd7b39036b0f0506c7483fe`
- 每案包含 request hash、HTTP status、MT/MX expected/actual、UI decision、UI error notice、MT/MX 畫面 preview 與控制項選取結果。
- 失敗案例另存 full-page screenshot。
