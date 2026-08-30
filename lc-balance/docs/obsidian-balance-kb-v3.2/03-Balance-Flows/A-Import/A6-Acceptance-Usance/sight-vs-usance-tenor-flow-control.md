---
knowledge_id: sight-vs-usance-tenor-flow-control
title: "Sight 与 Usance 的 tenor 流程控制"
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

# Sight 与 Usance 的 tenor 流程控制

一条贸易金融的结算路由规则：Sight tenor 的信用证只能通过即期提款（straight drawdown / UTILIZE）结算，绝不通过远期汇票式的 Acceptance——因为不存在需要承兑的延期付款义务。Usance 信用证自身的子级 Acceptance 记录，必须精确继承其母合约所声明的 tenorType（BUYERS_USANCE/SELLERS_USANCE/DP/DA）——Acceptance 上 tenor 不一致会被作为不一致的金融工具而拒绝。

## 证据来源

- `microservices/balance-component/src/domain/tenorRouting.ts lines 1-14, 34-50`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
