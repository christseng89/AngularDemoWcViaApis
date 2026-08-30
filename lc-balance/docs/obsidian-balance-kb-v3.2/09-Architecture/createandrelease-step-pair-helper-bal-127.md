---
knowledge_id: createandrelease-step-pair-helper-bal-127
title: "createAndRelease() 步骤对辅助函数（BAL-127）"
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

# createAndRelease() 步骤对辅助函数（BAL-127）

一个辅助函数，展开后与此前在登记表中以完整形式手写约 49 次的两个相同步骤对象（createMovement + release）完全一致。仅在 create 与 release 真正紧邻、中间没有其他步骤的情况下才会使用；任何需要一条 note、需要第二次 create，或需要复合/延迟 release（A3S/A6/B4/B5 风格，或 expectError 用例）的场景，仍会显式写出各个步骤，以确保真正重要的顺序永远不会被这层折叠隐藏起来。

## 证据来源

- `backend/data/businessCases.js:52-66`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
