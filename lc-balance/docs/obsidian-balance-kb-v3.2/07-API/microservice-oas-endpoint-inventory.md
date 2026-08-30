---
knowledge_id: microservice-oas-endpoint-inventory
title: "微服务 OAS 端点清单"
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

# 微服务 OAS 端点清单

balance-component-api.yaml（v1.16.0）定义了以下端点：GET /balance-contracts（按自然键解析，支持 includeAnyStatus/legSeq 参数）、GET /balance-contracts/catalog（分页选取器列表，支持 requireIssueReleased 参数）、GET /balance-contracts/close-eligible（A10/B6 选取器提示）、GET /balance-contracts/{id}/balance（支持 asOf 参数）、GET /balance-contracts/{id}/movements（事件时间线，无服务端过滤条件）、POST /balance-movements（创建/earmark）及 GET /balance-movements?businessEventId=（关联腿查询）、GET /balance-movements/{id}/balance-as-of、POST /balance-movements/{id}/release、/maker-submit、/acknowledge、/reject、/cancel。早期草稿中记录过的四个端点已确认从未实现，并在 v1.0.0 中从规范中移除：GET .../history、POST .../versions、PATCH /balance-movements/{id}、POST /balance-movements/{id}/reversal。

## Source Evidence

- `balance-component-api.yaml lines 155-207 (v1.0.0 changelog, REMOVED/ADDED/CORRECTED endpoints)`
- `balance-component-api.yaml lines 503-1195 (paths block)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
