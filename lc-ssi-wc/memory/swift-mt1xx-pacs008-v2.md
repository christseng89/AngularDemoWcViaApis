# MT1xx / pacs.008 SR2026 SSI Memory — v2

**Status:** CONTROLLED CANDIDATE — SAME-CANDIDATE BA／QA REVIEW PENDING；PRODUCT OWNER APPROVAL PENDING；IMPLEMENTATION NOT AUTHORIZED
**Prepared:** 2026-09-16  
**Supersedes after approval:** archived `qa-archived/mt1/memory/v1/swift-mt1xx-pacs008-v1.md`  
**Predecessor raw SHA-256:** `83049678223128C4E8A0E379C18C54AF4FAC316107A71B7B37C645F838C222FC`  
**MT1 artifact index:** [`memory/mt1/README.md`](mt1/README.md)  
**Proposal basis:** [`memory/mt1/MT1XX_PACS008_CUSTOMER_PAYMENT_INSTRUCTIONS_PROPOSAL_v0.6_DRAFT.md`](mt1/MT1XX_PACS008_CUSTOMER_PAYMENT_INSTRUCTIONS_PROPOSAL_v0.6_DRAFT.md)  
**OPEN-01 Matrix SHA-256:** `F18FEC54B2A61B2DFF9607543294D447BB323F31A95F75A572A49FDED68998D2`  
**OPEN-02 Matrix SHA-256:** `E409BE0882A1D3FB9873AE3D5C835A097D4D9CFE8DB13D4E81A048824F760C0F`  
**Matrix BA／QA Review SHA-256:** `23F87D36C696F6C5D4B70B76A36E9CA2BD85E88A27ECF9E82A6AF2D764A80092`  
**Governance:** `memory/lc-ssi-wc-operating-model-zh-v2.md` v2.8.24
**Architecture:** `Controlled OAS / Typed Contract + Controlled Parameters / DB -> Domain Policy / API -> Page Parameter Model -> Generic UI`

> This memory records the frozen v0.6 MT1xx Bank SSI scope and deterministic matrices. Historical Proposal/OPEN-01/OPEN-02 review evidence remains preserved. This Memory v2 still requires BA Maker, Independent BA Checker and QA review of the same external Git candidate commit, followed by Product Owner approval. It does not yet authorize implementation, TDD, OAS, Page Parameters, DB changes or release.

## 1. Executive ruling

For SWIFT Category 1, SSI applicability is determined at **settlement-leg level**, not by treating the whole message as SSI.

A leg enters Bank SSI resolution only when all of the following are true:

1. The current leg is FI-to-FI.
2. The current leg performs settlement, reimbursement or value transfer, rather than only payment initiation, mandate, collection request or notification.
3. At least one bank-controlled role must be selected or validated: Own Nostro/correspondent, Counterparty Vostro/correspondent, reimbursement agent/account, settlement account or bank-controlled intermediary.
4. The governed lookup context contains sufficient scenario/profile, currency, booking entity, value date, counterparty/destination and current-hop information.

The presence of a BIC, agent field, SWIFT tag or Category 1 message code alone does not make a record SSI.

## 2. Domain boundary

| Domain object | SSI classification | Ownership |
| --- | --- | --- |
| Customer Party/Profile | Not Bank SSI | Customer/Party Master |
| Customer Payment Instructions (CPI) | Not Bank SSI; may constrain resolution | Payment domain |
| Debtor/Creditor and customer accounts | Not Bank SSI | Transaction/CPI |
| Amount, purpose, remittance and mandate | Not Bank SSI | Transaction/CPI |
| Debtor Agent/Creditor Agent identity | Route endpoint/context; not SSI by default | Payment/reference data |
| Own/Counterparty correspondent relationship | Bank SSI when required by the current settlement leg | SSI domain |
| Nostro/Vostro and reimbursement/settlement account | Bank SSI when selected or validated | SSI/Account Master |
| Clearing participant/network identity | Reference data. A future approved profile may require it through `REFERENCE_DATA_REQUIRED`, but it never becomes Bank SSI, receives SSI provenance or increments SSI Count. | Clearing/network domain |
| Message formatting, full NVR and MT/MX composition | Not SSI | Validator/Renderer |

Original customer intent is immutable. Bank enrichment must preserve value origin, derivation, validation state and evidence; customer input must never create or overwrite Bank SSI.

## 3. Controlled scope classification

### 3.1 Phase 1 — Controlled target scope

| Message/profile | Bank SSI applicability | Controlled disposition |
| --- | --- | --- |
| MT103 | Bank-controlled settlement/reimbursement leg | `PHASE_1_IN_SCOPE` |
| MT103 STP | Same canonical SSI engine with its own governed profile | `PHASE_1_IN_SCOPE` per `PO-SCOPE-MT1-20260916` |
| MT103 REMIT | Same canonical SSI engine; remittance envelope is not SSI | `PHASE_1_IN_SCOPE` only for an effective approved community/MUG/profile row; otherwise `UNSUPPORTED_PROFILE` |
| pacs.008.001.08 plain (`swift.cbprplus.04`) | Bank-controlled settlement legs corresponding to the approved MT103 compatibility scope | `PHASE_1_IN_SCOPE` |
| pacs.008.001.08 STP (`swift.cbprplus.stp.04`) | Same canonical route model with a separate governed STP profile | `PHASE_1_IN_SCOPE` |

Phase 1 resolves only the bank-controlled settlement portion. Customer/transaction data, complete message construction and external execution gates remain outside SSI.

Frozen profile gates are exact: pacs.008 plain/STP require `pacs.008.001.08`, respectively `BizSvc=swift.cbprplus.04` or `swift.cbprplus.stp.04`, and `NbOfTxs=1`. Phase-1 settlement methods are `INDA`, `INGA` and `COVE`; `CLRG` returns `UNSUPPORTED_PROFILE`. `SSI_NOT_REQUIRED` requires a versioned external `bilateralRelationshipEvidenceId`, exact identity/currency/entity/date/version validation and no SSI lookup/account selection. Omission of MT 53a or an MX account element is not proof that SSI is unnecessary.

### 3.2 Future scope — Not implementation-authorized

| Message/profile | Future Bank SSI applicability | Required before implementation |
| --- | --- | --- |
| MT102 | Yes, for message-level/common settlement roles and compatible transaction destinations | Dedicated scenario adapter, role/batch contract and permitted service/community/MUG gate |
| MT102 STP | Yes, using the canonical SSI core under a distinct STP profile | Separate STP profile, batch invariants and permitted service/community/MUG gate |
| MT104 | Conditional: only a current FI-to-FI Direct Debit settlement/reimbursement leg enters SSI | Direction/role matrix, common-Sequence-C batch route and transaction compatibility |
| MT107 | A governed FI-to-FI settlement leg is SSI-applicable; lookup need depends on direct-account relationship | Direction/role matrix, common-Sequence-C batch route and transaction compatibility |

`Future scope` means SSI-applicable in principle but **not yet authorized**. It does not mean the message is implemented, executable or covered by the Phase 1 TDD/OAS.

## 4. MT102 / MT102 STP reuse ruling

MT102 is not merely “multiple MT103 messages.” MT102 and MT103 shall reuse the same canonical SSI resolution engine, account-relationship model, eligibility rules, provenance model and atomic-route contract, but they shall not share an unqualified message scenario, field-population matrix or route snapshot.

MT102 future support requires all of the following:

- an `MT102_MULTIPLE_CUSTOMER_CREDIT_TRANSFER` scenario/profile adapter;
- explicit projection of message-level/common roles versus repeated transaction-level destinations;
- formation of a batch cohort compatible in currency, value date, receiver and settlement relationship;
- one atomic, version-locked common settlement route for the batch where the profile requires common settlement data;
- per-transaction creditor-destination authority and compatibility validation;
- a governed decision to reject or split an incompatible batch before composition;
- traceability from every transaction to the common SSI snapshot and route identity;
- an independent MT102 STP profile rather than inference from base MT102.
- a current SR2026 `allowedService` / community / MUG gate; unapproved ordinary FIN FI-to-FI returns `UNSUPPORTED_PROFILE`.

The Resolver must not resolve each MT102 transaction as an MT103 and then combine unrelated routes. The atomic batch-compatibility rule is a proposed future bank-policy invariant inferred from the single Sequence C plus repeated Sequence B structure, not a direct MRG rule. Until one reject-or-split policy is approved, current runtime returns `UNSUPPORTED_PROFILE`.

## 5. MT104 / MT107 direct-debit SSI ruling

MT104 and MT107 are outside the pacs.008 customer-credit-transfer mapping scope, but they are not categorically outside Bank SSI scope.

### 5.1 Settlement direction

```text
MT102 / MT103 customer credit transfer:
  settlement value direction = Sender -> Receiver

MT104 / MT107 direct debit:
  settlement value direction = Receiver -> Sender
  Receiver reimburses Sender
```

Therefore, MT104/107 must never reuse MT103 `53a` semantics solely because the tag is the same. The canonical input must include scenario, settlement direction, value-origin agent, value-destination agent, account owner/servicer and correspondent role.

### 5.2 MT104 scenario disposition

| MT104 scenario | SSI disposition |
| --- | --- |
| Customer/corporate-to-bank initiation | `NON_BANK_LEG_OUT_OF_SCOPE` |
| FI-to-FI Request for Direct Debit without Sequence C | `BANK_TO_BANK_NON_SETTLEMENT_LEG_OUT_OF_SCOPE`; evaluate any later settlement leg separately |
| Future FI-to-FI settlement with an approved unique direct bilateral relationship | Future target `SSI_NOT_REQUIRED`; current unauthorized runtime `UNSUPPORTED_PROFILE` |
| Future FI-to-FI settlement requiring Own Nostro, Counterparty Vostro or correspondent/reimbursement selection | Future target `BANK_TO_BANK_SSI_REQUIRED`; current unauthorized runtime `UNSUPPORTED_PROFILE` |
| Future approved clearing route requiring participant/network identity rather than correspondent SSI | Future target `REFERENCE_DATA_REQUIRED`; current unauthorized runtime `UNSUPPORTED_PROFILE` |
| Uncontrolled or indeterminate scenario/profile | `UNSUPPORTED_PROFILE` and fail closed |

MT104 future support must bind one common Sequence C route/snapshot to every repeated Sequence B destination/currency and apply one approved batch incompatibility decision.

### 5.3 MT107 scenario disposition

MT107 is an FI-to-FI general direct-debit message whose governed settlement leg is SSI-applicable; this does not mean every case requires an SSI lookup. Its customer, mandate and transaction content is not SSI. Direct bilateral account evidence, multiple-account selection, common Sequence C batch compatibility and correspondent/reimbursement routing require an MT107-specific matrix. Until approved, runtime returns `UNSUPPORTED_PROFILE`.

## 6. Out of scope — Closed for this memory version

| Item | Disposition / owner |
| --- | --- |
| MT101 as a Bank SSI message | `OUT_OF_SCOPE`; FI-to-FI MT101 is a bank-to-bank non-settlement request, while customer/corporate-to-bank is non-bank initiation. A later settlement leg is evaluated independently. |
| Customer/corporate-to-bank MT104 request/mandate intake | `OUT_OF_SCOPE`; CPI/direct-debit initiation only |
| Customer Party/Profile as SSI | Prohibited; Customer data must not display SSI Count or governed SSI record |
| Customer debtor/creditor accounts, amount, purpose, remittance, mandate/consent | Transaction/CPI domain |
| Full FIN/NVR validation | `OUT_OF_SCOPE — CLOSED`; independent downstream FIN validator, `FIN_VALIDATION=NOT_EVALUATED` |
| Complete MT/MX field population, option choice and formatting | Message Profile/Renderer |
| MT-to-pacs mapping for MT102/104/107 | Not authorized by this scope; separate mapping decision required |
| Direct-debit lifecycle, return/reversal and accounting | Payment/direct-debit processing domain |
| Compliance, RMA, sanctions, cut-off, funding, liquidity and release | External execution gates; never SSI evidence |
| FX, charges and amount reconciliation | Payment/FX/Pricing/Composition |

Out-of-scope items do not block the SSI-only Proposal and must not be implemented through SSI defaults.

## 7. Canonical scenario/context rule

`Scenario` is not the same as `Settlement Context`. Resolution is driven by:

```text
Scenario
+ Settlement Context
+ Customer Chain Topology
+ Settlement/Cover Route Topology
+ Correspondent Relationship
+ Currency / Booking Entity / Value Date / Creditor Destination
+ Current Hop / Ordered Route Legs
-> Required SSI Roles
-> Eligible Atomic Complete Route
```

INDA/INGA are account relationships for each `currentHop` or `routeLeg`, never a global label for an entire multihop route:

- INDA: Account Owner = Instructing Agent; Account Servicer = Instructed Agent.
- INGA: Account Owner = Instructed Agent; Account Servicer = Instructing Agent.

Every candidate is an indivisible, version-locked bundle. The client must not mix accounts, SSI identities or route legs from different candidates.

## 8. Currency boundary

Currency remains inside SSI eligibility because it determines account/correspondent applicability and may change the eligible route. Changing currency invalidates the selected candidate and requires route rediscovery. Amount, FX conversion, rate and charge calculation remain outside SSI.

## 9. Controlled resolver outcomes

The following outcomes are permitted where applicable:

- `BANK_TO_BANK_SSI_REQUIRED`
- `ELIGIBLE_COMPLETE_ROUTE`
- `SSI_NOT_REQUIRED`
- `REFERENCE_DATA_REQUIRED`
- `NON_BANK_LEG_OUT_OF_SCOPE`
- `BANK_TO_BANK_NON_SETTLEMENT_LEG_OUT_OF_SCOPE`
- `NO_ELIGIBLE_SSI`
- `AMBIGUOUS_ROUTE`
- `STALE`
- `INVALID_CONTEXT_TOPOLOGY`
- `UNSUPPORTED_PROFILE`

An FI BIC or agent field alone must never be used as proof of `BANK_TO_BANK_SSI_REQUIRED`.

`REFERENCE_DATA_REQUIRED` is unreachable in frozen Phase 1 because Phase-1 `CLRG` is unsupported. It is reserved for a separately approved future profile and never converts reference data into SSI.

## 10. Phase 1 deterministic matrices and Future deferred decisions

The former Phase-1 OPEN items now have frozen deterministic matrix artifacts. Their content has BA/Independent-BA/QA PASS; Product Owner exact-bundle approval remains the authorization gate:

| ID | Required authoritative output | Status |
| --- | --- | --- |
| `SSI-OPEN-01-P1` | Creditor Destination Authority & Repair Matrix for approved MT103/pacs.008 profiles | `FROZEN — BA/QA PASS; PO EXACT-BUNDLE APPROVAL PENDING` |
| `SSI-OPEN-02-P1` | Four-layer A/B/C/D Profile × Context × Topology × SSI Role Matrix | `FROZEN — BA/QA PASS; PO EXACT-BUNDLE APPROVAL PENDING` |

Future items are `DEFERRED_NOT_AUTHORIZED`: MT102 service/community/MUG and batch policy; MT104/107 direct-debit role/direction, common-route compatibility and debtor-destination authority. They do not block Phase 1 and are not current runtime oracles. `SSI-OPEN-01-P1` must not be applied to MT104/107 debtor destinations.

## 11. Deterministic scope acceptance matrix

| ID | Given / When | Current expected outcome |
| --- | --- | --- |
| `SCOPE-P1-001` | Post-authorization approved MT103-family/pacs.008.001.08 profile has complete settlement context | Evaluate `SSI-OPEN-02-P1`; never infer from tag alone |
| `SCOPE-P1-REMIT-001` | MT103 REMIT community/MUG/profile row is not approved | `UNSUPPORTED_PROFILE`; blocks only REMIT denominator, not base MT103/pacs.008 |
| `SCOPE-P1-REMIT-002` | REMIT row and applicable P1 matrices are approved | Enter REMIT denominator and evaluate governed roles |
| `SCOPE-P1-002` | Currency changes after route selection | Invalidate and rediscover; stale confirmation returns `STALE` |
| `SCOPE-OUT-001A` | Customer/corporate-to-bank MT101/payment initiation | `NON_BANK_LEG_OUT_OF_SCOPE`; later settlement leg evaluated separately |
| `SCOPE-OUT-001B` | FI-to-FI MT101 request/instruction | `BANK_TO_BANK_NON_SETTLEMENT_LEG_OUT_OF_SCOPE`; later settlement leg evaluated separately |
| `SCOPE-FUT-102` | MT102/102 STP before Future authorization | `UNSUPPORTED_PROFILE`; no SSI candidate/payload/side effect |
| `SCOPE-OUT-104` | FI-to-FI MT104 Request for Direct Debit without Sequence C | `BANK_TO_BANK_NON_SETTLEMENT_LEG_OUT_OF_SCOPE` |
| `SCOPE-FUT-104` | MT104 Direct Debit with Sequence C before Future authorization | `UNSUPPORTED_PROFILE` |
| `SCOPE-FUT-107` | MT107 before Future authorization | `UNSUPPORTED_PROFILE` |
| `SCOPE-GATE-001` | FI BIC/tag exists but there is no bank-controlled settlement role | Do not enter SSI lookup |
| `SCOPE-GATE-002A` | Message/profile/service/community is not approved | `UNSUPPORTED_PROFILE`; no lookup |
| `SCOPE-GATE-002B` | Supported profile has missing/contradictory topology or current-hop relationship | `INVALID_CONTEXT_TOPOLOGY`; no lookup |
| `SCOPE-OUT-002` | Customer/amount/mandate/full-NVR/compliance/FX values exist | They do not become SSI input/evidence |

## 12. Source register

The controlled local Angular/Browser UAT endpoint is `http://localhost:4600`; port `4400` is obsolete. This is operational configuration and does not affect SSI business rules or snapshot identity.

| Source | SHA-256 | Controlled use |
| --- | --- | --- |
| `us1m_20260717.pdf` | `54002BDF2140563A543DE330283EE7BC64C0724DC69499326CE34F70A7E90E70` | MT102 pp.71–73, 111–113; MT102 STP pp.124–126, 158–159; MT103 pp.171–173, 193–203; MT103 REMIT pp.255–260, 279–280, 285–287; MT103 STP pp.297–302, 318–319, 322–323; MT104 pp.356–358, 386–388; MT107 pp.394–396, 420–422 |
| `CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_008_001_08_FIToFICustomerCreditTransfer_20260521_0831.pdf` | `F563E3478ED76329DB2400BC1E58BE5D345C499DABEB4C4561A7A8E1D15566B3` | SR2026 pacs.008 plain: identifier precedence p.3; profile p.10; settlement/reimbursement pp.13–23; Creditor Agent/account pp.57,59 |
| `CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_008_001_08_STP_FIToFICustomerCreditTransfer_20260522_0133.pdf` | `D9807C95700CCFBFB6AAD03CE40AE32213F75B805A683937EB4BBD296EEF23F6` | SR2026 pacs.008 STP: identifier precedence p.3; profile p.10; settlement/reimbursement pp.13–19; Creditor Agent/account pp.42–43 |
| `memory/mt1/MT1XX_PACS008_CUSTOMER_PAYMENT_INSTRUCTIONS_PROPOSAL_v0.6_DRAFT.md` | `3FD37199BAAB210B17BEED96DDD1143995454308C73D218B1DBA798EE84D88A5` | Frozen scope and CPI/Bank SSI boundary |
| `memory/mt1/MT1XX_PACS008_CREDITOR_DESTINATION_AUTHORITY_REPAIR_MATRIX_v0.1_DRAFT.md` | `F18FEC54B2A61B2DFF9607543294D447BB323F31A95F75A572A49FDED68998D2` | Deterministic destination authority, conflict, repair and provenance oracle |
| `memory/mt1/MT1XX_PACS008_SCENARIO_CONTEXT_SSI_ROLE_MATRIX_v0.1_DRAFT.md` | `E409BE0882A1D3FB9873AE3D5C835A097D4D9CFE8DB13D4E81A048824F760C0F` | Deterministic A/B/C/D profile/context/topology/role oracle |
| `qa-archived/mt1/memory/v1/swift-mt1xx-pacs008-v1.md` | `83049678223128C4E8A0E379C18C54AF4FAC316107A71B7B37C645F838C222FC` | Historical predecessor; archived unchanged |

## 13. Supersession matrix from v1

| v1 area | v2 disposition |
| --- | --- |
| Broad scope listing MT101/102/103/104/107 together | Replaced by Phase 1, Future and Out-of-scope classifications |
| MT101 reference-only pending BA | Closed as CPI/payment-initiation input, not a Phase 1 Bank SSI message |
| MT102 pending scope | Future SSI-applicable; canonical core reused, dedicated batch adapter/contract mandatory |
| MT104/107 out of pacs.008 scope | Retained for mapping boundary, corrected to conditional/future Bank SSI applicability |
| Message/tag-centric SSI inference | Replaced by current settlement-leg and required bank-controlled role gate |
| Five old BA OPEN items | Replaced by frozen deterministic OPEN-01/OPEN-02 matrices; Future decisions remain deferred/not authorized |
| Full NVR/message construction concerns | Explicitly `OUT_OF_SCOPE — CLOSED` for SSI Resolver |

## 14. Approval and implementation gate

| Role | Artifact identity | Verdict | Date |
| --- | --- | --- | --- |
| BA Maker | This Memory repo path in the externally recorded exact candidate commit | PENDING | — |
| Independent BA Checker | Same external candidate commit | PENDING | — |
| QA Checker | Same external candidate commit | PENDING | — |
| Product Owner | External approval record / bundle manifest | OPEN | — |

Controlled-memory acceptance and implementation authorization are separate. This file becomes the active v2 Memory only after BA Maker, Independent BA Checker, QA Checker and Product Owner approve the same externally recorded Git candidate commit. Phase 1 implementation additionally requires:

The archived `qa-archived/mt1/proposals/v0.6-matrix-review/MT1XX_PACS008_v0.6.bundle.json` and `memory/mt1/MT1XX_PACS008_v0.6_FINAL.bundle.json` are frozen historical evidence and are excluded from the active identity chain. They must not receive new Product Owner approval or be rewritten. Active Git-tracked repository identity comes from the repository path plus the exact Git candidate commit recorded externally; any semantic version is only an optional human／release label.

1. Product Owner approves the frozen OPEN-01/OPEN-02 matrix artifacts already passed by BA/QA.
2. External handoff evidence records the exact base／candidate Git commits and the applicable non-Git source identities.
3. Every reviewer verifies the same candidate commit; any repository artifact change invalidates the review.
4. Signatures／verdicts remain in external checker reports and are never written back into this controlled artifact.

Until all four conditions hold, status remains **IMPLEMENTATION NOT AUTHORIZED**.
