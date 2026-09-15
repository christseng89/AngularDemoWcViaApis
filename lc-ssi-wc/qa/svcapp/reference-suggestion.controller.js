"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReferenceSuggestionController = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const fin_field_resolution_service_1 = require("./fin-field-resolution.service");
let ReferenceSuggestionController = class ReferenceSuggestionController {
    service;
    constructor(service) {
        this.service = service;
    }
    suggest(body) {
        const resolution = this.service.resolve({
            ...body,
            resolutionMode: body.resolutionMode ?? (body.messageType.startsWith("MT3") ? "TREASURY" : "TRADE_FINANCE"),
        });
        const suggestions = resolution.resolvedFields
            .filter((field) => field["resolutionStatus"] === "RESOLVED")
            .map((field) => ({
            tag: field["tag"], sequence: field["sequence"], option: field["option"],
            canonicalRole: field["officialRole"], officialFieldName: field["officialFieldName"],
            value: field["resolvedValue"], suggestedValue: field["resolvedValue"],
            provenance: {
                ...field["provenance"],
                standardsRelease: body.standardsRelease,
                messageType: body.messageType,
                businessFunction: body.businessFunction,
                transactionReference: body.transactionReference,
                sourceSsiId: body.sourceSsiId,
            },
        }));
        return {
            ...resolution,
            deprecated: true,
            successor: "/reference/fin-tag-resolutions",
            preSettlement: true,
            reconciliationSupported: false,
            watermark: "NOT FOR PAYMENT RELEASE",
            suggestions,
            supportAnalysis: resolution.resolvedFields.map((field) => ({ ...field, suggestedValue: field["resolvedValue"] })),
            fields: Object.fromEntries(suggestions.map((field) => [String(field.tag), field.value])),
        };
    }
};
exports.ReferenceSuggestionController = ReferenceSuggestionController;
tslib_1.__decorate([
    (0, common_1.Post)("fin-tag-suggestions"),
    (0, common_1.Header)("Deprecation", "true"),
    (0, common_1.Header)("Link", "</reference/fin-tag-resolutions>; rel=successor-version"),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], ReferenceSuggestionController.prototype, "suggest", null);
exports.ReferenceSuggestionController = ReferenceSuggestionController = tslib_1.__decorate([
    (0, common_1.Controller)("reference"),
    tslib_1.__metadata("design:paramtypes", [fin_field_resolution_service_1.FinFieldResolutionService])
], ReferenceSuggestionController);
//# sourceMappingURL=reference-suggestion.controller.js.map