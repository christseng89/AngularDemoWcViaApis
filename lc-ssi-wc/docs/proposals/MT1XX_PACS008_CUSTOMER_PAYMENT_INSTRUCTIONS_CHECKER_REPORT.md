# Independent BA Checker Report — MT1xx / pacs.008 Customer Payment Instructions

**Review type:** Fresh-reader independent BA review  
**Date:** 2026-09-16  
**Reviewed artifact:** `MT1XX_PACS008_CUSTOMER_PAYMENT_INSTRUCTIONS_PROPOSAL.md` v0.1  
**Reviewed SHA-256:** `A9C6561A636D1D32867FE896F55EEF2EDB956EF490E5287B1773B71D6037C4CF`  
**Verdict:** `CORRECT — NOT PASS`

## Formal Ruling

> Boundary concept PASS；controlled BA contract and implementation authorization FAIL pending corrections, OPEN closure and current-rule evidence.

## Confirmed

- Customer Payment Instructions are transaction-scoped customer intent, not Bank SSI.
- `CustomerOriginatedIntent` and `ExecutablePaymentInstruction` must be separate.
- 53a/54a are bank-controlled SSI/route data; 52a/57a remain scenario-dependent.
- Serial/Cover, topology and message settlement method are separate dimensions.
- pacs.008 customer chain and pacs.009 COV cover chain must not be merged.
- Original customer provenance must survive validation, enrichment, repair and rendering.

## Required Corrections

1. Separate Bank SSI, Clearing/Network Reference, Routing/Settlement Policy and Party/Account Master.
2. Mark document as draft; preliminary review notes are not controlled signatures.
3. Define INDA/INGA account owner/servicer semantics.
4. Add a proposed compatibility matrix and fail-closed behavior for unproven combinations.
5. Keep cover cardinality/UETR/reference rules OPEN until current authoritative evidence is registered.
6. Add OPEN decisions for scenario populate/omit rules, FX/charge reconciliation, customer fallback, CLRG and gate ownership.
7. Make acceptance criteria deterministic and add INDA/INGA/illegal-combination tests.
8. Clarify MT-only and MX-only Cover message pairing.

## Re-check Requirement

The Proposal was changed after this review. This report does not approve the revised SHA. An Independent BA Checker must review the final revised file and sign the same SHA before implementation authorization.
