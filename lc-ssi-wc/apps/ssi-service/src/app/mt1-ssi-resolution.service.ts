import { Injectable } from "@nestjs/common";
import {
  Mt1SsiProfileRegistry,
  type Mt1SsiProfile,
} from "./mt1-ssi-profile.registry";

export type Mt1SsiApplicability = "NOT_EVALUATED" | "REQUIRED" | "NOT_REQUIRED";
export type Mt1SsiResolutionOutcome =
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

export interface Mt1SsiResolutionRequest {
  readonly profileId: string;
  readonly businessService: string;
  readonly messageDefinitionId?: string;
  readonly scenarioId: string;
  readonly fixtureBindingId: string;
  readonly paymentDirection: string;
  readonly localBankRole: string;
  readonly transferMethod: string;
  readonly settlementContext: string;
  readonly upstreamValidatedDestination: {
    readonly id: string;
    readonly version: number;
  };
  readonly currentHop: {
    readonly id: string;
    readonly version: number;
    readonly instructingAgentId: string;
    readonly instructedAgentId: string;
  };
  readonly routeTopology: { readonly id: string; readonly version: number };
  readonly currency: string;
  readonly bookingEntity: string;
  readonly valueDate: string;
  readonly contextSnapshotId: string;
}

export interface Mt1SsiRouteRole {
  readonly role:
    | "INDA_SETTLEMENT_ACCOUNT_RELATIONSHIP"
    | "INGA_SETTLEMENT_ACCOUNT_RELATIONSHIP"
    | "INSTRUCTING_REIMBURSEMENT_AGENT"
    | "INSTRUCTED_REIMBURSEMENT_AGENT"
    | "THIRD_REIMBURSEMENT_AGENT";
  readonly owner:
    "OWN_SSI_OR_ACCOUNT_MASTER" | "COUNTERPARTY_SSI" | "THIRD_PARTY_SSI";
  readonly recordId: string;
  readonly version: number;
}

export interface Mt1SsiRouteCandidate {
  readonly routeBindingId: string;
  readonly snapshotToken: string;
  readonly rank: readonly number[];
  readonly optionCompatible: boolean;
  readonly complete: boolean;
  readonly roles: readonly Mt1SsiRouteRole[];
}

export interface Mt1SsiCandidateRepository {
  discover(
    request: Mt1SsiResolutionRequest,
    profile: Mt1SsiProfile,
  ): readonly Mt1SsiRouteCandidate[];
}

export interface Mt1SsiResolutionResult {
  readonly ssiApplicability: Mt1SsiApplicability;
  readonly resolutionOutcome: Mt1SsiResolutionOutcome;
  readonly payloadGenerated: false;
  readonly route?: Mt1SsiRouteCandidate;
  readonly candidates?: readonly Mt1SsiRouteCandidate[];
}

const failure = (
  resolutionOutcome: Mt1SsiResolutionOutcome,
  ssiApplicability: Mt1SsiApplicability = "NOT_EVALUATED",
): Mt1SsiResolutionResult => ({
  ssiApplicability,
  resolutionOutcome,
  payloadGenerated: false,
});

const sameRank = (left: readonly number[], right: readonly number[]): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

@Injectable()
export class Mt1SsiResolutionService {
  constructor(
    private readonly profiles: Mt1SsiProfileRegistry,
    private readonly candidates: Mt1SsiCandidateRepository,
  ) {}

  resolve(request: Mt1SsiResolutionRequest): Mt1SsiResolutionResult {
    if (request.paymentDirection !== "OUTWARD")
      return failure("UNSUPPORTED_DIRECTION");
    const profile = this.profiles.find(request.profileId);
    if (!profile || !this.matchesProfile(request, profile))
      return failure("UNSUPPORTED_PROFILE");
    if (!this.validTopology(request))
      return failure("INVALID_CONTEXT_TOPOLOGY");
    if (
      !request.upstreamValidatedDestination.id ||
      request.upstreamValidatedDestination.version < 1
    )
      return failure("INVALID_UPSTREAM_CONTEXT");

    const discovered = [...this.candidates.discover(request, profile)];
    if (discovered.some((candidate) => !candidate.optionCompatible))
      return failure("PROFILE_INCOMPLETE", "REQUIRED");
    const complete = discovered
      .filter(
        (candidate) =>
          candidate.complete &&
          candidate.snapshotToken === request.contextSnapshotId,
      )
      .sort((left, right) =>
        left.rank.reduce(
          (difference, value, index) =>
            difference || value - (right.rank[index] ?? 0),
          0,
        ),
      );
    if (!complete.length) return failure("NO_ELIGIBLE_SSI", "REQUIRED");
    const top = complete.filter((candidate) =>
      sameRank(candidate.rank, complete[0]!.rank),
    );
    if (top.length > 1)
      return {
        ...failure("AMBIGUOUS_ROUTE", "REQUIRED"),
        candidates: top,
      };
    return {
      ssiApplicability: "REQUIRED",
      resolutionOutcome: "ELIGIBLE_COMPLETE_ROUTE",
      payloadGenerated: false,
      route: complete[0]!,
    };
  }

  private matchesProfile(
    request: Mt1SsiResolutionRequest,
    profile: Mt1SsiProfile,
  ): boolean {
    return (
      request.businessService === profile.businessService &&
      (profile.messageDefinitionId === undefined ||
        request.messageDefinitionId === profile.messageDefinitionId)
    );
  }

  private validTopology(request: Mt1SsiResolutionRequest): boolean {
    if (request.localBankRole !== "INSTRUCTING_AGENT") return false;
    if (!request.currentHop.id || request.currentHop.version < 1) return false;
    if (!request.routeTopology.id || request.routeTopology.version < 1)
      return false;
    return (
      (request.transferMethod === "SERIAL" &&
        ["INDA", "INGA"].includes(request.settlementContext)) ||
      (request.transferMethod === "COVER" &&
        request.settlementContext === "COVE")
    );
  }
}
