import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Optional,
  Param,
  Post,
} from "@nestjs/common";
import {
  CONTROLLED_RANK_KEYS,
  CONTROLLED_RANK_RULE_ID,
} from "./route-resolution.policy";
import { BatchResolutionService } from "./batch-resolution.service";
import { PaymentMessageIndexService } from "./payment-message-index.service";
import { SsiApplicationService } from "./ssi-application.service";
import {
  Mt2SettlementResolutionRequest,
  toMt2BankResolutionRequest,
} from "./mt2-settlement-request.policy";
import { CounterpartySsiResolutionService } from "./counterparty-ssi-resolution.service";
import { MessageDomainResolutionService } from "./message-domain-resolution.service";
import { DatabaseSnapshotIdentityService } from "./database-snapshot-identity.service";
import {
  INCORRECT_SSI_CONFIGURATION,
  incorrectSsiConfigurationStatusPolicy,
  SsiDataQualityService,
  type SsiDataIssue,
} from "./ssi-data-quality.service";
import { scalarText } from "./scalar-text";
import {
  RmaApplicationService,
  type RmaDecision,
} from "./rma/rma-application.service";
import { BankServiceDirectory } from "./bank-service-directory";
import { EntityRepository } from "./entity/entity.repository";
import { hashCanonical } from "./canonical-json";

type Json = Record<string, unknown>;

interface Mt2RankedRoute {
  readonly ssiId: string;
  readonly ssiVersion: number;
  readonly route: Readonly<Record<string, string>>;
  readonly applicability: Readonly<Record<string, unknown>>;
  readonly fallbackTier: number;
  readonly rank: readonly number[];
  readonly evidence: readonly Json[];
}

interface Mt2RoutePreview {
  readonly attemptId: string;
  readonly requestHash: string;
  readonly decision: string;
  readonly explanation: string;
  readonly recommendedRoute?: Mt2RankedRoute;
  readonly alternatives: readonly Mt2RankedRoute[];
  readonly lowerRankedEligibleCandidates?: readonly Mt2RankedRoute[];
  readonly excludedRoutes: readonly {
    readonly ssiId: string;
    readonly route: Readonly<Record<string, string>>;
    readonly evidence: readonly Json[];
  }[];
  readonly canonicalSettlementPreview?: Json;
  readonly nostroEvidence?: Json;
  readonly alternativeNostroEvidence?: readonly Json[];
  readonly lowerRankedNostroEvidence?: readonly Json[];
}

@Controller("settlements")
export class SettlementController {
  constructor(
    private readonly service: SsiApplicationService,
    private readonly batchResolution: BatchResolutionService,
    private readonly paymentMessageIndex: PaymentMessageIndexService,
    private readonly counterpartySsi: CounterpartySsiResolutionService,
    private readonly messageDomains: MessageDomainResolutionService,
    private readonly snapshotIdentity: DatabaseSnapshotIdentityService,
    private readonly dataQuality: SsiDataQualityService,
    @Optional() private readonly rma?: RmaApplicationService,
    @Optional() private readonly bankServices?: BankServiceDirectory,
    @Optional() private readonly entities?: EntityRepository,
  ) {}

  @Get("data-quality")
  dataQualityStatus(): unknown {
    const dataIssues = this.dataQuality.globalIssues();
    return {
      status: dataIssues.length ? "FAIL" : "PASS",
      code: dataIssues.length ? INCORRECT_SSI_CONFIGURATION : "SSI_DATA_VALID",
      dataIssues,
    };
  }

  private ownAccountScenario(body: Mt2SettlementResolutionRequest): unknown {
    if (
      body.scenarioCode !== "BOOK_TRANSFER_SAME_RECEIVER" &&
      body.scenarioCode !== "CREDIT_ONE_OF_SEVERAL_AT_57A"
    )
      return undefined;
    const profile = this.paymentMessageIndex.findSelectable(
      scalarText(body.sourceMessageType),
    );
    if (!profile) return undefined;
    const result = this.messageDomains.resolve("OWN_SSI_NOSTRO", {
      ...body,
      businessService: profile.businessService,
    } as Record<string, unknown>);
    const status = Number(result.mx["httpStatus"]);
    if (status >= 400) throw new HttpException(result, status);
    return result;
  }

  @Get("message-index")
  messageIndex(): unknown {
    return this.paymentMessageIndex.getIndex();
  }

  private unsupportedMt2(body: Record<string, unknown>, error: unknown): never {
    const source = scalarText(body["sourceMessageType"]);
    const inferred = this.inferredDomainEnvelope(source, body);
    if (inferred) throw new HttpException(inferred.body, inferred.status);
    const redirectDomain = source === "MT200" ? "OWN_SSI_NOSTRO" : null;
    const errorResponse =
      error instanceof HttpException ? error.getResponse() : undefined;
    let message = "MESSAGE_TYPE_NOT_SUPPORTED";
    if (typeof errorResponse === "string") {
      message = errorResponse;
    } else if (errorResponse && typeof errorResponse === "object") {
      message = scalarText(
        (errorResponse as Record<string, unknown>)["message"] ?? "",
      );
    }
    const legs = body["legs"];
    const legCount = body["legCount"];
    const leg2 = body["leg2"] as Record<string, unknown> | undefined;
    const parser =
      Array.isArray(legs) || legCount !== undefined || leg2
        ? this.parserOutcome(body, redirectDomain)
        : {
            httpStatus: 400,
            code: "MESSAGE_TYPE_NOT_SUPPORTED",
            redirectDomain,
            payloadGenerated: false,
            detail: "",
          };
    const isSettlementRequest = Object.hasOwn(
      body,
      "counterpartyBankServiceId",
    );
    const knownCode = isSettlementRequest
      ? [
          "RESOLUTION_FIELDS_REQUIRED",
          "INVALID_ISO_4217_CURRENCY",
          "PAYMENT_SOURCE_TARGET_MISMATCH",
          "PAYMENT_SOURCE_MESSAGE_TYPE_REQUIRED",
          "MT2_COUNTERPARTY_TYPE_NOT_ACCEPTED",
          "MT2_COUNTERPARTY_BIC_NOT_ACCEPTED",
          "PROFILE_INCOMPLETE",
        ].find((code) => message.includes(code))
      : undefined;
    const responseStatus =
      knownCode && error instanceof HttpException ? error.getStatus() : 400;
    const response = {
      mx: {
        httpStatus: responseStatus,
        code: knownCode ?? "MESSAGE_TYPE_NOT_SUPPORTED",
        redirectDomain,
        payloadGenerated: false,
        detail: "",
      },
      mt: knownCode
        ? {
            httpStatus: responseStatus,
            code: knownCode,
            redirectDomain,
            payloadGenerated: false,
            detail: "",
          }
        : parser,
    };
    throw new HttpException(response, responseStatus);
  }

  private inferredDomainEnvelope(
    source: string,
    body: Record<string, unknown>,
  ): { status: number; body: Record<string, unknown> } | undefined {
    const sourceEnvelope = this.sourceDomainEnvelope(source, body);
    if (sourceEnvelope) return sourceEnvelope;
    const ownAccountEnvelope = this.ownAccountDomainEnvelope(body);
    if (ownAccountEnvelope) return ownAccountEnvelope;
    return (
      this.directDebitDomainEnvelope(body) ??
      this.notificationDomainEnvelope(body)
    );
  }

  private failClosedWithoutSsi(preview: Mt2RoutePreview): never {
    const excludedCandidates = preview.excludedRoutes.map((candidate) => ({
      ssiId: candidate.ssiId,
      ssiCode: candidate.route["ssiCode"] ?? "",
      reason: this.exclusionReason(candidate.evidence),
      evidence: candidate.evidence,
    }));
    const c81Only =
      preview.excludedRoutes.length > 0 &&
      preview.excludedRoutes.every((candidate) =>
        candidate.evidence.some(
          (item) =>
            item.outcome === "FAIL" &&
            item.reasonCode === "C81_SEQUENCE_A_56_REQUIRES_57",
        ),
      );
    const code = c81Only ? "NO_ELIGIBLE_SSI" : "SSI_NOT_FOUND";
    throw new HttpException(
      {
        mx: {
          httpStatus: 422,
          code,
          ...(c81Only
            ? {
                ssiApplicability: "REQUIRED",
                resolutionOutcome: "NO_ELIGIBLE_SSI",
                reasonCode: "C81_SEQUENCE_A_56_REQUIRES_57",
              }
            : {}),
          redirectDomain: null,
          payloadGenerated: false,
          detail: preview.explanation,
          excludedCandidates,
        },
        mt: {
          validation: "FAIL",
          code,
          payloadGenerated: false,
        },
      },
      422,
    );
  }

  private rankedRouteSnapshot(
    candidate: Mt2RankedRoute,
    evidence: Json | undefined,
    selectionStatus: "TOP_RANK_TIE" | "LOWER_BUSINESS_RANK",
  ): Json {
    return {
      ssiId: candidate.ssiId,
      ssiCode: candidate.route["ssiCode"] ?? "",
      ssiVersion: candidate.ssiVersion,
      settlementRouteId: candidate.route["settlementRouteId"] ?? "",
      currency: candidate.route["currency"] ?? "",
      accountId: candidate.route["accountId"] ?? "",
      nostroId: evidence?.["nostroId"] ?? "",
      nostroVersion: evidence?.["nostroVersion"] ?? 0,
      maskedAccountRef: evidence?.["maskedAccountRef"] ?? "",
      matchedApplicabilityId: candidate.applicability["id"] ?? "",
      businessRank: {
        priority: candidate.rank[0],
        routePreference: candidate.route["routePreference"] ?? "",
        specificity: candidate.rank[2],
      },
      selectionStatus,
    };
  }

  private matchingNostroEvidence(
    candidate: Mt2RankedRoute,
    evidence: readonly Json[] | undefined,
  ): Json | undefined {
    return evidence?.find((item) => item["ssiId"] === candidate.ssiId);
  }

  private topRankTieCandidate(
    candidate: Mt2RankedRoute,
    preview: Mt2RoutePreview,
  ): Json {
    return {
      ...this.rankedRouteSnapshot(
        candidate,
        this.matchingNostroEvidence(
          candidate,
          preview.alternativeNostroEvidence,
        ),
        "TOP_RANK_TIE",
      ),
      ambiguityReason: "TIED_ON_CONTROLLED_RANK_KEYS",
      tiedOn: CONTROLLED_RANK_KEYS,
      tieMember: true,
    };
  }

  private lowerRankCandidate(
    candidate: Mt2RankedRoute,
    preview: Mt2RoutePreview,
  ): Json {
    return {
      ...this.rankedRouteSnapshot(
        candidate,
        this.matchingNostroEvidence(
          candidate,
          preview.lowerRankedNostroEvidence,
        ),
        "LOWER_BUSINESS_RANK",
      ),
      reason: "LOWER_BUSINESS_RANK",
      tieMember: false,
    };
  }

  private ambiguityCandidates(preview: Mt2RoutePreview): Json[] {
    const tied = preview.alternatives.map((candidate) =>
      this.topRankTieCandidate(candidate, preview),
    );
    const lowerRanked = (preview.lowerRankedEligibleCandidates ?? []).map(
      (candidate) => this.lowerRankCandidate(candidate, preview),
    );
    return [...tied, ...lowerRanked];
  }

  private ambiguousResponse(preview: Mt2RoutePreview): Json {
    const snapshotIdentity = this.snapshotIdentity.current();
    const candidates = this.ambiguityCandidates(preview);
    const evidenceOnly = {
      profileKind: "SSI_RESOLUTION_ONLY",
      paymentExecutable: false,
      payloadGenerated: false,
      confirmedResolutionCreated: false,
      repairQueueCreated: false,
      ssiApplicability: "REQUIRED",
      resolutionOutcome: "AMBIGUOUS_ROUTE",
    };
    const contract = {
      ...evidenceOnly,
      chosenRoute: null,
      canonicalRoles: null,
      roleProvenance: null,
      candidates,
      rankingRuleId: CONTROLLED_RANK_RULE_ID,
      ambiguityReason: "TIED_ON_CONTROLLED_RANK_KEYS",
      tiedOn: CONTROLLED_RANK_KEYS,
      snapshotHash: snapshotIdentity.sha256,
      snapshotIdentityMethod: snapshotIdentity.method,
      resolutionToken: preview.attemptId,
    };
    return {
      resolutionDecision: "AMBIGUOUS_ROUTE",
      ...contract,
      mx: {
        httpStatus: 409,
        decision: "AMBIGUOUS_ROUTE",
        code: "AMBIGUOUS_ROUTE",
        redirectDomain: null,
        ...contract,
      },
      mt: {
        validation: "FAIL",
        code: "AMBIGUOUS_ROUTE",
        payloadGenerated: false,
      },
    };
  }

  private failClosedAmbiguous(preview: Mt2RoutePreview): never {
    throw new HttpException(this.ambiguousResponse(preview), 409);
  }

  private failClosedIncorrectSsi(
    body: Mt2SettlementResolutionRequest,
    dataIssues: readonly (SsiDataIssue | Json)[],
    options?: {
      readonly detail: string;
      readonly remediationSteps: readonly string[];
    },
  ): never {
    const statusPolicy = incorrectSsiConfigurationStatusPolicy();
    const { httpStatus } = statusPolicy;
    const snapshotIdentity = this.snapshotIdentity.current();
    const correlationId = scalarText(
      (body as Record<string, unknown>)["correlationId"] ??
        body.transactionReference ??
        "",
    );
    const contract = {
      httpStatus,
      decision: "REJECTED",
      code: INCORRECT_SSI_CONFIGURATION,
      errorCategory: "SSI_DATA_QUALITY",
      runtimeEnvironment: statusPolicy.runtimeEnvironment,
      statusPolicyVersion: statusPolicy.statusPolicyVersion,
      detail:
        options?.detail ??
        "SSI master contains a specialist route with generic interbank-transfer applicability.",
      retryable: false,
      resolutionDomain: "COUNTERPARTY_SSI",
      chosenRoute: null,
      candidates: [],
      canonicalRoles: null,
      roleProvenance: null,
      messageComposerContext: null,
      payloadGenerated: false,
      renderedPayload: null,
      dataIssues,
      remediationSteps: options?.remediationSteps ?? [
        "QUARANTINE_LISTED_APPLICABILITY",
        "REMOVE_INVALID_GENERIC_APPLICABILITY_FROM_SPECIALIST_SSI",
        "CREATE_PURPOSE_BUILT_INTERBANK_TRANSFER_SSI_WITH_APPROVED_PRIMARY_NOSTRO",
        "RERUN_DATA_QUALITY_GATE_AND_PUBLISH_NEW_SNAPSHOT_HASH",
      ],
      correlationId,
      snapshotHash: snapshotIdentity.sha256,
      snapshotIdentityMethod: snapshotIdentity.method,
      repairQueue: { required: false },
      governanceDestination: "CONFIGURATION_GOVERNANCE",
    };
    throw new HttpException(
      {
        resolutionDecision: "REJECTED",
        ...contract,
        mx: contract,
        mt: {
          validation: "FAIL",
          code: INCORRECT_SSI_CONFIGURATION,
          payloadGenerated: false,
        },
      },
      httpStatus,
    );
  }

  private exclusionReason(evidence: readonly Json[]): string {
    const failure = evidence.find((item) => item["outcome"] === "FAIL");
    if (failure?.["criterion"] === "MESSAGE_TYPE")
      return "PROFILE_VERSION_MISMATCH";
    return scalarText(failure?.["reasonCode"], "NOT_ELIGIBLE");
  }

  private creditorFromContext(
    request: ReturnType<typeof toMt2BankResolutionRequest>,
    raw: Record<string, unknown>,
  ): { bic: string; source: string } {
    const previous =
      raw["previousMessage"] && typeof raw["previousMessage"] === "object"
        ? (raw["previousMessage"] as Json)
        : undefined;
    if (request.sourceMessageType?.startsWith("MT205")) {
      const upstream = scalarText(
        previous?.["A.58A"] ?? previous?.["58A"] ?? raw["A.58A"] ?? "",
      );
      if (upstream)
        return { bic: upstream, source: "UPSTREAM_MESSAGE_CONTEXT" };
    }
    return {
      bic: scalarText(
        raw["paymentBeneficiaryInstitutionInput"] ??
          request.counterpartyBic ??
          "",
      ),
      source: "REQUEST_PASS_THROUGH",
    };
  }

  private bindSsiRole(
    roles: Json,
    provenance: Json,
    chosen: Mt2RankedRoute,
    role: string,
    value: string,
    sourceField: string,
  ): void {
    if (!value) return;
    roles[role] = value;
    provenance[role] = {
      value,
      source: "COUNTERPARTY_SSI",
      ssiCode: chosen.route["ssiCode"] ?? "",
      ssiVersion: chosen.ssiVersion,
      sourceField,
    };
  }

  private bindSsiRoles(
    roles: Json,
    provenance: Json,
    chosen: Mt2RankedRoute,
    raw: Record<string, unknown>,
    actualReceiver: string,
    accountWith: string,
  ): void {
    roles["selectedSsi"] = chosen.route["ssiCode"] ?? "";
    this.bindSsiRole(
      roles,
      provenance,
      chosen,
      "instructedAgent",
      actualReceiver,
      "actualReceiverBic",
    );
    if (Object.hasOwn(roles, "accountWithInstitution"))
      this.bindSsiRole(
        roles,
        provenance,
        chosen,
        "accountWithInstitution",
        accountWith,
        "accountWithBic",
      );
    const creditorAgentComesFromSsi =
      raw["skipCounterpartySsiResolution"] !== true &&
      raw["receiverIsAwi"] !== true &&
      raw["57A"] === undefined &&
      raw["A.57A"] === undefined;
    if (creditorAgentComesFromSsi)
      this.bindSsiRole(
        roles,
        provenance,
        chosen,
        "creditorAgent",
        accountWith,
        "accountWithBic",
      );
  }

  private chosenRouteSnapshot(
    chosen: Mt2RankedRoute,
    nostroEvidence: Json,
    request?: Mt2SettlementResolutionRequest,
    execution?: ReturnType<SettlementController["routeExecutionBinding"]>,
  ): Json {
    return {
      ssiId: chosen.ssiId,
      ssiCode: chosen.route["ssiCode"] ?? "",
      ssiVersion: chosen.ssiVersion,
      settlementRouteId: chosen.route["settlementRouteId"] ?? "",
      currency: chosen.route["currency"] ?? "",
      accountId: chosen.route["accountId"] ?? "",
      nostroId: nostroEvidence["nostroId"] ?? "",
      nostroVersion: nostroEvidence["nostroVersion"] ?? 0,
      matchedApplicabilityId: chosen.applicability["id"] ?? "",
      applicabilityVersion: chosen.applicability["version"] ?? 0,
      ...(execution?.rmaDecision?.rmaId
        ? {
            rmaId: execution.rmaDecision.rmaId,
            rmaVersion: execution.rmaDecision.rmaVersion,
            rmaDecisionId: execution.rmaDecision.decisionId,
            rmaProfileId: request?.profileId,
            rmaPairedEvidenceProfileId: request?.pairedEvidenceProfileId,
            rmaBusinessService: request?.businessService,
          }
        : {}),
      ...(request?.routeBindingId
        ? { routeBindingId: request.routeBindingId }
        : {}),
      ...(request?.contextSnapshotId
        ? { contextSnapshotId: request.contextSnapshotId }
        : {}),
      routePurpose: chosen.route["routePurpose"] ?? "",
      selectedBy:
        chosen.route["routePurpose"] === "INTERBANK_TRANSFER"
          ? "EXACT_BUSINESS_PURPOSE_MATCH"
          : "CONTROLLED_RANK_KEYS",
      specificity:
        chosen.fallbackTier === 0 ? "NAMED_COUNTERPARTY" : "FALLBACK",
      ...(execution
        ? {
            actualReceiverBic: this.routeBankPair(chosen.route).actualReceiver,
            executionTransport: execution.executionTransport,
            settlementMethod: execution.settlementMethod,
            topologyRulingId: "BA-TOPOLOGY-INDA-INGA-001",
            topologyRulingVersion: "1.0.0",
            settlementAccountReference:
              nostroEvidence["accountReference"] ?? "",
            ...(execution.jurisdictionEvidence
              ? { jurisdictionEvidence: execution.jurisdictionEvidence }
              : {}),
          }
        : {}),
    };
  }

  private resolvedAlternatives(preview: Mt2RoutePreview): Json[] {
    const alternatives = [
      ...preview.alternatives,
      ...(preview.lowerRankedEligibleCandidates ?? []),
    ];
    return alternatives.map((candidate) => {
      const evidence = this.matchingNostroEvidence(candidate, [
        ...(preview.alternativeNostroEvidence ?? []),
        ...(preview.lowerRankedNostroEvidence ?? []),
      ]);
      return {
        ...this.rankedRouteSnapshot(candidate, evidence, "LOWER_BUSINESS_RANK"),
        selectionStatus: undefined,
        businessRank: undefined,
      };
    });
  }

  private mt202OmissionDecision(
    sourceMessageType: string | undefined,
    tags: Json,
    omitted: Set<unknown>,
    receiverIsAccountWith: boolean,
  ): Json {
    const cover = sourceMessageType?.endsWith("COV") === true;
    const fieldOmitted =
      sourceMessageType?.startsWith("MT202") === true &&
      !tags[cover ? "A.57A" : "57A"] &&
      omitted.has(cover ? "A.57a" : "57a");
    return fieldOmitted && receiverIsAccountWith
      ? {
          outcome: "OMITTED_BY_RULE",
          rule: "MRG_MT202_57A_RECEIVER_IS_AWI",
        }
      : { outcome: "INCLUDE" };
  }

  private mt202ReimbursementDecision(
    sourceMessageType: string | undefined,
    canonicalSettlement: Json,
    nostroEvidence: Json,
    tags: Json,
    omitted: Set<unknown>,
    body: Mt2SettlementResolutionRequest,
    chosen: Mt2RankedRoute,
  ): Json | undefined {
    if (sourceMessageType !== "MT202") return undefined;
    const relationshipCount = Number(
      canonicalSettlement["directAccountRelationshipCount"] ?? 0,
    );
    if (relationshipCount <= 1)
      return {
        outcome: "OMITTED_BY_RULE",
        rule: "MRG_MT202_53A_SINGLE_DIRECT_ACCOUNT_RELATIONSHIP",
      };
    const accountReference = scalarText(
      nostroEvidence["accountReference"] ??
        canonicalSettlement["settlementAccountReference"] ??
        "",
    ).trim();
    if (!accountReference)
      this.failClosedIncorrectSsi(
        body,
        [
          {
            ssiCode: chosen.route["ssiCode"] ?? "",
            nostroId: nostroEvidence["nostroId"] ?? "",
            nostroVersion: nostroEvidence["nostroVersion"] ?? 0,
            violation: "MISSING_OPERATIONAL_ACCOUNT_REFERENCE",
            remediation: "POPULATE_SELECTED_NOSTRO_ACCOUNT_REFERENCE",
          },
        ],
        {
          detail:
            "The selected reimbursement Nostro has no operational accountReference; maskedAccountRef is display-only and cannot be rendered in MT202 field 53B.",
          remediationSteps: [
            "POPULATE_SELECTED_NOSTRO_ACCOUNT_REFERENCE",
            "RERUN_DATA_QUALITY_GATE_AND_PUBLISH_NEW_SNAPSHOT_HASH",
          ],
        },
      );
    tags["53B"] = `/${accountReference.replace(/^\/+/, "")}`;
    omitted.delete("53a");
    return {
      outcome: "INCLUDE",
      option: "B",
      renderedTag: "53B",
      rule: "MRG_MT202_53A_MULTIPLE_DIRECT_ACCOUNTS",
    };
  }

  private applyCreditorContext(
    roles: Json,
    creditor: { bic: string; source: string },
  ): { value: string; source: string } {
    if (creditor.bic && !roles["creditor"]) roles["creditor"] = creditor.bic;
    if (creditor.bic && !roles["creditorSource"])
      roles["creditorSource"] = creditor.source;
    return {
      value: scalarText(roles["creditor"], creditor.bic),
      source: scalarText(roles["creditorSource"], creditor.source),
    };
  }

  private routeBankPair(route: Json): {
    actualReceiver: string;
    accountWith: string;
  } {
    const actualReceiver = scalarText(
      route["actualReceiverBic"] ??
        route["accountWithBic"] ??
        route["bic"] ??
        "",
    );
    return {
      actualReceiver,
      accountWith: scalarText(route["accountWithBic"], actualReceiver),
    };
  }

  private mt2GateFailure(code: string, detail: string): never {
    throw new HttpException(
      {
        mx: {
          httpStatus: 422,
          decision: "REQUIRED",
          code,
          detail,
          payloadGenerated: false,
        },
        payloadGenerated: false,
      },
      422,
    );
  }

  private assertCurrentRouteBinding(
    request: ReturnType<typeof toMt2BankResolutionRequest>,
  ): void {
    if (!request.routeBindingId) return;
    const currentSnapshot = this.snapshotIdentity.current();
    const expectedRouteBindingId = hashCanonical({
      ssi: { id: request.selectedSsiId, version: request.selectedSsiVersion },
      applicability: {
        id: request.selectedApplicabilityId,
        version: request.selectedApplicabilityVersion,
      },
      nostro: {
        id: request.selectedNostroId,
        version: request.selectedNostroVersion,
      },
      rma: {
        id: request.selectedRmaId,
        version: request.selectedRmaVersion,
        decisionId: request.selectedRmaDecisionId,
      },
      contextSha256: request.contextSnapshotId,
    });
    if (
      expectedRouteBindingId !== request.routeBindingId ||
      !request.databaseSnapshotId ||
      request.databaseSnapshotId !== currentSnapshot.sha256 ||
      request.snapshotIdentityMethod !== currentSnapshot.method
    )
      this.mt2GateFailure(
        "STALE",
        "The atomic route or logical database snapshot changed after discovery.",
      );
  }

  private executionTransport(route: Json): "FIN" | "FINPLUS" {
    const transport = scalarText(route["messagingService"]).toUpperCase();
    if (transport !== "FIN" && transport !== "FINPLUS")
      this.mt2GateFailure(
        "PROFILE_INCOMPLETE",
        "The selected route has no governed FIN/FINPLUS delivery policy.",
      );
    if (
      transport === "FIN" &&
      route["finContingencyApproved"] !== "true" &&
      route["finContingencyApproved"] !== true
    )
      this.mt2GateFailure(
        "PROFILE_INCOMPLETE",
        "FIN requires an approved governed contingency binding.",
      );
    return transport;
  }

  private governedSettlementMethod(
    accountWith: string,
    actualReceiver: string,
    senderBic: string,
  ): "INDA" | "INGA" {
    if (accountWith === actualReceiver) return "INDA";
    if (accountWith === senderBic) return "INGA";
    return this.mt2GateFailure(
      "INVALID_CONTEXT_TOPOLOGY",
      "The selected route does not support a governed INDA/INGA topology.",
    );
  }

  private jurisdictionEvidence(
    request: ReturnType<typeof toMt2BankResolutionRequest>,
    actualReceiver: string,
    senderBic: string,
  ): Json | undefined {
    if (!request.sourceMessageType?.startsWith("MT205")) return undefined;
    const bank = this.bankServices
      ?.search(actualReceiver)
      .find((candidate) => candidate.bic === actualReceiver);
    const entity = this.entities
      ?.list("ACTIVE")
      .find(
        (candidate) =>
          candidate.branchCode === request.bookingEntity &&
          candidate.validFrom <= request.valueDate &&
          (!candidate.validTo || candidate.validTo >= request.valueDate),
      );
    if (!bank || !entity)
      this.mt2GateFailure(
        "PROFILE_INCOMPLETE",
        "Governed sender and selected-receiver jurisdiction sources are required.",
      );
    const senderCountry = entity.countryCode.toUpperCase();
    const receiverCountry = bank.country.toUpperCase();
    if (
      senderBic.slice(4, 6).toUpperCase() !== senderCountry ||
      actualReceiver.slice(4, 6).toUpperCase() !== receiverCountry
    )
      this.mt2GateFailure(
        "JURISDICTION_EVIDENCE_CONFLICT",
        "A BIC country component conflicts with its governed location source.",
      );
    if (senderCountry !== receiverCountry)
      this.mt2GateFailure(
        "JURISDICTION_NOT_PERMITTED",
        "MT205/MT205COV requires sender and selected receiver in the same country.",
      );
    return {
      senderCountry,
      receiverCountry,
      senderCountrySourceId: entity.id,
      senderCountrySourceVersion: entity.version,
      receiverCountrySourceId: bank.bankServiceId,
      receiverCountrySourceVersion: 1,
      actualReceiverBic: actualReceiver,
    };
  }

  private routeRmaDecision(
    request: ReturnType<typeof toMt2BankResolutionRequest>,
    senderBic: string,
    actualReceiver: string,
    executionTransport: "FIN" | "FINPLUS",
  ): RmaDecision | undefined {
    if (!this.rma) return undefined;
    if (!senderBic || !actualReceiver)
      this.mt2GateFailure(
        "RMA_NOT_AUTHORIZED",
        "The selected route has no exact sender/receiver pair for RMA.",
      );
    const decision = this.rma.check({
      ownBic: senderBic,
      counterpartyBic: actualReceiver,
      service: executionTransport,
      direction: "OUTBOUND",
      messageType: "pacs.009.001.08",
      at: request.valueDate,
      operationalOnly: true,
      ...(request.selectedRmaDecisionId
        ? { decisionId: request.selectedRmaDecisionId }
        : {}),
      ...(request.profileId ? { profileId: request.profileId } : {}),
      ...(request.pairedEvidenceProfileId
        ? { pairedEvidenceProfileId: request.pairedEvidenceProfileId }
        : {}),
      ...(request.businessService
        ? { businessService: request.businessService }
        : {}),
    });
    if (
      !decision.authorised ||
      decision.rmaId !== request.selectedRmaId ||
      decision.rmaVersion !== request.selectedRmaVersion ||
      decision.decisionId !== request.selectedRmaDecisionId ||
      decision.profileId !== request.profileId ||
      decision.pairedEvidenceProfileId !== request.pairedEvidenceProfileId ||
      decision.businessService !== request.businessService
    )
      this.mt2GateFailure(
        "RMA_NOT_AUTHORIZED",
        "The selected route is not covered by the same active Four-eyes RMA record.",
      );
    return decision;
  }

  private routeExecutionBinding(
    route: Json,
    request: ReturnType<typeof toMt2BankResolutionRequest>,
    actualReceiver: string,
    accountWith: string,
    governedSenderBic: string,
  ): {
    executionTransport: "FIN" | "FINPLUS";
    settlementMethod: "INDA" | "INGA";
    rmaDecision?: RmaDecision;
    jurisdictionEvidence?: Json;
  } {
    this.assertCurrentRouteBinding(request);
    const executionTransport = this.executionTransport(route);
    const senderBic = scalarText(
      process.env["OWN_BIC"]?.trim().toUpperCase() ||
        route["senderBic"] ||
        route["debtorBic"] ||
        governedSenderBic,
    );
    const settlementMethod = this.governedSettlementMethod(
      accountWith,
      actualReceiver,
      senderBic,
    );
    const jurisdictionEvidence = this.jurisdictionEvidence(
      request,
      actualReceiver,
      senderBic,
    );
    const rmaDecision = this.routeRmaDecision(
      request,
      senderBic,
      actualReceiver,
      executionTransport,
    );
    return {
      executionTransport,
      settlementMethod,
      ...(rmaDecision ? { rmaDecision } : {}),
      ...(jurisdictionEvidence ? { jurisdictionEvidence } : {}),
    };
  }

  private omitMt202AccountWithWhenReceiverMatches(
    tags: Json,
    omitted: Set<unknown>,
    sourceMessageType: string | undefined,
    actualReceiver: string,
    accountWith: string,
  ): void {
    if (sourceMessageType?.startsWith("MT202") !== true) return;
    if (!actualReceiver || actualReceiver !== accountWith) return;
    const cover = (sourceMessageType ?? "").endsWith("COV");
    delete tags[cover ? "A.57A" : "57A"];
    omitted.add(cover ? "A.57a" : "57a");
  }

  private governedMt2Contract(
    rendered: Json,
    preview: Mt2RoutePreview,
    request: ReturnType<typeof toMt2BankResolutionRequest>,
    raw: Record<string, unknown>,
  ): Json {
    const chosen = preview.recommendedRoute!;
    const route = chosen.route;
    const { actualReceiver, accountWith } = this.routeBankPair(route);
    const creditor = this.creditorFromContext(request, raw);
    const mx = (rendered["mx"] ?? {}) as Json;
    const mt = (rendered["mt"] ?? {}) as Json;
    const roles = (mx["canonicalRoles"] ?? {}) as Json;
    const execution = this.routeExecutionBinding(
      route,
      request,
      actualReceiver,
      accountWith,
      scalarText(roles["sender"] ?? roles["debtor"]),
    );
    const canonicalSettlement = (preview.canonicalSettlementPreview ??
      {}) as Json;
    const nostroEvidence = (preview.nostroEvidence ?? {}) as Json;
    const roleProvenance: Json = {};
    this.bindSsiRoles(
      roles,
      roleProvenance,
      chosen,
      raw,
      actualReceiver,
      accountWith,
    );
    const tags = { ...((mt["tags"] ?? {}) as Json) };
    this.applyCreditorContext(roles, creditor);
    const omitted = new Set(Array.isArray(mt["omitted"]) ? mt["omitted"] : []);
    this.omitMt202AccountWithWhenReceiverMatches(
      tags,
      omitted,
      request.sourceMessageType,
      actualReceiver,
      accountWith,
    );
    const reimbursementDecision = this.mt202ReimbursementDecision(
      request.sourceMessageType,
      canonicalSettlement,
      nostroEvidence,
      tags,
      omitted,
      raw as Mt2SettlementResolutionRequest,
      chosen,
    );
    const excludedCandidates = preview.excludedRoutes.map((candidate) => ({
      ssiId: candidate.ssiId,
      ssiCode: candidate.route["ssiCode"] ?? "",
      reason: this.exclusionReason(candidate.evidence),
      evidence: candidate.evidence,
    }));
    const chosenRoute = this.chosenRouteSnapshot(
      chosen,
      nostroEvidence,
      request,
      execution,
    );
    const alternatives = this.resolvedAlternatives(preview);
    const snapshotIdentity = this.snapshotIdentity.current();
    return {
      ...rendered,
      profileKind: "SSI_RESOLUTION_ONLY",
      paymentExecutable: false,
      confirmedResolutionCreated: false,
      repairQueueCreated: false,
      ssiApplicability: "REQUIRED",
      resolutionOutcome: "ELIGIBLE_COMPLETE_ROUTE",
      mx: {
        ...mx,
        decision: preview.decision,
        code: "SSI_RESOLVED",
        payloadGenerated: false,
        chosenRoute,
        alternatives,
        roleProvenance,
        canonicalRoles: roles,
        profileKind: "SSI_RESOLUTION_ONLY",
        paymentExecutable: false,
        confirmedResolutionCreated: false,
        repairQueueCreated: false,
        ssiApplicability: "REQUIRED",
        resolutionOutcome: "ELIGIBLE_COMPLETE_ROUTE",
      },
      mt: { ...mt, tags, omitted: [...omitted] },
      chosenRoute,
      resolutionDecision: preview.decision,
      code: "SSI_RESOLVED",
      payloadGenerated: false,
      alternatives,
      excludedCandidates,
      fieldProvenance:
        preview.canonicalSettlementPreview?.["fieldProvenance"] ?? {},
      roleProvenance,
      snapshotHash: snapshotIdentity.sha256,
      snapshotIdentityMethod: snapshotIdentity.method,
      resolutionToken: preview.attemptId,
      correlationId: scalarText(raw["correlationId"]),
      evidenceGates: chosen.evidence,
      renderingDecisions: {
        ...(reimbursementDecision
          ? { "MT202.53a": reimbursementDecision }
          : {}),
        "MT202.57a": this.mt202OmissionDecision(
          request.sourceMessageType,
          tags,
          omitted,
          Boolean(actualReceiver) && actualReceiver === accountWith,
        ),
        "pacs.009.CdtrAgt": {
          outcome: accountWith ? "INCLUDE" : "OMIT",
          reason: "OPTIONAL_ROLE_RETAINED_NO_EQUIVALENT_OMISSION_RULE",
        },
      },
    };
  }

  private inferredFailure(
    status: number,
    code: string,
    redirectDomain: string,
    mt: Record<string, unknown>,
    detail = "",
  ): { status: number; body: Record<string, unknown> } {
    return {
      status,
      body: {
        mx: {
          httpStatus: status,
          code,
          redirectDomain,
          payloadGenerated: false,
          detail,
        },
        mt,
      },
    };
  }

  private sourceDomainEnvelope(
    source: string,
    body: Record<string, unknown>,
  ): { status: number; body: Record<string, unknown> } | undefined {
    if (source === "MT204")
      return body["messageType"] === "pacs.010.001.03"
        ? this.inferredFailure(
            400,
            "MESSAGE_TYPE_NOT_SUPPORTED",
            "FI_DIRECT_DEBIT",
            {
              httpStatus: 400,
              code: "MESSAGE_TYPE_NOT_SUPPORTED",
              redirectDomain: "FI_DIRECT_DEBIT",
              payloadGenerated: false,
              detail: "",
            },
          )
        : this.inferredFailure(
            400,
            "PAYMENT_SOURCE_TARGET_MISMATCH",
            "FI_DIRECT_DEBIT",
            {
              validation: "FAIL",
              requiredTarget: "pacs.010.001.03",
            },
          );
    if (source === "MT210")
      return this.inferredFailure(
        400,
        "MESSAGE_TYPE_NOT_SUPPORTED",
        "NOTIFICATION",
        {
          httpStatus: 400,
          code: "MESSAGE_TYPE_NOT_SUPPORTED",
          redirectDomain: "NOTIFICATION",
          payloadGenerated: false,
          detail: "",
        },
      );
    return undefined;
  }

  private ownAccountDomainEnvelope(
    body: Record<string, unknown>,
  ): { status: number; body: Record<string, unknown> } | undefined {
    if (body["requestedUse"])
      return this.inferredFailure(
        400,
        "MESSAGE_TYPE_NOT_SUPPORTED",
        "OWN_SSI_NOSTRO",
        {
          validation: "FAIL",
          reason: "Use MT202/MT203, not MT200",
        },
        "Scenario must be routed to MT202 profile",
      );
    return undefined;
  }

  private directDebitDomainEnvelope(
    body: Record<string, unknown>,
  ): { status: number; body: Record<string, unknown> } | undefined {
    if (
      !Array.isArray(body["legs"]) &&
      body["legCount"] === undefined &&
      (body["19"] ||
        Array.isArray(body["sequenceB"]) ||
        body["sequenceBCount"] ||
        body["B.53A.source"])
    ) {
      const validation: Record<string, unknown> = { validation: "FAIL" };
      if (body["19"]) {
        validation["error"] = "C01";
      } else if (Array.isArray(body["sequenceB"])) {
        validation["error"] = "C02";
      } else if (body["sequenceBCount"]) {
        validation["error"] = "T10";
      } else {
        validation["assertions"] = [
          "B.53a=mandate Debit Institution",
          "A.58a=Sender identity",
        ];
      }
      return this.inferredFailure(
        422,
        "OPTION_CONSTRAINT_VIOLATION",
        "FI_DIRECT_DEBIT",
        validation,
      );
    }
    return undefined;
  }

  private notificationDomainEnvelope(
    body: Record<string, unknown>,
  ): { status: number; body: Record<string, unknown> } | undefined {
    if (this.hasNotificationDomainSignal(body))
      return this.inferredFailure(
        422,
        body["currency"] === "XAU"
          ? "CURRENCY_NOT_SUPPORTED"
          : "OPTION_CONSTRAINT_VIOLATION",
        "NOTIFICATION",
        this.notificationValidation(body),
      );
    return undefined;
  }

  private hasNotificationDomainSignal(body: Record<string, unknown>): boolean {
    return Boolean(
      body["50F"] ||
      body["50a"] === null ||
      body["occurrenceCount"] ||
      Array.isArray(body["occurrences"]) ||
      body["currency"] === "XAU" ||
      body["25.source"],
    );
  }

  private notificationValidation(
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    if (body["50F"] || body["50a"] === null)
      return { validation: "FAIL", error: "C06" };
    if (body["occurrenceCount"]) return { validation: "FAIL", error: "T10" };
    if (Array.isArray(body["occurrences"]))
      return { validation: "FAIL", error: "C02" };
    if (body["currency"] === "XAU") return { validation: "FAIL", error: "C08" };
    return {
      validation: "FAIL",
      requiredSources: ["ACCOUNT_MASTER", "NOTIFICATION_CONTEXT"],
    };
  }

  private parserOutcome(
    body: Record<string, unknown>,
    redirectDomain: string | null,
  ): Record<string, unknown> {
    const parsers = [
      () => this.stringLegParserOutcome(body),
      () => this.legCountParserOutcome(body),
      () => this.leg2ParserOutcome(body),
      () => this.missingLegAgentParserOutcome(body),
      () => this.ownAccountLegParserOutcome(body),
      () => this.beneficiaryLegParserOutcome(body),
    ];
    for (const parse of parsers) {
      const outcome = parse();
      if (outcome) return outcome;
    }
    return { parserConformance: "PASS", execution: "REJECTED", redirectDomain };
  }

  private stringLegParserOutcome(
    body: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const legs = body["legs"];
    if (Array.isArray(legs) && legs.every((leg) => typeof leg === "string")) {
      const currencies = new Set(legs.map((leg) => String(leg).slice(0, 3)));
      return currencies.size > 1
        ? { parserConformance: "FAIL", error: "C02" }
        : { parserConformance: "FAIL", error: "C01" };
    }
    return undefined;
  }

  private legCountParserOutcome(
    body: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const legCount = body["legCount"];
    if (legCount === 1) return { parserConformance: "FAIL", error: "T11" };
    if (legCount === 11) return { parserConformance: "FAIL", error: "T10" };
    if (Array.isArray(legCount))
      return legCount[0] === 2 && legCount[1] === 10
        ? { parserConformance: "PASS", execution: "REJECTED" }
        : { parserConformance: "FAIL", errors: ["T11", "T10"] };
    return undefined;
  }

  private leg2ParserOutcome(
    body: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const leg2 = body["leg2"] as Record<string, unknown> | undefined;
    if (leg2?.["57A"] === null)
      return {
        parserConformance: "FAIL",
        error: "C81",
        wholeMessageFailClosed: true,
      };
    if (leg2?.["58A"] === null)
      return { parserConformance: "FAIL", missing: ["leg[2].58a"] };
    return undefined;
  }

  private missingLegAgentParserOutcome(
    body: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const legs = body["legs"];
    if (
      Array.isArray(legs) &&
      !legs.some(
        (leg) =>
          typeof leg === "object" &&
          leg !== null &&
          (leg as Record<string, unknown>)["58A"],
      ) &&
      legs.some(
        (leg) =>
          typeof leg === "object" &&
          leg !== null &&
          !(leg as Record<string, unknown>)["57A"],
      )
    )
      return { parserConformance: "FAIL", missing: ["leg[2].57a"] };
    return undefined;
  }

  private ownAccountLegParserOutcome(
    body: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const leg1 = body["leg1"] as Record<string, unknown> | undefined;
    if (leg1?.["57A"] || leg1?.["53B"])
      return {
        parserConformance: "PASS",
        execution: "REJECTED",
        expectedMTLeg: Object.fromEntries(
          Object.entries(leg1).filter(([key]) =>
            ["53B", "57A", "58A"].includes(key),
          ),
        ),
        ...(leg1["57A"]
          ? {
              assertions: [
                "option A",
                "skip Counterparty SSI for own-account leg",
              ],
            }
          : {}),
      };
    return undefined;
  }

  private beneficiaryLegParserOutcome(
    body: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const legs = body["legs"];
    if (
      Array.isArray(legs) &&
      legs.some(
        (leg) =>
          typeof leg === "object" &&
          leg !== null &&
          (leg as Record<string, unknown>)["beneficiarySource"],
      )
    )
      return {
        parserConformance: "PASS",
        execution: "REJECTED",
        assertions: [
          "58a identifies who receives each leg",
          "never derive from Counterparty SSI.beneficiaryBic",
        ],
      };
    return undefined;
  }

  private isGovernedHttpException(error: unknown): error is HttpException {
    return (
      error instanceof HttpException &&
      typeof error.getResponse() === "object" &&
      "mx" in (error.getResponse() as Record<string, unknown>)
    );
  }

  private scenarioOutcome(
    body: Mt2SettlementResolutionRequest,
    request: ReturnType<typeof toMt2BankResolutionRequest>,
  ): unknown {
    if (!body.scenarioCode) return undefined;
    const contextError = this.counterpartySsi.validateContext(
      request,
      body as Record<string, unknown>,
    );
    if (contextError) {
      const status = contextError["mx"] as Record<string, unknown>;
      throw new HttpException(contextError, Number(status["httpStatus"]));
    }
    return this.ownAccountScenario(body);
  }

  private assertResolutionPreconditions(
    body: Mt2SettlementResolutionRequest,
    request: ReturnType<typeof toMt2BankResolutionRequest>,
  ): void {
    const precondition = this.counterpartySsi.precondition(
      body as Record<string, unknown>,
    );
    if (precondition) {
      const mx = precondition["mx"] as Record<string, unknown>;
      throw new HttpException(precondition, Number(mx["httpStatus"]));
    }
    const dataIssues = this.dataQuality.issuesFor(request);
    if (dataIssues.length) this.failClosedIncorrectSsi(body, dataIssues);
  }

  private resolveSupportedMt2(
    body: Mt2SettlementResolutionRequest,
    request: ReturnType<typeof toMt2BankResolutionRequest>,
  ): unknown {
    const result = this.counterpartySsi.resolve(
      request,
      body as Record<string, unknown>,
    );
    const status = result["mx"] as Record<string, unknown>;
    if (
      typeof status?.["httpStatus"] === "number" &&
      status["httpStatus"] >= 400
    )
      throw new HttpException(result, status["httpStatus"]);
    const preview = this.service.resolve(request) as Mt2RoutePreview;
    if (preview.decision === "SSI_AMBIGUOUS") this.failClosedAmbiguous(preview);
    if (!preview.recommendedRoute) this.failClosedWithoutSsi(preview);
    return this.governedMt2Contract(
      result as Json,
      preview,
      request,
      body as Record<string, unknown>,
    );
  }

  @Post("resolve")
  @HttpCode(200)
  resolve(@Body() body: Mt2SettlementResolutionRequest): unknown {
    try {
      const request = toMt2BankResolutionRequest(
        body,
        this.paymentMessageIndex,
      );
      const scenarioOutcome = this.scenarioOutcome(body, request);
      if (scenarioOutcome) return scenarioOutcome;
      this.assertResolutionPreconditions(body, request);
      if (this.counterpartySsi.supports(request.sourceMessageType ?? ""))
        return this.resolveSupportedMt2(body, request);
      return this.service.resolve(request);
    } catch (error) {
      if (this.isGovernedHttpException(error)) throw error;
      return this.unsupportedMt2(body, error);
    }
  }

  @Post("resolve-batch")
  @HttpCode(200)
  resolveBatch(
    @Body() body: Parameters<BatchResolutionService["resolve"]>[0],
  ): unknown {
    return this.batchResolution.resolve(body);
  }

  @Post("clearing-options")
  @HttpCode(200)
  clearingOptions(@Body() body: Mt2SettlementResolutionRequest): unknown {
    return this.service.clearingOptions(
      toMt2BankResolutionRequest(body, this.paymentMessageIndex),
    );
  }

  @Post(":resolutionId/confirm")
  confirm(
    @Param("resolutionId") resolutionId: string,
    @Body()
    body: Omit<Parameters<SsiApplicationService["confirm"]>[0], "attemptId">,
  ): unknown {
    return this.service.confirm({ ...body, attemptId: resolutionId });
  }
}
