---
knowledge_id: 2026-08-technical-debt-cleanups
title: "2026-08 技术债清理：删除 ContractVersionConflictError 死代码；BAL-129 通用 500 处理器补齐测试覆盖"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-26
tags:
  - balance
  - domain-concept
  - tech-debt
---

# 2026-08 技术债清理：删除 ContractVersionConflictError 死代码；BAL-129 通用 500 处理器补齐测试覆盖

两项低优先级的技术债清理，均确认为纯粹的清理/加固，不改变任何对外行为。

## 1. 删除 `ContractVersionConflictError`——确认为真正的死代码

`errors.ts` 中原有的 `ContractVersionConflictError` 已被删除。经确认，全代码库中不存在任何 `throw new ContractVersionConflictError` 的调用点；它原本是为“新建合约版本”流程准备的守卫，但 `contractVersion` 字段在整个代码库中处处硬编码为 `1`，从未真正实现过“为同一 Logical Contract 递增版本号”的流程——该守卫从一开始就没有对应的生产路径会触发它。

需要特别澄清的是：这与 `ContractStatus.SUPERSEDED`/`markSuperseded()` 是两回事——后者是一条已被记录在案、明确保留给未来使用的流程（"reserved future flow"），本次清理并未触碰。`ContractVersionConflictError` 与 `SUPERSEDED`/`markSuperseded()` 分别对应两个不同的、互不依赖的"未来可能用到"设计，只是前者被确认彻底无引用而删除，后者仍然保留。

验证方式：在 `errors.ts` 及 `src/`/`test/` 全目录搜索 `ContractVersionConflictError`，结果为零命中（该标识符已完全不存在于代码库中）。

## 2. BAL-129——微服务自身通用 500 处理器补齐测试覆盖

`app.ts` 中的通用（非 `ApiError`）错误处理中间件——BAL-117 已修复的、"绝不向调用方泄露内部错误文本"的兜底逻辑——此前没有任何测试覆盖：如果这段修复被无意中回退，不会有任何测试失败去捕捉到它。现已新增一条专门测试，直接从服务层抛出一个带有可识别标记文本的普通 `Error`（非 `ApiError` 子类），断言：(1) HTTP 响应为 `500 {code:'INTERNAL_ERROR', message:'An internal error occurred.'}`，响应体中绝不包含原始错误文本；(2) `console.error` 仍然被调用、且传入的是包含原始错误文本的真实错误对象（服务端日志不受影响，只是不再泄露给调用方）。覆盖率因此提升至 100%/100%（该分支此前是唯一的覆盖率缺口）。

## Source Evidence

实现:
- `microservices/balance-component/src/errors.ts (全文件搜索 ContractVersionConflictError，零命中)`
- `microservices/balance-component/src/store/balanceContractStore.ts（markSuperseded()/ContractStatus.SUPERSEDED 未受影响，仍为保留中的未来流程——未在本次清理中改动）`

测试:
- `microservices/balance-component/test/unit/app.test.ts:3885-3906 (describe('Generic 500 handler (Quality-report-balance.md BAL-117/BAL-129)')，直接验证响应体不泄露内部错误文本、且 console.error 记录了真实错误)`

## Related Knowledge
- orchestrator-hardening-rate-limiting-and-error-redaction-bal-118-bal-1（同一"不泄露内部错误细节"主题，但作用于 backend/server.js 的业务案例编排器，而非本笔记所述的微服务自身 app.ts）
- [[Business-Rule-Index]]
- [[Balance Component Overview]]
