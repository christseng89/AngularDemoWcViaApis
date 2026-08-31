---
knowledge_id: http-error-code-catalog-errors-ts-exercised-end-to-end
title: "HTTP 错误代码目录（errors.ts，端到端实测覆盖）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# HTTP 错误代码目录（errors.ts，端到端实测覆盖）

| Error class（错误类） | HTTP status | code | Representative trigger observed in app.test.ts（在 app.test.ts 中观察到的代表性触发场景） |
|---|---|---|---|
| RequestValidationError | 400 | REQUEST_VALIDATION_FAILED | 必填字段缺失、金额/币种格式错误、期限不匹配、sourceTransactionRef 重复 |
| InsufficientBalanceError | 409 | INSUFFICIENT_AVAILABLE_BALANCE | AMEND_DECREASE/UTILIZE/交单/SG 开立/REIMBURSE 超出各自的充足性检查 |
| IllegalStateTransitionError | 409 | ILLEGAL_STATE_TRANSITION | 重复 release/reject/cancel/acknowledge/maker-submit；即期 UTILIZE 未经 Maker Submit 即释放；根 ISSUE 尚未 Released |
| NotFoundError | 404 | NOT_FOUND | 在任意 GET 或操作路由上传入未知的 balanceContractId/movementId |
| NaturalKeyAlreadyExistsError | 409 | NATURAL_KEY_ALREADY_EXISTS | 对已是 ACTIVE 的自然键重复执行 ISSUE / CREATE |
| ContractVersionConflictError | 409 | CONTRACT_VERSION_CONFLICT | 在本轮所读取的 routes/app.test.ts 相关部分中未直接被测试覆盖 |

## Source Evidence

- `src/errors.ts:1-62`

## Related Knowledge

- Express Routes + End-to-End API Behavior
- [[Business-Rule-Index]]
