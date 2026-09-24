# MT2XX / pacs.009 Outward SSI-Only Revision Proposal v1

**Status:** PROPOSED DRAFT — NOT IMPLEMENTATION AUTHORITY  
**Scope:** `OUTWARD_SSI_ONLY`  
**Product type:** `SSI_RESOLUTION_ONLY`  
**Draft author / Maker:** Codex `/root`  
**Independent review:** initial BA, payment-domain and QA review completed; this revision requires re-check

The active Git identity is the repository path plus the exact candidate commit
recorded only in external handoff and review evidence. This document never
embeds or substitutes that identity. It does not supersede
`memory/swift-mt2xx-pacs009-v2.md` and authorizes no code, OAS, fixture,
database or release change until Four-eyes approval of the same exact candidate.

## 1. Recommendation

Reframe MT202, MT202COV, MT205 and MT205COV as outward Bank SSI resolution
profiles. Resolve one eligible atomic settlement route and expose MT/MX
resolution evidence only. Do not compose, convert, confirm, release, transport
or execute a payment message.

```text
profileId + exact paired-evidence BizSvc + scenarioId
+ paymentDirection=OUTWARD + localBankRole=INSTRUCTING_AGENT
+ valid profile-specific upstream attestations
+ currency + bookingEntity + valueDate + counterparty
-> ssiApplicability -> one candidate atomic route
-> actualReceiverBic + governed executionTransport
-> exact-route RMA authorization Gate
-> one routeBindingId/contextSnapshotId
-> resolutionOutcome -> profile-valid SSI evidence only
```

Every response carries:

```text
profileKind = SSI_RESOLUTION_ONLY
paymentExecutable = false
payloadGenerated = false
confirmedResolutionCreated = false
repairQueueCreated = false
```

MT/MX evidence is not a FIN block, ISO 20022 payment payload, conversion result
or transport instruction.

## 2. Controlled profile and scenario Gate

The IDs below are the proposed exact Phase-1 contract. MT sources do not carry
a BAH BizSvc; it is governed paired-evidence metadata supplied by the controlled
profile/fixture, not parsed from an MT message.

| profileId                 | pairedEvidenceProfileId | BizSvc                  | Allowed scenarioId                                                                                 | Pre-discovery context                                                             | Successful evidence                                                              |
| ------------------------- | ----------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `MT2-MT202-PLAIN-SR2026`  | `PACS009-PLAIN-SR2026`  | `swift.cbprplus.04`     | `STANDARD_COUNTERPARTY_BENEFICIARY`, `CREDIT_ONE_OF_SEVERAL_AT_57A`, `BOOK_TRANSFER_SAME_RECEIVER` | governed topology                                                                 | one route; one MT card; one MX card only when all required mappings are approved |
| `MT2-MT202COV-COV-SR2026` | `PACS009-COV-SR2026`    | `swift.cbprplus.cov.04` | same three settlement scenarios, cover-qualified                                                   | `Mt202CovCoverContextAttestation`                                                 | same                                                                             |
| `MT2-MT205-PLAIN-SR2026`  | `PACS009-PLAIN-SR2026`  | `swift.cbprplus.04`     | `STANDARD_UPSTREAM_BENEFICIARY`, `INITIAL_MT200_201_EQUIVALENCE`                                   | `Mt205PredecessorChainAttestation`; equivalence only for proven initial MT200/201 | same                                                                             |
| `MT2-MT205COV-COV-SR2026` | `PACS009-COV-SR2026`    | `swift.cbprplus.cov.04` | `COVER_CONTINUATION`                                                                               | `Mt205CovCoverContextAttestation`; no MT200/201 equivalence                       | same                                                                             |

These are supported route-bearing SSI resolution profiles;
`paymentExecutable=false`. All pacs.009 variants share
`MsgDefIdr=pacs.009.001.08`; it or the MT code alone never selects a profile.
Unknown, missing, ineffective or contradictory identity fails before discovery.
The MT205COV prohibition on MT200/201 equivalence is an invariant of
`COVER_CONTINUATION`, not a separately selectable scenario.

`swift.cbprplus.adv.04` is explicitly unsupported. ADV is pre-advice, performs
no settlement and removes `SttlmAcct`. Its SettlementMethod1Code restriction
removes `CLRG`, `INDA` and `INGA`, leaving only `COVE`; therefore it is not a
supported route-bearing SSI resolution profile.

## 3. Ownership boundary

Resolver-owned: Bank SSI applicability/eligibility/ranking, bank-controlled
relationships, one atomic route, profile-compatible Sequence A MT evidence,
approved MX evidence, governed MT205/MT205COV jurisdiction determination from
controlled Own Entity and Bank Service location records under
`BA-MT2-JURIS-016`, and typed fail-closed outcomes.

Upstream-owned hidden context: RMA source records and lifecycle approval used by
the Resolver's post-route authorization decision; cover purpose, 119=COV, UETR
and Sequence B validation; underlying customer data; MT205/MT205COV predecessor
continuity; message-type selection; full-message validation; sanctions,
compliance and liquidity. The Resolver does not select the message type; it only
refuses to emit route or relationship evidence that violates the selected
profile's jurisdiction condition.

The Resolver consumes typed, versioned attestations. It never displays, repairs,
normalizes or returns customer/underlying values as SSI. Message composition,
MT↔MX conversion, payment confirmation/release/execution/posting/transport,
full-message NVR except a Network Validated Rule whose operands are all
Resolver-derived Sequence A roles (see §6.2), and inward processing are
excluded.

## 4. Page Parameter and attestations

Visible inputs are only `currency`, `bookingEntity`, `valueDate` and a
`counterpartyBankServiceId` chosen from the same snapshot used by Resolve SSI.
Amount is excluded from Phase 1. Adding amount-based eligibility needs separate
policy, snapshot and TDD approval.

Hidden context includes `profileId`, `pairedEvidenceProfileId`, paired-evidence
`businessService`, `scenarioId`, `fixtureBindingId`,
`paymentDirection=OUTWARD`, `localBankRole=INSTRUCTING_AGENT`, typed
current-hop/topology identity and these attestations. Sequence B 50/59 and all
customer data are never SSI inputs.

```ts
type GovernedAttestation = {
  attestationId: string;
  schemaVersion: string;
  issuerId: string;
  issuerVersion: string;
  hashAlgorithm: "SHA-256";
  evidenceHash: string; // 64 uppercase hexadecimal characters
  canonicalScopeHash: string; // SHA-256 over the versioned canonical input
  effectiveFrom: string; // RFC 3339 inclusive
  effectiveTo: string; // RFC 3339 exclusive
  snapshotVersion: string;
};

type Phase1ProfileId =
  | "MT2-MT202-PLAIN-SR2026"
  | "MT2-MT202COV-COV-SR2026"
  | "MT2-MT205-PLAIN-SR2026"
  | "MT2-MT205COV-COV-SR2026";

type SettlementTopologyContext = {
  currentHopId: string;
  instructingAgentBic: string;
  instructedAgentBic: string;
  settlementPerformer: "INSTRUCTED_AGENT" | "INSTRUCTING_AGENT";
  relationshipId: string;
  relationshipVersion: string;
  topologyRuleId: "BA-TOPOLOGY-INDA-INGA-001";
  topologyRuleVersion: "1.0.0";
};

type JurisdictionEvidence = GovernedAttestation & {
  rulingId: "BA-MT2-JURIS-016";
  rulingVersion: "1.0.0";
  senderCountry: string;
  senderCountrySource: {
    recordType: "OWN_ENTITY";
    bookingEntity: string;
    recordId: string;
    recordVersion: string;
  };
  receiverCountry: string;
  receiverCountrySource: {
    recordType: "BANK_SERVICE";
    bankServiceId: string;
    recordId: string;
    recordVersion: string;
  };
  bicCountryConsistency: "MATCH" | "CONFLICT";
};

type BilateralRelationshipAttestation = GovernedAttestation & {
  type: "BILATERAL_RELATIONSHIP";
  profileId: Phase1ProfileId;
  currentHopId: string;
  ownBic: string;
  counterpartyBic: string;
  counterpartyBankServiceId: string;
  currency: string;
  bookingEntity: string;
  valueDate: string;
  ssiLookupRequired: false;
};

type Mt205ProfileId = Extract<
  Phase1ProfileId,
  "MT2-MT205-PLAIN-SR2026" | "MT2-MT205COV-COV-SR2026"
>;

type BilateralJurisdictionCheck<P extends Mt205ProfileId = Mt205ProfileId> = {
  profileId: P;
  bilateralRelationshipAttestationId: string;
  jurisdictionEvidence: JurisdictionEvidence;
};

type BilateralBinding<P extends Mt205ProfileId> = {
  relationship: BilateralRelationshipAttestation & { profileId: P };
  jurisdictionCheck: BilateralJurisdictionCheck<P>;
};

type FinContingencyAuthorization = GovernedAttestation & {
  type: "FIN_CONTINGENCY_AUTHORIZATION";
  intent: "CONTROLLED_FIN_FALLBACK";
  reasonCode: string;
  approvalId: string;
  approverId: string;
  executionTransport: "FIN";
};

type RmaProfileServiceBinding =
  | {
      profileId: "MT2-MT202-PLAIN-SR2026";
      pairedEvidenceProfileId: "PACS009-PLAIN-SR2026";
      messageDefinitionId: "pacs.009.001.08";
      businessService: "swift.cbprplus.04";
      finMessageType: "MT202";
    }
  | {
      profileId: "MT2-MT202COV-COV-SR2026";
      pairedEvidenceProfileId: "PACS009-COV-SR2026";
      messageDefinitionId: "pacs.009.001.08";
      businessService: "swift.cbprplus.cov.04";
      finMessageType: "MT202COV";
    }
  | {
      profileId: "MT2-MT205-PLAIN-SR2026";
      pairedEvidenceProfileId: "PACS009-PLAIN-SR2026";
      messageDefinitionId: "pacs.009.001.08";
      businessService: "swift.cbprplus.04";
      finMessageType: "MT205";
    }
  | {
      profileId: "MT2-MT205COV-COV-SR2026";
      pairedEvidenceProfileId: "PACS009-COV-SR2026";
      messageDefinitionId: "pacs.009.001.08";
      businessService: "swift.cbprplus.cov.04";
      finMessageType: "MT205COV";
    };

type RmaTransportBinding =
  | { executionTransport: "FINPLUS" }
  | {
      executionTransport: "FIN";
      contingencyAuthorizationId: string;
    };

type RmaAuthorizationStatus =
  | {
      lifecycleStatus: "ACTIVE";
      fourEyesApproved: true;
      authorized: true;
    }
  | {
      lifecycleStatus: "ACTIVE" | "INACTIVE";
      fourEyesApproved: boolean;
      authorized: false;
      denialReasonCode: string;
    };

type RmaAuthorizationDecision = GovernedAttestation & {
  type: "RMA_AUTHORIZATION_DECISION";
  ownBic: string;
  actualReceiverBic: string;
  direction: "OUTWARD";
} & RmaProfileServiceBinding &
  RmaTransportBinding &
  RmaAuthorizationStatus;

type Mt202CovCoverContextAttestation = GovernedAttestation & {
  type: "GENUINE_COVER_CONTEXT";
  genuineCoverPurpose: true;
  field119: "COV";
  sequenceBCompleteAndProfileValid: true;
  uetrRule: "CONTINUED" | "PERMITTED_NEW_GENERATION";
};

type Mt205CovCoverContextAttestation = Mt202CovCoverContextAttestation &
  (
    | {
        predecessorType: "MT202COV" | "MT205COV";
        predecessorEvidenceId: string;
      }
    | {
        predecessorType: "GOVERNED_EQUIVALENT_COVER";
        predecessorEvidenceId: string;
        equivalentCoverRuleRecordId: string;
        equivalentCoverRuleRecordVersion: string;
      }
  );

type Mt205PredecessorChainAttestation = GovernedAttestation & {
  type: "MT205_PREDECESSOR_CHAIN";
  immediatePredecessorType:
    | "MT200"
    | "MT201"
    | "MT202"
    | "MT203"
    | "MT205"
    | "GOVERNED_EQUIVALENT_FI_CREDIT_TRANSFER";
  initialTransferType:
    | "MT200"
    | "MT201"
    | "MT202"
    | "MT203"
    | "MT205"
    | "GOVERNED_EQUIVALENT_FI_CREDIT_TRANSFER";
  chainEvidenceId: string;
  chainRuleRecordId: string;
  chainRuleRecordVersion: string;
  nonCoverAttested: true;
  nonCoverRuleRecordId: string;
  nonCoverRuleRecordVersion: string;
  originalReference: string;
  continuityConfirmed: true;
};

type CommonResolutionGateContext = {
  fixtureBindingId: string;
  paymentDirection: "OUTWARD";
  localBankRole: "INSTRUCTING_AGENT";
  topology: SettlementTopologyContext;
};

type ResolutionGateContext = CommonResolutionGateContext &
  (
    | {
        profileId: "MT2-MT202-PLAIN-SR2026";
        pairedEvidenceProfileId: "PACS009-PLAIN-SR2026";
        businessService: "swift.cbprplus.04";
        scenarioId:
          | "STANDARD_COUNTERPARTY_BENEFICIARY"
          | "CREDIT_ONE_OF_SEVERAL_AT_57A"
          | "BOOK_TRANSFER_SAME_RECEIVER";
        bilateralRelationship?: BilateralRelationshipAttestation & {
          profileId: "MT2-MT202-PLAIN-SR2026";
        };
      }
    | {
        profileId: "MT2-MT202COV-COV-SR2026";
        pairedEvidenceProfileId: "PACS009-COV-SR2026";
        businessService: "swift.cbprplus.cov.04";
        scenarioId:
          | "STANDARD_COUNTERPARTY_BENEFICIARY"
          | "CREDIT_ONE_OF_SEVERAL_AT_57A"
          | "BOOK_TRANSFER_SAME_RECEIVER";
        coverContext: Mt202CovCoverContextAttestation;
        bilateralRelationship?: BilateralRelationshipAttestation & {
          profileId: "MT2-MT202COV-COV-SR2026";
        };
      }
    | {
        profileId: "MT2-MT205-PLAIN-SR2026";
        pairedEvidenceProfileId: "PACS009-PLAIN-SR2026";
        businessService: "swift.cbprplus.04";
        scenarioId: "STANDARD_UPSTREAM_BENEFICIARY";
        predecessorChain: Mt205PredecessorChainAttestation;
        bilateral?: BilateralBinding<"MT2-MT205-PLAIN-SR2026">;
      }
    | {
        profileId: "MT2-MT205-PLAIN-SR2026";
        pairedEvidenceProfileId: "PACS009-PLAIN-SR2026";
        businessService: "swift.cbprplus.04";
        scenarioId: "INITIAL_MT200_201_EQUIVALENCE";
        predecessorChain: Mt205PredecessorChainAttestation & {
          initialTransferType: "MT200" | "MT201";
        };
        bilateral?: BilateralBinding<"MT2-MT205-PLAIN-SR2026">;
      }
    | {
        profileId: "MT2-MT205COV-COV-SR2026";
        pairedEvidenceProfileId: "PACS009-COV-SR2026";
        businessService: "swift.cbprplus.cov.04";
        scenarioId: "COVER_CONTINUATION";
        coverContext: Mt205CovCoverContextAttestation;
        bilateral?: BilateralBinding<"MT2-MT205COV-COV-SR2026">;
      }
  );

type CommonRouteBindingContext = {
  routeBindingId: string;
  contextSnapshotId: string;
  profileId: Phase1ProfileId;
  actualReceiverBankServiceId: string;
  actualReceiverBic: string;
  executionTransport: "FINPLUS" | "FIN";
};

type RouteBindingContext = CommonRouteBindingContext &
  (
    | {
        profileId: "MT2-MT202-PLAIN-SR2026" | "MT2-MT202COV-COV-SR2026";
      }
    | {
        profileId: "MT2-MT205-PLAIN-SR2026" | "MT2-MT205COV-COV-SR2026";
        jurisdictionEvidence: JurisdictionEvidence;
      }
  );
```

`GOVERNED_EQUIVALENT_COVER` requires both
`equivalentCoverRuleRecordId` and `equivalentCoverRuleRecordVersion`; a
free-form flag is insufficient. `INITIAL_MT200_201_EQUIVALENCE` additionally
requires `initialTransferType` MT200 or MT201. MT203 and governed-equivalent FI
transfers are valid standard predecessors but never trigger that equivalence.

Missing scenario-required, expired, hash-mismatched, wrongly scoped or
contradictory cover, predecessor or bilateral context returns
`NOT_EVALUATED + INVALID_UPSTREAM_CONTEXT` with zero SSI discovery. RMA is
different: it runs only after route discovery has produced `actualReceiverBic`
and delivery policy has selected `executionTransport`. Normal Phase-1 transport
is FINPLUS. FIN is permitted only with a valid
`FinContingencyAuthorization`; evidence-card format never selects transport.
Missing or contradictory topology always returns
`NOT_EVALUATED + INVALID_CONTEXT_TOPOLOGY` with zero SSI discovery.

## 5. Source-to-decision register

| Rule ID                   | Class            | Decision                                                                                                   | Authority / anchor                                              | Owner / oracle                                                    |
| ------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `SWIFT-MT2-PROFILE-001`   | `SWIFT_FACT`     | pacs.009 plain/COV/ADV share MsgDefIdr but have exact distinct BizSvc values; ADV is non-settlement        | §2 profile/ADV rules; §12 exact PDF, SHA-256 and BizSvc anchors | registry; exact BizSvc, ADV rejected pre-discovery                |
| `SWIFT-MT2-COV-002`       | `SWIFT_FACT`     | MT202COV and MT205COV require cover purpose, 119=COV, UETR rule and mandatory Sequence B                   | `SWIFT/us2m_20260717.pdf` pp.59–61, 153–155                     | upstream validator; each missing element fails before discovery   |
| `SWIFT-MT2-205-003`       | `SWIFT_FACT`     | MT205 52a=58a equivalence only when initial message is MT200/MT201                                         | `SWIFT/us2m_20260717.pdf` p.148                                 | predecessor validator; never infer from equal values              |
| `SWIFT-MT2-205COV-004`    | `SWIFT_FACT`     | MT205COV accepts MT202COV, MT205COV or governed equivalent; no MT200/201 equivalence                       | `SWIFT/us2m_20260717.pdf` p.153                                 | wrong predecessor rejected pre-discovery                          |
| `SWIFT-MT2-STTLM-005`     | `SWIFT_FACT`     | COV does not imply `SttlmMtd=COVE`; use INDA/INGA                                                          | COV UG pp.404–405                                               | relationship registry; no COVE result                             |
| `BA-MT2-STTLM-006`        | `BA_RULING`      | INDA when instructed agent performs settlement; INGA when instructing/forwarding agent performs it         | `BA-TOPOLOGY-INDA-INGA-001` (§5.1)                              | BA; deterministic topology fixture                                |
| `BA-MT2-SEQB-007`         | `BA_RULING`      | Sequence B is upstream context, never SSI projection                                                       | SSI-only scope                                                  | BA; recursive result scan contains no customer data               |
| `POL-MT2-SSI-008`         | `PRODUCT_POLICY` | only OUTWARD / INSTRUCTING_AGENT                                                                           | product scope                                                   | PO; all other contexts rejected pre-discovery                     |
| `POL-MT2-RMA-009`         | `PRODUCT_POLICY` | validate RMA only after route and delivery policy produce exact receiver/transport                         | operating model §2 and MT2 normal-transport rule                | PO/RMA owner; invalid decision blocks release of route evidence   |
| `POL-MT2-EVIDENCE-010`    | `PRODUCT_POLICY` | evidence only; no payment side effect                                                                      | service boundary                                                | PO; schema forbids FIN/MX documents                               |
| `BA-MT2-PAIRING-011`      | `BA_RULING`      | MT202/205 pair to plain evidence; MT202COV/205COV pair to COV evidence                                     | §2 controlled profile table                                     | BA; exact profile and pairedEvidenceProfileId                     |
| `SWIFT-MT2-205-JURIS-012` | `SWIFT_FACT`     | MT205/MT205COV Sender and selected Receiver must be located in the same country                            | `SWIFT/us2m_20260717.pdf` pp.134, 153                           | pre-bilateral and post-route jurisdiction eligibility requirement |
| `SWIFT-MT2-205-013`       | `SWIFT_FACT`     | MT205 plain must not carry a transfer related to an underlying customer credit transfer sent by cover      | `SWIFT/us2m_20260717.pdf` p.134                                 | predecessor attestation must prove non-cover                      |
| `SWIFT-MT2-OWNACCT-014`   | `SWIFT_FACT`     | MT202/MT202COV own-account scenarios require Option A for the credited account and Sender identity         | `SWIFT/us2m_20260717.pdf` pp.54, 75                             | only the two §6.1 own-account scenarios; exact Option A           |
| `SWIFT-MT2-C81-015`       | `SWIFT_FACT`     | if Sequence A field 56a is present, Sequence A field 57a must also be present; error C81                   | `SWIFT/us2m_20260717.pdf` pp.40, 61, 135, 155                   | key by profile/message and MRG rule C1; enforce 56a ⇒ 57a         |
| `BA-MT2-JURIS-016`        | `BA_RULING`      | resolve Sender/Receiver location country from governed entity and Bank Service records, not BIC text alone | §8.1 controlled jurisdiction evidence method                    | BA; bind source record IDs/versions in snapshot                   |

SR2025 is **NOT USED**: conversion is excluded and the required SR2026 artifacts
exist. It cannot override SR2026.

### 5.1 Controlled topology ruling

`BA-TOPOLOGY-INDA-INGA-001` version `1.0.0` is the proposed internal ruling
identity for the Phase-1 settlement-method decision. Its status is
`PROPOSED — BA APPROVAL REQUIRED`. It binds the selected current-hop topology
and topology-rule version:

- `INDA` when the instructed agent performs settlement;
- `INGA` when the instructing/forwarding agent performs settlement;
- missing or contradictory topology fails with
  `NOT_EVALUATED + INVALID_CONTEXT_TOPOLOGY`.

The approved rule identity and version must be present in the context snapshot
and evidence provenance. COV profile, MT tag, generic reimbursement role or UI
format must never select the settlement method.

### 5.2 Controlled jurisdiction evidence ruling

`BA-MT2-JURIS-016` version `1.0.0` is the proposed internal ruling identity
for MT205/MT205COV jurisdiction evidence. Its status is
`PROPOSED — BA APPROVAL REQUIRED`. It resolves Sender location country from
the governed Own Entity record bound to `bookingEntity` and selected Receiver
location country from the governed Bank Service record. The pre-bilateral or
post-route `JurisdictionEvidence` must carry the ruling identity/version, both
source record IDs/versions, effective dates and evidence hash in the canonical
snapshot.

The BIC country component is a consistency check only. It must not replace the
governed location sources. A BIC/source disagreement fails closed with
`REQUIRED + JURISDICTION_EVIDENCE_CONFLICT` and
`reasonCode=JURISDICTION_SOURCE_CONFLICT`; it must not reach jurisdiction
comparison, ranking or evidence construction.

## 6. Official option baseline and product subset

| Profile          | Official Sequence A option baseline                    | Presence baseline           | Classification rule                                                                                                       |
| ---------------- | ------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| MT202 / MT202COV | `52 A/D; 53 A/B/D; 54 A/B/D; 56 A/D; 57 A/B/D; 58 A/D` | 52a optional; 58a mandatory | applicable bank-controlled values `SSI_DERIVED`; carried values `UPSTREAM_CONTEXT`; rule-driven absence `OMITTED_BY_RULE` |
| MT205 / MT205COV | `52 A/D; 53 A/B/D; 56 A/D; 57 A/B/D; 58 A/D`; no 54a   | 52a and 58a mandatory       | same; 52a/58a remain upstream unless an approved scenario rule says otherwise                                             |

The SSI projection registry contains only Sequence A bank-controlled roles and
options. Sequence B option validity, including 56C/57B/57C where applicable, is
upstream-owned and represented only by the opaque completeness attestation.
Sequence B values/options never enter the SSI generated-tag grid.

Every entry is `SSI_DERIVED | UPSTREAM_CONTEXT | OMITTED_BY_RULE |
NOT_APPLICABLE`; only `SSI_DERIVED` is SSI-generated. An officially permitted
option not safely supported by the controlled renderer returns
`REQUIRED + PROFILE_INCOMPLETE`, never “SWIFT prohibited”.

Sequence A mandatory presence is part of profile completeness even when the
value is `UPSTREAM_CONTEXT`. A mandatory role without a typed governed source
is not a successful route and returns `REQUIRED + PROFILE_INCOMPLETE`; it must
not be inferred from another role or from rendered-value equality.

### 6.1 Controlled scenario disposition and ownership matrix

This matrix is the Phase-1 renderer contract. `D`=`SSI_DERIVED`,
`U`=`UPSTREAM_CONTEXT`, `O`=`OMITTED_BY_RULE`, `N`=`NOT_APPLICABLE`.
`D?` means include only when the selected atomic route requires that optional
role; otherwise emit an omission decision. Options after `/` are the controlled
renderer set. `OWN` uses Own Nostro/Account Master; `CP` uses governed
counterparty Bank SSI; `UP` is upstream-owned. `AS` identifies the account
servicer on every account-bearing result.

| profileId / scenarioId                         | 52a      | 53a        | 54a        | 56a      | 57a        | 58a     | Required ownership invariant                                                                                   |
| ---------------------------------------------- | -------- | ---------- | ---------- | -------- | ---------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| MT202 / `STANDARD_COUNTERPARTY_BENEFICIARY`    | `U?/A,D` | `D?/A,B,D` | `D?/A,B,D` | `D?/A,D` | `D?/A,B,D` | `U/A,D` | derived route roles are CP or OWN with AS; 58a is UP                                                           |
| MT202 / `CREDIT_ONE_OF_SEVERAL_AT_57A`         | `U?/A,D` | `D?/A,B,D` | `O`        | `O`      | `D/A`      | `D/A`   | 57a CP; 58a OWN; account-bearing values include AS                                                             |
| MT202 / `BOOK_TRANSFER_SAME_RECEIVER`          | `U?/A,D` | `D/B`      | `O`        | `O`      | `O`        | `D/A`   | 53B and 58A are OWN Account Master values; Receiver is AS                                                      |
| MT202COV / `STANDARD_COUNTERPARTY_BENEFICIARY` | `U?/A,D` | `D?/A,B,D` | `D?/A,B,D` | `D?/A,D` | `D?/A,B,D` | `U/A,D` | complete cover attestation; derived route roles CP or OWN with AS; Sequence B remains UP                       |
| MT202COV / `CREDIT_ONE_OF_SEVERAL_AT_57A`      | `U?/A,D` | `D?/A,B,D` | `O`        | `O`      | `D/A`      | `D/A`   | complete cover attestation; 57a CP; 58a OWN; Sequence B never projects                                         |
| MT202COV / `BOOK_TRANSFER_SAME_RECEIVER`       | `U?/A,D` | `D/B`      | `O`        | `O`      | `O`        | `D/A`   | complete cover attestation; 53B/58A OWN; Receiver is AS; Sequence B never projects                             |
| MT205 / `STANDARD_UPSTREAM_BENEFICIARY`        | `U/A,D`  | `D?/A,B,D` | `N`        | `D?/A,D` | `D?/A,B,D` | `U/A,D` | non-cover attestation required; 52a/58a UP; selected Receiver country equals Sender country                    |
| MT205 / `INITIAL_MT200_201_EQUIVALENCE`        | `U/A,D`  | `D?/A,B,D` | `N`        | `D?/A,D` | `D?/A,B,D` | `U/A,D` | proven initial MT200/201 and non-cover; 58a=52a by provenance; selected Receiver country equals Sender country |
| MT205COV / `COVER_CONTINUATION`                | `U/A,D`  | `D?/A,B,D` | `N`        | `D?/A,D` | `D?/A,B,D` | `U/A,D` | cover chain required; no MT200/201 equivalence; selected Receiver country equals Sender country                |

Any profile/scenario/option combination absent from this matrix is known
incomplete before SSI discovery and returns
`NOT_EVALUATED + PROFILE_INCOMPLETE`. OAS, runtime, Index, fixtures and tests
must consume this same matrix together with the §6.2 cross-field invariant;
Message-specific UI logic is forbidden.

### 6.2 Sequence A cross-field invariant

`SWIFT-MT2-C81-015` is evaluated after the route has derived Sequence A fields
and before evidence-card construction for every MT202, MT202COV, MT205 and
MT205COV profile:

```text
(profileId, MRG rule C1): presence(56a) => presence(57a)
```

The direction is strictly 56a implies 57a. This rule must not be implemented as
a category-wide generic C1 because other SWIFT categories may assign a
different condition to the same rule number. Evaluate C81 per candidate and
reject only a route that derives 56a without 57a. If any C81-valid candidate
remains, continue completeness, ranking and ambiguity checks. Only when every
otherwise retained candidate is rejected by C81 does the Resolver return
`REQUIRED + NO_ELIGIBLE_SSI` with
`reasonCode=C81_SEQUENCE_A_56_REQUIRES_57`; no partial MT/MX evidence card is
returned. This is a SWIFT-invalid candidate route, not a missing product
renderer capability.

## 7. MT/MX evidence mapping

MT-side evidence uses its own governed projection-rule namespace; it is not an
MT-to-MX mapping ID.

| MT projection rule         | Profile / scenario                                                         | MT evidence                            | Status / absent behavior                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `MRG-MT202-53B`            | MT202 or MT202COV, only in an approved account-bearing Sequence A scenario | field 53B operational account evidence | include only from the selected governed Own Nostro/Account Master record; otherwise omit or fail profile completeness when scenario-required |
| unregistered MT projection | —                                                                          | —                                      | never inferred; required → profile incomplete; optional → omitted by rule                                                                    |

ISO evidence uses the separate controlled mapping registry below.

| Mapping rule                   | Source                           | ISO path                                       | Status / absent behavior                                                  |
| ------------------------------ | -------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| `MAP-MT2-53B-STTLMACCT-001`    | scenario-qualified `SSI_DERIVED` | `/Document/FICdtTrf/GrpHdr/SttlmInf/SttlmAcct` | approved only where UG synonym and scenario apply; otherwise omitted      |
| `MAP-MT2-STTLMMTD-002`         | selected topology                | `/Document/FICdtTrf/GrpHdr/SttlmInf/SttlmMtd`  | required INDA/INGA; missing/contradictory topology → invalid topology     |
| `MAP-MT2-58A-CDTRACCT-PENDING` | scenario-qualified               | `/Document/FICdtTrf/CdtTrfTxInf/CdtrAcct`      | not universal; required use returns profile incomplete until approved     |
| unregistered mapping           | —                                | —                                              | never inferred; required → profile incomplete; optional → omitted by rule |

No conversion occurs. Evidence records only the selected SSI fact, exact
profile-qualified path and provenance.

## 8. Atomic snapshot and account rule

Picker and Resolve use one eligibility function and `contextSnapshotId` covering
release, profile/BizSvc, scenario/fixture, direction/role, currency, entity,
date, counterparty/current hop, typed topology, topology-rule identity/version,
bilateral/cover/predecessor attestations, ranking-policy version and
SSI/applicability/Nostro record versions. After candidate selection, the same
snapshot is extended atomically with `actualReceiverBic`, governed
`executionTransport`, Sender/Receiver country, jurisdiction-rule
identity/version, jurisdiction source record IDs/versions, delivery-policy
identity/version and the exact-route `RmaAuthorizationDecision`
identity/version. The same jurisdiction discriminators extend the snapshot
before an MT205/MT205COV bilateral short-circuit return. Every
topology-derived evidence projection carries the same topology-rule
identity/version in its provenance.

Canonical snapshot construction uses UTF-8 JSON, lexicographically sorted
object keys, preserved array order, normalized uppercase BIC/currency values
and RFC 3339 UTC timestamps. Omitted and null are distinct. The SHA-256 of that
canonical form is `contextSnapshotId`; request, route, RMA decision and evidence
must bind to the same value. A finalized `RouteBindingContext` carries that
exact `contextSnapshotId` and the governed `executionTransport`; neither may be
maintained only as ambient runtime state.

An operational `accountReference` is mandatory for formal account evidence;
`maskedAccountRef` is display-only. Missing operational account data yields
`REQUIRED + PROFILE_INCOMPLETE`; changed context yields
`NOT_EVALUATED + STALE`. Never combine different route bindings.

### 8.1 MT205 jurisdiction and non-cover filters

For MT205 and MT205COV only, apply `BA-MT2-JURIS-016`: resolve Sender location
country from the governed Own Entity record bound to `bookingEntity`, and each
candidate Receiver location country from the selected governed Bank Service
record. Record both source IDs/versions and validate BIC-country consistency;
do not treat the BIC country component alone as conclusive location evidence.
`JurisdictionEvidence` is mandatory in the post-route `RouteBindingContext` for
both profiles. If `bicCountryConsistency=CONFLICT`, fail closed before country
comparison with `REQUIRED + JURISDICTION_EVIDENCE_CONFLICT`,
`reasonCode=JURISDICTION_SOURCE_CONFLICT`, and no route or evidence.

The same jurisdiction Gate applies before the bilateral short-circuit. For an
MT205/MT205COV `BilateralRelationshipAttestation`, use its governed
`counterpartyBankServiceId` and `counterpartyBic` to build a
`BilateralJurisdictionCheck`. A conflict or cross-country relationship fails
under the same jurisdiction outcomes before
`BILATERAL_RELATIONSHIP_CONFIRMED`; only a same-country, source-consistent
relationship may return `NOT_REQUIRED` without SSI candidate discovery. The
profile-discriminated `bilateral` binding makes the relationship and matching
jurisdiction check inseparable for MT205/MT205COV; a relationship without its
check is not a valid `ResolutionGateContext`.
Apply `SWIFT-MT2-205-JURIS-012` after route construction and before
ranking/final cardinality:

- retain only candidates whose selected Receiver country equals Sender country;
- if every otherwise eligible candidate is removed, return
  `REQUIRED + JURISDICTION_NOT_PERMITTED`;
- rank and ambiguity-check only the retained same-country candidates.

`JURISDICTION_NOT_PERMITTED` is the first-level `resolutionOutcome` for both
the bilateral and route-bound paths. It is not a `NO_ELIGIBLE_SSI` reason code;
`NO_ELIGIBLE_SSI` remains reserved for completed SSI candidate discovery where
all candidates fail ordinary or SWIFT route eligibility.

For MT205 plain, `SWIFT-MT2-205-013` additionally requires the versioned
predecessor-chain attestation to prove `nonCoverAttested=true`, including when
the predecessor is `GOVERNED_EQUIVALENT_FI_CREDIT_TRANSFER`. A cover or
unproven-equivalent predecessor fails before SSI discovery as
`NOT_EVALUATED + INVALID_UPSTREAM_CONTEXT`.

### 8.2 Exact-route RMA sequence

1. Evaluate the complete governed context and select at most one candidate SSI
   route.
2. Derive `actualReceiverBic` from that route.
3. Apply delivery policy. Normal Phase 1 selects `FINPLUS`; `FIN` requires a
   valid `FinContingencyAuthorization` with intent, reason and approval.
4. Query RMA using own BIC, exact actual receiver, OUTWARD direction, selected
   transport, profile/paired-evidence profile, message definition, exact BizSvc,
   effective date and ACTIVE Four-eyes snapshot.
5. Withhold the route and all evidence unless the resulting
   `RmaAuthorizationDecision` is authorized and bound to the same canonical
   snapshot.

RMA never selects route, transport, settlement method or evidence-card format.
A compatibility view reuses the confirmed decision and never repeats SSI or RMA
resolution.

## 9. Exhaustive outcome table

Evaluate top-down; first match wins. This table is exhaustive over the
`ResolutionOutcome` union defined in §10.

| Condition                                                                                                                                      | Applicability / outcome                                                            | HTTP |       Discovery | Route/evidence                                         | Side effects |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---- | --------------: | ------------------------------------------------------ | ------------ |
| not OUTWARD or wrong local role                                                                                                                | `NOT_EVALUATED / UNSUPPORTED_DIRECTION`                                            | 422  |               0 | absent                                                 | all false    |
| profile/BizSvc unknown, ADV, ineffective or contradictory                                                                                      | `NOT_EVALUATED / UNSUPPORTED_PROFILE`                                              | 422  |               0 | absent                                                 | all false    |
| profile/scenario matrix, renderer or required mapping registry is known incomplete                                                             | `NOT_EVALUATED / PROFILE_INCOMPLETE`                                               | 422  |               0 | absent                                                 | all false    |
| invalid cover/predecessor/bilateral attestation                                                                                                | `NOT_EVALUATED / INVALID_UPSTREAM_CONTEXT`                                         | 422  |               0 | absent                                                 | all false    |
| topology missing/contradictory                                                                                                                 | `NOT_EVALUATED / INVALID_CONTEXT_TOPOLOGY`                                         | 422  |               0 | absent                                                 | all false    |
| MT205/MT205COV bilateral BIC country conflicts with governed location source                                                                   | `REQUIRED / JURISDICTION_EVIDENCE_CONFLICT`, reason `JURISDICTION_SOURCE_CONFLICT` | 422  |               0 | absent                                                 | all false    |
| MT205/MT205COV bilateral counterparty country differs from Sender                                                                              | `REQUIRED / JURISDICTION_NOT_PERMITTED`                                            | 422  |               0 | absent                                                 | all false    |
| MT205/MT205COV route-bound BIC country conflicts with governed Sender/Receiver location source                                                 | `REQUIRED / JURISDICTION_EVIDENCE_CONFLICT`, reason `JURISDICTION_SOURCE_CONFLICT` | 422  |               1 | absent                                                 | all false    |
| MT205/MT205COV candidates exist but every selected Receiver country differs from Sender                                                        | `REQUIRED / JURISDICTION_NOT_PERMITTED`                                            | 422  |               1 | absent                                                 | all false    |
| governed bilateral relation proves lookup unnecessary and any required jurisdiction Gate passed                                                | `NOT_REQUIRED / BILATERAL_RELATIONSHIP_CONFIRMED`                                  | 200  |               0 | relationship evidence only                             | all false    |
| every otherwise retained candidate route derives Sequence A 56a without 57a; for MT205/MT205COV evaluate only jurisdiction-retained candidates | `REQUIRED / NO_ELIGIBLE_SSI`, reason `C81_SEQUENCE_A_56_REQUIRES_57`               | 422  |               1 | absent                                                 | all false    |
| mandatory Sequence A role has no typed governed source                                                                                         | `REQUIRED / PROFILE_INCOMPLETE`                                                    | 422  |               1 | absent                                                 | all false    |
| unsupported option/account/required mapping                                                                                                    | `REQUIRED / PROFILE_INCOMPLETE`                                                    | 422  |               1 | absent                                                 | all false    |
| complete contract metadata exists but all candidates fail ordinary eligibility                                                                 | `REQUIRED / NO_ELIGIBLE_SSI`                                                       | 422  |               1 | absent                                                 | all false    |
| equal-ranked complete candidates                                                                                                               | `REQUIRED / AMBIGUOUS_ROUTE`                                                       | 409  |               1 | absent                                                 | all false    |
| route/receiver/transport selected but exact RMA decision is missing, inactive or unauthorized                                                  | `REQUIRED / RMA_NOT_AUTHORIZED`                                                    | 422  |               1 | withheld                                               | all false    |
| any canonical snapshot discriminator changes before return                                                                                     | `NOT_EVALUATED / STALE`                                                            | 409  | 0 after recheck | absent                                                 | all false    |
| exactly one complete, renderable route                                                                                                         | `REQUIRED / ELIGIBLE_COMPLETE_ROUTE`                                               | 200  |               1 | one non-empty route; MT card; MX card only if complete | all false    |

Tie-break is explicit: for MT205/MT205COV, jurisdiction source consistency and
same-country eligibility run before the bilateral short-circuit and before all
other post-discovery candidate checks. A source conflict returns
`JURISDICTION_EVIDENCE_CONFLICT`; an all-cross-country candidate set or
cross-country bilateral relationship returns `JURISDICTION_NOT_PERMITTED`.
Only a same-country, source-consistent bilateral relationship may return
`BILATERAL_RELATIONSHIP_CONFIRMED`. C81 is then evaluated as a per-candidate
filter on jurisdiction-retained candidates; for MT202/MT202COV it filters all
candidate routes. Product `PROFILE_INCOMPLETE` checks follow for surviving
candidates, and ambiguity is evaluated only after jurisdiction, C81 and
completeness filtering.

## 10. Evidence response

```ts
type SsiApplicability = "NOT_EVALUATED" | "REQUIRED" | "NOT_REQUIRED";

type ResolutionOutcome =
  | "BILATERAL_RELATIONSHIP_CONFIRMED"
  | "ELIGIBLE_COMPLETE_ROUTE"
  | "NO_ELIGIBLE_SSI"
  | "AMBIGUOUS_ROUTE"
  | "STALE"
  | "INVALID_CONTEXT_TOPOLOGY"
  | "INVALID_UPSTREAM_CONTEXT"
  | "PROFILE_INCOMPLETE"
  | "UNSUPPORTED_DIRECTION"
  | "UNSUPPORTED_PROFILE"
  | "RMA_NOT_AUTHORIZED"
  | "JURISDICTION_EVIDENCE_CONFLICT"
  | "JURISDICTION_NOT_PERMITTED";

type IncludedEvidenceProjection = {
  projectionId: string;
  classification: "SSI_DERIVED" | "UPSTREAM_CONTEXT";
  role: string;
  mtTagOption?: string;
  isoPath?: string;
  valueType: "BIC" | "ACCOUNT_REFERENCE" | "SETTLEMENT_METHOD";
  value: string;
  sourceRecordType:
    | "BANK_SSI"
    | "OWN_NOSTRO_ACCOUNT"
    | "UPSTREAM_ATTESTATION"
    | "TOPOLOGY_RULE";
  sourceRecordId: string;
  sourceRecordVersion: string;
  mappingRuleId: string;
  accountOwnerBic?: string;
  accountServicerBic?: string;
  rulingProvenance?: {
    rulingId: string;
    rulingVersion: string;
  };
};

type OmissionDecision = {
  projectionId: string;
  classification: "OMITTED_BY_RULE" | "NOT_APPLICABLE";
  role: string;
  mtTagOption?: string;
  isoPath?: string;
  decisionRuleId: string;
  reason: string;
  value?: never;
  sourceRecordId?: never;
};

type EvidenceProjection = IncludedEvidenceProjection | OmissionDecision;
```

A topology-derived included projection requires `rulingProvenance`; its values
must exactly match the topology rule identity/version captured by
`contextSnapshotId`. Missing or mismatched ruling provenance fails closed.
`settlementRoute.settlementMethod` must equal the applicable
`MAP-MT2-STTLMMTD-002` projection. `ELIGIBLE_COMPLETE_ROUTE` requires non-empty
roles, ordered legs, required operational accounts and all applicable
projections. Placeholder or empty success is invalid.

```json
{
  "profileKind": "SSI_RESOLUTION_ONLY",
  "ssiApplicability": "REQUIRED",
  "resolutionOutcome": "ELIGIBLE_COMPLETE_ROUTE",
  "routeBindingId": "RB-2026-0001",
  "contextSnapshotId": "CS-2026-0001",
  "rmaAuthorizationDecisionId": "RMA-DECISION-001",
  "paymentExecutable": false,
  "payloadGenerated": false,
  "confirmedResolutionCreated": false,
  "repairQueueCreated": false,
  "settlementRoute": {
    "actualReceiverBic": "CHASUS33",
    "executionTransport": "FINPLUS",
    "settlementMethod": "INDA",
    "roles": [
      { "role": "INSTRUCTING_AGENT", "bic": "DEMOHKHH" },
      { "role": "INSTRUCTED_AGENT", "bic": "CHASUS33" },
      { "role": "ACCOUNT_SERVICER", "bic": "CHASUS33" }
    ],
    "legs": [{ "sequence": 1, "fromBic": "DEMOHKHH", "toBic": "CHASUS33" }]
  },
  "evidenceCards": [
    {
      "format": "SWIFT_MT",
      "profileId": "MT2-MT202-PLAIN-SR2026",
      "evidenceProjections": [
        {
          "projectionId": "EP-1",
          "classification": "SSI_DERIVED",
          "role": "SENDERS_CORRESPONDENT",
          "mtTagOption": "53B",
          "valueType": "ACCOUNT_REFERENCE",
          "value": "/DEMO-NOSTRO-USD-001",
          "sourceRecordType": "OWN_NOSTRO_ACCOUNT",
          "sourceRecordId": "OWN-NOSTRO-USD-001",
          "sourceRecordVersion": "7",
          "mappingRuleId": "MRG-MT202-53B",
          "accountOwnerBic": "DEMOHKHH",
          "accountServicerBic": "CHASUS33"
        }
      ]
    },
    {
      "format": "ISO_20022",
      "profileId": "PACS009-PLAIN-SR2026",
      "messageDefinitionId": "pacs.009.001.08",
      "businessService": "swift.cbprplus.04",
      "evidenceProjections": [
        {
          "projectionId": "EP-2",
          "classification": "SSI_DERIVED",
          "role": "SETTLEMENT_ACCOUNT",
          "isoPath": "/Document/FICdtTrf/GrpHdr/SttlmInf/SttlmAcct",
          "valueType": "ACCOUNT_REFERENCE",
          "value": "/DEMO-NOSTRO-USD-001",
          "sourceRecordType": "OWN_NOSTRO_ACCOUNT",
          "sourceRecordId": "OWN-NOSTRO-USD-001",
          "sourceRecordVersion": "7",
          "mappingRuleId": "MAP-MT2-53B-STTLMACCT-001",
          "accountOwnerBic": "DEMOHKHH",
          "accountServicerBic": "CHASUS33"
        },
        {
          "projectionId": "EP-3",
          "classification": "SSI_DERIVED",
          "role": "SETTLEMENT_METHOD",
          "isoPath": "/Document/FICdtTrf/GrpHdr/SttlmInf/SttlmMtd",
          "valueType": "SETTLEMENT_METHOD",
          "value": "INDA",
          "sourceRecordType": "TOPOLOGY_RULE",
          "sourceRecordId": "BA-TOPOLOGY-INDA-INGA-001",
          "sourceRecordVersion": "1.0.0",
          "mappingRuleId": "MAP-MT2-STTLMMTD-002",
          "rulingProvenance": {
            "rulingId": "BA-TOPOLOGY-INDA-INGA-001",
            "rulingVersion": "1.0.0"
          }
        }
      ]
    }
  ]
}
```

The schema forbids FIN blocks, MX documents, customer namespaces and payment
payloads. UI label: `Resolution Evidence`, never `Generated Messages`.

## 11. TDD acceptance matrix

Every Then also asserts `paymentExecutable=false`, all side-effect flags false,
and zero payment payload/confirmation/repair/transport calls.

| Fixture ID                    | Given / When                                                                                                                                                                                                                                                                                                                                      | Then                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MT2-V1-DIR-001A..B`          | valid MT202 except INWARD; valid OUTWARD except local role is not `INSTRUCTING_AGENT`                                                                                                                                                                                                                                                             | each 422 unsupported direction; discovery 0; no route/card                                                                                                                |
| `MT2-V1-PROFILE-002A..G`      | plain and COV positives; ADV, missing, unknown, ineffective and contradictory profile/BizSvc identity negatives                                                                                                                                                                                                                                   | positives select their exact controlled profile; every negative is 422 unsupported profile, discovery 0                                                                   |
| `MT2-V1-RMA-003A..F`          | after one route is selected: missing/expired/wrong-receiver/wrong-BizSvc/inactive/explicit `authorized=false` RMA decision                                                                                                                                                                                                                        | 422 required/RMA not authorized; discovery 1; selected route/evidence withheld; all side effects false                                                                    |
| `MT2-V1-RMA-003G..I`          | normal dual-channel record, FIN-only without contingency, FIN with valid contingency authorization                                                                                                                                                                                                                                                | normal selects FINPLUS; FIN-only fails closed; valid controlled contingency selects FIN; evidence-card format never changes it                                            |
| `MT2-V1-RMA-003J..L`          | exact route with wrong paired-evidence profile, wrong profile/BizSvc binding, or wrong FIN message type in the RMA decision                                                                                                                                                                                                                       | schema-invalid or 422 required/RMA not authorized; discovery 1; route/evidence withheld                                                                                   |
| `MT2-V1-202COV-004A..D`       | omit 119, purpose, UETR or Sequence B proof                                                                                                                                                                                                                                                                                                       | each 422 invalid upstream context; discovery 0                                                                                                                            |
| `MT2-V1-205-005A..H`          | standard immediate predecessor MT200/201/202/203/205/governed equivalent; equivalence scenario with proven initial MT200/201                                                                                                                                                                                                                      | every standard predecessor reaches ordinary eligibility; only initial MT200/201 applies 52a=58a; missing/contradictory chain is 422 invalid upstream context, discovery 0 |
| `MT2-V1-205COV-006A..G`       | MT202COV, MT205COV and governed-equivalent-cover positives; wrong predecessor, missing 119, broken UETR, missing Sequence B negatives                                                                                                                                                                                                             | positives reach ordinary eligibility under `COVER_CONTINUATION` with no MT200/201 equivalence; every negative is 422 invalid upstream context, discovery 0                |
| `MT2-V1-CUSTOMER-007`         | cover fixture includes Sequence B 50/59/accounts/remittance                                                                                                                                                                                                                                                                                       | recursive result scan contains no 50/59 value, remittance, `Dbtr`, `Cdtr`, ultimate-party or underlying account namespace                                                 |
| `MT2-V1-PRESENCE-007A`        | MT205/MT205COV lacks governed Sequence A 52a source, or any profile lacks governed 58a source                                                                                                                                                                                                                                                     | 422 required/profile incomplete; discovery 1; no route or evidence card                                                                                                   |
| `MT2-V1-STTLM-008A..C`        | instructed-agent, instructing-agent, contradictory topology                                                                                                                                                                                                                                                                                       | INDA, INGA, then 422 invalid topology; never COVE                                                                                                                         |
| `MT2-V1-STTLM-008D`           | fixture `MT2-TOPOLOGY-v1`, rule `BA-TOPOLOGY-INDA-INGA-001@1.0.0`, fixed canonical source hash                                                                                                                                                                                                                                                    | INDA/INGA projection and snapshot carry that exact ID/version/hash; missing or mismatch is 422 invalid topology, discovery 0                                              |
| `MT2-V1-ACCOUNT-009`          | only masked account when formal account required                                                                                                                                                                                                                                                                                                  | 422 profile incomplete; discovery 1; no route/card                                                                                                                        |
| `MT2-V1-PICKER-010`           | Picker then Resolve unchanged vs mutated snapshot                                                                                                                                                                                                                                                                                                 | identical route; mutation 409 stale, no route/card                                                                                                                        |
| `MT2-V1-ROUTE-011A..C`        | zero, two equal, one complete candidate                                                                                                                                                                                                                                                                                                           | no eligible, ambiguous, then one non-empty route/evidence                                                                                                                 |
| `MT2-V1-MAP-012`              | route requires unapproved mapping                                                                                                                                                                                                                                                                                                                 | 422 profile incomplete; no partial card                                                                                                                                   |
| `MT2-V1-NOTREQ-013A..D`       | valid governed bilateral relation; expired, hash-mismatched and wrong-scope bilateral attestations; MT205/MT205COV positive also has source-consistent same-country jurisdiction evidence                                                                                                                                                         | valid returns 200 not required with discovery 0; each invalid attestation returns 422 invalid upstream context, discovery 0; no SSI-generated fields                      |
| `MT2-V1-CONFIG-014`           | profile/scenario/option is absent from the approved matrix or required renderer/mapping registry is known incomplete                                                                                                                                                                                                                              | 422 not evaluated/profile incomplete; discovery 0; no route/card                                                                                                          |
| `MT2-V1-PRECEDENCE-015A`      | for each of MT202, MT202COV, MT205 and MT205COV, ordinary eligibility retains a candidate (and for MT205/MT205COV jurisdiction also retains it) but it lacks mandatory source/account/mapping                                                                                                                                                     | 422 required/profile incomplete, never generic no-eligible-SSI; discovery 1; no route/card                                                                                |
| `MT2-V1-PRECEDENCE-015B`      | MT205/MT205COV candidates combine cross-country rejection with a mandatory source/account/mapping defect                                                                                                                                                                                                                                          | all-cross-country returns `JURISDICTION_NOT_PERMITTED`; if any same-country candidate remains, completeness is evaluated only on retained candidates                      |
| `MT2-V1-OPTIONS-016`          | every allowed presence/omission and option cell in §6.1, plus one unsupported option per profile                                                                                                                                                                                                                                                  | exact included projection or omission decision from the matrix; unsupported option is typed profile incomplete at the correct pre/post-discovery stage                    |
| `MT2-V1-SNAPSHOT-017`         | mutate each discriminator independently: profile/BizSvc, scenario/fixture, direction/role, entity/date/currency, counterparty/current hop, topology/rule, attestation, ranking policy, SSI/Nostro version, receiver/transport/RMA decision, jurisdiction rule/version, resolved Sender/Receiver country and jurisdiction source record ID/version | each mutation changes canonical snapshot identity; stale mixed-snapshot route/evidence is rejected with HTTP 409 and zero side effects                                    |
| `MT2-V1-JURIS-018A..C`        | MT205/MT205COV candidates with same-country Receiver, mixed same/cross-country Receivers, and all cross-country Receivers                                                                                                                                                                                                                         | same-country survives; mixed ranks only same-country; all-cross-country returns 422 required/`JURISDICTION_NOT_PERMITTED`, discovery 1                                    |
| `MT2-V1-JURIS-018D`           | a route-bound MT205/MT205COV BIC country conflicts with its governed Own Entity or Bank Service location source                                                                                                                                                                                                                                   | 422 required/`JURISDICTION_EVIDENCE_CONFLICT`, reason `JURISDICTION_SOURCE_CONFLICT`, discovery 1; no route/card                                                          |
| `MT2-V1-JURIS-018E`           | an MT205/MT205COV bilateral relationship names a governed counterparty Bank Service in a different country from Sender                                                                                                                                                                                                                            | 422 required/`JURISDICTION_NOT_PERMITTED`, discovery 0; bilateral short-circuit is not returned                                                                           |
| `MT2-V1-JURIS-018F`           | `BA-MT2-JURIS-016@1.0.0`, fixed Own Entity and Bank Service record IDs/versions/hashes and resolved countries                                                                                                                                                                                                                                     | jurisdiction evidence and canonical snapshot carry those exact values; any ID/version/hash/country mismatch changes snapshot identity and fails closed                    |
| `MT2-V1-JURIS-018G`           | an MT205/MT205COV bilateral relationship whose governed counterparty Bank Service location source conflicts with its BIC country                                                                                                                                                                                                                  | 422 required/`JURISDICTION_EVIDENCE_CONFLICT`, reason `JURISDICTION_SOURCE_CONFLICT`, discovery 0; bilateral short-circuit is not returned                                |
| `MT2-V1-NONCOVER-019A..C`     | MT205 plain with governed-equivalent FI predecessor proven non-cover, missing non-cover proof, and equivalent-cover predecessor                                                                                                                                                                                                                   | proven non-cover reaches ordinary eligibility; missing/cover proof returns 422 invalid upstream context, discovery 0                                                      |
| `MT2-V1-OWNACCT-020A..F`      | six cases: MT202 × two own-account scenarios; fully attested MT202COV × two own-account scenarios; attempted MT205 use; attempted MT205COV use                                                                                                                                                                                                    | MT202/COV render exact Option A per `SWIFT-MT2-OWNACCT-014`; MT205 profiles reject absent scenario/matrix combinations before discovery                                   |
| `MT2-V1-C81-021A..D × P1..P4` | sixteen parameterized cases: four presence combinations (56a+57a; 56a only; 57a only; neither) × four profiles (MT202, MT202COV, MT205, MT205COV)                                                                                                                                                                                                 | pass; 422 required/no eligible SSI with `C81_SEQUENCE_A_56_REQUIRES_57` and no partial card; pass; pass                                                                   |
| `MT2-V1-C81-021E..F × P1..P4` | two-candidate cases per profile: one C81-invalid plus one valid route; all otherwise retained routes C81-invalid                                                                                                                                                                                                                                  | select/continue with the valid route; only the all-invalid set returns 422 required/no eligible SSI with `C81_SEQUENCE_A_56_REQUIRES_57`                                  |

Mandatory sequence: Red → minimum Green → Refactor → affected tests →
regression → browser UAT → `npm run verify` → ARM64 Sonar → same-candidate
independent BA/QA review.

## 12. Source register

| Repository source                                                                                                    | SHA-256                                                            | SSI-relevant anchors                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SWIFT/us2m_20260717.pdf`                                                                                            | `64483D7F7C094DB28E03791AB6BBC7A0522DAEC90487A7DD834228E848FA8323` | MT202 pp.39–54; MT202COV pp.59–75; MT205 pp.134–148; MT205COV pp.153–168. These ranges support Sequence A projection rules, C81, MT205/MT205COV scope/jurisdiction, non-cover and predecessor rules. Sequence B is upstream-attestation context only; its field specifications begin at MT202COV p.78 and MT205COV p.170 and are not SSI projection sources. |
| `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_FinancialInstitutionCreditTransfer_20260521_0643.pdf`     | `4B9436D21B141C5CEF75ACFFAE961B5130FEAD9B95C1B9CD144197DAA7EA6585` | BizSvc p.16; main `CdtrAcct` p.85; mapping pp.256–263; `SttlmAcct` pp.259–260, with 53B synonym on p.260; `SttlmMtd`/SettlementMethod1Code pp.338–339.                                                                                                                                                                                                       |
| `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_COV_FinancialInstitutionCreditTransfer_20260521_0643.pdf` | `745B302A700C785CAE1E5F630CC906F41DF31C1E5727BF03EF591F0AD1CFA0A1` | BizSvc p.17; main `CdtrAcct` p.98; underlying pp.101/123; mapping pp.317–323; `SttlmAcct` pp.319–320, with 53B synonym on p.320; `SttlmMtd`/SettlementMethod1Code INDA/INGA pp.404–405.                                                                                                                                                                      |
| `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_ADV_FinancialInstitutionCreditTransfer_20260521_0643.pdf` | `8F76D4071F67FC2AC2996B6BED68F2F2D1388FEB3CF14B83353ECF3B7F785CE1` | unsupported guard pp.3, 15, 88, 215, 285–286                                                                                                                                                                                                                                                                                                                 |

## 13. Approval boundary

Before implementation, Product Owner and BA must approve evidence-only output,
the exact profile/scenario IDs and attestation schemas, the controlled Sequence
A renderer subset, every MT→MX evidence mapping, deterministic INDA/INGA rules,
and typed outcome/HTTP mapping.

This remains `PROPOSED DRAFT — NOT IMPLEMENTATION AUTHORITY` until those
decisions and the exact candidate receive independent BA, payment-domain and QA
approval. Earlier reviews do not approve this revision.
