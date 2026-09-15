"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinFieldResolutionPolicy = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const routeRuns = (entries) => entries.reduce((runs, entry) => {
    const run = runs.at(-1);
    const sameNode = run &&
        run[0].field.provenance["canonicalRouteNodeId"] === entry.field.provenance["canonicalRouteNodeId"] &&
        run[0].field.provenance["ownerSide"] === entry.field.provenance["ownerSide"];
    if (sameNode)
        run.push(entry);
    else
        runs.push([entry]);
    return runs;
}, []);
let FinFieldResolutionPolicy = class FinFieldResolutionPolicy {
    normalizeCanonicalRoute(request, mappings, fields) {
        const routeEntries = fields
            .map((field, index) => ({ field, mapping: mappings[index], index }))
            .filter(({ field }) => field.scopeStatus === "SSI_SUPPORTED" &&
            field.resolutionStatus === "RESOLVED")
            .sort((left, right) => Number(left.field.tag) - Number(right.field.tag));
        const normalized = [...fields];
        for (const run of routeRuns(routeEntries)) {
            const first = run[0];
            const nodeId = first.field.provenance["canonicalRouteNodeId"];
            if (typeof nodeId === "string" && nodeId.trim() && run.length > 1) {
                const keep = this.routeNodeKeeper(request.messageType, run);
                for (const entry of run) {
                    if (entry === keep || entry.mapping.presence === "MANDATORY")
                        continue;
                    normalized[entry.index] = {
                        ...entry.field,
                        resolutionStatus: "NOT_REQUIRED",
                        reasonCode: "ROUTE_COMPLETE",
                        resolvedValue: null,
                        provenance: {
                            ...entry.field.provenance,
                            candidateSource: entry.field.provenance["source"],
                            candidateOwnerSide: entry.field.provenance["ownerSide"],
                            source: "ROUTE_RESOLVER",
                            ownerSide: "CANONICAL_ROUTE",
                            normalizedCanonicalRoute: true,
                            retainedRole: keep.mapping.canonicalRole,
                            retainedTag: keep.field.tag,
                        },
                    };
                }
            }
        }
        return normalized;
    }
    profileExcludedFields(request, messageProfile, selected, catalogue) {
        const selectedTags = new Set(selected.map((mapping) => this.tagOf(mapping)));
        const excludedByTag = new Map();
        for (const mapping of messageProfile) {
            const tag = this.tagOf(mapping);
            const requestedOption = request.fieldOptions?.[tag] ?? "A";
            if (selectedTags.has(tag) ||
                mapping.option !== requestedOption ||
                mapping.scopeStatus !== "SSI_SUPPORTED" ||
                excludedByTag.has(tag))
                continue;
            excludedByTag.set(tag, mapping);
        }
        return [...excludedByTag.values()].map((mapping) => ({
            standardsRelease: request.standardsRelease,
            messageType: request.messageType,
            sequence: request.sequence ?? selected[0]?.sequence ?? "MESSAGE",
            settlementLeg: request.settlementLeg ?? selected[0]?.settlementLeg ?? "MESSAGE",
            tag: this.tagOf(mapping),
            option: mapping.option,
            officialFieldName: mapping.officialFieldName ?? "Official field name pending verification",
            officialRole: mapping.officialRole ?? mapping.canonicalRole,
            businessFunction: mapping.businessFunction,
            scopeStatus: "OUT_OF_SSI_SCOPE",
            resolutionStatus: "N_A",
            reasonCode: "MESSAGE_PROFILE_EXCLUDED",
            resolvedValue: null,
            nvrRefs: [],
            provenance: {
                catalogueVersion: catalogue.catalogueVersion,
                sourceArtifactId: catalogue.sourceArtifactId,
                sourceArtifactHash: catalogue.sourceArtifactHash,
                source: "MESSAGE_PROFILE",
                ownerSide: "CANONICAL_ROUTE",
                sourceRecordId: mapping.evidenceArtifactId,
                candidateProfileSequence: mapping.sequence,
                candidateProfileSettlementLeg: mapping.settlementLeg,
            },
        }));
    }
    routeNodeKeeper(messageType, run) {
        const mandatory = run.filter(({ mapping }) => mapping.presence === "MANDATORY");
        if (mandatory.length === 1)
            return mandatory[0];
        if (messageType === "MT400") {
            const receiverCorrespondent = run.find(({ mapping }) => mapping.canonicalRole === "RECEIVERS_CORRESPONDENT");
            if (receiverCorrespondent)
                return receiverCorrespondent;
        }
        const endpoint = run.find(({ mapping }) => ["RECEIVING_AGENT", "ACCOUNT_WITH_INSTITUTION"].includes(mapping.canonicalRole));
        if (endpoint)
            return endpoint;
        const source = run.find(({ mapping }) => [
            "DELIVERY_AGENT",
            "SENDERS_CORRESPONDENT",
            "RECEIVERS_CORRESPONDENT",
        ].includes(mapping.canonicalRole));
        return source ?? run[0];
    }
    tagOf(mapping) {
        return mapping.path.match(/(5[3-8])[A-Z]?$/)[1];
    }
};
exports.FinFieldResolutionPolicy = FinFieldResolutionPolicy;
exports.FinFieldResolutionPolicy = FinFieldResolutionPolicy = tslib_1.__decorate([
    (0, common_1.Injectable)()
], FinFieldResolutionPolicy);
//# sourceMappingURL=fin-field-resolution.policy.js.map