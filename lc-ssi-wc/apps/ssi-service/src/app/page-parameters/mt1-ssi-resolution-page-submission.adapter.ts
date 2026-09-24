import { Injectable } from "@nestjs/common";
import type {
  ResolutionPageDefinition,
  ResolutionPageExecutionOutcome,
  ResolutionPageExecutionResult,
  ResolutionPageSettlementRoute,
  ResolutionPageScenario,
  ResolutionPageSubmission,
} from "@ssi/contracts";
import { hashCanonical } from "../canonical-json";
import { Mt1SsiProfileRegistry } from "../mt1-ssi-profile.registry";
import { Mt1SsiDemoRouteRepository } from "../mt1-ssi-demo-route.repository";
import {
  Mt1SsiResolutionService,
  type Mt1SsiCandidateRepository,
  type Mt1SsiResolutionRequest,
  type Mt1SsiRouteCandidate,
} from "../mt1-ssi-resolution.service";

export interface Mt1SsiResolutionPageExecutionContext {
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

const executionOutcome = (
  resolutionOutcome: string,
): ResolutionPageExecutionOutcome => {
  if (resolutionOutcome === "ELIGIBLE_COMPLETE_ROUTE") return "RESOLVED";
  if (resolutionOutcome === "NO_ELIGIBLE_SSI") return "NO_ELIGIBLE_SSI";
  return "VALIDATION_REJECTED";
};

@Injectable()
export class Mt1SsiResolutionPageSubmissionAdapter {
  private readonly routes: Mt1SsiDemoRouteRepository;

  constructor(
    private readonly profiles: Mt1SsiProfileRegistry,
    routes?: Mt1SsiDemoRouteRepository,
  ) {
    this.routes = routes ?? new Mt1SsiDemoRouteRepository();
  }

  execute({
    definition,
    scenario,
    submission,
  }: Mt1SsiResolutionPageExecutionContext): ResolutionPageExecutionResult {
    const request = this.request(definition, scenario, submission);
    const settlementRoute = this.settlementRoute(
      definition,
      request,
      submission,
    );
    const candidate = this.candidate(definition, submission, settlementRoute);
    const repository: Mt1SsiCandidateRepository = {
      discover: () => (candidate ? [candidate] : []),
    };
    const resolved = new Mt1SsiResolutionService(
      this.profiles,
      repository,
    ).resolve(request);
    const requestSha256 = hashCanonical(request);
    const outcome = executionOutcome(resolved.resolutionOutcome);
    const outputs = this.outputs(
      definition,
      request,
      resolved.resolutionOutcome,
      settlementRoute,
    );
    const responseSha256 = hashCanonical({
      resolved,
      outputs,
      ...(settlementRoute ? { settlementRoute } : {}),
    });
    return {
      definitionId: definition.definitionId,
      definitionVersion: definition.definitionVersion,
      scenarioId: scenario.scenarioId,
      fixtureBindingId: submission.fixtureBindingId,
      outcome,
      ...(resolved.resolutionOutcome === "ELIGIBLE_COMPLETE_ROUTE"
        ? {}
        : { reasonCode: resolved.resolutionOutcome }),
      payloadGenerated: false,
      confirmedResolutionCreated: false,
      repairQueueCreated: false,
      nvrOutcome:
        resolved.resolutionOutcome === "ELIGIBLE_COMPLETE_ROUTE"
          ? "PASS"
          : "NOT_EVALUATED",
      ssiApplicability: resolved.ssiApplicability,
      resolutionOutcome: resolved.resolutionOutcome,
      ...(resolved.route
        ? { routeBindingId: resolved.route.routeBindingId }
        : {}),
      ...(resolved.route && settlementRoute ? { settlementRoute } : {}),
      fields: [],
      outputs,
      evidence: {
        correlationId: requestSha256.slice(0, 32),
        owner: "SSI_FIELD_RESOLUTION_API",
        action: "RESOLVE_SSI",
        executorIdentity: "MT1_SSI_RESOLUTION_ONLY_ADAPTER_V1",
        requestSha256,
        responseSha256,
        ruleIds: scenario.validationRuleIds,
        ...(submission.selectedRouteIdentity
          ? { selectedSsi: submission.selectedRouteIdentity.ssi }
          : {}),
        ...(submission.selectedRouteIdentity
          ? {
              selectedApplicability:
                submission.selectedRouteIdentity.applicability,
            }
          : {}),
      },
    };
  }

  private outputs(
    definition: ResolutionPageDefinition,
    request: Mt1SsiResolutionRequest,
    resolutionOutcome: string,
    settlementRoute: ResolutionPageSettlementRoute | undefined,
  ): ResolutionPageExecutionResult["outputs"] {
    if (resolutionOutcome !== "ELIGIBLE_COMPLETE_ROUTE" || !settlementRoute)
      return [];
    const policy = definition.profile.resolutionEvidence;
    if (!policy?.formats.length) return [];
    return policy.formats.flatMap((format) => {
      const iso = format === "ISO_20022";
      const messageIdentity = iso
        ? (definition.profile.messageDefinitionId ?? "pacs.008.001.08")
        : definition.messageType;
      const businessService = iso
        ? (policy.counterpartBusinessService ?? request.businessService)
        : request.businessService;
      const route = {
        ...settlementRoute,
        projections: settlementRoute.projections.filter(({ kind }) =>
          iso ? kind === "ISO_20022_ELEMENT" : kind === "SWIFT_MT_FIELD",
        ),
      };
      if (!route.projections.length) return [];
      const document = iso
        ? {
            decision: "RESOLVED",
            code: resolutionOutcome,
            resolutionDomain: "OUTWARD_SSI_ONLY",
            payloadGenerated: false,
            routeBindingId: settlementRoute.routeBindingId,
            messageDefinitionId: messageIdentity,
            businessService,
            scope: "SSI_RESOLUTION_EVIDENCE_ONLY",
            settlementContext: request.settlementContext,
            settlementRoute: route,
          }
        : this.swiftMtEvidenceDocument(
            settlementRoute,
            request,
            policy.swiftMtRenderableOptions ?? [],
          );
      return [
        {
          outputId: iso
            ? "ssi-resolution-iso-20022"
            : "ssi-resolution-swift-mt",
          format,
          label: messageIdentity,
          messageIdentity,
          mediaType: "application/json" as const,
          document,
        },
      ];
    });
  }

  private swiftMtEvidenceDocument(
    settlementRoute: ResolutionPageSettlementRoute,
    request: Mt1SsiResolutionRequest,
    renderableOptions: readonly string[],
  ): Readonly<Record<string, unknown>> {
    const projections = settlementRoute.projections.filter(
      ({ kind }) => kind === "SWIFT_MT_FIELD",
    );
    const tags: Record<string, string> = {};
    const renderingDecisions: Record<string, unknown> = {};
    const includedFamilies = new Set<string>();
    for (const projection of projections) {
      if (
        !projection.option ||
        !renderableOptions.includes(projection.option)
      )
        throw new Error("PROFILE_INCOMPLETE");
      const tagAndOption = `${projection.identifier}${projection.option ?? ""}`;
      includedFamilies.add(projection.identifier);
      tags[tagAndOption] = projection.accountReference
        ? `/${projection.accountReference}\n${projection.value}`
        : String(projection.value);
      renderingDecisions[tagAndOption] = {
        outcome: "INCLUDE",
        ruleId: "POL-MT1-PROFILE-OPTION-001",
        profileId: request.profileId,
        role: projection.role,
        tagAndOption,
        reason: `Resolved by the selected atomic ${request.settlementContext} SSI route`,
        provenance: {
          sourceRecordId: projection.sourceRecordId,
          version: projection.version,
        },
      };
    }
    const roles: Readonly<Record<string, string>> = {
      "53": "SENDER_CORRESPONDENT",
      "54": "RECEIVER_CORRESPONDENT",
      "55": "THIRD_REIMBURSEMENT_INSTITUTION",
      "56": "INTERMEDIARY_INSTITUTION",
      "57": "ACCOUNT_WITH_INSTITUTION",
    };
    for (const [family, role] of Object.entries(roles)) {
      if (includedFamilies.has(family)) continue;
      renderingDecisions[`${family}a`] = {
        outcome: "NOT_APPLICABLE",
        ruleId: "POL-MT1-PROFILE-OPTION-001",
        profileId: request.profileId,
        role,
        reason: `No applicable ${role} role in the selected atomic ${request.settlementContext} SSI route`,
        provenance: {
          sourceRecordId: settlementRoute.ssi.id,
          version: settlementRoute.ssi.version,
        },
      };
    }
    return {
      redirectDomain: null,
      renderer:
        "MT103 SSI evidence compatibility view from the same resolved route snapshot",
      tags,
      omitted: [],
      renderingDecisions,
    };
  }

  private request(
    definition: ResolutionPageDefinition,
    scenario: ResolutionPageScenario,
    submission: ResolutionPageSubmission,
  ): Mt1SsiResolutionRequest {
    const destination = text(
      submission.values,
      "context.counterpartyBankServiceId",
    );
    const snapshot =
      submission.eligibilitySnapshot?.contextSha256 ??
      hashCanonical({
        definitionId: definition.definitionId,
        scenarioId: scenario.scenarioId,
        values: submission.values,
      });
    return {
      profileId: definition.profile.profileId,
      businessService: definition.profile.businessService ?? "",
      ...(definition.profile.messageDefinitionId
        ? { messageDefinitionId: definition.profile.messageDefinitionId }
        : {}),
      scenarioId: scenario.scenarioId,
      fixtureBindingId: submission.fixtureBindingId,
      paymentDirection: text(submission.values, "context.paymentDirection"),
      localBankRole: text(submission.values, "context.localBankRole"),
      transferMethod: text(submission.values, "context.transferMethod"),
      settlementContext: text(submission.values, "context.settlementContext"),
      upstreamValidatedDestination: { id: destination, version: 1 },
      currentHop: {
        id: `${scenario.scenarioId}:${destination}`,
        version: 1,
        instructingAgentId: "LOCAL_BANK",
        instructedAgentId: destination,
      },
      routeTopology: { id: scenario.scenarioId, version: 1 },
      currency: text(submission.values, "context.currency"),
      bookingEntity: text(submission.values, "context.bookingEntity"),
      valueDate: text(submission.values, "context.valueDate"),
      contextSnapshotId: snapshot,
    };
  }

  private settlementRoute(
    definition: ResolutionPageDefinition,
    request: Mt1SsiResolutionRequest,
    submission: ResolutionPageSubmission,
  ): ResolutionPageSettlementRoute | undefined {
    const selected = submission.selectedRouteIdentity;
    if (!selected || !submission.eligibilitySnapshot) return undefined;
    if (
      !(["INDA", "INGA", "COVE"] as const).includes(
        request.settlementContext as "INDA" | "INGA" | "COVE",
      )
    )
      return undefined;
    return this.routes.settlementRoute(
      selected,
      submission.eligibilitySnapshot.snapshotId,
      {
        settlementContext: request.settlementContext as
          "INDA" | "INGA" | "COVE",
        currency: request.currency,
        messageType: definition.messageType,
        profileId: definition.profile.profileId,
        evidenceFormats: definition.profile.resolutionEvidence?.formats ?? [],
      },
    );
  }

  private candidate(
    definition: ResolutionPageDefinition,
    submission: ResolutionPageSubmission,
    settlementRoute: ResolutionPageSettlementRoute | undefined,
  ): Mt1SsiRouteCandidate | undefined {
    const selected = submission.selectedRouteIdentity;
    if (!selected || !submission.eligibilitySnapshot || !settlementRoute)
      return undefined;
    const profile = this.profiles.find(definition.profile.profileId);
    const optionCompatible = Boolean(
      profile &&
      settlementRoute.projections
        .filter(({ kind }) => kind === "SWIFT_MT_FIELD")
        .every(
          ({ identifier, option }) =>
            Boolean(option) &&
            profile.allowedOptions[identifier]?.includes(option!),
        ),
    );
    return {
      routeBindingId: selected.routeId,
      snapshotToken: submission.eligibilitySnapshot.contextSha256,
      rank: [0],
      optionCompatible,
      complete: true,
      roles: settlementRoute.roles as Mt1SsiRouteCandidate["roles"],
    };
  }
}
