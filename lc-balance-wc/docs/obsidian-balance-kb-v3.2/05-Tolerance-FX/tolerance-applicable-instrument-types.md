---
knowledge_id: tolerance-applicable-instrument-types
title: "TOLERANCE_APPLICABLE_INSTRUMENT_TYPES"
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

# TOLERANCE_APPLICABLE_INSTRUMENT_TYPES

模块级别的 ReadonlySet<InstrumentType>，精确包含 IPLC_LC、EPLC_LC、EPLC_CONFIRMATION 三者。任何不在此集合中的 instrumentType，都会使 computeCeilingAmount() 直接返回未经变更的原始面值金额，无论 movementType 或 tolerancePct 为何。

## 来源证据

- `src/domain/tolerance.ts:32`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
