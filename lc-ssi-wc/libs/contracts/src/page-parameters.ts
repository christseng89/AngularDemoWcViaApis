export const RESOLUTION_PAGE_SCHEMA_VERSION = "1.0" as const;

export type ResolutionPageSchemaVersion = typeof RESOLUTION_PAGE_SCHEMA_VERSION;

export type PageParameterPolarity = "POSITIVE" | "NEGATIVE" | "BOUNDARY";
export type PageParameterDirection = "INCOMING" | "OUTGOING";
export type PageParameterBusinessDomain =
  "TREASURY" | "TRADE_FINANCE" | "PAYMENT";
export type PageParameterHttpMethod = "POST";
export type PageParameterAction =
  "RESOLVE_SSI" | "VALIDATE_FIN" | "PREVIEW_REFERENCE";
export type PageParameterValidationOwner =
  "SSI_FIELD_RESOLUTION_API" | "UPSTREAM_FIN_VALIDATOR";
export type PageParameterRuleTaxonomy =
  "NOT_APPLICABLE" | "NETWORK_VALIDATED_RULE" | "FIELD_USAGE_RULE";
/** Determines whether an NVR is owned by SSI tag resolution or full FIN validation. */
export type PageParameterValidationScope =
  "IN_SCOPE_SSI_TAG_NVR" | "OUT_OF_SCOPE_FULL_FIN_NVR";
/** Canonical NVR result. `N_A` remains accepted only by legacy page contracts. */
export type PageParameterNvrOutcome = "PASS" | "FAIL" | "NOT_EVALUATED";
export type PageParameterCompatibleNvrOutcome = PageParameterNvrOutcome | "N_A";
export type PageParameterControlKind =
  "TEXT" | "DATE" | "SELECT" | "RADIO" | "CHECKBOX" | "HIDDEN";
export type PageParameterVisibility =
  "USER_INPUT" | "HIDDEN_EVIDENCE" | "TEST_ONLY";
export type PageParameterApplicability = "APPLICABLE" | "NOT_APPLICABLE";
export type PageParameterServicerRelationship =
  "SAME" | "DIFFERENT" | "NOT_APPLICABLE";
export type PageParameterInputOwnership =
  "TRANSACTION_USER" | "TRANSACTION_CONTEXT" | "SSI_DERIVED" | "SCENARIO_FIXED";
export type PageParameterProcessingPolicy = "APPLY" | "IGNORE_AUDIT";
export type PageParameterDataType =
  | "STRING"
  | "BOOLEAN"
  | "DATE"
  | "ISO_CURRENCY"
  | "SWIFT_BIC"
  | "SWIFT_PARTY_IDENTIFIER"
  | "ACCOUNT_REFERENCE";
export type PageParameterLookupProvider =
  "BANK_SERVICE" | "SSI_COUNTERPARTY" | "NOSTRO_ACCOUNT";
export type PageParameterLookupAction =
  "BANK_SERVICE" | "SSI_COUNTERPARTY" | "NOSTRO_ACCOUNT";

export interface PageParameterDependencyMetadata {
  readonly dependsOnFieldIds: readonly string[];
  readonly invalidatesFieldIds: readonly string[];
  readonly selectionPolicy: "SELECTABLE" | "SINGLE_VALUE_RESTRICTED";
  readonly restrictionMessage?: string;
}

export interface PageParameterLookupMetadata {
  readonly provider: PageParameterLookupProvider;
  readonly action: PageParameterLookupAction;
  readonly endpoint: string;
  readonly valueField: "bankServiceId" | "nostroId";
  readonly displayField: "bic" | "displayValue";
  readonly validationField: "bic" | "nostroId";
  /** Lookup values that atomically populate governed companion controls. */
  readonly companionValueFields?: Readonly<Record<"version", string>>;
  readonly targetRole?: string;
  readonly buttonLabel?: string;
  readonly selectedButtonLabel?: string;
  readonly emptyResultCode?: string;
  readonly dependency?: PageParameterDependencyMetadata;
}

export interface PageParameterSourceIdentity {
  readonly catalogueVersion: string;
  readonly sourceArtifactId: string;
  readonly sourceSha256: string;
  readonly snapshotId?: string;
  readonly snapshotIdentityMethod?: string;
}

export interface PageParameterProfile {
  readonly profileId: string;
  readonly profileKind:
    "MT_TO_MX" | "SSI_RESOLUTION_ONLY" | "FIN_REFERENCE_ONLY";
  readonly businessService?: string;
  readonly messageDefinitionId?: string;
  readonly paymentExecutable: boolean;
  readonly selectionBasis: {
    readonly businessScenarioId: string;
    readonly businessService?: string;
  };
}

export interface PageParameterDisplayIdentity {
  /** User-facing SWIFT family, for example MT3, MT4 or MT7. */
  readonly familyCode: string;
  readonly familyLabel: string;
  /** User-facing business category supplied by governance, never inferred by UI. */
  readonly categoryCode: string;
  readonly categoryLabel: string;
}

export interface PageParameterOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface PageParameterConstraint {
  readonly constraintId: string;
  readonly kind:
    | "REQUIRED"
    | "PATTERN"
    | "MIN_LENGTH"
    | "MAX_LENGTH"
    | "ONE_OF"
    | "DEPENDENCY";
  readonly message: string;
  readonly value?: string | number | boolean | readonly string[];
}

export interface PageParameterBusinessDateMetadata {
  readonly timeZone: string;
  readonly calendarMode: "BUSINESS_DAYS_ADD" | "WEEKDAY_FALLBACK";
  readonly calendarCode: string;
  readonly holidayIntegrationStatus:
    "NOT_EVALUATED" | "MOCK_REFERENCE" | "CONFIGURED";
  readonly sourceContract: {
    readonly method: "POST";
    readonly path: "/business-days/add";
    readonly endpointEnvironmentVariable: "BUSINESS_DAYS_SERVICE_ENDPOINT";
  };
}

export interface PageParameterField {
  readonly fieldId: string;
  readonly path: string;
  readonly label: string;
  readonly control: PageParameterControlKind;
  readonly dataType?: PageParameterDataType;
  readonly required: boolean;
  readonly readOnly?: boolean;
  readonly defaultValue?: string | boolean;
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly businessDate?: PageParameterBusinessDateMetadata;
  readonly displayOrder?: number;
  /** Server-governed grid placement; clients must not infer it from control type. */
  readonly columnSpan?: 1 | 2;
  readonly section?:
    "TRANSACTION" | "SETTLEMENT_INSTRUCTIONS" | "VALIDATION_CONTEXT";
  readonly visibility?: PageParameterVisibility;
  readonly options?: readonly PageParameterOption[];
  readonly lookup?: PageParameterLookupMetadata;
  readonly optionSource?: PageParameterDependencyMetadata & {
    readonly source:
      | "GOVERNED_APPLICABILITY"
      | "RESOLUTION_CURRENCY_COVERAGE"
      | "CONTROLLED_ENTITY_REFERENCE";
  };
  readonly constraints: readonly PageParameterConstraint[];
  readonly sequenceId?: string;
  readonly settlementLeg?: string;
  readonly swiftTag?: string;
  readonly swiftOption?: string;
  /** Official FIN role supplied by the governed mapping, never inferred by a client. */
  readonly officialRole?: string;
}

/** Scenario-specific policy kept independent from the reusable field presentation. */
export interface PageParameterScenarioFieldPolicy {
  readonly fieldId: string;
  readonly applicability: PageParameterApplicability;
  readonly inputOwnership: PageParameterInputOwnership;
  readonly visibility: PageParameterVisibility;
  readonly processingPolicy: PageParameterProcessingPolicy;
  readonly required: boolean;
  readonly readOnly: boolean;
}

export interface PageParameterSequence {
  readonly sequenceId: string;
  readonly label: string;
  readonly settlementLeg?: string;
  readonly fieldIds: readonly string[];
}

export interface PageParameterEvidenceReference {
  readonly evidenceId: string;
  readonly classification:
    "NORMATIVE_RULE" | "BA_RULING" | "QA_INVARIANT" | "PRODUCT_POLICY";
  readonly artifactId: string;
  readonly artifactSha256: string;
  readonly pages?: readonly number[];
  readonly ruleId?: string;
}

export interface PageParameterValidationRule {
  readonly ruleId: string;
  readonly taxonomy: PageParameterRuleTaxonomy;
  readonly owner: PageParameterValidationOwner;
  /** Required on newly emitted contracts; absent only on legacy schema 1.0 data. */
  readonly validationScope?: PageParameterValidationScope;
  readonly appliesToFieldIds: readonly string[];
  readonly reasonCode: string;
  readonly evidenceIds: readonly string[];
}

/**
 * A scenario can contain both SSI-owned tag NVRs and downstream full-FIN NVRs.
 * This disposition is deliberately independent from scenario execution.
 */
export interface PageParameterValidationDisposition {
  readonly validationScope: PageParameterValidationScope;
  readonly owner: PageParameterValidationOwner;
  readonly taxonomy: PageParameterRuleTaxonomy;
  readonly expectedOutcome: PageParameterNvrOutcome;
  readonly ruleIds: readonly string[];
}

export interface PageParameterFixtureBinding {
  readonly bindingId: string;
  readonly fixtureSet: string;
  readonly fixtureVersion: string;
  readonly sourceSha256: string;
  readonly isolation: "CANONICAL" | "TRANSACTIONAL_NEGATIVE" | "BOUNDARY";
}

export interface PageParameterExecution {
  readonly action: PageParameterAction;
  readonly owner: PageParameterValidationOwner;
  readonly endpoint: string;
  readonly method: PageParameterHttpMethod;
  readonly expectedHttp: readonly number[];
}

export interface ResolutionPageScenario {
  readonly scenarioId: string;
  readonly label: string;
  readonly polarity: PageParameterPolarity;
  readonly audience: "OPERATIONAL" | "QA_TEST_ONLY";
  readonly flowKind:
    | "CORE_SSI"
    | "TRANSACTION_CONTEXT"
    | "HYBRID"
    | "NO_ROUTE"
    | "NEGATIVE_BOUNDARY";
  /** Server-governed SSI-bank versus own-Nostro-servicer policy. */
  readonly servicerRelationship?: PageParameterServicerRelationship;
  readonly sequenceIds: readonly string[];
  readonly fieldIds: readonly string[];
  readonly fieldPolicies?: readonly PageParameterScenarioFieldPolicy[];
  readonly validationRuleIds: readonly string[];
  /** Validation ownership is independent from the SSI execution endpoint. */
  readonly validation: {
    /** Canonical validation model for newly emitted contracts. */
    readonly dispositions?: readonly PageParameterValidationDisposition[];
    /** @deprecated Read-only compatibility for legacy schema 1.0 contracts. */
    readonly owner: PageParameterValidationOwner;
    /** @deprecated Read-only compatibility for legacy schema 1.0 contracts. */
    readonly taxonomy: PageParameterRuleTaxonomy;
    /** @deprecated Use each disposition's expectedOutcome. */
    readonly nvrOutcome: PageParameterCompatibleNvrOutcome;
  };
  readonly fixture: PageParameterFixtureBinding;
  readonly execution: PageParameterExecution;
  /** Server-governed scenario defaults; clients may render them but cannot redefine them. */
  readonly inputValues?: Readonly<Record<string, string | boolean>>;
}

/**
 * Versioned API model consumed mechanically by the generic UI.
 * Business catalogues and decisions belong in the governed source, not Angular.
 */
export interface ResolutionPageDefinition {
  readonly schemaVersion: ResolutionPageSchemaVersion;
  readonly definitionId: string;
  readonly definitionVersion: string;
  readonly source: PageParameterSourceIdentity;
  readonly standardsRelease: string;
  readonly messageFamily: string;
  readonly messageType: string;
  readonly businessDomain: PageParameterBusinessDomain;
  readonly direction: PageParameterDirection;
  readonly businessFunction: string;
  readonly title: string;
  readonly description?: string;
  readonly display: PageParameterDisplayIdentity;
  readonly profile: PageParameterProfile;
  readonly sequences: readonly PageParameterSequence[];
  readonly fields: readonly PageParameterField[];
  readonly scenarios: readonly ResolutionPageScenario[];
  readonly validationRules: readonly PageParameterValidationRule[];
  readonly evidence: readonly PageParameterEvidenceReference[];
}

export interface ResolutionPageDefinitionQuery {
  readonly standardsRelease: string;
  readonly messageFamily: string;
  readonly messageType: string;
  readonly direction: PageParameterDirection;
  readonly businessScenarioId?: string;
  readonly businessService?: string;
  readonly businessDomain?: PageParameterBusinessDomain;
}

export interface ResolutionPageDefinitionEnvelope {
  readonly contract: ResolutionPageDefinition;
  readonly contractSha256: string;
}

export interface ResolutionPageDefinitionIndexItem {
  readonly definitionId: string;
  readonly definitionVersion: string;
  readonly contractSha256: string;
  readonly title: string;
  readonly businessDomain: PageParameterBusinessDomain;
  readonly transactionGroupId: string;
  readonly transactionGroupLabel: string;
  readonly transactionGroupOrder: number;
  readonly scenarioLabel: string;
  readonly scenarioDescription: string;
  readonly scenarioOrder: number;
  readonly transactionDescription: string;
  readonly scenarioSequence: string;
  readonly ssiScope: "IN_SCOPE" | "OUT_OF_SCOPE";
  readonly validationOwner: PageParameterValidationOwner;
  readonly status: "AVAILABLE" | "READ_ONLY_SCOPE_DECISION";
  readonly executable: boolean;
  readonly actionLabel: string;
  readonly swiftDescription: string;
  readonly messageCode: string;
  readonly inputFields: readonly string[];
  readonly profileSlots: readonly string[];
  readonly targetProfileSlots: readonly string[];
  readonly mappingStatus: "PROFILE_VERIFIED" | "OUT_OF_SCOPE";
  readonly processingStatus: "PROFILE_VERIFIED" | "READ_ONLY_SCOPE_DECISION";
  readonly originalOrder: number;
  readonly scenarioCount: number;
  readonly scenarioDetails: readonly {
    readonly scenarioId: string;
    readonly label: string;
    readonly sequence: string;
    readonly polarity: PageParameterPolarity;
    readonly audience: ResolutionPageScenario["audience"];
    readonly flowKind: ResolutionPageScenario["flowKind"];
    readonly executable: boolean;
  }[];
  readonly query: ResolutionPageDefinitionQuery;
}

export interface ResolutionPageDefinitionIndexEnvelope {
  readonly schemaVersion: ResolutionPageSchemaVersion;
  readonly indexVersion: string;
  readonly items: readonly ResolutionPageDefinitionIndexItem[];
  readonly pagination: {
    readonly mode: "PAGE_BY_PAGE";
    readonly defaultPageSize: number;
    readonly maxPageSize: number;
  };
  readonly diagnostics?: {
    readonly omittedZeroScenarioDefinitions: readonly string[];
    readonly signOffBlocked: boolean;
  };
}

export interface ResolutionPageSubmission {
  readonly definitionId: string;
  readonly definitionVersion: string;
  readonly scenarioId: string;
  readonly fixtureBindingId: string;
  readonly contractSha256: string;
  /** Opaque discovery identity; required for SSI-backed execution. */
  readonly eligibilitySnapshot?: PageParameterEligibilitySnapshot;
  /** Exact indivisible route chosen from the discovery response. */
  readonly selectedRouteIdentity?: PageParameterSelectedRouteIdentity;
  readonly values: Readonly<Record<string, string | boolean>>;
}

/** Server-owned COV context merged into a governed Payment page submission. */
export interface PaymentCoverScenarioFixedValues {
  readonly "context.swift21NONE": string;
  /** @deprecated New contracts derive 32A from typed date, currency and amount. */
  readonly "context.swift32A"?: string;
  readonly "context.swift119NONE": "COV";
  readonly "context.swift121NONE": string;
  readonly "context.sequenceB50A": string;
  readonly "context.sequenceB59": string;
  readonly "context.previousMessageType"?: string;
  readonly "context.previousMessage20"?: string;
  readonly "context.previousMessage21"?: string;
  readonly "context.previousMessage121"?: string;
  readonly "context.previousMessageA52"?: string;
  readonly "context.previousMessageA58"?: string;
  readonly "context.previousMessageSequenceB50A"?: string;
  readonly "context.previousMessageSequenceB59"?: string;
  readonly "context.previousMessageArtifactSha256"?: string;
  readonly "context.previousMessageArtifactVersion"?: string;
}

export interface PageParameterLookupResult {
  readonly provider: PageParameterLookupProvider;
  readonly action: PageParameterLookupAction;
  readonly bankServiceId?: string;
  readonly bic?: string;
  readonly nostroId?: string;
  readonly version?: number;
  readonly accountServicerBic?: string;
  readonly maskedAccountRef?: string;
  readonly displayValue: string;
  readonly bankName?: string;
  /** Present for SSI route choices; UI must retain it atomically with the display row. */
  readonly selectedRouteIdentity?: PageParameterSelectedRouteIdentity;
}

export interface PageParameterVersionedRecordIdentity {
  readonly id: string;
  readonly version: number;
}

export interface PageParameterSelectedRouteIdentity {
  readonly routeId: string;
  readonly definitionId: string;
  readonly definitionVersion: string;
  readonly fixtureBindingId: string;
  readonly contextSha256: string;
  readonly ssi: PageParameterVersionedRecordIdentity;
  readonly applicability: PageParameterVersionedRecordIdentity;
  readonly nostro: PageParameterVersionedRecordIdentity;
  readonly rma: PageParameterVersionedRecordIdentity;
}

export interface PageParameterEligibilitySnapshot {
  readonly snapshotId: string;
  readonly contextSha256: string;
  readonly snapshotIdentityMethod?: string;
}

export interface PageParameterLookupDefaultSelection {
  /** Stable value to assign; clients must not infer a default from item order. */
  readonly valueField: "bankServiceId" | "nostroId";
  readonly value: string;
  readonly reasonCode:
    "GOVERNED_CURRENCY_DEFAULT" | "GOVERNED_PRIORITY_DEFAULT";
  readonly dependency: {
    readonly fieldId: string;
    readonly value: string;
  };
  readonly companionValues?: Readonly<Record<"version", string | number>>;
}

export interface PageParameterLookupEnvelope {
  readonly provider: PageParameterLookupProvider;
  readonly action: PageParameterLookupAction;
  readonly items: readonly PageParameterLookupResult[];
  /** Required for SSI route discovery; non-route directory lookups may omit it. */
  readonly eligibilitySnapshot?: PageParameterEligibilitySnapshot;
  /** Absent means no automatic selection is authorised. */
  readonly defaultSelection?: PageParameterLookupDefaultSelection;
}

export type ResolutionPageExecutionOutcome =
  | "RESOLVED"
  | "NOT_REQUIRED"
  | "NO_ELIGIBLE_SSI"
  | "VALIDATION_REJECTED"
  | "REFERENCE_ONLY";

export interface ResolutionPageFieldResult {
  readonly fieldId: string;
  readonly sequenceId: string;
  readonly settlementLeg: string;
  readonly swiftTag: string;
  readonly swiftOption: string;
  readonly fieldName: string;
  readonly role: string;
  readonly outcome: ResolutionPageExecutionOutcome;
  readonly resolutionStatus:
    "RESOLVED" | "NOT_REQUIRED" | "NO_ELIGIBLE_SSI" | "N_A";
  readonly value?: string;
  readonly institution?: {
    readonly bankServiceId?: string;
    readonly bic: string;
    readonly name?: string;
  };
  readonly partyIdentifier?: string;
  readonly accountReference?: string;
  readonly reasonCode?: string;
  readonly provenance: {
    readonly catalogueVersion?: string;
    readonly sourceArtifactId?: string;
    readonly sourceArtifactHash?: string;
    readonly fieldProfileArtifactId?: string;
    readonly fieldProfileEvidencePages?: readonly number[];
    readonly source?: string;
    readonly sourceRecordId?: string;
    readonly ownerSide?: string;
    readonly version?: string;
    readonly canonicalRouteNodeId?: string;
  };
  readonly evidenceIds: readonly string[];
}

export interface ResolutionPageExecutionEvidence {
  readonly correlationId: string;
  readonly owner: PageParameterValidationOwner;
  readonly action: PageParameterAction;
  readonly executorIdentity: string;
  readonly requestSha256: string;
  readonly responseSha256: string;
  readonly ruleIds: readonly string[];
  /** Known scenario fields deliberately ignored under IGNORE_AUDIT. */
  readonly ignoredFieldIds?: readonly string[];
  readonly selectedSsi?: { readonly id: string; readonly version: number };
  readonly selectedApplicability?: {
    readonly id: string;
    readonly version: number;
  };
}

/**
 * One server-generated representation of the confirmed canonical resolution.
 * Clients may render this document but must not translate between formats.
 */
export interface ResolutionPageGeneratedOutput {
  readonly outputId: string;
  readonly format: "SWIFT_MT" | "ISO_20022";
  readonly label: string;
  readonly messageIdentity: string;
  readonly mediaType: "application/json";
  readonly document: Readonly<Record<string, unknown>>;
}

export interface ResolutionPageSettlementRoute {
  readonly routeBindingId: string;
  readonly counterparty: {
    readonly bankServiceId: string;
    readonly bic: string;
    readonly name?: string;
  };
  readonly ssi: { readonly id: string; readonly version: number };
  readonly applicability: { readonly id: string; readonly version: number };
  readonly nostro: { readonly id: string; readonly version: number };
  readonly rma: { readonly id: string; readonly version: number };
  readonly roles: readonly {
    readonly role: string;
    readonly owner: string;
    readonly recordId: string;
    readonly version: number;
  }[];
  readonly legs: readonly {
    readonly order: number;
    readonly relationship: "INDA" | "INGA" | "COVE";
    readonly role: string;
    readonly accountOwner: {
      readonly bankServiceId: string;
      readonly bic: string;
      readonly name?: string;
    };
    readonly accountServicer: {
      readonly bankServiceId: string;
      readonly bic: string;
      readonly name?: string;
    };
    readonly accountReference: string;
    readonly currency: string;
    readonly source: string;
    readonly sourceRecordId: string;
    readonly version: number;
  }[];
  readonly projections: readonly {
    readonly kind:
      "SETTLEMENT_RELATIONSHIP" | "SWIFT_MT_FIELD" | "ISO_20022_ELEMENT";
    readonly identifier: string;
    readonly option?: string;
    readonly label: string;
    readonly role: string;
    readonly value: string;
    readonly accountReference: string;
    readonly sourceRecordId: string;
    readonly version: number;
  }[];
}

export interface ResolutionPageExecutionResult {
  readonly definitionId: string;
  readonly definitionVersion: string;
  readonly scenarioId: string;
  readonly fixtureBindingId: string;
  readonly outcome: ResolutionPageExecutionOutcome;
  readonly reasonCode?: string;
  readonly payloadGenerated: boolean;
  readonly confirmedResolutionCreated: boolean;
  readonly repairQueueCreated: boolean;
  readonly nvrOutcome: PageParameterCompatibleNvrOutcome;
  /** Present for MT1/pacs.008 SSI-resolution-only responses. */
  readonly ssiApplicability?: "NOT_EVALUATED" | "REQUIRED" | "NOT_REQUIRED";
  /** Kept independent from applicability so REQUIRED is never mistaken for success. */
  readonly resolutionOutcome?:
    | "BILATERAL_RELATIONSHIP_CONFIRMED"
    | "ELIGIBLE_COMPLETE_ROUTE"
    | "NO_ELIGIBLE_SSI"
    | "AMBIGUOUS_ROUTE"
    | "STALE"
    | "INVALID_CONTEXT_TOPOLOGY"
    | "INVALID_UPSTREAM_CONTEXT"
    | "PROFILE_INCOMPLETE"
    | "UNSUPPORTED_DIRECTION"
    | "UNSUPPORTED_PROFILE";
  readonly routeBindingId?: string;
  /** Bank-controlled atomic route selected by SSI resolution; never customer CPI. */
  readonly settlementRoute?: ResolutionPageSettlementRoute;
  readonly fields: readonly ResolutionPageFieldResult[];
  readonly outputs: readonly ResolutionPageGeneratedOutput[];
  readonly evidence: ResolutionPageExecutionEvidence;
}
