"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwiftDataImportController = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const swift_data_import_service_1 = require("./swift-data-import.service");
let SwiftDataImportController = class SwiftDataImportController {
    service;
    constructor(service) {
        this.service = service;
    }
    upload(body) { return this.service.import(body); }
};
exports.SwiftDataImportController = SwiftDataImportController;
tslib_1.__decorate([
    (0, common_1.Post)(),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], SwiftDataImportController.prototype, "upload", null);
exports.SwiftDataImportController = SwiftDataImportController = tslib_1.__decorate([
    (0, common_1.Controller)('swift-data/imports'),
    tslib_1.__metadata("design:paramtypes", [swift_data_import_service_1.SwiftDataImportService])
], SwiftDataImportController);
//# sourceMappingURL=swift-data-import.controller.js.map