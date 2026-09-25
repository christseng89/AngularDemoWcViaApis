# MT1 / pacs.008 Settlement Context, SSI Role and Atomic Route Matrix v1

**Status:** CONTROLLED CANDIDATE DRAFT — IMPLEMENTATION NOT AUTHORIZED

**Scope:** `OUTWARD_SSI_ONLY` for approved outward MT103 and pacs.008.001.08 profiles

**Product type:** `SSI_RESOLUTION_ONLY`

**BA Maker:** `/root/mt1_ba_review`
**Independent BA / QA / Product Owner:** PENDING

## 1. Outcome dimensions

Applicability and resolution are separate:

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

`ssiApplicability=REQUIRED` is not success by itself. SSI-route success requires `resolutionOutcome=ELIGIBLE_COMPLETE_ROUTE` and exactly one complete candidate. A proven no-SSI direct relationship returns `ssiApplicability=NOT_REQUIRED` with `resolutionOutcome=BILATERAL_RELATIONSHIP_CONFIRMED`. Pre-gate failures return `ssiApplicability=NOT_EVALUATED`.

## 2. Common invariants

- `currentHop` contains only the current bank-to-bank instructing and instructed agent identities.
- `paymentDirection` is fixed exactly to `OUTWARD`; it is part of the profile Mapping Key and `contextSnapshotId`.
- `localBankRole=INSTRUCTING_AGENT` is fixed for the local outward originator on `currentHop` and controls data-ownership projection, not canonical SWIFT role naming.
- `transferMethod` is exactly `SERIAL` or `COVER`; valid Phase-1 combinations are `SERIAL + INDA`, `SERIAL + INGA` and `COVER + COVE`.
- `routeTopology` supplies the governed ordered bank-controlled boundaries/legs. Both fields and their versions are covered by `contextSnapshotId`.
- INDA: `accountOwner == currentHop.instructingAgent` and `accountServicer == currentHop.instructedAgent`.
- INGA: `accountOwner == currentHop.instructedAgent` and `accountServicer == currentHop.instructingAgent`.
- Each account, agent and ordered leg must match currency, booking entity, value date, destination, profile, scenario and snapshot.
- Under `POL-MT1-PROFILE-OPTION-001`, every required serial, intermediary and COVE role must match the selected controlled profile's Mapping Key and allowed `swiftTag` + `swiftOption` set. Native MX roles use governed MX mapping metadata and do not acquire an invented MT option.
- Perspective-specific SSI datasets retain independent provenance but are bound into one indivisible `routeBindingId`.
- No client may mix an account, role or leg from different candidates.
- A unique governed direct bilateral relationship can make SSI lookup unnecessary; it must be supported by a current versioned `bilateralRelationshipEvidenceId`.

## 3. Governed MT103 Tag+Option compatibility

These are official profile-specific option sets used by `POL-MT1-PROFILE-OPTION-001`; they do not authorize full-message composition or validation.

| Controlled MT profile      | 53a   | 54a   | 55a   | 56a   | 57a     |
| -------------------------- | ----- | ----- | ----- | ----- | ------- |
| MT103 Base and MT103 REMIT | A/B/D | A/B/D | A/B/D | A/C/D | A/B/C/D |
| MT103 STP                  | A/B   | A     | A     | A     | A       |

`Base` and `REMIT` use the same A/B/D sets for 53a, 54a and 55a. STP permits 53a A/B, 54a A, 55a A, 56a A and 57a A. REMIT is effective only when its controlled Product profile/service/community/MUG gate permits it.

The evidence-projection pairs are Base↔pacs.008 plain and STP↔pacs.008 STP. REMIT is MT-only. A paired result is two native representations of one governed SSI route, not a field-for-field conversion: each projection independently applies its profile Mapping Key and points to the same `routeBindingId` and snapshot. Missing or incompatible paired metadata fails closed as `PROFILE_INCOMPLETE`; the Resolver never substitutes plain for REMIT.

Candidate matching uses the full Mapping Key: `SR + Message + Direction + Sequence/Subsequence + Settlement Leg + Tag + Option + Official Role + Business Function/Profile`. For native MX roles, option compatibility means conformance with governed profile mapping metadata; an MT option is required only where that mapping explicitly defines one.

## 4. Settlement context and route outcome matrix

| ID    | transfer / settlement / topology                                                                   | Required bank-controlled evidence                                                                                                                   | `ssiApplicability` | Success `resolutionOutcome`                                             | Failure output                                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R01` | SERIAL / INDA / exact direct bilateral relationship, no account selection                          | Current `bilateralRelationshipEvidenceId` for exact agents/currency/entity/date/version                                                             | `NOT_REQUIRED`     | `BILATERAL_RELATIONSHIP_CONFIRMED`; return evidence ID and no SSI route | Missing, stale or mismatched evidence → `NOT_EVALUATED` + `INVALID_UPSTREAM_CONTEXT`; never silently fall through to R02                             |
| `R02` | SERIAL / INDA / SSI account selection required by scenario                                         | One profile-option-compatible account/relationship record whose owner is the instructing agent and servicer is the instructed agent                 | `REQUIRED`         | `ELIGIBLE_COMPLETE_ROUTE`                                               | Required role has incompatible/missing profile option → `REQUIRED` + `PROFILE_INCOMPLETE`; otherwise no candidate → `NO_ELIGIBLE_SSI`                |
| `R03` | SERIAL / INGA / exact direct bilateral relationship, no account selection                          | Current `bilateralRelationshipEvidenceId` for exact agents/currency/entity/date/version                                                             | `NOT_REQUIRED`     | `BILATERAL_RELATIONSHIP_CONFIRMED`; return evidence ID and no SSI route | Missing, stale or mismatched evidence → `NOT_EVALUATED` + `INVALID_UPSTREAM_CONTEXT`; never silently fall through to R04                             |
| `R04` | SERIAL / INGA / SSI account selection required by scenario                                         | One profile-option-compatible account/relationship record whose owner is the instructed agent and servicer is the instructing agent                 | `REQUIRED`         | `ELIGIBLE_COMPLETE_ROUTE`                                               | Required role has incompatible/missing profile option → `REQUIRED` + `PROFILE_INCOMPLETE`; otherwise no candidate → `NO_ELIGIBLE_SSI`                |
| `R05` | SERIAL / governed intermediated topology                                                           | Every ordered bank-controlled intermediary/account leg satisfies INDA or INGA, Mapping Key/option compatibility and provenance/version              | `REQUIRED`         | `ELIGIBLE_COMPLETE_ROUTE`                                               | Required role has incompatible/missing profile option → `REQUIRED` + `PROFILE_INCOMPLETE`; otherwise missing/ineligible leg → `NO_ELIGIBLE_SSI`      |
| `R09` | COVER / COVE / governed complete reimbursement topology                                            | Every applicable canonical reimbursement role predicate C01–C03 and every non-collapsed boundary are complete, contiguous and bound to one snapshot | `REQUIRED`         | `ELIGIBLE_COMPLETE_ROUTE`                                               | Required C01/C02/C03 profile-option incompatibility → `REQUIRED` + `PROFILE_INCOMPLETE`; otherwise incomplete route → `REQUIRED` + `NO_ELIGIBLE_SSI` |
| `R10` | Any other transferMethod + settlementContext combination, including SERIAL+COVE or COVER+INDA/INGA | Contradicts the governed scenario binding                                                                                                           | `NOT_EVALUATED`    | None                                                                    | `INVALID_CONTEXT_TOPOLOGY`                                                                                                                           |

### 4.1 COVE canonical-role component predicates

These predicates contribute to R09; they do not independently emit a resolution outcome.

| ID    | Canonical SWIFT role                                     | Applicability predicate                                                                                                                                    | Required evidence                                                                                                                |
| ----- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `C01` | `INSTRUCTING_REIMBURSEMENT_AGENT` and applicable account | Governed scenario/fixture and 53a / Instructing Reimbursement Agent relationship require the role; boundary is not collapsed under `POL-MT1-COLLAPSED-001` | Mapping Key/profile-option-compatible account/relationship and role provenance/version                                           |
| `C02` | `INSTRUCTED_REIMBURSEMENT_AGENT` and applicable account  | Governed scenario/fixture and 54a / Instructed Reimbursement Agent relationship require the role; boundary is not collapsed under `POL-MT1-COLLAPSED-001`  | Mapping Key/profile-option-compatible account/relationship and role provenance/version                                           |
| `C03` | `THIRD_REIMBURSEMENT_AGENT` and applicable account       | Governed scenario fixture explicitly requires the role under the applicable 55a / Third Reimbursement Agent relationship rule                              | Mapping Key/profile-option-compatible account/relationship and role provenance/version; never infer from generic middle position |

If C01, C02 or C03 is required and available SSI content/options cannot satisfy the selected profile, R09 returns `ssiApplicability=REQUIRED` and `resolutionOutcome=PROFILE_INCOMPLETE`.

### 4.2 Canonical role to outward SSI data ownership

| Canonical role                    | `localBankRole=INSTRUCTING_AGENT` |
| --------------------------------- | --------------------------------- |
| `INSTRUCTING_REIMBURSEMENT_AGENT` | `OWN_SSI_OR_ACCOUNT_MASTER`       |
| `INSTRUCTED_REIMBURSEMENT_AGENT`  | `COUNTERPARTY_SSI`                |
| `THIRD_REIMBURSEMENT_AGENT`       | `THIRD_PARTY_SSI`                 |

Under controlled Product/BA rule `POL-MT1-COLLAPSED-001`, a boundary is collapsed only where both sides have the same exact canonical servicer and branch/service identity. The corresponding role is not fabricated. If no genuine COVE boundary remains, the context is invalid and must be resubmitted under a governed direct scenario.

For COVE, this matrix returns only MT1 / pacs.008 reimbursement SSI roles and provenance. It includes **no pacs.009 creation, design, correlation or execution**.

## 5. Candidate cardinality and snapshot rules

| Condition                                                              | `ssiApplicability` | `resolutionOutcome`                |
| ---------------------------------------------------------------------- | ------------------ | ---------------------------------- |
| Valid direct bilateral evidence under R01/R03                          | `NOT_REQUIRED`     | `BILATERAL_RELATIONSHIP_CONFIRMED` |
| Exactly one complete eligible SSI candidate                            | `REQUIRED`         | `ELIGIBLE_COMPLETE_ROUTE`          |
| Zero complete eligible candidates                                      | `REQUIRED`         | `NO_ELIGIBLE_SSI`                  |
| More than one equally eligible top-ranked complete candidate           | `REQUIRED`         | `AMBIGUOUS_ROUTE`                  |
| Context, policy or record version changed after discovery              | `NOT_EVALUATED`    | `STALE`                            |
| Route contains roles/legs from different bindings                      | `REQUIRED`         | `INVALID_CONTEXT_TOPOLOGY`         |
| Required upstream destination/bilateral evidence is missing or invalid | `NOT_EVALUATED`    | `INVALID_UPSTREAM_CONTEXT`         |
| Controlled profile Mapping Key/allowed-option metadata is incomplete   | `NOT_EVALUATED`    | `PROFILE_INCOMPLETE`               |
| Required SSI role has no profile-option-compatible content             | `REQUIRED`         | `PROFILE_INCOMPLETE`               |
| Profile is unknown, ineffective or outside the approved Phase-1 list   | `NOT_EVALUATED`    | `UNSUPPORTED_PROFILE`              |
| `paymentDirection=INWARD` or any received-payment context              | `NOT_EVALUATED`    | `UNSUPPORTED_DIRECTION`            |

`POL-MT1-ATOMIC-001` controls route binding and prohibits cross-candidate mixing. `POL-MT1-RANK-001` requires governed business discriminators and prohibits UUID, creation time or database row order as tie-breakers. `POL-MT1-FAIL-CLOSED-001` controls every typed non-success outcome. `POL-MT1-PROFILE-OPTION-001` controls Mapping Key and option compatibility. `POL-MT1-DIRECTION-001` fixes direction to OUTWARD and rejects INWARD before SSI discovery. These and `POL-MT1-COLLAPSED-001` are Product/BA policy rules, not SWIFT network rules.

## 6. Minimum acceptance oracle

1. INDA owner/servicer mismatch eliminates the candidate.
2. INGA owner/servicer mismatch eliminates the candidate.
3. One missing intermediated leg or applicable COVE component predicate invalidates the complete candidate.
4. Two equal complete routes return `AMBIGUOUS_ROUTE`.
5. Cross-candidate leg mixing returns `INVALID_CONTEXT_TOPOLOGY`.
6. Changed context or record version returns `STALE`.
7. Unsupported profiles perform zero SSI discovery.
8. Customer parties/accounts never become SSI roles and never increment SSI count.
9. A Third Reimbursement Agent is present only when the governed scenario fixture and applicable 55a relationship rule require it; generic middle position is insufficient.
10. R01/R03 return `NOT_REQUIRED + BILATERAL_RELATIONSHIP_CONFIRMED` without an SSI route; invalid evidence returns `NOT_EVALUATED + INVALID_UPSTREAM_CONTEXT`.
11. A required SSI role whose available content has a missing or incompatible profile option returns `REQUIRED + PROFILE_INCOMPLETE`; no fallback option is invented.
12. Native MX role matching uses governed profile mapping metadata and does not require an MT option unless that mapping defines one.
13. `paymentDirection=INWARD` or a received-payment context returns `NOT_EVALUATED + UNSUPPORTED_DIRECTION` before SSI discovery.

## 7. Traceability

This matrix uses the source register in [the active v3 Memory](../swift-mt1xx-pacs008-ssi-v3.md#6-source-register) and the governed input definitions in [the active scope/context contract](MT1_PACS008_SSI_RESOLUTION_SCOPE_CONTEXT_CONTRACT_v1_DRAFT.md). It does not independently redefine message construction or full-message validation rules.
