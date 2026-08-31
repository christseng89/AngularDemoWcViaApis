---
knowledge_id: checksagainsttightavailable-checksagainstplainavailable-getters
title: "checksAgainstTightAvailable / checksAgainstPlainAvailable getters"
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

# checksAgainstTightAvailable / checksAgainstPlainAvailable getters

两个 getter 共同决定当前所选功能/movementType 应渲染哪种实时客户端余额充足性（balance-sufficiency）警告，并与服务端实际生效的检查（plain Available 还是 Tight Available）保持一致。`checksAgainstTightAvailable` 覆盖 UTILIZE/HONOUR/ACCEPT、任何 Amend-Decrease 方向、B3 别名式的针对 EPLC_CONFIRMATION 的 CREATE，以及 A8 别名式的带 parent 的 ISSUE。`checksAgainstPlainAvailable` 则从中识别出同时具备真正 plain-Available 层级的子集（UTILIZE/HONOUR/ACCEPT/Amend-Decrease）——B3/A8 不具备该层级，因此即便金额同时超出两个上限，也总是回落到 Tight 层级的警告。

## Source Evidence

- `maker-panel.component.ts:358-405 (both getters + doc comments)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
