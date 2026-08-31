---
knowledge_id: balancemovementcreaterequest-field-surface
title: "BalanceMovementCreateRequest 字段清单"
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

# BalanceMovementCreateRequest 字段清单

必填字段：instrumentType、movementType、eventSeq、amount、createdBy。可选/有条件字段：naturalKey 或 balanceContractId（二选一，不可同时提供）、parentLogicalContractId（SHGT ISSUE / EPLC_EXAMINATION CREATE 时必填）、currency（仅当确实是根级全新 Logical Contract 时才必填）、exposureNature、tolerancePct、tenorType/tenorDays/maturityDate、legRef、accountEntries、businessEventId、sourceTransactionRef（在同一合约内唯一）、referencedTransactionId（仅限 A6/B4）。

## Source Evidence

- `balance-component-api.yaml lines 1554-1619 (BalanceMovementCreateRequest schema)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
