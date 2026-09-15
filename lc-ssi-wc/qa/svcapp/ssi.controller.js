"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SsiController = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const ssi_application_service_1 = require("./ssi-application.service");
let SsiController = class SsiController {
    service;
    constructor(service) {
        this.service = service;
    }
    list() { return this.service.list(); }
    applicability(ssiId) { return this.service.listApplicability(ssiId); }
    create(body) { return this.service.create(body); }
    update(id, body) { return this.service.update(id, body); }
    replaceApplicability(id, body) { return this.service.replaceApplicability(id, body); }
    revise(id, body) { return this.service.revise(id, body.maker); }
    revoke(id, body) { return this.service.revoke(id, body.actor, body.reason); }
    confirm(body) { return this.service.confirm(body); }
    clearingOptions(body) { return this.service.clearingOptions(body); }
    resolve(body) { return this.service.resolve(body); }
    submit(id, body) { return this.service.transition(id, 'SUBMIT', body.actor); }
    approve(id, body) { return this.service.transition(id, 'APPROVE', body.actor); }
    activate(id, body) { return this.service.transition(id, 'ACTIVATE', body.actor); }
    audit() { return this.service.audit(); }
};
exports.SsiController = SsiController;
tslib_1.__decorate([
    (0, common_1.Get)(),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", Object)
], SsiController.prototype, "list", null);
tslib_1.__decorate([
    (0, common_1.Get)('applicability'),
    tslib_1.__param(0, (0, common_1.Query)('ssiId')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", Object)
], SsiController.prototype, "applicability", null);
tslib_1.__decorate([
    (0, common_1.Post)(),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], SsiController.prototype, "create", null);
tslib_1.__decorate([
    (0, common_1.Put)(':id'),
    tslib_1.__param(0, (0, common_1.Param)('id')),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", Object)
], SsiController.prototype, "update", null);
tslib_1.__decorate([
    (0, common_1.Put)(':id/applicability'),
    tslib_1.__param(0, (0, common_1.Param)('id')),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", Object)
], SsiController.prototype, "replaceApplicability", null);
tslib_1.__decorate([
    (0, common_1.Post)(':id/revise'),
    tslib_1.__param(0, (0, common_1.Param)('id')),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", Object)
], SsiController.prototype, "revise", null);
tslib_1.__decorate([
    (0, common_1.Delete)(':id'),
    tslib_1.__param(0, (0, common_1.Param)('id')),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", Object)
], SsiController.prototype, "revoke", null);
tslib_1.__decorate([
    (0, common_1.Post)('resolve/confirm'),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], SsiController.prototype, "confirm", null);
tslib_1.__decorate([
    (0, common_1.Post)('resolve/clearing-options'),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], SsiController.prototype, "clearingOptions", null);
tslib_1.__decorate([
    (0, common_1.Post)('resolve'),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], SsiController.prototype, "resolve", null);
tslib_1.__decorate([
    (0, common_1.Post)(':id/submit'),
    tslib_1.__param(0, (0, common_1.Param)('id')),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", Object)
], SsiController.prototype, "submit", null);
tslib_1.__decorate([
    (0, common_1.Post)(':id/approve'),
    tslib_1.__param(0, (0, common_1.Param)('id')),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", Object)
], SsiController.prototype, "approve", null);
tslib_1.__decorate([
    (0, common_1.Post)(':id/activate'),
    tslib_1.__param(0, (0, common_1.Param)('id')),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", Object)
], SsiController.prototype, "activate", null);
tslib_1.__decorate([
    (0, common_1.Get)('audit/events'),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", Object)
], SsiController.prototype, "audit", null);
exports.SsiController = SsiController = tslib_1.__decorate([
    (0, common_1.Controller)('ssis'),
    tslib_1.__metadata("design:paramtypes", [ssi_application_service_1.SsiApplicationService])
], SsiController);
//# sourceMappingURL=ssi.controller.js.map