# HTTP Retry Policy

Angular host與Web Component host只自動重試安全讀取：`GET`、`HEAD`、`OPTIONS`。專案根目錄`.env`預設最多重試3次、初始間隔250ms、上限2000ms，分別由`BALANCE_HTTP_RETRY_COUNT`、`BALANCE_HTTP_RETRY_INITIAL_DELAY_MS`及`BALANCE_HTTP_RETRY_MAX_DELAY_MS`控制；改值後須重新build bundle。

可重試條件為network/status 0、HTTP 408、429或5xx，使用bounded exponential backoff。所有POST command（Maker Submit、Checker action、Fix Pending、Delete Pending）不自動重送，避免重複[[Balance Movement]]及Account Entries。

OAS的`x-client-retry-policy`是client operational metadata，不是request欄位，也不表示server會替caller重試。
