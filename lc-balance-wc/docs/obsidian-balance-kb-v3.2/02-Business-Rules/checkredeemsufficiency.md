---
knowledge_id: checkredeemsufficiency
title: "checkRedeemSufficiency()"
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

# checkRedeemSufficiency()

一个纯函数，接收 {redeemAmount, sgAvailableBalance}（均为 Decimal 类型）作为参数，返回 RedeemCheckResult。当 redeemAmount > sgAvailableBalance 时判定失败，其错误信息明确将 Available Balance 定义为"Confirmed Balance 减去任何其余仍处于 PENDING、已预先占用的结算金额"。该函数被逐字复用于 SHGT 的 PARTIAL_REDEEM/FULL_REDEEM、Acceptance 的 PARTIAL_SETTLE/FULL_SETTLE，以及（依其自身文档注释所述）资产侧的 REIMBURSE/RECLASSIFY_OUT 这两个 movementType。

## Source Evidence

- `microservices/balance-component/src/domain/shgtRedeem.ts lines 31-40`
- `microservices/balance-component/src/service/balanceService.ts lines 189-198, 247-250`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
