"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageDomainResolutionController = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const message_domain_resolution_service_1 = require("./message-domain-resolution.service");
let MessageDomainResolutionController = class MessageDomainResolutionController {
    service;
    constructor(service) {
        this.service = service;
    }
    response(result) {
        const status = result.mx["httpStatus"];
        if (typeof status === "number" && status >= 400)
            throw new common_1.HttpException(result, status);
        return result;
    }
    ownAccount(body) {
        return this.response(this.service.resolve("OWN_SSI_NOSTRO", body));
    }
    directDebit(body) {
        return this.response(this.service.resolve("FI_DIRECT_DEBIT", body));
    }
    notification(body) {
        return this.response(this.service.resolve("NOTIFICATION", body));
    }
};
exports.MessageDomainResolutionController = MessageDomainResolutionController;
tslib_1.__decorate([
    (0, common_1.Post)("own-account-settlements/resolve"),
    (0, common_1.HttpCode)(200),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], MessageDomainResolutionController.prototype, "ownAccount", null);
tslib_1.__decorate([
    (0, common_1.Post)("fi-direct-debits/resolve"),
    (0, common_1.HttpCode)(200),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], MessageDomainResolutionController.prototype, "directDebit", null);
tslib_1.__decorate([
    (0, common_1.Post)("payment-notifications/resolve"),
    (0, common_1.HttpCode)(200),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], MessageDomainResolutionController.prototype, "notification", null);
exports.MessageDomainResolutionController = MessageDomainResolutionController = tslib_1.__decorate([
    (0, common_1.Controller)(),
    tslib_1.__metadata("design:paramtypes", [message_domain_resolution_service_1.MessageDomainResolutionService])
], MessageDomainResolutionController);
//# sourceMappingURL=message-domain-resolution.controller.js.map