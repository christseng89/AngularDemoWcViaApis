"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinFieldResolutionController = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const fin_field_resolution_service_1 = require("./fin-field-resolution.service");
let FinFieldResolutionController = class FinFieldResolutionController {
    service;
    constructor(service) {
        this.service = service;
    }
    catalogue(standardsRelease = "SR2026") {
        return this.service.catalogueIndex(standardsRelease);
    }
    resolve(body) {
        return this.service.resolve(body);
    }
};
exports.FinFieldResolutionController = FinFieldResolutionController;
tslib_1.__decorate([
    (0, common_1.Get)("fin-resolution-catalogue"),
    tslib_1.__param(0, (0, common_1.Query)("standardsRelease")),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], FinFieldResolutionController.prototype, "catalogue", null);
tslib_1.__decorate([
    (0, common_1.Post)("fin-tag-resolutions"),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], FinFieldResolutionController.prototype, "resolve", null);
exports.FinFieldResolutionController = FinFieldResolutionController = tslib_1.__decorate([
    (0, common_1.Controller)("reference"),
    tslib_1.__metadata("design:paramtypes", [fin_field_resolution_service_1.FinFieldResolutionService])
], FinFieldResolutionController);
//# sourceMappingURL=fin-field-resolution.controller.js.map