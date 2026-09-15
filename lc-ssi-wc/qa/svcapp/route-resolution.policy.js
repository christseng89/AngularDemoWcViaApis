"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONTROLLED_RANK_KEYS = exports.CONTROLLED_RANK_RULE_ID = void 0;
exports.previewResolution = previewResolution;
const clearing_systems_reference_1 = require("./clearing-systems.reference");
exports.CONTROLLED_RANK_RULE_ID = "EC-RANK-01";
exports.CONTROLLED_RANK_KEYS = [
    "priority",
    "routePreference",
    "specificity",
];
const compatible = (actual, expected) => actual === "ANY" || actual === expected;
const clearingCountryCompatible = (clearing, country) => Boolean(clearing &&
    (clearing.settlementCountry === country ||
        clearing.eligibleCountries.includes(country)));
const check = (criterion, pass, expected, actual, reasonCode) => ({
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
];
function activeRowsFor(ssiId, records, valueTime) {
    return records.filter((row) => row.ssiId === ssiId &&
        row.status === "ACTIVE" &&
        Date.parse(row.validFrom) <= valueTime &&
        valueTime <= Date.parse(row.validTo));
}
function selectApplicability(candidateId, request, records, valueTime) {
    return activeRowsFor(candidateId, records, valueTime)
        .filter((row) => APPLICABILITY_DIMENSIONS.every((field) => compatible(row[field], request[field])))
        .sort((left, right) => APPLICABILITY_DIMENSIONS.filter((field) => left[field] === "ANY")
        .length -
        APPLICABILITY_DIMENSIONS.filter((field) => right[field] === "ANY")
            .length || left.id.localeCompare(right.id))[0];
}
function relatedCandidates(request, candidates, records, valueTime) {
    return candidates.filter((candidate) => !["SUPERSEDED", "REVOKED"].includes(candidate.status) &&
        candidate.route["currency"] === request.currency &&
        activeRowsFor(candidate.id, records, valueTime).some((row) => compatible(row.businessFunction, request.businessFunction)));
}
function hasExactCounterpartyCoverage(request, candidates, requestedCounterparty) {
    return candidates.some((candidate) => {
        const scopedIdentity = candidate.route["counterpartyBic"] || candidate.counterpartyId;
        const candidateType = candidate.route["counterpartyType"] ?? "BANK";
        return (scopedIdentity === requestedCounterparty &&
            (!request.counterpartyType || candidateType === request.counterpartyType));
    });
}
function clearingReferenceFor(route, request, valueTime) {
    return clearing_systems_reference_1.CLEARING_SYSTEMS.find((system) => system.code === route["clearingSystem"] &&
        system.status === "ACTIVE" &&
        system.supportedCurrency === request.currency &&
        Date.parse(system.validFrom) <= valueTime &&
        valueTime <= Date.parse(system.validTo));
}
function applicabilityEvidence({ request, applicability, }) {
    return [
        check("APPLICABILITY", Boolean(applicability), "active/effective SSI_APPLICABILITY", applicability?.id ?? "", "SSI_APPLICABILITY_MISMATCH"),
        check("CONSUMER", Boolean(applicability) &&
            compatible(applicability.consumer, request.consumer), request.consumer, applicability?.consumer ?? "", "CONSUMER_MISMATCH"),
        check("PRODUCT", Boolean(applicability) &&
            compatible(applicability.product, request.product), request.product, applicability?.product ?? "", "PRODUCT_MISMATCH"),
        check("BUSINESS_FUNCTION", Boolean(applicability) &&
            compatible(applicability.businessFunction, request.businessFunction), request.businessFunction, applicability?.businessFunction ?? "", "BUSINESS_FUNCTION_MISMATCH"),
        check("PAYMENT_LEG", Boolean(applicability) &&
            compatible(applicability.paymentLeg, request.paymentLeg), request.paymentLeg, applicability?.paymentLeg ?? "", "PAYMENT_LEG_MISMATCH"),
    ];
}
function counterpartyEvidence(context) {
    const { request, candidateIdentity, candidateBic, candidateCountry, candidateType, counterpartyCompatible, requestedCounterparty, candidate, } = context;
    return [
        check("COUNTERPARTY_SCOPE", counterpartyCompatible, `${requestedCounterparty} or approved ${request.counterpartyCountry}/ANY matcher`, candidateIdentity || candidateCountry, "COUNTERPARTY_SCOPE_MISMATCH"),
        check("COUNTERPARTY_TYPE", !request.counterpartyType || candidateType === request.counterpartyType, request.counterpartyType ?? "BANK", candidateType, "COUNTERPARTY_TYPE_MISMATCH"),
        check("GLOBAL_FALLBACK_APPROVAL", candidateBic !== "ANY" ||
            candidateCountry !== "ANY" ||
            candidate.route["approvedGlobal"] === "true", "approvedGlobal=true", candidate.route["approvedGlobal"] ?? "false", "GLOBAL_FALLBACK_NOT_APPROVED"),
    ];
}
function clearingEvidence({ request, candidate, clearingReference, }) {
    const route = candidate.route;
    return [
        check("SETTLEMENT_COUNTRY", !request.settlementCountry ||
            (compatible(route["settlementCountry"], request.settlementCountry) &&
                clearingCountryCompatible(clearingReference, request.settlementCountry)), request.settlementCountry || "DERIVE_FROM_ROUTE", route["settlementCountry"] ?? "", "SETTLEMENT_COUNTRY_MISMATCH"),
        check("SETTLEMENT_MARKET", !request.settlementMarket ||
            compatible(route["settlementMarket"], request.settlementMarket), request.settlementMarket || "DERIVE_FROM_ROUTE", route["settlementMarket"] ?? "", "SETTLEMENT_MARKET_MISMATCH"),
        check("CLEARING_SYSTEM", !request.clearingSystem ||
            compatible(route["clearingSystem"], request.clearingSystem), request.clearingSystem || "DERIVE_FROM_ROUTE", route["clearingSystem"] ?? "", "CLEARING_SYSTEM_MISMATCH"),
        check("CLEARING_STANDING_DATA", Boolean(clearingReference), `${request.currency} active governed clearing system`, route["clearingSystem"] ?? "", "CLEARING_SYSTEM_NOT_ACTIVE_OR_CURRENCY_COMPATIBLE"),
        check("CLEARING_SCHEME_TYPE", Boolean(clearingReference) &&
            (!route["schemeType"] ||
                route["schemeType"] === clearingReference.schemeType), clearingReference?.schemeType ?? "ACTIVE_REFERENCE_REQUIRED", route["schemeType"] ?? clearingReference?.schemeType ?? "", "CLEARING_SCHEME_TYPE_MISMATCH"),
    ];
}
const directionCompatible = (applicability, direction) => Boolean(applicability) && compatible(applicability.direction, direction);
const messagingServiceCompatible = (route, messagingService) => !messagingService || compatible(route["messagingService"], messagingService);
const routeSupportsMessageType = (route, messageType) => String(route["messageTypes"] ?? "")
    .split(",")
    .map((value) => value.trim())
    .includes(messageType);
const csvValues = (value) => String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
const isCoverRequest = (request) => request.sourceMessageType?.endsWith("COV") === true;
const routeSupportsCoverProfile = (route, request) => !isCoverRequest(request) ||
    (csvValues(route["businessService"]).includes(request.businessService ?? "") &&
        csvValues(route["sourceMessageTypes"]).includes(request.sourceMessageType ?? ""));
const routeEffectiveAt = (route, valueTime) => Number.isFinite(valueTime) &&
    Boolean(route["validFrom"]) &&
    Boolean(route["validTo"]) &&
    Date.parse(route["validFrom"]) <= valueTime &&
    valueTime <= Date.parse(route["validTo"]);
const amountWithinRouteLimits = (route, amount) => {
    const minimum = route["minimumAmount"]
        ? Number(route["minimumAmount"])
        : Number.NEGATIVE_INFINITY;
    const maximum = route["maximumAmount"]
        ? Number(route["maximumAmount"])
        : Number.POSITIVE_INFINITY;
    return Number.isFinite(amount) && amount >= minimum && amount <= maximum;
};
function coverProfileEvidence(route, request) {
    if (!isCoverRequest(request)) {
        return check("COV_PROFILE", true, "NOT_APPLICABLE", "NOT_APPLICABLE", "COV_PROFILE_MISMATCH");
    }
    return check("COV_PROFILE", routeSupportsCoverProfile(route, request), `${request.messageType}|${request.businessService}|${request.sourceMessageType}`, `${route["messageTypes"] ?? ""}|${route["businessService"] ?? ""}|${route["sourceMessageTypes"] ?? ""}`, "COV_PROFILE_MISMATCH");
}
function routeEvidence(context) {
    const { request, candidate, applicability, valueTime } = context;
    const route = candidate.route;
    const amount = Number(request.amount);
    return [
        check("NOSTRO_CURRENCY", route["accountCurrency"] === request.currency, request.currency, route["accountCurrency"] ?? "", "NOSTRO_CURRENCY_MISMATCH"),
        check("BOOKING_ENTITY", route["bookingEntity"] === request.bookingEntity, request.bookingEntity, route["bookingEntity"] ?? "", "BOOKING_ENTITY_MISMATCH"),
        check("DIRECTION", directionCompatible(applicability, request.direction), request.direction, applicability?.direction ?? "", "DIRECTION_MISMATCH"),
        check("MESSAGING_SERVICE", messagingServiceCompatible(route, request.messagingService), request.messagingService || "DERIVE_FROM_ROUTE", route["messagingService"] ?? "", "MESSAGING_SERVICE_MISMATCH"),
        check("MESSAGE_TYPE", routeSupportsMessageType(route, request.messageType), request.messageType, route["messageTypes"] ?? "", "MESSAGE_TYPE_NOT_SUPPORTED"),
        coverProfileEvidence(route, request),
        check("VALUE_DATE", routeEffectiveAt(route, valueTime), request.valueDate, `${route["validFrom"] ?? "MISSING"}..${route["validTo"] ?? "MISSING"}`, "SSI_NOT_EFFECTIVE"),
        check("AMOUNT_LIMIT", amountWithinRouteLimits(route, amount), request.amount, `${route["minimumAmount"] ?? "OPEN"}..${route["maximumAmount"] ?? "OPEN"}`, "AMOUNT_LIMIT_EXCEEDED"),
        {
            criterion: "LIVE_CLEARING_PARTICIPATION",
            outcome: "NOT_EVALUATED",
            expected: request.clearingSystem || route["clearingSystem"] || "UNSPECIFIED",
            actual: "STANDING_DATA_VALIDATED_LIVE_DIRECTORY_REQUIRED",
            reasonCode: "LIVE_REACHABILITY_NOT_EVALUATED",
        },
    ];
}
function evidenceFor(context) {
    return [
        check("STATUS", context.candidate.status === "ACTIVE", "ACTIVE", context.candidate.status, "SSI_NOT_ACTIVE"),
        check("CURRENCY", context.candidate.route["currency"] === context.request.currency, context.request.currency, context.candidate.route["currency"] ?? "", "CURRENCY_MISMATCH"),
        ...applicabilityEvidence(context),
        ...counterpartyEvidence(context),
        ...clearingEvidence(context),
        ...routeEvidence(context),
    ];
}
function candidateEvidenceContext(request, candidate, records, valueTime, requestedCounterparty) {
    const route = candidate.route;
    const candidateBic = route["counterpartyBic"] ?? "";
    const candidateIdentity = candidateBic || candidate.counterpartyId;
    const candidateCountry = route["counterpartyCountry"] ?? "";
    const counterpartyCompatible = candidateIdentity === requestedCounterparty ||
        (candidateBic === "ANY" &&
            compatible(candidateCountry, request.counterpartyCountry));
    return {
        request,
        candidate,
        applicability: selectApplicability(candidate.id, request, records, valueTime),
        clearingReference: clearingReferenceFor(route, request, valueTime),
        requestedCounterparty,
        candidateIdentity,
        candidateBic,
        candidateCountry,
        candidateType: route["counterpartyType"] ?? "BANK",
        counterpartyCompatible,
        valueTime,
    };
}
function excludedCandidate(context, evidence) {
    return {
        excluded: {
            ssiId: context.candidate.id,
            counterpartyId: context.candidate.counterpartyId,
            route: context.candidate.route,
            evidence,
        },
    };
}
function fallbackTierFor(context) {
    if (context.candidateIdentity === context.requestedCounterparty)
        return 0;
    if (context.candidateCountry === context.request.counterpartyCountry)
        return 1;
    return context.candidate.route["region"] ? 2 : 3;
}
function eligibleCandidate(context, evidence) {
    const route = context.candidate.route;
    const fallbackTier = fallbackTierFor(context);
    const routeClassRank = { PRIMARY: 0, SECONDARY: 1, FALLBACK: 2 }[route["routePreference"] ?? ""] ??
        9;
    const specificity = APPLICABILITY_DIMENSIONS.filter((field) => context.applicability[field] === "ANY").length;
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
function evaluateCandidate(request, candidate, records, valueTime, requestedCounterparty) {
    const context = candidateEvidenceContext(request, candidate, records, valueTime, requestedCounterparty);
    const evidence = evidenceFor(context);
    return evidence.some((item) => item.outcome === "FAIL")
        ? excludedCandidate(context, evidence)
        : eligibleCandidate(context, evidence);
}
function compareRankedRoutes(left, right) {
    for (let index = 0; index < left.rank.length; index += 1) {
        const difference = (left.rank[index] ?? 0) - (right.rank[index] ?? 0);
        if (difference)
            return difference;
    }
    return 0;
}
const sameBusinessRank = (left, right) => left.rank.length === right.rank.length &&
    left.rank.every((value, index) => value === right.rank[index]);
function previewResolution(request, candidates, applicabilityRecords) {
    const requestedCounterparty = request.counterpartyBic || request.counterpartyId || "";
    const valueTime = Date.parse(request.valueDate);
    const related = relatedCandidates(request, candidates, applicabilityRecords, valueTime);
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
    const eligible = [];
    const excludedRoutes = [];
    for (const candidate of related) {
        const evaluation = evaluateCandidate(request, candidate, applicabilityRecords, valueTime, requestedCounterparty);
        if ("eligible" in evaluation)
            eligible.push(evaluation.eligible);
        else
            excludedRoutes.push(evaluation.excluded);
    }
    eligible.sort(compareRankedRoutes);
    if (!eligible.length)
        return {
            decision: "NO_ELIGIBLE_ROUTE",
            alternatives: [],
            excludedRoutes,
            explanation: `SSI records exist for ${request.currency}, but every route failed eligibility.`,
        };
    const first = eligible[0];
    const topRankedCandidates = eligible.filter((candidate) => sameBusinessRank(candidate, first));
    const lowerRankedEligibleCandidates = eligible.filter((candidate) => !sameBusinessRank(candidate, first));
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
//# sourceMappingURL=route-resolution.policy.js.map