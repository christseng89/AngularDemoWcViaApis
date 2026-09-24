import { Injectable } from "@nestjs/common";
import type {
  ResolutionPageDefinition,
  ResolutionPageExecutionOutcome,
  ResolutionPageExecutionResult,
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
    const candidate = this.candidate(scenario, submission);
    const repository: Mt1SsiCandidateRepository = {
      discover: () => (candidate ? [candidate] : []),
    };
    const resolved = new Mt1SsiResolutionService(
      this.profiles,
      repository,
    ).resolve(request);
    const requestSha256 = hashCanonical(request);
    const responseSha256 = hashCanonical(resolved);
    const outcome = executionOutcome(resolved.resolutionOutcome);
    const settlementRoute =
      resolved.route &&
      submission.selectedRouteIdentity &&
      submission.eligibilitySnapshot
        ? this.routes.settlementRoute(
            submission.selectedRouteIdentity,
            submission.eligibilitySnapshot.snapshotId,
            resolved.route.roles,
          )
        : undefined;
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
      nvrOutcome: "NOT_EVALUATED",
      ssiApplicability: resolved.ssiApplicability,
      resolutionOutcome: resolved.resolutionOutcome,
      ...(resolved.route
        ? { routeBindingId: resolved.route.routeBindingId }
        : {}),
      ...(settlementRoute ? { settlementRoute } : {}),
      fields: [],
      outputs: [],
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

  private candidate(
    scenario: ResolutionPageScenario,
    submission: ResolutionPageSubmission,
  ): Mt1SsiRouteCandidate | undefined {
    const selected = submission.selectedRouteIdentity;
    if (!selected || !submission.eligibilitySnapshot) return undefined;
    if (
      !this.routes.accepts(selected, submission.eligibilitySnapshot.snapshotId)
    )
      return undefined;
    const cove = scenario.scenarioId.endsWith(":MT1-COVE-SSI");
    return {
      routeBindingId: selected.routeId,
      snapshotToken: submission.eligibilitySnapshot.contextSha256,
      rank: [0],
      optionCompatible: true,
      complete: true,
      roles: cove
        ? [
            {
              role: "INSTRUCTING_REIMBURSEMENT_AGENT",
              owner: "OWN_SSI_OR_ACCOUNT_MASTER",
              recordId: selected.nostro.id,
              version: selected.nostro.version,
            },
            {
              role: "INSTRUCTED_REIMBURSEMENT_AGENT",
              owner: "COUNTERPARTY_SSI",
              recordId: selected.ssi.id,
              version: selected.ssi.version,
            },
            {
              role: "THIRD_REIMBURSEMENT_AGENT",
              owner: "THIRD_PARTY_SSI",
              recordId: selected.applicability.id,
              version: selected.applicability.version,
            },
          ]
        : [
            {
              role: scenario.scenarioId.endsWith(":MT1-INDA-SSI")
                ? "INDA_SETTLEMENT_ACCOUNT_RELATIONSHIP"
                : "INGA_SETTLEMENT_ACCOUNT_RELATIONSHIP",
              owner: "COUNTERPARTY_SSI",
              recordId: selected.ssi.id,
              version: selected.ssi.version,
            },
          ],
    };
  }
}
