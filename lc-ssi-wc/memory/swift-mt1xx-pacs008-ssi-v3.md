# MT1 / pacs.008 SSI Resolution Memory — v3

**Status:** CONTROLLED CANDIDATE — IMPLEMENTATION NOT AUTHORIZED  
**Scope classification:** `OUTWARD_SSI_ONLY`  
**Product type:** `SSI_RESOLUTION_ONLY`  
**Prepared:** 2026-09-24  
**BA Maker:** `/root/mt1_ba_review`  
**Independent BA Checker:** PENDING  
**QA Checker:** PENDING  
**Product Owner:** PENDING

This is the active controlled candidate for the MT1 / pacs.008 prototype. It does not authorize implementation until Independent BA, QA and Product Owner approve the same externally recorded exact Git candidate commit.

## 1. Product ruling

The prototype resolves Bank SSI only for an already identified outward MT1 / pacs.008 bank settlement context. The local bank is the outward payment originator and the instructing side of the current outbound FI-to-FI hop. Customer Payment Instructions are **not Bank SSI**. Customer intent, customer parties and accounts remain owned by the payment domain and must not be captured, repaired, normalized, enriched or overwritten by this service.

The Resolver answers only:

1. whether the supplied bank settlement context requires Bank SSI;
2. which complete, eligible, version-locked SSI route is available; and
3. why resolution failed closed when no unique executable route exists.

The active supporting contracts are:

- [MT1 / pacs.008 SSI Resolution Scope and Context Contract](mt1/MT1_PACS008_SSI_RESOLUTION_SCOPE_CONTEXT_CONTRACT_v1_DRAFT.md)
- [MT1 / pacs.008 Settlement Context, SSI Role and Atomic Route Matrix](mt1/MT1_PACS008_SETTLEMENT_CONTEXT_SSI_ROLE_ATOMIC_ROUTE_MATRIX_v1_DRAFT.md)

## 2. Controlled Phase-1 profiles

Only these governed profile identities may enter the active prototype:

- MT103 Base;
- MT103 STP;
- MT103 REMIT only when an effective approved profile row exists;
- pacs.008.001.08 plain with the governed `swift.cbprplus.04` profile; and
- pacs.008.001.08 STP with the governed `swift.cbprplus.stp.04` profile.

The upstream adapter supplies `profileId`, `scenarioId` and `fixtureBindingId`. Raw MT/MX capture, parsing and full-message validation are not Resolver responsibilities. Unsupported or unapproved profile identities return `UNSUPPORTED_PROFILE` before SSI discovery.

pacs.008 plain and STP share `MsgDefIdr=pacs.008.001.08`; therefore `MsgDefIdr` alone is insufficient and **must not** select a profile. The controlled identity is `profileId` plus the exact BAH `BizSvc`: `swift.cbprplus.04` for plain and `swift.cbprplus.stp.04` for STP. An MT code alone is likewise insufficient: the governed MT profile gate also includes its exact validation flag and, where applicable, the effective approved service, community and MUG metadata. These values are supplied by the controlled adapter/fixture and are not message-entry UI fields.

Every required SSI role is eligible only when its governed Mapping Key and profile-specific `swiftTag` + `swiftOption` metadata are compatible. The Mapping Key is `SR + Message + Direction + Sequence/Subsequence + Settlement Leg + Tag + Option + Official Role + Business Function/Profile`. Native MX roles use their governed profile mapping metadata; the Resolver must not invent an MT option where the selected native MX mapping does not define one. The exact MT103 option sets are maintained once in the active route matrix.

## 3. SSI resolution boundary

The minimum governed context is:

```text
profileId + scenarioId + fixtureBindingId
+ paymentDirection = OUTWARD
+ upstreamValidatedDestination
+ currentHop + localBankRole = INSTRUCTING_AGENT
+ transferMethod (SERIAL | COVER) + routeTopology
+ settlementContext (INDA | INGA | COVE)
+ currency + bookingEntity + valueDate
+ optional governed route constraints
-> ssiApplicability
-> eligible atomic SSI route
-> resolutionOutcome
```

`upstreamValidatedDestination` is an opaque, versioned FI destination reference. The Resolver may use it to filter route eligibility, but it does not decide CPI authority, derive a Creditor Agent, normalize customer data or run a repair workflow.

Bank-controlled SSI scope includes canonical bank reimbursement roles, their perspective-specific SSI data ownership, Nostro/Vostro or reimbursement/settlement account relationships, bank-controlled intermediary roles and their complete ordered route. Currency remains an eligibility input; amount, FX, charges, purpose and remittance do not.

## 4. Explicit exclusions

The active candidate excludes:

- customer payment capture and Customer Party/Profile maintenance;
- CPI authority, CPI repair and customer-intent mutation;
- debtor, creditor and customer-account maintenance;
- full NVR or full FIN/MX validation;
- message composition, MT/MX conversion and rendering;
- payment execution, posting, release, funding and liquidity;
- compliance, sanctions, RMA and cut-off decisions;
- downstream message creation, correlation or lifecycle processing; and
- inward SSI maintenance or resolution and all received-payment resolution contexts;
- MT2 is out of scope, including all MT2 / pacs.009 design; and
- detailed design for any other message family.

Only an NVR whose complete decision inputs are SSI-owned roles in this contract may be handled as an `IN_SCOPE_SSI_TAG_NVR`. Everything requiring non-SSI message content remains `OUT_OF_SCOPE_FULL_FIN_NVR` and `FIN_VALIDATION=NOT_EVALUATED`.

For COVE, this Resolver returns only the canonical MT1 / pacs.008 roles `INSTRUCTING_REIMBURSEMENT_AGENT`, `INSTRUCTED_REIMBURSEMENT_AGENT` and, only when governed 55a / Third Reimbursement Agent relationship evidence and the scenario fixture require it, `THIRD_REIMBURSEMENT_AGENT`. SSI data ownership is projected separately from `localBankRole` and `currentHop`; it is never embedded in the canonical role name. The Resolver performs **no pacs.009 creation, design, correlation or execution**.

## 5. Resolution invariants

- INDA and INGA are per-hop owner/servicer relationships, not global labels for a multihop route.
- Every COVE or intermediated leg is independently eligible and traceable.
- A candidate is an indivisible `routeBindingId` under one `snapshotToken`; clients may not mix accounts or legs from different candidates.
- Only one uniquely eligible complete route may resolve automatically.
- Missing eligibility data, contradictory topology, ambiguity or stale context fails closed.
- SSI applicability and resolution result are separate fields.
- `paymentDirection` is fixed exactly to `OUTWARD`; `INWARD` or received-payment context returns `ssiApplicability=NOT_EVALUATED` and `resolutionOutcome=UNSUPPORTED_DIRECTION` before SSI discovery.
- `localBankRole` is fixed to `INSTRUCTING_AGENT` for the current outbound FI-to-FI hop.
- `contextSnapshotId` covers profile, scenario, fixture, `paymentDirection`, destination, current hop, fixed local-bank role, transfer method, route topology, settlement context, currency, booking entity, value date and every governed version.
- UI receives only the minimum Page Parameter context that can alter SSI eligibility or route choice. Message profile and test provenance remain hidden governed fixture metadata unless a specific visible SSI field is required.

The following are controlled Product/BA policies, not SWIFT network rules:

| Rule ID                      | Controlled policy                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POL-MT1-ATOMIC-001`         | Every successful candidate is one indivisible route binding under one snapshot; cross-candidate mixing is prohibited.                                                                       |
| `POL-MT1-COLLAPSED-001`      | A reimbursement boundary may be treated as collapsed only when the exact canonical servicer and branch/service identity are equal; no role is fabricated for that boundary.                 |
| `POL-MT1-RANK-001`           | A unique route may be selected only by governed business discriminators; UUID, row order and creation time are prohibited tie-breakers.                                                     |
| `POL-MT1-FAIL-CLOSED-001`    | Missing, contradictory, ambiguous or stale governed context returns a typed non-success outcome with no route or downstream side effect.                                                    |
| `POL-MT1-PROFILE-OPTION-001` | A required SSI role must match the selected controlled profile's Mapping Key and allowed Tag+Option set; incompatible or unavailable required content fails closed as `PROFILE_INCOMPLETE`. |
| `POL-MT1-DIRECTION-001`      | Only `paymentDirection=OUTWARD` is eligible; any inward or received-payment context fails before SSI discovery as `NOT_EVALUATED + UNSUPPORTED_DIRECTION`.                                  |

## 6. Source register

SR2026 is authoritative. SR2025 may be used only for a documented item absent from SR2026 and required by an approved converter profile; it must never override an SR2026 change, prohibition or deprecation. No SR2025 fallback is used by this candidate.

| Controlled source                                                                                              | SHA-256                                                            | SSI-only use                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SWIFT/us1m_20260717.pdf`                                                                                      | `54002BDF2140563A543DE330283EE7BC64C0724DC69499326CE34F70A7E90E70` | **Official SWIFT facts:** MT103 Base scope/roles pp.171–172 and SSI fields 53a/54a/55a/56a/57a pp.195–203; MT103 REMIT scope pp.255–256 and SSI fields pp.279–287; MT103 STP scope pp.297–298 and SSI fields pp.318–324. On p.203 and p.287, SSI evidence stops at the Field 57a Usage Rules/Example and excludes the Field 59a subsection beginning later on the same page; on p.324, evidence stops at the Field 57A Example and excludes the Field 59a subsection beginning later on the same page. REMIT enters this product only when an effective controlled Product profile permits it. |
| `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_008_001_08_FIToFICustomerCreditTransfer_20260521_0831.pdf`     | `F563E3478ED76329DB2400BC1E58BE5D345C499DABEB4C4561A7A8E1D15566B3` | **Official SWIFT facts:** pacs.008 plain identifier/profile/BizSvc p.3 and p.10; INDA/INGA/COVE and reimbursement agent/account structure pp.13–22.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_008_001_08_STP_FIToFICustomerCreditTransfer_20260522_0133.pdf` | `D9807C95700CCFBFB6AAD03CE40AE32213F75B805A683937EB4BBD296EEF23F6` | **Official SWIFT facts:** pacs.008 STP identifier/profile/BizSvc p.3 and p.10; SSI-relevant settlement and reimbursement structure pp.13–18.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [SSI Resolver service boundary](ssi-resolver-service-boundary-v1.md)                                           | Git-tracked path in the externally recorded exact candidate commit | SSI-tag NVR versus full-message validator ownership.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [Operating model](lc-ssi-wc-operating-model-zh-v2.md)                                                          | Git-tracked path in the externally recorded exact candidate commit | Product boundary, controlled context, TDD, Page Parameters and Four-eyes governance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

The source rows above support message/profile facts and SSI role semantics. Atomic binding, collapsed-boundary treatment, ranking and fail-closed behavior are controlled Product/BA policy decisions in section 5 and must not be represented as SWIFT mandates.

## 7. Supersession and approval

This v3 candidate supersedes v2 as the proposed active MT1 / pacs.008 knowledge entry point. The v0.6 CPI proposal, Creditor Destination repair matrix, old scenario matrix, same-SHA review and bundle are retained unchanged as historical evidence. They are not current implementation authority. The old OPEN-01 material is only an upstream interface reference.

| Gate                           | Verdict          |
| ------------------------------ | ---------------- |
| BA Maker `/root/mt1_ba_review` | COMPLETE         |
| Independent BA Checker         | PENDING          |
| QA Checker                     | PENDING          |
| Product Owner                  | PENDING          |
| Implementation authorization   | `NOT AUTHORIZED` |

Any change to this candidate or either linked active contract invalidates prior review and requires Four-eyes review of the new exact Git candidate commit.
