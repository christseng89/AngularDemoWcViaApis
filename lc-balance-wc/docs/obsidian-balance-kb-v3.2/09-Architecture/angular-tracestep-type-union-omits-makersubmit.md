---
knowledge_id: angular-tracestep-type-union-omits-makersubmit
title: "Angular TraceStep.type 联合类型遗漏了 'makerSubmit'"
domain: Balance
category: Domain Concept
status: CONFLICT
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# Angular TraceStep.type 联合类型遗漏了 'makerSubmit'

balance-case-api.service.ts 的 TraceStep 接口将 `type` 声明为 'createMovement' | 'release' | 'snapshot' | 'note'——没有 'makerSubmit' 这个字面量——尽管后端确实会发出 type:'makerSubmit' 的 trace 记录（import-case-1/6/10 实际触发过，且在 server.test.js/runCase.test.js 中被直接断言）。由于该组件从未对 step.type 做穷尽式的 switch 判断（rowClass/statusText/detailText 使用带通用兜底分支的 if 链），因此不会崩溃，但这确实是后端实际的步骤类型词汇表与 Angular 客户端声明类型之间真实存在的类型漂移缺口。

## 证据来源

- `backend/server.js:59-62,109-124`
- `backend/test/server.test.js:186-206`
- `src/app/business-case-runner/balance-case-api.service.ts:12-22`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
