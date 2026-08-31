---
knowledge_id: cors-allow-list-bal-103
title: "CORS 白名单（BAL-103）"
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

# CORS 白名单（BAL-103）

server.js 用一份明确的 ALLOWED_ORIGINS 白名单，取代了原先宽松的开放式 CORS()，默认为 Angular 开发服务器自身的 origin（http://localhost:4200，与 proxy.conf.json 的 :4300 目标一致），并可通过一个以逗号分隔的环境变量覆写，以适配其他部署环境。

## 证据来源

- `backend/server.js:18-22`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
