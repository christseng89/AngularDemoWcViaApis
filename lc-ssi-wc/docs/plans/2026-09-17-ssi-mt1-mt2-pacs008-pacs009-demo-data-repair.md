# SSI MT1／MT2／pacs.008／pacs.009 Demo Data Repair Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Repair and regenerate only the Development Demo Prototype's synthetic SSI data for governed MT1／pacs.008 and MT2／pacs.009 scenarios without modifying RMA, the approved MT347 v1.1 dataset, or any non-target data.

**Architecture:** Reuse the OO, parameter-driven repair framework established for RMA and MT347 while keeping the SSI and RMA change packages, eligibility policies, lifecycles, audit, rollback and approval SHA sets strictly separate. BA/QA first freeze exact scope, profile policy, Rule Table and typed Test Oracle; only after same-SHA PASS may Engineering generate deterministic versioned SSI/Applicability records and perform zero-write validation. Reload-source publication, isolated Reload and Development Runtime DB Apply each require a separate explicit authorization. Before Gate 4C, runtime-only non-target and Historical rows are not touched. The explicitly approved first full-table Reload may physically replace rows transactionally, but their IDs, payloads, FKs, lifecycle and logical row multiset must remain identical; Historical rows remain invisible to current discovery.

**Tech Stack:** TypeScript 6, Node.js 22 built-in SQLite, NestJS, Angular 22, Jest/Nx, deterministic JSON/SHA-256 evidence, canonical SQLite logical snapshots.

---

## 1. Review status and non-production boundary

This document is a **BA/QA review candidate**, not implementation or DB authorization.

```text
Environment             Development Demo Prototype only
Data                    Artificial / synthetic test data only
UAT / Production        OUT OF SCOPE
Real Nostro service     OUT OF SCOPE
External evidence       Controlled Virtual Stub only
Code changes            NOT AUTHORIZED by this document
DB writes               NOT AUTHORIZED by this document
Reload source publish    NOT AUTHORIZED
Isolated Reload          NOT AUTHORIZED
Runtime DB Apply         NOT AUTHORIZED
```

The review objective is deterministic Demo behavior, not Production-grade remediation of real banking records.

## 2. Terminology correction and canonical pairing

The requested scope contains all four families: MT1, MT2, pacs.008 and pacs.009. They are not cross-mapped arbitrarily:

| FIN family | Canonical CBPR+ family | Controlled source |
|---|---|---|
| MT1 customer-payment scope | `pacs.008.001.08` plain/STP | `memory/swift-mt1xx-pacs008-v2.md` and frozen v0.6 matrices |
| MT2 FI-transfer scope | `pacs.009.001.08` plain/COV | `memory/swift-mt2xx-pacs009-v2.md` and MT2 final gate |

`pacs.008` must not be inferred from MT2, and `pacs.009` must not be inferred from MT1. Message family, profile, business service, direction and settlement leg are explicit Rule Table fields.

## 3. Current Development inventory

Counts below are ACTIVE-record counts observed on 2026-09-17. One record may contain more than one message type, so columns are not additive.

| Scope | ACTIVE total | MT1 | MT2 | pacs.008 `.001.12` | pacs.008 `.001.08` | pacs.009 `.001.12` | pacs.009 `.001.08` | Current conclusion |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| SSI | 10,329 | 0 | 0 | 24 | 0 | 43 | 68 | Non-MT347 MT1/MT2 and `.12` SSI repair/regeneration remains open |
| RMA | 44 | 8 | 14 | 2 | 28 | 2 | 40 | Read-only reference only: two FINPLUS records remain and are governed `SKIP_DEVELOPMENT_REFERENCE_GAP` |

Required table from the repair request:

| Scope | ACTIVE `.001.12` | ACTIVE `.001.08` | Conclusion |
|---|---:|---:|---|
| SSI | 24 | 0 | `pacs.008` SSI has not been repaired |
| RMA | 2 | 28 | Read-only evidence: two FINPLUS records contain `.12`; this SSI package must not mutate them |
| RMA MT2 | 14 | — | Existing MT2 rows were not modified by the MT347 change package |

Prior RMA publication evidence additionally records:

```text
pacs.008.001.12 -> pacs.008.001.08 = 28 occurrences
pacs.009.001.12 -> pacs.009.001.08 = 37 occurrences
development reference gap             = 2 canonical groups / 4 physical rows / PCBCCNBJ
```

The four physical RMA rows comprise two FIN and two FINPLUS rows. Only the two FINPLUS rows contain the residual tokens. Across those two rows the inventory contains four plain `.12` token memberships (`pacs.008` ×2 and `pacs.009` ×2) plus two `pacs.009.001.12.COV` memberships. All four physical rows remain immutable under the already-governed disposition `SKIP_DEVELOPMENT_REFERENCE_GAP`; they are excluded from the SSI conversion denominator and do not block otherwise eligible SSI groups.

Inventory reports must distinguish `recordCount`, `tokenMembershipCount`, `unionCount` and `intersectionCount`. They must parse both array and CSV representations by exact token, trim and deduplicate; substring counting is prohibited.

The new inventory must reproduce these figures directly from the current Reload source and Runtime DB before BA/QA signs the scope.

Full-table parity is a separate Gate 0 assertion. The current known non-ACTIVE/source delta is:

```text
Runtime-only REVOKED SSI rows                 2
Runtime-only ACTIVE Applicability children   12
```

Absence from the Reload source is never a delete instruction. Each runtime-only row must receive exactly one reviewed drift disposition: `PRESERVE_NON_TARGET_RUNTIME_DRIFT`, `TARGET_EXPLICIT_RULE` or `BLOCKED`. The default is `PRESERVE_NON_TARGET_RUNTIME_DRIFT`; the two REVOKED rows are immutable history. Before Gate 4C this package may not touch these fourteen rows. If Gate 4C explicitly authorizes the full-table Reload, physical replacement is allowed only as a transactional transport mechanism while IDs, payloads, FKs, lifecycle and logical row multiset remain identical. Gate 0 fails until `BLOCKED=0` and before/after evidence proves every preserved row is logically identical.

Because the governed Development Reload service performs transactional full-table replacement, the future full canonical candidate seed must carry these fourteen preserved runtime-only rows verbatim from the frozen Gate 0 export. They are not regenerated or normalized. Their exact payload/FK multiset and source logical SHA are recorded in `runtime-drift-preservation.v1.json`; omission, duplication or field change fails Preflight. This inclusion repairs source/runtime parity without treating the records as targets of the `.12 -> .08` package.

## 3A. Controlled SWIFT MRG／NVR／CBPR+／MEMORY source register

BA and QA must review the Rule Table against the following local, controlled SR2026 sources. Filename, SHA, release and page/rule reference are mandatory evidence fields; a generic comment such as “according to SWIFT” is insufficient.

| Family | Controlled source | SHA-256 | Governed use |
|---|---|---|---|
| MT1 MRG/NVR | `SWIFT/us1m_20260717.pdf` | `54002BDF2140563A543DE330283EE7BC64C0724DC69499326CE34F70A7E90E70` | MT102 pp.71–73,111–113; MT102 STP pp.124–126,158–159; MT103 pp.171–173,193–203; MT103 REMIT pp.255–260,279–280,285–287; MT103 STP pp.297–302,318–319,322–323; MT104 pp.356–358,386–388; MT107 pp.394–396,420–422 |
| MT1 compatibility | `SWIFT/us1m_20250718.pdf` | `3ACCBAFC7231D2745C4F3D7CEB85117555DEFFDEB0AE7F798E00339BE12B62D9` | Compatibility fallback only when the SR2026 artifact/rule is genuinely absent; never overrides an SR2026 prohibition |
| pacs.008 plain UG | `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_008_001_08_FIToFICustomerCreditTransfer_20260521_0831.pdf` | `F563E3478ED76329DB2400BC1E58BE5D345C499DABEB4C4561A7A8E1D15566B3` | Profile, settlement/reimbursement, Creditor Agent/account and identifier precedence |
| pacs.008 STP UG | `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_008_001_08_STP_FIToFICustomerCreditTransfer_20260522_0133.pdf` | `D9807C95700CCFBFB6AAD03CE40AE32213F75B805A683937EB4BBD296EEF23F6` | STP profile and permitted settlement/reimbursement structure |
| MT2 MRG/NVR | `SWIFT/us2m_20260717.pdf` | `64483D7F7C094DB28E03791AB6BBC7A0522DAEC90487A7DD834228E848FA8323` | MT202 pp.39–54; MT202COV pp.59–75; MT205 pp.134–148; MT205COV pp.153–168 |
| MT2 compatibility | `SWIFT/us2m_20250718.pdf` | `820581F85FC9EFA34A56F1A54FE66DDA684C6C2FFE9533E38F096A2176B9845C` | Controlled compatibility fallback only |
| pacs.009 plain UG | `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_FinancialInstitutionCreditTransfer_20260521_0643.pdf` | `4B9436D21B141C5CEF75ACFFAE961B5130FEAD9B95C1B9CD144197DAA7EA6585` | `swift.cbprplus.04`, INDA/INGA, account and settlement fields |
| pacs.009 COV UG | `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_COV_FinancialInstitutionCreditTransfer_20260521_0643.pdf` | `745B302A700C785CAE1E5F630CC906F41DF31C1E5727BF03EF591F0AD1CFA0A1` | `swift.cbprplus.cov.04`, cover structure and underlying-customer block |
| pacs.009 ADV UG | `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_ADV_FinancialInstitutionCreditTransfer_20260521_0643.pdf` | `8F76D4071F67FC2AC2996B6BED68F2F2D1388FEB3CF14B83353ECF3B7F785CE1` | Explicit non-settling ADV exclusion guard |
| SR2026 Contingency NVR | `SWIFT/SR2026_Contingency_Processing_Network_Validated_Rules_20260717_v1_0.pdf` | `BDE3874D324C218C88F11F9116E089684106093144E3E143890BAD7368D5DBCB` | Full-FIN/network validation ownership boundary for applicable MT103, MT202/COV and MT205/COV rules |
| MT1 project memory | `memory/swift-mt1xx-pacs008-v2.md` | raw `1C17114AB2A2AD3C2455EAEE910951FFA426C2CCF25FB9A29E2385C6325980A1`; canonical LF `AA4287E19FFF3D2EB2DD826F83CC73B4AAE1BAA7F05910960FE6C8E5E6F28886` | Project scope, settlement-leg boundary and frozen OPEN-01/OPEN-02 decisions; pending authority holds only groups whose disposition depends on that authority |
| MT1 matrix review | `memory/mt1/MT1XX_PACS008_v0.6_MATRIX_REVIEW.md` | `23F87D36C696F6C5D4B70B76A36E9CA2BD85E88A27ECF9E82A6AF2D764A80092` | BA/QA-reviewed matrix bundle; implementation still requires the stated approval gate |
| MT2 project memory | `memory/swift-mt2xx-pacs009-v2.md` | raw `3F28D940510D4F4B0CEC5C5EB906FBB69EB3D63D42F5B815363E2DE3AD7BCBFA`; canonical LF `FE2418F9711C742D20E0A349D4E0E791BFAA574BBEB25C6F7F876D0677B8F196` | Plain/COV/ADV boundary, MRG rulings, account evidence and converter contract; pending authority holds only groups whose disposition depends on that authority |
| MT2 final gate | `qa/tests/mt2/final/mt2-pacs009-rework-gate.json` | `F04A8512A144B2088655946AACD52672C51D49AF3997098F60B5259EEF62B448` | Executable four-message scope and acceptance requirements |

### Source precedence

```text
1. SR2026 MRG / CBPR+ Usage Guideline normative rule
2. Approved BA ruling for a controlled Demo scenario
3. QA invariant derived from 1 and 2
4. Product/Demo policy such as HTTP response or Virtual Stub behavior
```

- SR2025 is used only as a documented compatibility fallback when the required SR2026 rule/artifact is absent.
- MEMORY records project decisions; it cannot override an explicit SWIFT prohibition or create a normative rule.
- A source change, page/rule correction or MEMORY SHA change invalidates the Rule Table approval and requires re-review.

### NVR ownership boundary

Every Negative/Boundary rule must declare `validationOwner`:

| Owner | Handling in this package |
|---|---|
| `SSI_PROFILE_GATE` | Exact typed rejection before lookup when profile/service/topology is unsupported or contradictory |
| `SSI_RESOLVER` | Exact typed rejection when a required governed SSI relationship/evidence cannot be resolved |
| `FULL_FIN_VALIDATOR` | `OUT_OF_SCOPE_CLOSED`; SSI lookup not performed; zero candidate and zero side effects |
| `CBPR_USAGE_GUIDELINE_VALIDATOR` | Each row must select exactly one mode: invoke the named governed validator and assert its typed result, or close as `OUT_OF_SCOPE_CLOSED + FIN_VALIDATION_NOT_EVALUATED + ssiLookup=NOT_PERFORMED + expectedCandidateCount=0`; never silently reclassify it as SSI configuration failure or include it in the SSI-negative denominator |

The Generator must not turn a Full-FIN MRG NVR into an SSI Resolver error merely because the Demo contains a synthetic invalid field. Conversely, an SSI-owned missing relationship must not be hidden behind a generic NVR code.

Each Oracle row therefore requires:

```text
sourceRelease
sourceFilename
sourceSha256
sourcePageOrRule
ruleCategory = NORMATIVE | BA_RULING | QA_INVARIANT | PRODUCT_POLICY
validationOwner
expectedOutcome
expectedReasonCode
```

## 4. Proposed exact business scope for BA review

### 4.1 MT1／pacs.008

Proposed Phase 1:

- MT103 Base.
- MT103 STP (`119:STP`).
- Controlled MT103 REMIT only where the approved community/MUG/profile rule passes.
- `pacs.008.001.08` plain and STP.
- INDA, INGA and COVE topology according to the frozen MT1 v0.6 matrices.

Explicitly not auto-promoted into Phase 1:

- MT101: payment-initiation/CPI input; not a Bank SSI message.
- MT102, MT104 and MT107: future/dedicated adapter scope unless BA explicitly adds them.
- Phase-1 `CLRG`: `UNSUPPORTED_PROFILE`.
- Invalid/missing/contradictory 119/profile context: fail closed before SSI lookup.

### 4.2 MT2／pacs.009

Proposed executable scope:

- MT202 -> `pacs.009.001.08`, `BizSvc=swift.cbprplus.04`.
- MT202COV -> `pacs.009.001.08`, `BizSvc=swift.cbprplus.cov.04`.
- MT205 -> `pacs.009.001.08`, `BizSvc=swift.cbprplus.04`.
- MT205COV -> `pacs.009.001.08`, `BizSvc=swift.cbprplus.cov.04`.

Explicit exclusions:

- MT204 maps to pacs.010, not pacs.009.
- pacs.009 ADV is a distinct non-settling profile and must not become an operational settlement candidate.
- COV requires genuine cover purpose, `119:COV`, UETR continuity and complete Sequence B.
- MT205's MT200/201 52a=58a equivalence rule must not be inherited by MT205COV.

### 4.3 Version conversion policy

Conversion is parameter-driven, never a global string replacement:

```ts
type MessageVersionRule =
  | {
      sourceFamily: "pacs.008";
      sourceAliases: readonly ["pacs.008.001.12", "pacs.008.001.012"];
      target: "pacs.008.001.08";
    }
  | {
      sourceFamily: "pacs.009";
      sourceAliases: readonly ["pacs.009.001.12", "pacs.009.001.012"];
      target: "pacs.009.001.08";
    };

interface GovernedMessageVersionRule {
  rule: MessageVersionRule;
  policyNamespace: "SSI_DEMO_CBPRPLUS_SR2026";
  canonicalizationVersion: string;
  sharedCatalogueSha256: string;
  requiredSourceStatuses: readonly ["ACTIVE", "DRAFT"];
  eligibleDatasetClasses: readonly ["OPERATIONAL_POSITIVE"];
  excludedDatasetClasses: readonly ["HISTORICAL_BASELINE", "QA_NEGATIVE", "QA_BOUNDARY", "QA_ISOLATED", "LEGACY"];
  excludedTokens: readonly ["pacs.009.001.12.COV", "pacs.009.001.012.COV"];
}
```

The canonical conversion targets required by the approved CBPR+ SR2026 profile are exact:

```text
pacs.008.001.12 / pacs.008.001.012 -> pacs.008.001.08
pacs.009.001.12 / pacs.009.001.012 -> pacs.009.001.08
```

Only an eligible positive SSI record whose family, exact token, lifecycle, dataset class, profile, business service, direction and controlled context all match may produce a deterministic versioned `.001.08` successor. `QA_POSITIVE` is not implicitly eligible; it requires an explicit approved rule row. Historical, negative, boundary, legacy, QA-isolated, ambiguous, unknown and unsupported records remain unchanged and are classified fail-closed. `.12.COV` is never converted by the plain rule; a new canonical `.001.08` COV fixture, when approved, is generated by a separate exact profile rule. Global or substring replacement is prohibited. The shared module may provide only the exact-token canonicalization engine and contract; RMA eligibility, SSI eligibility, lifecycle, mutation and audit policies remain separate adapters.

The Rule Table assigns exactly one disposition to every target canonical group:

| Disposition | Deterministic meaning |
|---|---|
| `GENERATE_CANONICAL` | Approved FIN-generated fixture has no version-source row: generate its canonical `.001.08` target according to the frozen MT1/MT2 profile rule |
| `CONVERT` | Eligible source contains `.12` and lacks `.08`: remove the exact `.12` token and add exactly one canonical `.08` token in a versioned successor |
| `REMOVE_SOURCE_TOKEN` | Eligible source contains both `.12` and `.08`: remove only the exact `.12` token; do not add a duplicate `.08` token |
| `UNCHANGED` | Source already contains the required `.08` and contains no `.12`; zero row/token mutation |
| `SKIP_NEGATIVE` | Preserve the intentional QA-negative fixture bit/logically unchanged |
| `SKIP_HISTORY` | Preserve REVOKED/SUPERSEDED/Historical data bit/logically unchanged |
| `SKIP_COV` | Exclude `.12.COV`/`.012.COV` from the plain conversion rule |
| `HOLD_DEPENDENCY` | Only this group is held because an unresolved MT1/MT2 authority decision can change its disposition |
| `OUT_OF_SCOPE` | Exclude the group from this change package with zero SSI/Applicability output |

The 43 pacs.009 `.12` memberships are not forty-three additions: 32 source records already also contain `.08`. Before eligibility classification the raw upper bounds are therefore `targetAdded <= 11` and `sourceRemoved <= 43`; the approved Rule Table, not an assumed target count, determines final values. For the 32 dual-token records, `UNCHANGED` is prohibited while `.12` remains present: eligible rows use `REMOVE_SOURCE_TOKEN`; ineligible rows use the appropriate explicit skip/hold disposition.

The exact alias matched in the source is the only token removed. Canonical output is always `.001.08`. Exact `.12`, padded `.012`, `.12.COV` and `.012.COV` values are tokenized before matching; substring/global replacement is forbidden. If one row contains both plain aliases or duplicate copies, classification remains one canonical-group disposition: normalize exact-token multiplicity, remove every matched eligible plain source alias, add at most one canonical target, and report raw-token removal count separately from record-change count. A COV token is never consumed by this normalization.

### 4.4 Typed Oracle execution contract

The Rule Table and Oracle use a versioned machine-validated schema with closed enums, `additionalProperties=false`, explicit required/nullability rules and non-negative integer counts. Its normative typed contract is:

```ts
// OutcomeCode and ReasonCode are generated literal unions from the same-SHA
// outcome-reason-code-catalogue.v1.json; plain string is prohibited.
type ReviewStatus = "DRAFT" | "BLOCKED" | "BA_CONFIRMED" | "OUT_OF_SCOPE_CLOSED";
type ScopeStatus = "IN_SCOPE" | "OUT_OF_SCOPE_CLOSED";
type ExpectedHttp = 200 | 400 | 409 | 422 | 500 | 503 | "NOT_APPLICABLE";
type Iso4217Code = CurrencyCatalogueCode; // generated from the same-SHA Currency catalogue
type OosMessageIdentity = "MT101" | "MT102" | "MT104" | "MT107" | "MT204" | OosCatalogueIdentity;

type CurrencyContext =
  | { requirement: "REQUIRED" | "FROM_TRANSACTION"; source: "RULE" | "TRANSACTION"; currency: Iso4217Code }
  | { requirement: "NOT_REQUIRED"; source: "NOT_APPLICABLE"; currency: "NOT_APPLICABLE" };

type BookingEntityContext =
  | { requirement: "REQUIRED" | "FROM_CONTEXT"; source: "RULE" | "CONTEXT"; bookingEntityId: EntityCatalogueId }
  | { requirement: "NOT_REQUIRED"; source: "NOT_APPLICABLE"; bookingEntityId: "NOT_APPLICABLE" };

type ValueDateContext =
  | { source: "TRANSACTION" | "CONTEXT"; valueDate: IsoDate; effectiveFrom: IsoDate; effectiveTo: IsoDate }
  | { source: "NOT_APPLICABLE"; valueDate: "NOT_APPLICABLE"; effectiveFrom: "NOT_APPLICABLE"; effectiveTo: "NOT_APPLICABLE" };

type AccountRelationshipContext =
  | {
      requirement: "REQUIRED" | "OPTIONAL_VALIDATE_IF_PRESENT";
      ownerRole: "OWN_ENTITY" | "COUNTERPARTY";
      servicerRole: "OWN_ENTITY" | "COUNTERPARTY" | "DERIVED_BY_NOSTRO_LOOKUP";
      relationship: AccountRelationshipCatalogueId;
      purpose: AccountPurposeCatalogueId;
      suppliedAccounts: InputAccountSelection;
    }
  | {
      requirement: "NOT_REQUIRED";
      ownerRole: "NOT_APPLICABLE";
      servicerRole: "NOT_APPLICABLE";
      relationship: "NOT_APPLICABLE";
      purpose: "NOT_APPLICABLE";
      suppliedAccounts: { case: "ABSENT" };
    };

interface SuppliedAccountIdentity {
  id: AccountIdentityId;
  version: number;
  reference: AccountReference;
}

type InputAccountSelection =
  | { case: "ABSENT" }
  | { case: "SINGLE_VALID"; account: SuppliedAccountIdentity }
  | { case: "SINGLE_INVALID"; account: SuppliedAccountIdentity; invalidReasonCode: ReasonCode }
  | { case: "MULTIPLE"; accounts: readonly SuppliedAccountIdentity[] };

interface ExecutionContext {
  contextId: ExecutionContextCatalogueId;
  currency: CurrencyContext;
  bookingEntity: BookingEntityContext;
  valueDate: ValueDateContext;
  account: AccountRelationshipContext;
  amount:
    | { requirement: "REQUIRED" | "FROM_TRANSACTION"; decimalValue: CanonicalDecimalString; currency: Iso4217Code }
    | { requirement: "NOT_REQUIRED"; decimalValue: "NOT_APPLICABLE"; currency: "NOT_APPLICABLE" };
  productId: ProductCatalogueId | "NOT_APPLICABLE";
  businessFunctionId: BusinessFunctionCatalogueId | "NOT_APPLICABLE";
  paymentLegId: PaymentLegCatalogueId | "NOT_APPLICABLE";
  transactionReference: TransactionReference | "NOT_APPLICABLE";
}

interface CatalogueReferences {
  routePreferenceId: RoutePreferenceCatalogueId | "NOT_APPLICABLE";
  officialRoleId: OfficialRoleCatalogueId | "NOT_APPLICABLE";
  lookupContractId: LookupContractCatalogueId | "NOT_APPLICABLE";
  profileVariantId: ProfileVariantCatalogueId | "NOT_APPLICABLE";
  sequenceId: SequenceCatalogueId | "NOT_APPLICABLE";
  settlementLegId: SettlementLegCatalogueId | "NOT_APPLICABLE";
  derivationRuleId: DerivationRuleCatalogueId | "NOT_APPLICABLE";
}

type SelectedIdentity<Id> =
  | { selection: "SELECTED"; id: Id; version: number }
  | { selection: "NOT_SELECTED" }
  | { selection: "NOT_APPLICABLE" };

interface ExpectedSelections {
  route: SelectedIdentity<RouteIdentityCatalogueId>;
  account: SelectedIdentity<AccountIdentityId>;
  ssi: SelectedIdentity<SsiIdentityId>;
  applicability: SelectedIdentity<ApplicabilityIdentityId>;
}

type ApiExecutionContract =
  | {
      submission: "REQUIRED";
      apiContractId: ApiContractCatalogueId;
    }
  | {
      submission: "PROHIBITED";
      apiContractId: "NOT_APPLICABLE";
    };

interface VersionConversionBase {
  sourceKind: "VERSION_CONVERSION_SOURCE";
  sourceRecordId: string;
  sourceVersion: number;
  canonicalTargetPresent: boolean;
  covTokenPresent: boolean;
  sourceLifecycle: "ACTIVE" | "DRAFT" | "REVOKED" | "SUPERSEDED";
  sourceDatasetClass: "OPERATIONAL_POSITIVE" | "QA_POSITIVE" | "QA_NEGATIVE" | "QA_BOUNDARY" | "QA_ISOLATED" | "HISTORICAL_BASELINE" | "LEGACY";
  direction: "INBOUND" | "OUTBOUND";
  contextKey: ExecutionContextCatalogueId;
  dependencyStatus: "CLOSED" | "PENDING" | "NOT_APPLICABLE";
  executionContext: ExecutionContext;
}

type VersionConversionInput = VersionConversionBase & (
  | { family: "pacs.008"; sourceAliasesPresent: readonly ("pacs.008.001.12" | "pacs.008.001.012")[]; targetToken: "pacs.008.001.08"; profile: "PLAIN" | "REMIT"; businessService: "swift.cbprplus.04" }
  | { family: "pacs.008"; sourceAliasesPresent: readonly ("pacs.008.001.12" | "pacs.008.001.012")[]; targetToken: "pacs.008.001.08"; profile: "STP"; businessService: "swift.cbprplus.stp.04" }
  | { family: "pacs.009"; sourceAliasesPresent: readonly ("pacs.009.001.12" | "pacs.009.001.012")[]; targetToken: "pacs.009.001.08"; profile: "PLAIN"; businessService: "swift.cbprplus.04" }
);

interface FinGeneratedBase {
  sourceKind: "FIN_GENERATED_FIXTURE";
  direction: "INBOUND" | "OUTBOUND";
  contextKey: ExecutionContextCatalogueId;
  dependencyStatus: "CLOSED" | "PENDING";
  executionContext: ExecutionContext;
}

type FinGeneratedFixtureInput = FinGeneratedBase & (
  | { family: "MT1"; messageType: "MT103"; targetFamily: "pacs.008"; targetToken: "pacs.008.001.08"; profile: "PLAIN"; businessService: "swift.cbprplus.04" }
  | { family: "MT1"; messageType: "MT103"; targetFamily: "pacs.008"; targetToken: "pacs.008.001.08"; profile: "STP"; businessService: "swift.cbprplus.stp.04" }
  | { family: "MT1"; messageType: "MT103"; targetFamily: "pacs.008"; targetToken: "pacs.008.001.08"; profile: "REMIT"; businessService: "swift.cbprplus.04" }
  | { family: "MT2"; messageType: "MT202" | "MT205"; targetFamily: "pacs.009"; targetToken: "pacs.009.001.08"; profile: "PLAIN"; businessService: "swift.cbprplus.04" }
  | { family: "MT2"; messageType: "MT202COV" | "MT205COV"; targetFamily: "pacs.009"; targetToken: "pacs.009.001.08"; profile: "COV"; businessService: "swift.cbprplus.cov.04" }
);

interface OosOracleBase {
  sourceKind: "OOS_ORACLE_ONLY";
  messageTypeOrToken: OosMessageIdentity;
  contextKey: ExecutionContextCatalogueId;
  dependencyStatus: "CLOSED" | "PENDING" | "NOT_APPLICABLE";
  executionContext: ExecutionContext;
}

type OosOracleInput = OosOracleBase & (
  | { family: "pacs.009"; profile: "ADV"; businessService: "swift.cbprplus.adv.04" }
  | { family: "MT1" | "MT2" | "pacs.008" | "pacs.009"; profile: "NOT_APPLICABLE"; businessService: "NOT_APPLICABLE" }
);

interface HistoricalOrSkipInput {
  sourceKind: "HISTORICAL_OR_SKIP";
  family: "MT1" | "MT2" | "pacs.008" | "pacs.009";
  sourceRecordId: string;
  sourceVersion: number;
  sourceLifecycle: "ACTIVE" | "DRAFT" | "REVOKED" | "SUPERSEDED";
  sourceDatasetClass: "QA_NEGATIVE" | "QA_BOUNDARY" | "QA_ISOLATED" | "HISTORICAL_BASELINE" | "LEGACY";
  contextKey: ExecutionContextCatalogueId;
  dependencyStatus: "CLOSED" | "PENDING" | "NOT_APPLICABLE";
  executionContext: ExecutionContext;
}

type InputCondition = VersionConversionInput | FinGeneratedFixtureInput | OosOracleInput | HistoricalOrSkipInput;
type AccountCase = "NOT_APPLICABLE" | "REQUIRED_PRESENT" | "REQUIRED_MISSING" | "OPTIONAL_ABSENT" | "OPTIONAL_PRESENT_VALID" | "OPTIONAL_PRESENT_INVALID" | "OPTIONAL_MULTIPLE";

interface SourceEvidence {
  sourceArtifactId: string;
  sourceRelease: string;
  sourceVersion: string;
  sourceFilename: string;
  sourceSha256: string;
  ruleId: string;
  sectionOrPage: string;
  ruleCategory: "NORMATIVE" | "BA_RULING" | "QA_INVARIANT" | "PRODUCT_POLICY";
  registryId: "CONTROLLED_SOURCE_REGISTER" | "BA_RULING_REGISTRY" | "QA_INVARIANT_REGISTRY" | "PRODUCT_POLICY_REGISTRY";
}

type ValidationExecution =
  | { owner: "SSI_PROFILE_GATE" | "SSI_RESOLVER"; mode: "EXECUTE"; ssiLookup: "PERFORMED" | "NOT_PERFORMED" }
  | { owner: "CBPR_USAGE_GUIDELINE_VALIDATOR"; mode: "EXECUTE_NAMED_VALIDATOR"; validatorId: string; ssiLookup: "NOT_PERFORMED" }
  | { owner: "FULL_FIN_VALIDATOR" | "CBPR_USAGE_GUIDELINE_VALIDATOR"; mode: "OUT_OF_SCOPE_CLOSED"; finValidationStatus: "FIN_VALIDATION_NOT_EVALUATED"; ssiLookup: "NOT_PERFORMED" };

type ActivationContract =
  | { targetLifecycle: "DRAFT"; activationPath: "MAKER_CHECKER" }
  | { targetLifecycle: "ACTIVE"; activationPath: "CONTROLLED_DEMO_SEED_ACTIVE_EXCEPTION"; poDecisionId: string };

interface TypedSideEffects {
  payloadGenerated: false;
  confirmed: false;
  postingCount: 0;
  repairQueueCount: 0;
  auditMutationCount: 0;
  databaseWriteCount: 0;
  stubCallCount: number;
  stubRequestIdentity: string | null;
}

interface RuleOracleRow {
  canonicalGroupKey: string;
  scopeStatus: ScopeStatus;
  reviewStatus: ReviewStatus;
  inputCondition: InputCondition;
  disposition: "GENERATE_CANONICAL" | "CONVERT" | "REMOVE_SOURCE_TOKEN" | "UNCHANGED" | "SKIP_NEGATIVE" | "SKIP_HISTORY" | "SKIP_COV" | "HOLD_DEPENDENCY" | "OUT_OF_SCOPE";
  validation: ValidationExecution;
  activation: ActivationContract | null;
  accountRuleKey: string | null;
  accountCase: AccountCase;
  expectedOutcomeCode: OutcomeCode;
  expectedReasonCode: ReasonCode;
  apiExecution: ApiExecutionContract;
  expectedHttp: ExpectedHttp;
  expectedCandidateCount: number;
  expectedSelections: ExpectedSelections;
  effects: TypedSideEffects;
  expectedTargetAdded: number;
  expectedSourceRemoved: number;
  expectedRecordsChanged: 0 | 1;
  expectedRecordsUnchanged: 0 | 1;
  expectedSsiRowDelta: number;
  expectedApplicabilityRowDelta: number;
  sourceEvidence: readonly SourceEvidence[];
}

interface RuleTableRow {
  governanceSnapshotId: string;
  sourceShaSet: readonly string[];
  policyNamespace: "SSI_DEMO_CBPRPLUS_SR2026";
  canonicalizationVersion: string;
  sharedCatalogueSha256: string;
  canonicalGroupKey: string;
  groupId: string;
  scopeStatus: ScopeStatus;
  ownBic: string;
  counterpartyBic: string;
  rmaService: "FIN" | "FINPLUS";
  sourceToken: string | null;
  normalizedAlias: string | null;
  conversionRuleId: string | null;
  catalogueReferences: CatalogueReferences;
  reviewStatus: ReviewStatus;
  inputCondition: InputCondition;
  mutationDisposition: RuleOracleRow["disposition"];
  validation: ValidationExecution;
  activation: ActivationContract | null;
  datasetClass: "OPERATIONAL_POSITIVE" | "QA_POSITIVE" | "QA_NEGATIVE" | "QA_BOUNDARY" | "QA_ISOLATED" | "HISTORICAL_BASELINE" | "LEGACY";
  targetLifecycle: "DRAFT" | "ACTIVE" | null;
  activationPath: "MAKER_CHECKER" | "CONTROLLED_DEMO_SEED_ACTIVE_EXCEPTION" | null;
  dependencyId: string | null;
  priority: number;
  tiePolicy: "AMBIGUOUS";
  accountRequirement: "REQUIRED" | "OPTIONAL" | "NOT_REQUIRED";
  expectedOutcomeCode: OutcomeCode;
  expectedReasonCode: ReasonCode;
  apiExecution: ApiExecutionContract;
  expectedHttp: ExpectedHttp;
  expectedCandidateCount: number;
  expectedSelections: ExpectedSelections;
  ssiLookup: "PERFORMED" | "NOT_PERFORMED";
  payloadGenerated: false;
  confirmed: false;
  expectedPostingCount: 0;
  expectedRepairCount: 0;
  expectedAuditCount: 0;
  expectedDbWriteCount: 0;
  expectedStubCallCount: number;
  expectedStubRequestIdentity: string | null;
  operationalVisibility: boolean;
  qaVisibility: boolean;
  ssiOwnedDenominator: boolean;
  oosDenominator: boolean;
  optionalAccountAbsentOutcome: OutcomeCode | null;
  optionalAccountPresentValidOutcome: OutcomeCode | null;
  optionalAccountPresentInvalidOutcome: OutcomeCode | null;
  optionalAccountMultipleOutcome: OutcomeCode | null;
  eligibilityDecision: "ELIGIBLE" | "INELIGIBLE" | "HELD" | "OUT_OF_SCOPE";
  successorRecordId: string | null;
  successorVersion: number | null;
  amendmentOfId: string | null;
  validationOwner: ValidationExecution["owner"];
  validationExecutionMode: ValidationExecution["mode"];
  finValidationStatus: "FIN_VALIDATION_NOT_EVALUATED" | null;
  sourceEvidence: readonly SourceEvidence[];
  expectedTargetAdded: number;
  expectedSourceRemoved: number;
  expectedRecordsChanged: 0 | 1;
  expectedRecordsUnchanged: 0 | 1;
  expectedSsiRowDelta: number;
  expectedApplicabilityRowDelta: number;
  runtimeDriftDisposition: "NOT_APPLICABLE" | "PRESERVE_NON_TARGET_RUNTIME_DRIFT" | "TARGET_EXPLICIT_RULE" | "BLOCKED";
}
```

Conditional schema invariants are exhaustive: `GENERATE_CANONICAL` is valid only for `FIN_GENERATED_FIXTURE` and requires canonical target generation with no source-token removal; `CONVERT` requires `VERSION_CONVERSION_SOURCE`, `targetAdded=1`, at least one source alias removed and `recordsChanged=1`; `REMOVE_SOURCE_TOKEN` requires `VERSION_CONVERSION_SOURCE`, `targetAdded=0`, at least one source alias removed and `recordsChanged=1`; `UNCHANGED` requires zero token/row mutation and `recordsUnchanged=1`; every skip/hold/OOS disposition requires zero token/row mutation. `inputCondition` is the single authoritative home for source identity/version/lifecycle/dataset, dependency status, family, message identity, target token, direction, profile, business service and execution context; duplicate top-level copies are prohibited by `additionalProperties=false`. Family/profile/BizSvc branches are closed: pacs.008 plain=`swift.cbprplus.04`, pacs.008 STP=`swift.cbprplus.stp.04`, pacs.009 plain=`swift.cbprplus.04`, COV=`swift.cbprplus.cov.04`, ADV=`swift.cbprplus.adv.04`; cross-family/profile combinations fail schema validation. `OUT_OF_SCOPE_CLOSED` requires `scopeStatus=OUT_OF_SCOPE_CLOSED`, the closed OOS identity in `inputCondition`, all non-ADV profile/route/role/lookup/context values to use the explicit `NOT_APPLICABLE` branch, candidate count, payload, confirmation, posting, repair, audit and DB writes all zero, and exclusion from the SSI-owned denominator. `null` is never used to mean not applicable. Any remaining nullable field is legal only in its named discriminated branch and has one schema-defined meaning; omitted, undefined or branch-inconsistent null values fail. Account requirement mappings are exact: `REQUIRED`↔`executionContext.account.requirement=REQUIRED`, `OPTIONAL`↔`OPTIONAL_VALIDATE_IF_PRESENT`, and `NOT_REQUIRED`↔`NOT_REQUIRED`. Account cases also bind exactly to input selection: `REQUIRED_MISSING`/`OPTIONAL_ABSENT`→`ABSENT`, `REQUIRED_PRESENT`/`OPTIONAL_PRESENT_VALID`→`SINGLE_VALID`, `OPTIONAL_PRESENT_INVALID`→`SINGLE_INVALID`, `OPTIONAL_MULTIPLE`→`MULTIPLE` with at least two distinct approved account identity-version-reference triples. Every `accountRequirement=OPTIONAL` Rule key must join to exactly four distinct Oracle rows covering those exact cases; missing or duplicate cases fail. Every Virtual Stub contract is identified by the governed lookup-contract catalogue row, while Oracle effects assert exact call count and request identity. Missing, negative or contradictory counts fail schema validation.

The JSON Schema uses discriminated `oneOf` branches for positive execution, SSI-owned negative, OOS, skip and hold rows. OOS requires `reviewStatus=OUT_OF_SCOPE_CLOSED`, `scopeStatus=OUT_OF_SCOPE_CLOSED`, an identity present in the same-SHA closed OOS catalogue, the `ApiExecutionContract.submission=PROHIBITED` branch, `expectedHttp=NOT_APPLICABLE`, `expectedOutcomeCode=OUT_OF_SCOPE_CLOSED`, `ssiLookup=NOT_PERFORMED` and zero side effects. Submitted rows require the `REQUIRED` API branch and an exact FK to one immutable API-contract catalogue tuple containing `POST` method, endpoint, request schema, request template and field binding; individual component IDs never appear in Rule/Oracle rows and cannot be recombined. The approved field-binding row maps every API-required fact—including supplied account selection, amount, currency, product, business function, payment leg, booking entity, value date, transaction reference and account relationship—to one and only one typed `ExecutionContext` field; defaulting, hard-coding and message-type inference are prohibited. `stubCallCount=0` requires `stubRequestIdentity=null`; a positive count requires a non-null exact request identity. `DRAFT`/`BLOCKED` are review states only and cannot appear in the executable partition. The same approval pack contains the closed outcome/reason-code catalogue; catalogue values are copied into JSON Schema `enum` arrays, so no free-form outcome or reason string is accepted.

Rule and Oracle schemas are independent but joined one-to-many by `canonicalGroupKey`. Every Rule has at least one Oracle row; cardinality equals the approved expected-partition/account-case manifest. Dataset visibility, denominators, execution context, account requirement, selected identities/versions, API contract, activation, mutation disposition and validation ownership must agree across the join. Every `SelectedIdentity` branch is atomic: `SELECTED` requires an exact ID-version pair present in the same-SHA expected-selected-identity manifest; `NOT_SELECTED` and `NOT_APPLICABLE` prohibit ID and version properties. `RouteIdentityCatalogueId` identifies a concrete eligible route instance in that manifest and carries a FK to its policy-level `RoutePreferenceCatalogueId`; the two are never interchangeable. Account, SSI and Applicability selected pairs must likewise exist in the manifest, whose deterministic identity material and expected existence are approved before validator TDD and reconciled against the later candidate seed. JSON Schema applies BIC/SHA/ISO-date/ISO-4217/canonical-decimal/transaction-reference/ID patterns, non-negative integer constraints and foreign-key checks to the approved entity, product, business-function, payment-leg, account-relationship, account-purpose, route-preference, official-role, lookup-contract, profile-variant, sequence, settlement-leg, derivation-rule, selected-identity and API-contract catalogues. `contextKey` and `executionContext.contextId` must be identical and exact-match the same-SHA execution-context catalogue. Every derivation-rule catalogue row binds one complete immutable tuple of family, message identity, direction, profile, business service, route, role, lookup contract, profile variant, sequence, settlement leg, execution-context ID and atomic API-contract ID; all `inputCondition`, `catalogueReferences` and `apiExecution` values must exact-match that tuple. Individual valid IDs assembled into an unapproved tuple fail validation. `sourceEvidence` has `minItems=1`. Each evidence row must exact-match the registry required by its category: NORMATIVE→controlled SWIFT/MEMORY source register, PRODUCT_POLICY→`product-policy-evidence-registry.v1.json`, BA_RULING→`ba-ruling-evidence-registry.v1.json`, QA_INVARIANT→`qa-invariant-evidence-registry.v1.json`. Cross-registry substitution, missing artifact ID/version/rule ID/section/SHA, stale SHA and unapproved evidence all fail validation. There is no separate `evidenceSource`; lookup/stub provenance belongs only to the typed lookup-contract catalogue and Oracle effects.

The No-Inference closure gate requires `freeTextExecutableRules=0`, `ambiguousNull=0`, `unknownMessageIdentity=0`, `missingTypedParameter=0`, `missingEvidence=0`, `unknownEvidenceSha=0`, `staleEvidence=0`, `unapprovedEvidence=0`, `generatorBusinessInference=0` and `oracleAmbiguity=0`. A mechanically implemented Generator with no SWIFT/SSI/Nostro knowledge must produce exactly one result from the frozen Rule Table and Oracle.

## 5. Dataset lifecycle and visibility

| Dataset class | Operational discovery | QA discovery | Audit | Mutation policy |
|---|---|---|---|---|
| Historical Baseline | No | No | Yes | Immutable |
| Operational Positive | Yes | Yes | Yes | New version only |
| QA Positive | No | Yes | Yes | New version only |
| QA Negative | No | Yes | Yes | Preserve intentional defect |
| QA Boundary / OOS | No | Oracle only | Yes | No SSI candidate row |

Negative fixtures must never be “repaired” into Positive merely to obtain API 200. OOS cases must produce zero SSI and zero Applicability rows.

Every generated successor must declare `targetLifecycle` and `activationPath`:

```text
Default maintenance path:
  targetLifecycle = DRAFT
  activationPath  = MAKER_CHECKER
  DRAFT -> SUBMITTED -> APPROVED/ACTIVE

Controlled Demo seed exception (not implied by this plan):
  targetLifecycle = ACTIVE
  activationPath  = CONTROLLED_DEMO_SEED_ACTIVE_EXCEPTION
  requires a separate PO decision, exact Rule Table/Oracle SHA,
  Development-only scope and evidence that normal maintenance is not bypassed.
```

The Generator must not choose between these paths. Gate 1 fails if any executable row lacks one approved path. `ACTIVE` and `DRAFT` cardinalities, visibility and expected transitions are reconciled separately.

## 6. BA decisions required before implementation

BA Maker and Independent BA Checker must review the same exact Rule Table SHA and answer:

1. Confirm the MT1 Phase-1 message/profile list and future/OOS list.
2. Confirm MT2 plain/COV scenarios and ADV/MT204 exclusions.
3. Confirm per-scenario `direction`, settlement leg, official SSI role and profile.
4. Confirm `.12 -> .08` eligibility by lifecycle and dataset class, including `CONVERT`, `REMOVE_SOURCE_TOKEN` and `UNCHANGED` semantics.
5. Confirm that the already-governed RMA disposition is carried forward unchanged: two canonical PCBCCNBJ groups／four physical rows remain `SKIP_DEVELOPMENT_REFERENCE_GAP`; no RMA mutation, `.08` conversion, fake Bank Service creation or denominator inclusion is permitted in this SSI package.
6. Confirm ranking/tie policy; equal top rank must be `AMBIGUOUS`, never database row order.
7. Confirm Account/Nostro requirement per scenario as `REQUIRED`, `OPTIONAL` or `NOT_REQUIRED`.
8. Confirm Controlled Virtual Stub lookup contracts and exact typed outcomes.
9. Confirm expected target cardinalities for every dataset class and separately approve `targetAdded`, `sourceRemoved`, `recordsChanged`, `recordsUnchanged`, SSI rows and Applicability rows.
10. Confirm `targetLifecycle` and `activationPath` for every executable row; direct ACTIVE seed loading requires the named Development-only exception.
11. Confirm the fourteen current runtime-only rows as preserved non-target drift or provide an explicit target rule; source absence may not imply deletion.
12. Confirm MT1/MT2 dependency per group. An unresolved upstream rule blocks only rows whose disposition could change; unaffected exact-version conversion rows proceed in a separately reconciled executable partition.

Required Rule Table columns:

```text
governanceSnapshotId, sourceShaSet, policyNamespace,
canonicalizationVersion, sharedCatalogueSha256,
canonicalGroupKey, groupId, scopeStatus,
ownBic, counterpartyBic, rmaService,
sourceToken, normalizedAlias, conversionRuleId,
inputCondition, catalogueReferences,
datasetClass, targetLifecycle, activationPath,
dependencyId, priority,
tiePolicy, accountRequirement,
expectedOutcomeCode, expectedReasonCode,
apiExecution, expectedHttp,
expectedCandidateCount, expectedSelections,
ssiLookup, payloadGenerated, confirmed,
expectedPostingCount, expectedRepairCount, expectedAuditCount,
expectedDbWriteCount, expectedStubCallCount, expectedStubRequestIdentity,
ssiOwnedDenominator, oosDenominator,
optionalAccountAbsentOutcome, optionalAccountPresentValidOutcome,
optionalAccountPresentInvalidOutcome, optionalAccountMultipleOutcome,
eligibilityDecision, mutationDisposition,
successorRecordId, successorVersion, amendmentOfId,
operationalVisibility, qaVisibility, validationOwner,
validationExecutionMode, finValidationStatus,
sourceEvidence, expectedTargetAdded, expectedSourceRemoved,
expectedRecordsChanged, expectedRecordsUnchanged,
expectedSsiRowDelta, expectedApplicabilityRowDelta,
runtimeDriftDisposition
```

Allowed decision values are the closed set `GENERATE_CANONICAL`, `CONVERT`, `REMOVE_SOURCE_TOKEN`, `UNCHANGED`, `SKIP_NEGATIVE`, `SKIP_HISTORY`, `SKIP_COV`, `HOLD_DEPENDENCY` and `OUT_OF_SCOPE`. Every target group has exactly one value; `Unknown=0` and `Multiple=0`. Gate 1 executable rows require `HOLD_DEPENDENCY=0`; held rows remain outside that partition and cannot be mutated.

## 7. QA review and acceptance contract

QA reviews templates once and parameter rows exhaustively:

- Positive acceptance must match exact expected profile and route.
- Negative results must match exact typed reason and HTTP outcome.
- OOS must not be submitted to SSI resolution.
- Historical rows must never become discovery candidates.
- Controlled Virtual Stub calls must match the declared lookup contract.
- Expected side effects are always zero during Dry Run.

Required reconciliation format:

```text
Total Rule Groups                      xxx
Executable Rule Groups                 xxx
Total Held Dependency Groups           xxx
Executable-partition Held Groups         0
Expected/actual partition missing        0
Expected/actual partition extra          0
Expected/actual partition misclassified  0
BA_CONFIRMED                           xxx
OUT_OF_SCOPE_CLOSED                    xxx
BLOCKED                                  0
DRAFT                                    0

Generated contexts                     xxx
GENERATE_CANONICAL                      xxx
CONVERT                                xxx
REMOVE_SOURCE_TOKEN                    xxx
UNCHANGED                              xxx
SKIP_NEGATIVE                          xxx
SKIP_HISTORY                           xxx
SKIP_COV                               xxx
HOLD_DEPENDENCY                        xxx
OUT_OF_SCOPE                           xxx
Disposition total                      xxx / xxx
Unknown disposition                      0
Multiple dispositions                     0
Target tokens added                    xxx
Source tokens removed                  xxx
Records changed                        xxx
Records unchanged                      xxx
Positive exact match                   xxx / xxx
Negative exact reason match            xxx / xxx
OOS submitted                            0
Missing Direction                        0
Missing Typed Execution Parameter        0
Unknown Message Identity                 0
Unapproved Catalogue Tuple               0
Ambiguous Selected Identity              0
Missing Expected Outcome                 0
Missing Reason Code                      0
Missing/Unknown/Stale Evidence            0
Free-text Executable Rules                0
Generator Business Inference              0
Oracle mismatch                          0
Unexpected side effects                  0
Database writes during Dry Run            0
Unexpected runtime deletion                0
Preserved runtime-only drift changed       0
```

## 8. Gate model

```text
Gate 0 — Inventory
  Existing read-only current DB/API + Reload source reconciliation only;
  no new TypeScript or test file

Gate 0I — Narrow inventory-tool TDD authorization
  Same-SHA inventory assertions and read-only I/O contract approved by BA/QA
  Allows only Task 1 inventory-tool Red/Green TDD; no schema/Generator/fixture/DB work

Gate 0S — Non-executable schema approval pack
  Plan + JSON Schema + closed outcome/reason catalogue + meta-test vectors
  + closed OOS-message, route/role/lookup/context/derivation catalogues
  + closed API endpoint/schema/template/field-binding catalogues
  + expected selected identity-version manifest
  + controlled source, product-policy, BA-ruling and QA-invariant evidence registries
  + independently authored expected-partition manifest share one approved SHA set
  Allows schema/validator Red/Green TDD only; no Generator/fixture/Reload/DB action

Gate 1 — BA/QA same-SHA scope approval and per-group dependency closure
  Rule Table + Test Oracle + Dataset Classification
  Only groups whose disposition depends on unresolved MT1/MT2 authority remain HOLD;
  unaffected version-normalization groups form a separately reconciled executable partition
  Allows TDD, Generator, Mapper and zero-write Dry Run only

Gate 2 — API Dry Run
  Exact Positive/Negative/OOS outcomes; DB writes=0

Gate 3 — Versioned Insert Preflight
  ID collision=0; historical mutation=0; idempotency PASS;
  visibility isolation PASS; rollback verified

Gate 3D — DBA data/performance review
  Query/filter/sort plan, cold/hot latency, payload size, WAL/lock behavior,
  table-by-table row multiset and identical snapshot evidence PASS

Gate 4A — Reload-source publication authorization
  Explicit user approval against the exact artifact SHA set
  Publication only; no Reload execution

Gate 4B — Isolated Reload execution authorization
  Same approved source SHA; transactional execution and rollback evidence

Gate 4C — Development Runtime DB Apply authorization
  Separate explicit user approval after Preflight and isolated Reload PASS

Gate 5 — Post-Apply/UI acceptance
  Counts, logical SHA, non-target integrity, Reload parity and UI QA PASS
```

No Gate implicitly authorizes the next Gate.

---

### Task 1: Freeze the read-only inventory after Gate 0I

**Files:**

- Create: `qa/fixtures/ssi/mt1-mt2/active-inventory.v1.json`
- Create: `qa/fixtures/ssi/mt1-mt2/runtime-drift-preservation.v1.json`
- Create: `qa/fixtures/src/ssi/mt1-mt2-active-inventory.ts`
- Test: `qa/fixtures/src/ssi/mt1-mt2-active-inventory.test.ts`

**Step 1: Write the failing test**

Assert the current observed inventory: SSI pacs.008 `.12=24/.08=0`, SSI pacs.009 `.12=43/.08=68`, RMA pacs.008 `.12=2/.08=28`, RMA pacs.009 `.12=2/.08=40`, RMA MT1=8 and RMA MT2=14. Separately assert array/CSV representation counts, token memberships, unions/intersections, two residual FINPLUS records, two canonical groups, four physical RMA rows and two excluded `.12.COV` memberships. Export the exact two runtime-only REVOKED SSI rows and twelve ACTIVE Applicability children with IDs, payload/FKs and logical SHA; require an explicit drift disposition for every row.

Do not create the test or implementation until Gate 0I is explicitly recorded. Gate 0 itself uses only existing read-only API/SQLite evidence and does not authorize source changes.

**Step 2: Run the test and confirm it fails**

Run: `node --experimental-strip-types --test qa/fixtures/src/ssi/mt1-mt2-active-inventory.test.ts`

Expected: FAIL because the inventory application does not exist.

**Step 3: Implement read-only inventory classes**

Create `ActiveMessageInventoryRepository`, `MessageFamilyClassifier` and `InventoryReportWriter`. Read SQLite with `readOnly: true`; never call INSERT/UPDATE/DELETE.

**Step 4: Validate and commit**

Run: `node --experimental-strip-types --test qa/fixtures/src/ssi/mt1-mt2-active-inventory.test.ts`

Run: `npx eslint qa/fixtures/src/ssi/mt1-mt2-active-inventory.ts qa/fixtures/src/ssi/mt1-mt2-active-inventory.test.ts`

Expected: both commands exit `0`. Commit only after Product Owner explicitly authorizes committing the controlled artifact; Gate 1 does not imply commit/push authorization.

### Task 2: Produce the BA Rule Table and Oracle templates

**Files:**

- Create: `qa/fixtures/ssi/mt1-mt2/repair-rule-table.v1.json`
- Create: `qa/fixtures/ssi/mt1-mt2/test-oracle.v1.json`
- Create: `qa/fixtures/ssi/mt1-mt2/ba-qa-review.v1.md`
- Create: `qa/fixtures/ssi/mt1-mt2/rule-oracle.schema.v1.json`
- Create: `qa/fixtures/ssi/mt1-mt2/outcome-reason-code-catalogue.v1.json`
- Create: `qa/fixtures/ssi/mt1-mt2/schema-meta-test-vectors.v1.json`
- Create: `qa/fixtures/ssi/mt1-mt2/expected-partition-manifest.v1.json`
- Create: `qa/fixtures/ssi/mt1-mt2/product-policy-evidence-registry.v1.json`
- Create: `qa/fixtures/ssi/mt1-mt2/ba-ruling-evidence-registry.v1.json`
- Create: `qa/fixtures/ssi/mt1-mt2/qa-invariant-evidence-registry.v1.json`
- Create: `qa/fixtures/ssi/mt1-mt2/out-of-scope-message-catalogue.v1.json`
- Create: `qa/fixtures/ssi/mt1-mt2/execution-context-catalogues.v1.json`
- Create: `qa/fixtures/ssi/mt1-mt2/derivation-tuple-catalogue.v1.json`
- Create: `qa/fixtures/ssi/mt1-mt2/api-execution-contract-catalogue.v1.json`
- Create: `qa/fixtures/ssi/mt1-mt2/expected-selected-identity-manifest.v1.json`
- Create: `qa/fixtures/ssi/mt1-mt2/schema-approval-pack.v1.json`
- Create: `qa/fixtures/src/ssi/mt1-mt2-rule-oracle.schema.ts`
- Create: `qa/fixtures/src/ssi/validate-mt1-mt2-rule-table.ts`
- Test: `qa/fixtures/src/ssi/validate-mt1-mt2-rule-table.test.ts`
- Reference: `memory/swift-mt1xx-pacs008-v2.md`
- Reference: `memory/swift-mt2xx-pacs009-v2.md`

**Step 1: Populate templates without inventing decisions**

Mark unresolved rows `DRAFT` or `BLOCKED`; do not derive route/account semantics in Engineering code.

**Step 1A: Prepare and approve a non-executable schema pack before writing validator code**

This plan authorizes only manual preparation of non-executable draft specification artifacts: JSON Schema 2020-12, closed outcome/reason catalogue, closed OOS-message, execution-context, derivation-tuple and API-execution catalogues, expected selected identity-version manifest, positive/negative meta-test vectors, the governed controlled-source/product-policy/BA-ruling/QA-invariant evidence registries and an independently BA/QA-authored expected-partition manifest listing every executable and held canonical-group ID. No TypeScript or validator may be written at this step. BA and QA review those artifacts plus this plan as one approval pack and freeze all exact SHAs. The JSON Schema is authoritative; the future TypeScript type must be generated from or proven equivalent to it.

Only a same-SHA `PASS` on the complete schema approval pack authorizes schema/validator Red/Green TDD. Validator tests must cover closed enums, `additionalProperties=false` recursively, required/nullability, explicit `NOT_APPLICABLE` branches, catalogue and evidence-registry FKs, typed execution context, non-negative counts, every conditional invariant, alias multiplicity and expected partition membership. Negative meta-vectors must specifically reject mismatched source/dependency facts, accountCase/input-account selection mismatch, nonexistent selected ID-version pairs, recombined API components and derivation/context/API tuples that do not exact-match one approved catalogue row. This approval never authorizes Generator, fixture, Reload or DB work.

**Step 2: Run schema/cardinality validation**

Run: `node --experimental-strip-types --test qa/fixtures/src/ssi/validate-mt1-mt2-rule-table.test.ts`

Run: `node --experimental-strip-types qa/fixtures/src/ssi/validate-mt1-mt2-rule-table.ts --rules qa/fixtures/ssi/mt1-mt2/repair-rule-table.v1.json --oracle qa/fixtures/ssi/mt1-mt2/test-oracle.v1.json --out qa/fixtures/ssi/mt1-mt2/rule-table-validation.v1.json`

Expected: both commands exit `0`; every target group has exactly one disposition. Validator compares actual partition against the independently approved `expected-partition-manifest.v1.json` and reports `missing=0`, `extra=0`, `misclassified=0`; self-emitted sets are not sufficient. `Unknown=0`, `Multiple=0`, `DRAFT=0`, `BLOCKED=0`, `HOLD_DEPENDENCY=0` in the executable partition; every executable group's disposition is proven independent of pending upstream authority; disposition and token/row deltas reconcile exactly.

**Step 3: Obtain BA Maker, Independent BA and QA same-SHA verdicts**

Any content change creates a new SHA and invalidates previous verdicts.

**Step 4: Freeze artifacts and sidecars; commit only with explicit Product Owner authorization**

Do not implement Generator until `DRAFT=0` and `BLOCKED=0`.

### Task 3: Implement shared OO policies

**Files:**

- Create: `qa/fixtures/src/message-version-policy.ts`
- Create: `qa/fixtures/src/versioned-record-identity.ts`
- Create: `qa/fixtures/src/dataset-visibility-policy.ts`
- Create: `qa/fixtures/src/ssi/mt1-mt2-repair-planner.ts`
- Test: corresponding `*.test.ts` files

**Step 1: Write failing policy tests**

Cover eligible `.12 -> .08`, dual-token `REMOVE_SOURCE_TOKEN`, already-canonical `UNCHANGED`, immutable history, intentional negative preservation, OOS exclusion, deterministic IDs, lifecycle path, runtime-drift preservation and equal-rank ambiguity.

**Step 2: Run tests and observe failure**

Run: `node --experimental-strip-types --test qa/fixtures/src/message-version-policy.test.ts qa/fixtures/src/versioned-record-identity.test.ts qa/fixtures/src/dataset-visibility-policy.test.ts qa/fixtures/src/ssi/mt1-mt2-repair-planner.test.ts`

Expected: non-zero exit because the modules or required policy outcomes do not exist.

**Step 3: Implement minimal parameter-driven classes**

Reuse `CanonicalSeedRepository`, `VersionedMt347OverlayApplier` patterns and shared artifact/SHA writers. Do not duplicate RMA/SSI I/O logic.

**Step 4: Run tests; commit only with explicit Product Owner authorization**

Run the Step 2 command again.

Expected: exit `0`; all shared and SSI-specific policy tests PASS. The shared policy tests prove family/alias/target discrimination and never import RMA lifecycle, eligibility or audit policy.

### Task 4: Build deterministic Generator and Mapper

**Files:**

- Create: `qa/fixtures/src/ssi/mt1-mt2-demo.generator.ts`
- Create: `qa/fixtures/src/ssi/mt1-mt2-canonical-seed.mapper.ts`
- Test: corresponding `*.test.ts`
- Output: `qa/fixtures/ssi/mt1-mt2/generated/`

**Step 1: Write failing cardinality and isolation tests**

Assert exact BA-approved counts, OOS rows=0, Historical mutations=0, MT347 mutations=0 and non-target mutations=0.

**Step 2: Generate deterministic versioned identities**

Identity material must include dataset version, family, canonical group, profile, direction, currency, counterparty and dataset class. Random UUIDs are forbidden.

**Step 3: Map SSI and Applicability as one identity graph**

Every new Applicability ID and FK must point to the matching new SSI version. Never reuse Historical IDs.

**Step 4: Validate; commit only with explicit Product Owner authorization**

Run: `node --experimental-strip-types qa/fixtures/src/ssi/mt1-mt2-demo.generator.ts --rules qa/fixtures/ssi/mt1-mt2/repair-rule-table.v1.json --oracle qa/fixtures/ssi/mt1-mt2/test-oracle.v1.json --out qa/fixtures/ssi/mt1-mt2/generated/ssi-demo.mt1-mt2-pacs008-pacs009.sr2026.v1.candidate.json`

Run: `node --experimental-strip-types --test qa/fixtures/src/ssi/mt1-mt2-demo.generator.test.ts qa/fixtures/src/ssi/mt1-mt2-canonical-seed.mapper.test.ts`

Expected: both commands exit `0`; a second generation is byte-identical and has the same SHA; `CONVERT`, `REMOVE_SOURCE_TOKEN`, lifecycle and row-delta totals equal the approved Rule Table.

### Task 4A: Build the complete candidate canonical seed

**Files:**

- Create: `qa/fixtures/src/ssi/prepare-mt1-mt2-reload-source.ts`
- Test: `qa/fixtures/src/ssi/prepare-mt1-mt2-reload-source.test.ts`
- Create: `qa/fixtures/ssi/reload-test-data/ssi-demo.mt1-mt2.v1.candidate.canonical.seed.json`
- Create: `qa/fixtures/ssi/mt1-mt2/generated/candidate-seed-manifest.v1.json`

**Step 1: Write the failing complete-seed tests**

Run: `node --experimental-strip-types --test qa/fixtures/src/ssi/prepare-mt1-mt2-reload-source.test.ts`

Expected before implementation: non-zero exit. Tests require exact base/configured-seed identity, generated overlay identity, all fourteen preserved runtime rows, no duplicate IDs/FKs, full table coverage, candidate/approved path separation and approved path absence.

**Step 2: Build but do not publish the complete candidate**

Run: `node --experimental-strip-types qa/fixtures/src/ssi/prepare-mt1-mt2-reload-source.ts --mode build-candidate --base-configured-seed qa/fixtures/ssi/reload-test-data/ssi-demo.mt347-v1.1.approved.canonical.seed.json --generated-overlay qa/fixtures/ssi/mt1-mt2/generated/ssi-demo.mt1-mt2-pacs008-pacs009.sr2026.v1.candidate.json --preserve-runtime-rows qa/fixtures/ssi/mt1-mt2/runtime-drift-preservation.v1.json --candidate qa/fixtures/ssi/reload-test-data/ssi-demo.mt1-mt2.v1.candidate.canonical.seed.json --manifest qa/fixtures/ssi/mt1-mt2/generated/candidate-seed-manifest.v1.json`

Expected: exit `0`; output is a full canonical seed, not an overlay. Manifest records every input/output SHA and table count. Nothing is written to an approved path, configured Reload source or DB.

**Step 3: Re-run tests**

Expected: exit `0`; the candidate logical identity becomes the sole source for Task 5 and Gate 3 Preflight.

### Task 5: Execute zero-write API Dry Run

**Files:**

- Create: `qa/fixtures/src/ssi/mt1-mt2-api-dry-run.ts`
- Test: `qa/fixtures/src/ssi/mt1-mt2-api-dry-run.test.ts`
- Ephemeral DB: `qa/fixtures/ssi/mt1-mt2/generated/api-dry-run.isolated.sqlite`
- Input: `qa/fixtures/ssi/mt1-mt2/api-execution-contract-catalogue.v1.json`
- Output: `qa/fixtures/ssi/mt1-mt2/generated/api-dry-run.v1.json`

**Step 1: Write a failing stub-server integration test**

Prove Positive exact success, Negative exact failure, OOS not submitted and zero mutation requests. For every submitted Oracle row, assert the runner uses only that row's exact `ApiExecutionContract`: endpoint, method, request schema, request template and field binding. The test fails if the runner supplies a default, branches on message type, or reads an undeclared request fact.

**Step 2: Run against a candidate-backed isolated SSI API**

Run: `node --experimental-strip-types qa/fixtures/src/ssi/mt1-mt2-api-dry-run.ts --mode candidate-backed-isolated --candidate-seed qa/fixtures/ssi/reload-test-data/ssi-demo.mt1-mt2.v1.candidate.canonical.seed.json --manifest qa/fixtures/ssi/mt1-mt2/generated/candidate-seed-manifest.v1.json --oracle qa/fixtures/ssi/mt1-mt2/test-oracle.v1.json --api-contract-catalogue qa/fixtures/ssi/mt1-mt2/api-execution-contract-catalogue.v1.json --isolated-db qa/fixtures/ssi/mt1-mt2/generated/api-dry-run.isolated.sqlite --service-project ssi-service --service-port 3310 --base-url http://127.0.0.1:3310/api --out qa/fixtures/ssi/mt1-mt2/generated/api-dry-run.v1.json`

Run: `node --experimental-strip-types --test qa/fixtures/src/ssi/mt1-mt2-api-dry-run.test.ts`

Expected: both commands exit `0`. The runner materializes only the ephemeral DB from the full candidate seed, starts an isolated `ssi-service` child with `SSI_DATABASE_PATH` bound to that exact file and `SSI_SERVICE_PORT=3310`, records the child PID and bound port, waits for the child service to report that exact database snapshot identity, then executes API cases and terminates the child. Runtime DB and the port-4600 UI are never used. Every response evidence row binds child PID, bound port, candidate seed SHA, isolated DB logical SHA, Rule/Oracle SHA and Page Definition SHA. `databaseWrites=0`, before/after isolated snapshot identical, mismatch=0, exact stub calls match and OOS/Full-FIN rows are not submitted to SSI resolution. Runner-side access to the candidate file cannot substitute for server-reported snapshot identity.

**Step 3: Record unrelated existing errors separately**

Do not fix MT347, other SSI, RMA, Nostro or Entity data in this change package.

**Step 4: Freeze Dry Run evidence and SHA sidecar; commit only with explicit Product Owner authorization**

Gate 2 remains failed if any expected reason differs.

### Task 6: Run versioned-insert Preflight and rollback test

**Files:**

- Create: `qa/fixtures/src/ssi/mt1-mt2-reload-preflight.ts`
- Test: `qa/fixtures/src/ssi/mt1-mt2-reload-preflight.test.ts`
- Output: `qa/fixtures/ssi/mt1-mt2/generated/reload-preflight.v1.json`

**Step 1: Build an isolated DB from the frozen complete candidate seed**

No runtime DB access is allowed in this step.

Run: `node --experimental-strip-types qa/fixtures/src/ssi/mt1-mt2-reload-preflight.ts --source qa/fixtures/ssi/reload-test-data/ssi-demo.mt1-mt2.v1.candidate.canonical.seed.json --manifest qa/fixtures/ssi/mt1-mt2/generated/candidate-seed-manifest.v1.json --mode plan-only --out qa/fixtures/ssi/mt1-mt2/generated/reload-preflight.v1.json`

Expected: exit `0`; no runtime DB access and no DB write.

**Step 2: Apply the candidate twice**

Run: `node --experimental-strip-types --test qa/fixtures/src/ssi/mt1-mt2-reload-preflight.test.ts`

Expected: exit `0`; in an ephemeral SQLite copy only, first Apply matches approved SSI/Applicability and token deltas. The governed Reload service must compare configured-seed logical identity with the current DB identity before its destructive transaction: an identical identity returns `DEMO_DATA_ALREADY_CURRENT` before `BEGIN/DELETE/INSERT`. Second generation, preflight and Reload therefore yield physical `inserts=0`, `updates=0`, `deletes=0`, `tokenAdds=0`, `tokenRemovals=0`. Logical zero-delta alone is insufficient.

**Step 3: Verify visibility and non-target integrity**

Historical MT1/MT2/pacs records, the two REVOKED SSI rows, twelve runtime-only Applicability children, MT347 v1.1 and all Negative/OOS rows remain bit/logically unchanged. Only approved Positive rows become candidates according to the separately approved lifecycle/visibility oracle. Compare table-by-table row multisets, IDs, FKs, dataset visibility and non-target logical SHA.

**Step 4: Verify rollback and commit evidence**

Inject a failure after SSI insertion and before Applicability completion. Rollback must restore the exact before logical SHA and identical table-by-table row multiset; the evidence must identify table/row/field differences rather than only reporting a global hash.

### Task 6A: Obtain DBA data and performance review

**Files:**

- Create: `qa/fixtures/ssi/mt1-mt2/generated/dba-preflight.v1.json`
- Create: `qa/fixtures/src/ssi/mt1-mt2-dba-preflight.ts`
- Test: `qa/fixtures/src/ssi/mt1-mt2-dba-preflight.test.ts`

**Step 1: Run DB-side query-plan and latency tests on the identical isolated snapshot**

Run: `node --experimental-strip-types --test qa/fixtures/src/ssi/mt1-mt2-dba-preflight.test.ts`

Expected: exit `0`; query/filter/sort plans use the approved DB-side paths; WAL/lock behavior has no uncontrolled writer contention. The versioned performance profile uses at least 30 cold samples and 100 hot samples, reports p50/p95/max and maximum payload bytes, requires p95 <= 1 second, payload <= 512 KiB and p95 regression <= 10% against the latest accepted baseline SHA. Missing baseline, sample, percentile or threshold evidence is `NOT_EXECUTED/NOT_ACCEPTED`, never PASS.

**Step 2: Freeze the DBA verdict**

Run: `node --experimental-strip-types qa/fixtures/src/ssi/mt1-mt2-dba-preflight.ts --preflight qa/fixtures/ssi/mt1-mt2/generated/reload-preflight.v1.json --out qa/fixtures/ssi/mt1-mt2/generated/dba-preflight.v1.json`

Expected: exit `0`; `verdict=PASS`, snapshot SHA equals Gate 3, and table-by-table integrity assertions reconcile. Gate 4A remains closed until this evidence is approved.

### Task 7: Publish the already-preflighted Reload candidate only after Gate 4A

**Files:**

- Input: `qa/fixtures/ssi/reload-test-data/ssi-demo.mt1-mt2.v1.candidate.canonical.seed.json`
- Input: `qa/fixtures/ssi/mt1-mt2/generated/candidate-seed-manifest.v1.json`
- Publish after Gate 4A only: `qa/fixtures/ssi/reload-test-data/ssi-demo.mt1-mt2.v1.approved.canonical.seed.json`
- Use: `qa/fixtures/src/ssi/prepare-mt1-mt2-reload-source.ts`
- Test: `qa/fixtures/src/ssi/prepare-mt1-mt2-reload-source.test.ts`
- Modify: `.env.example`
- Modify: `apps/ssi-service/src/app/development-data-reload.service.ts`
- Repo archive index only: `docs/archive/ssi/mt1-mt2-reload-source-index.md`
- Repo-external superseded artifacts: `C:\Users\samfi\Downloads\outputs\qa-archived\ssi\mt1-mt2\`

**Step 1: Re-run Reload parity and publication-boundary tests**

Run: `node --experimental-strip-types --test qa/fixtures/src/ssi/prepare-mt1-mt2-reload-source.test.ts`

Expected: exit `0`. Candidate seed logical SHA equals the Gate 3 Preflight input/after-SHA, includes the exact fourteen-row preservation multiset, and the approved filename is absent before Gate 4A.

**Step 2: Stop and obtain explicit Gate 4A authorization, then publish from exact approved artifacts**

Run only after recorded Gate 4A approval: `node --experimental-strip-types qa/fixtures/src/ssi/prepare-mt1-mt2-reload-source.ts --candidate qa/fixtures/ssi/reload-test-data/ssi-demo.mt1-mt2.v1.candidate.canonical.seed.json --authorization qa/fixtures/ssi/mt1-mt2/gate-4a-authorization.v1.json --publish qa/fixtures/ssi/reload-test-data/ssi-demo.mt1-mt2.v1.approved.canonical.seed.json`

Expected: exit `0`; the published seed embeds Candidate, Rule Table, Oracle, Preflight, DBA and authorization SHA values and remains Development-only. Gate 4A authorizes publication only, never Reload execution.

**Step 3: Archive the previous Reload source without deletion**

Move superseded payload/evidence only to the repo-external `qa-archived/ssi/mt1-mt2/` directory; never track it in Git. Record `supersededBy`, source SHA, replacement SHA, external archive identity and date in `docs/archive/ssi/mt1-mt2-reload-source-index.md`. Do not create `qa/QA_ARCHIVE` or an in-repo `qa-archived` directory.

**Step 4: Verify publication without executing Reload**

Run: `node --experimental-strip-types --test qa/fixtures/src/ssi/prepare-mt1-mt2-reload-source.test.ts`

Expected: exit `0`; external archive directory and superseded artifact exist, archived SHA equals the index entry, replacement SHA equals the published artifact, and publication assertions PASS. DB opens/writes and Reload API calls observed by the test are zero. Missing external archive evidence keeps Gate 4A incomplete.

### Task 8: Request isolated Reload and Development Apply authorizations separately

**Files:**

- Create: `qa/fixtures/src/ssi/mt1-mt2-runtime-apply.ts`
- Test: `qa/fixtures/src/ssi/mt1-mt2-runtime-apply.test.ts`
- Output: `qa/fixtures/ssi/mt1-mt2/generated/runtime-apply.v1.json`
- Backup: `qa/fixtures/ssi/mt1-mt2/generated/backup/runtime-before-<logical-sha>.sqlite`
- Restore drill output: `qa/fixtures/ssi/mt1-mt2/generated/backup/restore-drill.v1.json`

**Step 1: Stop until Gate 4B isolated Reload authorization is recorded**

BA/QA approval, source publication and Preflight PASS do not authorize isolated Reload or Runtime DB writes.

**Step 2: After Gate 4B, execute Reload twice in an isolated DB**

Run only after recorded Gate 4B approval: `node --experimental-strip-types qa/fixtures/src/ssi/mt1-mt2-runtime-apply.ts --mode isolated-reload --seed qa/fixtures/ssi/reload-test-data/ssi-demo.mt1-mt2.v1.approved.canonical.seed.json --authorization qa/fixtures/ssi/mt1-mt2/gate-4b-authorization.v1.json --service apps/ssi-service/src/app/development-data-reload.service.ts --out qa/fixtures/ssi/mt1-mt2/generated/isolated-reload.v1.json`

Expected: exit `0`; both Reloads produce the same logical SHA and exact row/token counts; the second Reload returns `DEMO_DATA_ALREADY_CURRENT` before opening a write transaction and has physical zero writes; rollback/failure injection PASS. This mode uses the service against an explicitly supplied isolated DB path and must not call the Development Runtime endpoint.

**Step 3: Create and verify a SQLite-consistent recovery backup**

Run before requesting Gate 4C: `node --experimental-strip-types qa/fixtures/src/ssi/mt1-mt2-runtime-apply.ts --mode backup-verify --runtime-db ./data/ssi-demo.sqlite --expected-runtime-sha <GATE_4C_BEFORE_SHA> --backup-dir qa/fixtures/ssi/mt1-mt2/generated/backup --out qa/fixtures/ssi/mt1-mt2/generated/backup/backup-verify.v1.json`

Run: `node --experimental-strip-types qa/fixtures/src/ssi/mt1-mt2-runtime-apply.ts --mode restore-drill --backup-manifest qa/fixtures/ssi/mt1-mt2/generated/backup/backup-verify.v1.json --restore-target qa/fixtures/ssi/mt1-mt2/generated/backup/restore-drill.sqlite --out qa/fixtures/ssi/mt1-mt2/generated/backup/restore-drill.v1.json`

Expected: both commands exit `0`. Backup is created with SQLite's WAL-consistent backup API, never by copying only the main file. Backup logical SHA equals runtime before-SHA. The restore drill runs only against the isolated restore target after injected mid-transaction failure and proves identical table-by-table row multiset, IDs/FKs and logical SHA. Runtime restore remains a fail-only action requiring the recorded Gate 4C rollback condition.

The Runtime restore sequence, executable only after a Gate 4C invariant failure, is fixed:

1. Run `npm run dev:stop` and verify SSI service/BFF/UI ports are closed.
2. Run `node --experimental-strip-types qa/fixtures/src/ssi/mt1-mt2-runtime-apply.ts --mode assert-quiesced --runtime-db ./data/ssi-demo.sqlite --ports 3000,3100,4600 --out qa/fixtures/ssi/mt1-mt2/generated/backup/quiesce.v1.json`.
3. Run `node --experimental-strip-types qa/fixtures/src/ssi/mt1-mt2-runtime-apply.ts --mode runtime-restore --runtime-db ./data/ssi-demo.sqlite --quiesce-evidence qa/fixtures/ssi/mt1-mt2/generated/backup/quiesce.v1.json --backup-manifest qa/fixtures/ssi/mt1-mt2/generated/backup/backup-verify.v1.json --authorization qa/fixtures/ssi/mt1-mt2/gate-4c-authorization.v1.json --expected-restored-sha <GATE_4C_BEFORE_SHA> --out qa/fixtures/ssi/mt1-mt2/generated/backup/runtime-restore.v1.json`.
4. Restart with `npm run dev:all`, then execute read-only health and logical snapshot verification.

The restore tool must fail unless services are quiesced and all SQLite connections are closed. It acquires an exclusive restore lock, handles WAL/SHM through SQLite's WAL-aware backup/restore APIs, runs `integrity_check`, closes the restored DB before releasing the lock, and rejects stale quiesce/authorization/snapshot identities. Tests inject open connections, WAL content, lock contention, corrupt backup and restart failure.

Expected after restore: exit `0`; runtime DB logical SHA equals `<GATE_4C_BEFORE_SHA>`, table-by-table row multiset/IDs/FKs match the backup manifest, service startup/read-only health succeeds and no second restore is attempted. A snapshot-guard mismatch fails before replacing the runtime DB.

**Step 4: After isolated Reload PASS, stop again until separate Gate 4C authorization; then perform the uniquely named governed Runtime operation**

Run only after recorded Gate 4C approval: `node --experimental-strip-types qa/fixtures/src/ssi/mt1-mt2-runtime-apply.ts --mode development-runtime-apply --endpoint http://localhost:3100/api/settings/development-data/reload --seed qa/fixtures/ssi/reload-test-data/ssi-demo.mt1-mt2.v1.approved.canonical.seed.json --authorization qa/fixtures/ssi/mt1-mt2/gate-4c-authorization.v1.json --out qa/fixtures/ssi/mt1-mt2/generated/runtime-apply.v1.json`

Expected: exit `0`. The first explicitly authorized full Reload may physically delete/reinsert tables, but Historical, runtime-drift, MT347 and all other non-target IDs/payloads/FKs/lifecycles must remain logically and bit-content identical. `POST /api/settings/development-data/reload` is the sole governed Development Runtime operation; direct SQLite writing and any separate INSERT-only endpoint are prohibited. The endpoint accepts only the control password: before calling it, the tool must verify that the service-configured seed path and SHA equal the Gate 4C approved full seed; CLI `--seed` does not override runtime configuration. On any invariant failure, stop and execute the verified restore procedure.

**Step 5: Re-run the same Runtime operation for idempotency**

Expected: exit `0`; response is `DEMO_DATA_ALREADY_CURRENT`, no write transaction begins, and physical `inserts=0`, `updates=0`, `deletes=0`, `tokenAdds=0`, `tokenRemovals=0`.

### Task 9: BA/QA UI acceptance and closure

**Files:**

- Create: `qa/fixtures/ssi/mt1-mt2/ui-acceptance.v1.json`
- Create: `qa/fixtures/ssi/mt1-mt2/final-reconciliation.v1.md`
- Create: `qa/fixtures/src/ssi/mt1-mt2-browser-uat.ts`
- Test: `qa/fixtures/src/ssi/mt1-mt2-ui-reload.test.ts`

**Step 1: Test UI at `http://localhost:4600`**

Run: `npx nx test ssi-portal --configuration=ci --runInBand`

Expected: exit `0`. Verify SSI Add/Edit/Inquire/Suppress, Revise -> WIP, Save Draft, Submit/Checker, distinct Maker/Checker, `x`/Esc server-side WIP cancel, five-minute abandoned WIP expiry, DRAFT/PENDING_APPROVAL never expiring under WIP TTL, concurrency fail-closed, MT1/MT2 Page Parameters, OAS -> Page Parameters -> Generic UI lossless trace, canonical `.001.08` display/selection, Positive selection and exact Negative/OOS/Historical visibility sets. RMA UI and RMA mutation are outside this SSI package and may only run as an independent read-only regression.

Index regression is mandatory for RMA and SSI: true server-side page-by-page retrieval, DB-side filter/search and stable whitelisted `ORDER BY` with immutable unique-key tie-breaker; every sortable title supports mouse and keyboard ASC/DESC and correct `aria-sort`; no browser/BFF full-table fetch or current-page-only sort. Checker and Audit preserve the originating Index column names/order/search/sort contract and may only append Maker/Checker and their datetimes. Search and lookup results must remain exact across pages and Reload.

Run: `node --experimental-strip-types qa/fixtures/src/ssi/mt1-mt2-browser-uat.ts --base-url http://localhost:4600 --rules qa/fixtures/ssi/mt1-mt2/repair-rule-table.v1.json --oracle qa/fixtures/ssi/mt1-mt2/test-oracle.v1.json --out qa/fixtures/ssi/mt1-mt2/ui-acceptance.v1.json`

Expected: exit `0`; report binds exact code, UI build, OAS/Page Definition, Rule Table, Oracle, fixture, configured seed and DB logical snapshot SHAs. Denominator is every executable scenario × currency × enabled counterparty/receiver-account combination; PASS/FAIL/BLOCKED/NOT_EXECUTED are retained and no case is removed from the denominator.

**Step 2: Test Reload Test Data from UI**

Run only after Gate 4C for Development Runtime UI: `node --experimental-strip-types --test qa/fixtures/src/ssi/mt1-mt2-ui-reload.test.ts`

Expected: exit `0`; Runtime `POST /api/settings/development-data/reload` was never called during Gate 4B. After Gate 4C, UI Reload preserves the approved snapshot, lifecycle transitions, target counts, runtime-only drift and visibility policy; before/after Page Definition, fixture and DB snapshot identities are recorded.

**Step 3: Run full validation**

Run: `npm run verify`

Run: `npm audit`

Run: `npx nx run-many -t test --configuration=ci --runInBand`

Run: `npx nx run-many -t test --configuration=ci --coverage --runInBand`

Run: `npx nx run-many -t typecheck lint build`

Run: `rg -n "pacs\\.00[89]\\.001\\.(12|012)|\.001\.08|ACTIVE|DRAFT|approved\.canonical" qa/fixtures/src qa/fixtures/ssi apps/ssi-service apps/ssi-portal`

Run: `git diff --check`

Run: `node scripts/mt2-final-qa/sonar-current-analysis.mjs`

Expected: every command exits `0` except the hard-code scan, whose reviewed hits must exactly match the controlled parameter fixtures and frozen evidence list; no business conversion rule is hard-coded in application orchestration. Full dependency audit has Critical/High=0 and every Moderate has a recorded owner/disposition/due date. Same-code-SHA Sonar Server Quality Gate is mandatory: New Blocker/Critical/Major=0, New Minor<20, New Code Coverage>95%, New Code Duplication<1%. Sonar report/analysis ID, coverage and dependency-audit SHAs are added to the evidence bundle; unavailable or stale Sonar is `NOT_ACCEPTED`, never optional.

**Step 4: Freeze final evidence**

Record Oracle, Rule Table, Candidate, Reload source, code revision, Before/After DB and UI acceptance SHA values. Any later change requires a new version and re-review.

## 9. Closure criteria

The package may be sealed only when:

```text
BA Rule Table                       APPROVED, exact SHA
Independent BA review               PASS, same SHA
QA Oracle review                    PASS, same SHA
DRAFT                               0
BLOCKED                             0
Oracle mismatch                     0
Historical logical/content delta    0
MT347 logical/content delta         0
Non-target logical/content delta    0
OOS SSI rows                        0
ID collisions                       0
Second Apply                  0 / 0 / 0
Reload parity                      PASS
UI acceptance                      PASS
Rollback                           VERIFIED
Sonar Server Quality Gate          PASS
New Code Coverage                  >95%
New Code Duplication               <1%
Dependency Critical/High           0
RMA/SSI Index regression           PASS
Search/Lookup regression           PASS
```

This closes only the Development Demo Prototype MT1／MT2／pacs.008／pacs.009 package. It does not authorize UAT or Production use.
