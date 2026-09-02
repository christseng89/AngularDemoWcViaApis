# HTTP Retry Policy

本文件是 Angular host 与 `<balance-component-app>` 共用的自动重试操作规范。OAS 的 `x-client-retry-policy` 用于记录此 client policy；微服务本身不会替 caller 重试。

## 默认环境设置

| `.env` key | Default | Valid range | Purpose |
| --- | ---: | ---: | --- |
| `BALANCE_HTTP_RETRY_COUNT` | `3` | `0–10` | 首次失败后最多重试次数；设为 `0` 可停用 |
| `BALANCE_HTTP_RETRY_INITIAL_DELAY_MS` | `250` | `0–60000` | 第一次 retry 前的基础间隔 |
| `BALANCE_HTTP_RETRY_MAX_DELAY_MS` | `2000` | initial delay–`60000` | exponential backoff 上限 |
| `BUSINESS_CASE_RECOVERY_RETRY_COUNT` | `15` | `0–60` | Cleanup 後等待 Business Case backend 恢復的重試次數 |
| `BUSINESS_CASE_RECOVERY_INTERVAL_MS` | `2000` | `100–60000` | Business Case readiness probe 之間的固定間隔 |

默认最多四次 HTTP attempt：原始请求，加上约 250ms、500ms、1000ms 后的三次 retry。上限避免异常设置造成无限等待。

Business Case Runner 的服務恢復檢查使用獨立的低頻策略：預設每 2 秒重試一次，最多 15 次（約 30 秒）。這個 GET 會略過全域快速 retry interceptor，避免兩層 retry 疊加後在 Vite console 產生密集 `ECONNREFUSED`。
這個自動等待僅用於 Cleanup 成功後。Browser Refresh／初次進入頁面只發出一次 GET；失敗時顯示錯誤與 `Try again` 按鈕，不會在 backend 未啟動時持續製造 proxy log。

## 安全边界

- 只重试 `GET`、`HEAD`、`OPTIONS`。
- 只重试 network/status `0`、HTTP `408`、`429` 与 `5xx`。
- `POST` command，包括 Submit、Release、Approve、Fix Pending、Delete Pending，绝不自动重送。
- Cleanup Database 的 `POST /api/admin/reset-database` 同樣只送一次；成功後 UI 才以 GET readiness probe 等待 backend 恢復。等待期間 Run、Run All 與 Cleanup 均停用，恢復後自動重載 case index。
- 不重试业务拒绝及其他 `4xx`，避免掩盖输入、状态或权限错误。

写入重试必须依赖明确的 idempotency contract；目前 UI 不假设所有 Balance command 都满足该条件，因此采取保守策略，避免重复 Balance Movement 或 Account Entries。

## Build lifecycle

`scripts/generate-runtime-config.mjs` 在 `start`、`dev:all`、`test`、`build` 与 `build:wc` 前读取 `.env`，产生 host 与 WC bundle 使用的型别安全设定。环境值改变后必须重新 build WC bundle；这是 build-time policy，不是每个 Custom Element instance 的 DOM property。

## Verification

Interceptor tests 覆盖暫時性 GET 失敗後重試三次、指定 GET 略過全域 retry，以及 POST 失敗不重試。Business Case API tests 另覆盖低頻有界 readiness retry 與非暫時性 `4xx` 立即失敗。本次只調整 Angular/backend orchestration 的恢復行為，沒有改變 Balance microservice OAS endpoint、request、response、status 或 Web Component DOM contract；現有 OAS 版本不變。
