# Balance Account Number 維護與 API

Balance Account Number 是一張固定路由的兩科目配置表。畫面將 Account A 顯示為 `Contingent Liability`、Account B 顯示為 `Liability`；API 仍保留穩定的 `accountA`／`accountB` 欄位名稱。交易方向由領域規則將 A/B 解析成 Dr/Cr，使用者不可新增或刪除路由。獨立 Angular 應用與 `<balance-component-app>` 都在 Transaction Builder 與 Business Case Runner 前顯示 `Balance Account Number`。

## 資料來源與生效規則

- SQLite `balance_account_mappings` 是執行期唯一資料來源；所有 demo 使用者都可修改。
- `microservices/balance-component/config/balance-account-mappings.json` 只負責空資料庫的初始 seed，不會覆蓋已維護的 DB 值。目前 JSON 預設值已與維護畫面現行的 11 組 Account Number／Description 同步。
- 每次建立或 Fix Pending 交易時，服務依 Instrument Type 與 Tenor/Risk Class 取得當時 mapping，將 Account Number、Description、Mapping Key、Version 寫入 `contingentAccountEntry`。
- 已建立的 voucher 是歷史快照。日後修改 mapping 只影響新交易，不回寫舊 movement。
- 若 Account Number 與 Description 相同，Account Entries 畫面只顯示一次；不同時同時顯示兩者。
- 維護頁先顯示可搜尋的 `Account Set Index`，可依 Product、Risk Class、Account Number／Description 或 Updated By 篩選。選中一筆後在同一頁切換至單筆 Detail，避免固定路由增加後一次展開過多表單。
- Detail 預設唯讀並只顯示 `Edit`。進入 Edit 後顯示 `Cancel`；只有兩個科目的 Number 或 Description 與最後載入／儲存版本不同時才額外顯示 `Save Account Set`。Cancel 還原完整 baseline，改回原值或儲存成功也會清除 dirty state；儲存成功後自動離開 Edit。
- `Back to Account Set Index` 不另開 route；若尚有未儲存修改，會先還原該筆 baseline 再返回 Index。儲存期間 Back 與 Cancel 均停用。

固定路由共 11 組：Import LC 的 Sight／Buyer’s Usance／Seller’s Usance、Import Acceptance 的兩種 Usance、Shipping Guarantee 的三種風險、Export Confirmation 的 Sight／Usance，以及 Export Acceptance 的 Usance。SG 即使目前採用相同實體科目，也保留獨立路由以便銀行日後分拆。

## `.env` 驗證

```dotenv
BALANCE_ACCOUNT_NUMBER_REGEX=^.+$
BALANCE_ACCOUNT_NUMBER_MIN_LEN=1
BALANCE_ACCOUNT_NUMBER_MAX_LEN=128
```

服務啟動時會驗證 regex 以及整數範圍。Account Number 會先 trim，再同時通過 regex、最短與最長長度檢查。當 `BALANCE_ACCOUNT_NUMBER_MIN_LEN` 等於 `BALANCE_ACCOUNT_NUMBER_MAX_LEN` 時，代表固定長度；例如兩者均為 `12` 時只接受剛好 12 個字元。修改 `.env` 後須重啟 Balance microservice。

## API

權威契約為 `analysis/balance-component-api.yaml` v1.46.2。WC 經宿主 proxy 使用 `/balance-component` 前綴；直接呼叫 microservice 時使用其實際 base URL（預設示例為 `http://localhost:4100`）。

列出固定路由與有效驗證規則：

```bash
curl http://localhost:4100/balance-account-mappings
```

更新一整套兩科目：

```bash
curl -X PUT "http://localhost:4100/balance-account-mappings/IPLC_LC%3ASIGHT" \
  -H "Content-Type: application/json" \
  -d '{
    "expectedVersion": 1,
    "updatedBy": "demo-user",
    "accountA": {
      "accountNumber": "110001",
      "accountDescription": "Customers liability under sight import LC"
    },
    "accountB": {
      "accountNumber": "210001",
      "accountDescription": "Sight import LC outstanding"
    }
  }'
```

更新必須送出 GET 所得的目前 `version`。成功後 version 加一；若另一位使用者已先更新，API 回 `409 ACCOUNT_MAPPING_VERSION_CONFLICT`，客戶端應 Reload 後再決定是否重做。未知 mapping key 回 404；格式、長度、description 或 request body 不合規回 400。

此 Demo 未實作身份驗證；正式銀行部署必須由驗證過的 session 產生 `updatedBy`，並在 API gateway/服務端實施授權，不可信任任意 request-body 身份。
