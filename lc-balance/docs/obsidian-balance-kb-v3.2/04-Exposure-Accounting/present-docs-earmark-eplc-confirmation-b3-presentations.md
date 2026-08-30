---
knowledge_id: present-docs-earmark-eplc-confirmation-b3-presentations
title: "单据提示圈存（EPLC_CONFIRMATION / B3 提示）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，参见 [[Source-to-Knowledge-Map|来源知识对照表]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 单据提示圈存（EPLC_CONFIRMATION / B3 提示）

在出口保兑（Confirmation）一侧，每一笔单据提示（Present Docs，B3，instrumentType 为 EPLC_EXAMINATION）都是针对该保兑信用证自身额度的一笔 MEMO_ONLY 圈存——多笔提示（例如 E01/E02/E03）合计不得超过该保兑的可用余额/紧缩可用余额，即便每一笔单独来看都是 MEMO_ONLY、本身从不移动总账。设置这项圈存正是为了检查"所有未结提示的总和"，从而弥补此前每笔提示都被单独拿去比对一个尚未真正被它们占用的余额的缺口。

## Source Evidence

- `microservices/balance-component/src/domain/offBalanceExposure.ts:109-120 (doc comment)`

## Related Knowledge

- [[Business-Rule-Index|业务规则索引]]
- [[Balance Component Overview|余额组件概览]]
