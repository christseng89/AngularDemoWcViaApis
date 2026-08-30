---
knowledge_id: checkutilizesufficiency-two-tier-hard-error-gate-v0-12
title: "checkUtilizeSufficiency 双层硬性 ERROR 闸门（v0.12）"
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

# checkUtilizeSufficiency 双层硬性 ERROR 闸门（v0.12）

针对某信用证的一笔 Document Arrival（UTILIZE），会依据两道上限进行检查，自 v0.12 起两者皆为硬性拒绝（而非仅是警告）：（1）requestedAmount 不得超过普通的 Available Balance；（2）requestedAmount 不得超过 Tight Available Balance = confirmedBalance − pendingDecreaseTotal − offBalanceExposure。在 v0.12 之前，第二道检查只是非阻断性的 WARNING；在一次业务已确认的实盘测试中，一笔超过 Tight 阈值的 Document Arrival 被预期应直接遭到拒绝，因此该检查被强化为 ERROR。

## 来源证据

- `microservices/balance-component/src/domain/offBalanceExposure.ts:261-312 (checkUtilizeSufficiency)`
- `test/unit/domain/offBalanceExposure.test.ts:82-172`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
