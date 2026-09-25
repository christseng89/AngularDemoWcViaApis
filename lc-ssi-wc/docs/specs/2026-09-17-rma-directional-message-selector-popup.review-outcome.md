# RMA Directional Message Selector Popup — Design Review Outcome

**Date:** 2026-09-17  
**Reviewed Round 3 artifact SHA-256:** `BF1220C13AE0943F2BB2A34BCC7E44915C272348B5006F0192EF7E73252FEC3A`  
**Applicable Memory read by every reviewer:**

- `memory/ssi/ssi-maintenance-workflow-memory.md`
- `memory/ssi/rma-index-message-scope-memory.md`
- `memory/governance/mt347-oas-page-parameters-ui-standard-v1.md`

## Three-round result

| Round | BA                 | QA                 | Result                                                                                                      |
| ----- | ------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| 1     | `CHANGES_REQUIRED` | `CHANGES_REQUIRED` | WIP, governed contracts, snapshot, audit, atomicity, accessibility, performance and acceptance gaps revised |
| 2     | `PASS`             | `CHANGES_REQUIRED` | Generic control, reproducible SHA and seven final QA contract gaps revised                                  |
| 3     | `CHANGES_REQUIRED` | `PASS`             | Three BA contract questions remain; three-round limit reached                                               |

## Governance disposition

- Popup implementation is **STOPPED**.
- Do not start a fourth design-review round.
- Do not substitute another BA to bypass the unresolved governed contract questions.
- The existing RMA Index compact display is a separate previously implemented change; this stop applies to the directional Message Selector Popup.
- Data-remediation Gate 2 remains an independent prerequisite even after the design questions are resolved.

## Product Owner decisions required

1. **Generic Page Definition field contract**
   - Recommended ruling: `DIRECTIONAL_MATRIX_SELECT` inherits the complete shared field contract, including stable `fieldId` and submission `path`; `valuePath` is presentation/value metadata and never replaces `path`.
   - Lookup metadata must identify the governed provider/action, use same-origin endpoints only, and define canonical request/response identity mapping.

2. **Reproducible catalogue SHA**
   - Recommended ruling: add required `schemaVersion` to the policy response, OAS and example because the approved JCS input already includes it.
   - Missing `schemaVersion` or recomputation mismatch fails closed.

3. **Legal empty ADD pair versus resource not found**
   - Recommended ruling: a valid canonical bank pair with no RMA records returns HTTP 200 with both directions in `ABSENT` state.
   - HTTP 404 is reserved for a truly missing or unresolvable canonical resource.
   - Use the governed common error mapping for 401 unauthenticated, 403 unauthorized, 400 malformed request and 422 well-formed but unsupported／tampered selection; every rejection produces zero business and audit mutation.
   - Add an acceptance case that distinguishes HTTP 200 `ABSENT` from true 404.

After an explicit Product Owner ruling, record a new controlled design version and restart its review as a new governed review cycle rather than calling it Round 4 of this closed cycle.
