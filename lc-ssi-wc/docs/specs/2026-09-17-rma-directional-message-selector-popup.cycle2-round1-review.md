# RMA Directional Message Selector Popup — Cycle 2 Round 1 Review

**Review date:** 2026-09-17  
**Reviewed specification SHA-256:** `1793F0752E785466018AA6C0BE36D2A5460F3028513E4809A4419F331D2C96C3`  
**Specification sidecar:** `2026-09-17-rma-directional-message-selector-popup.cycle2-round1.sha256`

## Required Memory read

Both reviewers independently confirmed that they reread the complete current versions of:

- `memory/ssi/ssi-maintenance-workflow-memory.md`
- `memory/ssi/rma-index-message-scope-memory.md`
- `memory/governance/mt347-oas-page-parameters-ui-standard-v1.md`

## Decision

| Role | Outcome | Artifact identity                                                           |
| ---- | ------- | --------------------------------------------------------------------------- |
| BA   | `PASS`  | Independently recomputed SHA matched the reviewed specification and sidecar |
| QA   | `PASS`  | Independently recomputed SHA matched the reviewed specification and sidecar |

The Cycle 2 Round 1 design is approved. No Round 2 or Round 3 is required for this cycle.

## Scope of approval

The approved design includes:

- existing RMA ADD／EDIT／VIEW page preserved; only the Message Types popup changes;
- governed Security／Trade Finance／Payment categories;
- identical parameter-driven INBOUND-left／OUTBOUND-right catalogues with independent checked state;
- Generic Page Definition `DIRECTIONAL_MATRIX_SELECT` with stable `fieldId`, submission `path`, same-origin provider／action lookup and typed staged value;
- required `schemaVersion` and independently reproducible RFC 8785／JCS catalogue SHA;
- valid empty ADD pair represented as HTTP 200 with two `ABSENT` directional states;
- governed 400／401／403／404／409／422／503 error semantics and zero-write rejection;
- atomic WIP acquisition, transactional pair Save Draft, idempotency, explicit SUPPRESSED workflow and independent direction Checker decisions;
- read-only View／Audit using the recorded policy SHA;
- shared 48×48 close standard, accessibility, non-stacking responsive matrix, Index first-two-plus-ellipsis regression and versioned performance evidence.

## Remaining implementation gate

This approval is for the screen design only. Implementation starts only after the separately governed data-remediation Gate 2 is confirmed complete for the authorized repaired dataset. Code, OAS, database and Browser evidence must then pass the acceptance matrix bound to the implementation artifact identities.
