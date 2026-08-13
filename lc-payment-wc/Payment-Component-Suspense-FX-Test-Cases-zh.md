# Payment Component — Suspense Bridge + FX Exchange 測試案例說明

本文件說明如何執行 `microservices/payment-component/test/curl-tests/` 底下的兩組 curl 測試案例，
對象是 `POST /payment-component/v1/payment-instructions`（`analysis/payment-instructions-post.yaml`
定義的 OAS）。這兩組案例都是直接呼叫 Payment Component microservice 本身，**不經過 Angular +
Formly 的 Business Case Simulator UI**，方便單獨驗證 `suspenseBridge` 與 FX Exchange pair 生成
邏輯的行為。

## 前置條件

Payment Component microservice 要先跑起來（獨立於 Angular app 的另一個 process）：

```bash
cd lc-payment-wc/microservices/payment-component
npm install        # 第一次執行才需要
npm run dev        # 監聽 :3000，儲存檔案會自動重啟
```

確認起來了（另開一個 terminal）：

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/payment-component/v1/payment-instructions
```

回 `200` 就代表 service 已經在跑。

## 如何執行

```
cd lc-payment-wc\microservices\payment-component\test\curl-tests
run-cases.bat
```

`run-cases.bat` 是刻意寫得很單純的兩行 curl 呼叫（沒有 subroutine、沒有迴圈），依序打
Case #1、Case #2，並把 HTTP 狀態碼跟完整的 JSON 回應印到畫面上。兩個案例的 request body 分別
放在 `requests/case1-suspense-fx-and-nostro-usd.json` 跟
`requests/case2-suspense-fx-and-nostro-eur-usd-split.json`，也可以直接拿去在 Postman 或其他
工具裡重播。

**PowerShell 使用者請注意**：PowerShell 5.1 把 `curl` 這個名字 alias 到 `Invoke-WebRequest`，不
是真正的 curl.exe，不吃 `-X`/`-w`/`--data` 這些參數。`run-cases.bat` 本身是用 `cmd.exe` 執行，
不受影響；但如果你想在 PowerShell 裡手動打單一 curl 指令，記得打 `curl.exe`，不要打 `curl`。

## 案例背景（共同前提）

兩個案例的 Transaction Currency 都是 **USD**，Total Amount **10000**，`suspenseBridge` 也完全一樣：

| Suspense Debit | 金額 | 幣別 | 來源 |
|---|---|---|---|
| 1 | 10 | USD | Charge |
| 2 | 20 | USD | Charge |
| 3 | 12 | EUR | Charge |

| Suspense Credit | 金額 | 幣別 | 來源 |
|---|---|---|---|
| 1 | 35 | USD | Charge |

Debit Legs 也兩案共用：

| Account Type | Account No | Amount (Tx Ccy) | Leg Currency | Rate | Account Ccy Equiv. |
|---|---|---|---|---|---|
| CUSTOMER | CUST-ACC | 216.62 | EUR | 0.923295 | 200.00 |
| CUSTOMER | CUST-ACC | 9826.38 | USD | — | — |

Debit 側總額 216.62 + 9826.38 = **10043.00**，剛好等於 `Total(10000) + Σ debitEntries 換算成 USD
的等值金額(43.00)` — 這是 Business Case Simulator 既有的「Debit Leg #1 = Total + Σ debitEntries」
seeding 慣例，兩個案例都遵守。

## Case #1 — Credit Legs 只有一筆 USD NOSTRO

```json
"creditLegs": [
  { "accountNo": "NOSTRO-ACC", "accountType": "NOSTRO", "currency": "USD", "amountTxCcy": "9965.00" }
]
```

9965.00 = `Total(10000) − Σ creditEntries(35)`，同樣是既有慣例。

**實際打過確認會回 201**，Service 端會自動生成：

- 一組 **Leg-anchored FX Exchange pair**（`Dr FX Exchange EUR 188 / Cr FX Exchange USD 203.62`）—
  這是 v1.9.0 的「debit 側 netting」邏輯：Suspense Debit 裡的 12 EUR，跟 Debit Legs 裡那筆 EUR
  leg 的原幣金額 200 EUR 互相核對後，剩下 188 EUR 的殘差才需要真的做 FX 轉換；已經被 Suspense
  cover 掉的那 12 EUR，改由下面這個 Suspense - Debit (EUR) leg 單獨處理。
- 三筆 `Suspense - Debit`（10 USD、20 USD、12 EUR→13.00 USD 等值）+ 一筆 `Suspense - Credit`
  （35 USD），全部落在 Credit 側（`suspenseBridge` 產生的 leg 不分來源，一律是 credit 方向）。

## Case #2 — Credit Legs 拆成 EUR + USD 兩筆

```json
"creditLegs": [
  { "accountNo": "NOSTRO-ACC", "accountType": "NOSTRO", "currency": "EUR", "amountAccountCcy": "1000.00", "amountTxCcy": "1083.08", "crBuyRate": "0.923295" },
  { "accountNo": "NOSTRO-ACC", "accountType": "NOSTRO", "currency": "USD", "amountTxCcy": "8881.92" }
]
```

1083.08 + 8881.92 = 9965.00，跟 Case #1 的 credit 總額完全一樣，只是拆成兩個幣別。

**這裡是這組案例真正要驗證的重點**：`suspenseBridge.creditEntries` 裡**沒有 EUR** 的 entry（只有
35 USD 那一筆），所以這筆新增的 EUR NOSTRO credit leg **不會**觸發任何額外的 FX Exchange pair 生
成 — 用真實 request 打過確認：Case #2 的回應裡，FX Exchange pair 仍然只有跟 Case #1 一模一樣的
那一組（188 EUR / 203.62 USD，來自 debit 側的 netting），EUR NOSTRO credit leg 就是單純以
`amountTxCcy: 1083.08` 直接參與聚合 V8 配平，沒有任何 service 端自動生成的配套分錄。也就是說：
per-currency 的自動核對（FX pair 生成）**只發生在 `suspenseBridge` 真的有涵蓋到的幣別上**，不會
因為 Debit/Credit Legs 剛好都出現同一個外幣就自動互相核對。

## 兩個案例都要注意的欄位（送錯會 400 或配平算錯）

1. **`transactionCurrency` 一定要明確帶 `"USD"`**。Debit Legs 第一筆剛好是 EUR，如果不明確帶這
   個欄位，service 會退回用 `debitLegs[0].currency` 當交易幣別，誤判成 EUR，導致 USD 金額在
   H-2（幣別小數位數）檢查上被誤判為超過允許的小數位數而 400（這正是 v1.10.0 修的那個 bug 情境）。
2. **EUR 的 leg 一定要帶 `amountAccountCcy`**（不能只帶 `amountTxCcy`）。debit 側 netting 邏輯是
   拿 `amountAccountCcy`（原幣金額）去跟 Suspense 的原幣金額互相核對，沒有這個欄位會退回用
   `amountTxCcy` 去比對，等於拿 USD 等值金額去跟 EUR 原幣金額比，核對邏輯會整個算錯。
3. **Suspense 裡的 EUR entry 要帶 `crossRate`**（本例用 `1.0831`，是 leg 顯示的 0.923295 的倒
   數方向，USD→EUR vs EUR→USD 要對清楚方向）；USD entry 因為跟交易幣別相同，不需要 `crossRate`。
4. 「Exchange A/C No」這一欄（UI 上顯示的 `FX Exchange USD` 這類標籤）**不是** `PaymentLegInput`
   會送出去的欄位 — OAS 裡沒有這個屬性，純粹是 client 端（leg-allocator）自己算好顯示用的預覽，
   跟 service 實際生成的 FX Exchange leg 是兩回事，不要混為一談。
