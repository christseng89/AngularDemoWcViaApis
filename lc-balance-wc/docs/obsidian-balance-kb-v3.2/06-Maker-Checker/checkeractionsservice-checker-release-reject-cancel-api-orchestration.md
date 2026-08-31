---
knowledge_id: checkeractionsservice-checker-release-reject-cancel-api-orchestration
title: "CheckerActionsService——Checker release/reject/cancel API 编排"
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

# CheckerActionsService——Checker release/reject/cancel API 编排

一个可注入（`providedIn: 'root'`）的服务，只负责决定该发起哪个 Checker API 调用、以什么顺序、在什么条件下发起，仅依赖 CheckerActionContext 接口与 API client。该服务从不修改组件状态；最终解析为一个 CheckerActionOutcome 联合类型（{kind:'released', result} | {kind:'documentArrivalAcknowledged'} | {kind:'failed', message}），由调用方自行决定相应的 UI 效果。

## Source Evidence

- `checker-actions.service.ts:9-47`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
