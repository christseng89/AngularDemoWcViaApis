---
knowledge_id: orchestrator-hardening-rate-limiting-and-error-redaction-bal-118-bal-1
title: "编排器加固——速率限制与错误信息脱敏（BAL-118 / BAL-117）"
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

# 编排器加固——速率限制与错误信息脱敏（BAL-118 / BAL-117）

POST /api/business-cases/:id/run 自带一套速率限制器（120 次请求/60 秒，standardHeaders 开启，legacyHeaders 关闭），因为单次进入的请求会扇出为一连串下游微服务调用（是放大倍数最高的端点）。任何编排过程中抛出的错误都会在服务端以完整细节记录日志，但客户端只会收到一个通用的 {code:'ORCHESTRATION_ERROR', message:'An internal error occurred...'}——绝不会返回原始的下游错误文本，这堵住了此前一处漏洞：未经身份验证的调用方原本可以读取到内部错误细节。

## Source Evidence

- `backend/server.js:143-169`
- `backend/test/server.test.js:344-398,413-423`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
