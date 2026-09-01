---
title: Freshness Update Log 2026-09-01
domain: Balance
category: Freshness
snapshot_date: 2026-09-01
tags:
  - balance
  - freshness
  - source-sync
---

# Freshness Update Log — 2026-09-01

本次依当前 source code、OAS 与 tests 同步知识库，不沿用旧 UI 截图或已退役实现。

## 功能目录与 API 行为

- 现行 Import 功能为 A1、A2、A3、A3S、A4、A6、A7、A8、A9、A10、A11；A5 已移除。A3 统一接收 Document Arrival，并按母 LC tenor 导向 Sight 的 A4 或 Usance 的 A6。
- 现行 Export 功能为 B1–B7。
- B5 只对选定的 `EPLC_ACCEPTANCE` 建立一笔 `FULL_SETTLE` 或 `PARTIAL_SETTLE`。它不查找、建立、偿付、放行、拒绝或取消 `EPLC_ACCEPTANCE_REIMB_RECEIVABLE`，也不是 compound submission。
- B4 Usance 仍可建立 Acceptance 与 Reimbursement Receivable；Receivable 的后续收款／结算不属于 B5。
- Maker Submit 与 Checker Release 均使用实际 Microservice API；Channel OAS 是 façade contract，不是当前 Angular 的运行时中介层。

## Transaction Index 与服务端资格检查

Transaction Index 只提供即时候选清单。微服务在 Maker create 与 Checker Release 都重新验证资格，防止 Index 载入后状态改变或直接 API caller 绕过 UI：

- 一般 derived transaction 的目标合约必须仍为 `ACTIVE`；Close、Reopen 与 Expiry Amendment 采用各自明确例外。
- parent logical contract 必须存在且为 `ACTIVE`。
- A6 source 必须属于同一 LC、为已 acknowledge 且尚未 Maker Submit 的 PENDING A3／A3S `UTILIZE`；Release 时再验证 source 与 compound 顺序。
- B4 source 必须属于同一 Confirmation、为 RELEASED 且未被消费的 B3 `EPLC_EXAMINATION/CREATE`，并且不得已被另一笔 pending B4 选用。
- A4 Maker Submit 额外要求目标合约仍为 `ACTIVE` 且 tenor 为 `SIGHT`。

## Business Case Runner

- Registry 现有 35 个 cases。
- Readiness fixtures 在同一个 parent 下各保留三笔可选子交易：A3S `G01–G03`、A4/A6 `B01–B03`、A7/B5 `IB0001–IB0003`、B4 `E01–E03`。
- Case 执行过程中若 snapshot 的 Tight LC Balance 小于 0，orchestrator 自动建立并放行 Import A02 `AMEND_INCREASE` 或 Export B02 `AMEND`，金额等于负值的绝对值，再重新读取 snapshot 并确认 Tight 不小于 0。
- Cleanup Database 成功后，UI 同时清除 selected result、Run All results 与旧错误讯息。

## 契约与验证基准

- Microservice OAS：`1.44.0`。
- Channel OAS：`1.11.0`；B5 的 `compoundLegs` 为 `[]`。
- Backend unit tests：63/63；两套专案的 Run All Cases：35/35。

## Source evidence

- `backend/data/businessCases.js`
- `backend/server.js`
- `microservices/balance-component/src/service/movementContractService.ts`
- `microservices/balance-component/src/service/movementReleasePolicyService.ts`
- `microservices/balance-component/src/service/balanceService.ts`
- `src/app/transaction-builder/function-strategy.ts`
- `src/app/transaction-builder/maker-submit.service.ts`
- `src/app/transaction-builder/checker-actions.service.ts`
- `analysis/balance-component-api.yaml`
- `analysis/balance-component-channel-api.yaml`

## Related knowledge

- [[Transaction Index Selection Contract]]
- [[Function-API Integration Map]]
- [[B5-Settlement-Reimbursement-Maturity]]
- [[compound-submission-linked-legs]]
- [[business-case-runner-ui-single-run-vs-run-all-sequential-chain]]
- [[business-case-registry-backend-orchestrator-business-case-runner-ui-te]]
