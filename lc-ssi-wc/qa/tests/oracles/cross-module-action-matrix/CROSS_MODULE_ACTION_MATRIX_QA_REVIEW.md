# Cross-module maintenance Action Matrix — Independent QA read-only review

**BA artifact:** `MAINT-ACTION-MATRIX-v0.1`  
**Modules:** RMA, Entity, Nostro, SSI  
**QA verdict:** `CHANGES_REQUIRED` with one explicit `OPEN` product decision.  
**Mutation policy:** No production code, DB, seed, fixture or runtime-data change was made.

## Source identity

- `memory/ssi-maintenance-workflow-memory.md` SHA-256: `14FE5C2F985E102F2E3C8F7F1F08FC7F8A573E982FB20509522AF1F51CF3BA6A` — matches BA.
- `memory/rma-index-message-scope-memory.md` SHA-256: `E2A5930E32EF90067572C684688057BA45450C925CCAE4107A8F7CC9A69F4A28` — matches BA.
- Operating model actual SHA-256: `5727E09B9C0D0F481A20A56096C34586B32D881A349A75D46B94D7A63684B9CC`; manifest-declared `EA77F1C77441928E02AFB18221C9AB71CAE266B4FB384AE73B8C1D0404EB6626` remains mismatched.
- OpenAPI independently confirms all four resources declare `submit, approve, reject, revise, suppress` lifecycle capabilities.

## Matrix review

| Tab / row state | BA maximum presentation gate | Current implementation | QA |
|---|---|---|---|
| Active + unlocked | Revise, Suppress only | Both SSI custom and shared CRUD show these only when `status=ACTIVE && !hasOpenRevision` | `PASS` |
| Active + open WIP/Draft/Pending/Approved revision | No mutation buttons | Revise/Suppress are hidden by `hasOpenRevision`; backend also checks authoritative open revision | `PASS` |
| Draft + ordinary ADD/REVISION | Submit, Edit, Revoke Draft | Shared CRUD and SSI custom expose these for eligible Drafts | `PASS` |
| Draft + SUPPRESSION | Submit, Revoke Draft; Edit unresolved | Submit is now available under accepted bundle `33f911...`; shared CRUD hides Edit, SSI template can render Edit but its handler returns without action; all four services reject edit with `SUPPRESSION_DRAFT_CANNOT_BE_EDITED` | `OPEN` |
| Suppressed | No mutation buttons | Row predicates expose none | `PASS` |
| All filter | No mutation buttons regardless of row status | Both UIs continue evaluating actions from each row status, so Active and Draft records still expose mutations | `FAIL` |
| View | Row click plus Enter/Space retained | Shared CRUD and SSI custom remain keyboard-focusable and invoke read-only detail on click, Enter and Space | `PASS` |

## Confirmed implementation impact

1. **`All` is a filter, not a lifecycle status.** Shared CRUD omits the API `status` query when `ALL`; SSI sends its `ALL` ownership status and the repository deliberately treats it as no status restriction. Existing action predicates do not consult the selected filter. A presentation-level maximum gate is therefore required in both the shared RMA/Entity/Nostro template and the separate SSI template if BA v0.1 is approved.
2. **SUPPRESSION Draft Edit is inconsistent today.** Shared CRUD checks `changeType !== SUPPRESSION`; SSI's Edit button presentation does not, although `edit(row)` immediately returns and all four services reject it. A no-op visible button is not acceptable evidence of permission. BA/Product must close whether v0.1 explicitly codifies `Submit + Revoke Draft only` for this subtype.
3. **`hasOpenRevision` is mandatory.** Hiding actions is only a UX gate; each service must retain atomic server-side open-revision checks. The matrix must not weaken those checks.
4. **Capability and identity checks remain authoritative.** Generic Submit also checks OAS lifecycle capability; backend status, Maker/Checker separation, reason and state checks remain required. The proposed tab gate is not authorization.
5. **Header controls are separate.** Add/Export/Import and Checker Approve/Reject are outside the matrix and must not be changed by any implementation candidate.

## Required deterministic test denominator

For each of the four modules, the executable matrix must cover at least:

- Active unlocked;
- Active locked by each of WIP, Draft, Pending Approval and Approved open revisions;
- ordinary ADD Draft;
- REVISION Draft;
- SUPPRESSION Draft;
- Suppressed;
- All filter containing at least one Active and one Draft row;
- row View via click, Enter and Space.

This is a minimum of **11 state scenarios × 4 modules = 44 module/state cases**, plus API-negative tests proving direct calls cannot bypass lifecycle, open-revision and Maker/Checker controls. Tests must verify both button presence and absence; counting only positive buttons is insufficient.

## Final QA decision

`MAINT-ACTION-MATRIX-v0.1` is not ready for implementation approval as a closed contract:

- current code demonstrably fails the decided `All = read-only` rule; and
- SUPPRESSION Draft Edit remains explicitly `OPEN` and is inconsistent between the SSI and shared CRUD presentations.

Required next step is a BA versioned ruling that closes the SUPPRESSION exception and preserves the maximum-gate meaning of tabs. Only then may Maker produce an exact candidate for independent regression; no code deletion or mutation is authorized by this review.
