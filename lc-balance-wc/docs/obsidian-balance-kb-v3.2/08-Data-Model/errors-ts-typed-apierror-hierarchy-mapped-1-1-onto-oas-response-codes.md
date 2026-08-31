---
knowledge_id: errors-ts-typed-apierror-hierarchy-mapped-1-1-onto-oas-response-codes
title: "errors.ts ——与 OAS 响应代码一一对应的类型化 ApiError 继承体系"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# errors.ts ——与 OAS 响应代码一一对应的类型化 ApiError 继承体系

一个抽象的 ApiError 基类（httpStatus、code、toBody()）支撑着 6 个具体子类：RequestValidationError（400/REQUEST_VALIDATION_FAILED）、InsufficientBalanceError（409/INSUFFICIENT_AVAILABLE_BALANCE）、IllegalStateTransitionError（409/ILLEGAL_STATE_TRANSITION）、NotFoundError（404/NOT_FOUND）、ContractVersionConflictError（409/CONTRACT_VERSION_CONFLICT）以及 NaturalKeyAlreadyExistsError（409/NATURAL_KEY_ALREADY_EXISTS）。每个子类都对应记录了它所要执行的具体设计文档章节/业务规则。

## 来源证据

- `microservices/balance-component/src/errors.ts:1-62`
- `microservices/balance-component/test/unit/errorsAndMoney.test.ts:13-25`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
