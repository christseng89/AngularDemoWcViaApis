"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NostroController = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const nostro_application_service_1 = require("./nostro-application.service");
const governed_lifecycle_controller_delegate_1 = require("../shared/governed-lifecycle-controller.delegate");
let NostroController = class NostroController {
    service;
    lifecycle;
    constructor(service) {
        this.service = service;
        this.lifecycle = new governed_lifecycle_controller_delegate_1.GovernedLifecycleControllerDelegate(service);
    }
    list() {
        return this.lifecycle.list();
    }
    resolve(body) {
        return this.service.resolve(body);
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
exports.NostroController = NostroController;
tslib_1.__decorate([
    (0, common_1.Get)(),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", Object)
], NostroController.prototype, "list", null);
tslib_1.__decorate([
    (0, common_1.Post)("resolve"),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], NostroController.prototype, "resolve", null);
tslib_1.__decorate([
    (0, common_1.Post)(),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], NostroController.prototype, "create", null);
tslib_1.__decorate([
    (0, common_1.Put)(":id"),
    tslib_1.__param(0, (0, common_1.Param)("id")),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", Object)
], NostroController.prototype, "update", null);
tslib_1.__decorate([
    (0, common_1.Post)(":id/revise"),
    tslib_1.__param(0, (0, common_1.Param)("id")),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", Object)
], NostroController.prototype, "revise", null);
tslib_1.__decorate([
    (0, common_1.Post)(":id/:action"),
    tslib_1.__param(0, (0, common_1.Param)("id")),
    tslib_1.__param(1, (0, common_1.Param)("action")),
    tslib_1.__param(2, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String, Object]),
    tslib_1.__metadata("design:returntype", Object)
], NostroController.prototype, "transition", null);
tslib_1.__decorate([
    (0, common_1.Delete)(":id"),
    tslib_1.__param(0, (0, common_1.Param)("id")),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", Object)
], NostroController.prototype, "revoke", null);
tslib_1.__decorate([
    (0, common_1.Get)("audit/events"),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", Object)
], NostroController.prototype, "audit", null);
exports.NostroController = NostroController = tslib_1.__decorate([
    (0, common_1.Controller)("nostro-accounts"),
    tslib_1.__metadata("design:paramtypes", [nostro_application_service_1.NostroApplicationService])
], NostroController);
//# sourceMappingURL=nostro.controller.js.map