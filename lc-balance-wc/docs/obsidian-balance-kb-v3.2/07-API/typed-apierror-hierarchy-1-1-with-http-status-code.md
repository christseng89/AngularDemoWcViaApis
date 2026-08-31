---
knowledge_id: typed-apierror-hierarchy-1-1-with-http-status-code
title: "带类型的 ApiError 层级结构，与 HTTP 状态/错误码一一对应"
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

# 带类型的 ApiError 层级结构，与 HTTP 状态/错误码一一对应

errors.ts 定义了 RequestValidationError（400/REQUEST_VALIDATION_FAILED）、InsufficientBalanceError（409/INSUFFICIENT_AVAILABLE_BALANCE）、IllegalStateTransitionError（409/ILLEGAL_STATE_TRANSITION）、NotFoundError（404/NOT_FOUND）、ContractVersionConflictError（409/CONTRACT_VERSION_CONFLICT）、NaturalKeyAlreadyExistsError（409/NATURAL_KEY_ALREADY_EXISTS）。在 app.test.ts 中观察到的每一个路由层与服务层业务规则违反情形，都恰好映射到这些类型中的其中一个。

## Source Evidence

- `src/errors.ts:1-62`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
