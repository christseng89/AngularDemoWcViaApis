---
knowledge_id: channelfunction-catalog-14-named-business-functions
title: 'ChannelFunction 目录 — 14 个命名业务功能'
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: 'N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]'
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# ChannelFunction 目录 — 14 个命名业务功能

`GET /channel/functions` 是 Angular 功能目录的 façade contract 镜像。现行目录共 18 个命名功能：A1、A2、A3、A3S、A4、A6–A11 与 B1–B7；A5 已移除。每条记录携带 instrument、movement choice、parent/currency/submit policy 与 `compoundLegs`。B5 的 `compoundLegs` 为 `[]`。

## Source Evidence

- `balance-component-channel-api.yaml lines 587-665 (ChannelFunction schema)`
- `balance-component-channel-api.yaml lines 832-982 (AllChannelFunctions example, all 14 entries)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
