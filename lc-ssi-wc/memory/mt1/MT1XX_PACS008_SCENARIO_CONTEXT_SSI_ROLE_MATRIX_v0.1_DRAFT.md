# MT1／pacs.008 Scenario × Context × SSI Role Matrix v0.1

**Decision ID:** `SSI-OPEN-02-P1`  
**Status:** `CONTROLLED DRAFT — PENDING INDEPENDENT BA CHECK / QA / PO`  
**Scope:** Frozen v0.5 Phase 1 only.  
**Structure:** Profile Eligibility + Settlement Context + Route Topology + Authoritative Composition; these four layers compose one deterministic oracle.

## 1. Common definitions

| Term | Definition |
|---|---|
| `currentHop` | One FI-to-FI settlement/message hop `(instructingAgent, instructedAgent, profileId, settlementContext, currency, bookingEntity, valueDate)`. pacs.008 uses `InstgAgt`/`InstdAgt`; MT103 uses FIN Sender/Receiver. |
| `routeLeg[n]` | One ordered bank-controlled leg `(fromAgent, toAgent, accountOwner, accountServicer, accountRef, relationshipType, SSI provenance/version)`. |
| `sameExactServicer` | Exact canonical FI and branch/service-location identity equality. Group, parent, BIC8 prefix, national-member family or correspondent affiliation is insufficient. |
| Complete route | Every required leg and role is present, eligible, effective and currency/entity/date compatible, bound to one `routeBindingId` and one `snapshotToken`. |
| Atomicity | Own SSI/Nostro and Counterparty SSI retain independent provenance, but success requires one complete bound route. No fields or legs may be mixed across candidates. |
| Success | `resolutionState=RESOLVED` only when `routeOutcome=ELIGIBLE_COMPLETE_ROUTE`. |
| Failure | No SSI payload, confirmed resolution or repair side effect. |

### Requirement enum

| Value | Meaning |
|---|---|
| `REQUIRED` | Role/evidence must exist and validate. |
| `OPTIONAL` | Absence alone is valid; when present it must match the same context, route and snapshot. |
| `NOT_REQUIRED` | Resolver does not create or look up the role for this context. |
| `PROHIBITED` | Role/context is illegal for the selected Phase-1 profile. |
| `REFERENCE_DATA_REQUIRED` | Required evidence is clearing/network reference data, not Bank SSI; it does not increment SSI count or receive SSI provenance. |

`NOT_REQUIRED` is distinct from `PROHIBITED`.

## 2. Matrix A — Profile Eligibility

| ID | Frozen Phase-1 profile | Exact eligibility gate | Allowed context | Requirement | Gate result |
|---|---|---|---|---|---|
| `A01` | MT103 Base SR2026 | MT103; neither `119:STP` nor `119:REMIT`; approved FIN service; FI-to-FI settlement leg | `SERIAL+INDA`, `SERIAL+INGA`, `COVER+COVE` | `REQUIRED` | Pass to Matrix B |
| `A02` | MT103 STP SR2026 | MT103 with exact `119:STP`; approved STP service; FI-to-FI settlement leg | Same as A01 | `REQUIRED` | Pass to Matrix B |
| `A03` | MT103 REMIT SR2026 | MT103 with exact `119:REMIT` and effective approved REMIT community/MUG/profile row | Same as A01 | `REQUIRED` | Pass only on exact match; otherwise `UNSUPPORTED_PROFILE` |
| `A04` | pacs.008 plain | `pacs.008.001.08`; `BizSvc=swift.cbprplus.04`; `NbOfTxs=1`; approved CBPR+ row | `INDA`, `INGA`, `COVE` | `REQUIRED` | Pass to Matrix B |
| `A05` | pacs.008 STP | `pacs.008.001.08`; `BizSvc=swift.cbprplus.stp.04`; `NbOfTxs=1`; approved STP row | `INDA`, `INGA`, `COVE` | `REQUIRED` | Pass to Matrix B |
| `A06` | pacs.008 `CLRG` | No frozen Phase-1 profile approves `CLRG` | None | `PROHIBITED` | `UNSUPPORTED_PROFILE`; no lookup |
| `A07A` | MT102/102 STP, MT104 Direct Debit with Sequence C, MT107 | Future/deferred settlement profiles | None | `PROHIBITED` in Phase 1 | `UNSUPPORTED_PROFILE`; non-blocking deferred scope |
| `A07B` | FI-to-FI MT104 Request without Sequence C | Bank-to-bank but no current settlement leg | None | `NOT_REQUIRED` | `BANK_TO_BANK_NON_SETTLEMENT_LEG_OUT_OF_SCOPE` |
| `A08` | Unknown version, wrong/missing BizSvc or unapproved service/community/MUG | No exact controlled profile | None | `PROHIBITED` | `UNSUPPORTED_PROFILE`; no lookup |
| `A09` | Supported profile, non-bank leg | No FI-to-FI controlled settlement route | None | `NOT_REQUIRED` | `NON_BANK_LEG_OUT_OF_SCOPE` |
| `A10` | Supported profile, FI-to-FI non-settlement leg | No controlled settlement route | None | `NOT_REQUIRED` | `BANK_TO_BANK_NON_SETTLEMENT_LEG_OUT_OF_SCOPE` |
| `A11` | Customer/corporate-to-bank MT101 | Payment initiation; no FI-to-FI settlement leg | None | `NOT_REQUIRED` | `NON_BANK_LEG_OUT_OF_SCOPE` |
| `A12` | FI-to-FI MT101 request | Bank-to-bank request, not current settlement leg | None | `NOT_REQUIRED` | `BANK_TO_BANK_NON_SETTLEMENT_LEG_OUT_OF_SCOPE` |

`REFERENCE_DATA_REQUIRED` is not reachable for CLRG in frozen Phase 1 because A06 terminates first. It is reserved for a separately approved profile and explicit matrix row.

## 3. Matrix B — Settlement Context → Account Relationship / SSI Roles

| ID | Context/role | Deterministic relationship | Requirement | Invalid condition/outcome |
|---|---|---|---|---|
| `B01` | INDA | `accountOwner == currentHop.instructingAgent`; `accountServicer == currentHop.instructedAgent` | `REQUIRED` | Eliminate mismatch; none remain → `NO_ELIGIBLE_SSI` |
| `B02` | INDA direct bilateral relation, no SSI lookup/account selection | Approved profile/policy supplies versioned external `bilateralRelationshipEvidenceId`; source is `BILATERAL_RELATIONSHIP_REFERENCE`, not SSI | `NOT_REQUIRED` for SSI lookup | Matrix C may return `SSI_NOT_REQUIRED` only after exact identity/currency/entity/date/version validation |
| `B03` | INDA explicit/selectable account | Account, owner, servicer, currency and entity come from one governed record/version | `REQUIRED` | Missing/ineligible → `NO_ELIGIBLE_SSI` |
| `B04` | INGA | `accountOwner == currentHop.instructedAgent`; `accountServicer == currentHop.instructingAgent` | `REQUIRED` | Eliminate mismatch; none remain → `NO_ELIGIBLE_SSI` |
| `B05` | INGA direct bilateral relation, no SSI lookup/account selection | Approved profile/policy supplies versioned external `bilateralRelationshipEvidenceId`; source is `BILATERAL_RELATIONSHIP_REFERENCE`, not SSI | `NOT_REQUIRED` for SSI lookup | Matrix C may return `SSI_NOT_REQUIRED` only after exact identity/currency/entity/date/version validation |
| `B06` | INGA explicit/selectable account | Account, owner, servicer, currency and entity come from one governed record/version | `REQUIRED` | Missing/ineligible → `NO_ELIGIBLE_SSI` |
| `B07` | INDA/INGA reimbursement-agent roles | Reimbursement roles do not belong to serial/direct-account context | `PROHIBITED` | `INVALID_CONTEXT_TOPOLOGY` |
| `B08` | COVE customer-payment hop settlement account | Customer hop cannot masquerade as cover account leg | `PROHIBITED` | `INVALID_CONTEXT_TOPOLOGY` |
| `B09` | COVE cover route | One complete ordered cover route with independent SSI provenance per leg | `REQUIRED` | No complete candidate → `NO_ELIGIBLE_SSI` |
| `B10` | COVE origin-side distinct-servicer boundary | `OWN_REIMBURSEMENT_AGENT` and applicable `OWN_REIMBURSEMENT_ACCOUNT`, sourced from Own SSI; each account declares owner/servicer and B01/B04 relation for its leg | `REQUIRED` | Missing/invalid role invalidates entire candidate |
| `B11` | COVE destination-side distinct-servicer boundary | `COUNTERPARTY_REIMBURSEMENT_AGENT` and applicable `COUNTERPARTY_REIMBURSEMENT_ACCOUNT`, sourced from Counterparty SSI; each account declares owner/servicer and B01/B04 relation | `REQUIRED` | Missing/invalid role invalidates entire candidate |
| `B12` | COVE actual middle/third leg | `THIRD_REIMBURSEMENT_AGENT` and applicable account, bound to that leg with independent SSI provenance/version and B01/B04 relation | `REQUIRED` | Missing role invalidates entire candidate |
| `B13` | COVE has no middle/third leg | Do not create third reimbursement role | `NOT_REQUIRED` | Contradictory surplus route → `INVALID_CONTEXT_TOPOLOGY` |
| `B14` | Each COVE settlement leg | Each leg independently satisfies B01 or B04 owner/servicer relation | `REQUIRED` | Any failure eliminates complete cover route |
| `B14A` | COVE origin side collapsed by `sameExactServicer` | `OWN_REIMBURSEMENT_AGENT/ACCOUNT` are not created for that collapsed boundary | `NOT_REQUIRED` | Fabricated role → `INVALID_CONTEXT_TOPOLOGY` |
| `B14B` | COVE destination side collapsed by `sameExactServicer` | `COUNTERPARTY_REIMBURSEMENT_AGENT/ACCOUNT` are not created for that collapsed boundary | `NOT_REQUIRED` | Fabricated role → `INVALID_CONTEXT_TOPOLOGY` |
| `B15` | pacs.009 COV processing | Creation, correlation, lifecycle and execution are outside this resolver | `NOT_REQUIRED` | Return cover SSI roles/provenance only |
| `B16` | Customer parties/accounts | CPI-owned; never Bank SSI | `PROHIBITED` as SSI | Do not infer, overwrite or count as SSI |
| `B17` | `currentHop` agents | Context identities, not proof of SSI relationship | `REQUIRED` as context; `NOT_REQUIRED` as SSI evidence | Missing/contradictory hop → `INVALID_CONTEXT_TOPOLOGY` |
| `B18` | CLRG | No approved frozen Phase-1 profile | `PROHIBITED` | Matrix A returns `UNSUPPORTED_PROFILE` |

Canonical roles may later project to MT103 53a/54a/55a or pacs.008 reimbursement-agent/account elements. Tag/XML-option validation and pacs.009 COV construction remain downstream.

## 4. Matrix C — Route Topology and Atomic Outcome

| ID | Topology | Deterministic predicate | Required SSI roles | Route outcome | Decision outcome |
|---|---|---|---|---|---|
| `C01` | Direct, same exact prescribed servicer, unique external bilateral relation | One hop; B02/B05 external evidence exists; Resolver performs no SSI lookup/account selection | Versioned `bilateralRelationshipEvidenceId` only; source is not SSI | `ELIGIBLE_COMPLETE_ROUTE` | `SSI_NOT_REQUIRED` |
| `C02` | Direct, same exact servicer, account selection required | One hop; exact Matrix B relation; one eligible complete account/route candidate | B03 or B06 account role | `ELIGIBLE_COMPLETE_ROUTE` | `BANK_TO_BANK_SSI_REQUIRED` |
| `C03` | Direct claimed but another bank leg is required | Direct declaration contradicts exact identities | N/A | None | `INVALID_CONTEXT_TOPOLOGY` |
| `C04` | Intermediated serial | Ordered contiguous legs; every `routeLeg[n]` independently binds to B01 or B04 with owner, servicer, account/relationship evidence and SSI provenance/version; one uniquely best complete route | Every controlled intermediary/account leg | `ELIGIBLE_COMPLETE_ROUTE` | `BANK_TO_BANK_SSI_REQUIRED` |
| `C05` | Complete COVE | All reimbursement legs and B14 relationships complete; one uniquely best route | Cover SSI roles only | `ELIGIBLE_COMPLETE_ROUTE` | `BANK_TO_BANK_SSI_REQUIRED` |
| `C06` | Invalid/missing hop or incompatible serial/cover/context combination | Context is incomplete or contradictory | N/A | None | `INVALID_CONTEXT_TOPOLOGY` |
| `C07` | Valid topology but one required leg/account is ineligible | Discard candidate atomically | N/A | None | Zero complete candidates → `NO_ELIGIBLE_SSI` |
| `C08` | More than one equally eligible top-ranked complete route | No governed discriminator | N/A | None | `AMBIGUOUS_ROUTE`; no arbitrary tie-break |
| `C09` | One uniquely top-ranked complete route | Controlled rank metadata; every candidate remains indivisible | Selected route roles | `ELIGIBLE_COMPLETE_ROUTE` | C01/C02/C04/C05 outcome |
| `C10` | Snapshot/context/record version changed | Submitted token/route/eligibility no longer matches | N/A | None | `STALE` |
| `C11` | Legs/roles from different `routeBindingId` values | Candidate mixing violates atomicity | N/A | None | `INVALID_CONTEXT_TOPOLOGY` |
| `C12` | Authoritative CPI destination differs from route-derived destination | CPI is not overwritten | N/A | None | `CREDITOR_DESTINATION_CONFLICT` |

## 4.1 Matrix D — Authoritative composition

`D-PROFILES` means A01/A02/A03/A04/A05 after the exact profile gate passes. Every profile uses the same canonical engine; renderer mapping is downstream.

| ID | Profile rows | Transfer method / context | Customer/settlement topology | Correspondent relation | Applicable B | Applicable C | Required canonical roles | Prohibited roles | Success | Failure |
|---|---|---|---|---|---|---|---|---|---|---|
| `D01` | A01–A05 | SERIAL / INDA | Direct, one current hop | External exact bilateral relation; no SSI lookup | B01+B02+B17 | C01 | `bilateralRelationshipEvidenceId` | Reimbursement roles | `SSI_NOT_REQUIRED` | mismatch/absence → `NO_ELIGIBLE_SSI` |
| `D02` | A01–A05 | SERIAL / INDA | Direct, one current hop | SSI/account selection required | B01+B03+B17 | C02 | INDA settlement account/relationship | Reimbursement roles | `BANK_TO_BANK_SSI_REQUIRED` | `NO_ELIGIBLE_SSI` |
| `D03` | A01–A05 | SERIAL / INGA | Direct, one current hop | External exact bilateral relation; no SSI lookup | B04+B05+B17 | C01 | `bilateralRelationshipEvidenceId` | Reimbursement roles | `SSI_NOT_REQUIRED` | mismatch/absence → `NO_ELIGIBLE_SSI` |
| `D04` | A01–A05 | SERIAL / INGA | Direct, one current hop | SSI/account selection required | B04+B06+B17 | C02 | INGA settlement account/relationship | Reimbursement roles | `BANK_TO_BANK_SSI_REQUIRED` | `NO_ELIGIBLE_SSI` |
| `D05` | A01–A05 | SERIAL / per-leg INDA or INGA | Intermediated ordered route | Different servicers on at least one boundary | B01/B03 or B04/B06 independently for every leg; B17 | C04 | Every intermediary/account leg with independent provenance/version | Global route-level INDA/INGA assumption; reimbursement roles | `BANK_TO_BANK_SSI_REQUIRED` | invalid/missing leg → `NO_ELIGIBLE_SSI`; tie → `AMBIGUOUS_ROUTE` |
| `D06A` | A01–A05 | COVER / COVE | Origin distinct; destination distinct; third leg exists | Three distinct cover boundaries | B09+B10+B11+B12+B14+B15+B17 | C05 | Own, Counterparty and Third reimbursement agent/applicable account | Collapsed-boundary fabrication; customer-hop account as cover leg | `BANK_TO_BANK_SSI_REQUIRED` | incomplete leg → `NO_ELIGIBLE_SSI` |
| `D06B` | A01–A05 | COVER / COVE | Origin distinct; destination distinct; no third leg | Two distinct cover boundaries | B09+B10+B11+B13+B14+B15+B17 | C05 | Own and Counterparty reimbursement agent/applicable account | Third role; customer-hop account as cover leg | `BANK_TO_BANK_SSI_REQUIRED` | incomplete leg → `NO_ELIGIBLE_SSI` |
| `D06C` | A01–A05 | COVER / COVE | Origin distinct; destination collapsed; third leg exists | Origin distinct; destination `sameExactServicer` | B09+B10+B12+B14+B14B+B15+B17 | C05 | Own and Third reimbursement roles | Counterparty role at collapsed boundary; customer-hop account as cover leg | `BANK_TO_BANK_SSI_REQUIRED` | incomplete leg → `NO_ELIGIBLE_SSI` |
| `D06D` | A01–A05 | COVER / COVE | Origin distinct; destination collapsed; no third leg | Origin distinct; destination `sameExactServicer` | B09+B10+B13+B14+B14B+B15+B17 | C05 | Own reimbursement role | Counterparty and Third roles; customer-hop account as cover leg | `BANK_TO_BANK_SSI_REQUIRED` | incomplete leg → `NO_ELIGIBLE_SSI` |
| `D06E` | A01–A05 | COVER / COVE | Origin collapsed; destination distinct; third leg exists | Origin `sameExactServicer`; destination distinct | B09+B11+B12+B14+B14A+B15+B17 | C05 | Counterparty and Third reimbursement roles | Own role at collapsed boundary; customer-hop account as cover leg | `BANK_TO_BANK_SSI_REQUIRED` | incomplete leg → `NO_ELIGIBLE_SSI` |
| `D06F` | A01–A05 | COVER / COVE | Origin collapsed; destination distinct; no third leg | Origin `sameExactServicer`; destination distinct | B09+B11+B13+B14+B14A+B15+B17 | C05 | Counterparty reimbursement role | Own and Third roles; customer-hop account as cover leg | `BANK_TO_BANK_SSI_REQUIRED` | incomplete leg → `NO_ELIGIBLE_SSI` |
| `D06G` | A01–A05 | COVER / COVE | Origin collapsed; destination collapsed; third leg exists | Both edge boundaries `sameExactServicer`; actual middle leg remains | B09+B12+B14+B14A+B14B+B15+B17 | C05 | Third reimbursement role only | Own/Counterparty edge roles; customer-hop account as cover leg | `BANK_TO_BANK_SSI_REQUIRED` | incomplete middle leg → `NO_ELIGIBLE_SSI` |
| `D06H` | A01–A05 | COVER / COVE | Origin collapsed; destination collapsed; no third leg | No distinct cover boundary remains | B09+B13+B14A+B14B+B15+B17 | C05 | No reimbursement SSI role; external direct evidence must satisfy D01/D03 instead | Own/Counterparty/Third roles | None under COVE | `INVALID_CONTEXT_TOPOLOGY`; reclassify through governed direct scenario |
| `D07` | A01–A05 | SERIAL / COVE | Any | Invalid combination | B07/B08 | C06 | None | All | None | `INVALID_CONTEXT_TOPOLOGY` |
| `D08` | A01–A05 | COVER / INDA or INGA | Any | Invalid combination | B07/B08 | C06 | None | All | None | `INVALID_CONTEXT_TOPOLOGY` |
| `D09` | A06 | CLRG | Any | Not approved | B18 | N/A | None | SSI lookup | None | `UNSUPPORTED_PROFILE` |
| `D10` | A07A/A08 | Deferred/unknown/unapproved | Any | Not approved | N/A | N/A | None | SSI lookup | None | `UNSUPPORTED_PROFILE` |
| `D11` | A07B/A10/A12 | FI-to-FI non-settlement | No settlement topology | N/A | N/A | N/A | None | SSI lookup | `BANK_TO_BANK_NON_SETTLEMENT_LEG_OUT_OF_SCOPE` | N/A |
| `D12` | A09/A11 | Non-bank leg | No FI-to-FI settlement topology | N/A | N/A | N/A | None | SSI lookup | `NON_BANK_LEG_OUT_OF_SCOPE` | N/A |

Omission of MT 53a or an MX account element is not evidence for `SSI_NOT_REQUIRED`; only D01/D03 with validated external bilateral evidence can return it without SSI lookup.

### Outcome precedence

1. Matrix A profile/service/community/MUG gate.
2. OPEN-01 authoritative destination conflict.
3. Missing or contradictory context/topology.
4. Snapshot/version revalidation.
5. Atomic candidate validation.
6. Complete-candidate cardinality and controlled ranking.
7. Success: `SSI_NOT_REQUIRED` or `BANK_TO_BANK_SSI_REQUIRED` with `ELIGIBLE_COMPLETE_ROUTE`.

## 5. Deterministic TDD Test Oracle

| Test ID | Given/When | Expected |
|---|---|---|
| `P1-PROFILE-01` | pacs.008.001.08, plain BizSvc, one transaction, INDA | A04 passes; evaluate B01 and C |
| `P1-REMIT-01` | MT103 `119:REMIT`, no effective approved community/MUG/profile row | `UNSUPPORTED_PROFILE`; zero SSI lookup |
| `P1-CLRG-01` | Frozen Phase-1 pacs.008 with `SttlmMtd=CLRG` | `UNSUPPORTED_PROFILE`; never `REFERENCE_DATA_REQUIRED` |
| `P1-DIRECT-01` | Exact direct servicer, unique relation, no account selection | `RESOLVED`; `ELIGIBLE_COMPLETE_ROUTE`; `SSI_NOT_REQUIRED` |
| `P1-COVE-01` | All required COVE roles/legs valid; unique complete route | `RESOLVED`; `ELIGIBLE_COMPLETE_ROUTE`; `BANK_TO_BANK_SSI_REQUIRED`; no pacs.009 creation |
| `P1-NEG-01` | Authoritative CPI destination conflicts with derived destination | `CREDITOR_DESTINATION_CONFLICT`; no overwrite, repair or SSI payload |
| `P1-NEG-02` | Two equally eligible Counterparty SSI routes | `AMBIGUOUS_ROUTE`; no arbitrary selection |
| `P1-NEG-03` | INDA but account owner differs from Instructing Agent | Candidate invalid; zero complete candidates → `NO_ELIGIBLE_SSI` |
| `P1-NEG-04` | INGA but account servicer differs from Instructing Agent | Candidate invalid; zero complete candidates → `NO_ELIGIBLE_SSI` |
| `P1-NEG-05` | Intermediated route has one invalid/missing leg | Whole route invalid; never partial `RESOLVED`; zero alternatives → `NO_ELIGIBLE_SSI` |
| `P1-NEG-06` | Version/context changes after discovery | `STALE`; no SSI payload |
| `P1-NEG-07` | Account from route A plus intermediary from route B | `INVALID_CONTEXT_TOPOLOGY`; no SSI payload |
| `P1-NEG-08A` | Context declares COVE but supplies a contradictory direct customer-hop settlement account as the cover leg | `INVALID_CONTEXT_TOPOLOGY` |
| `P1-NEG-08B` | Context/topology is valid COVE, but one required cover role/leg is absent or ineligible | `NO_ELIGIBLE_SSI` |
| `P1-DEFER-01` | MT102/102 STP, MT104 Direct Debit with Sequence C, or MT107 submitted | `UNSUPPORTED_PROFILE`; deferred and non-blocking |
| `P1-OOS-101A` | Customer/corporate-to-bank MT101 | `NON_BANK_LEG_OUT_OF_SCOPE` |
| `P1-OOS-101B` | FI-to-FI MT101 request | `BANK_TO_BANK_NON_SETTLEMENT_LEG_OUT_OF_SCOPE` |
| `P1-OOS-104` | FI-to-FI MT104 Request without Sequence C | `BANK_TO_BANK_NON_SETTLEMENT_LEG_OUT_OF_SCOPE` |

## 6. Evidence and policy boundary

Normative sources and frozen inputs:

| Artifact | SHA-256 |
|---|---|
| SR2026 MT1 MRG `SWIFT/us1m_20260717.pdf` | `54002BDF2140563A543DE330283EE7BC64C0724DC69499326CE34F70A7E90E70` |
| SR2026 pacs.008 plain UG | `F563E3478ED76329DB2400BC1E58BE5D345C499DABEB4C4561A7A8E1D15566B3` |
| SR2026 pacs.008 STP UG | `D9807C95700CCFBFB6AAD03CE40AE32213F75B805A683937EB4BBD296EEF23F6` |
| Proposal v0.5 | `E21167BDADF315D15D92FAD2023F5C83ECB323C81655935C7A081D9F0F6F9D02` |
| Memory v2 draft | `B74B46E1A5962DEE7E629CA61B9C0E5A4B208AD0290724BBF8F36301AA5CC080` |

INDA/INGA role meanings, pacs.008 settlement-method/profile constraints and MT103 roles are source-backed. Same-exact-servicer semantics, atomic route, ranking, outcome precedence and fail-closed behavior are controlled BA/Product policy rulings and must not be represented as SWIFT network rules.

## 7. Closure gate

This artifact remains `OPEN`. It may be marked `CLOSED` only when:

1. every supported Phase-1 profile/context/topology combination links to exactly one Matrix D row and its Matrix A/B/C dependencies;
2. every test oracle has a stable TDD ID;
3. BA Maker, a different Independent BA Checker, QA and Product Owner approve this exact artifact SHA;
4. Proposal, OPEN-01, OPEN-02 and review report retain independent SHA-256 values and are locked in one bundle manifest.

Any change invalidates prior signatures and bundle approval.
