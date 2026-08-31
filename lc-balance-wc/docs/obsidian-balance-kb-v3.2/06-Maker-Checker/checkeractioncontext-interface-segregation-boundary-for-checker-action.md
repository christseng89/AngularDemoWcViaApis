---
knowledge_id: checkeractioncontext-interface-segregation-boundary-for-checker-action
title: "CheckerActionContext——Checker 动作的接口隔离（Interface Segregation）边界"
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

# CheckerActionContext——Checker 动作的接口隔离（Interface Segregation）边界

这是 CheckerActionsService 所依赖的唯一输入形态：submitResult（仅存在于当次会话的 Maker 状态）、selectedFunction、若干关联 leg 的 movementId 字段（matchedReceivableMovementId、dueFromIssuingBankMovementId、acceptanceMovementId、acceptanceReimbReceivableMovementId、arrivalSgRedeemMovementId）、createdBy，以及 selectedCheckerMovement（始终是真实的服务端数据，由一次真正独立的 Checker 搜索填充——不同于只存在于 Maker 自己浏览器会话中的 submitResult）。

## Source Evidence

- `checker-actions.service.ts:16-32`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
