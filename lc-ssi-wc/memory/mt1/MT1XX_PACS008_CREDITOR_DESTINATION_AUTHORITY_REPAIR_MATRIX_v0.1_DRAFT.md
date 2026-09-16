# MT1／pacs.008 Creditor Destination Authority & Repair Matrix v0.1

**Decision ID:** `SSI-OPEN-01-P1`  
**Status:** `CONTROLLED DRAFT — PENDING INDEPENDENT BA CHECK / QA / PO`  
**Scope:** Frozen v0.5 Phase 1 only: MT103, MT103 STP, approved MT103 REMIT profile, pacs.008.001.08 plain and STP.  
**Out of scope:** SSI selection, route topology, MT/MX rendering and Future MT102/104/107 rules.

## 1. Decision boundary

`CreditorDestination` is the canonical financial-institution endpoint servicing the creditor/beneficiary account. It is a transaction/reference-derived lookup input, **not Bank SSI**. SSI and route candidates may prove reachability but may never create or silently replace the destination.

The canonical value contains the stable financial-institution and legal-entity identities, branch/service location when required, governed identifiers, account-servicer relationship when derived, original/effective values, authority, derivation and validation status.

## 2. Authority classes

| Class | Meaning | Replacement rule |
|---|---|---|
| `AUTHORITATIVE` | Explicit transaction-scoped customer authorization or immutable authorized payment-profile snapshot | Fail closed on different stable identity. No silent replacement. |
| `REQUESTED_PREFERRED` | Preferred correspondent/intermediary/route agent | Routing constraint only; never destination authority. OPEN-02 evaluates it only after an independent destination succeeds. |
| `DERIVED_REPAIRED` | Creditor-account servicer reference, approved message-context default or governed same-identity normalization | May fill an absent value or normalize the same proven identity; may not select a different FI. |

Within those classes, evidence precedence is:

1. `CUSTOMER_AUTHORIZED_CREDITOR_AGENT`;
2. `CREDITOR_ACCOUNT_SERVICER_REFERENCE` when CPI is absent, or to validate CPI;
3. `PROFILE_DEFINED_MESSAGE_CONTEXT` for an approved MT103-family Receiver-as-Account-With-Institution scenario;
4. `BANK_REFERENCE_ENRICHMENT` for the same stable identity only.

An SSI record, route candidate, preferred correspondent, intermediary or renderer decision is never an authority source for Creditor Destination.

## 3. Identity and repair invariant

Automatic normalization is limited to formatting/case, aliases or governed identifiers resolving uniquely to the same stable legal and servicing identity, compatible BIC8/BIC11 enrichment, uniquely proven compatible branch/service location, and display/reference enrichment.

Changing legal entity, account servicer, an explicitly supplied branch, creditor account, country/corridor meaning, or converting an intermediary/correspondent into Creditor Agent is not normalization. For `AUTHORITATIVE` CPI it requires a governed repair workflow outside automatic SSI resolution. The original and effective values must remain distinct; route and screening evidence derived from the former becomes `STALE`.

BIC8 equality alone does not prove identity equivalence.

## 4. Deterministic Authority + Conflict Matrix

| Rule | CPI Creditor Agent | Reference/message evidence | Authority | Deterministic action | Outcome |
|---|---|---|---|---|---|
| `CD-01` | One valid identity A | Absent | `AUTHORITATIVE` | Preserve A | `CREDITOR_DESTINATION_CONFIRMED` |
| `CD-02A` | A | Same stable identity A; no effective representation change | `AUTHORITATIVE` | Validate and preserve | `CREDITOR_DESTINATION_CONFIRMED` |
| `CD-02B` | A | Same stable identity A; governed representation change required | `AUTHORITATIVE` | Apply same-identity normalization only | `CREDITOR_DESTINATION_NORMALIZED` |
| `CD-03` | Institution-level A | One uniquely proven compatible servicing branch A' | `AUTHORITATIVE` | Enrich only when it does not contradict supplied branch/servicer | `CREDITOR_DESTINATION_NORMALIZED` |
| `CD-04` | A | Different legal entity, servicer or explicit branch B | `AUTHORITATIVE` | Fail closed; never auto-replace | `CREDITOR_DESTINATION_CONFLICT` |
| `CD-05` | A, syntactically invalid or unknown | One possible repair A' | `AUTHORITATIVE` | Do not auto-replace; route to governed repair with no SSI lookup | `CREDITOR_DESTINATION_REPAIR_REQUIRED` |
| `CD-06` | A, invalid/unknown | No unique repair | Any | Fail closed | `INVALID_CREDITOR_DESTINATION` |
| `CD-07A` | Preferred route agent A only | No independent destination evidence | `REQUESTED_PREFERRED` | Retain A only as OPEN-02 constraint; do not promote it | `CREDITOR_DESTINATION_MISSING` |
| `CD-07B` | Preferred route agent A | Independent account/reference evidence uniquely establishes destination B | `REQUESTED_PREFERRED` | Derive B from independent evidence; retain A as immutable OPEN-02 constraint | `CREDITOR_DESTINATION_DERIVED` |
| `CD-07C` | Preferred route agent A | Independent co-equal destination evidence establishes B and C | `REQUESTED_PREFERRED` | Preference cannot choose destination; fail closed | `AMBIGUOUS_CREDITOR_DESTINATION` |
| `CD-08` | Absent | One unique active/effective account servicer A | N/A | Derive A from governed account/reference relationship | `CREDITOR_DESTINATION_DERIVED` |
| `CD-09` | Absent | Multiple distinct active servicers A/B | N/A | Do not rank or choose by row order | `AMBIGUOUS_CREDITOR_DESTINATION` |
| `CD-10` | Absent | None; approved MT103 Receiver-as-AWI scenario | N/A | Derive from governed Receiver/current-hop context | `CREDITOR_DESTINATION_DERIVED` with `MESSAGE_CONTEXT_DERIVED` |
| `CD-11` | Absent | None; no approved default, including pacs.008 | N/A | Fail closed | `CREDITOR_DESTINATION_MISSING` |
| `CD-12` | Multiple representations | All resolve to one stable identity | Any | Collapse to one canonical identity; retain every source | `CREDITOR_DESTINATION_NORMALIZED` |
| `CD-13` | Multiple unresolved co-equal authority values after identifier precedence | More than one stable identity | Any | Fail closed | `AMBIGUOUS_CREDITOR_DESTINATION` |
| `CD-14` | Only intermediary/correspondent supplied | Any | Any | Keep as routing constraint; never promote to Creditor Agent | `CREDITOR_DESTINATION_MISSING` unless another authority confirms it |
| `CD-15` | Already accepted canonical destination A | SSI/route proposes B | Any | Preserve A; route candidate rejected separately | `CREDITOR_DESTINATION_CONFLICT` |
| `CD-16` | Accepted destination A | Same A but no eligible route | Any | Pass A unchanged to OPEN-02 | OPEN-02 alone returns its resolver outcome |
| `CD-17` | Any | Profile/community/MUG not approved | Any | Do not apply destination repair or SSI lookup | `UNSUPPORTED_PROFILE` |

## 5. Cardinality and gate rules

- Exactly one effective `CreditorDestination` is required before SSI lookup.
- Multiple aliases for one stable FI are one destination; distinct stable FIs are an upstream ambiguity, not route candidates.
- pacs.008 plain/STP Creditor Agent is `[1..1]`; missing or conflicting endpoints do not enter SSI lookup.
- MT103-family rendered 57a may be absent only under an approved Receiver-as-Account-With-Institution scenario; the canonical model still contains one destination.
- Creditor Agent Account and creditor customer account are distinct and cannot be copied into each other.
- Only `CONFIRMED`, `NORMALIZED` and `DERIVED` destination-stage states proceed to OPEN-02.
- Failure returns no selected SSI, route, message payload or fallback correspondent.

For pacs.008, governed identifier precedence is applied before identity cardinality: BICFI determines the agent identity when present; clearing-member ID and LEI may complement but cannot override BICFI. Conflicting lower-priority identifiers are rejection evidence, not co-equal destinations. Full CBPR+ combination/NVR validation remains downstream.

Decision precedence is first-match: unsupported profile (`CD-17`); authoritative conflict (`CD-04`); invalid/repair-required (`CD-05`/`CD-06`); accepted canonical destination versus route conflict (`CD-15`); identifier precedence; authoritative confirmation/normalization (`CD-01`–`CD-03`); independent derivation (`CD-08`/`CD-10`); co-equal ambiguity (`CD-09`/`CD-13`); missing (`CD-07A`/`CD-11`/`CD-14`).

### 5.1 Typed outcome boundary

`destinationDecisionOutcome` is distinct from the top-level Resolver outcome.

```text
destinationDecisionOutcome =
  CREDITOR_DESTINATION_CONFIRMED
| CREDITOR_DESTINATION_NORMALIZED
| CREDITOR_DESTINATION_DERIVED
| CREDITOR_DESTINATION_CONFLICT
| CREDITOR_DESTINATION_REPAIR_REQUIRED
| INVALID_CREDITOR_DESTINATION
| CREDITOR_DESTINATION_MISSING
| AMBIGUOUS_CREDITOR_DESTINATION
| UNSUPPORTED_PROFILE
```

`destinationDecisionState = CURRENT | STALE` is separate from the outcome enum. Any governing source/version change sets state=`STALE` and requires recomputation.

After a successful destination decision, OPEN-02 alone returns `resolverOutcome`. Route-policy outcomes never originate from OPEN-01.

## 6. Governed repair and provenance

Every decision records source type and stable ID, source version/SHA, immutable original value, normalized/effective value, stable FI/legal entity/branch/servicer identities, authority class, derivation, rule ID, outcome, actor/system, timestamp, CPI snapshot SHA and context SHA.

For governed repair, also record:

```text
originalCreditorDestination
effectiveCreditorDestination
repairReason
repairRuleId
originalSource
effectiveSource
approvedBy
approvedAt
cpiSnapshotSha256
repairDelta
```

Also record profile/BizSvc/community/MUG identity, exact source field/path, identity-map and alias-rule ID/version, identifier-precedence rule ID/version, all considered stable identities with rejection reasons, and decision-priority rule ID.

Any CPI, account, reference or context version change invalidates the decision and marks dependent route/screening evidence `STALE`. A customer input remains `CUSTOMER_INPUT` even when equal to Bank SSI; it must not be relabelled `RESOLVED_FROM_SSI`.

Every non-success decision guarantees: no SSI lookup, selected route, MT/MX payload, confirmed resolution, automatic fallback or Repair Queue/job side effect. `REPAIR_REQUIRED` is a decision only; a separate authorized command owns any repair mutation.

## 7. TDD Test Oracle

| Test | Input/condition | Expected result |
|---|---|---|
| `CD-T01` | Authoritative CPI A equals derived A | `CREDITOR_DESTINATION_CONFIRMED`; no identity change |
| `CD-T02` | BIC8 plus BIC11 proven by governed map to the same FI, legal entity, servicing relationship and compatible branch | `CREDITOR_DESTINATION_NORMALIZED`; prefix equality alone is insufficient |
| `CD-T03` | Authoritative CPI A conflicts with derived B | `CREDITOR_DESTINATION_CONFLICT`; no SSI lookup/route/message |
| `CD-T04A` | Authoritative identity is invalid/unknown and exactly one governed repair candidate exists | `CREDITOR_DESTINATION_REPAIR_REQUIRED`; no automatic SSI lookup or substitution |
| `CD-T04B` | Explicit customer branch maps to a different sibling branch/servicer identity | `CREDITOR_DESTINATION_CONFLICT`; no silent substitution |
| `CD-T05` | No CPI; one unique active servicer | `CREDITOR_DESTINATION_DERIVED` from reference, not SSI |
| `CD-T06` | No CPI; two distinct active servicers | `AMBIGUOUS_CREDITOR_DESTINATION`; never choose by rank/UUID |
| `CD-T07` | Approved MT103 Receiver-as-AWI scenario; 57a absent | `CREDITOR_DESTINATION_DERIVED`; derivation=`MESSAGE_CONTEXT_DERIVED` |
| `CD-T08` | pacs.008 Creditor Agent absent | `CREDITOR_DESTINATION_MISSING`; no SSI lookup |
| `CD-T09` | Customer supplies only intermediary and no other authority exists | `CREDITOR_DESTINATION_MISSING`; intermediary remains constraint |
| `CD-T10` | Accepted canonical destination A; SSI candidate names B | `CREDITOR_DESTINATION_CONFLICT`; no continuation or side effect |
| `CD-T11` | Multiple aliases map to one stable ID | One normalized destination; all originals audited |
| `CD-T12` | After profile identifier precedence, two unresolved co-equal authority sources map to different stable IDs | `AMBIGUOUS_CREDITOR_DESTINATION` |
| `CD-T13` | Source/reference version changes | `destinationDecisionState=STALE`; recompute before OPEN-02 |
| `CD-T14` | MT103 REMIT row not approved | `UNSUPPORTED_PROFILE` before repair/lookup |
| `CD-T15` | Equivalent profile inputs resolve through the same controlled identity map | Same canonical stable identity and common identity-map/rule evidence where applicable; distinct profile/BizSvc/source-field provenance retained |
| `CD-T16` | Preferred route agent A; no independent destination | `CREDITOR_DESTINATION_MISSING`; A remains OPEN-02 constraint |
| `CD-T17` | Preferred route agent A; independent evidence uniquely proves B | destination `DERIVED` from evidence; A remains OPEN-02 constraint |
| `CD-T18` | Authoritative pacs.008 BICFI A conflicts with complementary clearing-member/LEI identity B | `CREDITOR_DESTINATION_CONFIRMED` for A; retain B as rejected lower-priority evidence |
| `CD-T19A` | Authoritative A and same-BIC8 candidate B have different branch/servicer identity | `CREDITOR_DESTINATION_CONFLICT`; no normalization |
| `CD-T19B` | Two unresolved co-equal same-BIC8 branch candidates have different servicer identities | `AMBIGUOUS_CREDITOR_DESTINATION`; no normalization |
| `CD-T20` | Any non-success decision | No confirmed resolution, SSI lookup, route, payload, fallback or repair-job side effect |

## 8. Evidence register

| Source | SHA-256 | Evidence use |
|---|---|---|
| `SWIFT/us1m_20260717.pdf` | `54002BDF2140563A543DE330283EE7BC64C0724DC69499326CE34F70A7E90E70` | MT103 base pp.198–203; REMIT pp.285–287; STP pp.322–323 |
| `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_008_001_08_FIToFICustomerCreditTransfer_20260521_0831.pdf` | `F563E3478ED76329DB2400BC1E58BE5D345C499DABEB4C4561A7A8E1D15566B3` | Identifier precedence p.3; Creditor Agent/account pp.57,59 |
| `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_008_001_08_STP_FIToFICustomerCreditTransfer_20260522_0133.pdf` | `D9807C95700CCFBFB6AAD03CE40AE32213F75B805A683937EB4BBD296EEF23F6` | Identifier precedence p.3; Creditor Agent/account pp.42–43 |
| Proposal v0.5 | `E21167BDADF315D15D92FAD2023F5C83ECB323C81655935C7A081D9F0F6F9D02` | Frozen Phase-1 profiles, CPI/SSI boundary and OPEN scope |
| Memory v2 draft | `B74B46E1A5962DEE7E629CA61B9C0E5A4B208AD0290724BBF8F36301AA5CC080` | Current governed context model |

Authority hierarchy, repair authorization, fail-closed outcomes and provenance are BA/Product policy rulings; they are not represented as SWIFT network rules.

## 9. Closure gate

This artifact remains `OPEN`. It may be marked `CLOSED` only when:

1. every Phase-1 profile links to applicable rows;
2. TDD assigns stable IDs to all test-oracle cases;
3. BA Maker, a different Independent BA Checker, QA and Product Owner approve this exact artifact SHA;
4. Proposal, this matrix, OPEN-02 Matrix and review report each retain their own SHA-256 and are locked by one bundle manifest.

Any artifact change invalidates its prior signatures and the bundle approval.
