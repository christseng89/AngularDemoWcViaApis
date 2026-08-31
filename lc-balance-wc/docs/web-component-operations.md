# 部署、回滾與疑難排解 Runbook

## 發布前與部署

依 [release checklist](releasing-web-component.md) 執行驗證。保存 tarball、manifest、測試結果與
版本號；不得發布未驗證 working tree。

- `main.js`、`polyfills.js`、`styles.css`、chunks與 manifest必須原子部署。
- 使用 versioned immutable path，例如 `/balance/0.1.0/main.js`。
- versioned assets可長期 cache；切換版本的 alias／HTML使用短 cache。
- `styles.css`與 chunks必須與 `main.js`同目錄。
- `/api/*`、`/balance-component/*`維持既有 upstream與 status/body，不指向 SPA fallback。
- build前可用`.env`設定安全讀取的最大重試次數、初始間隔與上限，預設3次／250ms／2000ms；變更後必須重新build WC bundle。
- CSP應明確允許受控 script/style來源；不得使用 token query string。

## 回滾

1. 停止擴大 rollout並保留失敗版本資產。
2. 將 alias／host HTML指回上一個已驗證 immutable版本。
3. 只清除 alias／HTML cache，不刪除 versioned assets。
4. 驗證 element registration、`balance-ready`、navigate、refresh及兩條 API proxy path。
5. 記錄失敗 manifest、browser console、error code與影響範圍。

WC rollback不應連帶回滾資料庫或服務；若發現後端 contract問題，交由 service owner處理。

## 疑難排解

| 症狀                     | 檢查                  | 處理                            |
| ------------------------ | --------------------- | ------------------------------- |
| element未定義            | `main.js`、module/CSP | 修正 static path或 CSP          |
| `STYLESHEET_LOAD_FAILED` | CSS路徑、MIME、CORS   | 原子重部署完整資產              |
| lazy view 404            | chunks是否齊全        | 部署 manifest全部 assets        |
| `ELEMENT_NOT_CONNECTED`  | 是否早於 mount呼叫    | 等待 connected／`balance-ready` |
| API 404回 HTML           | proxy與 SPA fallback  | 排除兩條 API prefix             |
| 暫時性 API 失敗          | status 0/408/429/5xx  | GET自動重試；POST不可自動重送   |
| 宿主樣式無效             | 是否穿透 shadow root  | 改用公開 tokens                 |
| 多實例事件混淆           | listener是否掛全域    | 綁定各 element並 cleanup        |

Escalation資料應包含 package version、manifest、browser/version、host framework、最小重現、
`balance-error.detail.code`及 network log；不得附 token或客戶敏感資料。
