"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RmaController = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const rma_application_service_1 = require("./rma-application.service");
const governed_lifecycle_controller_delegate_1 = require("../shared/governed-lifecycle-controller.delegate");
let RmaController = class RmaController {
    service;
    lifecycle;
    constructor(service) {
        this.service = service;
        this.lifecycle = new governed_lifecycle_controller_delegate_1.GovernedLifecycleControllerDelegate(service);
    }
    list() {
        return this.lifecycle.list();
    }
    check(body) {
        return this.service.check(body);
    }
    create(body) {
        return this.lifecycle.create(body);
    }
    update(id, body) {
        return this.lifecycle.update(id, body);
    }
    revise(id, body) {
        return this.lifecycle.revise(id, body.maker);
    }
    transition(id, action, body) {
        return this.lifecycle.transition(id, action, body.actor);
    }
    revoke(id, body) {
        return this.lifecycle.revoke(id, body.actor, body.reason);
    }
    audit() {
        return this.lifecycle.audit();
    }
};
exports.RmaController = RmaController;
tslib_1.__decorate([
    (0, common_1.Get)(),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", Object)
], RmaController.prototype, "list", null);
tslib_1.__decorate([
    (0, common_1.Post)("check"),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], RmaController.prototype, "check", null);
tslib_1.__decorate([
    (0, common_1.Post)(),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], RmaController.prototype, "create", null);
tslib_1.__decorate([
    (0, common_1.Put)(":id"),
    tslib_1.__param(0, (0, common_1.Param)("id")),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", Object)
], RmaController.prototype, "update", null);
tslib_1.__decorate([
    (0, common_1.Post)(":id/revise"),
    tslib_1.__param(0, (0, common_1.Param)("id")),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", Object)
], RmaController.prototype, "revise", null);
tslib_1.__decorate([
    (0, common_1.Post)(":id/:action"),
    tslib_1.__param(0, (0, common_1.Param)("id")),
    tslib_1.__param(1, (0, common_1.Param)("action")),
    tslib_1.__param(2, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String, Object]),
    tslib_1.__metadata("design:returntype", Object)
], RmaController.prototype, "transition", null);
tslib_1.__decorate([
    (0, common_1.Delete)(":id"),
    tslib_1.__param(0, (0, common_1.Param)("id")),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", Object)
], RmaController.prototype, "revoke", null);
tslib_1.__decorate([
    (0, common_1.Get)("audit/events"),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", Object)
], RmaController.prototype, "audit", null);
exports.RmaController = RmaController = tslib_1.__decorate([
    (0, common_1.Controller)("rma-authorisations"),
    tslib_1.__metadata("design:paramtypes", [rma_application_service_1.RmaApplicationService])
], RmaController);
//# sourceMappingURL=rma.controller.js.map