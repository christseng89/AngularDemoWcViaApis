"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeSettingsController = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const database_snapshot_identity_service_1 = require("./database-snapshot-identity.service");
const development_data_reload_service_1 = require("./development-data-reload.service");
let RuntimeSettingsController = class RuntimeSettingsController {
    reloadService;
    snapshotIdentity;
    constructor(reloadService, snapshotIdentity) {
        this.reloadService = reloadService;
        this.snapshotIdentity = snapshotIdentity;
    }
    runtime() {
        return {
            ...this.reloadService.status(),
            currentSnapshot: this.snapshotIdentity.current(),
        };
    }
    reload(body) {
        return this.reloadService.reload(typeof body?.password === "string" ? body.password : "");
    }
};
exports.RuntimeSettingsController = RuntimeSettingsController;
tslib_1.__decorate([
    (0, common_1.Get)("runtime"),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", Object)
], RuntimeSettingsController.prototype, "runtime", null);
tslib_1.__decorate([
    (0, common_1.Post)("development-data/reload"),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], RuntimeSettingsController.prototype, "reload", null);
exports.RuntimeSettingsController = RuntimeSettingsController = tslib_1.__decorate([
    (0, common_1.Controller)("settings"),
    tslib_1.__metadata("design:paramtypes", [development_data_reload_service_1.DevelopmentDataReloadService,
        database_snapshot_identity_service_1.DatabaseSnapshotIdentityService])
], RuntimeSettingsController);
//# sourceMappingURL=runtime-settings.controller.js.map