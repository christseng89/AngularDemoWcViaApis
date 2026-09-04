# Balance Account Number 維護與 API

Account Number Maintenance 的導覽依照 `Category → Business Type / GL Family`；畫面第一層與 Transaction Processing 一致：`Import LC`、`Export Confirmed`。進入 family 後改以 `GL → Tenor SL` 呈現：先顯示 Contingent Liability 與 Liability 兩個 GL 區塊，各自提供 GL Account Number／Description 輸入框，再於各 GL 下列出 Sight／Usance 等配置式 Tenor SL 輸入框。

GL 預設值取該 family 原 Sight mapping 的 Account Number／Description 並移除 Sight；沒有 Sight 的 family 則使用第一個 configured Tenor 作基準。SL Account Number 預設為 `tenorKey`，SL Account Description 預設為 Tenor label。Angular 儲存前把 `GL + SL` 組合回既有 mapping 的完整 Account Number／Description。這只是 Angular 編輯與顯示模型；DB、API mapping row、交易出帳及 voucher 結構不變。交易方向仍由 domain rule 決定 Dr/Cr。

## 唯一配置來源

`microservices/balance-component/config/balance-account-mappings.json` 是 category、business/GL family、Tenor SL、transaction API value、Sight/Usance behavior 與 seed account identity 的 canonical configuration。

目前配置中的 11 組 default Account Number／Description 已由維護 DB 匯出。Maintenance index 的 `Reload` 按鈕會立即呼叫專用 API，在單一 transaction 內以這 11 組 defaults 覆寫 DB；成功後每筆 version 為 `1`、`updatedBy` 為 `SYSTEM_CONFIG_RELOAD`，並重新顯示 server response。任一筆寫入失敗則全部 rollback。這不是一般查詢 refresh，也不需要再按 Save。

目前 category-scoped Tenor 是五種配置身分：

| 畫面分類 | Tenor SL |
|---|---|
| Import LC | Sight、Seller's Usance、Buyer's Usance |
| Export Confirmed | Sight、Usance |

Import Sight 與 Export Sight 是不同 category 下的配置項，不是共用的全域四值 enum。現在五個 GL family 為 Import LC Balance、Import Acceptance Balance、Shipping Guarantee Balance、Confirmed LC Balance、Confirmed Acceptance Balance。

未來新增 Account Maintenance 的 category 或業務品種，只需增加配置；API 與 Angular 依回傳 hierarchy 自動呈現，不需要增加畫面 switch。新增 Tenor 可對應既有 `SIGHT`／`USANCE` processing behavior。若是全新的交易流程或會計行為，仍須另案設計及測試，不能只靠帳號配置推導。

`SBLC_LG_業務種類與Balance帳務_GL_SL增補版.docx` 只作未來概念參考；本次不加入 SBLC/LG 交易、欄位或規則。

## 資料與生效規則

- SQLite `balance_account_mappings` 保存實際維護值、版本、更新人與時間。
- 啟動時會補入配置新增但 DB 尚不存在的 mapping，不覆蓋已維護值。配置移除的舊 row 可保留作歷史資料，但不再出現在維護 API。
- migration 26 移除 mapping table 對 `instrument_type` 與 `risk_class` 的固定 enum CHECK；允許值由啟動時配置驗證決定。Primary key、family/SL 唯一性與 version constraint 保留。
- 每次建立或 Fix Pending movement 時，mapping resolver 按 Instrument/Business Type 與 Tenor 取得當時 mapping，並把 Account Number、Description、Mapping Key、Version 寫入 immutable `contingentAccountEntry`。
- 日後維護 mapping 只影響新交易，舊 voucher 不重新計算。
- family 儲存是單一 transaction：所有 configured SL 必須各送一次目前 version；任一 stale version 會回 409，整個 family 均不更新。
- `POST /balance-account-mappings/reload-configuration` 是明確的全組 reset use case；`Cleanup Database` 只清除交易、合約與 audit，保留 Account Number mappings。

## Account Number 驗證

三個有效變數是 `BALANCE_ACCOUNT_NUMBER_REGEX`、`BALANCE_ACCOUNT_NUMBER_MIN_LEN` 與 `BALANCE_ACCOUNT_NUMBER_MAX_LEN`。服務啟動時驗證 regex 與整數範圍；Account Number 會 trim 後檢查 regex 與 min/max，MIN=MAX 表示固定長度。權威值、fallback、載入方式與重啟要求見 [Balance Component Configuration Reference](configuration.md)，避免在功能文件重複維護 `.env` 值。

## API

權威契約是 `analysis/balance-component-api.yaml`。WC 經宿主 proxy 使用 `/balance-component` 前綴；直接呼叫 microservice 使用其 base URL。

取得配置 hierarchy、active mappings 與驗證規則：

```bash
curl http://localhost:4100/balance-account-mappings
```

原子更新一個 GL family 的所有 Tenor SL：

```bash
curl -X PUT "http://localhost:4100/balance-account-mappings/families/IMPORT_LC_BALANCE" \
  -H "Content-Type: application/json" \
  -d '{
    "updatedBy": "operator-1",
    "mappings": [
      {
        "mappingKey": "IPLC_LC:SIGHT",
        "expectedVersion": 1,
        "accountA": { "accountNumber": "110001-S", "accountDescription": "Sight customer liability" },
        "accountB": { "accountNumber": "210001-S", "accountDescription": "Sight LC outstanding" }
      }
    ]
  }'
```

實際 request 必須包含該 family 的每一個 configured SL，範例只示意單一 item 結構。成功時所有 row version 一起加一；不完整、重複或格式錯誤回 400，未知 family 回 404，任何 optimistic conflict 回 `409 ACCOUNT_MAPPING_VERSION_CONFLICT` 且不作部分更新。既有單 row PUT 暫時保留相容性，新 UI 只使用 family endpoint。

Demo 未實作身份驗證；正式部署必須由 authenticated session 產生 `updatedBy`，並在 gateway/服務端授權，不可信任任意 request body actor。
