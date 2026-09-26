import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type {
  PageParameterField,
  ResolutionPageDefinition,
  ResolutionPageExecutionOutcome,
  ResolutionPageFieldResult,
  ResolutionPageExecutionResult,
  ResolutionPageScenario,
  ResolutionPageSubmission,
} from "@ssi/contracts";
import { BankServiceDirectory } from "../bank-service-directory";
import { hashCanonical } from "../canonical-json";
import {
  FinControlledFixtureService,
  type FinControlledFixtureCandidate,
  type FinControlledFixtureQuery,
} from "../fin-controlled-fixture.service";
import { FinControlledResolutionService } from "../fin-controlled-resolution.service";
import { ResolutionPageAggregationService } from "./resolution-page-aggregation.service";
import { ResolutionPageScenarioCatalogueService } from "./resolution-page-scenario-catalogue.service";
import { ResolutionPageCrossTagValidator } from "./resolution-page-cross-tag.validator";
import { ResolutionPageFixtureManifestService } from "./resolution-page-fixture-manifest.service";
import { PaymentResolutionPageSubmissionAdapter } from "./payment-resolution-page-submission.adapter";
import { Mt1SsiResolutionPageSubmissionAdapter } from "./mt1-ssi-resolution-page-submission.adapter";
import { scenarioNvrOutcome } from "./page-parameter-validation-disposition";
import { DatabaseSnapshotIdentityService } from "../database-snapshot-identity.service";
import { PaymentGovernedApplicabilityService } from "./payment-governed-applicability.service";
import { MappingCatalogueService } from "../mapping-catalogue.service";
import { paymentOwnAccountScenario } from "./payment-own-account-eligibility.policy";
import { servicerRelationshipMatches } from "./servicer-relationship.policy";
export { servicerRelationshipMatches } from "./servicer-relationship.policy";

const textValue = (
  values: ResolutionPageSubmission["values"],
  fieldId: string,
): string => {
  const value = values[fieldId];
  return typeof value === "string" ? value.trim() : "";
};

type ResolutionStatus = ResolutionPageFieldResult["resolutionStatus"];
type SubmittedValue = ResolutionPageSubmission["values"][string] | undefined;

const ROUTING_CONTEXT_FIELDS = new Set([
  "context.transactionReference",
  "context.currency",
  "context.bookingEntity",
  "context.valueDate",
  "context.counterpartyBankServiceId",
  "context.receiverBankServiceId",
]);

export const hasExecutableNegativeTrigger = (
  scenario: ResolutionPageScenario,
): boolean =>
  Object.keys(scenario.inputValues ?? {}).some(
    (fieldId) =>
      !ROUTING_CONTEXT_FIELDS.has(fieldId) &&
      !/(^|\.)(messageType|sequence|settlementLeg)$/i.test(fieldId),
  );

const optionalText = (
  source: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined => {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const optionalNumberArray = (
  source: Readonly<Record<string, unknown>>,
  key: string,
): readonly number[] | undefined => {
  const value = source[key];
  return Array.isArray(value) && value.every((item) => typeof item === "number")
    ? value
    : undefined;
};

const candidateMismatchCode = (
  candidateCount: number,
  baseCandidateCount: number,
): string => {
  if (candidateCount > 0) return "PAGE_FIXTURE_IDENTITY_AMBIGUOUS";
  return baseCandidateCount > 0
    ? "PAGE_COUNTERPARTY_FIXTURE_MISMATCH"
    : "PAGE_FIXTURE_IDENTITY_NOT_FOUND";
};

@Injectable()
export class ResolutionPageSubmissionAdapter {
  constructor(
    private readonly pages: ResolutionPageAggregationService,
    private readonly fixtures: FinControlledFixtureService,
    private readonly controlled: FinControlledResolutionService,
    private readonly bankServices: BankServiceDirectory,
    @Optional()
    private readonly scenarioCatalogue?: ResolutionPageScenarioCatalogueService,
    @Optional() private readonly crossTags?: ResolutionPageCrossTagValidator,
    @Optional()
    private readonly fixtureManifest?: ResolutionPageFixtureManifestService,
    @Optional()
    private readonly payment?: PaymentResolutionPageSubmissionAdapter,
    @Optional()
    private readonly snapshots?: DatabaseSnapshotIdentityService,
    @Optional()
    private readonly paymentRoutes?: PaymentGovernedApplicabilityService,
    @Optional()
    private readonly mappingCatalogues?: MappingCatalogueService,
    @Optional()
    private readonly mt1?: Mt1SsiResolutionPageSubmissionAdapter,
  ) {}

  execute(input: unknown): ResolutionPageExecutionResult {
    const submission = this.parseSubmission(input);
    const envelope = this.pages.getByIdentity(
      submission.definitionId,
      submission.definitionVersion,
    );
    const definition = envelope.contract;
    const scenario = this.requireScenario(
      submission,
      definition,
      envelope.contractSha256,
    );
    this.validateRouteBinding(submission, definition, scenario);

    const fieldsById = new Map(
      definition.fields
        .filter(({ fieldId }) => scenario.fieldIds.includes(fieldId))
        .map((field) => [field.fieldId, field]),
    );
    const governedFieldOptions =
      this.scenarioCatalogue?.fieldOptionsFor(scenario.scenarioId) ?? {};
    this.validateScenarioFieldOptions(governedFieldOptions, definition);
    const governed = this.governValues(submission, fieldsById, scenario);
    this.fixtureManifest?.require(submission.fixtureBindingId);
    this.crossTags?.validate(
      governed.submission,
      this.scenarioCatalogue?.constraintsFor(submission.scenarioId) ?? [],
    );
    this.rejectBoundaryScenario(definition, scenario);
    this.rejectUnhandledNegativeScenario(scenario);
    if (definition.businessDomain === "PAYMENT") {
      if (definition.messageFamily === "MT1_PACS008") {
        if (!this.mt1)
          throw new ServiceUnavailableException({
            code: "MT1_SSI_PAGE_EXECUTOR_UNAVAILABLE",
          });
        return this.mt1.execute({
          definition,
          scenario,
          submission: governed.submission,
        });
      }
      if (!this.payment)
        throw new ServiceUnavailableException({
          code: "PAYMENT_PAGE_EXECUTOR_UNAVAILABLE",
        });
      return this.payment.execute({
        definition,
        scenario,
        submission: governed.submission,
      });
    }
    const roleValues = this.roleValues(governed.submission, fieldsById);
    const sequence = definition.sequences[0]?.sequenceId;
    const context = {
      messageType: definition.messageType,
      ...(sequence ? { sequence } : {}),
      currency: textValue(governed.submission.values, "context.currency"),
      bookingEntity: textValue(
        governed.submission.values,
        "context.bookingEntity",
      ),
      valueDate: textValue(governed.submission.values, "context.valueDate"),
    };
    const counterpartyBankServiceId = textValue(
      governed.submission.values,
      "context.counterpartyBankServiceId",
    );
    const counterpartyBic = this.bankServices.resolve(
      counterpartyBankServiceId,
    ).bic;
    const baseCandidates = this.fixtureCandidates(
      context,
      scenario,
      counterpartyBic,
    );
    const candidates = baseCandidates
      .filter((candidate) => candidate.counterpartyBic === counterpartyBic)
      .filter(
        (candidate) =>
          candidate.businessFunction === definition.businessFunction,
      );
    if (candidates.length === 0) {
      this.controlled.resolve({
        ...context,
        bindingId: scenario.fixture.bindingId,
        transactionReference: textValue(
          governed.submission.values,
          "context.transactionReference",
        ),
      });
    }
    if (candidates.length !== 1)
      throw new BadRequestException({
        code: candidateMismatchCode(candidates.length, baseCandidates.length),
        candidateCount: candidates.length,
      });
    if (candidates[0]!.counterpartyBic !== counterpartyBic)
      throw new BadRequestException({
        code: "PAGE_COUNTERPARTY_FIXTURE_MISMATCH",
        fixtureBindingId: candidates[0]!.bindingId,
      });
    const mismatchedRole = this.mismatchedRole(
      roleValues,
      fieldsById,
      scenario,
      candidates[0]!,
    );
    if (mismatchedRole)
      throw new BadRequestException({
        code: "PAGE_BANK_SERVICE_FIXTURE_MISMATCH",
        role: mismatchedRole[0],
      });
    const request = {
      ...context,
      bindingId: candidates[0]!.bindingId,
      transactionReference: textValue(
        governed.submission.values,
        "context.transactionReference",
      ),
      fieldOptions: {
        ...Object.fromEntries(
          [...fieldsById.values()]
            .filter(
              (field) =>
                field.swiftTag && field.path.startsWith("fieldOptions."),
            )
            .filter((field) =>
              textValue(governed.submission.values, field.fieldId),
            )
            .map((field) => [
              field.swiftTag!,
              textValue(governed.submission.values, field.fieldId),
            ]),
        ),
        ...governedFieldOptions,
      },
      roleBankServiceIds: Object.fromEntries(
        [...fieldsById.values()]
          .filter(
            (field) =>
              field.lookup?.targetRole &&
              textValue(governed.submission.values, field.fieldId),
          )
          .map((field) => [
            field.lookup!.targetRole!,
            textValue(governed.submission.values, field.fieldId),
          ]),
      ),
      rolePartyIdentifiers: this.roleSupplements(
        governed.submission,
        fieldsById,
        "rolePartyIdentifiers.",
      ),
      roleAccountReferences: this.roleSupplements(
        governed.submission,
        fieldsById,
        "roleAccountReferences.",
      ),
    };
    const raw = this.controlled.resolve(request) as {
      readonly resolvedFields?: readonly Record<string, unknown>[];
    } & Record<string, unknown>;
    const partyIdentifiers = this.roleSupplements(
      governed.submission,
      fieldsById,
      "rolePartyIdentifiers.",
    );
    const accountReferences = this.roleSupplements(
      governed.submission,
      fieldsById,
      "roleAccountReferences.",
    );
    const evidenceIds = definition.evidence.map(({ evidenceId }) => evidenceId);
    const fields = (raw.resolvedFields ?? []).map((field) =>
      this.fieldResult(
        field,
        [...fieldsById.values()],
        request.roleBankServiceIds,
        partyIdentifiers,
        accountReferences,
        evidenceIds,
      ),
    );
    const requestSha256 = hashCanonical(request);
    const responseSha256 = hashCanonical(raw);
    return {
      definitionId: definition.definitionId,
      definitionVersion: definition.definitionVersion,
      scenarioId: scenario.scenarioId,
      fixtureBindingId: submission.fixtureBindingId,
      outcome: "REFERENCE_ONLY",
      payloadGenerated: raw["payloadGenerated"] === true,
      confirmedResolutionCreated: false,
      repairQueueCreated: false,
      nvrOutcome: scenarioNvrOutcome(scenario),
      fields,
      outputs: [],
      evidence: {
        correlationId: requestSha256.slice(0, 32),
        owner: scenario.execution.owner,
        action: scenario.execution.action,
        executorIdentity: "FIN_CONTROLLED_RESOLUTION_ADAPTER_V1",
        requestSha256,
        responseSha256,
        ruleIds: scenario.validationRuleIds,
        selectedSsi: candidates[0]!.identity.ssi,
        selectedApplicability: candidates[0]!.identity.applicability,
        ...(governed.ignoredFieldIds.length
          ? { ignoredFieldIds: governed.ignoredFieldIds }
          : {}),
      },
    };
  }

  private requireScenario(
    submission: ResolutionPageSubmission,
    definition: ResolutionPageDefinition,
    contractSha256: string,
  ): ResolutionPageScenario {
    if (submission.contractSha256 !== contractSha256)
      throw new BadRequestException({
        code: "PAGE_CONTRACT_IDENTITY_MISMATCH",
      });
    const scenario = definition.scenarios.find(
      ({ scenarioId }) => scenarioId === submission.scenarioId,
    );
    if (!scenario)
      throw new BadRequestException({ code: "PAGE_SCENARIO_NOT_FOUND" });
    if (scenario.fixture.bindingId !== submission.fixtureBindingId)
      throw new BadRequestException({ code: "PAGE_FIXTURE_BINDING_MISMATCH" });
    return scenario;
  }

  private rejectBoundaryScenario(
    definition: ResolutionPageDefinition,
    scenario: ResolutionPageScenario,
  ): void {
    if (scenario.polarity !== "BOUNDARY") return;
    const rule = definition.validationRules.find(({ ruleId }) =>
      scenario.validationRuleIds.includes(ruleId),
    );
    throw new UnprocessableEntityException({
      code: rule?.reasonCode ?? "MESSAGE_TYPE_NOT_SUPPORTED",
      scenarioId: scenario.scenarioId,
      payloadGenerated: false,
      confirmedResolutionCreated: false,
      repairQueueCreated: false,
    });
  }

  private rejectUnhandledNegativeScenario(
    scenario: ResolutionPageScenario,
  ): void {
    const status = scenario.execution.expectedHttp.find(
      (candidate) => candidate >= 400 && candidate < 500,
    );
    if (
      scenario.polarity !== "NEGATIVE" ||
      hasExecutableNegativeTrigger(scenario) ||
      status === undefined
    )
      return;
    const code =
      this.scenarioCatalogue
        ?.get()
        .scenarios.find(({ scenarioId }) => scenarioId === scenario.scenarioId)
        ?.reasonCode ?? "VALIDATION_REJECTED";
    throw new HttpException(
      {
        code,
        payloadGenerated: false,
        confirmedResolutionCreated: false,
        repairQueueCreated: false,
      },
      status,
    );
  }

  private validateRouteBinding(
    submission: ResolutionPageSubmission,
    definition: ResolutionPageDefinition,
    scenario: ResolutionPageScenario,
  ): void {
    const route = submission.selectedRouteIdentity;
    const snapshot = submission.eligibilitySnapshot;
    if (
      definition.businessDomain === "PAYMENT" &&
      scenario.polarity === "POSITIVE" &&
      !paymentOwnAccountScenario(scenario.scenarioId) &&
      this.paymentRoutes &&
      (!route || !snapshot)
    )
      throw new ConflictException({
        code: "PAGE_ROUTE_BINDING_REQUIRED",
        payloadGenerated: false,
        confirmedResolutionCreated: false,
        repairQueueCreated: false,
      });
    if (!route && !snapshot) return;
    const contextSha256 = this.routeSelectionContextSha256(
      submission,
      definition,
      scenario,
    );
    if (!route || !snapshot)
      throw new ConflictException({
        code: "PAGE_ROUTE_ELIGIBILITY_CONFLICT",
        payloadGenerated: false,
        confirmedResolutionCreated: false,
        repairQueueCreated: false,
      });
    if (
      this.routeBindingConflicts(
        route,
        snapshot,
        definition,
        scenario,
        contextSha256,
      )
    )
      throw new ConflictException({
        code: "PAGE_ROUTE_ELIGIBILITY_CONFLICT",
        payloadGenerated: false,
        confirmedResolutionCreated: false,
        repairQueueCreated: false,
      });
    if (
      definition.messageFamily === "MT1_PACS008" ||
      definition.businessDomain !== "PAYMENT" ||
      !this.paymentRoutes
    )
      return;
    const candidates = this.paymentRoutes.atomicCandidates({
      messageType: definition.messageType,
      currency: textValue(submission.values, "context.currency"),
      bookingEntity: textValue(submission.values, "context.bookingEntity"),
      valueDate: textValue(submission.values, "context.valueDate"),
      fixtureBindingId: scenario.fixture.bindingId,
      servicerRelationship: scenario.servicerRelationship,
    });
    const selectedBankId =
      textValue(submission.values, "context.counterpartyBankServiceId") ||
      textValue(submission.values, "context.receiverBankServiceId");
    const selectedBic = this.bankServices.resolve(selectedBankId).bic;
    if (!route.rma)
      throw new ConflictException({ code: "SELECTED_ROUTE_RMA_REQUIRED" });
    const selectedRma = route.rma;
    const same = candidates.filter(
      (candidate) =>
        candidate.snapshot.sha256 === snapshot.snapshotId &&
        candidate.ssi.id === route.ssi.id &&
        candidate.ssi.version === route.ssi.version &&
        candidate.applicability.id === route.applicability.id &&
        candidate.applicability.version === route.applicability.version &&
        candidate.nostro.id === route.nostro.id &&
        candidate.nostro.version === route.nostro.version &&
        candidate.rma.id === selectedRma.id &&
        candidate.rma.version === selectedRma.version &&
        candidate.ssi.route["counterpartyBic"] === selectedBic &&
        route.routeId ===
          hashCanonical({
            ssi: route.ssi,
            applicability: route.applicability,
            nostro: route.nostro,
            rma: route.rma,
            contextSha256: route.contextSha256,
          }),
    );
    if (same.length !== 1)
      throw new ConflictException({
        code:
          same.length === 0
            ? "PAGE_SELECTED_ROUTE_NOT_ELIGIBLE"
            : "PAGE_SELECTED_ROUTE_AMBIGUOUS",
        payloadGenerated: false,
        confirmedResolutionCreated: false,
        repairQueueCreated: false,
      });
    const relationship = scenario.servicerRelationship;
    if (relationship && relationship !== "NOT_APPLICABLE") {
      if (
        !servicerRelationshipMatches(
          relationship,
          same[0]!.ssi.route["counterpartyBic"] ?? "",
          same[0]!.nostro.accountServicerBic,
        )
      )
        throw new ConflictException({
          code: "SSI_NOSTRO_SERVICER_RELATIONSHIP_MISMATCH",
          expectedRelationship: relationship,
          payloadGenerated: false,
          confirmedResolutionCreated: false,
          repairQueueCreated: false,
        });
    }
  }

  private routeBindingConflicts(
    route: NonNullable<ResolutionPageSubmission["selectedRouteIdentity"]>,
    snapshot: NonNullable<ResolutionPageSubmission["eligibilitySnapshot"]>,
    definition: ResolutionPageDefinition,
    scenario: ResolutionPageScenario,
    contextSha256: string,
  ): boolean {
    return (
      route.definitionId !== definition.definitionId ||
      route.definitionVersion !== definition.definitionVersion ||
      route.fixtureBindingId !== scenario.fixture.bindingId ||
      snapshot.contextSha256 !== contextSha256 ||
      !/^[a-f0-9]{64}$/i.test(route.contextSha256) ||
      (definition.messageFamily === "MT1_PACS008" &&
        route.contextSha256 !== contextSha256) ||
      (definition.messageFamily !== "MT1_PACS008" &&
        this.snapshots !== undefined &&
        snapshot.snapshotId !== this.snapshots.current().sha256)
    );
  }

  private routeSelectionContextSha256(
    submission: ResolutionPageSubmission,
    definition: ResolutionPageDefinition,
    scenario: ResolutionPageScenario,
  ): string {
    const base = {
      scenarioId: submission.scenarioId,
      messageType: definition.messageType,
      sequence: definition.sequences[0]?.sequenceId ?? "",
      currency: textValue(submission.values, "context.currency"),
      bookingEntity: textValue(submission.values, "context.bookingEntity"),
      valueDate: textValue(submission.values, "context.valueDate"),
      fixtureBindingId: scenario.fixture.bindingId,
    };
    return hashCanonical(
      definition.messageFamily === "MT1_PACS008"
        ? {
            scenarioId: base.scenarioId,
            messageType: base.messageType,
            profileId: definition.profile.profileId,
            businessService: definition.profile.businessService ?? "",
            settlementContext:
              textValue(submission.values, "context.settlementContext") ||
              String(
                scenario.inputValues?.["context.settlementContext"] ?? "",
              ),
            sequence: base.sequence,
            currency: base.currency,
            bookingEntity: base.bookingEntity,
            valueDate: base.valueDate,
            fixtureBindingId: base.fixtureBindingId,
          }
        : base,
    );
  }

  private validateScenarioFieldOptions(
    fieldOptions: Readonly<Record<string, string>>,
    definition: ResolutionPageDefinition,
  ): void {
    const supportedByTag = this.supportedScenarioOptions(definition);
    for (const [tag, option] of Object.entries(fieldOptions)) {
      const supportedOptions = supportedByTag.get(tag);
      if (!supportedOptions)
        throw new UnprocessableEntityException({
          code: "FIELD_NOT_SUPPORTED",
          tag,
          payloadGenerated: false,
          confirmedResolutionCreated: false,
          repairQueueCreated: false,
        });
      if (supportedOptions.size > 0 && !supportedOptions.has(option))
        throw new UnprocessableEntityException({
          code: "OPTION_CONSTRAINT_VIOLATION",
          tag,
          option,
          payloadGenerated: false,
          confirmedResolutionCreated: false,
          repairQueueCreated: false,
        });
    }
  }

  private supportedScenarioOptions(
    definition: ResolutionPageDefinition,
  ): Map<string, Set<string>> {
    const supportedByTag = new Map<string, Set<string>>();
    for (const field of definition.fields) {
      if (!field.swiftTag) continue;
      const options = supportedByTag.get(field.swiftTag) ?? new Set<string>();
      if (field.swiftOption) options.add(field.swiftOption);
      supportedByTag.set(field.swiftTag, options);
    }
    for (const mapping of this.mappingCatalogues?.get(
      definition.standardsRelease,
    ).mappings ?? []) {
      if (mapping.messageType !== definition.messageType || !mapping.tag)
        continue;
      const options = supportedByTag.get(mapping.tag) ?? new Set<string>();
      if (mapping.option) options.add(mapping.option);
      supportedByTag.set(mapping.tag, options);
    }
    return supportedByTag;
  }

  private fixtureCandidates(
    context: FinControlledFixtureQuery,
    scenario: ResolutionPageScenario,
    counterpartyBic: string,
  ): FinControlledFixtureCandidate[] {
    const exact = this.fixtures.list({
      ...context,
      bindingId: scenario.fixture.bindingId,
    }).candidates;
    if (
      scenario.fixture.isolation === "BOUNDARY" ||
      exact.some((candidate) => candidate.counterpartyBic === counterpartyBic)
    )
      return exact;
    const groupedFromQuery = this.fixtures
      .list({
        ...context,
        bindingId: scenario.fixture.bindingId,
        includeFixtureGroup: true,
      })
      .candidates.filter(
        (candidate) =>
          candidate.fixtureGroupId === scenario.fixture.bindingId &&
          candidate.messageType === context.messageType &&
          candidate.sequence === context.sequence &&
          candidate.currency === context.currency &&
          candidate.bookingEntity === context.bookingEntity &&
          candidate.effectiveFrom <= context.valueDate &&
          candidate.effectiveTo >= context.valueDate,
      );
    const grouped = groupedFromQuery.some(
      (candidate) => candidate.counterpartyBic === counterpartyBic,
    )
      ? groupedFromQuery
      : (this.fixtures.catalogue?.() ?? []).filter(
          (candidate) =>
            candidate.fixtureGroupId === scenario.fixture.bindingId &&
            candidate.messageType === context.messageType &&
            candidate.sequence === context.sequence &&
            candidate.currency === context.currency &&
            candidate.bookingEntity === context.bookingEntity &&
            candidate.effectiveFrom <= context.valueDate &&
            candidate.effectiveTo >= context.valueDate,
        );
    return [...exact, ...grouped].filter(
      (candidate, index, candidates) =>
        candidates.findIndex(({ id }) => id === candidate.id) === index,
    );
  }

  private mismatchedRole(
    roleValues: Readonly<Record<string, string>>,
    fieldsById: ReadonlyMap<string, PageParameterField>,
    scenario: ResolutionPageScenario,
    candidate: FinControlledFixtureCandidate,
  ): [string, string] | undefined {
    return Object.entries(roleValues).find(([role, bic]) => {
      const field = [...fieldsById.values()].find(
        (item) => item.lookup?.targetRole === role,
      );
      const policy = scenario.fieldPolicies?.find(
        ({ fieldId }) => fieldId === field?.fieldId,
      );
      return (
        policy?.inputOwnership !== "TRANSACTION_USER" &&
        candidate.roleValues[role] !== bic
      );
    });
  }

  private governValues(
    submission: ResolutionPageSubmission,
    fieldsById: ReadonlyMap<string, PageParameterField>,
    scenario: ResolutionPageScenario,
  ): {
    readonly submission: ResolutionPageSubmission;
    readonly ignoredFieldIds: readonly string[];
  } {
    const unknown = Object.keys(submission.values).find(
      (fieldId) => !fieldsById.has(fieldId),
    );
    if (unknown)
      throw new BadRequestException({
        code: "PAGE_SUBMISSION_FIELD_UNKNOWN",
        fieldId: unknown,
      });
    const policies = new Map(
      scenario.fieldPolicies?.map((policy) => [policy.fieldId, policy]) ?? [],
    );
    const values: Record<string, string | boolean> = {
      ...scenario.inputValues,
    };
    const ignoredFieldIds: string[] = [];
    for (const [fieldId, value] of Object.entries(submission.values)) {
      this.applySubmittedValue(
        fieldId,
        value,
        policies,
        scenario,
        values,
        ignoredFieldIds,
      );
    }
    for (const field of fieldsById.values()) {
      this.applyGovernedField(field, policies, values);
    }
    return {
      submission: { ...submission, values },
      ignoredFieldIds,
    };
  }

  private applySubmittedValue(
    fieldId: string,
    value: string | boolean,
    policies: ReadonlyMap<
      string,
      NonNullable<ResolutionPageScenario["fieldPolicies"]>[number]
    >,
    scenario: ResolutionPageScenario,
    values: Record<string, string | boolean>,
    ignoredFieldIds: string[],
  ): void {
    const policy = policies.get(fieldId);
    if (policy?.processingPolicy === "IGNORE_AUDIT") {
      ignoredFieldIds.push(fieldId);
      delete values[fieldId];
      return;
    }
    if (policy?.inputOwnership === "SSI_DERIVED")
      throw new BadRequestException({
        code: "PAGE_SUBMISSION_SSI_DERIVED_OVERRIDE",
        fieldId,
      });
    if (
      policy?.inputOwnership === "SCENARIO_FIXED" &&
      (!Object.hasOwn(scenario.inputValues ?? {}, fieldId) ||
        scenario.inputValues?.[fieldId] !== value)
    )
      throw new BadRequestException({
        code: "PAGE_SUBMISSION_SCENARIO_FIXED_OVERRIDE",
        fieldId,
      });
    values[fieldId] = value;
  }

  private applyGovernedField(
    field: PageParameterField,
    policies: ReadonlyMap<
      string,
      NonNullable<ResolutionPageScenario["fieldPolicies"]>[number]
    >,
    values: Record<string, string | boolean>,
  ): void {
    const policy = policies.get(field.fieldId);
    if (
      policy?.processingPolicy === "IGNORE_AUDIT" ||
      policy?.inputOwnership === "SSI_DERIVED"
    )
      return;
    const value =
      values[field.fieldId] ??
      (policy?.inputOwnership === "SCENARIO_FIXED"
        ? undefined
        : field.defaultValue);
    if (
      (policy?.required ?? field.required) &&
      (value === undefined || String(value).trim() === "")
    )
      throw new BadRequestException({
        code: "PAGE_SUBMISSION_FIELD_REQUIRED",
        fieldId: field.fieldId,
      });
    this.validateDataType(field, value);
    this.validateOption(field, value);
    this.validateConstraints(field, value);
    if (value !== undefined && value !== "") values[field.fieldId] = value;
  }

  private validateOption(
    field: PageParameterField,
    value: SubmittedValue,
  ): void {
    if (!field.options?.length || value === undefined || value === "") return;
    if (field.options.some((option) => option.value === value)) return;
    throw new BadRequestException({
      code: "PAGE_SUBMISSION_OPTION_INVALID",
      fieldId: field.fieldId,
    });
  }

  private parseSubmission(input: unknown): ResolutionPageSubmission {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new BadRequestException({ code: "PAGE_SUBMISSION_INVALID" });
    const candidate = input as Record<string, unknown>;
    const textKeys = [
      "definitionId",
      "definitionVersion",
      "contractSha256",
      "scenarioId",
      "fixtureBindingId",
    ];
    if (
      textKeys.some(
        (key) =>
          typeof candidate[key] !== "string" || !String(candidate[key]).trim(),
      )
    )
      throw new BadRequestException({
        code: "PAGE_SUBMISSION_IDENTITY_REQUIRED",
      });
    const values = candidate["values"];
    if (!values || typeof values !== "object" || Array.isArray(values))
      throw new BadRequestException({ code: "PAGE_SUBMISSION_VALUES_INVALID" });
    if (
      Object.values(values).some(
        (value) => typeof value !== "string" && typeof value !== "boolean",
      )
    )
      throw new BadRequestException({
        code: "PAGE_SUBMISSION_VALUE_TYPE_INVALID",
      });
    return candidate as unknown as ResolutionPageSubmission;
  }

  private validateDataType(
    field: PageParameterField,
    value: string | boolean | undefined,
  ): void {
    if (value === undefined || value === "") return;
    if (field.dataType === "BOOLEAN" && typeof value !== "boolean")
      this.invalidValue(field, "PAGE_SUBMISSION_BOOLEAN_INVALID");
    if (field.dataType !== "BOOLEAN" && typeof value !== "string")
      this.invalidValue(field, "PAGE_SUBMISSION_STRING_INVALID");
    if (field.dataType === "DATE" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value)))
      this.invalidValue(field, "PAGE_SUBMISSION_DATE_INVALID");
    if (field.dataType === "ISO_CURRENCY" && !/^[A-Z]{3}$/.test(String(value)))
      this.invalidValue(field, "PAGE_SUBMISSION_CURRENCY_INVALID");
  }

  private validateConstraints(
    field: PageParameterField,
    value: string | boolean | undefined,
  ): void {
    if (value === undefined || value === "") return;
    const text = String(value);
    for (const constraint of field.constraints) {
      const invalid =
        (constraint.kind === "PATTERN" &&
          !new RegExp(String(constraint.value)).test(text)) ||
        (constraint.kind === "MIN_LENGTH" &&
          text.length < Number(constraint.value)) ||
        (constraint.kind === "MAX_LENGTH" &&
          text.length > Number(constraint.value)) ||
        (constraint.kind === "ONE_OF" &&
          !(constraint.value as readonly string[]).includes(text));
      if (invalid)
        this.invalidValue(field, "PAGE_SUBMISSION_CONSTRAINT_VIOLATION");
    }
  }

  private invalidValue(field: PageParameterField, code: string): never {
    throw new BadRequestException({ code, fieldId: field.fieldId });
  }

  private roleValues(
    submission: ResolutionPageSubmission,
    fieldsById: ReadonlyMap<string, PageParameterField>,
  ): Record<string, string> {
    return Object.fromEntries(
      [...fieldsById.values()]
        .filter(
          (field) =>
            field.lookup?.targetRole &&
            textValue(submission.values, field.fieldId),
        )
        .map((field) => {
          const role = field.lookup!.targetRole!;
          const bic = this.bankServices.resolve(
            textValue(submission.values, field.fieldId),
          ).bic;
          const party = this.roleSupplements(
            submission,
            fieldsById,
            "rolePartyIdentifiers.",
          )[role];
          const account = this.roleSupplements(
            submission,
            fieldsById,
            "roleAccountReferences.",
          )[role];
          const prefix = party || (account ? `/${account}` : "");
          return [role, prefix ? `${prefix}\n${bic}` : bic];
        }),
    );
  }

  private roleSupplements(
    submission: ResolutionPageSubmission,
    fieldsById: ReadonlyMap<string, PageParameterField>,
    pathPrefix: string,
  ): Record<string, string> {
    return Object.fromEntries(
      [...fieldsById.values()]
        .filter((field) => field.path.startsWith(pathPrefix))
        .map((field) => [
          field.path.slice(pathPrefix.length),
          textValue(submission.values, field.fieldId),
        ])
        .filter(([, value]) => value),
    );
  }

  private outcome(value: unknown): ResolutionPageExecutionOutcome {
    if (
      value === "RESOLVED" ||
      value === "NOT_REQUIRED" ||
      value === "NO_ELIGIBLE_SSI"
    )
      return value;
    return "REFERENCE_ONLY";
  }

  private fieldResult(
    raw: Readonly<Record<string, unknown>>,
    governedFields: readonly PageParameterField[],
    roleBankServiceIds: Readonly<Record<string, string>>,
    partyIdentifiers: Readonly<Record<string, string>>,
    accountReferences: Readonly<Record<string, string>>,
    evidenceIds: readonly string[],
  ): ResolutionPageFieldResult {
    const sequenceId = optionalText(raw, "sequence") ?? "MESSAGE";
    const swiftTag = optionalText(raw, "tag") ?? "";
    const governed = governedFields.find(
      (field) => field.sequenceId === sequenceId && field.swiftTag === swiftTag,
    );
    const role = this.fieldRole(raw, governed);
    const reasonCode = optionalText(raw, "reasonCode");
    const value = this.resolvedFieldValue(
      raw,
      reasonCode,
      roleBankServiceIds[role],
    );
    const institution = value ? this.institution(value) : undefined;
    const provenance = this.provenance(raw["provenance"]);
    const resolutionStatus = this.resolutionStatus(raw["resolutionStatus"]);
    return {
      fieldId: `${sequenceId}.${swiftTag}`,
      sequenceId,
      settlementLeg: optionalText(raw, "settlementLeg") ?? sequenceId,
      swiftTag,
      swiftOption: optionalText(raw, "option") ?? governed?.swiftOption ?? "",
      fieldName:
        optionalText(raw, "officialFieldName") ?? governed?.label ?? role,
      role,
      outcome: this.outcome(resolutionStatus),
      resolutionStatus,
      ...(value ? { value } : {}),
      ...(institution ? { institution } : {}),
      ...(partyIdentifiers[role]
        ? { partyIdentifier: partyIdentifiers[role] }
        : {}),
      ...(accountReferences[role]
        ? { accountReference: accountReferences[role] }
        : {}),
      ...(reasonCode ? { reasonCode } : {}),
      provenance,
      evidenceIds,
    };
  }

  private fieldRole(
    raw: Readonly<Record<string, unknown>>,
    governed: PageParameterField | undefined,
  ): string {
    return (
      governed?.lookup?.targetRole ??
      optionalText(raw, "officialRole") ??
      governed?.officialRole ??
      governed?.label ??
      "UNSPECIFIED_ROLE"
    );
  }

  private resolvedFieldValue(
    raw: Readonly<Record<string, unknown>>,
    reasonCode: string | undefined,
    bankServiceId: string | undefined,
  ): string | undefined {
    const resolved = optionalText(raw, "resolvedValue");
    if (resolved) return resolved;
    if (reasonCode !== "TRANSACTION_CONTEXT_PROVIDED" || !bankServiceId)
      return undefined;
    return this.bankServices.resolve(bankServiceId).bic;
  }

  private resolutionStatus(value: unknown): ResolutionStatus {
    if (
      value === "RESOLVED" ||
      value === "NOT_REQUIRED" ||
      value === "NO_ELIGIBLE_SSI" ||
      value === "N_A"
    )
      return value;
    throw new BadRequestException({
      code: "PAGE_EXECUTION_FIELD_STATUS_INVALID",
    });
  }

  private institution(value: string): ResolutionPageFieldResult["institution"] {
    const bic = value.split(/\r?\n/).at(-1)?.trim() ?? "";
    if (!/^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/.test(bic)) return undefined;
    const bank = this.bankServices.search(bic).find((item) => item.bic === bic);
    return {
      ...(bank ? { bankServiceId: bank.bankServiceId, name: bank.name } : {}),
      bic,
    };
  }

  private provenance(value: unknown): ResolutionPageFieldResult["provenance"] {
    const source =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Readonly<Record<string, unknown>>)
        : {};
    const catalogueVersion = optionalText(source, "catalogueVersion");
    const sourceArtifactId = optionalText(source, "sourceArtifactId");
    const sourceArtifactHash = optionalText(source, "sourceArtifactHash");
    const fieldProfileArtifactId = optionalText(
      source,
      "fieldProfileArtifactId",
    );
    const fieldProfileEvidencePages = optionalNumberArray(
      source,
      "fieldProfileEvidencePages",
    );
    const provenanceSource = optionalText(source, "source");
    const sourceRecordId = optionalText(source, "sourceRecordId");
    const ownerSide = optionalText(source, "ownerSide");
    const version = optionalText(source, "version");
    const canonicalRouteNodeId = optionalText(source, "canonicalRouteNodeId");
    return {
      ...(catalogueVersion ? { catalogueVersion } : {}),
      ...(sourceArtifactId ? { sourceArtifactId } : {}),
      ...(sourceArtifactHash ? { sourceArtifactHash } : {}),
      ...(fieldProfileArtifactId ? { fieldProfileArtifactId } : {}),
      ...(fieldProfileEvidencePages ? { fieldProfileEvidencePages } : {}),
      ...(provenanceSource ? { source: provenanceSource } : {}),
      ...(sourceRecordId ? { sourceRecordId } : {}),
      ...(ownerSide ? { ownerSide } : {}),
      ...(version ? { version } : {}),
      ...(canonicalRouteNodeId ? { canonicalRouteNodeId } : {}),
    };
  }
}
