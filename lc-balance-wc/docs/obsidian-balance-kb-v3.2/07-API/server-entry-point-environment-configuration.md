---
knowledge_id: server-entry-point-environment-configuration
title: "服务器入口点／环境配置"
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

# 服务器入口点／环境配置

server.ts 从 process.env 中读取 PORT（默认 4100）与 DB_PATH（默认 'balance-component.sqlite'），通过 createDb() 打开 SQLite 数据库，通过 createApp(db) 构建应用，然后开始监听。除此之外没有其他启动逻辑存放在这里——所有路由/服务的装配都在 app.ts 中完成，测试中直接通过 createApp(createDb(':memory:')) 调用，而不经过 server.ts。

## Source Evidence

- `src/server.ts:1-14`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
