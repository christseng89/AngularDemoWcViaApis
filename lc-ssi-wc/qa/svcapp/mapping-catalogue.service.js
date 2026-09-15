"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MappingCatalogueService = exports.MAPPING_CATALOGUE_REGISTRY = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const canonical_json_1 = require("./canonical-json");
exports.MAPPING_CATALOGUE_REGISTRY = Symbol("MAPPING_CATALOGUE_REGISTRY");
const defaultRegistry = () => ({
    SR2026: {
        path: (0, node_path_1.join)(process.cwd(), "parameters", "ssi-mappings.sr2026.json"),
        sourceArtifactId: "parameters/ssi-mappings.sr2026.json",
    },
});
const freezeMapping = (mapping) => Object.freeze({ ...mapping });
const hasText = (value) => typeof value === "string" && Boolean(value.trim());
const isString = (value) => typeof value === "string";
const isOptionalString = (value) => value === undefined || typeof value === "string";
const isOptionalOneOf = (value, allowed) => value === undefined || allowed.includes(String(value));
const isOptionalStringArray = (value) => value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
const hasProvenFieldProfile = (mapping) => mapping["evidenceStatus"] !== "FIELD_PROFILE_PROVEN" ||
    (typeof mapping["sequence"] === "string" &&
        typeof mapping["option"] === "string" &&
        hasText(mapping["officialFieldName"]));
const hasValidEvidencePages = (value) => value === undefined ||
    (Array.isArray(value) &&
        value.every((page) => Number.isInteger(page) && Number(page) > 0));
const isMapping = (item, release) => {
    if (!item || typeof item !== "object")
        return false;
    const mapping = item;
    return (mapping["standardsRelease"] === release &&
        isString(mapping["messageType"]) &&
        isOptionalString(mapping["businessService"]) &&
        ["INCOMING", "OUTGOING"].includes(String(mapping["direction"])) &&
        isString(mapping["businessFunction"]) &&
        isString(mapping["path"]) &&
        isString(mapping["canonicalRole"]) &&
        isOptionalString(mapping["officialFieldName"]) &&
        isOptionalString(mapping["settlementLeg"]) &&
        isOptionalOneOf(mapping["scopeStatus"], ["SSI_SUPPORTED", "OUT_OF_SSI_SCOPE"]) &&
        isOptionalStringArray(mapping["nvrRefs"]) &&
        hasProvenFieldProfile(mapping) &&
        typeof mapping["reusableCandidate"] === "boolean" &&
        isOptionalOneOf(mapping["evidenceStatus"], ["FIELD_PROFILE_PROVEN", "PENDING_EVIDENCE"]) &&
        (mapping["suggestionEnabled"] === undefined || typeof mapping["suggestionEnabled"] === "boolean") &&
        isOptionalString(mapping["evidenceArtifactId"]) &&
        isOptionalOneOf(mapping["selectionPolicy"], [
            "PREFERRED_WHEN_BIC_IDENTIFIED",
            "EXCEPTION_REQUIRES_REASON",
        ]) &&
        hasValidEvidencePages(mapping["evidencePages"]));
};
let MappingCatalogueService = class MappingCatalogueService {
    loaded = new Map();
    constructor(registry) {
        for (const [release, source] of Object.entries(registry ?? defaultRegistry()))
            this.loaded.set(release, this.load(release, source));
    }
    get(standardsRelease) {
        const catalogue = this.loaded.get(standardsRelease);
        if (!catalogue)
            throw new common_1.BadRequestException({
                code: "UNSUPPORTED_STANDARDS_RELEASE",
                standardsRelease,
            });
        return catalogue;
    }
    load(release, source) {
        let parsed;
        try {
            parsed = JSON.parse((0, node_fs_1.readFileSync)(source.path, "utf8"));
        }
        catch {
            throw new common_1.BadRequestException({
                code: "MAPPING_CATALOGUE_LOAD_FAILED",
                release,
            });
        }
        if (!this.isCatalogue(parsed, release))
            throw new common_1.BadRequestException({
                code: "MAPPING_CATALOGUE_INVALID",
                release,
            });
        const mappings = Object.freeze(parsed.mappings.map(freezeMapping));
        return Object.freeze({
            standardsRelease: release,
            catalogueVersion: parsed.catalogueVersion,
            sourceArtifactId: source.sourceArtifactId,
            sourceArtifactHash: (0, canonical_json_1.hashCanonical)(parsed),
            mappings,
        });
    }
    isCatalogue(value, release) {
        if (!value || typeof value !== "object")
            return false;
        const candidate = value;
        if (!String(candidate["catalogueVersion"] ?? "").trim())
            return false;
        if (!Array.isArray(candidate["mappings"]) || !candidate["mappings"].length)
            return false;
        return candidate["mappings"].every((item) => isMapping(item, release));
    }
};
exports.MappingCatalogueService = MappingCatalogueService;
exports.MappingCatalogueService = MappingCatalogueService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__param(0, (0, common_1.Optional)()),
    tslib_1.__param(0, (0, common_1.Inject)(exports.MAPPING_CATALOGUE_REGISTRY)),
    tslib_1.__metadata("design:paramtypes", [Object])
], MappingCatalogueService);
//# sourceMappingURL=mapping-catalogue.service.js.map