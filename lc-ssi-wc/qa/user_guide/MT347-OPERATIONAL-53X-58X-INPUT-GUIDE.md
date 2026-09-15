# MT347 Operational 53X／58X 輸入操作說明

## 適用範圍

本說明適用於 Trade Finance SSI Resolution 的 **Operational** scenarios。

一般 SSI 路徑只需要交易基本資料與 Counterparty Bank；53X／58X 通常由 SSI Resolver 導出。只有交易本身已指定銀行角色、而 Resolver 不能安全猜測該交易事實時，畫面才會額外要求使用者輸入 53X 或 58X Bank Service。

畫面遵循以下唯一資料流：

`OAS field policy -> Page Parameters API -> Generic UI`

因此，欄位是否顯示、是否必填、適用的 message/scenario、SWIFT option 與角色，均以目前載入的 OAS contract 為準；UI 不另行寫死判斷。

## 哪些 Operational scenarios 需要額外輸入

| Message | Scenario ID | Scenario                                            | 必填交易輸入         | 支援的 SWIFT option | 用途                                            |
| ------- | ----------- | --------------------------------------------------- | -------------------- | ------------------- | ----------------------------------------------- |
| MT400   | MT400-001   | MESSAGE - Message / direct canonical route          | 58X Beneficiary Bank | 58A／58B／58D       | 指定交易的 Beneficiary Bank                     |
| MT742   | MT742-006   | Beneficiary branch/affiliate route                  | 58X Beneficiary Bank | 58A／58D            | 指定交易的 beneficiary branch／affiliate        |
| MT742   | MT742-013   | MESSAGE - 58a multiple direct-account relationships | 58X Beneficiary Bank | 58A／58D            | 多個直接帳戶關係中指定本交易的 Beneficiary Bank |
| MT754   | MT754-005   | Reimbursing bank route                              | 53X Reimbursing Bank | 53A／53B／53D       | 指定本交易的 Reimbursing Bank                   |
| MT754   | MT754-011   | Beneficiary branch/affiliate route                  | 58X Beneficiary Bank | 58A／58D            | 指定交易的 beneficiary branch／affiliate        |
| MT754   | MT754-013   | MESSAGE - 58a multiple direct-account relationships | 58X Beneficiary Bank | 58A／58D            | 多個直接帳戶關係中指定本交易的 Beneficiary Bank |

上述欄位是 **transaction context input**，不是要使用者預先填寫 Resolver 應自行導出的 SSI 路徑。未列出的 Operational scenario 不應顯示額外 53X／58X Bank Service 必填欄位。

## 操作步驟

1. 在 Trade Finance Resolution INDEX 選擇 MT message。
2. 在 Scenario 視窗使用預設的 **Operational** tab，選擇業務 scenario；QA／test only 不屬於一般 UAT 正向操作。
3. 填寫 Transaction Reference，並選擇 Currency、Booking Entity、Value Date 及 Counterparty Bank。
4. 若所選 scenario 在上表內，於畫面上方有星號的 `SWIFT 53X` 或 `SWIFT 58X` 欄位選擇 Bank Service。
5. 按 **Resolve SSI**。送出期間按鈕顯示 spinner，完成後以 pop-up 顯示實際 resolution result。
6. 按 **Cancel** 返回該 message 的 Scenario 選擇畫面，不執行 resolution。

## 重要行為

- 更換 Currency、Booking Entity、Value Date 或其他會改變 SSI applicability 的欄位時，既有 Counterparty／Bank Service 選擇必須失效並重新載入，不得沿用上一個條件的資料。
- 必填的 53X／58X 尚未選擇時，**Resolve SSI** 應保持 disabled，並由欄位提示指出缺少的輸入。
- Bank Service picker 只能顯示 API 回傳、符合目前 governed applicability 的資料；不得用手工 BIC 取代 stable Bank Service ID。
- Resolution result 中的其他 5X 欄位屬 resolver output。沒有資料時應顯示其真實狀態，例如 `NOT REQUIRED`、`NO ROUTE` 或錯誤碼，不得偽造成功值。
- 當 Currency 改變後，先清空不再適用的 Counterparty／Bank Service，再顯示 loading spinner；新資料載入完成前不得送出舊值。

## 快速判斷

- 看見額外 53X／58X 必填欄位：這是所選 scenario 所需的交易事實，請先選 Bank Service。
- 沒看見額外欄位：該 scenario 的 settlement 路徑應由 SSI Resolver 導出。
- 欄位重複出現：屬 UI/Page Parameters contract 缺陷，不應輸入兩次。
- 選項為空或只有不適用資料：先停止 UAT，記錄 Message、Scenario、Currency、Counterparty 與錯誤碼，再交由 BA/QA 核對 OAS、TDD、SWIFT MRG 及 SSI fixture。

## Contract 來源

- OAS policy：`openapi/swift-data-service.v1.json` 的 `x-resolution-page-field-policy`
- Scenario catalogue：`parameters/resolution-page-scenarios.sr2026.json`
- Page Parameters contract：`libs/contracts/src/page-parameters.ts`
- 架構原則：`docs/architecture/ADR-001-api-driven-ui.md`

若 OAS 與 TDD／SWIFT MRG 不一致，應先修正受控 contract 與資料，再 Reload DB／重新載入；不可在 Angular UI 增加 message-specific workaround。
