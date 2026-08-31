---
knowledge_id: contingent-liability-balance-figure-state-machine
title: "或有负债余额指标状态机"
domain: Balance
category: Domain Concept
status: INFERRED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 或有负债余额指标状态机

在贸易金融的或有负债会计处理中，信用证／保函／承兑的风险敞口指标，会沿着一条与该金融工具自身核准流程相呼应的生命周期演进：尚未核准的义务会立即影响"tight"／可用额度的检查（银行绝不能让两笔重叠的、仍处于 pending 状态的动用同时通过充分性检查），但只有真正获准（Released）的义务，才会计入经稽核的 Confirmed Balance。即期（Sight）与远期（Usance）付款期限，决定了某笔提示单据究竟是当日现金结算，还是形成一笔递延付款（远期汇票）义务，这也正是为何 Tenor（付款期限）的一致性要以结构化方式强制保证，而不是交由自由文本输入来把关。

## 来源证据

- `CLAUDE.md decision log ('Tight Available Balance now derives from Confirmed Balance...')`
- `microservices/balance-component/src/domain/balanceDerivation.ts (doc comments)`
- `microservices/balance-component/src/domain/tenorRouting.ts (doc comments)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
