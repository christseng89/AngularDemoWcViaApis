---
knowledge_id: balance-account-number-maintenance-api
status: CONFIRMED
source: lc-balance-wc microservice and OAS v1.45.0
---

# Balance Account Number Maintenance API

Balance Account Number 維護是一張 DB-backed 固定路由表，不是每筆交易自由輸入科目。每個 `instrumentType:riskClass` 維護 Account A／Account B 完整一套；UI 業務標籤分別為 `Contingent Liability`／`Liability`，API 欄位則維持 `accountA`／`accountB` 以避免 breaking change。領域服務再依 movement direction 將 A/B 對應為 Dr/Cr。固定路由不可由 UI 新增或刪除。

微服務提供 `GET /balance-account-mappings` 與 `PUT /balance-account-mappings/{mappingKey}`。PUT 必須提交完整兩科目、`updatedBy` 與 `expectedVersion`；版本衝突回 409，避免兩位使用者互相覆蓋。Angular 與 Web Component 經 `/balance-component/balance-account-mappings` proxy 使用同一 API。

Account Number 的 regex、最短、最長長度由根目錄 `.env` 的 `BALANCE_ACCOUNT_NUMBER_REGEX`、`BALANCE_ACCOUNT_NUMBER_MIN_LEN`、`BALANCE_ACCOUNT_NUMBER_MAX_LEN` 控制；MIN=MAX 表示固定長度。JSON 是空 DB 的 seed，SQLite 才是執行期真實來源；JSON 內的 11 組預設 Account Number／Description 已與目前維護資料同步。

UI 採同頁 master-detail：先在可搜尋的 `Account Set Index` 選擇 Product／Risk Class，再進入單筆唯讀 Detail。`Edit` 才開放修改，`Save Account Set` 僅在 dirty 時出現；`Cancel` 或 `Back to Account Set Index` 會還原未儲存資料。此導覽狀態完全位於前端，不新增 API route，也不改 OAS schema。

新 movement 會把科目號、科目說明、mapping key/version 寫入 `contingentAccountEntry`。既有 movement 保留建立時快照，維護新 mapping 不追溯改寫歷史 voucher。這是帳務稽核與可重演性的必要界線。

維護 UI 以最後一次 GET／成功 PUT 的 Account A/B 為 per-row baseline。預設欄位唯讀並顯示 `Edit`；進入 Edit 後顯示 `Cancel`，只有欄位變更時才額外顯示 `Save Account Set`。Cancel 還原 baseline；改回 baseline 或 PUT 成功後清除 dirty state，成功後並離開 Edit。

關聯：[[contingentaccountentry-generated-once-at-creation-immutable-thereafter]]、[[contingent-account-entry-vs-pass-through-account-entry-gl-ownership-bo]]、[[Function-API Integration Map]]。
