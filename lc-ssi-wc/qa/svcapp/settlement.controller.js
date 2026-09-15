"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettlementController = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const route_resolution_policy_1 = require("./route-resolution.policy");
const batch_resolution_service_1 = require("./batch-resolution.service");
const payment_message_index_service_1 = require("./payment-message-index.service");
const ssi_application_service_1 = require("./ssi-application.service");
const mt2_settlement_request_policy_1 = require("./mt2-settlement-request.policy");
const counterparty_ssi_resolution_service_1 = require("./counterparty-ssi-resolution.service");
const message_domain_resolution_service_1 = require("./message-domain-resolution.service");
const database_snapshot_identity_service_1 = require("./database-snapshot-identity.service");
const ssi_data_quality_service_1 = require("./ssi-data-quality.service");
let SettlementController = class SettlementController {
    service;
    batchResolution;
    paymentMessageIndex;
    counterpartySsi;
    messageDomains;
    snapshotIdentity;
    dataQuality;
    constructor(service, batchResolution, paymentMessageIndex, counterpartySsi, messageDomains, snapshotIdentity, dataQuality) {
        this.service = service;
        this.batchResolution = batchResolution;
        this.paymentMessageIndex = paymentMessageIndex;
        this.counterpartySsi = counterpartySsi;
        this.messageDomains = messageDomains;
        this.snapshotIdentity = snapshotIdentity;
        this.dataQuality = dataQuality;
    }
    dataQualityStatus() {
        const dataIssues = this.dataQuality.globalIssues();
        return {
            status: dataIssues.length ? "FAIL" : "PASS",
            code: dataIssues.length ? ssi_data_quality_service_1.INCORRECT_SSI_CONFIGURATION : "SSI_DATA_VALID",
            dataIssues,
        };
    }
    ownAccountScenario(body) {
        if (body.scenarioCode !== "BOOK_TRANSFER_SAME_RECEIVER" &&
            body.scenarioCode !== "CREDIT_ONE_OF_SEVERAL_AT_57A")
            return undefined;
        const profile = this.paymentMessageIndex.findSelectable(String(body.sourceMessageType ?? ""));
        if (!profile)
            return undefined;
        const result = this.messageDomains.resolve("OWN_SSI_NOSTRO", {
            ...body,
            businessService: profile.businessService,
        });
        const status = Number(result.mx["httpStatus"]);
        if (status >= 400)
            throw new common_1.HttpException(result, status);
        return result;
    }
    messageIndex() {
        return this.paymentMessageIndex.getIndex();
    }
    unsupportedMt2(body, error) {
        const source = String(body["sourceMessageType"] ?? "");
        const inferred = this.inferredDomainEnvelope(source, body);
        if (inferred)
            throw new common_1.HttpException(inferred.body, inferred.status);
        const redirectDomain = source === "MT200" ? "OWN_SSI_NOSTRO" : null;
        const errorResponse = error instanceof common_1.HttpException ? error.getResponse() : undefined;
        let message = "MESSAGE_TYPE_NOT_SUPPORTED";
        if (typeof errorResponse === "string") {
            message = errorResponse;
        }
        else if (errorResponse && typeof errorResponse === "object") {
            message = String(errorResponse["message"] ?? "");
        }
        const legs = body["legs"];
        const legCount = body["legCount"];
        const leg2 = body["leg2"];
        const parser = Array.isArray(legs) || legCount !== undefined || leg2
            ? this.parserOutcome(body, redirectDomain)
            : {
                httpStatus: 400,
                code: "MESSAGE_TYPE_NOT_SUPPORTED",
                redirectDomain,
                payloadGenerated: false,
                detail: "",
            };
        const isSettlementRequest = Object.prototype.hasOwnProperty.call(body, "counterpartyBankServiceId");
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
        const responseStatus = knownCode && error instanceof common_1.HttpException ? error.getStatus() : 400;
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
        throw new common_1.HttpException(response, responseStatus);
    }
    inferredDomainEnvelope(source, body) {
        const sourceEnvelope = this.sourceDomainEnvelope(source, body);
        if (sourceEnvelope)
            return sourceEnvelope;
        const ownAccountEnvelope = this.ownAccountDomainEnvelope(body);
        if (ownAccountEnvelope)
            return ownAccountEnvelope;
        return (this.directDebitDomainEnvelope(body) ??
            this.notificationDomainEnvelope(body));
    }
    failClosedWithoutSsi(preview) {
        const excludedCandidates = preview.excludedRoutes.map((candidate) => ({
            ssiId: candidate.ssiId,
            ssiCode: candidate.route["ssiCode"] ?? "",
            reason: this.exclusionReason(candidate.evidence),
            evidence: candidate.evidence,
        }));
        throw new common_1.HttpException({
            mx: {
                httpStatus: 422,
                code: "SSI_NOT_FOUND",
                redirectDomain: null,
                payloadGenerated: false,
                detail: preview.explanation,
                excludedCandidates,
            },
            mt: {
                validation: "FAIL",
                code: "SSI_NOT_FOUND",
                payloadGenerated: false,
            },
        }, 422);
    }
    rankedRouteSnapshot(candidate, evidence, selectionStatus) {
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
    matchingNostroEvidence(candidate, evidence) {
        return evidence?.find((item) => item["ssiId"] === candidate.ssiId);
    }
    topRankTieCandidate(candidate, preview) {
        return {
            ...this.rankedRouteSnapshot(candidate, this.matchingNostroEvidence(candidate, preview.alternativeNostroEvidence), "TOP_RANK_TIE"),
            ambiguityReason: "TIED_ON_CONTROLLED_RANK_KEYS",
            tiedOn: route_resolution_policy_1.CONTROLLED_RANK_KEYS,
            tieMember: true,
        };
    }
    lowerRankCandidate(candidate, preview) {
        return {
            ...this.rankedRouteSnapshot(candidate, this.matchingNostroEvidence(candidate, preview.lowerRankedNostroEvidence), "LOWER_BUSINESS_RANK"),
            reason: "LOWER_BUSINESS_RANK",
            tieMember: false,
        };
    }
    ambiguityCandidates(preview) {
        const tied = preview.alternatives.map((candidate) => this.topRankTieCandidate(candidate, preview));
        const lowerRanked = (preview.lowerRankedEligibleCandidates ?? []).map((candidate) => this.lowerRankCandidate(candidate, preview));
        return [...tied, ...lowerRanked];
    }
    ambiguousResponse(preview) {
        const snapshotIdentity = this.snapshotIdentity.current();
        const candidates = this.ambiguityCandidates(preview);
        const repairQueue = {
            required: true,
            reasonCode: "TOP_RANK_TIE",
            makerCheckerRequired: true,
        };
        const contract = {
            chosenRoute: null,
            canonicalRoles: null,
            roleProvenance: null,
            messageComposerContext: null,
            candidates,
            rankingRuleId: route_resolution_policy_1.CONTROLLED_RANK_RULE_ID,
            ambiguityReason: "TIED_ON_CONTROLLED_RANK_KEYS",
            tiedOn: route_resolution_policy_1.CONTROLLED_RANK_KEYS,
            snapshotHash: snapshotIdentity.sha256,
            snapshotIdentityMethod: snapshotIdentity.method,
            resolutionToken: preview.attemptId,
            payloadGenerated: false,
            repairQueue,
        };
        return {
            resolutionDecision: "SSI_AMBIGUOUS",
            ...contract,
            mx: {
                httpStatus: 422,
                decision: "SSI_AMBIGUOUS",
                code: "SSI_AMBIGUOUS",
                redirectDomain: null,
                ...contract,
            },
            mt: {
                validation: "FAIL",
                code: "SSI_AMBIGUOUS",
                payloadGenerated: false,
            },
        };
    }
    failClosedAmbiguous(preview) {
        throw new common_1.HttpException(this.ambiguousResponse(preview), 422);
    }
    failClosedIncorrectSsi(body, dataIssues) {
        const statusPolicy = (0, ssi_data_quality_service_1.incorrectSsiConfigurationStatusPolicy)();
        const { httpStatus } = statusPolicy;
        const snapshotIdentity = this.snapshotIdentity.current();
        const correlationId = String(body["correlationId"] ??
            body.transactionReference ??
            "");
        const contract = {
            httpStatus,
            decision: "REJECTED",
            code: ssi_data_quality_service_1.INCORRECT_SSI_CONFIGURATION,
            errorCategory: "SSI_DATA_QUALITY",
            runtimeEnvironment: statusPolicy.runtimeEnvironment,
            statusPolicyVersion: statusPolicy.statusPolicyVersion,
            detail: "SSI master contains a specialist route with generic interbank-transfer applicability.",
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
            remediationSteps: [
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
        throw new common_1.HttpException({
            resolutionDecision: "REJECTED",
            ...contract,
            mx: contract,
            mt: {
                validation: "FAIL",
                code: ssi_data_quality_service_1.INCORRECT_SSI_CONFIGURATION,
                payloadGenerated: false,
            },
        }, httpStatus);
    }
    exclusionReason(evidence) {
        const failure = evidence.find((item) => item["outcome"] === "FAIL");
        if (failure?.["criterion"] === "MESSAGE_TYPE")
            return "PROFILE_VERSION_MISMATCH";
        return String(failure?.["reasonCode"] ?? "NOT_ELIGIBLE");
    }
    creditorFromContext(request, raw) {
        const previous = raw["previousMessage"] && typeof raw["previousMessage"] === "object"
            ? raw["previousMessage"]
            : undefined;
        if (request.sourceMessageType?.startsWith("MT205")) {
            const upstream = String(previous?.["A.58A"] ?? previous?.["58A"] ?? raw["A.58A"] ?? "");
            if (upstream)
                return { bic: upstream, source: "UPSTREAM_MESSAGE_CONTEXT" };
        }
        return {
            bic: String(raw["paymentBeneficiaryInstitutionInput"] ??
                request.counterpartyBic ??
                ""),
            source: "REQUEST_PASS_THROUGH",
        };
    }
    bindSsiRole(roles, provenance, chosen, role, value, sourceField) {
        if (!value)
            return;
        roles[role] = value;
        provenance[role] = {
            value,
            source: "COUNTERPARTY_SSI",
            ssiCode: chosen.route["ssiCode"] ?? "",
            ssiVersion: chosen.ssiVersion,
            sourceField,
        };
    }
    bindSsiRoles(roles, provenance, chosen, raw, actualReceiver, accountWith) {
        roles["selectedSsi"] = chosen.route["ssiCode"] ?? "";
        this.bindSsiRole(roles, provenance, chosen, "instructedAgent", actualReceiver, "actualReceiverBic");
        if (Object.prototype.hasOwnProperty.call(roles, "accountWithInstitution"))
            this.bindSsiRole(roles, provenance, chosen, "accountWithInstitution", accountWith, "accountWithBic");
        const creditorAgentComesFromSsi = raw["skipCounterpartySsiResolution"] !== true &&
            raw["receiverIsAwi"] !== true &&
            raw["57A"] === undefined &&
            raw["A.57A"] === undefined;
        if (creditorAgentComesFromSsi)
            this.bindSsiRole(roles, provenance, chosen, "creditorAgent", accountWith, "accountWithBic");
    }
    chosenRouteSnapshot(chosen, nostroEvidence) {
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
            routePurpose: chosen.route["routePurpose"] ?? "",
            selectedBy: chosen.route["routePurpose"] === "INTERBANK_TRANSFER"
                ? "EXACT_BUSINESS_PURPOSE_MATCH"
                : "CONTROLLED_RANK_KEYS",
            specificity: chosen.fallbackTier === 0 ? "NAMED_COUNTERPARTY" : "FALLBACK",
        };
    }
    resolvedAlternatives(preview) {
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
    settlementAccountContext(canonicalSettlement, nostroEvidence) {
        if (!canonicalSettlement["settlementAccountReference"])
            return {};
        return {
            SttlmAcct: {
                value: canonicalSettlement["settlementAccountReference"],
                source: "OWN_SSI_NOSTRO",
                nostroId: nostroEvidence["nostroId"],
                nostroVersion: nostroEvidence["nostroVersion"],
            },
        };
    }
    mt202OmissionDecision(sourceMessageType, tags, omitted, receiverIsAccountWith) {
        const cover = sourceMessageType?.endsWith("COV") === true;
        const fieldOmitted = sourceMessageType?.startsWith("MT202") === true &&
            !tags[cover ? "A.57A" : "57A"] &&
            omitted.has(cover ? "A.57a" : "57a");
        return fieldOmitted && receiverIsAccountWith
            ? {
                outcome: "OMITTED_BY_RULE",
                rule: "MRG_MT202_57A_RECEIVER_IS_AWI",
            }
            : { outcome: "INCLUDE" };
    }
    applyCreditorContext(roles, creditor) {
        if (creditor.bic && !roles["creditor"])
            roles["creditor"] = creditor.bic;
        if (creditor.bic && !roles["creditorSource"])
            roles["creditorSource"] = creditor.source;
        return {
            value: String(roles["creditor"] ?? creditor.bic),
            source: String(roles["creditorSource"] ?? creditor.source),
        };
    }
    routeBankPair(route) {
        const actualReceiver = String(route["actualReceiverBic"] ??
            route["accountWithBic"] ??
            route["bic"] ??
            "");
        return {
            actualReceiver,
            accountWith: String(route["accountWithBic"] ?? actualReceiver),
        };
    }
    omitMt202AccountWithWhenReceiverMatches(tags, omitted, sourceMessageType, actualReceiver, accountWith) {
        if (sourceMessageType?.startsWith("MT202") !== true)
            return;
        if (!actualReceiver || actualReceiver !== accountWith)
            return;
        const cover = (sourceMessageType ?? "").endsWith("COV");
        delete tags[cover ? "A.57A" : "57A"];
        omitted.add(cover ? "A.57a" : "57a");
    }
    governedMt2Contract(rendered, preview, request, raw) {
        const chosen = preview.recommendedRoute;
        const route = chosen.route;
        const { actualReceiver, accountWith } = this.routeBankPair(route);
        const creditor = this.creditorFromContext(request, raw);
        const mx = (rendered["mx"] ?? {});
        const mt = (rendered["mt"] ?? {});
        const roles = (mx["canonicalRoles"] ?? {});
        const canonicalSettlement = (preview.canonicalSettlementPreview ??
            {});
        const nostroEvidence = (preview.nostroEvidence ?? {});
        const roleProvenance = {};
        this.bindSsiRoles(roles, roleProvenance, chosen, raw, actualReceiver, accountWith);
        const tags = { ...(mt["tags"] ?? {}) };
        const renderedCreditor = this.applyCreditorContext(roles, creditor);
        const omitted = new Set(Array.isArray(mt["omitted"]) ? mt["omitted"] : []);
        this.omitMt202AccountWithWhenReceiverMatches(tags, omitted, request.sourceMessageType, actualReceiver, accountWith);
        const excludedCandidates = preview.excludedRoutes.map((candidate) => ({
            ssiId: candidate.ssiId,
            ssiCode: candidate.route["ssiCode"] ?? "",
            reason: this.exclusionReason(candidate.evidence),
            evidence: candidate.evidence,
        }));
        const chosenRoute = this.chosenRouteSnapshot(chosen, nostroEvidence);
        const alternatives = this.resolvedAlternatives(preview);
        const snapshotIdentity = this.snapshotIdentity.current();
        return {
            ...rendered,
            mx: {
                ...mx,
                decision: preview.decision,
                code: "SSI_RESOLVED",
                chosenRoute,
                alternatives,
                roleProvenance,
                canonicalRoles: roles,
                messageComposerContext: {
                    SttlmMtd: { value: "INDA", source: "SETTLEMENT_POLICY" },
                    Dbtr: {
                        value: route["senderBic"] ?? "DEMOHKHH",
                        source: "OWN_ENTITY",
                    },
                    ...this.settlementAccountContext(canonicalSettlement, nostroEvidence),
                    Cdtr: {
                        value: renderedCreditor.value,
                        source: renderedCreditor.source,
                    },
                },
            },
            mt: { ...mt, tags, omitted: [...omitted] },
            chosenRoute,
            resolutionDecision: preview.decision,
            code: "SSI_RESOLVED",
            alternatives,
            excludedCandidates,
            fieldProvenance: preview.canonicalSettlementPreview?.["fieldProvenance"] ?? {},
            roleProvenance,
            snapshotHash: snapshotIdentity.sha256,
            snapshotIdentityMethod: snapshotIdentity.method,
            resolutionToken: preview.attemptId,
            correlationId: String(raw["correlationId"] ?? ""),
            evidenceGates: chosen.evidence,
            renderingDecisions: {
                "MT202.57a": this.mt202OmissionDecision(request.sourceMessageType, tags, omitted, Boolean(actualReceiver) && actualReceiver === accountWith),
                "pacs.009.CdtrAgt": {
                    outcome: accountWith ? "INCLUDE" : "OMIT",
                    reason: "OPTIONAL_ROLE_RETAINED_NO_EQUIVALENT_OMISSION_RULE",
                },
            },
        };
    }
    inferredFailure(status, code, redirectDomain, mt, detail = "") {
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
    sourceDomainEnvelope(source, body) {
        if (source === "MT204")
            return body["messageType"] === "pacs.010.001.03"
                ? this.inferredFailure(400, "MESSAGE_TYPE_NOT_SUPPORTED", "FI_DIRECT_DEBIT", {
                    httpStatus: 400,
                    code: "MESSAGE_TYPE_NOT_SUPPORTED",
                    redirectDomain: "FI_DIRECT_DEBIT",
                    payloadGenerated: false,
                    detail: "",
                })
                : this.inferredFailure(400, "PAYMENT_SOURCE_TARGET_MISMATCH", "FI_DIRECT_DEBIT", {
                    validation: "FAIL",
                    requiredTarget: "pacs.010.001.03",
                });
        if (source === "MT210")
            return this.inferredFailure(400, "MESSAGE_TYPE_NOT_SUPPORTED", "NOTIFICATION", {
                httpStatus: 400,
                code: "MESSAGE_TYPE_NOT_SUPPORTED",
                redirectDomain: "NOTIFICATION",
                payloadGenerated: false,
                detail: "",
            });
        return undefined;
    }
    ownAccountDomainEnvelope(body) {
        if (body["requestedUse"])
            return this.inferredFailure(400, "MESSAGE_TYPE_NOT_SUPPORTED", "OWN_SSI_NOSTRO", {
                validation: "FAIL",
                reason: "Use MT202/MT203, not MT200",
            }, "Scenario must be routed to MT202 profile");
        return undefined;
    }
    directDebitDomainEnvelope(body) {
        if (!Array.isArray(body["legs"]) &&
            body["legCount"] === undefined &&
            (body["19"] ||
                Array.isArray(body["sequenceB"]) ||
                body["sequenceBCount"] ||
                body["B.53A.source"])) {
            const validation = { validation: "FAIL" };
            if (body["19"]) {
                validation["error"] = "C01";
            }
            else if (Array.isArray(body["sequenceB"])) {
                validation["error"] = "C02";
            }
            else if (body["sequenceBCount"]) {
                validation["error"] = "T10";
            }
            else {
                validation["assertions"] = [
                    "B.53a=mandate Debit Institution",
                    "A.58a=Sender identity",
                ];
            }
            return this.inferredFailure(422, "OPTION_CONSTRAINT_VIOLATION", "FI_DIRECT_DEBIT", validation);
        }
        return undefined;
    }
    notificationDomainEnvelope(body) {
        if (this.hasNotificationDomainSignal(body))
            return this.inferredFailure(422, body["currency"] === "XAU"
                ? "CURRENCY_NOT_SUPPORTED"
                : "OPTION_CONSTRAINT_VIOLATION", "NOTIFICATION", this.notificationValidation(body));
        return undefined;
    }
    hasNotificationDomainSignal(body) {
        return Boolean(body["50F"] ||
            body["50a"] === null ||
            body["occurrenceCount"] ||
            Array.isArray(body["occurrences"]) ||
            body["currency"] === "XAU" ||
            body["25.source"]);
    }
    notificationValidation(body) {
        if (body["50F"] || body["50a"] === null)
            return { validation: "FAIL", error: "C06" };
        if (body["occurrenceCount"])
            return { validation: "FAIL", error: "T10" };
        if (Array.isArray(body["occurrences"]))
            return { validation: "FAIL", error: "C02" };
        if (body["currency"] === "XAU")
            return { validation: "FAIL", error: "C08" };
        return {
            validation: "FAIL",
            requiredSources: ["ACCOUNT_MASTER", "NOTIFICATION_CONTEXT"],
        };
    }
    parserOutcome(body, redirectDomain) {
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
            if (outcome)
                return outcome;
        }
        return { parserConformance: "PASS", execution: "REJECTED", redirectDomain };
    }
    stringLegParserOutcome(body) {
        const legs = body["legs"];
        if (Array.isArray(legs) && legs.every((leg) => typeof leg === "string")) {
            const currencies = new Set(legs.map((leg) => String(leg).slice(0, 3)));
            return currencies.size > 1
                ? { parserConformance: "FAIL", error: "C02" }
                : { parserConformance: "FAIL", error: "C01" };
        }
        return undefined;
    }
    legCountParserOutcome(body) {
        const legCount = body["legCount"];
        if (legCount === 1)
            return { parserConformance: "FAIL", error: "T11" };
        if (legCount === 11)
            return { parserConformance: "FAIL", error: "T10" };
        if (Array.isArray(legCount))
            return legCount[0] === 2 && legCount[1] === 10
                ? { parserConformance: "PASS", execution: "REJECTED" }
                : { parserConformance: "FAIL", errors: ["T11", "T10"] };
        return undefined;
    }
    leg2ParserOutcome(body) {
        const leg2 = body["leg2"];
        if (leg2 && leg2["57A"] === null)
            return {
                parserConformance: "FAIL",
                error: "C81",
                wholeMessageFailClosed: true,
            };
        if (leg2 && leg2["58A"] === null)
            return { parserConformance: "FAIL", missing: ["leg[2].58a"] };
        return undefined;
    }
    missingLegAgentParserOutcome(body) {
        const legs = body["legs"];
        if (Array.isArray(legs) &&
            !legs.some((leg) => typeof leg === "object" &&
                leg !== null &&
                leg["58A"]) &&
            legs.some((leg) => typeof leg === "object" &&
                leg !== null &&
                !leg["57A"]))
            return { parserConformance: "FAIL", missing: ["leg[2].57a"] };
        return undefined;
    }
    ownAccountLegParserOutcome(body) {
        const leg1 = body["leg1"];
        if (leg1?.["57A"] || leg1?.["53B"])
            return {
                parserConformance: "PASS",
                execution: "REJECTED",
                expectedMTLeg: Object.fromEntries(Object.entries(leg1).filter(([key]) => ["53B", "57A", "58A"].includes(key))),
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
    beneficiaryLegParserOutcome(body) {
        const legs = body["legs"];
        if (Array.isArray(legs) &&
            legs.some((leg) => typeof leg === "object" &&
                leg !== null &&
                leg["beneficiarySource"]))
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
    isGovernedHttpException(error) {
        return (error instanceof common_1.HttpException &&
            typeof error.getResponse() === "object" &&
            "mx" in error.getResponse());
    }
    resolve(body) {
        try {
            const ownAccount = this.ownAccountScenario(body);
            if (ownAccount)
                return ownAccount;
            const precondition = this.counterpartySsi.precondition(body);
            if (precondition) {
                const mx = precondition["mx"];
                throw new common_1.HttpException(precondition, Number(mx["httpStatus"]));
            }
            const request = (0, mt2_settlement_request_policy_1.toMt2BankResolutionRequest)(body, this.paymentMessageIndex);
            const dataIssues = this.dataQuality.issuesFor(request);
            if (dataIssues.length)
                this.failClosedIncorrectSsi(body, dataIssues);
            if (this.counterpartySsi.supports(request.sourceMessageType ?? "")) {
                const result = this.counterpartySsi.resolve(request, body);
                const status = result["mx"];
                if (typeof status?.["httpStatus"] === "number" &&
                    status["httpStatus"] >= 400)
                    throw new common_1.HttpException(result, status["httpStatus"]);
                const preview = this.service.resolve(request);
                if (preview.decision === "SSI_AMBIGUOUS")
                    this.failClosedAmbiguous(preview);
                if (!preview.recommendedRoute)
                    this.failClosedWithoutSsi(preview);
                return this.governedMt2Contract(result, preview, request, body);
            }
            return this.service.resolve(request);
        }
        catch (error) {
            if (this.isGovernedHttpException(error))
                throw error;
            return this.unsupportedMt2(body, error);
        }
    }
    resolveBatch(body) {
        return this.batchResolution.resolve(body);
    }
    clearingOptions(body) {
        return this.service.clearingOptions((0, mt2_settlement_request_policy_1.toMt2BankResolutionRequest)(body, this.paymentMessageIndex));
    }
    confirm(resolutionId, body) {
        return this.service.confirm({ ...body, attemptId: resolutionId });
    }
};
exports.SettlementController = SettlementController;
tslib_1.__decorate([
    (0, common_1.Get)("data-quality"),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", Object)
], SettlementController.prototype, "dataQualityStatus", null);
tslib_1.__decorate([
    (0, common_1.Get)("message-index"),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", Object)
], SettlementController.prototype, "messageIndex", null);
tslib_1.__decorate([
    (0, common_1.Post)("resolve"),
    (0, common_1.HttpCode)(200),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], SettlementController.prototype, "resolve", null);
tslib_1.__decorate([
    (0, common_1.Post)("resolve-batch"),
    (0, common_1.HttpCode)(200),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], SettlementController.prototype, "resolveBatch", null);
tslib_1.__decorate([
    (0, common_1.Post)("clearing-options"),
    (0, common_1.HttpCode)(200),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], SettlementController.prototype, "clearingOptions", null);
tslib_1.__decorate([
    (0, common_1.Post)(":resolutionId/confirm"),
    tslib_1.__param(0, (0, common_1.Param)("resolutionId")),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", Object)
], SettlementController.prototype, "confirm", null);
exports.SettlementController = SettlementController = tslib_1.__decorate([
    (0, common_1.Controller)("settlements"),
    tslib_1.__metadata("design:paramtypes", [ssi_application_service_1.SsiApplicationService,
        batch_resolution_service_1.BatchResolutionService,
        payment_message_index_service_1.PaymentMessageIndexService,
        counterparty_ssi_resolution_service_1.CounterpartySsiResolutionService,
        message_domain_resolution_service_1.MessageDomainResolutionService,
        database_snapshot_identity_service_1.DatabaseSnapshotIdentityService,
        ssi_data_quality_service_1.SsiDataQualityService])
], SettlementController);
//# sourceMappingURL=settlement.controller.js.map