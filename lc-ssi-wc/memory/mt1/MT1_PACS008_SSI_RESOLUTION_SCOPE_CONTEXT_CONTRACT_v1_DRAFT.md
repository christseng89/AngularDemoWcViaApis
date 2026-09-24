# MT1 / pacs.008 SSI Resolution Scope and Context Contract v1

**Status:** CONTROLLED CANDIDATE DRAFT — IMPLEMENTATION NOT AUTHORIZED  
**Scope:** `OUTWARD_SSI_ONLY`  
**Product type:** `SSI_RESOLUTION_ONLY`  
**BA Maker:** `/root/mt1_ba_review`  
**Independent BA / QA / Product Owner:** PENDING

## 1. Purpose

This contract defines the minimum governed inputs accepted by the outward-only MT1 / pacs.008 SSI Resolver. The local bank is the outward payment originator and instructing side for the current outbound FI-to-FI hop. The payment/reference adapter owns validation of customer intent and supplies a stable, versioned settlement context. The Resolver neither captures nor repairs payment instructions.

## 2. Required governed context

| Field                          | Contract                                                                                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `profileId`                    | Controlled identity for an approved MT103 Base/STP/REMIT or pacs.008.001.08 plain/STP profile. It binds exact BizSvc or governed MT validation flag/service/community/MUG metadata and the allowed Mapping Keys. The Resolver does not parse a raw message to derive it. |
| `scenarioId`                   | Controlled SSI settlement scenario identity. It determines the permitted settlement context and role matrix.                                                                                                                                                             |
| `fixtureBindingId`             | Governed hidden scenario/test binding. It supplies message/NVR/provenance context without creating UI message-entry fields.                                                                                                                                              |
| `paymentDirection`             | The required value is exactly `OUTWARD`. `INWARD` and received-payment contexts are outside this candidate.                                                                                                                                                              |
| `upstreamValidatedDestination` | Opaque destination FI reference containing stable identity, source reference and version. It is lookup context, not Bank SSI and not a mutable customer instruction.                                                                                                     |
| `currentHop`                   | Current FI-to-FI hop: governed instructing-agent identity, instructed-agent identity and hop identity/version.                                                                                                                                                           |
| `localBankRole`                | Fixed exactly to `INSTRUCTING_AGENT` for `currentHop`. It does not rename canonical SWIFT reimbursement roles.                                                                                                                                                           |
| `transferMethod`               | Controlled enum `SERIAL \| COVER`, supplied by the governed scenario adapter.                                                                                                                                                                                            |
| `routeTopology`                | Governed topology identity and ordered bank-controlled boundaries/legs appropriate to the scenario.                                                                                                                                                                      |
| `settlementContext`            | Exactly one of `INDA`, `INGA` or `COVE`.                                                                                                                                                                                                                                 |
| `currency`                     | SSI account/correspondent eligibility currency.                                                                                                                                                                                                                          |
| `bookingEntity`                | Bank entity for which SSI/Own account eligibility is evaluated.                                                                                                                                                                                                          |
| `valueDate`                    | Effective-date input for governed records.                                                                                                                                                                                                                               |
| `routeConstraintIds`           | Optional upstream-governed route constraints expressed as opaque identifiers; never raw customer data.                                                                                                                                                                   |
| `contextSnapshotId`            | Immutable identity covering profile, scenario, fixture, payment direction, destination, current hop, fixed local-bank role, transfer method, route topology, settlement context, constraints and all supplied versions.                                                  |

The adapter must provide only stable IDs, versions and governed classifications. Raw debtor/creditor data, beneficiary account details, amount, purpose, remittance and mandate are neither required nor accepted.

The governed `transferMethod` enum is `SERIAL | COVER`.

Both pacs.008 plain and STP use `MsgDefIdr=pacs.008.001.08`. `MsgDefIdr` alone is insufficient and must not select the profile. The adapter must bind `profileId` to the exact `BizSvc`: `swift.cbprplus.04` for plain or `swift.cbprplus.stp.04` for STP. An MT code alone must never select an MT profile; the controlled gate also uses the exact validation flag and applicable service/community/MUG metadata.

Each governed profile supplies allowed Mapping Keys and, where the mapping projects to MT, allowed `swiftTag` + `swiftOption` combinations. The Mapping Key direction is fixed to `OUTWARD`. Candidate eligibility must match that metadata for every required serial, intermediary and COVE role. A native MX role uses its governed MX profile mapping metadata without inventing an MT option.

## 3. Ownership exclusions

The following are explicitly outside this contract:

- **customer payment capture** and maintenance;
- **CPI authority** determination;
- **CPI repair**, normalization or enrichment;
- **full NVR** and full-message/network validation;
- **message composition**, conversion or rendering;
- **payment execution**, posting or release;
- compliance, sanctions, RMA, cut-off, liquidity and funding; and
- downstream message creation or lifecycle management.
- inward SSI maintenance/resolution and received-payment resolution.

The Resolver does not accept a full MT103 or pacs.008 payload as operational input. Governed scenario fixtures may carry hidden evidence required to test the SSI contract, but that evidence is not exposed as user-entered message data.

## 4. Input gates

1. Any `paymentDirection` other than exact `OUTWARD`, including `INWARD` or a received-payment context, returns `ssiApplicability=NOT_EVALUATED` and `resolutionOutcome=UNSUPPORTED_DIRECTION` with zero SSI discovery.
2. Unknown, missing, ineffective or unapproved `profileId` returns `UNSUPPORTED_PROFILE` with zero SSI discovery.
3. A recognized profile whose governed Mapping Key or allowed Tag+Option metadata is incomplete returns `ssiApplicability=NOT_EVALUATED` and `resolutionOutcome=PROFILE_INCOMPLETE` with zero SSI discovery.
4. Missing or contradictory `currentHop`, fixed `localBankRole=INSTRUCTING_AGENT`, `transferMethod`, `routeTopology` or `settlementContext` returns `INVALID_CONTEXT_TOPOLOGY`. Valid Phase-1 combinations are `SERIAL + INDA`, `SERIAL + INGA` and `COVER + COVE`.
5. Missing or non-current `upstreamValidatedDestination` returns `INVALID_UPSTREAM_CONTEXT`; the Resolver does not attempt derivation or repair.
6. A changed `contextSnapshotId` or governed record version returns `STALE`.
7. A currency, booking entity or value-date change requires rediscovery and a new snapshot.

## 5. Output contract

The Resolver returns these independent dimensions:

```text
ssiApplicability = NOT_EVALUATED | REQUIRED | NOT_REQUIRED

resolutionOutcome =
  BILATERAL_RELATIONSHIP_CONFIRMED
| ELIGIBLE_COMPLETE_ROUTE
| NO_ELIGIBLE_SSI
| AMBIGUOUS_ROUTE
| STALE
| INVALID_CONTEXT_TOPOLOGY
| INVALID_UPSTREAM_CONTEXT
| PROFILE_INCOMPLETE
| UNSUPPORTED_DIRECTION
| UNSUPPORTED_PROFILE
```

Pre-gate failures use `ssiApplicability=NOT_EVALUATED`. A successful externally evidenced direct bilateral case uses `ssiApplicability=NOT_REQUIRED` and `resolutionOutcome=BILATERAL_RELATIONSHIP_CONFIRMED`; it returns the validated `bilateralRelationshipEvidenceId` and no SSI route. When SSI is required but no available SSI content/option can satisfy a required role under the selected profile, return `ssiApplicability=REQUIRED` and `resolutionOutcome=PROFILE_INCOMPLETE`. When `ssiApplicability=REQUIRED`, success uses `resolutionOutcome=ELIGIBLE_COMPLETE_ROUTE` and returns one indivisible route candidate with:

- `routeBindingId` and `snapshotToken`;
- canonical `INSTRUCTING_REIMBURSEMENT_AGENT`, `INSTRUCTED_REIMBURSEMENT_AGENT` and, only when governed scenario/53a/54a/55a relationship evidence requires it, `THIRD_REIMBURSEMENT_AGENT` role identities;
- separate perspective-specific SSI ownership derived from `localBankRole` and `currentHop`;
- Nostro/Vostro or reimbursement/settlement account references where applicable;
- ordered route legs;
- record IDs and versions;
- eligibility and rejection reasons; and
- source provenance.

No output is a payment instruction, MT/MX payload, posting command or release authorization.

The contract applies controlled Product/BA policy rules `POL-MT1-ATOMIC-001`, `POL-MT1-COLLAPSED-001`, `POL-MT1-RANK-001`, `POL-MT1-FAIL-CLOSED-001`, `POL-MT1-PROFILE-OPTION-001` and `POL-MT1-DIRECTION-001` as defined by the active v3 Memory. These are not SWIFT network rules.

## 6. Traceability

Normative source filenames, pages and SHA-256 values are maintained once in [the active v3 Memory source register](../swift-mt1xx-pacs008-ssi-v3.md#6-source-register). The settlement and route decisions are defined in [the active atomic route matrix](MT1_PACS008_SETTLEMENT_CONTEXT_SSI_ROLE_ATOMIC_ROUTE_MATRIX_v1_DRAFT.md).
