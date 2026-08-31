---
knowledge_id: release-shaped-step-types-dispatch-table-bal-124
title: "RELEASE_SHAPED_STEP_TYPES 分派表（BAL-124）"
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

# RELEASE_SHAPED_STEP_TYPES 分派表（BAL-124）

server.js 将 'release' 与 'makerSubmit' 这两种步骤类型统一为一张分派表（{subPath, bodyKey}）并共用同一个处理函数，因为两者本质上都是向某个动账的子路径发出 POST 请求，且都只携带一个请求体字段。此前为 B3 的“Present-Docs Checker 确认收单”而新增的 'acknowledge' 步骤类型，已于 2026-08-18 在 B3 被重新设计为通过标准步骤类型真正执行 RELEASE 后彻底移除——就本编排器而言，/acknowledge 端点在服务端已不再存在。

## Source Evidence

- `backend/server.js:48-62,109-124`
- `backend/test/server.test.js:215-234 (asserts trace.some(t=>t.type==='acknowledge') is false)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
