import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import type {
  ResolutionPageDefinition,
  ResolutionPageExecutionResult,
  ResolutionPageEvidenceCard,
  ResolutionPageFieldResult,
  ResolutionPageScenario,
  ResolutionPageSubmission,
} from "@ssi/contracts";
import { scenarioNvrOutcome } from "./page-parameter-validation-disposition";
import { BankServiceDirectory } from "../bank-service-directory";
import { hashCanonical } from "../canonical-json";
import {
  mt2ControlledProfile,
  type Mt2SettlementResolutionRequest,
} from "../mt2-settlement-request.policy";
import { NostroApplicationService } from "../nostro/nostro-application.service";
import type { NostroRecord } from "../nostro/nostro.repository";
import { scalarText } from "../scalar-text";
import {
  eligiblePaymentOwnAccounts,
  paymentOwnAccountScenario,
  resolvePaymentOwnAccountPair,
  type PaymentOwnAccountScenario,
} from "./payment-own-account-eligibility.policy";

type Json = Readonly<Record<string, unknown>>;

export interface PaymentSettlementResolutionPort {
  resolve(request: Mt2SettlementResolutionRequest): unknown;
}

export const PAYMENT_SETTLEMENT_RESOLUTION_PORT = Symbol(
  "PAYMENT_SETTLEMENT_RESOLUTION_PORT",
);

export interface PaymentResolutionPageExecutionContext {
  readonly definition: ResolutionPageDefinition;
  readonly scenario: ResolutionPageScenario;
  readonly submission: ResolutionPageSubmission;
}

const text = (
  values: ResolutionPageSubmission["values"],
  fieldId: string,
): string => {
  const value = values[fieldId];
  return typeof value === "string" ? value.trim() : "";
};

const object = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};

const numeric = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) ? value : undefined;

const evidenceSourceRecordType = (
  field: ResolutionPageFieldResult,
): "UPSTREAM_ATTESTATION" | "OWN_NOSTRO_ACCOUNT" | "BANK_SSI" => {
  if (field.provenance.source === "TRANSACTION_CONTEXT")
    return "UPSTREAM_ATTESTATION";
  return field.swiftTag === "53" ? "OWN_NOSTRO_ACCOUNT" : "BANK_SSI";
};

const jsonWireRepresentation = (value: Json): unknown => {
  const serialized = JSON.stringify(value);
  return JSON.parse(serialized) as unknown;
};

const previousMessageType = (
  messageType: string,
  scenarioId: string,
  values: ResolutionPageSubmission["values"],
): string | undefined => {
  const supplied = text(values, "context.previousMessageType");
  if (supplied) return supplied;
  if (scenarioId === "MT205-OP-INITIAL-MT200-201-EQUIVALENCE") return "MT200";
  if (messageType === "MT205COV") return "MT202COV";
  if (messageType === "MT205") return "MT202";
  return undefined;
};

const PREVIOUS_COVER_TYPES = new Set([
  "MT202COV",
  "MT205COV",
  "GOVERNED_EQUIVALENT_COVER",
]);

@Injectable()
export class PaymentResolutionPageSubmissionAdapter {
  constructor(
    @Inject(PAYMENT_SETTLEMENT_RESOLUTION_PORT)
    private readonly settlements: PaymentSettlementResolutionPort,
    private readonly bankServices: BankServiceDirectory,
    @Optional() private readonly nostros?: NostroApplicationService,
  ) {}

  execute(
    context: PaymentResolutionPageExecutionContext,
  ): ResolutionPageExecutionResult {
    this.requireProfile(context.definition);
    const request = this.request(context);
    const raw = this.requireResolverSuccess(this.settlements.resolve(request));
    this.requireSelectedRouteMatch(context.submission, raw);
    return this.result(context, request, raw);
  }

  private requireSelectedRouteMatch(
    submission: ResolutionPageSubmission,
    raw: Json,
  ): void {
    const selected = submission.selectedRouteIdentity;
    if (!selected) return;
    if (!selected.rma?.decisionId)
      throw new ConflictException({
        code: "SELECTED_ROUTE_RMA_REQUIRED",
        payloadGenerated: false,
      });
    const chosen = object(
      raw["chosenRoute"] ?? object(raw["mx"])["chosenRoute"],
    );
    if (
      chosen["ssiId"] === selected.ssi.id &&
      chosen["ssiVersion"] === selected.ssi.version &&
      (chosen["applicabilityId"] ?? chosen["matchedApplicabilityId"]) ===
        selected.applicability.id &&
      chosen["applicabilityVersion"] === selected.applicability.version &&
      chosen["nostroId"] === selected.nostro.id &&
      chosen["nostroVersion"] === selected.nostro.version &&
      chosen["rmaId"] === selected.rma?.id &&
      chosen["rmaVersion"] === selected.rma?.version &&
      chosen["routeBindingId"] === selected.routeId &&
      chosen["contextSnapshotId"] === selected.contextSha256
    )
      return;
    throw new ConflictException({
      code: "PAGE_SELECTED_ROUTE_RESULT_MISMATCH",
      payloadGenerated: false,
      confirmedResolutionCreated: false,
      repairQueueCreated: false,
    });
  }

  private requireResolverSuccess(response: unknown): Json {
    if (!response || typeof response !== "object" || Array.isArray(response))
      throw new BadGatewayException({
        code: "PAYMENT_RESOLVER_RESPONSE_INVALID",
        payloadGenerated: false,
      });
    const raw = response as Json;
    const mx = object(raw["mx"]);
    const status = numeric(mx["httpStatus"] ?? raw["httpStatus"]);
    if (status !== undefined && status >= 400)
      throw new HttpException(raw, status);
    const decision = mx["decision"] ?? raw["decision"];
    const code = mx["code"] ?? raw["code"];
    const payloadGenerated = mx["payloadGenerated"] ?? raw["payloadGenerated"];
    const chosen = object(raw["chosenRoute"] ?? mx["chosenRoute"]);
    const selectedSsi = this.identity(chosen["ssiId"], chosen["ssiVersion"]);
    const selectedApplicability = this.identity(
      chosen["applicabilityId"] ?? chosen["matchedApplicabilityId"],
      chosen["applicabilityVersion"],
    );
    const ownAccountResolved =
      code === "RESOLVED" &&
      (mx["resolutionDomain"] ?? raw["resolutionDomain"]) === "OWN_SSI_NOSTRO";
    if (
      status !== 200 ||
      decision !== "RESOLVED" ||
      (code !== "SSI_RESOLVED" && !ownAccountResolved) ||
      payloadGenerated !== false ||
      (!ownAccountResolved && (!selectedSsi || !selectedApplicability))
    )
      throw new BadGatewayException({
        code: "PAYMENT_RESOLVER_RESPONSE_INVALID",
        payloadGenerated: false,
      });
    return raw;
  }

  private requireProfile(definition: ResolutionPageDefinition): void {
    const expectedBusinessService = definition.messageType.endsWith("COV")
      ? "swift.cbprplus.cov.04"
      : "swift.cbprplus.04";
    if (
      definition.businessDomain !== "PAYMENT" ||
      !["MT202", "MT202COV", "MT205", "MT205COV"].includes(
        definition.messageType,
      ) ||
      definition.profile.messageDefinitionId !== "pacs.009.001.08" ||
      definition.profile.businessService !== expectedBusinessService
    )
      throw new BadRequestException({ code: "PAYMENT_PAGE_PROFILE_INVALID" });
  }

  private request({
    definition,
    scenario,
    submission,
  }: PaymentResolutionPageExecutionContext): Mt2SettlementResolutionRequest {
    const values = submission.values;
    const governedValues = { ...values, ...scenario.inputValues };
    const scenarioCode = paymentOwnAccountScenario(scenario.scenarioId);
    const receiverBankServiceId = scenarioCode
      ? this.requiredText(values, "context.receiverBankServiceId")
      : "";
    const counterpartyBankServiceId = scenarioCode
      ? receiverBankServiceId
      : this.requiredText(values, "context.counterpartyBankServiceId");
    const counterparty = this.bankServices.resolve(counterpartyBankServiceId);
    if (!counterparty.country?.trim())
      throw new BadRequestException({
        code: "BANK_SERVICE_COUNTRY_REQUIRED",
        bankServiceId: counterpartyBankServiceId,
      });
    const transactionReference = this.requiredText(
      values,
      "context.transactionReference",
    );
    const sourceMessageType = definition.messageType;
    const controlledProfile = mt2ControlledProfile(sourceMessageType);
    if (!controlledProfile)
      throw new BadRequestException({ code: "PAYMENT_PAGE_PROFILE_INVALID" });
    const previousType = previousMessageType(
      sourceMessageType,
      scenario.scenarioId,
      governedValues,
    );
    const previousReference =
      text(values, "context.previousTransactionReference") ||
      transactionReference;
    const ownAccounts = scenarioCode
      ? this.deriveOwnAccounts({
          scenarioCode,
          receiverBic: counterparty.bic,
          currency: this.requiredText(values, "context.currency"),
          bookingEntity: this.requiredText(values, "context.bookingEntity"),
          valueDate: this.requiredText(values, "context.valueDate"),
        })
      : undefined;
    const request: Mt2SettlementResolutionRequest & Record<string, unknown> = {
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      businessFunction: "INTERBANK_TRANSFER",
      paymentLeg: "INTERBANK_SETTLEMENT",
      direction: "OUTBOUND",
      paymentDirection: "OUTWARD",
      localBankRole: "INSTRUCTING_AGENT",
      profileId: controlledProfile.profileId,
      pairedEvidenceProfileId: controlledProfile.pairedEvidenceProfileId,
      amount: text(governedValues, "context.amount"),
      sourceMessageType,
      messageType: definition.profile.messageDefinitionId ?? "",
      businessService: definition.profile.businessService ?? "",
      transactionReference,
      currency: this.requiredText(values, "context.currency"),
      bookingEntity: this.requiredText(values, "context.bookingEntity"),
      valueDate: this.requiredText(values, "context.valueDate"),
      counterpartyCountry: counterparty.country.trim(),
      counterpartyBankServiceId,
      ...(submission.selectedRouteIdentity
        ? {
            selectedSsiId: submission.selectedRouteIdentity.ssi.id,
            selectedSsiVersion: submission.selectedRouteIdentity.ssi.version,
            selectedApplicabilityId:
              submission.selectedRouteIdentity.applicability.id,
            selectedApplicabilityVersion:
              submission.selectedRouteIdentity.applicability.version,
            selectedNostroId: submission.selectedRouteIdentity.nostro.id,
            selectedNostroVersion:
              submission.selectedRouteIdentity.nostro.version,
            ...(submission.selectedRouteIdentity.rma
              ? {
                  selectedRmaId: submission.selectedRouteIdentity.rma.id,
                  selectedRmaVersion:
                    submission.selectedRouteIdentity.rma.version,
                  selectedRmaDecisionId:
                    submission.selectedRouteIdentity.rma.decisionId,
                }
              : {}),
            routeBindingId: submission.selectedRouteIdentity.routeId,
            contextSnapshotId: submission.selectedRouteIdentity.contextSha256,
            ...(submission.eligibilitySnapshot
              ? {
                  databaseSnapshotId: submission.eligibilitySnapshot.snapshotId,
                  snapshotIdentityMethod:
                    submission.eligibilitySnapshot.snapshotIdentityMethod,
                }
              : {}),
          }
        : {}),
      ...(scenarioCode
        ? {
            scenarioCode,
            receiverBankServiceId,
            ownDebitAccountId: ownAccounts!.debit.id,
            ownDebitAccountVersion: ownAccounts!.debit.version,
            ownCreditAccountId: ownAccounts!.credit.id,
            ownCreditAccountVersion: ownAccounts!.credit.version,
          }
        : {}),
      ...this.previousMessageContext(
        sourceMessageType,
        previousType,
        previousReference,
        governedValues,
      ),
      ...(sourceMessageType.endsWith("COV")
        ? this.coverContext(governedValues)
        : {}),
      ...this.scenarioValidationFixture(governedValues),
    };
    return request;
  }

  private deriveOwnAccounts(input: {
    readonly scenarioCode: PaymentOwnAccountScenario;
    readonly receiverBic: string;
    readonly currency: string;
    readonly bookingEntity: string;
    readonly valueDate: string;
  }): { readonly debit: NostroRecord; readonly credit: NostroRecord } {
    const eligible = eligiblePaymentOwnAccounts(
      this.nostros?.list() ?? [],
      input,
    );
    const pair = resolvePaymentOwnAccountPair(
      eligible,
      input.scenarioCode,
      input.receiverBic,
    );
    if (!pair)
      throw new BadRequestException({
        code: "OWN_ACCOUNT_ROUTE_NOT_ELIGIBLE",
        receiverBic: input.receiverBic,
        currency: input.currency,
      });
    return pair;
  }

  private previousMessageContext(
    sourceMessageType: string,
    previousType: string | undefined,
    previousReference: string,
    values: ResolutionPageSubmission["values"],
  ): Readonly<Record<string, unknown>> {
    if (sourceMessageType === "MT205COV")
      return { previousMessage: this.previousCoverMessage(values) };
    if (!previousType) return {};
    const identity = {
      type: previousType,
      "20": previousReference,
      "21": previousReference,
    };
    const nonCoverAttested = values["context.previousMessageNonCoverAttested"];
    const attestationId = text(values, "context.previousMessageAttestationId");
    const attestationVersion = text(
      values,
      "context.previousMessageAttestationVersion",
    );
    const artifactSha256 = text(
      values,
      "context.previousMessageArtifactSha256",
    );
    if (
      sourceMessageType === "MT205" &&
      (nonCoverAttested !== true ||
        !attestationId ||
        !attestationVersion ||
        !/^[a-f\d]{64}$/i.test(artifactSha256))
    )
      throw new BadRequestException({
        code: "MT205_PREDECESSOR_ATTESTATION_REQUIRED",
      });
    return {
      previousMessage: {
        ...identity,
        ...(sourceMessageType === "MT205"
          ? {
              nonCoverAttested: true as const,
              attestationId,
              attestationVersion,
              artifactSha256,
            }
          : {}),
      },
      ...(sourceMessageType === "MT205" &&
      (previousType === "MT200" || previousType === "MT201")
        ? { initialTransferType: previousType }
        : {}),
    };
  }

  private previousCoverMessage(
    values: ResolutionPageSubmission["values"],
  ): NonNullable<Mt2SettlementResolutionRequest["previousMessage"]> {
    const type = this.requiredText(values, "context.previousMessageType");
    if (!PREVIOUS_COVER_TYPES.has(type))
      throw new BadRequestException({
        code: "PAYMENT_PREVIOUS_COVER_TYPE_INVALID",
      });
    const artifactSha256 = this.requiredText(
      values,
      "context.previousMessageArtifactSha256",
    );
    if (!/^[a-f\d]{64}$/i.test(artifactSha256))
      throw new BadRequestException({
        code: "PAYMENT_PREVIOUS_ARTIFACT_SHA256_INVALID",
      });
    const equivalentCoverRuleRecordId = text(
      values,
      "context.equivalentCoverRuleRecordId",
    );
    const equivalentCoverRuleRecordVersion = text(
      values,
      "context.equivalentCoverRuleRecordVersion",
    );
    if (
      type === "GOVERNED_EQUIVALENT_COVER" &&
      (!equivalentCoverRuleRecordId || !equivalentCoverRuleRecordVersion)
    )
      throw new BadRequestException({
        code: "PAYMENT_EQUIVALENT_COVER_RULE_REQUIRED",
      });
    return {
      type,
      "20": this.requiredText(values, "context.previousMessage20"),
      "21": this.requiredText(values, "context.previousMessage21"),
      "121": this.requiredText(values, "context.previousMessage121"),
      "A.52A": this.requiredText(values, "context.previousMessageA52"),
      "A.58A": this.requiredText(values, "context.previousMessageA58"),
      sequenceB: {
        "50A": this.requiredText(values, "context.previousMessageSequenceB50A"),
        "59": this.requiredText(values, "context.previousMessageSequenceB59"),
      },
      artifactSha256,
      artifactVersion: this.requiredText(
        values,
        "context.previousMessageArtifactVersion",
      ),
      ...(type === "GOVERNED_EQUIVALENT_COVER"
        ? {
            equivalentCoverRuleRecordId,
            equivalentCoverRuleRecordVersion,
          }
        : {}),
    };
  }

  private coverContext(
    values: ResolutionPageSubmission["values"],
  ): Readonly<Record<string, unknown>> {
    return {
      incoming21: this.requiredText(values, "context.swift21NONE"),
      incoming121: this.requiredText(values, "context.swift121NONE"),
      field32A: this.swift32AFromTypedTransaction(values),
      block3: {
        "119": this.requiredText(values, "context.swift119NONE"),
      },
      underlyingCustomerCreditTransfer: true,
      sequenceB: {
        "50A": this.requiredText(values, "context.sequenceB50A"),
        "59": this.requiredText(values, "context.sequenceB59"),
      },
    };
  }

  private swift32AFromTypedTransaction(
    values: ResolutionPageSubmission["values"],
  ): string {
    const valueDate = this.requiredText(values, "context.valueDate");
    const currency = this.requiredText(values, "context.currency");
    const amount = this.requiredText(values, "context.amount");
    const compactDate = valueDate.replaceAll("-", "").slice(-6);
    if (!/^\d{6}$/.test(compactDate) || !/^[A-Z]{3}$/.test(currency))
      throw new BadRequestException({
        code: "PAYMENT_TYPED_TRANSACTION_CONTEXT_INVALID",
      });
    return `${compactDate}${currency}${amount.replace(".", ",")}`;
  }

  private scenarioValidationFixture(
    values: ResolutionPageSubmission["values"],
  ): Readonly<Record<string, unknown>> {
    const intermediaryBankServiceId = text(
      values,
      "fixture.intermediaryBankServiceId",
    );
    const senderCountry = text(values, "fixture.senderCountry");
    const receiverCountry = text(values, "fixture.receiverCountry");
    return {
      ...(intermediaryBankServiceId
        ? {
            intermediaryBankServiceId,
            ...(values["fixture.accountWithBankMissing"] === true
              ? { accountWithBankServiceId: null }
              : {}),
          }
        : {}),
      ...(values["fixture.coverSequenceBMissing"] === true
        ? { coverSequenceB: null }
        : {}),
      ...(senderCountry && receiverCountry
        ? { senderCountry, receiverCountry }
        : {}),
    };
  }

  private requiredText(
    values: ResolutionPageSubmission["values"],
    fieldId: string,
  ): string {
    const value = text(values, fieldId);
    if (!value)
      throw new BadRequestException({
        code: "PAGE_SUBMISSION_FIELD_REQUIRED",
        fieldId,
      });
    return value;
  }

  private result(
    { definition, scenario, submission }: PaymentResolutionPageExecutionContext,
    request: Mt2SettlementResolutionRequest,
    raw: Json,
  ): ResolutionPageExecutionResult {
    const fields = this.resolvedFields(definition, scenario, raw);
    const chosen = object(raw["chosenRoute"]);
    const selectedSsi = this.identity(chosen["ssiId"], chosen["ssiVersion"]);
    const selectedApplicability = this.identity(
      chosen["applicabilityId"] ?? chosen["matchedApplicabilityId"],
      chosen["applicabilityVersion"],
    );
    const requestSha256 = hashCanonical(request);
    const responseSha256 = hashCanonical(jsonWireRepresentation(raw));
    const payloadGenerated = false;
    const outputs = this.evidenceOutputs(definition, raw);
    const selected = submission.selectedRouteIdentity;
    const snapshot = submission.eligibilitySnapshot;
    const evidenceCards = this.evidenceCards(definition, request, raw, fields);
    const settlementRoute = this.settlementRoute(
      request,
      raw,
      selected,
      fields,
    );
    return {
      definitionId: definition.definitionId,
      definitionVersion: definition.definitionVersion,
      scenarioId: scenario.scenarioId,
      fixtureBindingId: submission.fixtureBindingId,
      outcome: "RESOLVED",
      payloadGenerated,
      paymentExecutable: false,
      profileKind: "SSI_RESOLUTION_ONLY",
      confirmedResolutionCreated: false,
      repairQueueCreated: false,
      nvrOutcome: scenarioNvrOutcome(scenario),
      ssiApplicability: "REQUIRED",
      resolutionOutcome: "ELIGIBLE_COMPLETE_ROUTE",
      ...(selected ? { routeBindingId: selected.routeId } : {}),
      ...(snapshot || selected
        ? {
            contextSnapshotId:
              selected?.contextSha256 ?? snapshot?.contextSha256 ?? "",
          }
        : {}),
      ...(selected?.rma
        ? {
            rmaAuthorizationDecisionId: scalarText(
              object(raw["chosenRoute"])["rmaDecisionId"],
            ),
          }
        : {}),
      ...(settlementRoute ? { settlementRoute } : {}),
      evidenceCards,
      fields,
      outputs,
      evidence: {
        correlationId:
          scalarText(raw["correlationId"]).trim() || requestSha256.slice(0, 32),
        owner: scenario.execution.owner,
        action: scenario.execution.action,
        executorIdentity: "MT2_SETTLEMENT_RESOLUTION_ADAPTER_V1",
        requestSha256,
        responseSha256,
        ruleIds: scenario.validationRuleIds,
        ...(selectedSsi ? { selectedSsi } : {}),
        ...(selectedApplicability ? { selectedApplicability } : {}),
      },
    };
  }

  private settlementRoute(
    request: Mt2SettlementResolutionRequest,
    raw: Json,
    selected: ResolutionPageSubmission["selectedRouteIdentity"],
    fields: readonly ResolutionPageFieldResult[],
  ): ResolutionPageExecutionResult["settlementRoute"] {
    if (!selected) return undefined;
    const chosen = object(
      raw["chosenRoute"] ?? object(raw["mx"])["chosenRoute"],
    );
    const actualReceiverBic = scalarText(chosen["actualReceiverBic"]).trim();
    const executionTransport = scalarText(chosen["executionTransport"]).trim();
    const settlementMethod = scalarText(chosen["settlementMethod"]).trim();
    const bank = this.bankServices
      .search(actualReceiverBic)
      .find((candidate) => candidate.bic === actualReceiverBic);
    if (
      !bank ||
      !["FIN", "FINPLUS"].includes(executionTransport) ||
      !["INDA", "INGA"].includes(settlementMethod)
    )
      this.invalidResolverResponse("PAYMENT_RESOLVER_ROUTE_BINDING_REQUIRED");
    const accountReference = scalarText(chosen["accountId"]).trim();
    if (!accountReference)
      this.invalidResolverResponse(
        "PAYMENT_RESOLVER_OPERATIONAL_ACCOUNT_REQUIRED",
      );
    return {
      routeBindingId: selected.routeId,
      actualReceiverBic,
      executionTransport: executionTransport as "FIN" | "FINPLUS",
      settlementMethod: settlementMethod as "INDA" | "INGA",
      counterparty: {
        bankServiceId: bank.bankServiceId,
        bic: bank.bic,
        name: bank.name,
      },
      ssi: selected.ssi,
      applicability: selected.applicability,
      nostro: selected.nostro,
      ...(selected.rma ? { rma: selected.rma } : {}),
      roles: [
        {
          role: "INSTRUCTED_AGENT",
          owner: "BANK_SERVICE",
          recordId: bank.bankServiceId,
          version: 1,
        },
      ],
      legs: [
        {
          order: 1,
          relationship: settlementMethod as "INDA" | "INGA",
          role: "ACCOUNT_SERVICER",
          accountOwner: {
            bankServiceId: request.bookingEntity,
            bic: scalarText(
              object(object(raw["mx"])["canonicalRoles"])["debtor"],
            ),
          },
          accountServicer: {
            bankServiceId: bank.bankServiceId,
            bic: bank.bic,
            name: bank.name,
          },
          accountReference,
          currency: request.currency,
          source: "OWN_SSI_NOSTRO",
          sourceRecordId: selected.nostro.id,
          version: selected.nostro.version,
        },
      ],
      projections: fields.map((field) => ({
        kind: "SWIFT_MT_FIELD" as const,
        identifier: field.swiftTag,
        ...(field.swiftOption !== "NONE" ? { option: field.swiftOption } : {}),
        label: field.fieldName,
        role: field.role,
        value: field.value ?? "",
        ...(field.accountReference
          ? { accountReference: field.accountReference }
          : {}),
        sourceRecordId: field.provenance.sourceRecordId ?? selected.ssi.id,
        version:
          field.swiftTag === "53"
            ? selected.nostro.version
            : selected.ssi.version,
      })),
    };
  }

  private evidenceCards(
    definition: ResolutionPageDefinition,
    request: Mt2SettlementResolutionRequest,
    raw: Json,
    fields: readonly ResolutionPageFieldResult[],
  ): readonly ResolutionPageEvidenceCard[] {
    const chosen = object(
      raw["chosenRoute"] ?? object(raw["mx"])["chosenRoute"],
    );
    const nostroId = scalarText(chosen["nostroId"] ?? request.selectedNostroId);
    const nostroVersion = scalarText(
      chosen["nostroVersion"] ?? request.selectedNostroVersion,
    );
    const mtProjections = fields
      .filter((field) => field.swiftTag === "53" && field.swiftOption === "B")
      .map((field, index) => ({
        projectionId: `MT-${index + 1}`,
        classification:
          field.provenance.source === "TRANSACTION_CONTEXT"
            ? ("UPSTREAM_CONTEXT" as const)
            : ("SSI_DERIVED" as const),
        role: field.role,
        mtTagOption: `${field.swiftTag}${field.swiftOption === "NONE" ? "" : field.swiftOption}`,
        valueType: field.accountReference
          ? ("ACCOUNT_REFERENCE" as const)
          : ("BIC" as const),
        value: field.value ?? "",
        sourceRecordType: evidenceSourceRecordType(field),
        sourceRecordId:
          field.provenance.sourceRecordId ??
          (field.swiftTag === "53" ? nostroId : scalarText(chosen["ssiId"])),
        sourceRecordVersion:
          field.swiftTag === "53"
            ? nostroVersion
            : scalarText(chosen["ssiVersion"]),
        mappingRuleId: "MRG-MT202-53B",
      }));
    const governedMtProjections: ResolutionPageEvidenceCard["evidenceProjections"] =
      mtProjections.length
        ? mtProjections
        : [
            {
              projectionId: "MT-OPTIONAL-SSI-OMISSION",
              classification: "OMITTED_BY_RULE",
              role: "OPTIONAL_MT_SSI_PROJECTION",
              decisionRuleId: "POL-MT2-PROFILE-OPTION-001",
              reason:
                "No registered optional MT SSI projection applies to the selected route.",
            },
          ];
    const settlementAccountReference = scalarText(
      chosen["settlementAccountReference"],
    );
    const settlementMethod = scalarText(chosen["settlementMethod"]);
    const topologyRulingId = scalarText(chosen["topologyRulingId"]);
    const topologyRulingVersion = scalarText(chosen["topologyRulingVersion"]);
    const governedTopology =
      ["INDA", "INGA"].includes(settlementMethod) &&
      topologyRulingId === "BA-TOPOLOGY-INDA-INGA-001" &&
      Boolean(topologyRulingVersion);
    if (request.routeBindingId && !governedTopology)
      this.invalidResolverResponse(
        "PAYMENT_RESOLVER_TOPOLOGY_EVIDENCE_REQUIRED",
      );
    const mxProjections: ResolutionPageEvidenceCard["evidenceProjections"] = [
      ...(settlementAccountReference
        ? [
            {
              projectionId: "MX-STTLM-ACCT",
              classification: "SSI_DERIVED" as const,
              role: "SETTLEMENT_ACCOUNT",
              isoPath: "/Document/FICdtTrf/GrpHdr/SttlmInf/SttlmAcct",
              valueType: "ACCOUNT_REFERENCE" as const,
              value: settlementAccountReference,
              sourceRecordType: "OWN_NOSTRO_ACCOUNT" as const,
              sourceRecordId: nostroId,
              sourceRecordVersion: nostroVersion,
              mappingRuleId: "MAP-MT2-53B-STTLMACCT-001",
            },
          ]
        : []),
      ...(governedTopology
        ? [
            {
              projectionId: "MX-STTLM-MTD",
              classification: "SSI_DERIVED" as const,
              role: "SETTLEMENT_METHOD",
              isoPath: "/Document/FICdtTrf/GrpHdr/SttlmInf/SttlmMtd",
              valueType: "SETTLEMENT_METHOD" as const,
              value: settlementMethod,
              sourceRecordType: "TOPOLOGY_RULE" as const,
              sourceRecordId: topologyRulingId,
              sourceRecordVersion: topologyRulingVersion,
              mappingRuleId: "MAP-MT2-STTLMMTD-002",
              rulingProvenance: {
                rulingId: topologyRulingId,
                rulingVersion: topologyRulingVersion,
              },
            },
          ]
        : []),
    ];
    return [
      {
        format: "SWIFT_MT",
        profileId: request.profileId ?? definition.profile.profileId,
        evidenceProjections: governedMtProjections,
      },
      {
        format: "ISO_20022",
        profileId:
          request.pairedEvidenceProfileId ?? definition.profile.profileId,
        ...(definition.profile.messageDefinitionId
          ? { messageDefinitionId: definition.profile.messageDefinitionId }
          : {}),
        ...(definition.profile.businessService
          ? { businessService: definition.profile.businessService }
          : {}),
        evidenceProjections: mxProjections,
      },
    ];
  }

  private evidenceOutputs(
    definition: ResolutionPageDefinition,
    raw: Json,
  ): ResolutionPageExecutionResult["outputs"] {
    const mt = object(raw["mt"]);
    const nestedMx = object(raw["mx"]);
    const mx = Object.keys(nestedMx).length
      ? nestedMx
      : Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "mt"));
    if (!Object.keys(mt).length || !Object.keys(mx).length)
      this.invalidResolverResponse("PAYMENT_RESOLVER_OUTPUTS_REQUIRED");
    const messageIdentity =
      scalarText(mx["messageDefinitionId"]).trim() ||
      definition.profile.messageDefinitionId;
    if (!messageIdentity)
      this.invalidResolverResponse("PAYMENT_RESOLVER_MX_IDENTITY_REQUIRED");
    const mtTags = Object.fromEntries(
      Object.entries(object(mt["tags"])).filter(
        ([key]) => !key.startsWith("B."),
      ),
    );
    const mtEvidence = { ...mt, tags: mtTags };
    return [
      {
        outputId: "swift-mt",
        format: "SWIFT_MT",
        label: definition.messageType,
        messageIdentity: definition.messageType,
        mediaType: "application/json",
        document: mtEvidence,
      },
      {
        outputId: "iso-20022",
        format: "ISO_20022",
        label: messageIdentity,
        messageIdentity,
        mediaType: "application/json",
        document: mx,
      },
    ];
  }

  private resolvedFields(
    definition: ResolutionPageDefinition,
    scenario: ResolutionPageScenario,
    raw: Json,
  ): readonly ResolutionPageFieldResult[] {
    const tags = object(object(raw["mt"])["tags"]);
    return Object.entries(tags).flatMap(([key, value]) =>
      this.resolvedField(definition, scenario, raw, key, value),
    );
  }

  private resolvedField(
    definition: ResolutionPageDefinition,
    scenario: ResolutionPageScenario,
    raw: Json,
    key: string,
    value: unknown,
  ): readonly ResolutionPageFieldResult[] {
    const parsed = /^(?:([AB])\.)?(5\d)([ABCDFK])?$/.exec(key);
    if (!parsed) {
      if (/^(?:[AB]\.)?5\d[A-Z]?$/.test(key))
        this.invalidResolverResponse("PAYMENT_RESOLVER_TAG_UNMANAGED", key);
      return [];
    }
    if (typeof value !== "string") return [];
    const sequenceId = parsed[1] ?? "A";
    if (sequenceId !== "A") return [];
    const swiftTag = parsed[2];
    if (!swiftTag)
      this.invalidResolverResponse("PAYMENT_RESOLVER_TAG_UNMANAGED", key);
    const swiftOption = parsed[3] ?? "NONE";
    const governed = definition.fields.some(
      (field) =>
        scenario.fieldIds.includes(field.fieldId) &&
        field.sequenceId === sequenceId &&
        field.swiftTag === swiftTag &&
        field.swiftOption === swiftOption,
    );
    if (!governed)
      this.invalidResolverResponse("PAYMENT_RESOLVER_TAG_UNMANAGED", key);
    return [
      this.fieldResult(
        definition,
        key,
        sequenceId,
        swiftTag,
        swiftOption,
        value,
        raw,
      ),
    ];
  }

  private invalidResolverResponse(code: string, tag?: string): never {
    throw new BadGatewayException({
      code,
      ...(tag ? { tag } : {}),
      payloadGenerated: false,
    });
  }

  private identity(
    idValue: unknown,
    versionValue: unknown,
  ): { readonly id: string; readonly version: number } | undefined {
    const id = typeof idValue === "string" ? idValue.trim() : "";
    const version = numeric(versionValue);
    return id && version !== undefined ? { id, version } : undefined;
  }

  private fieldResult(
    definition: ResolutionPageDefinition,
    sourceKey: string,
    sequenceId: string,
    swiftTag: string,
    swiftOption: string,
    value: string,
    raw: Json,
  ): ResolutionPageFieldResult {
    const governed = definition.fields.find(
      (field) =>
        field.sequenceId === sequenceId &&
        field.swiftTag === swiftTag &&
        field.swiftOption === swiftOption,
    );
    const provenance = object(object(raw["fieldProvenance"])[sourceKey]);
    const evidenceId = scalarText(provenance["evidenceId"]).trim();
    const bic = value.split(/\r?\n/).at(-1)?.trim() ?? "";
    const bank = /^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/.test(bic)
      ? this.bankServices.search(bic).find((candidate) => candidate.bic === bic)
      : undefined;
    return {
      fieldId: governed?.fieldId ?? `${sequenceId}.${swiftTag}${swiftOption}`,
      sequenceId,
      settlementLeg:
        governed?.settlementLeg ??
        (sequenceId === "B" ? "UNDERLYING_CUSTOMER" : "INSTITUTIONAL"),
      swiftTag,
      swiftOption,
      fieldName: governed?.label ?? `SWIFT ${swiftTag}${swiftOption}`,
      role: governed?.officialRole ?? "UNSPECIFIED_ROLE",
      outcome: "RESOLVED",
      resolutionStatus: "RESOLVED",
      value,
      ...(bank
        ? {
            institution: {
              bankServiceId: bank.bankServiceId,
              bic: bank.bic,
              name: bank.name,
            },
          }
        : {}),
      provenance: {
        ...(provenance["source"]
          ? { source: scalarText(provenance["source"]) }
          : {}),
        ...(evidenceId ? { sourceRecordId: evidenceId } : {}),
      },
      evidenceIds: definition.evidence.map(({ evidenceId: id }) => id),
    };
  }
}
