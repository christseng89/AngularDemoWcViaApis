# User-Friendly Message Standard

## 核心格式

每一則訊息應回答：

1. **What happened?** 發生甚麼事。
2. **What is the current state?** 操作是否完成、資料是否保留。
3. **What should the user do next?** 下一步怎麼做。

避免直接顯示 exception、HTTP URL、stack trace、`[object Object]` 或只有 backend code 的文字。

## Severity

| Severity | 用途 | ARIA | 範例標題 |
|---|---|---|---|
| `INFO` | 狀態說明、無資料、流程提示 | `status` / polite | No pending transactions |
| `SUCCESS` | 操作完整成功 | `status` / polite | Transaction submitted |
| `WARNING` | 可理解的業務限制、需要使用者修正 | `alert` 或 polite | Maker submission required |
| `ERROR` | Network/system failure、操作未完成 | `alert` | Unable to complete approval |

## Recommended message examples

| Scenario | User-facing title | User-facing message | Next action |
|---|---|---|---|
| Search no match | No matching transaction | No transaction matched LC S001. | Check the LC Number and search again. |
| No pending Checker item | No pending approvals | This LC has no transaction waiting for this Checker function. | Select another LC or review the transaction history. |
| Maker not submitted | Maker submission required | This transaction is not ready for Checker approval. | Ask a Maker to submit it first. |
| Already processed | Transaction already processed | Another user has already approved or rejected this transaction. | Refresh the Checker queue. |
| Available balance is zero | No available balance | This LC has no remaining balance for this transaction. | Select another LC or review its previous events. |
| Duplicate reference | Transaction already exists | A transaction with this reference already exists. | Search for the existing transaction before submitting again. |
| Network unavailable | Balance service unavailable | The request was not completed, but your input has been kept. | Check the connection and try again. |
| Unexpected server error | Request could not be completed | Your changes were not submitted. | Try again or contact support with the support code. |
| Compound partial failure | Additional posting failed | The primary transaction completed, but the linked posting did not. | Do not submit again; contact support with the support code. |

## Backend mapping examples

```text
NATURAL_KEY_ALREADY_EXISTS
→ ERROR / Transaction already exists

BAL-123 or MAKER_SUBMISSION_REQUIRED
→ WARNING / Maker submission required

HTTP 404 during search
→ INFO / No matching transaction

HTTP 409
→ WARNING / Transaction already processed or changed

HTTP 0
→ ERROR / Balance service unavailable / retryable

HTTP 500+
→ ERROR / Request could not be completed / support code
```

## Technical details

- `technicalCode` 可送往 logging/telemetry。
- UI 只在使用者需要聯絡 support 時顯示短 `supportCode`。
- 不在主要 message 顯示 request URL、raw payload 或 stack trace。
- Compound operation 不可用模糊的 `atomic failure`；必須說明哪些步驟成功、哪些沒有完成，以及是否可以重試。
