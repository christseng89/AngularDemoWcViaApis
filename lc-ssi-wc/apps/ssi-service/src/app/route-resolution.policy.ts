import type { SsiApplicabilityRecord } from "./sqlite-ssi.repository";

export interface BeneficiaryCustomerInput {
  readonly customerId: string;
  readonly name: string;
  readonly accountReference: string;
  readonly address?: string;
}

export interface RouteResolutionRequest {
  consumer: string;
  counterpartyType?: "BANK" | "CUSTOMER";
  counterpartyId?: string;
  counterpartyBic?: string;
  counterpartyCountry: string;
  settlementCountry?: string;
  settlementMarket?: string;
  clearingSystem?: string;
  currency: string;
  product: string;
  businessFunction: string;
  paymentLeg: string;
  direction: string;
  bookingEntity: string;
  valueDate: string;
  amount: string;
  messagingService?: string;
  businessService?: string;
  messageType: string;
  sourceMessageType?: string;
  transactionReference: string;
  beneficiaryCustomer?: BeneficiaryCustomerInput;
}
export interface ResolutionEvidence {
  criterion: string;
  outcome: "PASS" | "FAIL" | "NOT_EVALUATED";
  expected: string;
  actual: string;
  reasonCode: string;
}
export interface RankedRoute {
  ssiId: string;
  ssiVersion: number;
  counterpartyId: string;
  route: Readonly<Record<string, string>>;
  applicability: Readonly<SsiApplicabilityRecord>;
  fallbackTier: number;
  rank: readonly number[];
  evidence: readonly ResolutionEvidence[];
}
export interface ResolutionPreview {
  decision: "RESOLVED" | "SSI_AMBIGUOUS" | "NO_SSI_FOUND" | "NO_ELIGIBLE_ROUTE";
  recommendedRoute?: RankedRoute;
  alternatives: readonly RankedRoute[];
  lowerRankedEligibleCandidates?: readonly RankedRoute[];
  excludedRoutes: readonly {
    ssiId: string;
    counterpartyId: string;
    route: Readonly<Record<string, string>>;
    evidence: readonly ResolutionEvidence[];
  }[];
  explanation: string;
}

export const CONTROLLED_RANK_RULE_ID = "EC-RANK-01";
export const CONTROLLED_RANK_KEYS = [
  "priority",
  "routePreference",
  "specificity",
] as const;
interface Candidate {
  id: string;
  counterpartyId: string;
  status: string;
  version: number;
  route: Readonly<Record<string, string>>;
}

const compatible = (actual: string | undefined, expected: string): boolean =>
  actual === "ANY" || actual === expected;
const check = (
  criterion: string,
  pass: boolean,
  expected: string,
  actual: string,
  reasonCode: string,
): ResolutionEvidence => ({
  criterion,
  outcome: pass ? "PASS" : "FAIL",
  expected,
  actual: actual || "UNSPECIFIED",
  reasonCode: pass ? "MATCHED" : reasonCode,
});

const APPLICABILITY_DIMENSIONS = [
  "consumer",
  "product",
  "businessFunction",
  "paymentLeg",
  "direction",
] as const;

function activeRowsFor(
  ssiId: string,
  records: readonly SsiApplicabilityRecord[],
  valueTime: number,
): SsiApplicabilityRecord[] {
  return records.filter(
    (row) =>
      row.ssiId === ssiId &&
      row.status === "ACTIVE" &&
      Date.parse(row.validFrom) <= valueTime &&
      valueTime <= Date.parse(row.validTo),
  );
}

function selectApplicability(
  candidateId: string,
  request: RouteResolutionRequest,
  records: readonly SsiApplicabilityRecord[],
  valueTime: number,
): SsiApplicabilityRecord | undefined {
  return activeRowsFor(candidateId, records, valueTime)
    .filter((row) =>
      APPLICABILITY_DIMENSIONS.every((field) =>
        compatible(row[field], request[field]),
      ),
    )
    .sort(
      (left, right) =>
        APPLICABILITY_DIMENSIONS.filter((field) => left[field] === "ANY")
          .length -
          APPLICABILITY_DIMENSIONS.filter((field) => right[field] === "ANY")
            .length || left.id.localeCompare(right.id),
    )[0];
}

function relatedCandidates(
  request: RouteResolutionRequest,
  candidates: readonly Candidate[],
  records: readonly SsiApplicabilityRecord[],
  valueTime: number,
): Candidate[] {
  return candidates.filter(
    (candidate) =>
      !["SUPERSEDED", "REVOKED"].includes(candidate.status) &&
      candidate.route["currency"] === request.currency &&
      activeRowsFor(candidate.id, records, valueTime).some((row) =>
        compatible(row.businessFunction, request.businessFunction),
      ),
  );
}

function hasExactCounterpartyCoverage(
  request: RouteResolutionRequest,
  candidates: readonly Candidate[],
  requestedCounterparty: string,
): boolean {
  return candidates.some((candidate) => {
    const scopedIdentity =
      candidate.route["counterpartyBic"] || candidate.counterpartyId;
    const candidateType = candidate.route["counterpartyType"] ?? "BANK";
    return (
      scopedIdentity === requestedCounterparty &&
      (!request.counterpartyType || candidateType === request.counterpartyType)
    );
  });
}

interface EvidenceContext {
  readonly request: RouteResolutionRequest;
  readonly candidate: Candidate;
  readonly applicability: SsiApplicabilityRecord | undefined;
  readonly requestedCounterparty: string;
  readonly candidateIdentity: string;
  readonly candidateBic: string;
  readonly candidateCountry: string;
  readonly candidateType: string;
  readonly counterpartyCompatible: boolean;
  readonly valueTime: number;
}

function applicabilityEvidence({
  request,
  applicability,
}: EvidenceContext): ResolutionEvidence[] {
  return [
    check(
      "APPLICABILITY",
      Boolean(applicability),
      "active/effective SSI_APPLICABILITY",
      applicability?.id ?? "",
      "SSI_APPLICABILITY_MISMATCH",
    ),
    check(
      "CONSUMER",
      Boolean(applicability) &&
        compatible(applicability?.consumer, request.consumer),
      request.consumer,
      applicability?.consumer ?? "",
      "CONSUMER_MISMATCH",
    ),
    check(
      "PRODUCT",
      Boolean(applicability) &&
        compatible(applicability?.product, request.product),
      request.product,
      applicability?.product ?? "",
      "PRODUCT_MISMATCH",
    ),
    check(
      "BUSINESS_FUNCTION",
      Boolean(applicability) &&
        compatible(applicability?.businessFunction, request.businessFunction),
      request.businessFunction,
      applicability?.businessFunction ?? "",
      "BUSINESS_FUNCTION_MISMATCH",
    ),
    check(
      "PAYMENT_LEG",
      Boolean(applicability) &&
        compatible(applicability?.paymentLeg, request.paymentLeg),
      request.paymentLeg,
      applicability?.paymentLeg ?? "",
      "PAYMENT_LEG_MISMATCH",
    ),
  ];
}

function counterpartyEvidence(context: EvidenceContext): ResolutionEvidence[] {
  const {
    request,
    candidateIdentity,
    candidateBic,
    candidateCountry,
    candidateType,
    counterpartyCompatible,
    requestedCounterparty,
    candidate,
  } = context;
  return [
    check(
      "COUNTERPARTY_SCOPE",
      counterpartyCompatible,
      `${requestedCounterparty} or approved ${request.counterpartyCountry}/ANY matcher`,
      candidateIdentity || candidateCountry,
      "COUNTERPARTY_SCOPE_MISMATCH",
    ),
    check(
      "COUNTERPARTY_TYPE",
      !request.counterpartyType || candidateType === request.counterpartyType,
      request.counterpartyType ?? "BANK",
      candidateType,
      "COUNTERPARTY_TYPE_MISMATCH",
    ),
    check(
      "GLOBAL_FALLBACK_APPROVAL",
      candidateBic !== "ANY" ||
        candidateCountry !== "ANY" ||
        candidate.route["approvedGlobal"] === "true",
      "approvedGlobal=true",
      candidate.route["approvedGlobal"] ?? "false",
      "GLOBAL_FALLBACK_NOT_APPROVED",
    ),
  ];
}

function settlementContextEvidence({
  request,
  candidate,
}: EvidenceContext): ResolutionEvidence[] {
  const route = candidate.route;
  return [
    check(
      "SETTLEMENT_COUNTRY",
      !request.settlementCountry ||
        compatible(route["settlementCountry"], request.settlementCountry),
      request.settlementCountry || "DERIVE_FROM_ROUTE",
      route["settlementCountry"] ?? "",
      "SETTLEMENT_COUNTRY_MISMATCH",
    ),
    check(
      "SETTLEMENT_MARKET",
      !request.settlementMarket ||
        compatible(route["settlementMarket"], request.settlementMarket),
      request.settlementMarket || "DERIVE_FROM_ROUTE",
      route["settlementMarket"] ?? "",
      "SETTLEMENT_MARKET_MISMATCH",
    ),
  ];
}

const directionCompatible = (
  applicability: SsiApplicabilityRecord | undefined,
  direction: string,
): boolean =>
  Boolean(applicability) && compatible(applicability?.direction, direction);

const messagingServiceCompatible = (
  route: Readonly<Record<string, string>>,
  messagingService: string | undefined,
): boolean =>
  !messagingService || compatible(route["messagingService"], messagingService);

const routeSupportsMessageType = (
  route: Readonly<Record<string, string>>,
  messageType: string,
): boolean =>
  String(route["messageTypes"] ?? "")
    .split(",")
    .map((value) => value.trim())
    .includes(messageType);

const csvValues = (value: string | undefined): readonly string[] =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const isCoverRequest = (request: RouteResolutionRequest): boolean =>
  request.sourceMessageType?.endsWith("COV") === true;

const routeSupportsCoverProfile = (
  route: Readonly<Record<string, string>>,
  request: RouteResolutionRequest,
): boolean =>
  !isCoverRequest(request) ||
  (csvValues(route["businessService"]).includes(
    request.businessService ?? "",
  ) &&
    csvValues(route["sourceMessageTypes"]).includes(
      request.sourceMessageType ?? "",
    ));

const routeEffectiveAt = (
  route: Readonly<Record<string, string>>,
  valueTime: number,
): boolean =>
  Number.isFinite(valueTime) &&
  Boolean(route["validFrom"]) &&
  Boolean(route["validTo"]) &&
  Date.parse(route["validFrom"]!) <= valueTime &&
  valueTime <= Date.parse(route["validTo"]!);

const amountWithinRouteLimits = (
  route: Readonly<Record<string, string>>,
  amount: number,
): boolean => {
  const minimum = route["minimumAmount"]
    ? Number(route["minimumAmount"])
    : Number.NEGATIVE_INFINITY;
  const maximum = route["maximumAmount"]
    ? Number(route["maximumAmount"])
    : Number.POSITIVE_INFINITY;
  return Number.isFinite(amount) && amount >= minimum && amount <= maximum;
};

function coverProfileEvidence(
  route: Readonly<Record<string, string>>,
  request: RouteResolutionRequest,
): ResolutionEvidence {
  if (!isCoverRequest(request)) {
    return check(
      "COV_PROFILE",
      true,
      "NOT_APPLICABLE",
      "NOT_APPLICABLE",
      "COV_PROFILE_MISMATCH",
    );
  }
  return check(
    "COV_PROFILE",
    routeSupportsCoverProfile(route, request),
    `${request.messageType}|${request.businessService}|${request.sourceMessageType}`,
    `${route["messageTypes"] ?? ""}|${route["businessService"] ?? ""}|${route["sourceMessageTypes"] ?? ""}`,
    "COV_PROFILE_MISMATCH",
  );
}

function routeEvidence(context: EvidenceContext): ResolutionEvidence[] {
  const { request, candidate, applicability, valueTime } = context;
  const route = candidate.route;
  const amount = Number(request.amount);
  return [
    check(
      "NOSTRO_CURRENCY",
      route["accountCurrency"] === request.currency,
      request.currency,
      route["accountCurrency"] ?? "",
      "NOSTRO_CURRENCY_MISMATCH",
    ),
    check(
      "BOOKING_ENTITY",
      route["bookingEntity"] === request.bookingEntity,
      request.bookingEntity,
      route["bookingEntity"] ?? "",
      "BOOKING_ENTITY_MISMATCH",
    ),
    check(
      "DIRECTION",
      directionCompatible(applicability, request.direction),
      request.direction,
      applicability?.direction ?? "",
      "DIRECTION_MISMATCH",
    ),
    check(
      "MESSAGING_SERVICE",
      messagingServiceCompatible(route, request.messagingService),
      request.messagingService || "DERIVE_FROM_ROUTE",
      route["messagingService"] ?? "",
      "MESSAGING_SERVICE_MISMATCH",
    ),
    check(
      "MESSAGE_TYPE",
      routeSupportsMessageType(route, request.messageType),
      request.messageType,
      route["messageTypes"] ?? "",
      "MESSAGE_TYPE_NOT_SUPPORTED",
    ),
    coverProfileEvidence(route, request),
    check(
      "VALUE_DATE",
      routeEffectiveAt(route, valueTime),
      request.valueDate,
      `${route["validFrom"] ?? "MISSING"}..${route["validTo"] ?? "MISSING"}`,
      "SSI_NOT_EFFECTIVE",
    ),
    check(
      "AMOUNT_LIMIT",
      amountWithinRouteLimits(route, amount),
      request.amount,
      `${route["minimumAmount"] ?? "OPEN"}..${route["maximumAmount"] ?? "OPEN"}`,
      "AMOUNT_LIMIT_EXCEEDED",
    ),
  ];
}

function evidenceFor(context: EvidenceContext): ResolutionEvidence[] {
  return [
    check(
      "STATUS",
      context.candidate.status === "ACTIVE",
      "ACTIVE",
      context.candidate.status,
      "SSI_NOT_ACTIVE",
    ),
    check(
      "CURRENCY",
      context.candidate.route["currency"] === context.request.currency,
      context.request.currency,
      context.candidate.route["currency"] ?? "",
      "CURRENCY_MISMATCH",
    ),
    ...applicabilityEvidence(context),
    ...counterpartyEvidence(context),
    ...settlementContextEvidence(context),
    ...routeEvidence(context),
  ];
}

type CandidateEvaluation =
  | { readonly eligible: RankedRoute }
  | { readonly excluded: ResolutionPreview["excludedRoutes"][number] };

function candidateEvidenceContext(
  request: RouteResolutionRequest,
  candidate: Candidate,
  records: readonly SsiApplicabilityRecord[],
  valueTime: number,
  requestedCounterparty: string,
): EvidenceContext {
  const route = candidate.route;
  const candidateBic = route["counterpartyBic"] ?? "";
  const candidateIdentity = candidateBic || candidate.counterpartyId;
  const candidateCountry = route["counterpartyCountry"] ?? "";
  const counterpartyCompatible =
    candidateIdentity === requestedCounterparty ||
    (candidateBic === "ANY" &&
      compatible(candidateCountry, request.counterpartyCountry));
  return {
    request,
    candidate,
    applicability: selectApplicability(
      candidate.id,
      request,
      records,
      valueTime,
    ),
    requestedCounterparty,
    candidateIdentity,
    candidateBic,
    candidateCountry,
    candidateType: route["counterpartyType"] ?? "BANK",
    counterpartyCompatible,
    valueTime,
  };
}

function excludedCandidate(
  context: EvidenceContext,
  evidence: readonly ResolutionEvidence[],
): CandidateEvaluation {
  return {
    excluded: {
      ssiId: context.candidate.id,
      counterpartyId: context.candidate.counterpartyId,
      route: context.candidate.route,
      evidence,
    },
  };
}

function fallbackTierFor(context: EvidenceContext): number {
  if (context.candidateIdentity === context.requestedCounterparty) return 0;
  if (context.candidateCountry === context.request.counterpartyCountry)
    return 1;
  return context.candidate.route["region"] ? 2 : 3;
}

function eligibleCandidate(
  context: EvidenceContext & { applicability: SsiApplicabilityRecord },
  evidence: readonly ResolutionEvidence[],
): CandidateEvaluation {
  const route = context.candidate.route;
  const fallbackTier = fallbackTierFor(context);
  const routeClassRank =
    { PRIMARY: 0, SECONDARY: 1, FALLBACK: 2 }[route["routePreference"] ?? ""] ??
    9;
  const specificity = APPLICABILITY_DIMENSIONS.filter(
    (field) => context.applicability[field] === "ANY",
  ).length;
  const priority = Number(route["priority"] ?? "999");
  return {
    eligible: {
      ssiId: context.candidate.id,
      ssiVersion: context.candidate.version,
      counterpartyId: context.candidate.counterpartyId,
      route,
      applicability: context.applicability,
      fallbackTier,
      // EC-RANK-01 is deliberately limited to governed business fields. Stable
      // technical identifiers (including SSI code/id/version and row order) may
      // preserve presentation order, but must never select a winning route.
      rank: [priority, routeClassRank, specificity],
      evidence,
    },
  };
}

function evaluateCandidate(
  request: RouteResolutionRequest,
  candidate: Candidate,
  records: readonly SsiApplicabilityRecord[],
  valueTime: number,
  requestedCounterparty: string,
): CandidateEvaluation {
  const context = candidateEvidenceContext(
    request,
    candidate,
    records,
    valueTime,
    requestedCounterparty,
  );
  const evidence = evidenceFor(context);
  if (
    evidence.some((item) => item.outcome === "FAIL") ||
    !context.applicability
  )
    return excludedCandidate(context, evidence);
  return eligibleCandidate(
    { ...context, applicability: context.applicability },
    evidence,
  );
}

function compareRankedRoutes(left: RankedRoute, right: RankedRoute): number {
  for (let index = 0; index < left.rank.length; index += 1) {
    const difference = (left.rank[index] ?? 0) - (right.rank[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

const sameBusinessRank = (left: RankedRoute, right: RankedRoute): boolean =>
  left.rank.length === right.rank.length &&
  left.rank.every((value, index) => value === right.rank[index]);

export function previewResolution(
  request: RouteResolutionRequest,
  candidates: readonly Candidate[],
  applicabilityRecords: readonly SsiApplicabilityRecord[],
): ResolutionPreview {
  const requestedCounterparty =
    request.counterpartyBic || request.counterpartyId || "";
  const valueTime = Date.parse(request.valueDate);
  const related = relatedCandidates(
    request,
    candidates,
    applicabilityRecords,
    valueTime,
  );
  if (!related.length)
    return {
      decision: "NO_SSI_FOUND",
      alternatives: [],
      excludedRoutes: [],
      explanation: `No SSI is configured for ${request.currency} and ${request.businessFunction}.`,
    };
  if (!hasExactCounterpartyCoverage(request, related, requestedCounterparty))
    return {
      decision: "NO_ELIGIBLE_ROUTE",
      alternatives: [],
      excludedRoutes: [],
      explanation: `No counterparty-owned SSI coverage is configured for ${requestedCounterparty}; generic or country fallbacks are not eligible without an authorised counterparty relationship.`,
    };
  const eligible: RankedRoute[] = [];
  const excludedRoutes: ResolutionPreview["excludedRoutes"][number][] = [];
  for (const candidate of related) {
    const evaluation = evaluateCandidate(
      request,
      candidate,
      applicabilityRecords,
      valueTime,
      requestedCounterparty,
    );
    if ("eligible" in evaluation) eligible.push(evaluation.eligible);
    else excludedRoutes.push(evaluation.excluded);
  }
  eligible.sort(compareRankedRoutes);
  if (!eligible.length)
    return {
      decision: "NO_ELIGIBLE_ROUTE",
      alternatives: [],
      excludedRoutes,
      explanation: `SSI records exist for ${request.currency}, but every route failed eligibility.`,
    };
  const first = eligible[0]!;
  const topRankedCandidates = eligible.filter((candidate) =>
    sameBusinessRank(candidate, first),
  );
  const lowerRankedEligibleCandidates = eligible.filter(
    (candidate) => !sameBusinessRank(candidate, first),
  );
  if (topRankedCandidates.length > 1)
    return {
      decision: "SSI_AMBIGUOUS",
      alternatives: topRankedCandidates,
      lowerRankedEligibleCandidates,
      excludedRoutes,
      explanation: `${topRankedCandidates.length} eligible SSI routes share the same top business rank; technical identifiers cannot break the tie.`,
    };
  const recommendedRoute = first;
  return {
    decision: "RESOLVED",
    recommendedRoute,
    alternatives: [],
    lowerRankedEligibleCandidates,
    excludedRoutes,
    explanation: `Recommended tier ${recommendedRoute.fallbackTier} route after eligibility and deterministic ranking; ${excludedRoutes.length} route(s) excluded.`,
  };
}
