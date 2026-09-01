---
knowledge_id: B5-Settlement-Reimbursement-Maturity
title: 'B5 — Acceptance Settlement / Maturity'
domain: Balance
category: Function Analysis
function_code: B5
function_direction: Export
instrument_type: EPLC_ACCEPTANCE
movement_type: FULL_SETTLE
status: CONFIRMED
snapshot_date: 2026-09-01
tags:
  - balance
  - function-analysis
  - export
  - b5
  - settlement
  - acceptance
---

# B5 — Acceptance Settlement / Maturity

## Current behavior

B5 settles one selected `EPLC_ACCEPTANCE`. Maker Submit creates one PENDING
`FULL_SETTLE` or `PARTIAL_SETTLE` movement; Checker Release releases that
movement only.

B5 does not resolve, create, reimburse, release, reject, or cancel an
`EPLC_ACCEPTANCE_REIMB_RECEIVABLE`. That asset may be created by B4, but it is
outside B5 processing.

## Input and derivation

- Select the parent Export Confirmation and an eligible Acceptance by LC Number
  and EB Number.
- Currency is carried from the selected contract.
- Amount equal to Available Balance derives `FULL_SETTLE`.
- Amount below Available Balance derives `PARTIAL_SETTLE`.
- Amount above Available Balance is rejected.

## API mapping

- Maker: one `POST /balance-movements`.
- Checker: one `POST /balance-movements/{movementId}/release`.
- Reject/Delete Pending: operate on the same single movement.
- Channel metadata reports `compoundLegs: []` for B5.

## Business Case Runner

Existing cases generate multiple B5 settlements. A registry regression test
requires at least three B5 samples and verifies that no `REIMBURSE` movement is
created by Run All Cases.

## Related knowledge

- [[compound-submission-linked-legs]]
- [[Maker Checker Lifecycle]]
- [[Balance Component Overview]]
