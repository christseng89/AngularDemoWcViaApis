---
knowledge_id: API-Index
title: "API 索引"
domain: Balance
category: Index
snapshot_date: 2026-08-31
tags:
  - balance
  - index
  - api
---

# API 索引

涵盖该微服务自身的 REST API（`analysis/balance-component-api.yaml`）、更轻量的 Web/Mobile Channel-API 门面层（`analysis/balance-component-channel-api.yaml`），以及实现这些接口的 Express 路由。

## 已萃取的概念

- [[balance-movements-router-endpoint-surface|Balance Movements Router 端点介面]]
- [[balance-contracts-router-endpoint-surface|Balance Contracts Router 端点介面]]
- [[app-bootstrap-and-centralized-error-handling|应用启动（App bootstrap）与集中式错误处理]]
- [[rate-limiting-scoped-to-the-write-surface-only|限流（Rate limiting）仅作用于写入端点]]
- [[typed-apierror-hierarchy-1-1-with-http-status-code|带类型的 ApiError 层级结构，与 HTTP 状态码/错误码一一对应]]
- [[server-entry-point-environment-configuration|服务器入口点/环境配置]]
- [[post-balance-movements-creation-decision-flow|POST /balance-movements 创建请求的端到端决策流程图]]
- [[post-balance-movements-currency-derivation-and-sufficiency-check-decis|创建请求的币别推导与充足性检查决策流程图]]
- [[idempotent-movement-creation-by-contract-eventseq|按 (contract, eventSeq) 实现的幂等 movement 创建]]
- [[re-issue-guard-on-natural-key|基于自然键（natural key）的重复 ISSUE 防护]]
- [[sourcetransactionref-uniqueness-per-contract|sourceTransactionRef 在同一合约内的唯一性]]
- [[tenor-flow-control-on-acceptance-creation|Acceptance 创建时的期限（Tenor）流程控制]]
- [[root-contract-s-own-issue-must-be-released-before-any-other-action|根合约自身的 ISSUE 必须先被放行（Released），才能执行任何其他操作]]
- [[sight-tenor-utilize-4-eyes-gate-requires-a-real-maker-submit-before-re|即期（Sight）期限下 UTILIZE 的双人复核（4-eyes）关卡：放行前必须先有真实的 Maker 提交]]
- [[maker-checker-movement-lifecycle-movementstatus-state-machine|Maker/Checker Movement 通用状态机（MovementStatus）总览]]
- [[maker-checker-lifecycle-across-the-action-endpoints|跨动作端点的 Maker/Checker 状态流转总览]]
- [[post-balance-movements-id-maker-submit-a4-s-own-real-maker-submit|POST /balance-movements/:id/maker-submit — A4 自身真实的 Maker 提交]]
- [[post-balance-movements-id-acknowledge-a3-a3s-checker-acknowledgment|POST /balance-movements/:id/acknowledge — A3/A3S 的 Checker 确认]]
- [[post-balance-movements-id-reject-checker-4-eyes-decline|POST /balance-movements/:id/reject — Checker 在双人复核下的拒绝]]
- [[post-balance-movements-id-cancel-maker-ec-error-correction|POST /balance-movements/:id/cancel — Maker 的错误更正（EC，Error Correction）]]
- [[b3-present-docs-eplc-examination-release-single-use-consumed-by-b4-not|B3（Present Docs / EPLC_EXAMINATION）放行仅限一次性使用，由 B4 消费而非重复放行]]
- [[b3-present-docs-real-release-then-b4-consumes-it-via-referencedtransac|B3 真实放行后由 B4 通过引用消费的端到端流程]]
- [[present-docs-earmark-creation-time-sufficiency-check-b3|Present Docs Earmark 在创建时的充足性检查（B3）]]
- [[present-docs-earmark-pending-approved-bucket-transition-on-release|Present Docs Earmark 在放行时从 Pending 转入 Approved 分桶]]
- [[eplc-due-from-issuing-bank-reimburse-sufficiency-check|EPLC_DUE_FROM_ISSUING_BANK REIMBURSE 的充足性检查]]
- [[currency-decimal-place-minor-unit-enforcement-at-the-request-layer|请求层的币别小数位（最小货币单位）校验]]
- [[amount-must-be-a-valid-positive-monetaryamount-at-the-request-layer|请求层要求 amount 必须是合法且为正的 MonetaryAmount]]
- [[requireissuereleased-opt-in-catalog-filter|requireIssueReleased 可选启用的目录过滤条件]]
- [[includeanystatus-opt-in-on-get-balance-contracts-closed-contract-looku|GET /balance-contracts 上可选启用的 includeAnyStatus（用于查询 CLOSED 合约）]]
- [[get-balance-contracts-close-eligible-a10-b6-step-1-eligibility-hint|GET /balance-contracts/close-eligible — A10/B6 第一步的可关闭资格提示]]
- [[contingentaccountentry-generated-once-at-creation-immutable-thereafter|contingentAccountEntry 仅在创建时生成一次，此后不可变]]
- [[point-in-time-balance-snapshots-balance-as-of-eventsnapshot-family|某一时点的余额快照（balance-as-of / eventSnapshot 家族）]]
- [[sight-only-eventsnapshot-preservation-across-a4-finalize-finalizeevent|仅限即期（Sight）的 eventSnapshot 在 A4 finalize 过程中的保留（finalizeEventSnapshot 家族）]]
- [[get-balance-movements-businesseventid-cross-contract-linked-leg-lookup|GET /balance-movements?businessEventId= 跨合约的关联分腿（linked leg）查询]]
- [[microservice-oas-endpoint-inventory|微服务 OAS 端点清单]]
- [[channel-oas-endpoint-inventory|Channel OAS 端点清单]]
- [[channel-api-is-a-spec-only-contract-not-a-running-service|Channel API 只是规格契约，并非实际运行中的服务]]
- [[monetaryamount-decimal-string-currency-driven-scale|MonetaryAmount — 十进制字符串，精度由币别决定]]
- [[balancemovementcreaterequest-field-surface|BalanceMovementCreateRequest 字段清单]]
- [[error-channelerror-code-taxonomy|Error / ChannelError 错误码分类体系]]
- [[HTTP-Retry-Policy|HTTP 安全读取重试策略]]
- [[channelfunction-catalog-14-named-business-functions|ChannelFunction 目录 — 14 个命名业务功能]]
- [[currency-derivation-server-side-three-tier|币别推导（服务端，三层规则）]]
- [[one-movement-one-leg-one-call-correlation-without-atomicity|旧版逐腿调用模型（历史相容说明；现行 compound 写入必须原子）]]
- [[idempotency-key-balancecontractid-eventseq|幂等键：(balanceContractId, eventSeq)]]
- [[maker-checker-4-eyes-lifecycle|Maker/Checker 双人复核（4-eyes）生命周期]]
- [[persisted-event-snapshot-family-eventsnapshot-and-its-5-siblings|持久化的 Event Snapshot 家族（eventSnapshot 及其 5 个同级字段）]]
- [[a10-b6-close-close-movementtype|A10/B6 关闭（CLOSE movementType）]]
- [[channel-currency-code-rule-input-vs-carried|Channel 币别代码规则（INPUT 与 CARRIED 的区别）]]
- [[channel-compound-leg-functions-a3s-b4-b5|Channel 复合分腿功能：A3S、B4、B5]]
- [[confirmed-available-tight-available-balance-derivation|Confirmed / Available / Tight Available Balance 的推导逻辑]]
- [[off-balance-sheet-exposure-present-docs-earmark-import-export-analogs|表外风险敞口与 Present Docs Earmark（进口/出口的对应概念）]]
- [[contingent-account-entry-vs-pass-through-account-entry-gl-ownership-bo|Contingent Account Entry 与直通式 Account Entry 的区别（GL 归属边界）]]
- [[explicit-scope-boundary-contingent-liability-only-not-gl-settlement|明确的范围边界——仅限或有负债，不涉及 GL/清算]]

延伸阅读：[[Business-Rule-Index]]、[[Balance-Traceability-Matrix]]。

## 2026-08-31 OAS 同步

- 微服务 OAS：`1.42.1`；Channel OAS：`1.9.0`。本次没有新增 endpoint 或成功 response field；新增 `x-client-retry-policy` 记录 UI 安全读取的操作策略。
- Channel OAS 是逻辑 façade 契约，参考 Angular 实作仍直接调用 microservice adapter；Retry metadata 不改变 Channel wire contract。
- A3S／A6／B4 等多腿动作映射到 atomic compound submit／release；`partialSuccess` 仅保留旧版相容语义。
- Transaction Index 的 SG／IB／EB Amount 与 Tight LC Balance 是 UI projection，不是新增 wire fields。见 [[Transaction Index Selection Contract]]。
