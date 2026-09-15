"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditRetentionController = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const audit_retention_service_1 = require("./audit-retention.service");
let AuditRetentionController = class AuditRetentionController {
    service;
    constructor(service) {
        this.service = service;
    }
    health() {
        return this.service.health();
    }
};
exports.AuditRetentionController = AuditRetentionController;
tslib_1.__decorate([
    (0, common_1.Get)("audit-retention"),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", Object)
], AuditRetentionController.prototype, "health", null);
exports.AuditRetentionController = AuditRetentionController = tslib_1.__decorate([
    (0, common_1.Controller)("health"),
    tslib_1.__metadata("design:paramtypes", [audit_retention_service_1.AuditRetentionService])
], AuditRetentionController);
//# sourceMappingURL=audit-retention.controller.js.map