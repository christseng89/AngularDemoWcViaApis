---
knowledge_id: post-balance-movements-request-service-layer-rejection-gates
title: "POST /balance-movements ——请求层/服务层的拒绝关卡"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# POST /balance-movements ——请求层/服务层的拒绝关卡

| 条件 | 所在层 | HTTP 状态码 | 错误代码 | 备注 |
|---|---|---|---|---|
| amount 不符合 MonetaryAmount 格式 | zod schema（路由层） | 400 | REQUEST_VALIDATION_FAILED | 例如 'not-a-number' |
| amount = 0 或为负数 | zod schema（路由层） | 400 | REQUEST_VALIDATION_FAILED | 根据决策记录，AMEND（B2）豁免于「仅校验符号」的规则，本轮未直接重新核实 |
| amount 小数位数 > 该币种配置的精度 | zod schema（路由层） | 400 | REQUEST_VALIDATION_FAILED | JPY 0 位小数，KWD 3 位小数，未知币种默认 2 位小数 |
| currency 缺失 | zod schema（路由层） | 400 | REQUEST_VALIDATION_FAILED |  |
| naturalKey 与 balanceContractId 均未提供 | zod schema（路由层） | 400 | REQUEST_VALIDATION_FAILED |  |
| 针对已处于 ACTIVE 状态的 natural key 再次创建 movementType | 服务层（resolveOrCreateContract） | 409 | NATURAL_KEY_ALREADY_EXISTS | 防止重复 ISSUE 的守卫 |
| 同一合约上 sourceTransactionRef 重复使用 | 服务层 | 400 | REQUEST_VALIDATION_FAILED |  |
| 在 Sight 声明的母 LC 之下执行 Acceptance CREATE | 服务层 | 400 | REQUEST_VALIDATION_FAILED |  |
| Acceptance 的 tenorType 与母 LC 的 tenorType 不一致 | 服务层 | 400 | REQUEST_VALIDATION_FAILED |  |
| 根合约自身的 ISSUE 尚未 RELEASED，却提交了非 ISSUE 的 movement | 服务层（assertRootIssueReleased） | 409 | ILLEGAL_STATE_TRANSITION |  |
| 某项领域充足性检查未通过（Utilize/SG Issue/AmendDecrease/PresentDocs/Redeem/Close） | domain/*.ts（经由服务层调用） | 409 | INSUFFICIENT_AVAILABLE_BALANCE | 错误信息中会列明具体比较的数字 |
| 同一 (contract, eventSeq) 被重复提交 | 服务层（幂等性处理） | 200（而非 201） | 不适用 | 返回原始记录 |

## Source Evidence

- `src/routes/balanceMovements.ts`
- `test/unit/app.test.ts:11-2444`

## Related Knowledge

- Express Routes + End-to-End API Behavior
- [[Business-Rule-Index]]
