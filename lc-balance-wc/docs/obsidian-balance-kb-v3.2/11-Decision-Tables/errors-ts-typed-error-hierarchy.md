---
knowledge_id: errors-ts-typed-error-hierarchy
title: "errors.ts 类型化错误层级体系"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# errors.ts 类型化错误层级体系

| Error Class（错误类） | HTTP Status | Code | Trigger（触发条件） |
|---|---|---|---|
| RequestValidationError | 400 | REQUEST_VALIDATION_FAILED | 请求体格式错误/无效（zod schema 校验失败） |
| InsufficientBalanceError | 409 | INSUFFICIENT_AVAILABLE_BALANCE | 充足性检查（Available 或 Tight Available）未通过 |
| IllegalStateTransitionError | 409 | ILLEGAL_STATE_TRANSITION | 非法的 MovementStatus 状态迁移（例如对已是 RELEASED/REJECTED 的记录再次执行 release） |
| NotFoundError | 404 | NOT_FOUND | 请求的资源不存在 |
| ContractVersionConflictError | 409 | CONTRACT_VERSION_CONFLICT | (logicalContractId, contractVersion) 组合重复 |
| NaturalKeyAlreadyExistsError | 409 | NATURAL_KEY_ALREADY_EXISTS | 以建立类 movementType（ISSUE/CREATE）提交，但对应的自然键已解析出一笔 ACTIVE 合约 |

## Source Evidence

- `microservices/balance-component/src/errors.ts:1-62`
- `microservices/balance-component/test/unit/errorsAndMoney.test.ts:13-25`

## Related Knowledge

- Data Model — DB Schema, Migrations, Stores, Types/Money/Errors
- [[Business-Rule-Index]]
