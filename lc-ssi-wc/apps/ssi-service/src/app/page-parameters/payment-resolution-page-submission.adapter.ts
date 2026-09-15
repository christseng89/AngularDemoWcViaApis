import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import type {
  ResolutionPageDefinition,
  ResolutionPageExecutionResult,
  ResolutionPageFieldResult,
  ResolutionPageScenario,
  ResolutionPageSubmission,
} from "@ssi/contracts";
import { scenarioNvrOutcome } from "./page-parameter-validation-disposition";
import { BankServiceDirectory } from "../bank-service-directory";
import { hashCanonical } from "../canonical-json";
import type { Mt2SettlementResolutionRequest } from "../mt2-settlement-request.policy";
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

const jsonWireRepresentation = (value: Json): unknown =>
  JSON.parse(JSON.stringify(value)) as unknown;

const previousMessageType = (
  messageType: string,
  scenarioId: string,
  values: ResolutionPageSubmission["values"],
): string | undefined => {
  const supplied = text(values, "context.previousMessageType");
  if (supplied) return supplied;
  if (scenarioId === "MT205-OP-INITIAL-MT200-201-EQUIVALENCE") return "MT200";
  if (scenarioId === "MT205-OP-STANDARD-DOMESTIC-ONWARD") return "MT202";
  if (messageType === "MT205COV") return "MT202COV";
  return undefined;
};

const PREVIOUS_COVER_TYPES = new Set([
  "MT202COV",
  "MT205COV",
  "EQUIVALENT_COVER",
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
    return this.result(context, request, raw);
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
      payloadGenerated !== true ||
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
    const previousType = previousMessageType(
      sourceMessageType,
      scenario.scenarioId,
      values,
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
      amount: this.requiredText(values, "context.amount"),
      sourceMessageType,
      messageType: definition.profile.messageDefinitionId ?? "",
      businessService: definition.profile.businessService ?? "",
      transactionReference,
      currency: this.requiredText(values, "context.currency"),
      bookingEntity: this.requiredText(values, "context.bookingEntity"),
      valueDate: this.requiredText(values, "context.valueDate"),
      counterpartyCountry: counterparty.country.trim(),
      counterpartyBankServiceId,
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
        values,
      ),
      ...(sourceMessageType.endsWith("COV") ? this.coverContext(values) : {}),
      ...this.scenarioValidationFixture({
        ...scenario.inputValues,
        ...values,
      }),
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
    return {
      previousMessage: {
        type: previousType,
        "20": previousReference,
        "21": previousReference,
      },
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
    const payloadGenerated = true;
    const outputs = this.generatedOutputs(definition, raw);
    return {
      definitionId: definition.definitionId,
      definitionVersion: definition.definitionVersion,
      scenarioId: scenario.scenarioId,
      fixtureBindingId: submission.fixtureBindingId,
      outcome: payloadGenerated ? "RESOLVED" : "REFERENCE_ONLY",
      payloadGenerated,
      confirmedResolutionCreated: false,
      repairQueueCreated: false,
      nvrOutcome: scenarioNvrOutcome(scenario),
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

  private generatedOutputs(
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
    return [
      {
        outputId: "swift-mt",
        format: "SWIFT_MT",
        label: definition.messageType,
        messageIdentity: definition.messageType,
        mediaType: "application/json",
        document: mt,
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
