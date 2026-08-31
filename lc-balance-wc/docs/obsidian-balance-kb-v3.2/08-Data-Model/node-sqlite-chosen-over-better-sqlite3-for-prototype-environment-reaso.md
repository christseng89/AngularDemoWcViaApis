---
knowledge_id: node-sqlite-chosen-over-better-sqlite3-for-prototype-environment-reaso
title: "选用 node:sqlite 而非 better-sqlite3，是出于原型环境限制，并非架构上的偏好"
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

# 选用 node:sqlite 而非 better-sqlite3，是出于原型环境限制，并非架构上的偏好

本服务使用 Node 内建的 node:sqlite（DatabaseSync）而非 better-sqlite3，纯粹是因为原型开发所用的机器缺少编译 better-sqlite3 原生绑定所需的 Visual Studio C++ 构建工具链。node:sqlite 支持与 store 层原本就使用的相同的具名参数（@name）预处理语句写法，因此选择这个引擎并未要求 Repository 层做任何改动。

## 来源证据

- `Balance-Component-DB-Design.txt §1 (lines 41-45)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
