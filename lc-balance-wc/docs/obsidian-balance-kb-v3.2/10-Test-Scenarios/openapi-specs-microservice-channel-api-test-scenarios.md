---
knowledge_id: openapi-specs-microservice-channel-api-test-scenarios
title: "OpenAPI 规格——微服务 + Channel API 测试场景"
domain: Balance
category: Test Scenarios
snapshot_date: 2026-08-22
tags:
  - balance
  - test-scenario
---

# OpenAPI 规格——微服务 + Channel API 测试场景

从本主题范围的测试文件中提取了10个测试场景。这些场景所证明的规则详见 OpenAPI Specs — Microservice + Channel API 与 [[Business-Rule-Index]]。

| 场景 | 前置条件（Given） | 触发操作（When） | 预期结果（Then） | 来源 |
|---|---|---|---|---|
| A1 LC Issue 会根据容差推导出 ceilingAmount，且要求调用方提供 currency | lcNumber LC00123 尚不存在任何既有的 Logical Contract。 | POST /balance-movements，参数为 instrumentType=IPLC_LC，movementType=ISSUE，amount=100000.00，tolerancePct=10，currency=USD（必填，属于根级创建）。 | 返回 201——创建了 currency=USD 的新 BalanceContract v1，状态为 ACTIVE；BalanceMovement 为 PENDING，amount=100000.00，ceilingAmount=110000.00。 | `balance-component-api.yaml lines 93-101 (v0.3.0 changelog), 331-341 (channel example a1_lc_issue)` |
| 非原始（non-origin）动账上的币种不匹配会被拒绝 | 一份已存在的、currency=USD 的 ACTIVE 状态合约。 | POST /balance-movements 解析到该合约（通过 balanceContractId 或匹配的 naturalKey），调用方提供的 currency=EUR。 | 返回 409 CURRENCY_MISMATCH；不会创建任何记录（此情况下创建被完全拒绝，而不是部分应用）。 | `balance-component-api.yaml lines 55-61, 835-839` |
| 针对已 ACTIVE 状态的自然键（natural key）再次 ISSUE 会被拒绝 | lcNumber LC00123 已能解析出一份 ACTIVE 状态的 IPLC_LC 合约。 | POST /balance-movements，参数为 instrumentType=IPLC_LC，movementType=ISSUE，针对同一个自然键。 | 返回 409 NATURAL_KEY_ALREADY_EXISTS；调用方应改为针对既有合约提交非创建类的 movementType。 | `balance-component-api.yaml lines 187-190, 762-768` |
| 对同一个 eventSeq 的幂等重复提交会返回既有记录 | (balanceContractId=X, eventSeq=3) 已存在一笔 PENDING 状态的动账。 | 再次以相同的 (balanceContractId=X, eventSeq=3) 组合调用 POST /balance-movements，其余字段相同或不同均可。 | 返回 200（而非 201）——既有的 BalanceMovement 原样返回；不会产生重复的 PENDING 记录，也不产生任何余额影响。 | `balance-component-api.yaml lines 756-760, 825-829` |
| A4（Sight UTILIZE）在未经过 Maker Submit 之前 release 会被阻止 | A3 创建了一笔 Sight tenor 的 IPLC_LC UTILIZE，仍处于 PENDING 状态，makerSubmittedAt 为 null。 | Checker 直接调用 POST /balance-movements/{id}/release（跳过 /maker-submit）。 | 返回 409（属于非法状态类错误）——release 被拒绝。当先调用 POST /balance-movements/{id}/maker-submit（设置 makerSubmittedAt）之后，随后的 release 会成功，并将状态从 PENDING 转换为 RELEASED。 | `balance-component-api.yaml lines 281-289, 919-938, 985-994` |
| 超出父级 Tight Available Balance 的 SHGT Issue 会被拒绝 | 父级 IPLC_LC 的 Tight Available Balance = 24,000。 | POST /balance-movements，参数为 instrumentType=SHGT，movementType=ISSUE，已设置 parentLogicalContractId，amount=30,000。 | 返回 409 InsufficientBalanceError；不会创建任何 PENDING 状态的 SHGT 记录。 | `balance-component-api.yaml lines 110-117, 777-786` |
| 当 Shipping Guarantee 仍未结清时，A10/B6 CLOSE 会被拒绝 | 根级 IPLC_LC 的 SG Confirmed Balance = 10,000（非零）；此外没有其他未结的 PENDING 事件。 | 针对根级合约 POST /balance-movements，movementType=CLOSE，amount = 当前 Confirmed Balance。 | 返回 409 INSUFFICIENT_AVAILABLE_BALANCE——不满足资格条件（SG Confirmed Balance 必须恰好为 0）。GET /balance-contracts/close-eligible 会正确地将该 LC 排除在外。 | `balance-component-api.yaml lines 456-476, 616-631` |
| A10/B6 CLOSE 的金额在 Submit 与 Release 两个时点都必须与 Confirmed Balance 完全一致 | 根级 LC 符合 Close 资格，Submit 时的 Confirmed Balance = 5,000；提交了一笔 amount=5,000 的 CLOSE 动账，进入 PENDING 状态。 | 在 Submit 与 Release 之间，该合约的 Confirmed Balance 由于某种原因发生了变化（例如一笔无关的并发动账被释放），导致其不再等于该 CLOSE 动账已冻结的 ceilingAmount。 | POST /balance-movements/{id}/release 返回 409 ILLEGAL_STATE_TRANSITION；调用方必须取消并以当前数字重新提交 CLOSE——服务端绝不会自动重新计算。 | `balance-component-api.yaml lines 472-476, 953-959` |
| v1.15.0 ——独立的 PENDING 状态 SG 赎回不会提前释放容量 | SG G01 的未结清风险敞口已计入父级 LC 的 offBalanceExposure；针对 SG G01 提交了一笔独立的 A9 FULL_REDEEM（PENDING 状态，未与任何 UTILIZE 共享 businessEventId），但尚未经 Checker Release。 | 针对同一父级 LC 提交了第二笔无关的 SG Issue（A8）或 Document Arrival（A3），其金额需要该赎回的容量已经被释放才能通过。 | 该无关的提交会依据仍将该 PENDING 状态赎回计为未结清（尚未抵销）的 offBalanceExposure 进行校验——在该赎回真正被 RELEASED 之前，会被拒绝/受限，如同该赎回从未被提交过一样。 | `balance-component-api.yaml lines 426-437, 1650-1661` |
| Channel API 会拒绝任何非原始（non-origin）功能上出现的 currency 字段 | functionCode=A2（LC Amendment，属于派生/CARRIED 币种功能）。 | POST /channel/transactions 的请求体中包含 `currency` 属性（例如 "USD"），而 ChannelDerivedTransactionRequest 并未声明该字段，且 additionalProperties:false 明确禁止该字段。 | 返回 400 REQUEST_VALIDATION_FAILED——schema 校验失败，该字段绝不会被静默接受/忽略。 | `balance-component-channel-api.yaml lines 53-66, 755-771` |
