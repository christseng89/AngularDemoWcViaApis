# Risk and Assumption Register

## Assumptions

| ID      | Assumption                                                                                                                    | Control                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| ASM-001 | The baseline Git commit and repository path identify the inspected current implementation.                                    | Final Maker/Checker review records its own exact candidate commit externally.       |
| ASM-002 | Current baseline specs may rely on implementation and automated tests when OAS coverage is explicitly recorded as incomplete. | Traceability status and discrepancy IDs prevent a claim of complete OAS governance. |
| ASM-003 | No runtime behaviour is changed by this documentation-only adoption.                                                          | Git diff is restricted to `openspec/` and `docs/plans/`.                            |
| ASM-004 | Stable requirement/scenario IDs are OpenSpec trace keys, not replacements for OAS operation IDs or source rule IDs.           | Traceability maintains separate columns for each identity type.                     |
| ASM-005 | AI-assisted expert and Checker reviews are technical evidence, not human organisational approval.                             | Every review statement carries the limitation explicitly.                           |

## Risks

| ID      | Risk                                                                | Impact                                            | Control / disposition                                                                  |
| ------- | ------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| RSK-001 | Governance mandates are mistaken for implemented current behaviour. | False acceptance and invalid baseline.            | Require implementation/test evidence or record `NOT_PROVEN`.                           |
| RSK-002 | OAS gaps are hidden by controller behaviour.                        | Contract drift and client incompatibility.        | Maintain DISC-001 through DISC-005 and prohibit full-OAS claims.                       |
| RSK-003 | Generic UI specs copy governed message rules.                       | Second source of truth and Open/Closed violation. | Keep specs metadata-directed; do not enumerate message-specific field policy.          |
| RSK-004 | Client-side pagination is baselined as compliant.                   | Capacity and stable-order defect is normalised.   | Limit GIQ scope and retain DISC-006.                                                   |
| RSK-005 | In-repo Checker verdict changes the reviewed commit.                | Self-referential, invalid 4-EYES identity.        | Keep authoritative exact-commit verdict external.                                      |
| RSK-006 | Strict validation checks syntax but not evidence truth.             | Formally valid yet inaccurate specs.              | Independent source trace, discrepancy review and requirement-level matrix.             |
| RSK-007 | Pending family sources are presented as accepted semantics.         | Incorrect SWIFT/product behaviour claim.          | Retain DISC-008 and generic platform-level wording.                                    |
| RSK-008 | Adoption artifacts expose secrets or runtime data.                  | Security/privacy breach.                          | Store paths, hashes and schema identities only; never tokens, secrets or live records. |

## Open Items

- OAS gap closure, client-side paging remediation, unified Checker decisions, family acceptance, audit schedule reconciliation and full browser UAT remain outside this adoption task.
- These items do not block creating an honest OpenSpec baseline, but they block stronger claims identified in the discrepancy register.
