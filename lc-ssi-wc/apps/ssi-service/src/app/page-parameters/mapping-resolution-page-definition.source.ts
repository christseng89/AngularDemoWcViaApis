import { Injectable, Optional } from "@nestjs/common";
import type {
  PageParameterBusinessDateMetadata,
  PageParameterBusinessDomain,
  PageParameterDisplayIdentity,
  PageParameterField,
  PageParameterScenarioFieldPolicy,
  PageParameterPolarity,
  PageParameterValidationRule,
  ResolutionPageDefinition,
  ResolutionPageDefinitionQuery,
} from "@ssi/contracts";
import {
  MappingCatalogueService,
  type LoadedCatalogue,
  type Mapping,
} from "../mapping-catalogue.service";
import type { ResolutionPageDefinitionSource } from "./resolution-page-definition.source";
import {
  FinControlledFixtureService,
  type FinControlledFixtureCandidate,
  type FinControlledFixtureIndexCurrency,
} from "../fin-controlled-fixture.service";
import {
  ResolutionPageScenarioCatalogueService,
  type ResolutionPageConfiguredScenario,
  type ResolutionPageScenarioCatalogue,
} from "./resolution-page-scenario-catalogue.service";
import { ResolutionPageFixtureManifestService } from "./resolution-page-fixture-manifest.service";
import { PageParameterBusinessDatePolicy } from "./page-parameter-business-date.policy";
import { ResolutionPageOasFieldPolicyService } from "./resolution-page-oas-field-policy.service";

const DEFAULT_RELEASE = "SR2026";
const SCHEMA_VERSION = "1.0" as const;
const SSI_EXECUTION_ENDPOINT = "/api/v1/resolution-page-definitions/execute";
interface GovernedDisplayIdentity {
  readonly businessDomain: PageParameterBusinessDomain;
  readonly display: PageParameterDisplayIdentity;
}

const displayIdentity = (messageType: string): GovernedDisplayIdentity => {
  const familyCode = messageType.slice(0, 3);
  if (familyCode === "MT3")
    return {
      businessDomain: "TREASURY",
      display: {
        familyCode,
        familyLabel: familyCode,
        categoryCode: "TREASURY",
        categoryLabel: "Treasury",
      },
    };
  if (familyCode === "MT4" || familyCode === "MT7")
    return {
      businessDomain: "TRADE_FINANCE",
      display: {
        familyCode,
        familyLabel: familyCode,
        categoryCode: "TRADE_FINANCE",
        categoryLabel: "Trade Finance",
      },
    };
  throw new Error("PAGE_DISPLAY_FAMILY_NOT_GOVERNED");
};

const token = (value: string): string =>
  value
    .trim()
    .replaceAll(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "");
const humanLabel = (value: string): string =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const withoutDefaultValue = (field: PageParameterField): PageParameterField => {
  const copy = { ...field };
  Reflect.deleteProperty(copy, "defaultValue");
  return copy;
};

const TRANSACTION_USER_FIELDS = new Set([
  "context.transactionReference",
  "context.currency",
  "context.counterpartyBankServiceId",
  "context.bookingEntity",
  "context.valueDate",
]);

const COUNTERPARTY_FIELD_ID = "context.counterpartyBankServiceId";

const withRenderedLookupDependencies = (
  fields: readonly PageParameterField[],
): readonly PageParameterField[] => {
  const roleBankServiceFieldIds = fields
    .filter(({ lookup }) => lookup?.targetRole)
    .map(({ fieldId }) => fieldId);
  return fields.map((field) => {
    if (field.fieldId === COUNTERPARTY_FIELD_ID && field.lookup?.dependency)
      return {
        ...field,
        lookup: {
          ...field.lookup,
          dependency: {
            ...field.lookup.dependency,
            invalidatesFieldIds: roleBankServiceFieldIds,
          },
        },
      };
    if (field.fieldId === "context.currency" && field.optionSource)
      return {
        ...field,
        optionSource: {
          ...field.optionSource,
          invalidatesFieldIds: [
            COUNTERPARTY_FIELD_ID,
            ...roleBankServiceFieldIds,
          ],
        },
      };
    return field;
  });
};

const isBeneficiaryRole = (field: PageParameterField): boolean =>
  ["BENEFICIARY_INSTITUTION", "BENEFICIARY_BANK"].includes(
    field.lookup?.targetRole ?? "",
  );

const fieldOwnership = (
  field: PageParameterField,
  messageType: string,
  oasFieldPolicies: ResolutionPageOasFieldPolicyService,
): PageParameterScenarioFieldPolicy["inputOwnership"] => {
  const oasPolicy = oasFieldPolicies.resolve(messageType, field);
  if (oasPolicy) return oasPolicy.inputOwnership;
  if (TRANSACTION_USER_FIELDS.has(field.fieldId)) return "TRANSACTION_USER";
  if (field.fieldId === "context.route") return "SCENARIO_FIXED";
  if (
    field.path.startsWith("rolePartyIdentifiers.") ||
    field.path.startsWith("roleAccountReferences.")
  )
    return "SSI_DERIVED";
  if (field.lookup?.targetRole)
    return isBeneficiaryRole(field) ? "TRANSACTION_USER" : "SSI_DERIVED";
  if (field.swiftTag || field.visibility === "TEST_ONLY")
    return "SCENARIO_FIXED";
  return "TRANSACTION_USER";
};

const configuredFieldOwnership = (
  field: PageParameterField,
  supplied: boolean,
  suppliedLegacyPartyIdentifier: boolean,
  messageType: string,
  oasFieldPolicies: ResolutionPageOasFieldPolicyService,
): PageParameterScenarioFieldPolicy["inputOwnership"] => {
  const oasPolicy = oasFieldPolicies.resolve(messageType, field);
  if (oasPolicy) return oasPolicy.inputOwnership;
  if (supplied && field.path.startsWith("roleAccountReferences."))
    return "SCENARIO_FIXED";
  if (
    supplied &&
    (Boolean(field.lookup?.targetRole) || suppliedLegacyPartyIdentifier)
  )
    return "TRANSACTION_USER";
  return fieldOwnership(field, messageType, oasFieldPolicies);
};

const fieldApplicability = (
  field: PageParameterField,
  supplied: boolean,
  governedApplicable: boolean | undefined,
): PageParameterScenarioFieldPolicy["applicability"] => {
  const conditional =
    Boolean(field.lookup?.targetRole) ||
    field.path.startsWith("rolePartyIdentifiers.") ||
    field.path.startsWith("roleAccountReferences.") ||
    field.visibility === "TEST_ONLY";
  return conditional && !supplied && !governedApplicable
    ? "NOT_APPLICABLE"
    : "APPLICABLE";
};

const scenarioFieldPolicies = (
  fields: readonly PageParameterField[],
  inputValues: Readonly<Record<string, string | boolean>>,
  polarity: PageParameterPolarity,
  messageType: string,
  scenarioId: string,
  oasFieldPolicies: ResolutionPageOasFieldPolicyService,
): readonly PageParameterScenarioFieldPolicy[] =>
  fields.map((field) => {
    const supplied = Object.hasOwn(inputValues, field.fieldId);
    const suppliedLegacyPartyIdentifier =
      supplied &&
      field.path.startsWith("rolePartyIdentifiers.") &&
      field.fieldId === "context.senders_correspondentPartyIdentifier";
    const oasScenario = oasFieldPolicies.scenarioApplicability(
      messageType,
      field,
      scenarioId,
    );
    const inputOwnership = configuredFieldOwnership(
      field,
      supplied,
      suppliedLegacyPartyIdentifier,
      messageType,
      oasFieldPolicies,
    );
    const applicability = fieldApplicability(
      field,
      supplied,
      oasScenario?.applicable,
    );
    const processingPolicy =
      applicability === "NOT_APPLICABLE"
        ? ("IGNORE_AUDIT" as const)
        : ("APPLY" as const);
    const visibility =
      applicability === "NOT_APPLICABLE" ||
      inputOwnership !== "TRANSACTION_USER"
        ? ("HIDDEN_EVIDENCE" as const)
        : ("USER_INPUT" as const);
    const required =
      applicability === "APPLICABLE" &&
      inputOwnership === "TRANSACTION_USER" &&
      (oasScenario?.required ||
        field.required ||
        (polarity === "POSITIVE" && supplied && isBeneficiaryRole(field)));
    return {
      fieldId: field.fieldId,
      applicability,
      inputOwnership,
      visibility,
      processingPolicy,
      required,
      readOnly:
        inputOwnership !== "TRANSACTION_USER" ||
        applicability === "NOT_APPLICABLE",
    };
  });

const userAndFixedInputValues = (
  inputValues: Readonly<Record<string, string | boolean>>,
  policies: readonly PageParameterScenarioFieldPolicy[],
): Readonly<Record<string, string | boolean>> => {
  const allowed = new Set(
    policies
      .filter(
        ({ applicability, inputOwnership }) =>
          applicability === "APPLICABLE" && inputOwnership !== "SSI_DERIVED",
      )
      .map(({ fieldId }) => fieldId),
  );
  return Object.fromEntries(
    Object.entries(inputValues).filter(([fieldId]) => allowed.has(fieldId)),
  );
};

const scenarioId = (mapping: Readonly<Mapping>): string =>
  mapping.pageProfileId ??
  [
    mapping.messageType,
    mapping.businessFunction,
    mapping.sequence ?? "MESSAGE",
    mapping.settlementLeg ?? "MESSAGE",
  ]
    .map(token)
    .join("-");

const relevant = (mapping: Readonly<Mapping>): boolean =>
  mapping.direction === "OUTGOING" &&
  mapping.evidenceStatus === "FIELD_PROFILE_PROVEN" &&
  mapping.scopeStatus === "SSI_SUPPORTED" &&
  mapping.reusableCandidate &&
  /^MT[347]\d{2}$/.test(mapping.messageType) &&
  Boolean(mapping.tag && mapping.option && mapping.officialFieldName);

const sameProfile = (
  left: Readonly<Mapping>,
  right: Readonly<Mapping>,
): boolean =>
  left.messageType === right.messageType &&
  left.businessFunction === right.businessFunction &&
  scenarioId(left) === scenarioId(right) &&
  (left.sequence ?? "MESSAGE") === (right.sequence ?? "MESSAGE") &&
  (left.settlementLeg ?? "MESSAGE") === (right.settlementLeg ?? "MESSAGE");

const CONTEXT_FIELDS: readonly PageParameterField[] = [
  {
    fieldId: "context.transactionReference",
    path: "context.transactionReference",
    label: "Transaction Reference",
    control: "TEXT",
    dataType: "STRING",
    required: true,
    defaultValue: "MT347-DEMO-REFERENCE",
    displayOrder: 10,
    section: "TRANSACTION",
    visibility: "USER_INPUT",
    constraints: [
      {
        constraintId: "TRANSACTION_REFERENCE_REQUIRED",
        kind: "REQUIRED",
        message: "Transaction reference is required.",
      },
    ],
  },
  {
    fieldId: "context.currency",
    path: "context.currency",
    label: "Currency",
    control: "SELECT",
    dataType: "ISO_CURRENCY",
    required: true,
    defaultValue: "USD",
    displayOrder: 20,
    section: "TRANSACTION",
    visibility: "USER_INPUT",
    helpText:
      "Choose a currency supported by this governed scenario. Booking entity and value date are applied when SSI counterparties are resolved.",
    optionSource: {
      source: "GOVERNED_APPLICABILITY",
      dependsOnFieldIds: [],
      invalidatesFieldIds: [COUNTERPARTY_FIELD_ID],
      selectionPolicy: "SELECTABLE",
    },
    constraints: [
      {
        constraintId: "CURRENCY_PATTERN",
        kind: "PATTERN",
        message: "Use an ISO 4217 alphabetic currency code.",
        value: "^[A-Z]{3}$",
      },
    ],
  },
  {
    fieldId: "context.counterpartyBankServiceId",
    path: "transactionContext.counterpartyBankServiceId",
    label: "Counterparty Bank",
    helpText:
      "Select the governed message/deal counterparty used to resolve SSI. This is not FIN field 57a.",
    control: "SELECT",
    dataType: "SWIFT_BIC",
    required: true,
    displayOrder: 50,
    section: "TRANSACTION",
    visibility: "USER_INPUT",
    constraints: [
      {
        constraintId: "COUNTERPARTY-BANK-SERVICE-KNOWN",
        kind: "DEPENDENCY",
        message: "Select a governed Counterparty Bank Service identity.",
        value: "BANK_SERVICE",
      },
    ],
    lookup: {
      provider: "SSI_COUNTERPARTY",
      action: "SSI_COUNTERPARTY",
      endpoint:
        "/api/v1/resolution-page-definitions/lookups/ssi-counterparties",
      valueField: "bankServiceId",
      displayField: "bic",
      validationField: "bic",
      buttonLabel: "Select from SSI",
      selectedButtonLabel: "Change",
      emptyResultCode: "NO_VALID_SSI_COUNTERPARTY",
      dependency: {
        dependsOnFieldIds: [
          "context.currency",
          "context.bookingEntity",
          "context.valueDate",
        ],
        invalidatesFieldIds: [],
        selectionPolicy: "SELECTABLE",
      },
    },
  },
  {
    fieldId: "context.bookingEntity",
    path: "context.bookingEntity",
    label: "Booking Entity",
    control: "SELECT",
    dataType: "STRING",
    required: true,
    defaultValue: "HK01",
    options: [{ value: "HK01", label: "HK01 — Hong Kong Branch" }],
    displayOrder: 30,
    section: "TRANSACTION",
    visibility: "USER_INPUT",
    constraints: [
      {
        constraintId: "BOOKING_ENTITY_REQUIRED",
        kind: "REQUIRED",
        message: "Booking entity is required.",
      },
    ],
  },
  {
    fieldId: "context.valueDate",
    path: "context.valueDate",
    label: "Value Date",
    control: "DATE",
    dataType: "DATE",
    required: true,
    helpText:
      "Defaults to the first available local weekday from today. Weekend-only calendar is active; authoritative holiday calendar is not evaluated until one is injected. Changing the date invalidates the selected counterparty and downstream SSI route.",
    displayOrder: 40,
    section: "TRANSACTION",
    visibility: "USER_INPUT",
    constraints: [
      {
        constraintId: "VALUE_DATE_REQUIRED",
        kind: "REQUIRED",
        message: "Value date is required.",
      },
    ],
  },
];

const bankServiceField = (
  fieldId: string,
  variants: readonly Readonly<Mapping>[],
): PageParameterField | undefined => {
  const bicVariant = variants.find(({ option }) => option === "A");
  const swiftTag = bicVariant?.tag;
  if (!bicVariant || !swiftTag || !/^5[3-8]$/.test(swiftTag)) return undefined;
  return {
    fieldId: `${fieldId}.bankServiceId`,
    path: `roleBankServiceIds.${bicVariant.canonicalRole}`,
    label: humanLabel(bicVariant.officialRole ?? bicVariant.canonicalRole),
    helpText:
      "Choose a governed Bank Service. The stable ID is submitted; its BIC is displayed.",
    control: "SELECT",
    dataType: "SWIFT_BIC",
    required: false,
    constraints: [
      {
        constraintId: `BANK-SERVICE-${token(fieldId)}-KNOWN`,
        kind: "DEPENDENCY",
        message:
          "Select a governed Bank Service identity; free-text BIC input is not accepted.",
        value: "BANK_SERVICE",
      },
    ],
    lookup: {
      provider: "BANK_SERVICE",
      action: "BANK_SERVICE",
      endpoint: "/api/v1/resolution-page-definitions/lookups/bank-services",
      valueField: "bankServiceId",
      displayField: "bic",
      validationField: "bic",
      targetRole: bicVariant.canonicalRole,
    },
    sequenceId: bicVariant.sequence ?? "MESSAGE",
    ...(bicVariant.settlementLeg
      ? { settlementLeg: bicVariant.settlementLeg }
      : {}),
    swiftTag,
    swiftOption: "A",
    officialRole: bicVariant.officialRole ?? bicVariant.canonicalRole,
    displayOrder: 100 + Number(bicVariant.tag),
    section: "SETTLEMENT_INSTRUCTIONS",
    visibility: "HIDDEN_EVIDENCE",
    readOnly: true,
  };
};

const contextFieldsFor = (
  defaultValueDate: string,
  businessDate: PageParameterBusinessDateMetadata,
): readonly PageParameterField[] =>
  CONTEXT_FIELDS.map((field) =>
    field.fieldId === "context.valueDate"
      ? { ...field, defaultValue: defaultValueDate, businessDate }
      : field,
  );

const fieldsFor = (
  mappings: readonly Readonly<Mapping>[],
  defaultValueDate: string,
  businessDate: PageParameterBusinessDateMetadata,
): PageParameterField[] => {
  const byTag = new Map<string, Readonly<Mapping>[]>();
  for (const mapping of mappings) {
    const key = `${mapping.sequence ?? "MESSAGE"}.${mapping.tag}`;
    byTag.set(key, [...(byTag.get(key) ?? []), mapping]);
  }
  const governed = [...byTag.entries()]
    .filter(([fieldId, variants]) => !bankServiceField(fieldId, variants))
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([fieldId, variants]) => governedOptionField(fieldId, variants));
  const bankServices = [...byTag.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([fieldId, variants]) => {
      const field = bankServiceField(fieldId, variants);
      return field ? [field] : [];
    });
  return [
    ...contextFieldsFor(defaultValueDate, businessDate),
    ...governed,
    ...bankServices,
  ];
};

const governedOptionField = (
  fieldId: string,
  variants: readonly Readonly<Mapping>[],
): PageParameterField[] => {
  const first = variants[0];
  if (!first?.tag || !first.officialFieldName) return [];
  const options = variants
    .flatMap(({ option }) => (option ? [option] : []))
    .filter((option, index, values) => values.indexOf(option) === index)
    .sort((left, right) => left.localeCompare(right))
    .map((option) => ({ value: option, label: `Option ${option}` }));
  return [
    {
      fieldId,
      path: `fieldOptions.${first.tag}`,
      label: first.officialFieldName,
      helpText: `Governed FIN field ${first.tag} (${first.officialRole ?? first.canonicalRole}); allowed options come from the SR2026 profile.`,
      control: "SELECT",
      dataType: "STRING",
      required: first.presence === "MANDATORY",
      options,
      constraints: [],
      sequenceId: first.sequence ?? "MESSAGE",
      ...(first.settlementLeg ? { settlementLeg: first.settlementLeg } : {}),
      swiftTag: first.tag,
      officialRole: first.officialRole ?? first.canonicalRole,
      displayOrder: 100 + Number(first.tag),
      section: "SETTLEMENT_INSTRUCTIONS",
      visibility: "USER_INPUT",
    },
  ];
};

const rulesFor = (
  mappings: readonly Readonly<Mapping>[],
  fields: readonly PageParameterField[],
): PageParameterValidationRule[] =>
  fields.map((field) => {
    const variants = mappings.filter(
      (mapping) => mapping.tag === field.swiftTag,
    );
    if (!field.swiftTag)
      return {
        ruleId: `RULE-CONTEXT-${token(field.fieldId)}`,
        taxonomy: "NOT_APPLICABLE",
        owner: "SSI_FIELD_RESOLUTION_API",
        appliesToFieldIds: [field.fieldId],
        reasonCode: "CONTROLLED_EXECUTION_CONTEXT",
        evidenceIds: ["EVIDENCE-MAPPING-CATALOGUE"],
      };
    const nvr = variants.flatMap((mapping) => mapping.nvrRefs ?? []);
    return {
      ruleId: `RULE-${token(mappings[0]!.messageType)}-${token(field.fieldId)}`,
      taxonomy: nvr.length ? "NETWORK_VALIDATED_RULE" : "FIELD_USAGE_RULE",
      owner: "SSI_FIELD_RESOLUTION_API",
      appliesToFieldIds: [field.fieldId],
      reasonCode: nvr.length ? `NVR_${nvr.join("_")}` : "GOVERNED_FIELD_USAGE",
      evidenceIds: ["EVIDENCE-MAPPING-CATALOGUE"],
    };
  });

const definitionFor = (
  catalogue: LoadedCatalogue,
  mappings: readonly Readonly<Mapping>[],
  defaultValueDate: string,
  businessDate: PageParameterBusinessDateMetadata,
  fixtureCandidates: readonly FinControlledFixtureCandidate[] = [],
): ResolutionPageDefinition => {
  const first = mappings[0]!;
  const display = displayIdentity(first.messageType);
  const scenario = scenarioId(first);
  const sequence = first.sequence ?? "MESSAGE";
  const fields = fieldsFor(mappings, defaultValueDate, businessDate);
  const rules = rulesFor(mappings, fields);
  const matchingFixtures = fixtureCandidates.filter(
    (candidate) =>
      candidate.messageType === first.messageType &&
      candidate.businessFunction === first.businessFunction &&
      candidate.sequence === sequence &&
      candidate.settlementLeg === (first.settlementLeg ?? sequence),
  );
  const scenarios = matchingFixtures.length
    ? matchingFixtures.map((candidate, index) => ({
        scenarioId:
          index === 0 ? scenario : `${scenario}-${token(candidate.bindingId)}`,
        label: `${first.settlementLeg ?? first.businessFunction} — ${candidate.bindingId}`,
        polarity: "POSITIVE" as const,
        audience: "OPERATIONAL" as const,
        flowKind: "CORE_SSI" as const,
        sequenceIds: [sequence],
        fieldIds: fields.map(({ fieldId }) => fieldId),
        validationRuleIds: rules
          .filter(({ owner }) => owner === "SSI_FIELD_RESOLUTION_API")
          .map(({ ruleId }) => ruleId),
        validation: {
          owner: "SSI_FIELD_RESOLUTION_API" as const,
          taxonomy: "FIELD_USAGE_RULE" as const,
          nvrOutcome: "N_A" as const,
        },
        fixture: {
          bindingId: candidate.bindingId,
          fixtureSet: "MT347-SR2026-SSI",
          fixtureVersion: catalogue.catalogueVersion,
          sourceSha256: catalogue.sourceArtifactHash,
          isolation: "CANONICAL" as const,
        },
        execution: {
          action: "RESOLVE_SSI" as const,
          owner: "SSI_FIELD_RESOLUTION_API" as const,
          endpoint: SSI_EXECUTION_ENDPOINT,
          method: "POST" as const,
          expectedHttp: [200, 409, 422, 500],
        },
      }))
    : undefined;
  return {
    schemaVersion: SCHEMA_VERSION,
    definitionId: `PAGE-${scenario}`,
    definitionVersion: catalogue.catalogueVersion,
    source: {
      catalogueVersion: catalogue.catalogueVersion,
      sourceArtifactId: catalogue.sourceArtifactId,
      sourceSha256: catalogue.sourceArtifactHash,
    },
    standardsRelease: catalogue.standardsRelease,
    messageFamily: "MT347",
    messageType: first.messageType,
    businessDomain: display.businessDomain,
    direction: "OUTGOING",
    businessFunction: first.businessFunction,
    title: `${first.messageType} ${first.settlementLeg ?? first.businessFunction}`,
    description: "Server-governed FIN SSI reference parameters.",
    display: display.display,
    profile: {
      profileId:
        first.pageProfileId ?? `FIN-${catalogue.standardsRelease}-REFERENCE`,
      profileKind: "FIN_REFERENCE_ONLY",
      paymentExecutable: false,
      selectionBasis: {
        businessScenarioId: scenario,
      },
    },
    sequences: [
      {
        sequenceId: sequence,
        label: first.settlementLeg ?? sequence,
        ...(first.settlementLeg ? { settlementLeg: first.settlementLeg } : {}),
        fieldIds: fields.map(({ fieldId }) => fieldId),
      },
    ],
    fields,
    scenarios: scenarios ?? [
      {
        scenarioId: scenario,
        label: first.settlementLeg ?? first.businessFunction,
        polarity: "POSITIVE",
        audience: "OPERATIONAL",
        flowKind: "CORE_SSI",
        sequenceIds: [sequence],
        fieldIds: fields.map(({ fieldId }) => fieldId),
        validationRuleIds: rules.map(({ ruleId }) => ruleId),
        validation: {
          owner: "SSI_FIELD_RESOLUTION_API",
          taxonomy: "FIELD_USAGE_RULE",
          nvrOutcome: "N_A",
        },
        fixture: {
          bindingId: `CONTROLLED-${scenario}`,
          fixtureSet: "MT347-SR2026-SSI",
          fixtureVersion: catalogue.catalogueVersion,
          sourceSha256: catalogue.sourceArtifactHash,
          isolation: "CANONICAL",
        },
        execution: {
          action: "RESOLVE_SSI",
          owner: "SSI_FIELD_RESOLUTION_API",
          endpoint: SSI_EXECUTION_ENDPOINT,
          method: "POST",
          expectedHttp: [200, 409, 422, 500],
        },
      },
    ],
    validationRules: rules,
    evidence: [
      {
        evidenceId: "EVIDENCE-MAPPING-CATALOGUE",
        classification: "QA_INVARIANT",
        artifactId: catalogue.sourceArtifactId,
        artifactSha256: catalogue.sourceArtifactHash,
      },
    ],
  };
};

@Injectable()
export class MappingResolutionPageDefinitionSource implements ResolutionPageDefinitionSource {
  private readonly oasFieldPolicies: ResolutionPageOasFieldPolicyService;

  constructor(
    private readonly catalogues: MappingCatalogueService,
    @Optional() private readonly fixtures?: FinControlledFixtureService,
    @Optional()
    private readonly scenarioCatalogue?: ResolutionPageScenarioCatalogueService,
    @Optional()
    private readonly fixtureManifest?: ResolutionPageFixtureManifestService,
    @Optional()
    private readonly businessDates?: PageParameterBusinessDatePolicy,
    @Optional() oasFieldPolicies?: ResolutionPageOasFieldPolicyService,
  ) {
    this.oasFieldPolicies =
      oasFieldPolicies ?? new ResolutionPageOasFieldPolicyService();
  }

  all(standardsRelease = DEFAULT_RELEASE): readonly ResolutionPageDefinition[] {
    const catalogue = this.catalogues.get(standardsRelease);
    const mappings = catalogue.mappings.filter(relevant);
    const configured = this.scenarioCatalogue?.get();
    const businessDatePolicy =
      this.businessDates ?? new PageParameterBusinessDatePolicy();
    const defaultValueDate = businessDatePolicy.firstAvailableDate();
    const businessDate = businessDatePolicy.metadata();
    const representatives = mappings.filter(
      (mapping, index) =>
        mappings.findIndex((candidate) => sameProfile(candidate, mapping)) ===
        index,
    );
    const fullyConfigured =
      configured &&
      this.fixtureManifest &&
      this.fixtures?.indexCurrencyProjection &&
      representatives.every((mapping) =>
        configured.definitions.some(
          (profile) =>
            profile.messageType === mapping.messageType &&
            profile.sequence === (mapping.sequence ?? "MESSAGE") &&
            profile.settlementLeg ===
              (mapping.settlementLeg ?? mapping.sequence ?? "MESSAGE") &&
            configured.scenarios.some(
              (scenario) => scenario.profileId === profile.profileId,
            ),
        ),
      );
    const fixtureCandidates = fullyConfigured
      ? []
      : configured && this.fixtureManifest && this.fixtures?.indexCatalogue
        ? this.fixtures.indexCatalogue()
        : (this.fixtures?.catalogue() ?? []);
    const indexCurrencies = fullyConfigured
      ? this.fixtures!.indexCurrencyProjection()
      : fixtureCandidates;
    const generated = representatives
      .map((representative) =>
        definitionFor(
          catalogue,
          mappings.filter((mapping) => sameProfile(mapping, representative)),
          defaultValueDate,
          businessDate,
          fixtureCandidates,
        ),
      )
      .sort((left, right) =>
        left.definitionId.localeCompare(right.definitionId),
      );
    if (!configured || !this.fixtureManifest) return generated;
    return this.configureGeneratedDefinitions(
      generated,
      configured,
      indexCurrencies,
      defaultValueDate,
      businessDate,
      this.fixtureManifest,
    );
  }

  private configureGeneratedDefinitions(
    generated: readonly ResolutionPageDefinition[],
    configured: ResolutionPageScenarioCatalogue,
    fixtureCandidates: readonly FinControlledFixtureIndexCurrency[],
    defaultValueDate: string,
    businessDate: ReturnType<PageParameterBusinessDatePolicy["metadata"]>,
    fixtureManifest: ResolutionPageFixtureManifestService,
  ): readonly ResolutionPageDefinition[] {
    return generated
      .map((definition) => {
        const sequence = definition.sequences[0]?.sequenceId ?? "MESSAGE";
        const settlementLeg =
          definition.sequences[0]?.settlementLeg ?? sequence;
        const profile = configured.definitions.find(
          (candidate) =>
            candidate.messageType === definition.messageType &&
            candidate.sequence === sequence &&
            candidate.settlementLeg === settlementLeg,
        );
        if (!profile) return definition;
        const roleFieldByConfiguredId =
          this.roleFieldByConfiguredId(definition);
        const configuredProfileFields = configured.inputs
          .filter(({ profileId }) => profileId === profile.profileId)
          .map(({ field }) => field);
        const configuredScenarios = configured.scenarios.filter(
          ({ profileId }) => profile.profileId === profileId,
        );
        const primaryScenario = configuredScenarios[0];
        if (!primaryScenario) return definition;
        const extraFields = this.configuredExtraFields(
          definition,
          configuredProfileFields,
          roleFieldByConfiguredId,
        );
        const currencyValues = this.currencyValues(
          definition,
          sequence,
          settlementLeg,
          configuredProfileFields,
          configuredScenarios,
          fixtureCandidates,
        );
        const fields = this.configuredFields(
          definition,
          extraFields,
          currencyValues,
        );
        const validationRules = this.configuredValidationRules(
          definition,
          extraFields,
          configured,
          configuredScenarios,
        );
        return {
          ...definition,
          definitionVersion: configured.catalogueVersion,
          source: {
            catalogueVersion: configured.catalogueVersion,
            sourceArtifactId: configured.sourceArtifactId,
            sourceSha256: configured.sourceArtifactSha256,
          },
          fields,
          sequences: definition.sequences.map((sequence) => ({
            ...sequence,
            fieldIds: fields
              .filter(
                (field) =>
                  !field.sequenceId || field.sequenceId === sequence.sequenceId,
              )
              .map(({ fieldId }) => fieldId),
          })),
          profile: {
            ...definition.profile,
            profileId: profile.profileId,
            selectionBasis: {
              businessScenarioId: primaryScenario.scenarioId,
            },
          },
          scenarios: configuredScenarios.map((scenario) =>
            this.configuredDefinitionScenario(
              scenario,
              definition,
              fields,
              validationRules,
              configured,
              roleFieldByConfiguredId,
              fixtureManifest,
            ),
          ),
          validationRules,
          evidence: [
            ...definition.evidence,
            {
              evidenceId: "EVIDENCE-SCENARIO-CATALOGUE",
              classification: "BA_RULING" as const,
              artifactId: configured.sourceArtifactId,
              artifactSha256: configured.sourceArtifactSha256,
            },
          ],
        };
      })
      .concat(
        this.boundaryDefinitions(
          generated,
          configured,
          defaultValueDate,
          businessDate,
          fixtureManifest,
        ),
      );
  }

  private boundaryDefinitions(
    generated: readonly ResolutionPageDefinition[],
    configured: ResolutionPageScenarioCatalogue,
    defaultValueDate: string,
    businessDate: PageParameterBusinessDateMetadata,
    fixtureManifest: ResolutionPageFixtureManifestService,
  ): ResolutionPageDefinition[] {
    return configured.definitions
      .filter(
        (profile) =>
          !generated.some(
            (definition) =>
              definition.messageType === profile.messageType &&
              (definition.sequences[0]?.sequenceId ?? "MESSAGE") ===
                profile.sequence &&
              (definition.sequences[0]?.settlementLeg ??
                definition.sequences[0]?.sequenceId ??
                "MESSAGE") === profile.settlementLeg,
          ),
      )
      .map((profile) =>
        this.boundaryDefinition(
          profile,
          configured,
          defaultValueDate,
          businessDate,
          fixtureManifest,
        ),
      );
  }

  private boundaryDefinition(
    profile: ResolutionPageScenarioCatalogue["definitions"][number],
    configured: ResolutionPageScenarioCatalogue,
    defaultValueDate: string,
    businessDate: PageParameterBusinessDateMetadata,
    fixtureManifest: ResolutionPageFixtureManifestService,
  ): ResolutionPageDefinition {
    const display = displayIdentity(profile.messageType);
    const scenarios = configured.scenarios.filter(
      ({ profileId }) => profileId === profile.profileId,
    );
    const primaryScenario = scenarios[0];
    if (!primaryScenario) throw new Error("PAGE_BOUNDARY_SCENARIO_REQUIRED");
    const fields = contextFieldsFor(defaultValueDate, businessDate);
    const evidence = [
      {
        evidenceId: "EVIDENCE-SCENARIO-CATALOGUE",
        classification: "BA_RULING" as const,
        artifactId: configured.sourceArtifactId,
        artifactSha256: configured.sourceArtifactSha256,
      },
    ];
    const validationRules = scenarios.map(
      (scenario): PageParameterValidationRule => ({
        ruleId: `RULE-BOUNDARY-${token(scenario.scenarioId)}`,
        taxonomy: "FIELD_USAGE_RULE",
        owner: "SSI_FIELD_RESOLUTION_API",
        appliesToFieldIds: ["context.transactionReference"],
        reasonCode: scenario.reasonCode ?? "MESSAGE_TYPE_NOT_SUPPORTED",
        evidenceIds: ["EVIDENCE-SCENARIO-CATALOGUE"],
      }),
    );
    return {
      schemaVersion: SCHEMA_VERSION,
      definitionId: `PAGE-${token(profile.profileId)}`,
      definitionVersion: configured.catalogueVersion,
      source: {
        catalogueVersion: configured.catalogueVersion,
        sourceArtifactId: configured.sourceArtifactId,
        sourceSha256: configured.sourceArtifactSha256,
      },
      standardsRelease: configured.standardsRelease,
      messageFamily: configured.messageFamily,
      messageType: profile.messageType,
      businessDomain: display.businessDomain,
      direction: "OUTGOING",
      businessFunction: "SCOPE_BOUNDARY",
      title: `${profile.messageType} scope boundary`,
      description:
        "Explicit governed rejection route for an out-of-scope FIN message.",
      display: display.display,
      profile: {
        profileId: profile.profileId,
        profileKind: "FIN_REFERENCE_ONLY",
        paymentExecutable: false,
        selectionBasis: { businessScenarioId: primaryScenario.scenarioId },
      },
      sequences: [
        {
          sequenceId: profile.sequence,
          label: profile.settlementLeg,
          settlementLeg: profile.settlementLeg,
          fieldIds: fields.map(({ fieldId }) => fieldId),
        },
      ],
      fields,
      scenarios: scenarios.map((scenario) =>
        this.boundaryScenario(
          scenario,
          profile.messageType,
          profile.sequence,
          fields,
          fixtureManifest,
        ),
      ),
      validationRules,
      evidence,
    };
  }

  private boundaryScenario(
    scenario: ResolutionPageConfiguredScenario,
    messageType: string,
    sequence: string,
    fields: readonly PageParameterField[],
    fixtureManifest: ResolutionPageFixtureManifestService,
  ): ResolutionPageDefinition["scenarios"][number] {
    const fixture = fixtureManifest.require(scenario.fixtureBindingId);
    const inputValues = scenario.inputValues ?? {};
    const fieldPolicies = scenarioFieldPolicies(
      fields,
      inputValues,
      scenario.polarity,
      messageType,
      scenario.scenarioId,
      this.oasFieldPolicies,
    );
    return {
      scenarioId: scenario.scenarioId,
      label: scenario.label,
      polarity: scenario.polarity,
      audience: scenario.audience,
      flowKind: scenario.flowKind,
      sequenceIds: [sequence],
      fieldIds: fieldPolicies.map(({ fieldId }) => fieldId),
      fieldPolicies,
      validationRuleIds: [`RULE-BOUNDARY-${token(scenario.scenarioId)}`],
      validation: {
        owner: "SSI_FIELD_RESOLUTION_API",
        taxonomy: "NOT_APPLICABLE",
        nvrOutcome: "N_A",
      },
      fixture: {
        bindingId: fixture.bindingId,
        fixtureSet: fixture.fixtureSet,
        fixtureVersion: fixture.fixtureVersion,
        sourceSha256: fixture.sourceArtifactSha256,
        isolation: fixture.isolation,
      },
      execution: {
        action: "PREVIEW_REFERENCE",
        owner: "SSI_FIELD_RESOLUTION_API",
        endpoint: SSI_EXECUTION_ENDPOINT,
        method: "POST",
        expectedHttp: scenario.expectedHttp,
      },
      ...(scenario.inputValues ? { inputValues } : {}),
    };
  }

  private configuredDefinitionScenario(
    scenario: ResolutionPageConfiguredScenario,
    definition: ResolutionPageDefinition,
    fields: readonly PageParameterField[],
    validationRules: readonly PageParameterValidationRule[],
    configured: ResolutionPageScenarioCatalogue,
    roleFields: ReadonlyMap<string, PageParameterField>,
    fixtureManifest: ResolutionPageFixtureManifestService,
  ): ResolutionPageDefinition["scenarios"][number] {
    const fixture = fixtureManifest.require(scenario.fixtureBindingId);
    const scenarioConstraints = configured.crossTagConstraints.filter(
      ({ scenarioId }) => scenarioId === scenario.scenarioId,
    );
    const ruleIds = scenarioConstraints.map(({ constraintId }) => constraintId);
    const defaultRuleIds = validationRules
      .filter(({ owner }) => owner === "SSI_FIELD_RESOLUTION_API")
      .map(({ ruleId }) => ruleId);
    const upstreamValidation = scenarioConstraints.some(
      ({ validationOwner }) => validationOwner === "UPSTREAM_FIN_VALIDATOR",
    );
    const inputValues = Object.fromEntries(
      Object.entries(scenario.inputValues ?? {}).map(([fieldId, value]) => [
        roleFields.get(fieldId)?.fieldId ?? fieldId,
        value,
      ]),
    );
    const fieldPolicies = scenarioFieldPolicies(
      fields,
      inputValues,
      scenario.polarity,
      definition.messageType,
      scenario.scenarioId,
      this.oasFieldPolicies,
    );
    const governedInputValues = userAndFixedInputValues(
      inputValues,
      fieldPolicies,
    );
    const upstreamTaxonomy = scenarioConstraints.find(
      ({ validationOwner }) => validationOwner === "UPSTREAM_FIN_VALIDATOR",
    )?.sourceTaxonomy;
    const validation = upstreamValidation
      ? {
          owner: "UPSTREAM_FIN_VALIDATOR" as const,
          taxonomy: upstreamTaxonomy ?? "NETWORK_VALIDATED_RULE",
          nvrOutcome: "NOT_EVALUATED" as const,
          dispositions: [
            {
              validationScope: "OUT_OF_SCOPE_FULL_FIN_NVR" as const,
              owner: "UPSTREAM_FIN_VALIDATOR" as const,
              taxonomy: upstreamTaxonomy ?? "NETWORK_VALIDATED_RULE",
              expectedOutcome: "NOT_EVALUATED" as const,
              ruleIds,
            },
          ],
        }
      : {
          owner: "SSI_FIELD_RESOLUTION_API" as const,
          taxonomy: "FIELD_USAGE_RULE" as const,
          nvrOutcome: "N_A" as const,
          dispositions: [
            {
              validationScope: "IN_SCOPE_SSI_TAG_NVR" as const,
              owner: "SSI_FIELD_RESOLUTION_API" as const,
              taxonomy: "FIELD_USAGE_RULE" as const,
              expectedOutcome:
                scenario.polarity === "NEGATIVE" && ruleIds.length
                  ? ("FAIL" as const)
                  : ("PASS" as const),
              ruleIds: ruleIds.length ? ruleIds : defaultRuleIds,
            },
          ],
        };
    return {
      scenarioId: scenario.scenarioId,
      label: scenario.label,
      polarity: scenario.polarity,
      audience: scenario.audience,
      flowKind: scenario.flowKind,
      sequenceIds: definition.sequences.map(({ sequenceId }) => sequenceId),
      fieldIds: fieldPolicies.map(({ fieldId }) => fieldId),
      fieldPolicies,
      validationRuleIds: ruleIds.length ? ruleIds : defaultRuleIds,
      validation,
      fixture: {
        bindingId: fixture.bindingId,
        fixtureSet: fixture.fixtureSet,
        fixtureVersion: fixture.fixtureVersion,
        sourceSha256: fixture.sourceArtifactSha256,
        isolation: fixture.isolation,
      },
      execution: upstreamValidation
        ? {
            action: "VALIDATE_FIN",
            owner: "UPSTREAM_FIN_VALIDATOR",
            endpoint: "/api/reference/upstream-fin-validations",
            method: "POST",
            expectedHttp: [200],
          }
        : {
            action: "RESOLVE_SSI",
            owner: "SSI_FIELD_RESOLUTION_API",
            endpoint: SSI_EXECUTION_ENDPOINT,
            method: "POST",
            expectedHttp: scenario.expectedHttp,
          },
      ...(Object.keys(governedInputValues).length
        ? { inputValues: governedInputValues }
        : {}),
    };
  }

  private configuredValidationRules(
    definition: ResolutionPageDefinition,
    extraFields: readonly PageParameterField[],
    configured: ResolutionPageScenarioCatalogue,
    scenarios: readonly ResolutionPageConfiguredScenario[],
  ): PageParameterValidationRule[] {
    const scenarioIds = new Set(scenarios.map(({ scenarioId }) => scenarioId));
    const constraintRules = configured.crossTagConstraints
      .filter(({ scenarioId }) => scenarioIds.has(scenarioId))
      .map((constraint): PageParameterValidationRule => ({
        ruleId: constraint.constraintId,
        taxonomy: constraint.sourceTaxonomy,
        owner: constraint.validationOwner,
        appliesToFieldIds: [
          constraint.fieldId,
          constraint.comparedFieldId,
        ].filter((fieldId): fieldId is string => Boolean(fieldId)),
        reasonCode: constraint.reasonCode,
        evidenceIds: ["EVIDENCE-SCENARIO-CATALOGUE"],
      }));
    const inputRules = extraFields.map(
      (field): PageParameterValidationRule => ({
        ruleId: `RULE-INPUT-${token(field.fieldId)}`,
        taxonomy: "NOT_APPLICABLE",
        owner: "SSI_FIELD_RESOLUTION_API",
        appliesToFieldIds: [field.fieldId],
        reasonCode: "CONTROLLED_VALIDATION_CONTEXT",
        evidenceIds: ["EVIDENCE-SCENARIO-CATALOGUE"],
      }),
    );
    return [
      ...definition.validationRules,
      ...inputRules,
      ...constraintRules,
    ].filter(
      (rule, index, rules) =>
        rules.findIndex(({ ruleId }) => ruleId === rule.ruleId) === index,
    );
  }

  private currencyValues(
    definition: ResolutionPageDefinition,
    sequence: string,
    settlementLeg: string,
    configuredFields: readonly PageParameterField[],
    scenarios: readonly ResolutionPageConfiguredScenario[],
    fixtureCandidates: readonly FinControlledFixtureIndexCurrency[],
  ): string[] {
    const configuredCurrency = configuredFields.find(
      ({ fieldId }) => fieldId === "context.currency",
    );
    const scenarioCurrencies = scenarios
      .map(({ inputValues }) => inputValues?.["context.currency"])
      .filter(
        (value): value is string =>
          typeof value === "string" && Boolean(value.trim()),
      );
    const fixtureCurrencies = fixtureCandidates
      .filter(
        (candidate) =>
          candidate.messageType === definition.messageType &&
          candidate.sequence === sequence &&
          candidate.settlementLeg === settlementLeg,
      )
      .map(({ currency }) => currency);
    return [
      ...new Set([
        ...(configuredCurrency?.options ?? []).map(({ value }) => value),
        ...scenarioCurrencies,
        ...fixtureCurrencies,
      ]),
    ].sort((left, right) => left.localeCompare(right));
  }

  private configuredFields(
    definition: ResolutionPageDefinition,
    extraFields: readonly PageParameterField[],
    currencyValues: readonly string[],
  ): readonly PageParameterField[] {
    const materialized = this.oasFieldPolicies.materializedFields(
      definition.messageType,
    );
    const governedExtraFields = extraFields.map((field) =>
      this.applyOasFieldLabel(field, materialized),
    );
    const oasFields = materialized.filter(
      (oasField) =>
        ![...definition.fields, ...extraFields].some(
          (field) =>
            field.fieldId === oasField.fieldId ||
            (field.swiftTag === oasField.swiftTag &&
              field.lookup?.targetRole === oasField.lookup?.targetRole),
        ),
    );
    return withRenderedLookupDependencies([
      ...definition.fields.map((field) =>
        this.withCurrencyOptions(field, currencyValues),
      ),
      ...governedExtraFields,
      ...oasFields,
    ]);
  }

  private applyOasFieldLabel(
    field: PageParameterField,
    materialized: readonly PageParameterField[],
  ): PageParameterField {
    const oasField = materialized.find(
      (candidate) =>
        candidate.swiftTag === field.swiftTag &&
        candidate.lookup?.targetRole === field.lookup?.targetRole,
    );
    if (!oasField) return field;
    return {
      ...field,
      label: oasField.label,
      ...(oasField.officialRole ? { officialRole: oasField.officialRole } : {}),
    };
  }

  private withCurrencyOptions(
    field: PageParameterField,
    currencyValues: readonly string[],
  ): PageParameterField {
    if (field.fieldId !== "context.currency") return field;
    const singleCurrency = currencyValues.length === 1;
    const defaultValue = currencyValues.includes("USD")
      ? "USD"
      : currencyValues[0];
    return {
      ...withoutDefaultValue(field),
      control: "SELECT",
      options: currencyValues.map((value) => ({ value, label: value })),
      ...(defaultValue ? { defaultValue } : {}),
      optionSource: {
        source: "GOVERNED_APPLICABILITY",
        dependsOnFieldIds: [],
        invalidatesFieldIds: [COUNTERPARTY_FIELD_ID],
        selectionPolicy: singleCurrency
          ? "SINGLE_VALUE_RESTRICTED"
          : "SELECTABLE",
        ...(singleCurrency
          ? {
              restrictionMessage:
                "This governed scenario currently has one SSI-applicable currency.",
            }
          : {}),
      },
    };
  }

  private configuredExtraFields(
    definition: ResolutionPageDefinition,
    configuredFields: readonly PageParameterField[],
    roleFields: ReadonlyMap<string, PageParameterField>,
  ): PageParameterField[] {
    return configuredFields
      .filter((field) => !roleFields.has(field.fieldId))
      .filter(
        ({ fieldId }) =>
          !definition.fields.some((field) => field.fieldId === fieldId),
      )
      .map((field) => this.configuredExtraField(definition, field));
  }

  private configuredExtraField(
    definition: ResolutionPageDefinition,
    field: PageParameterField,
  ): PageParameterField {
    const role = /^role(?:PartyIdentifiers|AccountReferences)\.(.+)$/.exec(
      field.path,
    )?.[1];
    const roleSwiftTag = role
      ? (
          {
            SENDER_CORRESPONDENT: "53",
            SENDERS_CORRESPONDENT: "53",
            RECEIVER_CORRESPONDENT: "54",
            RECEIVERS_CORRESPONDENT: "54",
            INTERMEDIARY: "56",
            INTERMEDIARY_INSTITUTION: "56",
            ACCOUNT_WITH_INSTITUTION: "57",
            RECEIVING_AGENT: "57",
            BENEFICIARY_BANK: "58",
            BENEFICIARY_INSTITUTION: "58",
          } as Readonly<Record<string, string>>
        )[role]
      : undefined;
    const configuredSwiftTag = (
      {
        "context.senderCorrespondentBankServiceId": "53",
        "context.receiverCorrespondentBankServiceId": "54",
        "context.reimbursingBankServiceId": "53",
        "context.intermediaryBankServiceId": "56",
        "context.receivingBankServiceId": "57",
        "context.beneficiaryBankServiceId": "58",
      } as Readonly<Record<string, string>>
    )[field.fieldId];
    const governed = role
      ? (definition.fields.find(
          (candidate) => candidate.lookup?.targetRole === role,
        ) ??
        definition.fields.find(
          (candidate) => candidate.swiftTag === roleSwiftTag,
        ))
      : undefined;
    const swiftTag = governed?.swiftTag ?? roleSwiftTag ?? configuredSwiftTag;
    if (!governed && !swiftTag) return field;
    return {
      ...field,
      ...(governed?.sequenceId ? { sequenceId: governed.sequenceId } : {}),
      ...(governed?.settlementLeg
        ? { settlementLeg: governed.settlementLeg }
        : {}),
      ...(swiftTag ? { swiftTag } : {}),
      ...(governed?.swiftOption ? { swiftOption: governed.swiftOption } : {}),
      ...(governed?.officialRole
        ? { officialRole: governed.officialRole }
        : {}),
    };
  }

  private roleFieldByConfiguredId(
    definition: ResolutionPageDefinition,
  ): Map<string, PageParameterField> {
    const result = new Map<string, PageParameterField>();
    const beneficiaryRole = ["MT742", "MT754"].includes(definition.messageType)
      ? "BENEFICIARY_BANK"
      : "BENEFICIARY_INSTITUTION";
    const identities: Readonly<
      Record<string, { readonly role: string; readonly swiftTag?: string }>
    > = {
      "context.senderCorrespondentBankServiceId": {
        role: "SENDERS_CORRESPONDENT",
        swiftTag: "53",
      },
      "context.receiverCorrespondentBankServiceId": {
        role: "RECEIVERS_CORRESPONDENT",
        swiftTag: "54",
      },
      "context.intermediaryBankServiceId": {
        role: "INTERMEDIARY_INSTITUTION",
        swiftTag: "56",
      },
      "context.receivingBankServiceId": {
        role: "ACCOUNT_WITH_INSTITUTION",
        swiftTag: "57",
      },
      "context.beneficiaryBankServiceId": {
        role: beneficiaryRole,
        swiftTag: "58",
      },
      "context.reimbursingBankServiceId": { role: "REIMBURSING_BANK" },
    };
    for (const [configuredId, identity] of Object.entries(identities)) {
      const governed =
        definition.fields.find(
          (candidate) => candidate.lookup?.targetRole === identity.role,
        ) ??
        definition.fields.find(
          (candidate) => candidate.swiftTag === identity.swiftTag,
        );
      if (governed) result.set(configuredId, governed);
    }
    return result;
  }

  find(
    query: ResolutionPageDefinitionQuery,
  ): readonly ResolutionPageDefinition[] {
    return this.all(query.standardsRelease).filter(
      (definition) =>
        definition.messageFamily === query.messageFamily &&
        definition.messageType === query.messageType &&
        definition.direction === query.direction &&
        (!query.businessScenarioId ||
          definition.profile.selectionBasis.businessScenarioId ===
            query.businessScenarioId) &&
        (!query.businessService ||
          definition.profile.businessService === query.businessService),
    );
  }
}
