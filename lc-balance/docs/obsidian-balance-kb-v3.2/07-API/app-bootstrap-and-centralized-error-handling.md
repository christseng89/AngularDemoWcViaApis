---
knowledge_id: app-bootstrap-and-centralized-error-handling
title: "应用启动（App bootstrap）与集中式错误处理"
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

# 应用启动（App bootstrap）与集中式错误处理

app.ts 负责装配 helmet、express.json()、两个路由器（router），一个 GET /healthz 存活探测端点，以及一个位于最后的 Express 错误处理中间件。任何被抛出的 ApiError 子类都会以其自身的 httpStatus 序列化为 {code, message}；任何其他被抛出的值都会通过 console.error 记录在服务端日志中，但对外统一返回一个通用的 {code:'INTERNAL_ERROR', message:'An internal error occurred.'}（500）——这是刻意为之，目的是不把内部错误文字回显给调用方（BAL-117，本服务没有身份验证机制）。

## Source Evidence

- `src/app.ts:1-44`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
