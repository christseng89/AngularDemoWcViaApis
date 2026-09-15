"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SampleController = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const sample_import_service_1 = require("./sample-import.service");
let SampleController = class SampleController {
    samples;
    constructor(samples) {
        this.samples = samples;
    }
    list() { return this.samples.list(); }
    load(path) { return this.samples.load(path); }
    importDirectory() { return this.samples.importDirectory(); }
};
exports.SampleController = SampleController;
tslib_1.__decorate([
    (0, common_1.Get)(),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", Object)
], SampleController.prototype, "list", null);
tslib_1.__decorate([
    (0, common_1.Get)('load'),
    tslib_1.__param(0, (0, common_1.Query)('path')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", Object)
], SampleController.prototype, "load", null);
tslib_1.__decorate([
    (0, common_1.Post)('import-directory'),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", Object)
], SampleController.prototype, "importDirectory", null);
exports.SampleController = SampleController = tslib_1.__decorate([
    (0, common_1.Controller)('messages/samples'),
    tslib_1.__metadata("design:paramtypes", [sample_import_service_1.SampleImportService])
], SampleController);
//# sourceMappingURL=sample.controller.js.map