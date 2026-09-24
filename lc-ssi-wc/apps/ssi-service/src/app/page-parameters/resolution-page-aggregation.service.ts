import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import type {
  ResolutionPageDefinition,
  ResolutionPageDefinitionEnvelope,
  ResolutionPageDefinitionIndexEnvelope,
  ResolutionPageDefinitionQuery,
  PageParameterBusinessDomain,
} from "@ssi/contracts";
import { hashCanonical } from "../canonical-json";
import { PageParameterEnvironmentPolicy } from "./page-parameter-environment.policy";
import {
  RESOLUTION_PAGE_DEFINITION_SOURCE,
  type ResolutionPageDefinitionSource,
} from "./resolution-page-definition.source";
import { validateResolutionPageDefinition } from "./resolution-page-definition.validator";
import { IndexPaginationPolicy } from "../index-pagination.policy";
import { ResolutionPageOasFieldPolicyService } from "./resolution-page-oas-field-policy.service";
import { PaymentMessageIndexService } from "../payment-message-index.service";

const requiredQueryText = (value: string | undefined, code: string): string => {
  if (!value?.trim()) throw new BadRequestException({ code });
  return value;
};
const SCHEMA_VERSION = "1.0" as const;
const SWIFT_DESCRIPTION: Readonly<Record<string, string>> = {
  MT103: "Single Customer Credit Transfer",
  "pacs.008.001.08": "FI To FI Customer Credit Transfer",
  MT202: "General Financial Institution Transfer",
  MT202COV: "General Financial Institution Transfer",
  MT205: "Financial Institution Transfer Execution",
  MT205COV: "Financial Institution Transfer Execution",
  MT300: "Foreign Exchange Confirmation",
  MT304: "Advice / Instruction of a Third Party Deal",
  MT305: "Foreign Currency Option Confirmation",
  MT306: "Foreign Currency Option Confirmation",
  MT320: "Fixed Loan / Deposit Confirmation",
  MT330: "Call / Notice Loan / Deposit Confirmation",
  MT340: "Forward Rate Agreement Confirmation",
  MT341: "Forward Rate Agreement Settlement Confirmation",
  MT350: "Advice of Loan / Deposit Interest Payment",
  MT360: "Single Currency Interest Rate Derivative Confirmation",
  MT361: "Cross Currency Interest Rate Swap Confirmation",
  MT362: "Interest Rate Derivative Payment Advice",
  MT364: "Single Currency Interest Rate Derivative Termination / Recouponing",
  MT365: "Cross Currency Interest Rate Swap Termination / Recouponing",
  MT400: "Advice of Payment",
  MT416: "Advice of Non-Payment / Non-Acceptance",
  MT730: "Acknowledgement",
  MT734: "Advice of Refusal",
  MT742: "Reimbursement Claim",
  MT750: "Advice of Discrepancy",
  MT752: "Authorisation to Pay, Accept or Negotiate",
  MT754: "Advice of Payment / Acceptance / Negotiation",
  MT756: "Advice of Reimbursement or Payment",
  MT765: "Guarantee / Standby Letter of Credit Demand",
  MT768: "Acknowledgement of a Guarantee / Standby Message",
  MT769: "Advice of Reduction or Release",
  MT785: "Non-SSI Scope Audit Boundary",
};

const swiftFieldDisplays = (
  fields: ResolutionPageDefinition["fields"],
): readonly string[] =>
  [
    ...new Set(
      fields
        .filter(({ swiftTag }) => swiftTag)
        .flatMap((field) => {
          if (field.swiftOption)
            return [`${field.swiftTag}${field.swiftOption}`];
          return (
            field.options?.map(({ value }) => `${field.swiftTag}${value}`) ?? [
              `${field.swiftTag}a`,
            ]
          );
        }),
    ),
  ].sort((left, right) => left.localeCompare(right));

const profileSlotsFor = (
  contract: ResolutionPageDefinition,
): readonly string[] => {
  const policies = contract.scenarios.flatMap(
    ({ fieldPolicies }) => fieldPolicies ?? [],
  );
  if (policies.length === 0)
    return contract.businessDomain === "PAYMENT"
      ? []
      : swiftFieldDisplays(contract.fields);
  const applicableSsiDerivedFieldIds = new Set(
    policies
      .filter(
        ({ applicability, inputOwnership }) =>
          applicability === "APPLICABLE" && inputOwnership === "SSI_DERIVED",
      )
      .map(({ fieldId }) => fieldId),
  );
  return swiftFieldDisplays(
    contract.fields.filter(
      ({ fieldId, section }) =>
        section === "SETTLEMENT_INSTRUCTIONS" &&
        applicableSsiDerivedFieldIds.has(fieldId),
    ),
  );
};

const governedInputFieldsFor = (
  contract: ResolutionPageDefinition,
): readonly string[] => {
  const policies = contract.scenarios.flatMap(
    ({ fieldPolicies }) => fieldPolicies ?? [],
  );
  if (policies.length === 0) return [];
  const applicableTransactionUserFieldIds = new Set(
    policies
      .filter(
        ({ applicability, inputOwnership, visibility }) =>
          applicability === "APPLICABLE" &&
          inputOwnership === "TRANSACTION_USER" &&
          visibility === "USER_INPUT",
      )
      .map(({ fieldId }) => fieldId),
  );
  return [
    ...new Set(
      contract.fields
        .filter(
          ({ control, fieldId, visibility, swiftTag }) =>
            control !== "HIDDEN" &&
            visibility === "USER_INPUT" &&
            Boolean(swiftTag) &&
            applicableTransactionUserFieldIds.has(fieldId),
        )
        .slice()
        .sort(
          (left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0),
        )
        .map(
          ({ sequenceId, swiftTag, swiftOption }) =>
            `${sequenceId === "B" ? "B." : ""}${swiftTag}${swiftOption ?? ""}`,
        ),
    ),
  ];
};

const scenarioCountFor = (
  contract: ResolutionPageDefinition,
  allDefinitions: readonly ResolutionPageDefinition[],
): number =>
  allDefinitions
    .filter(({ messageType }) => messageType === contract.messageType)
    .reduce((count, definition) => count + definition.scenarios.length, 0);

@Injectable()
export class ResolutionPageAggregationService {
  private readonly runtimeDefinitionsByRelease = new Map<
    string,
    readonly ResolutionPageDefinition[]
  >();
  private readonly indexByReleaseAndDomain = new Map<
    string,
    ResolutionPageDefinitionIndexEnvelope
  >();

  /** Call only after a committed controlled-configuration change. */
  invalidate(): void {
    this.runtimeDefinitionsByRelease.clear();
    this.indexByReleaseAndDomain.clear();
  }

  constructor(
    @Inject(RESOLUTION_PAGE_DEFINITION_SOURCE)
    private readonly source: ResolutionPageDefinitionSource,
    private readonly environmentPolicy: PageParameterEnvironmentPolicy,
    @Optional() private readonly paginationPolicy?: IndexPaginationPolicy,
    @Optional()
    private readonly oasFieldPolicies?: ResolutionPageOasFieldPolicyService,
    @Optional()
    private readonly paymentMessageIndex?: PaymentMessageIndexService,
  ) {}

  get(query: ResolutionPageDefinitionQuery): ResolutionPageDefinitionEnvelope {
    this.validateQuery(query);
    const cachedDefinitions = this.runtimeDefinitions(query.standardsRelease);
    const candidates = cachedDefinitions
      ? cachedDefinitions.filter((definition) =>
          this.matchesQuery(definition, query),
        )
      : this.source
          .find(query)
          .map((definition) => this.forRuntimeEnvironment(definition));
    if (candidates.length !== 1)
      this.failConfiguration(
        candidates.length === 0
          ? "PAGE_DEFINITION_NOT_FOUND"
          : "PAGE_DEFINITION_AMBIGUOUS",
        query,
      );
    const contract = candidates[0]!;
    try {
      validateResolutionPageDefinition(contract, query);
    } catch (error) {
      this.failConfiguration(
        error instanceof Error ? error.message : "PAGE_DEFINITION_INVALID",
        query,
      );
    }
    return {
      contract,
      contractSha256: hashCanonical(contract),
    };
  }

  index(
    standardsRelease = "SR2026",
    businessDomain?: PageParameterBusinessDomain,
  ): ResolutionPageDefinitionIndexEnvelope {
    const cacheKey = `${standardsRelease}:${businessDomain ?? "ALL"}`;
    const cached = this.indexByReleaseAndDomain.get(cacheKey);
    if (cached) return cached;
    const allDefinitions = this.runtimeDefinitions(standardsRelease) ?? [];
    const messageOrder = new Map<string, number>();
    for (const definition of allDefinitions)
      if (!messageOrder.has(definition.messageType))
        messageOrder.set(definition.messageType, messageOrder.size + 1);
    const omittedZeroScenarioDefinitions = allDefinitions
      .filter(({ scenarios }) => scenarios.length === 0)
      .map(({ definitionId }) => definitionId);
    const definitions = allDefinitions
      .filter(({ scenarios }) => scenarios.length > 0)
      .filter(
        (definition) =>
          !businessDomain || definition.businessDomain === businessDomain,
      );
    const index: ResolutionPageDefinitionIndexEnvelope = {
      schemaVersion: SCHEMA_VERSION,
      pagination: (this.paginationPolicy ?? new IndexPaginationPolicy())
        .contract,
      indexVersion: hashCanonical(
        definitions.map(({ definitionId, definitionVersion }) => ({
          definitionId,
          definitionVersion,
        })),
      ),
      diagnostics: {
        omittedZeroScenarioDefinitions,
        signOffBlocked: omittedZeroScenarioDefinitions.length > 0,
      },
      items: definitions.map((contract) =>
        this.indexItem(contract, definitions, allDefinitions, messageOrder),
      ),
    };
    this.indexByReleaseAndDomain.set(cacheKey, index);
    return index;
  }

  private indexItem(
    contract: ResolutionPageDefinition,
    definitions: readonly ResolutionPageDefinition[],
    allDefinitions: readonly ResolutionPageDefinition[],
    messageOrder: ReadonlyMap<string, number>,
  ): ResolutionPageDefinitionIndexEnvelope["items"][number] {
    const primaryScenario = contract.scenarios[0]!;
    const outOfScope = primaryScenario.execution.action !== "RESOLVE_SSI";
    const profileSlots = profileSlotsFor(contract);
    const targetProfileSlots =
      contract.businessDomain === "PAYMENT"
        ? (this.paymentMessageIndex?.findSelectable(contract.messageType)
            ?.mtCompatibility.ssiFields ?? profileSlots)
        : profileSlots;
    const scenarioSequence = contract.sequences
      .map(({ sequenceId }) => sequenceId)
      .join(" / ");
    const swiftDescription =
      SWIFT_DESCRIPTION[contract.messageType] ?? contract.title;
    const transactionGroupOrder = messageOrder.get(contract.messageType)!;
    return {
      definitionId: contract.definitionId,
      definitionVersion: contract.definitionVersion,
      contractSha256: hashCanonical(contract),
      title: contract.title,
      businessDomain: contract.businessDomain,
      transactionGroupId: `${contract.businessDomain}:${contract.messageType}`,
      transactionGroupLabel: `${contract.messageType} — ${contract.businessFunction.replaceAll("_", " ")}`,
      transactionGroupOrder,
      scenarioLabel: primaryScenario.label,
      scenarioDescription: contract.description ?? primaryScenario.label,
      scenarioOrder:
        definitions.findIndex(
          ({ definitionId }) => definitionId === contract.definitionId,
        ) + 1,
      transactionDescription: swiftDescription,
      scenarioSequence,
      ssiScope: outOfScope ? "OUT_OF_SCOPE" : "IN_SCOPE",
      validationOwner: primaryScenario.execution.owner,
      status: outOfScope ? "READ_ONLY_SCOPE_DECISION" : "AVAILABLE",
      executable: !outOfScope,
      actionLabel: outOfScope ? "View scope decision" : "Open workbench",
      swiftDescription,
      messageCode: contract.messageType,
      inputFields:
        contract.businessDomain === "PAYMENT"
          ? governedInputFieldsFor(contract)
          : (this.oasFieldPolicies
              ?.inputFields(contract.messageType)
              .map(({ display }) => display) ?? []),
      profileSlots,
      targetProfileSlots,
      mappingStatus: outOfScope ? "OUT_OF_SCOPE" : "PROFILE_VERIFIED",
      processingStatus: outOfScope
        ? "READ_ONLY_SCOPE_DECISION"
        : "PROFILE_VERIFIED",
      originalOrder: transactionGroupOrder,
      scenarioCount: scenarioCountFor(contract, allDefinitions),
      scenarioDetails: contract.scenarios.map((scenario) => ({
        scenarioId: scenario.scenarioId,
        label: scenario.label,
        sequence: scenarioSequence,
        polarity: scenario.polarity,
        audience: scenario.audience,
        flowKind: scenario.flowKind,
        executable: scenario.execution.action === "RESOLVE_SSI",
      })),
      query: {
        standardsRelease: contract.standardsRelease,
        messageFamily: contract.messageFamily,
        messageType: contract.messageType,
        direction: contract.direction,
        businessDomain: contract.businessDomain,
        businessScenarioId: contract.profile.selectionBasis.businessScenarioId,
        ...(contract.profile.selectionBasis.businessService
          ? {
              businessService: contract.profile.selectionBasis.businessService,
            }
          : {}),
      },
    };
  }

  private runtimeDefinitions(
    standardsRelease: string,
  ): readonly ResolutionPageDefinition[] | undefined {
    if (!this.source.all) return undefined;
    const cached = this.runtimeDefinitionsByRelease.get(standardsRelease);
    if (cached) return cached;
    const definitions = this.source
      .all(standardsRelease)
      .map((definition) => this.forRuntimeEnvironment(definition));
    this.runtimeDefinitionsByRelease.set(standardsRelease, definitions);
    return definitions;
  }

  private matchesQuery(
    definition: ResolutionPageDefinition,
    query: ResolutionPageDefinitionQuery,
  ): boolean {
    return (
      definition.standardsRelease === query.standardsRelease &&
      definition.messageFamily === query.messageFamily &&
      definition.messageType === query.messageType &&
      definition.direction === query.direction &&
      (!query.businessDomain ||
        definition.businessDomain === query.businessDomain) &&
      (!query.businessService ||
        definition.profile.selectionBasis.businessService ===
          query.businessService) &&
      (!query.businessScenarioId ||
        definition.profile.selectionBasis.businessScenarioId ===
          query.businessScenarioId)
    );
  }

  getByIdentity(
    definitionId: string,
    definitionVersion: string,
  ): ResolutionPageDefinitionEnvelope {
    requiredQueryText(definitionId, "PAGE_DEFINITION_ID_REQUIRED");
    requiredQueryText(definitionVersion, "PAGE_DEFINITION_VERSION_REQUIRED");
    const candidates = (this.runtimeDefinitions("SR2026") ?? []).filter(
      (definition) => definition.definitionId === definitionId,
    );
    if (candidates.length !== 1)
      this.failConfiguration(
        candidates.length
          ? "PAGE_DEFINITION_AMBIGUOUS"
          : "PAGE_DEFINITION_NOT_FOUND",
        {
          standardsRelease: "SR2026",
          messageFamily: "IDENTITY_LOOKUP",
          messageType: definitionId,
          direction: "OUTGOING",
        },
      );
    const definition = candidates[0]!;
    if (definition.definitionVersion !== definitionVersion)
      throw new BadRequestException({
        code: "PAGE_DEFINITION_VERSION_MISMATCH",
      });
    return this.get({
      standardsRelease: definition.standardsRelease,
      messageFamily: definition.messageFamily,
      messageType: definition.messageType,
      direction: definition.direction,
      businessDomain: definition.businessDomain,
      businessScenarioId: definition.profile.selectionBasis.businessScenarioId,
      ...(definition.profile.selectionBasis.businessService
        ? { businessService: definition.profile.selectionBasis.businessService }
        : {}),
    });
  }

  private validateQuery(query: ResolutionPageDefinitionQuery): void {
    requiredQueryText(query.standardsRelease, "STANDARDS_RELEASE_REQUIRED");
    requiredQueryText(query.messageFamily, "MESSAGE_FAMILY_REQUIRED");
    requiredQueryText(query.messageType, "MESSAGE_TYPE_REQUIRED");
    if (!(["INCOMING", "OUTGOING"] as const).includes(query.direction))
      throw new BadRequestException({ code: "MESSAGE_DIRECTION_INVALID" });
  }

  private forRuntimeEnvironment(
    definition: ResolutionPageDefinition,
  ): ResolutionPageDefinition {
    if (this.environmentPolicy.exposesControlledTestScenarios())
      return definition;
    return {
      ...definition,
      scenarios: definition.scenarios.filter(
        ({ audience }) => audience === "OPERATIONAL",
      ),
    };
  }

  private failConfiguration(
    cause: string,
    query: ResolutionPageDefinitionQuery,
  ): never {
    throw new HttpException(
      {
        code: "INCORRECT_PAGE_PARAMETER_CONFIGURATION",
        cause,
        remediation:
          "Correct the governed page-parameter configuration and reload the database.",
        payloadGenerated: false,
        confirmedResolutionCreated: false,
        repairQueueCreated: false,
        context: {
          standardsRelease: query.standardsRelease,
          messageFamily: query.messageFamily,
          messageType: query.messageType,
        },
      },
      this.environmentPolicy.configurationErrorStatus(),
    );
  }
}
