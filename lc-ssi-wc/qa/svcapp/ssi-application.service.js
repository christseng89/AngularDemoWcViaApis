"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SsiApplicationService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const sqlite_ssi_repository_1 = require("./sqlite-ssi.repository");
const route_resolution_policy_1 = require("./route-resolution.policy");
const rma_application_service_1 = require("./rma/rma-application.service");
const nostro_application_service_1 = require("./nostro/nostro-application.service");
const clearing_systems_reference_1 = require("./clearing-systems.reference");
const canonical_json_1 = require("./canonical-json");
const value_date_1 = require("./value-date");
const payment_settlement_profile_1 = require("./payment-settlement-profile");
const payment_message_index_service_1 = require("./payment-message-index.service");
const BIC_PATTERN = /^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const PAYMENT_TRIGGER_LEGS = new Set([
    "BANK_REIMBURSEMENT",
    "PROCEEDS_SETTLEMENT",
    "COLLECTION_SETTLEMENT",
    "CLAIM_PAYMENT",
    "INTERBANK_SETTLEMENT",
    "CUSTOMER_TRANSFER",
]);
const COV_BUSINESS_SERVICE = "swift.cbprplus.cov.04";
const routeList = (route, field) => String(route[field] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
function settlementParties(request, selected, nostroEvidence) {
    const counterpartyType = (request.counterpartyType ??
        "BANK");
    const actualReceiverBic = selected.route["actualReceiverBic"] ??
        selected.route["accountWithBic"] ??
        selected.route["bic"] ??
        "";
    const accountWithBic = selected.route["accountWithBic"] || actualReceiverBic;
    const beneficiaryInstitutionBic = counterpartyType === "BANK"
        ? selected.route["beneficiaryBic"] ||
            request.counterpartyBic ||
            actualReceiverBic
        : "";
    const directBankRoute = counterpartyType === "BANK" &&
        selected.route["routeType"] === "DIRECT" &&
        (nostroEvidence?.accountServicerBic ?? accountWithBic) ===
            actualReceiverBic &&
        beneficiaryInstitutionBic === actualReceiverBic;
    return {
        counterpartyType,
        actualReceiverBic,
        accountWithBic,
        beneficiaryInstitutionBic,
        creditorAgentBic: directBankRoute ? "" : accountWithBic,
        deliveryAgentBic: directBankRoute
            ? ""
            : (nostroEvidence?.accountServicerBic ?? ""),
    };
}
function settlementFieldProvenance(request, selected, nostroEvidence, parties, finMessageType) {
    const mtSequencePrefix = finMessageType.endsWith("COV") ? "A." : "";
    const beneficiaryInstitutionTagSupported = ![
        "MT103",
        "MT200",
        "MT201",
    ].includes(finMessageType);
    const provenance = {};
    if (parties.deliveryAgentBic) {
        provenance[`${mtSequencePrefix}53A`] = {
            source: nostroEvidence ? "OWN_NOSTRO" : "SSI_ROUTE_PREVIEW",
            evidenceId: nostroEvidence?.nostroId ?? selected.ssiId,
        };
    }
    if (parties.creditorAgentBic) {
        provenance[`${mtSequencePrefix}57A`] = {
            source: parties.counterpartyType === "CUSTOMER"
                ? "CUSTOMER_SSI"
                : "COUNTERPARTY_SSI",
            evidenceId: selected.ssiId,
        };
    }
    if (parties.counterpartyType === "CUSTOMER") {
        provenance["59"] = {
            source: "TRANSACTION_INPUT",
            evidenceId: request.beneficiaryCustomer?.customerId ?? "",
        };
    }
    else if (beneficiaryInstitutionTagSupported) {
        provenance[`${mtSequencePrefix}58A`] = {
            source: "TRANSACTION_CONTEXT",
            evidenceId: request.counterpartyBic ?? "",
        };
    }
    return provenance;
}
function canonicalSettlementFor(request, selected, nostroEvidence) {
    const parties = settlementParties(request, selected, nostroEvidence);
    const finMessageType = (0, payment_settlement_profile_1.paymentFinMessageType)(parties.counterpartyType, request.sourceMessageType);
    return {
        finMessageType,
        instructingAgentBic: selected.route["senderBic"] ?? "DEMOHKHH",
        instructedAgentBic: parties.actualReceiverBic,
        deliveryAgentBic: parties.deliveryAgentBic,
        intermediaryAgentBics: [selected.route["intermediaryBic"]].filter((value) => Boolean(value)),
        creditorAgentBic: parties.creditorAgentBic,
        beneficiaryInstitutionBic: parties.beneficiaryInstitutionBic,
        ...(parties.counterpartyType === "CUSTOMER"
            ? { beneficiaryCustomer: request.beneficiaryCustomer }
            : {}),
        reimbursementAgentBics: [parties.deliveryAgentBic].filter((value) => Boolean(value)),
        settlementAccountReference: nostroEvidence?.maskedAccountRef ?? selected.route["accountId"] ?? "",
        settlementCountry: selected.route["settlementCountry"] ?? "",
        settlementMarket: selected.route["settlementMarket"] ?? "",
        clearingSystem: selected.route["clearingSystem"] ?? "",
        schemeType: selected.route["schemeType"] ?? "",
        fieldProvenance: settlementFieldProvenance(request, selected, nostroEvidence, parties, finMessageType),
    };
}
function validateRouteIdentity(route) {
    if (!CURRENCY_PATTERN.test(route["currency"] ?? ""))
        throw new common_1.BadRequestException("INVALID_ISO_4217_CURRENCY");
    if (!["PRIMARY", "SECONDARY", "FALLBACK"].includes(route["routePreference"] ?? "") ||
        !/^\d+$/.test(route["priority"] ?? ""))
        throw new common_1.BadRequestException("INVALID_ROUTE_CLASS_OR_PRIORITY");
}
function validateRouteEffectiveDates(route) {
    if (!route["validFrom"] ||
        !route["validTo"] ||
        Number.isNaN(Date.parse(route["validFrom"])) ||
        Number.isNaN(Date.parse(route["validTo"])) ||
        Date.parse(route["validFrom"]) > Date.parse(route["validTo"]))
        throw new common_1.BadRequestException("INVALID_SSI_EFFECTIVE_DATES");
}
function requireClearingSystem(route) {
    if (!route["settlementMarket"]?.trim())
        throw new common_1.BadRequestException("SETTLEMENT_MARKET_REQUIRED");
    const clearingSystem = clearing_systems_reference_1.CLEARING_SYSTEMS.find((system) => system.code === route["clearingSystem"]);
    if (!route["clearingSystem"]?.trim() ||
        route["clearingSystem"] === "ANY" ||
        !clearingSystem)
        throw new common_1.BadRequestException("ACTIVE_CLEARING_SYSTEM_REQUIRED");
    return clearingSystem;
}
function validateClearingScope(route, clearingSystem) {
    if (clearingSystem.supportedCurrency !== route["currency"])
        throw new common_1.BadRequestException("CLEARING_SYSTEM_CURRENCY_MISMATCH");
    if (!route["settlementCountry"]?.trim())
        throw new common_1.BadRequestException("SETTLEMENT_COUNTRY_REQUIRED");
    if ((route["settlementCountry"] === "ANY" &&
        clearingSystem.marketScope !== "PAN_REGIONAL") ||
        (route["settlementCountry"] !== "ANY" &&
            clearingSystem.settlementCountry !== route["settlementCountry"] &&
            !clearingSystem.eligibleCountries.includes(route["settlementCountry"])))
        throw new common_1.BadRequestException("CLEARING_SYSTEM_COUNTRY_SCOPE_MISMATCH");
    if (clearingSystem.status !== "ACTIVE" ||
        Date.parse(clearingSystem.validFrom) > Date.parse(route["validTo"]) ||
        Date.parse(clearingSystem.validTo) < Date.parse(route["validFrom"]))
        throw new common_1.BadRequestException("CLEARING_SYSTEM_NOT_EFFECTIVE");
    if (route["schemeType"] && route["schemeType"] !== clearingSystem.schemeType)
        throw new common_1.BadRequestException("CLEARING_SCHEME_TYPE_MISMATCH");
}
function validateRouteBics(route) {
    for (const field of [
        "bic",
        "beneficiaryBic",
        "accountWithBic",
        "actualReceiverBic",
        "intermediaryBic",
    ]) {
        const value = route[field];
        if (value && !BIC_PATTERN.test(value))
            throw new common_1.BadRequestException(`INVALID_ISO_9362_BIC:${field}`);
    }
}
function validateCounterpartyIdentity(route) {
    const counterpartyType = route["counterpartyType"] ?? "BANK";
    const counterpartyBic = route["counterpartyBic"];
    if (counterpartyType === "BANK" &&
        counterpartyBic !== "ANY" &&
        (!counterpartyBic || !BIC_PATTERN.test(counterpartyBic)))
        throw new common_1.BadRequestException("BANK_COUNTERPARTY_BIC_REQUIRED");
    if (counterpartyType === "CUSTOMER" &&
        counterpartyBic &&
        !BIC_PATTERN.test(counterpartyBic))
        throw new common_1.BadRequestException("INVALID_CUSTOMER_SWIFT_BIC");
}
let SsiApplicationService = class SsiApplicationService {
    repository;
    rma;
    nostro;
    paymentMessageIndex;
    resolutionAttempts = new Map();
    constructor(repository, rma, nostro, paymentMessageIndex) {
        this.repository = repository;
        this.rma = rma;
        this.nostro = nostro;
        this.paymentMessageIndex = paymentMessageIndex;
    }
    list() {
        return this.repository.list().map((record) => ({
            ...this.withExplicitOwnership(record),
            applicability: this.repository.listApplicability(record.id),
        }));
    }
    listApplicability(ssiId) {
        return this.repository.listApplicability(ssiId);
    }
    replaceApplicability(ssiId, body) {
        this.requireRecord(ssiId);
        if (!body.actor || !Array.isArray(body.records) || !body.records.length)
            throw new common_1.BadRequestException("SSI_APPLICABILITY_REQUIRED");
        for (const row of body.records) {
            if ([
                "consumer",
                "product",
                "businessFunction",
                "paymentLeg",
                "direction",
                "validFrom",
                "validTo",
            ].some((field) => !String(row[field] ?? "").trim()))
                throw new common_1.BadRequestException("SSI_APPLICABILITY_FIELDS_REQUIRED");
            if (!["ACTIVE", "INACTIVE"].includes(row.status) ||
                Date.parse(row.validFrom) > Date.parse(row.validTo))
                throw new common_1.BadRequestException("INVALID_SSI_APPLICABILITY");
        }
        return this.repository.replaceApplicability(ssiId, body.records, body.actor);
    }
    validate(command) {
        this.validateCommand(command);
    }
    create(command) {
        this.validateCommand(command);
        const now = new Date().toISOString();
        const record = {
            id: (0, node_crypto_1.randomUUID)(),
            ...command,
            ...this.resolveOwnership(command),
            status: "DRAFT",
            version: 1,
            createdAt: now,
            updatedAt: now,
        };
        this.repository.save(record, "CREATED", command.maker);
        return record;
    }
    update(id, command) {
        const current = this.requireRecord(id);
        if (current.status !== "DRAFT")
            throw new common_1.ConflictException("Only DRAFT SSI can be updated; create a revision instead");
        if (command.maker !== current.maker)
            throw new common_1.ConflictException("Only the original maker can update");
        this.validateCommand(command);
        const next = {
            ...current,
            counterpartyId: command.counterpartyId,
            scope: command.scope,
            route: command.route,
            ...this.resolveOwnership(command),
            version: current.version + 1,
            updatedAt: new Date().toISOString(),
        };
        this.repository.save(next, "UPDATED", command.maker);
        return next;
    }
    revise(id, maker) {
        const current = this.requireRecord(id);
        if (!maker)
            throw new common_1.BadRequestException("MAKER_REQUIRED");
        if (current.status === "DRAFT")
            return current;
        if (["REVOKED", "SUPERSEDED"].includes(current.status))
            throw new common_1.ConflictException("Revoked or superseded SSI cannot be revised");
        const now = new Date().toISOString();
        const revision = {
            id: (0, node_crypto_1.randomUUID)(),
            counterpartyId: current.counterpartyId,
            scope: current.scope,
            maker,
            ...this.resolveOwnership(current),
            route: { ...current.route },
            status: "DRAFT",
            version: current.version + 1,
            amendmentOfId: current.id,
            createdAt: now,
            updatedAt: now,
        };
        this.repository.save(revision, "REVISION_CREATED", maker);
        return revision;
    }
    revoke(id, actor, reason) {
        const current = this.requireRecord(id);
        if (!actor)
            throw new common_1.BadRequestException("ACTOR_REQUIRED");
        if (!reason || reason.trim().length < 5)
            throw new common_1.BadRequestException("REVOCATION_REASON_REQUIRED");
        if (current.status === "REVOKED")
            throw new common_1.ConflictException("SSI already revoked");
        if (current.status !== "DRAFT" && actor === current.maker)
            throw new common_1.ConflictException("Maker cannot revoke an approved SSI");
        const next = {
            ...current,
            status: "REVOKED",
            revokeReason: reason.trim(),
            version: current.version + 1,
            updatedAt: new Date().toISOString(),
        };
        this.repository.save(next, "REVOKED", actor);
        return next;
    }
    transition(id, action, actor) {
        const current = this.requireRecord(id);
        const expected = {
            SUBMIT: "DRAFT",
            APPROVE: "PENDING_APPROVAL",
            ACTIVATE: "APPROVED",
        }[action];
        if (current.status !== expected)
            throw new common_1.ConflictException(`Expected ${expected}, found ${current.status}`);
        if (action === "SUBMIT" && actor !== current.maker)
            throw new common_1.ConflictException("Only the maker can submit");
        if (action === "APPROVE" && actor === current.maker)
            throw new common_1.ConflictException("Maker cannot approve their own SSI");
        if (action === "ACTIVATE" &&
            current.scope === "TRANSACTION_SPECIFIC" &&
            !current.route["transactionBindingReference"]?.trim())
            throw new common_1.ConflictException("TRANSACTION_BINDING_REQUIRED");
        if (action === "ACTIVATE" &&
            !this.repository
                .listApplicability(id)
                .some((row) => row.status === "ACTIVE"))
            throw new common_1.ConflictException("ACTIVE_SSI_APPLICABILITY_REQUIRED");
        if (action === "ACTIVATE")
            this.validateRoute(current.route);
        const status = {
            SUBMIT: "PENDING_APPROVAL",
            APPROVE: "APPROVED",
            ACTIVATE: "ACTIVE",
        }[action];
        if (action === "ACTIVATE")
            this.supersedePreviousActive(current, actor);
        const next = {
            ...current,
            status,
            version: current.version + 1,
            updatedAt: new Date().toISOString(),
            ...(action === "APPROVE" ? { checker: actor } : {}),
        };
        this.repository.save(next, action, actor);
        return next;
    }
    validateResolutionRequest(request) {
        const required = [
            request.consumer,
            request.product,
            request.counterpartyId || request.counterpartyBic,
            request.counterpartyCountry,
            request.businessFunction,
            request.paymentLeg,
            request.transactionReference,
            request.valueDate,
            request.amount,
            request.direction,
            request.bookingEntity,
            request.messageType,
        ];
        if (required.some((value) => !String(value ?? "").trim()))
            throw new common_1.BadRequestException("RESOLUTION_FIELDS_REQUIRED");
        if (!PAYMENT_TRIGGER_LEGS.has(request.paymentLeg))
            throw new common_1.BadRequestException("PAYMENT_TRIGGER_REQUIRED");
        if (request.direction !== "OUTBOUND")
            throw new common_1.BadRequestException("EXECUTABLE_SETTLEMENT_REQUIRES_OUTGOING_PAYMENT");
        if (!CURRENCY_PATTERN.test(request.currency ?? ""))
            throw new common_1.BadRequestException("INVALID_ISO_4217_CURRENCY");
        this.validateCentralPaymentProfile(request);
        (0, value_date_1.assertIsoValueDate)(request.valueDate);
    }
    resolveCandidateNostro(request, candidate) {
        if (candidate.route["currency"] !== request.currency)
            throw new common_1.ConflictException("RESOLUTION_SNAPSHOT_CURRENCY_MISMATCH");
        const evidence = this.nostro.resolve({
            ownLegalEntityId: request.bookingEntity,
            accountReference: candidate.route["accountId"] ?? "",
            accountServicerBic: candidate.route["accountWithBic"] ?? "",
            currency: request.currency,
            purpose: "SETTLEMENT",
            at: request.valueDate,
        });
        if (evidence.decision !== "RESOLVED")
            throw new common_1.ServiceUnavailableException("PROFILE_INCOMPLETE");
        return { ...evidence, ssiId: candidate.ssiId };
    }
    resolve(request) {
        this.validateResolutionRequest(request);
        this.requireCoverProfile(request);
        const preview = (0, route_resolution_policy_1.previewResolution)(request, this.repository.list(), this.repository.listApplicability());
        const attemptId = (0, node_crypto_1.randomUUID)();
        const requestHash = (0, canonical_json_1.hashCanonical)({
            canonicalSchemaVersion: "1",
            request,
        });
        this.resolutionAttempts.set(attemptId, { request, requestHash, preview });
        let canonicalSettlementPreview;
        let nostroEvidence;
        let alternativeNostroEvidence = [];
        let lowerRankedNostroEvidence = [];
        const resolveNostro = (candidate) => this.resolveCandidateNostro(request, candidate);
        if (preview.recommendedRoute) {
            const selected = preview.recommendedRoute;
            nostroEvidence = resolveNostro(selected);
            canonicalSettlementPreview = this.buildCanonicalSettlement(request, selected, nostroEvidence);
        }
        alternativeNostroEvidence = preview.alternatives.map(resolveNostro);
        lowerRankedNostroEvidence = (preview.lowerRankedEligibleCandidates ?? []).map(resolveNostro);
        return {
            useCase: "PAYMENT_SSI",
            usage: "EXECUTABLE_SETTLEMENT",
            paymentExecutable: false,
            preSettlement: true,
            attemptId,
            requestHash,
            ...preview,
            ...(nostroEvidence ? { nostroEvidence } : {}),
            ...(alternativeNostroEvidence.length
                ? { alternativeNostroEvidence }
                : {}),
            ...(lowerRankedNostroEvidence.length
                ? { lowerRankedNostroEvidence }
                : {}),
            ...(canonicalSettlementPreview ? { canonicalSettlementPreview } : {}),
        };
    }
    clearingOptions(request) {
        const required = [
            request.consumer,
            request.product,
            request.counterpartyId || request.counterpartyBic,
            request.counterpartyCountry,
            request.businessFunction,
            request.paymentLeg,
            request.currency,
            request.direction,
            request.bookingEntity,
            request.valueDate,
            request.amount,
            request.messageType,
        ];
        if (required.some((value) => !String(value ?? "").trim()))
            return { items: [], decision: "INCOMPLETE_CRITERIA" };
        (0, value_date_1.assertIsoValueDate)(request.valueDate);
        if (!PAYMENT_TRIGGER_LEGS.has(request.paymentLeg))
            return { items: [], decision: "PAYMENT_TRIGGER_REQUIRED" };
        this.requireCoverProfile(request);
        const unrestrictedRequest = { ...request };
        delete unrestrictedRequest.clearingSystem;
        const preview = (0, route_resolution_policy_1.previewResolution)(unrestrictedRequest, this.repository.list(), this.repository.listApplicability());
        const codes = new Set([preview.recommendedRoute, ...preview.alternatives]
            .filter((route) => route !== undefined)
            .map((route) => route.route["clearingSystem"]));
        return {
            items: clearing_systems_reference_1.CLEARING_SYSTEMS.filter((system) => codes.has(system.code)),
            decision: preview.decision,
            source: "ELIGIBLE_SSI_ROUTES_INTERSECT_CLEARING_STANDING_DATA",
        };
    }
    confirm(command) {
        const attempt = this.resolutionAttempts.get(command.attemptId);
        if (!attempt)
            throw new common_1.ConflictException("STALE_PREVIEW");
        if (!command.actor)
            throw new common_1.BadRequestException("ACTOR_REQUIRED");
        this.requireCoverProfile(attempt.request);
        const current = (0, route_resolution_policy_1.previewResolution)(attempt.request, this.repository.list(), this.repository.listApplicability());
        const routes = [current.recommendedRoute, ...current.alternatives].filter((route) => route !== undefined);
        const selected = routes.find((route) => route.ssiId === command.selectedSsiId);
        if (!selected)
            throw new common_1.ConflictException("SELECTED_ROUTE_NOT_ELIGIBLE");
        const isOverride = current.recommendedRoute?.ssiId !== selected.ssiId;
        if (isOverride && !command.overrideReason?.trim())
            throw new common_1.BadRequestException("OVERRIDE_REASON_REQUIRED");
        const actualReceiverBic = selected.route["actualReceiverBic"] ??
            selected.route["accountWithBic"] ??
            selected.route["bic"] ??
            "";
        const messagingService = attempt.request.messagingService ||
            selected.route["messagingService"] ||
            "";
        const rmaEvidence = this.rma.check({
            ownBic: selected.route["senderBic"] ?? "DEMOHKHH",
            counterpartyBic: actualReceiverBic,
            service: messagingService,
            direction: "OUTBOUND",
            messageType: attempt.request.messageType,
            at: attempt.request.valueDate,
        });
        if (rmaEvidence.authorised !== true)
            throw new common_1.ConflictException("RMA_NOT_AUTHORISED_FOR_ACTUAL_RECEIVER");
        const nostroEvidence = this.nostro.resolve({
            ownLegalEntityId: attempt.request.bookingEntity,
            accountReference: selected.route["accountId"] ?? "",
            accountServicerBic: selected.route["accountWithBic"] ?? "",
            currency: attempt.request.currency,
            purpose: "SETTLEMENT",
            at: attempt.request.valueDate,
        });
        if (nostroEvidence.decision === "ENTITY_NOT_AUTHORIZED")
            throw new common_1.ConflictException("ENTITY_NOT_AUTHORIZED");
        if (nostroEvidence.decision !== "RESOLVED")
            throw new common_1.ConflictException("NOSTRO_NOT_ELIGIBLE");
        const applicabilityEvidence = selected.evidence.filter(({ criterion }) => [
            "APPLICABILITY",
            "CONSUMER",
            "PRODUCT",
            "BUSINESS_FUNCTION",
            "PAYMENT_LEG",
            "DIRECTION",
            "COUNTERPARTY_SCOPE",
        ].includes(criterion));
        const effectivePeriod = {
            validFrom: selected.route["validFrom"],
            validTo: selected.route["validTo"],
            valueDate: attempt.request.valueDate,
        };
        const applicability = {
            ...selected.applicability,
            evidence: applicabilityEvidence,
        };
        const canonicalSettlement = this.buildCanonicalSettlement(attempt.request, selected, nostroEvidence);
        const snapshot = {
            canonicalSchemaVersion: "1",
            attemptId: command.attemptId,
            requestHash: attempt.requestHash,
            request: attempt.request,
            ssiId: selected.ssiId,
            ssiVersion: selected.ssiVersion,
            effectivePeriod,
            applicability,
            route: selected.route,
            actualReceiverBic,
            rmaEvidence,
            nostroEvidence,
            actor: command.actor,
            overrideReason: command.overrideReason?.trim() ?? null,
            confirmedAt: new Date().toISOString(),
            canonicalSettlement,
        };
        return {
            useCase: "PAYMENT_SSI",
            usage: "EXECUTABLE_SETTLEMENT",
            paymentExecutable: true,
            preSettlement: true,
            reconciliationSupported: false,
            decision: "CONFIRMED",
            ...snapshot,
            resolutionToken: (0, node_crypto_1.randomUUID)(),
            snapshotHash: (0, canonical_json_1.hashCanonical)(snapshot),
        };
    }
    buildCanonicalSettlement(request, selected, nostroEvidence) {
        return canonicalSettlementFor(request, selected, nostroEvidence);
    }
    validateCentralPaymentProfile(request) {
        if (request.consumer !== "CENTRAL_PAYMENT")
            return;
        const counterpartyType = (request.counterpartyType ??
            "BANK");
        const profile = (0, payment_settlement_profile_1.paymentSettlementProfile)(counterpartyType);
        if (request.product !== profile.product ||
            request.businessFunction !== profile.businessFunction ||
            request.paymentLeg !== profile.paymentLeg ||
            request.messageType !== profile.mxMessageType)
            throw new common_1.BadRequestException("COUNTERPARTY_PAYMENT_PROFILE_MISMATCH");
        if (counterpartyType === "BANK") {
            if (!request.sourceMessageType)
                throw new common_1.BadRequestException("PAYMENT_SOURCE_MESSAGE_TYPE_REQUIRED");
            const messageProfile = this.paymentMessageIndex.findSelectable(request.sourceMessageType);
            if (!messageProfile)
                throw new common_1.BadRequestException("MESSAGE_TYPE_NOT_SUPPORTED");
            if (messageProfile.targetMessage !== request.messageType)
                throw new common_1.BadRequestException("PAYMENT_SOURCE_TARGET_MISMATCH");
        }
        if (counterpartyType === "CUSTOMER" &&
            !this.completeBeneficiaryCustomer(request.beneficiaryCustomer))
            throw new common_1.BadRequestException("BENEFICIARY_CUSTOMER_REQUIRED");
    }
    requireCoverProfile(request) {
        const sourceMessageType = request.sourceMessageType;
        if (!sourceMessageType?.endsWith("COV"))
            return;
        const exactCounterparty = request.counterpartyBic || request.counterpartyId;
        const profileAvailable = request.businessService === COV_BUSINESS_SERVICE &&
            this.repository.list().some((candidate) => candidate.status === "ACTIVE" &&
                candidate.route["currency"] === request.currency &&
                candidate.route["bookingEntity"] === request.bookingEntity &&
                (candidate.route["counterpartyBic"] || candidate.counterpartyId) ===
                    exactCounterparty &&
                routeList(candidate.route, "messageTypes").includes(request.messageType) &&
                routeList(candidate.route, "businessService").includes(COV_BUSINESS_SERVICE) &&
                routeList(candidate.route, "sourceMessageTypes").includes(sourceMessageType));
        if (!profileAvailable)
            throw new common_1.ServiceUnavailableException("PROFILE_INCOMPLETE");
    }
    completeBeneficiaryCustomer(beneficiary) {
        return Boolean(beneficiary?.customerId.trim() &&
            beneficiary.name.trim() &&
            beneficiary.accountReference.trim());
    }
    audit() {
        return this.repository.audit();
    }
    requireRecord(id) {
        const current = this.repository.find(id);
        if (!current)
            throw new common_1.NotFoundException("SSI not found");
        return current;
    }
    validateCommand(command) {
        if (!command.counterpartyId ||
            !command.maker ||
            !["STANDING", "TRANSACTION_SPECIFIC"].includes(command.scope))
            throw new common_1.BadRequestException("SSI_REQUIRED_FIELDS_MISSING");
        if (command.ownershipType !== undefined &&
            (!["OWN", "COUNTERPARTY"].includes(command.ownershipType) ||
                !command.ownerParty?.trim() ||
                !command.publisherParty?.trim()))
            throw new common_1.BadRequestException("SSI_OWNERSHIP_FIELDS_REQUIRED");
        this.validateRoute(command.route);
    }
    resolveOwnership(command) {
        const ownershipType = command.ownershipType ??
            (command.route["counterpartyBic"] === "ANY" ? "OWN" : "COUNTERPARTY");
        const ownerParty = command.ownerParty?.trim() ||
            (ownershipType === "OWN"
                ? command.route["bookingEntity"] || "HK01"
                : command.route["counterpartyBic"] || command.counterpartyId);
        return {
            ownershipType,
            ownerParty,
            publisherParty: command.publisherParty?.trim() || ownerParty,
        };
    }
    withExplicitOwnership(record) {
        return { ...record, ...this.resolveOwnership(record) };
    }
    supersedePreviousActive(current, actor) {
        const logicalSsiCode = current.route["ssiCode"];
        for (const previous of this.repository
            .list()
            .filter((candidate) => candidate.id !== current.id &&
            candidate.status === "ACTIVE" &&
            (candidate.id === current.amendmentOfId ||
                (logicalSsiCode && candidate.route["ssiCode"] === logicalSsiCode)))) {
            this.repository.save({
                ...previous,
                status: "SUPERSEDED",
                version: previous.version + 1,
                updatedAt: new Date().toISOString(),
            }, "SUPERSEDED", actor);
        }
    }
    validateRoute(route) {
        validateRouteIdentity(route);
        validateRouteEffectiveDates(route);
        const clearingSystem = requireClearingSystem(route);
        validateClearingScope(route, clearingSystem);
        validateRouteBics(route);
        validateCounterpartyIdentity(route);
    }
};
exports.SsiApplicationService = SsiApplicationService;
exports.SsiApplicationService = SsiApplicationService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [sqlite_ssi_repository_1.SqliteSsiRepository,
        rma_application_service_1.RmaApplicationService,
        nostro_application_service_1.NostroApplicationService,
        payment_message_index_service_1.PaymentMessageIndexService])
], SsiApplicationService);
//# sourceMappingURL=ssi-application.service.js.map