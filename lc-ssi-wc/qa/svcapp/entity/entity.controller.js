"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityController = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const entity_application_service_1 = require("./entity-application.service");
let EntityController = class EntityController {
    service;
    constructor(service) {
        this.service = service;
    }
    list() {
        return this.service.list();
    }
    create(body) {
        return this.service.create(body);
    }
    update(id, body) {
        return this.service.update(id, body);
    }
    revise(id, body) {
        return this.service.revise(id, body.maker);
    }
    transition(id, action, body) {
        if (!["submit", "approve", "activate"].includes(action)) {
            throw new common_1.BadRequestException("INVALID_ACTION");
        }
        return this.service.transition(id, action.toUpperCase(), body.actor);
    }
    revoke(id, body) {
        return this.service.revoke(id, body.actor, body.reason);
    }
    audit() {
        return this.service.audit();
    }
};
exports.EntityController = EntityController;
tslib_1.__decorate([
    (0, common_1.Get)(),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", void 0)
], EntityController.prototype, "list", null);
tslib_1.__decorate([
    (0, common_1.Post)(),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", void 0)
], EntityController.prototype, "create", null);
tslib_1.__decorate([
    (0, common_1.Put)(":id"),
    tslib_1.__param(0, (0, common_1.Param)("id")),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", void 0)
], EntityController.prototype, "update", null);
tslib_1.__decorate([
    (0, common_1.Post)(":id/revise"),
    tslib_1.__param(0, (0, common_1.Param)("id")),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", void 0)
], EntityController.prototype, "revise", null);
tslib_1.__decorate([
    (0, common_1.Post)(":id/:action"),
    tslib_1.__param(0, (0, common_1.Param)("id")),
    tslib_1.__param(1, (0, common_1.Param)("action")),
    tslib_1.__param(2, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String, Object]),
    tslib_1.__metadata("design:returntype", void 0)
], EntityController.prototype, "transition", null);
tslib_1.__decorate([
    (0, common_1.Delete)(":id"),
    tslib_1.__param(0, (0, common_1.Param)("id")),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, Object]),
    tslib_1.__metadata("design:returntype", void 0)
], EntityController.prototype, "revoke", null);
tslib_1.__decorate([
    (0, common_1.Get)("audit/events"),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", void 0)
], EntityController.prototype, "audit", null);
exports.EntityController = EntityController = tslib_1.__decorate([
    (0, common_1.Controller)("booking-branch-entities"),
    tslib_1.__metadata("design:paramtypes", [entity_application_service_1.EntityApplicationService])
], EntityController);
//# sourceMappingURL=entity.controller.js.map