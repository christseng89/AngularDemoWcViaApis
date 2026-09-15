"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinFieldResolutionService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const mapping_catalogue_service_1 = require("./mapping-catalogue.service");
const value_date_1 = require("./value-date");
const fin_field_resolution_policy_1 = require("./fin-field-resolution.policy");
let FinFieldResolutionService = class FinFieldResolutionService {
    catalogues;
    policy;
    constructor(catalogues, policy) {
        this.catalogues = catalogues;
        this.policy = policy;
    }
    catalogueIndex(standardsRelease) {
        const catalogue = this.catalogues.get(standardsRelease);
        const grouped = new Map();
        for (const mapping of catalogue.mappings) {
            if (mapping.direction !== "OUTGOING" ||
                mapping.evidenceStatus !== "FIELD_PROFILE_PROVEN" ||
                !/^MT[347]/.test(mapping.messageType) ||
                !this.isFin5x(mapping))
                continue;
            const item = grouped.get(mapping.messageType) ?? {
                profileSlots: new Set(),
                ssiResolvableTags: new Set(),
            };
            const tagOption = `${mapping.tag ?? this.tagOf(mapping)}${mapping.option ?? ""}`;
            item.profileSlots.add(tagOption);
            if (mapping.scopeStatus === "SSI_SUPPORTED" && mapping.reusableCandidate)
                item.ssiResolvableTags.add(tagOption);
            grouped.set(mapping.messageType, item);
        }
        const items = [...grouped.entries()]
            .filter(([, item]) => item.ssiResolvableTags.size > 0)
            .map(([messageType, item]) => ({
            messageType,
            resolutionMode: messageType.startsWith("MT3")
                ? "TREASURY"
                : "TRADE_FINANCE",
            profileSlots: [...item.profileSlots].sort(),
            ssiResolvableTags: [...item.ssiResolvableTags].sort(),
        }))
            .sort((left, right) => left.messageType.localeCompare(right.messageType));
        return {
            standardsRelease,
            catalogueVersion: catalogue.catalogueVersion,
            sourceArtifactId: catalogue.sourceArtifactId,
            sourceArtifactHash: catalogue.sourceArtifactHash,
            items,
        };
    }
    resolve(request) {
        this.validateContext(request);
        const catalogue = this.catalogues.get(request.standardsRelease);
        if (!this.isSsiResolutionSupported(catalogue.mappings, request.messageType))
            throw new common_1.BadRequestException({
                code: "NOT_SUPPORTED",
                messageType: request.messageType,
            });
        const messageProfile = catalogue.mappings.filter((mapping) => mapping.standardsRelease === request.standardsRelease &&
            mapping.messageType === request.messageType &&
            mapping.direction === request.direction &&
            mapping.businessFunction === request.businessFunction &&
            mapping.evidenceStatus === "FIELD_PROFILE_PROVEN" &&
            this.isFin5x(mapping));
        let profile = messageProfile;
        if (request.sequence)
            profile = profile.filter((mapping) => mapping.sequence === request.sequence);
        if (request.settlementLeg)
            profile = profile.filter((mapping) => mapping.settlementLeg === request.settlementLeg);
        const legs = new Set(profile.map((mapping) => `${mapping.sequence}|${mapping.settlementLeg}`));
        if (!request.sequence && !request.settlementLeg && legs.size > 1)
            throw new common_1.BadRequestException({
                code: "EXACT_FIN_PROFILE_CONTEXT_REQUIRED",
                availableProfiles: [...legs],
            });
        if (!profile.length)
            throw new common_1.BadRequestException({ code: "NO_EXACT_FIN_FIELD_PROFILE" });
        const selected = profile.filter((mapping) => mapping.option ===
            (request.fieldOptions?.[mapping.tag ?? this.tagOf(mapping)] ?? "A"));
        if (!selected.length)
            throw new common_1.BadRequestException({
                code: "NO_EXACT_FIN_FIELD_OPTION_PROFILE",
            });
        const resolvedFields = this.policy
            .normalizeCanonicalRoute(request, selected, selected.map((mapping) => this.resolveField(request, mapping, catalogue)))
            .concat(this.policy.profileExcludedFields(request, messageProfile, selected, catalogue))
            .sort((left, right) => Number(left.tag) - Number(right.tag));
        return {
            useCase: request.resolutionMode === "TREASURY"
                ? "TREASURY_SSI_RESOLUTION"
                : "TRADE_FINANCE_SSI_RESOLUTION",
            usage: "REFERENCE_ONLY",
            paymentExecutable: false,
            confirmationSupported: false,
            messageContext: {
                standardsRelease: request.standardsRelease,
                messageType: request.messageType,
                direction: request.direction,
                businessFunction: request.businessFunction,
                sequence: request.sequence ?? selected[0]?.sequence,
                settlementLeg: request.settlementLeg ?? selected[0]?.settlementLeg,
            },
            catalogue: {
                catalogueVersion: catalogue.catalogueVersion,
                sourceArtifactId: catalogue.sourceArtifactId,
                sourceArtifactHash: catalogue.sourceArtifactHash,
            },
            resolvedFields,
            boundary: "SSI only resolves settlement-related fields that can be determined from eligible SSI data. It does not own Trade Finance rules, full SWIFT message validation, or payment processing.",
        };
    }
    resolveField(request, mapping, catalogue) {
        const tag = mapping.tag ?? this.tagOf(mapping);
        const base = this.fieldBase(request, mapping, catalogue, tag);
        const outOfScope = this.outOfScopeField(mapping, base);
        if (outOfScope)
            return outOfScope;
        const directAccount = this.directAccountField(request, tag, base);
        if (directAccount)
            return directAccount;
        const routeComplete = this.routeCompleteField(request, tag, base);
        if (routeComplete)
            return routeComplete;
        const value = request.roles[mapping.canonicalRole]?.trim();
        const evidence = request.roleEvidence?.[mapping.canonicalRole];
        const evidenceValid = this.evidenceIsValid(request, evidence);
        if (!value || !evidenceValid)
            return this.noEligibleField(base, evidenceValid);
        return this.resolvedField(base, request, mapping, value, evidence);
    }
    fieldBase(request, mapping, catalogue, tag) {
        return {
            standardsRelease: request.standardsRelease,
            messageType: request.messageType,
            sequence: mapping.sequence,
            settlementLeg: mapping.settlementLeg ?? mapping.sequence ?? "MESSAGE",
            tag,
            option: mapping.option,
            officialFieldName: mapping.officialFieldName,
            officialRole: mapping.officialRole ?? mapping.canonicalRole,
            businessFunction: mapping.businessFunction,
            nvrRefs: mapping.nvrRefs ?? [],
            provenance: {
                catalogueVersion: catalogue.catalogueVersion,
                sourceArtifactId: catalogue.sourceArtifactId,
                sourceArtifactHash: catalogue.sourceArtifactHash,
                fieldProfileArtifactId: mapping.evidenceArtifactId,
                fieldProfileEvidencePages: mapping.evidencePages,
            },
        };
    }
    directAccountField(request, tag, base) {
        if (request.controls?.accountRelationship !== "DIRECT_ACCOUNT" || !["53", "54", "57"].includes(tag))
            return undefined;
        const evidenceId = request.controls.directRelationshipEvidenceId?.trim();
        if (!evidenceId)
            throw new common_1.BadRequestException({ code: "DIRECT_RELATIONSHIP_EVIDENCE_REQUIRED" });
        return this.notRequiredField(base, "DIRECT_ACCOUNT_RELATIONSHIP", {
            sourceRecordId: request.controls.directRelationshipEvidenceId,
            directRelationshipEvidenceId: request.controls.directRelationshipEvidenceId,
        });
    }
    routeCompleteField(request, tag, base) {
        if (tag !== "57" || !request.controls?.routeGraph?.routeComplete || request.controls.routeGraph.additionalAccountWithRequired)
            return undefined;
        return this.notRequiredField(base, "ROUTE_COMPLETE");
    }
    evidenceIsValid(request, evidence) {
        return request.controls?.routeGraph?.evidenceValid !== false &&
            evidence?.status !== "INACTIVE" &&
            evidence?.approvalStatus !== "REJECTED" &&
            (!evidence?.effectiveFrom || evidence.effectiveFrom <= request.valueDate) &&
            (!evidence?.effectiveTo || evidence.effectiveTo >= request.valueDate);
    }
    noEligibleField(base, evidenceValid) {
        return {
            ...base,
            scopeStatus: "SSI_SUPPORTED",
            resolutionStatus: "NO_ELIGIBLE_SSI",
            reasonCode: evidenceValid ? "MISSING_SSI" : "CONFLICTING_SSI",
            resolvedValue: null,
        };
    }
    resolvedField(base, request, mapping, value, evidence) {
        const ownerSide = evidence?.ownerSide;
        return {
            ...base,
            scopeStatus: "SSI_SUPPORTED",
            resolutionStatus: "RESOLVED",
            reasonCode: this.resolvedReasonCode(ownerSide),
            resolvedValue: value,
            provenance: {
                ...base.provenance,
                source: request.roleSources?.[mapping.canonicalRole] ?? evidence?.sourceType,
                sourceRecordId: evidence?.sourceRecordId ?? request.sourceSsiId,
                ownerSide,
                version: evidence?.version,
                canonicalRouteNodeId: evidence?.canonicalRouteNodeId,
            },
        };
    }
    resolvedReasonCode(ownerSide) {
        if (ownerSide === "SENDER_SIDE")
            return "RESOLVED_FROM_OWN_SSI";
        if (ownerSide === "RECEIVER_SIDE") {
            return "RESOLVED_FROM_COUNTERPARTY_SSI";
        }
        return "EXACT_ELIGIBLE_SSI";
    }
    outOfScopeField(mapping, base) {
        return mapping.scopeStatus === "OUT_OF_SSI_SCOPE"
            ? { ...base, scopeStatus: "OUT_OF_SSI_SCOPE", resolutionStatus: "N_A", reasonCode: this.outOfScopeReason(mapping), resolvedValue: null }
            : undefined;
    }
    notRequiredField(base, reasonCode, provenance = {}) {
        return { ...base, scopeStatus: "SSI_SUPPORTED", resolutionStatus: "NOT_REQUIRED", reasonCode, resolvedValue: null, provenance: { ...base.provenance, source: "ROUTE_RESOLVER", ownerSide: "CANONICAL_ROUTE", ...provenance } };
    }
    validateContext(request) {
        if (request.service !== "FIN" ||
            request.direction !== "OUTGOING" ||
            request.standardsRelease !== "SR2026" ||
            !request.businessFunction ||
            !request.transactionReference ||
            !request.currency ||
            !request.receiverBic ||
            !request.valueDate)
            throw new common_1.BadRequestException({ code: "REFERENCE_FIN_CONTEXT_REQUIRED" });
        (0, value_date_1.assertIsoValueDate)(request.valueDate);
        if (request.messageType.startsWith("MT2") || request.messageType.startsWith("pacs."))
            throw new common_1.BadRequestException({
                code: "NOT_SUPPORTED",
                messageType: request.messageType,
            });
        const expectedMode = this.expectedResolutionMode(request.messageType);
        if (!expectedMode)
            throw new common_1.BadRequestException({
                code: "NOT_SUPPORTED",
                messageType: request.messageType,
            });
        if (request.resolutionMode !== expectedMode)
            throw new common_1.BadRequestException({ code: "MESSAGE_MODE_MISMATCH" });
    }
    expectedResolutionMode(messageType) {
        if (messageType.startsWith("MT3"))
            return "TREASURY";
        if (/^MT[47]/.test(messageType))
            return "TRADE_FINANCE";
        return null;
    }
    isFin5x(mapping) {
        return /^5[3-8]$/.test(mapping.tag ?? this.tagOf(mapping));
    }
    isSsiResolutionSupported(mappings, messageType) {
        return mappings.some((mapping) => mapping.messageType === messageType &&
            mapping.direction === "OUTGOING" &&
            mapping.evidenceStatus === "FIELD_PROFILE_PROVEN" &&
            mapping.scopeStatus === "SSI_SUPPORTED" &&
            mapping.reusableCandidate === true &&
            this.isFin5x(mapping));
    }
    tagOf(mapping) {
        return mapping.path.match(/(5[3-8])[A-Z]?$/)?.[1] ?? "";
    }
    outOfScopeReason(mapping) {
        if (mapping.canonicalRole.includes("CONFIRMATION"))
            return "CONFIRMATION_PARTY";
        if (mapping.canonicalRole.includes("ADVISING") ||
            mapping.canonicalRole.includes("ADVISE_THROUGH"))
            return "TRADE_ROUTING_ROLE";
        return "TRANSACTION_CONTEXT_PROVIDED";
    }
};
exports.FinFieldResolutionService = FinFieldResolutionService;
exports.FinFieldResolutionService = FinFieldResolutionService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [mapping_catalogue_service_1.MappingCatalogueService,
        fin_field_resolution_policy_1.FinFieldResolutionPolicy])
], FinFieldResolutionService);
//# sourceMappingURL=fin-field-resolution.service.js.map