# HTTP Retry Policy

本文件是 Angular host 与 `<balance-component-app>` 共用的自动重试操作规范。OAS 的 `x-client-retry-policy` 用于记录此 client policy；微服务本身不会替 caller 重试。

## 默认环境设置

| `.env` key | Default | Valid range | Purpose |
| --- | ---: | ---: | --- |
| `BALANCE_HTTP_RETRY_COUNT` | `3` | `0–10` | 首次失败后最多重试次数；设为 `0` 可停用 |
| `BALANCE_HTTP_RETRY_INITIAL_DELAY_MS` | `250` | `0–60000` | 第一次 retry 前的基础间隔 |
| `BALANCE_HTTP_RETRY_MAX_DELAY_MS` | `2000` | initial delay–`60000` | exponential backoff 上限 |

默认最多四次 HTTP attempt：原始请求，加上约 250ms、500ms、1000ms 后的三次 retry。上限避免异常设置造成无限等待。

## 安全边界

- 只重试 `GET`、`HEAD`、`OPTIONS`。
- 只重试 network/status `0`、HTTP `408`、`429` 与 `5xx`。
- `POST` command，包括 Submit、Release、Approve、Fix Pending、Delete Pending，绝不自动重送。
- 不重试业务拒绝及其他 `4xx`，避免掩盖输入、状态或权限错误。

写入重试必须依赖明确的 idempotency contract；目前 UI 不假设所有 Balance command 都满足该条件，因此采取保守策略，避免重复 Balance Movement 或 Account Entries。

## Build lifecycle

`scripts/generate-runtime-config.mjs` 在 `start`、`dev:all`、`test`、`build` 与 `build:wc` 前读取 `.env`，产生 host 与 WC bundle 使用的型别安全设定。环境值改变后必须重新 build WC bundle；这是 build-time policy，不是每个 Custom Element instance 的 DOM property。

## Verification

Interceptor tests 覆盖暂时性 GET 失败后重试三次，以及 POST 失败不重试。OAS `1.42.1` 只新增 vendor-extension metadata，没有改变 endpoint、request、response、status 或 Web Component DOM contract。Channel OAS 保持 `1.9.0`。
