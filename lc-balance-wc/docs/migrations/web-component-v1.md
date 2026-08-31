# Web Component Version 1 升級指南

1. 保留既有服務端及 `/api/*`、`/balance-component/*` proxy。
2. 部署完整 WC browser assets。
3. 以 `<balance-component-app>` 取代跨專案複製 Angular UI。
4. 使用 `config` property設定 initial view與 theme。
5. 以 `balance-*` events取代存取 Angular internals。
6. 需要 framework ergonomics時使用 adapter，不重寫業務邏輯。

從 Phase 1–3升級仍使用 contract version `'1'`。Phase 4 adapters為選用 exports；Phase 5 assets位於
`dist/balance-component-wc/browser/`並包含 manifest。宿主若曾全域載入 `styles.css`應移除，因 WC
會在 shadow root內載入。

升級後執行 ready、navigation、refresh、error、theme與多實例 smoke tests。不得加入 auth token
attribute；認證仍由既有宿主／transport環境負責。
