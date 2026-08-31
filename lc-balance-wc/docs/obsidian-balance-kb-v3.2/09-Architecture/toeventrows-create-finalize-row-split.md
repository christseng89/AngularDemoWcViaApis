---
knowledge_id: toeventrows-create-finalize-row-split
title: "toEventRows()——create/finalize 分行逻辑"
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

# toEventRows()——create/finalize 分行逻辑

模块级函数（由 InquireEventsService 与 LookUpPanelService 透过 movementsOf$ 共用），将一笔 BalanceMovement 拆分为一行“primary”，或者针对一种特定情形拆分为恰好两行（“create” + “finalize”）：即一笔发生在 SIGHT 期限合约上的 IPLC_LC/UTILIZE 动账，其状态已不再是 PENDING，且带有 releasedAt 时间戳。“create”行使用 movement.createdAt 作为 eventTime；“finalize”行使用 movement.releasedAt。两行都携带该动账真实的当前 eventStatus（绝非冻结值），即便是“create”行也是如此。

## Source Evidence

- `inquire-events.service.ts:82-96 toEventRows()`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
